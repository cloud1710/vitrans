// Term review after a job (spec Amendment G), the work of POST /api/v1/terms: the page sends the document's segments
// as {id, src (English plain text), vi (its Vietnamese translation)}; the model lists the medical / technical terms
// with the Vietnamese the translation used, as strict JSON (one call, or one per chunk of CHUNK_CHARS); the server
// keeps a pair only when
//   - the English term is in a segment (the core's glossary matcher: whole words, plurals, US / UK spellings),
//   - its Vietnamese is in the same segment's translation (whole words, any case),
//   - the term is not a glossary key of the job's packs (the setup's packs, read by the same matcher),
// and answers [{en, vi, count (occurrences of the English term in those segments), ids (those segments, in request
// order)}], most frequent first. Privacy: segments and answers are never logged; an answer that is not the JSON asked
// for is a ModelCallError of kind "json" (the API's 502 model_error), which never quotes it.
import { ApiError } from "./http.js";
import { ModelCallError } from "./model.js";
import { termSpans, packKeyFlags } from "./engine.js";

export const MAX_TERM_ITEMS = 200;
export const MAX_TERM_CHARS = 60000; // code points of all src + vi of one request
export const CHUNK_CHARS = 20000; // src + vi code points per model call; a larger segment goes alone
export const MAX_TERMS_PER_CALL = 80;
export const TERMS_MAX_TOKENS = 4096;
export const MAX_EN = 80; // the feedback limits: a longer pair could not be sent to the author
export const MAX_VI = 120;
const MAX_ID = 64;
const SEP = "|"; // between segments in a joined text: no term pattern matches it or across it

const badRequest = (message) => new ApiError(400, "bad_request", message);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

function cpLen(text) {
  let n = 0;
  for (const ch of text) n += ch ? 1 : 0;
  return n;
}

/** The request's items checked: 1 to MAX_TERM_ITEMS objects {id (text of 1-64 or an integer, distinct), src, vi
 * (text)}, at most MAX_TERM_CHARS code points of src + vi in all (413 above). */
export function checkTermItems(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_TERM_ITEMS) {
    throw badRequest("items must hold 1 to " + MAX_TERM_ITEMS + " segments.");
  }
  const ids = new Set();
  let chars = 0;
  const out = list.map((it) => {
    if (!isObject(it) || !Object.keys(it).every((k) => k === "id" || k === "src" || k === "vi")) {
      throw badRequest("Each item must be {id, src, vi}.");
    }
    const idOk = (typeof it.id === "string" && it.id.length >= 1 && it.id.length <= MAX_ID) || Number.isSafeInteger(it.id);
    if (!idOk || ids.has(String(it.id))) throw badRequest("Each item needs its own id (text or an integer).");
    ids.add(String(it.id));
    if (typeof it.src !== "string" || typeof it.vi !== "string") throw badRequest("An item's src and vi must be text.");
    chars += cpLen(it.src) + cpLen(it.vi);
    return { id: it.id, src: it.src, vi: it.vi };
  });
  if (chars > MAX_TERM_CHARS) {
    throw new ApiError(413, "too_large", "The items hold more than " + MAX_TERM_CHARS + " characters.");
  }
  return out;
}

/** Consecutive items in chunks of at most `limit` code points of src + vi (an item never split). */
export function termChunks(items, limit = CHUNK_CHARS) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const it of items) {
    const n = cpLen(it.src) + cpLen(it.vi);
    if (cur.length && size + n > limit) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += n;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const SYSTEM = [
  "You review the terminology of an English to Vietnamese translation of a medical document.",
  "The user message holds pairs: EN is an English segment, VI is its Vietnamese translation.",
  "List the medical and technical terms of the EN text with the Vietnamese words that the VI text uses for each.",
  "Answer with one JSON object and nothing else:",
  "{\"terms\": [{\"en\": \"English term\", \"vi\": \"Vietnamese rendering\"}]}",
  "Rules:",
  "- en: a medical or technical term of 1 to 6 words (a disease, finding, structure, cell, tissue, stain, test, " +
    "procedure, drug or device), copied exactly as the EN text writes it.",
  "- vi: the words of the matching VI text that translate the term, copied exactly (same spelling and diacritics).",
  "- Skip terms the translation leaves in English, abbreviations, gene and protein names, numbers, units and " +
    "everyday words.",
  "- List each term once, at most " + MAX_TERMS_PER_CALL + " terms.",
].join("\n");

const oneLine = (text) => text.replace(/\s+/g, " ").trim();

/** The chat messages of one call: the instructions (with the job's glossary hits named as known terms) and the
 * chunk's pairs. */
export function termsMessages(chunk, known = []) {
  const system = known.length ? SYSTEM + "\n- Skip these glossary terms: " + known.join("; ") + "." : SYSTEM;
  const user = chunk.map((it) => "EN: " + oneLine(it.src) + "\nVI: " + oneLine(it.vi)).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

const FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/i;
const TRAILING_COMMA_RE = /,\s*([}\]])/g;

