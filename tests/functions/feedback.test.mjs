// POST /api/v1/feedback (spec Amendment G): after the term review the page may send term pairs to the author --
// {en, vi_used, vi_user, pack, kind: new | fixed}, at most 50, en <= 80 and vi <= 120 characters (no sentence, no
// document text, no file name). D1 keeps one row per (en, vi_user, pack, kind) ignoring case and spacing, with a
// count, the first and last UTC day and a review status (new | approved | rejected); a per-day count per hashed IP
// (the session's keyed hash, never the IP) limits the rows one client may send. Synthetic text only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackApi, sessionApi } from "../../functions/_lib/api.js";
import { checkFeedbackItems, storeFeedback, listFeedback, decideFeedback, feedbackKey, MAX_FEEDBACK_ITEMS }
  from "../../functions/_lib/feedback.js";
import { ApiError } from "../../functions/_lib/http.js";
import { verifySession } from "../../functions/_lib/session.js";
import { makeEnv, makeCtx, readJson, fakeSiteverify, TEST_PASS, syntheticBundle, withConsoleSpy, FakeD1,
  TEST_SESSION_SECRET } from "./helpers.mjs";

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const DAY_MS = 86400000;
const PACKS = ["alpha", "alpha-kid"];
const IPH = "I".repeat(22);
const ROW = { en: "hepatocellular carcinoma", vi_used: "ung thư biểu mô tế bào gan", vi_user: "carcinom tế bào gan",
  pack: "alpha", kind: "new" };
const FIXED = { en: "tumour", vi_used: "khối u", vi_user: "u", pack: "alpha", kind: "fixed" };
const KID = { en: "core needle", vi_used: "kim lõi", vi_user: "kim sinh thiết lõi", pack: "alpha-kid", kind: "new" };

function code(fn) {
  try {
    fn();
    return "ok";
  } catch (e) {
    assert.ok(e instanceof ApiError, String(e && e.stack));
    return e.status + " " + e.code;
  }
}

async function asyncCode(fn) {
  try {
    await fn();
    return "ok";
  } catch (e) {
    assert.ok(e instanceof ApiError, String(e && e.stack));
    return e.status + " " + e.code;
  }
}

// ------------------------------------------------------------------ the items

test("feedback items: term pairs only -- en <= 80, vi <= 120 characters, a known pack, kind new | fixed, at most 50", () => {
  assert.equal(MAX_FEEDBACK_ITEMS, 50);
  assert.deepEqual(checkFeedbackItems([ROW, FIXED], PACKS), [ROW, FIXED]);
  // white space and Unicode forms are normalised (NFC, single spaces, trimmed)
  const messy = { ...ROW, en: "  hepatocellular \t carcinoma ", vi_user: "carcinom tế bào gan" };
  assert.deepEqual(checkFeedbackItems([messy], PACKS), [{ ...ROW, vi_user: "carcinom tế bào gan" }]);
  assert.equal(code(() => checkFeedbackItems(Array(50).fill(ROW), PACKS)), "ok");
  const sentence = "The biopsy showed a hepatocellular carcinoma with focal necrosis and clear margins in every section.";
  const bad = [
    undefined, "items", [], Array(51).fill(ROW), [5], [null],
    [{ ...ROW, en: sentence }], // a sentence is longer than a term
    [{ ...ROW, en: "e".repeat(81) }], [{ ...ROW, vi_user: "v".repeat(121) }], [{ ...ROW, vi_used: "v".repeat(121) }],
    [{ ...ROW, en: " " }], [{ ...ROW, vi_user: "" }], [{ ...ROW, vi_used: "" }], [{ ...ROW, en: 5 }],
    [{ ...ROW, vi_user: "nul\u0000" }], [{ ...ROW, en: "bell\u0007" }],
    [{ ...ROW, pack: "zzz" }], [{ ...ROW, pack: "" }], [{ ...ROW, pack: "_style" }], [{ ...ROW, kind: "other" }],
    [{ ...ROW, kind: undefined }], [{ ...ROW, sentence }], [{ ...ROW, file: "report.docx" }],
  ];
  for (const items of bad) {
    assert.equal(code(() => checkFeedbackItems(items, PACKS)), "400 bad_request", String(JSON.stringify(items)).slice(0, 90));
  }
  assert.equal(code(() => checkFeedbackItems([{ ...ROW, en: "e".repeat(80), vi_user: "ă".repeat(120) }], PACKS)), "ok");
});

