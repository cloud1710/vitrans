// "Xem lại thuật ngữ" after a cloud job (spec Amendment G), without the page: the items sent to /api/v1/terms, the
// rows of the two lists ("Từ mới": terms no pack covers, from /terms; "Đã tự sửa": the core's term fixes, from the
// results' `fixes` [{en, from, to}]), the user's change applied to the translated segments, the feedback payload
// (term pairs only, never a sentence) and the panel state (TermReview). No DOM, no network: rewriteFile writes the
// corrected file through the injected translateFile (engine/pipeline.js, the M1 layer the job used).
export const TERMS_MAX_ITEMS = 200;     // items in one /terms request ...
export const TERMS_MAX_CHARS = 60000;   // ... and code points of their src + vi
export const FEEDBACK_MAX_ITEMS = 50;   // term pairs in one /feedback request
export const EN_MAX_CHARS = 80;         // a term as /feedback takes it: English <= 80 characters ...
export const VI_MAX_CHARS = 120;        // ... each Vietnamese <= 120 (the server's limits) ...
export const EN_MAX_WORDS = 8;          // ... and English of at most 8 words: anything longer is a sentence, never sent
export const NO_PACK = "_none";         // the pack id of a job without a pack (the core's EMPTY_PACK)

const TOKENS = /(<\/?g\d+>|<x\d+\/>)/;  // the core's tags (split keeps them at the odd indexes)
const WORD = /[\p{L}\p{M}\p{N}]/u;
const nfc = (s) => String(s == null ? "" : s).normalize("NFC");
const squash = (s) => String(s).replace(/\s+/g, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function cpLen(s) {
  let n = 0;
  for (const ch of s) n += ch ? 1 : 0;
  return n;
}

function charBefore(s, i) {
  if (i <= 0) return "";
  const c = s.charCodeAt(i - 1);
  return c >= 0xdc00 && c <= 0xdfff && i >= 2 ? s.slice(i - 2, i) : s[i - 1];
}

const charAt = (s, i) => (i >= s.length ? "" : String.fromCodePoint(s.codePointAt(i)));
// s[start, end) stands as whole words: no letter, mark or digit right before or after it
const bounded = (s, start, end) => !WORD.test(charBefore(s, start)) && !WORD.test(charAt(s, end));

function capFirst(s) {
  const first = String.fromCodePoint(s.codePointAt(0));
  return first.toUpperCase() + s.slice(first.length);
}

/** A segment's plain text: the core's tags dropped, a placeholder (<xN/>: tab, break, field) read as a space. */
export function plainText(tagged) {
  return squash(String(tagged == null ? "" : tagged).replace(/<x\d+\/>/g, " ").replace(/<\/?g\d+>/g, ""));
}

/** (src) -> whether the plain English src holds `en`, case-insensitively, as whole words (spaces collapsed). */
export function termMatcher(en) {
  const term = squash(nfc(en));
  if (!term) return () => false;
  const re = new RegExp(escapeRe(term), "giu");
  return (src) => {
    const text = squash(nfc(src));
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (bounded(text, m.index, m.index + m[0].length)) return true;
      re.lastIndex = m.index + (text.codePointAt(m.index) > 0xffff ? 2 : 1);
    }
    return false;
  };
}

export function hasTerm(src, en) {
  return termMatcher(en)(src);
}

/**
 * The Vietnamese of a translated segment with each pair [old, new] applied: the old string exactly (NFC), every
 * occurrence that stands as whole words, also with its first letter capitalised (the start of a sentence: the new one
 * is capitalised there too), only in the text between the core's tags (never a tag); where two pairs overlap the
 * longer old string wins. -> {text, hits: [replacements per pair]}; nothing replaced: the very same text.
 */