function termList(value) {
  if (Array.isArray(value)) return value;
  if (isObject(value) && Array.isArray(value.terms)) return value.terms;
  return null;
}

/** [{en, vi}] of the model's answer: {"terms": [...]} or a bare list, also inside a code fence, after a preface or
 * with trailing commas; entries without text en and vi are skipped. Anything else: ModelCallError("json"). */
export function parseTermsAnswer(text) {
  const t = String(text || "");
  const tries = [t.trim()];
  const fence = FENCE_RE.exec(t);
  if (fence) tries.push(fence[1].trim());
  const open = t.search(/[[{]/);
  if (open >= 0) {
    const close = t.lastIndexOf(t[open] === "{" ? "}" : "]");
    if (close > open) tries.push(t.slice(open, close + 1));
  }
  for (const candidate of tries) {
    for (const s of [candidate, candidate.replace(TRAILING_COMMA_RE, "$1")]) {
      let value;
      try {
        value = JSON.parse(s);
      } catch (err) {
        continue;
      }
      const list = termList(value);
      if (!list) continue;
      const out = [];
      for (const e of list) {
        if (!isObject(e) || typeof e.en !== "string" || typeof e.vi !== "string") continue;
        const en = e.en.trim();
        const vi = e.vi.trim();
        if (en && vi) out.push({ en, vi });
      }
      return out;
    }
  }
  throw new ModelCallError("json");
}

const clean = (text) => oneLine(text.normalize("NFC"));

/** The model's pairs normalised (NFC, single spaces), within the feedback limits, the first of each (en, vi)
 * ignoring case. */
function uniquePairs(pairs) {
  const seen = new Set();
  const out = [];
  for (const p of pairs) {
    const en = clean(p.en);
    const vi = clean(p.vi);
    if (!/\p{L}/u.test(en) || cpLen(en) > MAX_EN || cpLen(vi) > MAX_VI) continue;
    const key = en.toLowerCase() + SEP + vi.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ en, vi });
  }
  return out;
}

function joined(texts) {
  const starts = [];
  let at = 0;
  for (const t of texts) {
    starts.push(at);
    at += t.length + SEP.length;
  }
  return { text: texts.join(SEP), starts };
}

function indexAt(starts, pos) { // the last segment starting at or before pos
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const escapeRe = (s) => s.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");

/** Whole-word, case-insensitive pattern of a Vietnamese term (any white space between its words). */
function viPattern(vi) {
  const words = vi.toLowerCase().split(/\s+/).filter((w) => w).map(escapeRe);
  return new RegExp("(?<![\\p{L}\\p{N}\\p{M}])" + words.join("\\s+") + "(?![\\p{L}\\p{N}\\p{M}])", "gu");
}

/** The pairs that some segment holds (English in its src, Vietnamese in its vi) with their count and ids. */
function locate(items, pairs) {
  const src = joined(items.map((it) => it.src.toLowerCase()));
  const vi = joined(items.map((it) => it.vi.normalize("NFC").toLowerCase()));
  const out = [];
  for (const p of pairs) {
    const enCount = new Map(); // segment index -> occurrences of the English term
    for (const [start] of termSpans(p.en, src.text)) {
      const i = indexAt(src.starts, start);
      enCount.set(i, (enCount.get(i) || 0) + 1);
    }
    if (!enCount.size) continue;
    const viHeld = new Set();
    for (const m of vi.text.matchAll(viPattern(p.vi))) viHeld.add(indexAt(vi.starts, m.index));
    const held = [...enCount.keys()].filter((i) => viHeld.has(i)).sort((a, b) => a - b);
    if (!held.length) continue;
    out.push({ en: p.en, vi: p.vi, count: held.reduce((n, i) => n + enCount.get(i), 0), ids: held.map((i) => items[i].id) });
  }
  return out;
}

const byCount = (a, b) => b.count - a.count || cmp(a.en.toLowerCase(), b.en.toLowerCase()) ||
  cmp(a.vi.toLowerCase(), b.vi.toLowerCase());

/** The new terms of a document (see the module notes). set: the pack set; setup: the checked wire setup {packs,
 * hits}; items: checkTermItems output; model: createModel's function (its usage object counts the calls). Segments
 * without English or Vietnamese text are not sent; with none left there is no model call. */
export async function findTerms(set, setup, items, { model, signal = null } = {}) {
  const sendable = items.filter((it) => it.src.trim() && it.vi.trim());
  if (!sendable.length) return [];
  const settled = await Promise.allSettled(termChunks(sendable).map(async (chunk) => {
    const answer = await model(termsMessages(chunk, setup.hits), { temperature: 0, maxTokens: TERMS_MAX_TOKENS, signal });
    return parseTermsAnswer(answer.text);
  }));
  const failed = settled.find((r) => r.status === "rejected"); // every call has ended: all their neurons are counted
  if (failed) throw failed.reason;
  const pairs = uniquePairs(settled.flatMap((r) => r.value));
  const keys = await packKeyFlags(set, setup.packs, pairs.map((p) => p.en));
  return locate(sendable, pairs.filter((p, i) => !keys[i])).sort(byCount);
}