test("a row's key: sha256 of (en, vi_user, pack, kind) ignoring case; vi_used is not part of it", async () => {
  const k = await feedbackKey(ROW);
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.equal(await feedbackKey({ ...ROW, en: "Hepatocellular Carcinoma", vi_user: "Carcinom tế bào gan",
    vi_used: "other" }), k);
  for (const other of [{ ...ROW, en: "carcinoma" }, { ...ROW, vi_user: "ung thư tế bào gan" }, { ...ROW, pack: "alpha-kid" },
    { ...ROW, kind: "fixed" }]) {
    assert.notEqual(await feedbackKey(other), k);
  }
});

// ------------------------------------------------------------------ D1 storage

test("storage: one row per pair with count, first and last day; repeats in a request count once; status starts new", async () => {
  const db = new FakeD1();
  assert.equal(await storeFeedback(db, [ROW, FIXED, KID], { day: "2026-10-14", iph: IPH, limit: 500 }), 3);
  const again = { ...ROW, en: "Hepatocellular  Carcinoma", vi_used: "ung thư tế bào gan", vi_user: "Carcinom tế bào gan" };
  assert.equal(await storeFeedback(db, [again, again], { day: "2026-10-15", iph: IPH, limit: 500 }), 1);
  const rows = await listFeedback(db, "all");
  assert.deepEqual(rows.map((r) => [r.en, r.count, r.first_day, r.last_day, r.status]), [
    ["hepatocellular carcinoma", 2, "2026-10-14", "2026-10-15", "new"],
    ["core needle", 1, "2026-10-14", "2026-10-14", "new"],
    ["tumour", 1, "2026-10-14", "2026-10-14", "new"],
  ]);
  assert.equal(rows[0].vi_used, "ung thư tế bào gan", "the latest Vietnamese the translation used");
  assert.equal(rows[0].vi_user, "carcinom tế bào gan", "the first spelling of the proposal");
  assert.deepEqual(Object.keys(rows[0]).sort(), ["count", "en", "first_day", "key", "kind", "last_day", "pack", "status",
    "vi_used", "vi_user"]);
  assert.equal(rows[0].key, await feedbackKey(ROW));
});

test("review: list by status, most frequent first; approve or reject by key; an unknown key changes nothing", async () => {
  const db = new FakeD1();
  await storeFeedback(db, [ROW, FIXED, KID], { day: "2026-10-14", iph: IPH, limit: 500 });
  await storeFeedback(db, [KID], { day: "2026-10-14", iph: "J".repeat(22), limit: 500 });
  const kidKey = await feedbackKey(KID);
  assert.equal(await decideFeedback(db, kidKey, "approved"), true);
  assert.equal(await decideFeedback(db, await feedbackKey(FIXED), "rejected"), true);
  assert.equal(await decideFeedback(db, "0".repeat(64), "approved"), false);
  assert.deepEqual((await listFeedback(db, "approved")).map((r) => [r.en, r.count]), [["core needle", 2]]);
  assert.deepEqual((await listFeedback(db, "rejected")).map((r) => r.en), ["tumour"]);
  assert.deepEqual((await listFeedback(db, "new")).map((r) => r.en), ["hepatocellular carcinoma"]);
  assert.deepEqual((await listFeedback(db, "all")).map((r) => r.en), ["core needle", "hepatocellular carcinoma", "tumour"]);
  // a decided row keeps its status when the pair is sent again
  await storeFeedback(db, [KID], { day: "2026-10-15", iph: IPH, limit: 500 });
  assert.deepEqual((await listFeedback(db, "approved")).map((r) => [r.count, r.status]), [[3, "approved"]]);
  assert.equal(await decideFeedback(db, kidKey, "rejected"), true, "a decision can be changed");
  assert.equal((await listFeedback(db, "rejected")).length, 2);
});