export function replaceTerms(text, pairs) {
  const src = String(text == null ? "" : text);
  const hits = pairs.map(() => 0);
  const seen = new Set();
  const variants = [];  // [old as written, new, pair index], longest first
  pairs.forEach(([from, to], k) => {
    const a = squash(nfc(from)), b = squash(nfc(to));
    if (!a || a === b) return;
    for (const [x, y] of [[a, b], [capFirst(a), capFirst(b)]]) {
      if (!seen.has(x)) { seen.add(x); variants.push([x, y, k]); }
    }
  });
  if (!variants.length) return { text: src, hits };
  variants.sort((x, y) => y[0].length - x[0].length);
  const re = new RegExp(variants.map((v) => escapeRe(v[0])).join("|"), "gu");
  const pieces = nfc(src).split(TOKENS).map((piece, i) => {
    if (i % 2) return piece;  // a tag
    let out = "", last = 0;
    re.lastIndex = 0;
    for (let m = re.exec(piece); m; m = re.exec(piece)) {
      const at = m.index;
      const v = variants.find(([x]) => piece.startsWith(x, at) && bounded(piece, at, at + x.length));
      if (v) {
        out += piece.slice(last, at) + v[1];
        hits[v[2]] += 1;
        last = at + v[0].length;
        re.lastIndex = last;
      } else {
        re.lastIndex = at + (piece.codePointAt(at) > 0xffff ? 2 : 1);
      }
    }
    return out + piece.slice(last);
  });
  return hits.some((n) => n) ? { text: pieces.join(""), hits } : { text: src, hits };
}

/**
 * The items for /api/v1/terms: [{id, src, vi}] = each translated segment's plain English and Vietnamese, nothing
 * else. More than TERMS_MAX_ITEMS items or TERMS_MAX_CHARS characters: the items with the most text that fit, sent
 * in document order. segments: [{id, tagged}], results: [{id, text}].
 */
export function termItems(segments, results) {
  const vi = new Map((results || []).map((r) => [String(r.id), r]));
  const all = [];
  for (const s of segments || []) {
    const r = vi.get(String(s.id));
    const item = { id: s.id, src: plainText(s.tagged), vi: plainText(r ? r.text : "") };
    if (item.src && item.vi) all.push(item);
  }
  const sizes = all.map((i) => cpLen(i.src) + cpLen(i.vi));
  if (all.length <= TERMS_MAX_ITEMS && sizes.reduce((a, b) => a + b, 0) <= TERMS_MAX_CHARS) return all;
  const order = all.map((item, at) => ({ item, at, n: sizes[at] })).sort((a, b) => b.n - a.n || a.at - b.at);
  const keep = [];
  let chars = 0;
  for (const c of order) {
    if (keep.length >= TERMS_MAX_ITEMS) break;
    if (chars + c.n > TERMS_MAX_CHARS) continue;
    keep.push(c);
    chars += c.n;
  }
  return keep.sort((a, b) => a.at - b.at).map((c) => c.item);
}

/** "Từ mới" rows from a /terms answer {terms: [{en, vi, count, ids}]}: one per English term (the first one); ids =
 * the segments the server found the term in (its matcher knows plurals and US / UK spellings). */
export function newRows(answer) {
  const list = answer && Array.isArray(answer.terms) ? answer.terms : [];
  const seen = new Set();
  const rows = [];
  for (const t of list) {
    if (!t || typeof t.en !== "string" || typeof t.vi !== "string") continue;
    const en = squash(t.en), vi = squash(nfc(t.vi));
    if (!en || !vi || seen.has(en.toLowerCase())) continue;
    seen.add(en.toLowerCase());
    const ids = Array.isArray(t.ids) ? t.ids.map(String) : [];
    const count = Number.isFinite(t.count) ? t.count : ids.length;
    rows.push({ key: "n" + rows.length, kind: "new", en, from: "", used: vi, value: vi, count, sent: null,
      ids: new Set(ids) });
  }
  return rows;
}

// fixes of the core that are no term pair: the title order (qa.js TITLE_FIX, academic titles before a name)
const NOT_TERMS = new Set(["title-order"]);

/** "Đã tự sửa" rows from the results' fixes [{en, from, to}]: one per English term and pack Vietnamese (to), the
 * Vietnamese the model had written (from) listed, the segments counted. Results without fixes give none; the title
 * order fix is never a row. */
