// Term-pair feedback to the author (spec Amendment G), kept in Cloudflare D1 (binding FEEDBACK, database
// vitrans-feedback, schema migrations/0001_feedback.sql):
// - POST /api/v1/feedback items: [{en, vi_used, vi_user, pack, kind: "new" | "fixed"}], at most MAX_FEEDBACK_ITEMS;
//   en <= MAX_EN and each Vietnamese <= MAX_VI characters (a term, not a sentence), pack = a pack id of the service's
//   bundle; no other field (no sentence, no document text, no file name). Text is normalised: NFC, single spaces.
// - One row per (en, vi_user, pack, kind) ignoring case and spacing: count, first_day / last_day (UTC) and the
//   author's review status (new | approved | rejected, set on the admin page).
// - Rate limit: rows per client per UTC day under the session's keyed IP hash (never the IP), checked and counted in
//   one statement, so concurrent requests cannot pass it together; counts older than yesterday are removed.
// Nothing here logs a value.
import { ApiError } from "./http.js";

export const MAX_FEEDBACK_ITEMS = 50;
export const MAX_EN = 80;
export const MAX_VI = 120;
export const KINDS = ["new", "fixed"];
export const STATUSES = ["new", "approved", "rejected"];
export const DECISIONS = ["approved", "rejected"];
export const MAX_ROWS_LISTED = 2000;
const FIELDS = ["en", "vi_used", "vi_user", "pack", "kind"];
const CONTROL_RE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/; // control characters other than white space
const DAY_MS = 86400000;

const badRequest = (message) => new ApiError(400, "bad_request", message);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function cpLen(text) {
  let n = 0;
  for (const ch of text) n += ch ? 1 : 0;
  return n;
}

const clean = (text) => text.normalize("NFC").replace(/\s+/g, " ").trim();

function term(item, name, max) {
  const v = item[name];
  if (typeof v !== "string" || CONTROL_RE.test(v)) throw badRequest("Each item's " + name + " must be text.");
  const t = clean(v);
  if (!t || cpLen(t) > max) {
    throw badRequest("Each item's " + name + " must be 1 to " + max + " characters (a term, not a sentence).");
  }
  return t;
}

/** The request's items checked and normalised: [{en, vi_used, vi_user, pack, kind}]; 400 for anything else. */
export function checkFeedbackItems(list, packIds) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_FEEDBACK_ITEMS) {
    throw badRequest("items must hold 1 to " + MAX_FEEDBACK_ITEMS + " term pairs.");
  }
  return list.map((it) => {
    if (!isObject(it) || !Object.keys(it).every((k) => FIELDS.includes(k))) {
      throw badRequest("Each item must be {en, vi_used, vi_user, pack, kind}.");
    }
    const en = term(it, "en", MAX_EN);
    const viUsed = term(it, "vi_used", MAX_VI);
    const viUser = term(it, "vi_user", MAX_VI);
    if (typeof it.pack !== "string" || !packIds.includes(it.pack)) {
      throw badRequest("Each item's pack must be a glossary pack of the service.");
    }
    if (!KINDS.includes(it.kind)) throw badRequest("Each item's kind must be new or fixed.");
    return { en, vi_used: viUsed, vi_user: viUser, pack: it.pack, kind: it.kind };
  });
}

async function sha256Hex(text) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A row's key: sha256 hex of the normalised (en, vi_user) in lower case, pack and kind. */
export function feedbackKey(item) {
  return sha256Hex(JSON.stringify([clean(item.en).toLowerCase(), clean(item.vi_user).toLowerCase(), item.pack,
    item.kind]));
}

const RATE_SQL = "INSERT INTO feedback_rate (day, iph, n) VALUES (?1, ?2, ?3) " +
  "ON CONFLICT (day, iph) DO UPDATE SET n = feedback_rate.n + excluded.n WHERE feedback_rate.n + excluded.n <= ?4";
const UPSERT_SQL = "INSERT INTO feedback (key, en, vi_used, vi_user, pack, kind, count, first_day, last_day, status) " +
  "VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7, 'new') ON CONFLICT (key) DO UPDATE SET count = feedback.count + 1, " +
  "first_day = MIN(feedback.first_day, excluded.first_day), last_day = MAX(feedback.last_day, excluded.last_day), " +
  "vi_used = excluded.vi_used";
const PRUNE_SQL = "DELETE FROM feedback_rate WHERE day < ?1";
const LIST_SQL = "SELECT key, en, vi_used, vi_user, pack, kind, count, first_day, last_day, status FROM feedback " +
  "WHERE ?1 = 'all' OR status = ?1 ORDER BY count DESC, last_day DESC, en LIMIT ?2";
const DECIDE_SQL = "UPDATE feedback SET status = ?2 WHERE key = ?1";

const quotaExceeded = () => new ApiError(429, "quota_exceeded", "The daily limit of term pairs sent from this " +
  "connection is reached; try again after 00:00 UTC.");

/** Store checked items sent on `day` (UTC) by the client `iph`: the distinct rows (a pair repeated in one request
 * counts once) after the client's count for the day (at most `limit` rows) took them -- 429 quota_exceeded, nothing
 * stored, when it cannot. Returns the number of rows stored. */
export async function storeFeedback(db, items, { day, iph, limit }) {
  const rows = new Map();
  for (const it of items) {
    const key = await feedbackKey(it);
    if (!rows.has(key)) rows.set(key, it);
  }
  if (rows.size > limit) throw quotaExceeded();
  const counted = await db.prepare(RATE_SQL).bind(day, iph, rows.size, limit).run();
  if (!counted.meta || counted.meta.changes !== 1) throw quotaExceeded();
  const yesterday = new Date(Date.parse(day + "T00:00:00Z") - DAY_MS).toISOString().slice(0, 10);
  const statements = [...rows].map(([key, it]) => db.prepare(UPSERT_SQL).bind(key, it.en, it.vi_used, it.vi_user,
    it.pack, it.kind, day));
  statements.push(db.prepare(PRUNE_SQL).bind(yesterday));
  await db.batch(statements);
  return rows.size;
}

/** The rows with this status ("all" for every row), most frequent first (then the latest, then by term). */
export async function listFeedback(db, status = "all", limit = MAX_ROWS_LISTED) {
  const r = await db.prepare(LIST_SQL).bind(status, limit).all();
  return r.results || [];
}

/** The author's decision on a row: true when the key is a row's. */
export async function decideFeedback(db, key, decision) {
  const r = await db.prepare(DECIDE_SQL).bind(key, decision).run();
  return Boolean(r.meta && r.meta.changes > 0);
}
