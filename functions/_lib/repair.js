// Term repair of the live profile (spec docs/superpowers/specs/2026-10-15-asr-term-repair-design.md): recognizers
// misspell domain terms ("puppy thyroid carcinoma", "Desmond"), so a live sentence with candidates of the core's finder
// (web/engine/repair.js: glossary keys close to a 1-4 word window, never one that occurs) gets a block in its user
// message: the note that the text is speech-recognition output, the numbered candidates (heard span -> term = its
// Vietnamese), the rule (a correction only when the heard words make no sense there and the term clearly does) and a
// two-line answer, "USE: <numbers or none>" / "VI: <the translation>". The model names corrections, it never writes
// the English: applyRepairs puts the terms of the numbers used into the source's own text (en_fixed), so en_fixed
// differs from the source by offered replacements alone. An answer without the lines is the plain translation
// (en_fixed = the source).
import { words } from "../../web/engine/repair.js";

export const REPAIR_MARK = "may contain mis-heard medical terms";

/** The user-message block for these candidates ("" for none); rows: the packs' glossary (English key -> Vietnamese). */
export function buildRepairBlock(cands, rows) {
  if (!cands.length) return "";
  const lines = cands.map((c, i) => (i + 1) + ". \"" + c.from + "\" -> " + c.to +
    (rows.has(c.to) ? " = " + rows.get(c.to) : ""));
  return ["The text comes from speech recognition and " + REPAIR_MARK + ". Possible corrections (heard -> term = " +
    "Vietnamese):", ...lines,
  "These are only sound-alike guesses and most are wrong. Use a correction only when the heard words are nonsense " +
    "in a medical talk (an everyday word, a name or broken pieces of a word where a medical term belongs) and the " +
    "term clearly fits. A real word or term that makes sense as heard (also a medical one) stays as it is.",
  "Answer in exactly two lines:",
  "USE: <the numbers of the corrections you used, or none>",
  "VI: <the Vietnamese translation, with those corrections>"].join("\n");
}

const LABEL_RE = /^[\s*_#>-]*(USE|VI|VN)[\s*_]*:[\s*_]*(.*)$/i;

/** {use: [correction numbers as given], vi: the translation} of a two-line answer; an answer without the labels is
 * all translation, with no correction used. */
export function parseRepairAnswer(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  let use = -1;
  let vi = -1;
  const rest = [];
  lines.forEach((line, i) => {
    const m = LABEL_RE.exec(line);
    rest.push(m ? m[2].replace(/[\s*_]+$/, "") : line);
    if (!m) return;
    if (m[1].toUpperCase() === "USE" && use < 0) use = i;
    else if (m[1].toUpperCase() !== "USE" && vi < 0) vi = i;
  });
  const numbers = use < 0 ? [] : (rest[use].match(/\d+/g) || []).map(Number);
  const join = (from, to) => rest.slice(from, to).filter((l) => l.trim()).join("\n").trim();
  if (use < 0 && vi < 0) return { use: [], vi: String(raw || "") };
  if (vi < 0) return { use: numbers, vi: join(use + 1, lines.length) };
  return { use: numbers, vi: vi > use ? join(vi, lines.length) : join(vi, use) };
}

const isUpper = (ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase();

/** {text: en_fixed, repairs: [{from, to}]}: the source (the text findCandidates read) with the candidates of these
 * numbers (1-based, in the order given; unknown numbers and spans already taken are skipped) replaced by their term
 * (a first word keeps the source's capital). None: the source as it is. */
export function applyRepairs(source, use, cands) {
  const taken = [];
  for (const n of use) {
    const c = Number.isInteger(n) && n >= 1 && n <= cands.length ? cands[n - 1] : null;
    if (!c || taken.some(([x, y]) => c.words[0] < y && x < c.words[1])) continue;
    taken.push([c.words[0], c.words[1], c]);
  }
  if (!taken.length) return { text: source, repairs: [] };
  const sw = words(source);
  taken.sort((x, y) => x[0] - y[0]);
  let text = "";
  let at = 0;
  const repairs = [];
  for (const [s, e, c] of taken) {
    const from = source.slice(sw[s][0], sw[e - 1][1]);
    let to = c.to;
    if (s === 0 && isUpper(from[0]) && !isUpper(to[0])) to = to[0].toUpperCase() + to.slice(1);
    text += source.slice(at, sw[s][0]) + to;
    at = sw[e - 1][1];
    repairs.push({ from, to });
  }
  return { text: text + source.slice(at), repairs };
}