export function fixRows(results) {
  const rows = [];
  const byKey = new Map();
  for (const r of results || []) {
    if (!r || !Array.isArray(r.fixes)) continue;
    for (const f of r.fixes) {
      if (!f || typeof f.en !== "string" || typeof f.to !== "string") continue;
      const en = squash(f.en), to = squash(nfc(f.to));
      if (!en || !to || NOT_TERMS.has(en.toLowerCase())) continue;
      const key = en.toLowerCase() + "\u0000" + to;
      let row = byKey.get(key);
      if (!row) {
        row = { key: "f" + rows.length, kind: "fixed", en, from: "", froms: [], used: to, value: to, count: 0, sent: null,
          ids: new Set() };
        byKey.set(key, row);
        rows.push(row);
      }
      if (!row.ids.has(String(r.id))) {
        row.ids.add(String(r.id));
        row.count += 1;
      }
      const from = typeof f.from === "string" ? squash(nfc(f.from)) : "";
      if (from && !row.froms.includes(from)) {
        row.froms.push(from);
        row.from = row.froms.join(", ");
      }
    }
  }
  return rows;
}

/** Text a feedback item may carry: one line, 1 to maxChars characters (spaces collapsed), at most maxWords words. */
export function isTerm(s, maxChars, maxWords) {
  if (typeof s !== "string" || /[\r\n]/.test(s)) return false;
  const t = squash(nfc(s));
  return !!t && cpLen(t) <= maxChars && (!maxWords || t.split(" ").length <= maxWords);
}

const sendable = (r) => isTerm(r.en, EN_MAX_CHARS, EN_MAX_WORDS) && isTerm(r.used, VI_MAX_CHARS) &&
  isTerm(r.value, VI_MAX_CHARS);

/** One /feedback request for rows: {rows (the rows it carries), items: [{en, vi_used, vi_user, pack, kind}] only}, at
 * most FEEDBACK_MAX_ITEMS; a row whose text is not term-sized is left out (never a sentence). */
export function feedbackBatch(rows, pack) {
  const sent = (rows || []).filter(sendable).slice(0, FEEDBACK_MAX_ITEMS);
  return { rows: sent, items: sent.map((r) => ({ en: r.en, vi_used: r.used, vi_user: r.value, pack: pack || NO_PACK,
    kind: r.kind === "fixed" ? "fixed" : "new" })) };
}

export function feedbackItems(rows, pack) {
  return feedbackBatch(rows, pack).items;
}

/** The main pack of a job's classify setup ({setup_id?, setup: {packs: [{id, version}], hits}}): its first pack. */
export function mainPack(doc) {
  const packs = doc && doc.setup && Array.isArray(doc.setup.packs) ? doc.setup.packs : [];
  const p = packs.find((x) => x && typeof x.id === "string" && x.id);
  return p ? p.id : NO_PACK;
}

const REASONS = {
  quota_exceeded: "hết lượt hôm nay", budget_exhausted: "máy chủ hết ngân sách hôm nay",
  model_error: "mô hình chưa trả lời", model_failed: "mô hình chưa trả lời",
  network: "mất kết nối", unreachable: "mất kết nối",
  bad_turnstile: "chưa xác minh được trình duyệt", turnstile: "chưa xác minh được trình duyệt",
  no_session: "chưa xác minh được trình duyệt", session_expired: "phiên đã hết hạn",
  bad_request: "máy chủ từ chối",
};
const reason = (code) => REASONS[code] || "máy chủ lỗi";

/** The panel's line when /terms fails: short, and the translation stays valid. */
export function termsErrorText(code) {
  return "Chưa xem được từ mới (" + reason(code) + "). Bản dịch vẫn dùng được.";
}

export function feedbackErrorText(code) {
  return "Chưa gửi được (" + reason(code) + ").";
}