test("rate limit: rows per hashed IP per UTC day; over it -> 429 quota_exceeded and nothing stored; old counts go", async () => {
  const db = new FakeD1();
  db.db.prepare("INSERT INTO feedback_rate (day, iph, n) VALUES (?, ?, ?)").run("2026-10-12", IPH, 7);
  db.db.prepare("INSERT INTO feedback_rate (day, iph, n) VALUES (?, ?, ?)").run("2026-10-13", IPH, 7);
  const opts = { day: "2026-10-14", iph: IPH, limit: 5 };
  assert.equal(await storeFeedback(db, [ROW, FIXED, KID], opts), 3);
  const more = [{ ...ROW, vi_user: "a" }, { ...ROW, vi_user: "b" }, { ...ROW, vi_user: "c" }];
  assert.equal(await asyncCode(() => storeFeedback(db, more, opts)), "429 quota_exceeded");
  assert.equal((await listFeedback(db, "all")).length, 3, "nothing of the refused request is stored");
  assert.equal(await storeFeedback(db, more.slice(0, 2), opts), 2, "up to the limit");
  assert.equal(await storeFeedback(db, more, { ...opts, iph: "J".repeat(22) }), 3, "another client is not affected");
  assert.equal(await storeFeedback(db, more, { ...opts, day: "2026-10-15" }), 3, "a new day");
  const rate = db.dump().feedback_rate.map((r) => [r.day, r.iph, r.n]);
  assert.deepEqual(rate.sort(), [["2026-10-14", IPH, 5], ["2026-10-14", "J".repeat(22), 3], ["2026-10-15", IPH, 3]],
    "counts older than yesterday are removed");
  assert.equal(await asyncCode(() => storeFeedback(new FakeD1(), [ROW], { ...opts, limit: 0 })), "429 quota_exceeded");
});

// ------------------------------------------------------------------ POST /api/v1/feedback

function depsFor() {
  return { bundle: syntheticBundle(), fetch: fakeSiteverify(TEST_PASS).fetch, now: () => NOW, sleep: async () => {} };
}

async function call(api, deps, opts) {
  const res = await api(makeCtx(opts), deps);
  return { res, status: res.status, body: await readJson(res) };
}

async function openSession(env, deps, ip = "203.0.113.7") {
  const r = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "XXXX.DUMMY.TOKEN.XXXX" }, env, ip });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.session;
}

function feedbackEnv(over = {}) {
  return makeEnv({ FEEDBACK: new FakeD1(), ALLOW_TEST_TURNSTILE: "1", ...over });
}

test("feedback API: {session, items} -> {ok: true, stored}; the rows are counted per pair", async () => {
  const env = feedbackEnv();
  const deps = depsFor();
  const session = await openSession(env, deps);
  const r = await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [ROW, FIXED, KID] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ok: true, stored: 3 });
  assert.equal(r.res.headers.get("cache-control"), "no-store");
  const next = await call(feedbackApi, { ...deps, now: () => NOW + DAY_MS }, { path: "/api/v1/feedback", env,
    body: { session: await openSession(env, { ...deps, now: () => NOW + DAY_MS }), items: [ROW] } });
  assert.deepEqual(next.body, { ok: true, stored: 1 });
  const rows = await listFeedback(env.FEEDBACK, "all");
  assert.deepEqual(rows.map((x) => [x.en, x.count, x.first_day, x.last_day]), [
    ["hepatocellular carcinoma", 2, "2026-10-14", "2026-10-15"], ["core needle", 1, "2026-10-14", "2026-10-14"],
    ["tumour", 1, "2026-10-14", "2026-10-14"]]);
});

test("feedback API: a job that matched no pack sends pack \"_none\" -- accepted; an unknown pack id is still refused", async () => {
  const env = feedbackEnv();
  const deps = depsFor();
  const session = await openSession(env, deps);
  const none = { ...ROW, pack: "_none" };
  const ok = await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [none] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body, { ok: true, stored: 1 });
  const rows = await listFeedback(env.FEEDBACK, "all");
  assert.deepEqual(rows.map((x) => x.pack), ["_none"]);
  const bad = await call(feedbackApi, deps, { path: "/api/v1/feedback", env,
    body: { session, items: [{ ...ROW, pack: "no-such-pack" }] } });
  assert.equal(bad.status, 400);
});