/**
 * The panel's state for one finished job: rows ("Từ mới" then "Đã tự sửa": {key, kind, en, from, used = the
 * Vietnamese the job used, value = the Vietnamese in the text now, count, sent = the value last sent}), the job's
 * results (original, kept) and the corrected ones (current).
 *   changes(drafts: Map key -> Vietnamese) -> the rows a draft would change;
 *   apply(drafts) replaces each changed row's value by the draft in every segment whose source holds the row's
 *     English term as whole words, and in the segments the row's ids name (where /terms found the term or the core
 *     fixed it: plurals and US / UK spellings too) -> {rows (changed), segments (how many changed), missing (English
 *     terms whose Vietnamese was not found)}
 *   pending(): changed rows not sent yet; toSend(): what the explicit button offers (pending, else the new terms not
 *     sent yet; fixed rows unchanged: the pack has them); markSent(rows).
 */
export class TermReview {
  constructor({ segments, results, pack }) {
    this.pack = pack || NO_PACK;
    this.segments = segments || [];
    this.sources = new Map(this.segments.map((s) => [String(s.id), plainText(s.tagged)]));
    this.original = (results || []).map((r) => ({ ...r }));
    this.current = (results || []).map((r) => ({ ...r }));
    this.fresh = [];
    this.fixed = fixRows(results || []);
  }

  get rows() {
    return this.fresh.concat(this.fixed);
  }

  setNew(answer) {
    this.fresh = newRows(answer);
  }

  items() {
    return termItems(this.segments, this.original);
  }

  /** The rows whose draft (spaces collapsed, NFC) is a new, non-empty Vietnamese. Changes nothing. */
  changes(drafts) {
    return this.rows.filter((row) => {
      const v = drafts.has(row.key) ? squash(nfc(drafts.get(row.key))) : "";
      return v && v !== row.value;
    });
  }

  apply(drafts) {
    const changed = this.changes(drafts).map((row) => ({ row, to: squash(nfc(drafts.get(row.key))),
      has: termMatcher(row.en), hits: 0 }));
    const touched = new Set();
    for (const r of this.current) {
      const src = this.sources.get(String(r.id)) || "";
      // the source holds the term, or the server / the core found it there (plurals, spellings)
      const here = changed.filter((c) => c.has(src) || (c.row.ids && c.row.ids.has(String(r.id))));
      if (!here.length) continue;
      const res = replaceTerms(r.text, here.map((c) => [c.row.value, c.to]));
      res.hits.forEach((n, k) => { here[k].hits += n; });
      if (res.hits.some((n) => n)) {
        r.text = res.text;
        touched.add(String(r.id));
      }
    }
    for (const c of changed) c.row.value = c.to;
    return { rows: changed.map((c) => c.row), segments: touched.size,
      missing: changed.filter((c) => !c.hits).map((c) => c.row.en) };
  }

  pending() {
    return this.rows.filter((r) => r.value !== r.used && r.sent !== r.value);
  }

  toSend() {
    const p = this.pending();
    return p.length ? p : this.fresh.filter((r) => r.sent !== r.value);
  }

  markSent(rows) {
    for (const r of rows) r.sent = r.value;
  }
}

/**
 * The corrected file: translateFile (engine/pipeline.js) on the job's input with the job's setup, notes option, model
 * and device, the kept results standing in for the engine (no request leaves the page) -> {bytes, name, report},
 * written by the M1 layer exactly as the job wrote it. job: {input (Uint8Array), name, setup (the pipeline setup the
 * job's prepare returned), notes, modelId, device}; results: [{id, text, ...}] of every segment. opts: {yieldFn}.
 */
export async function rewriteFile(translateFile, job, results, opts) {
  const o = opts || {};
  const byId = new Map(results.map((r) => [String(r.id), r]));
  return translateFile(job.input, job.name, {
    prepare: async () => job.setup,
    translateSegments: async (segments) => segments.map((s) => {
      const r = byId.get(String(s.id));
      if (!r) throw new Error("no translation kept for segment " + s.id);
      return r;
    }),
    batchSize: Number.MAX_SAFE_INTEGER, modelId: job.modelId, device: job.device, notes: job.notes !== false,
    onProgress: () => {}, ...(o.yieldFn ? { yieldFn: o.yieldFn } : {}),
  });
}