test("feedback API: validated before the session; the session is required; no D1 binding is a server misconfiguration", async () => {
  const env = feedbackEnv();
  const deps = depsFor();
  const session = await openSession(env, deps);
  const cases = [
    [{ session, items: [] }, 400, "bad_request"],
    [{ session, items: Array(51).fill(ROW) }, 400, "bad_request"],
    [{ session, items: [{ ...ROW, en: "e".repeat(81) }] }, 400, "bad_request"],
    [{ session, items: [{ ...ROW, pack: "zzz" }] }, 400, "bad_request"],
    [{ session, items: [{ ...ROW, kind: "both" }] }, 400, "bad_request"],
    [{ session, items: [ROW], file_name: "report.docx" }, 400, "bad_request"],
    [{ items: [ROW] }, 400, "bad_request"],
    [{ session: "forged.token", items: [ROW] }, 401, "session_expired"],
  ];
  for (const [body, status, c] of cases) {
    const r = await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body });
    assert.deepEqual([r.status, r.body.code], [status, c], JSON.stringify(body).slice(0, 100));
  }
  const late = await call(feedbackApi, { ...deps, now: () => NOW + 43201 * 1000 }, { path: "/api/v1/feedback", env,
    body: { session, items: [ROW] } });
  assert.deepEqual([late.status, late.body.code], [401, "session_expired"]);
  assert.deepEqual(env.FEEDBACK.dump().feedback, [], "nothing stored");
  const big = await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [ROW],
    pad: "x".repeat(140000) } });
  assert.deepEqual([big.status, big.body.code], [413, "too_large"]);
  const get = await call(feedbackApi, deps, { method: "GET", path: "/api/v1/feedback", env });
  assert.equal(get.status, 405);
  const noDb = await call(feedbackApi, deps, { path: "/api/v1/feedback", env: { ...env, FEEDBACK: undefined },
    body: { session, items: [ROW] } });
  assert.deepEqual([noDb.status, noDb.body.code], [500, "server_misconfigured"]);
  const foreign = await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [ROW] },
    origin: "https://evil.example" });
  assert.deepEqual([foreign.status, foreign.body.code], [403, "bad_origin"]);
});

test("feedback API: rows per client IP per day (FEEDBACK_ROWS_PER_DAY) -> 429 quota_exceeded", async () => {
  const env = feedbackEnv({ FEEDBACK_ROWS_PER_DAY: "4" });
  const deps = depsFor();
  const session = await openSession(env, deps);
  assert.equal((await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [ROW, FIXED,
    KID] } })).status, 200);
  const capped = await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [
    { ...ROW, vi_user: "a" }, { ...ROW, vi_user: "b" }] } });
  assert.deepEqual([capped.status, capped.body.code], [429, "quota_exceeded"]);
  // a new session from the same IP shares the IP's count; another IP has its own
  const again = await openSession(env, deps);
  assert.equal((await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session: again, items: [
    { ...ROW, vi_user: "a" }, { ...ROW, vi_user: "b" }] } })).status, 429);
  const other = await openSession(env, deps, "198.51.100.9");
  assert.equal((await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session: other, items: [
    { ...ROW, vi_user: "a" }] } })).status, 200);
  const bad = await call(feedbackApi, deps, { path: "/api/v1/feedback", env: feedbackEnv({ FEEDBACK_ROWS_PER_DAY: "x" }),
    body: { session, items: [ROW] } });
  assert.deepEqual([bad.status, bad.body.code], [500, "server_misconfigured"]);
});

test("feedback API privacy: D1 holds the pairs, days, counts and a keyed IP hash only; nothing is logged", async () => {
  const MARK = "zqxmark";
  const env = feedbackEnv();
  const deps = depsFor();
  const [, lines] = await withConsoleSpy(async () => {
    const session = await openSession(env, deps);
    const v = await verifySession(TEST_SESSION_SECRET, session, NOW);
    await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [{ ...ROW, en: MARK + " term" }] } });
    await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [{ ...ROW, en: MARK + "x".repeat(90) }] } });
    env.FEEDBACK.failWrites = true;
    const down = await call(feedbackApi, deps, { path: "/api/v1/feedback", env, body: { session, items: [{ ...ROW,
      vi_user: MARK }] } });
    assert.deepEqual([down.status, down.body.code], [500, "server_error"]);
    env.FEEDBACK.failWrites = false;
    const dump = JSON.stringify(env.FEEDBACK.dump());
    assert.ok(!dump.includes("203.0.113.7") && !dump.includes(v.sid) && !dump.includes(session), "no IP, no session");
    assert.ok(dump.includes(v.iph), "the keyed IP hash of the session counts the rows");
  });
  for (const l of lines) assert.ok(!l.includes(MARK) && !l.includes("carcinom"), l);
});
