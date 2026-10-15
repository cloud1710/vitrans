// Deterministic checks and fixes applied to every translated segment (port of helper/vitranslate/qa.py).
// The patterns are the helper's, in Python syntax, compiled by pyre.js; indices are UTF-16 units, lengths that
// Python takes with len() are code points.
import { compile, escape } from "./pyre.js";
import { TOKEN_RE } from "./tags.js";
import { isValid, suspicious } from "./vnsyllable.js";
import { pyStrip, pyRstrip, pyLstrip, pySplit, cpLen, cpAt, firstCp, lastCp, nextIndex, isAlnum, isAlpha, isDigit,
  isUpperCh, isLowerCh, pyIsUpper, pyIsLower, pyIsAlpha, pyIsAscii, hasNonSpace, cmpStr } from "./py.js";

const THINK_RE = compile(String.raw`<think>.*?</think>`, "s");
const THINK_OPEN_RE = compile(String.raw`<think>.*$`, "s");
const SWITCH_RE = compile(String.raw`\s*/no_?think\b`);
const LABEL_RE = compile(String.raw`^\s*(?:here is the (?:vietnamese )?translation|translation|translate|vietnamese|` +
  String.raw`b\u1ea3n d\u1ecbch)\s*:\s*`, "i");
// a first line that only announces the translation ("Here is the Vietnamese translation:"); segments have no newline
const PREFACE_RE = compile(String.raw`^[^\n]*(?:translat|vietnamese|b\u1ea3n d\u1ecbch|ti\u1ebfng vi\u1ec7t)[^\n]*:[ \t]*\n`,
  "i");
const FENCE_RE = compile("^```[^\\n]*\\n(.*?)\\n?```$", "s");
const WORD_COLON_RE = compile(String.raw`^\s*[^\W\d_]+\s*:`);
const QUOTES = new Map([["\"", "\""], ["\u201c", "\u201d"], ["'", "'"]]);
const EN_STOP = new Set(["the", "of", "and", "with", "for", "is", "are", "was", "were", "by", "from", "that", "this",
  "which", "after", "before", "not", "between", "into", "these", "those", "has", "have", "been", "their"]);
const NUM_RE = compile(String.raw`\d+(?:[.,]\d+)*`);
const QUOTED_RE = compile(String.raw`"[^"]*"|\u201c[^\u201d]*\u201d|\([^)]*\)|\[[^\]]*\]`);
const TITLE_RUN_RE = compile(String.raw`\b[A-Z]\w*(?:\s+(?:(?:of|and|the|for|in)\s+){0,2}[A-Z]\w*){2,}`);
const LOWER_WORDS_RE = compile("[a-z]+");
const WORDS3_RE = compile(String.raw`\b[a-z]{3,}\b`);
const SPLIT_TERM_RE = compile(String.raw`[\s-]+`);
const IZE_RE = compile("i([sz])(e|ed|es|ing|ation|ations)$");
const ASCII_WORDS_RE = compile("[A-Za-z]+");

function nfc(text) {
  return text.normalize("NFC");
}

// American / British spellings of medical words (either may be the glossary key)
const SPELLINGS = [["tumor", "tumour"], ["estrogen", "oestrogen"], ["edema", "oedema"], ["esophag", "oesophag"],
  ["anemi", "anaemi"], ["ischemi", "ischaemi"], ["leukemi", "leukaemi"], ["pediatr", "paediatr"],
  ["behavior", "behaviour"], ["color", "colour"], ["center", "centre"], ["fiber", "fibre"],
  ["fetal", "foetal"], ["fetus", "foetus"], ["celiac", "coeliac"], ["diarrhea", "diarrhoea"],
  ["gynecolog", "gynaecolog"], ["etiolog", "aetiolog"]];
const PLURALS = [["y", "ies"], ["is", "es"], ["us", "i"], ["um", "a"], ["ix", "ices"], ["ex", "ices"]];

/** Spellings of one glossary word: -logy / -logic / -logical and -ic -> -ical in that family only, American / British
 * spelling, hem- / haem-, -ize / -ise; longest first. */
export function wordForms(w) {
  const forms = new Set([w]);
  if (w.endsWith("logy")) {
    forms.add(w.slice(0, -1) + "ic");
    forms.add(w.slice(0, -1) + "ical");
  } else if (w.endsWith("logic")) {
    forms.add(w + "al");
    forms.add(w.slice(0, -2) + "y");
  } else if (w.endsWith("logical")) {
    forms.add(w.slice(0, -2));
    forms.add(w.slice(0, -4) + "y");
  }
  for (const f of [...forms]) {
    for (const [us, uk] of SPELLINGS) {
      if (f.includes(us)) forms.add(f.replaceAll(us, uk));
      else if (f.includes(uk)) forms.add(f.replaceAll(uk, us));
    }
  }
  for (const f of [...forms]) {
    if (f.startsWith("hem") && cpLen(f) > 4) forms.add("haem" + f.slice(3));
    else if (f.startsWith("haem") && cpLen(f) > 5) forms.add("hem" + f.slice(4));
    const m = IZE_RE.search(f);
    if (m) forms.add(f.slice(0, m.start(1)) + (m.group(1) === "z" ? "s" : "z") + f.slice(m.end(1)));
  }
  return [...forms].sort((a, b) => cpLen(b) - cpLen(a) || cmpStr(a, b));
}

/** Forms of a term's last word: its spellings, each also as a plural (regular and Latin / Greek irregular). */
function lastForms(w) {
  const out = [];
  for (const f of wordForms(w)) {
    out.push(escape(f) + "(?:s|es)?");
    for (const [end, plural] of PLURALS) {
      if (f.endsWith(end) && cpLen(f) > cpLen(end)) out.push(escape(f.slice(0, f.length - end.length) + plural));
    }
  }
  return out;
}

const BOUNDED = new Map();

/** Whole-word, lower-case pattern (Python syntax) of a glossary term: plurals of the last word, spelling and
 * -logy / -logic variants of every word, a space or a hyphen between words; never inside a hyphenated compound. */
export function bounded(term) {
  let pat = BOUNDED.get(term);
  if (pat !== undefined) return pat;
  const words = SPLIT_TERM_RE.split(pyStrip(term.toLowerCase())).filter((w) => w);
  if (!words.length) {
    pat = "(?!)";
  } else {
    const parts = words.slice(0, -1).map((w) => "(?:" + wordForms(w).map(escape).join("|") + ")");
    parts.push("(?:" + lastForms(words[words.length - 1]).join("|") + ")");
    pat = String.raw`(?<![\w-])` + parts.join(String.raw`[\s-]+`) + String.raw`(?![\w-])`;
  }
  if (BOUNDED.size > 8192) BOUNDED.clear();
  BOUNDED.set(term, pat);
  return pat;
}

/** Remove model chatter; restore the source's leading / trailing whitespace. */
export function stripLeaks(src, out) {
  if (out.includes("</think>")) out = out.slice(out.lastIndexOf("</think>") + "</think>".length);
  out = THINK_RE.sub("", out);
  out = THINK_OPEN_RE.sub("", out);
  out = pyStrip(SWITCH_RE.sub("", out));
  if (!src.includes("\n")) out = pyStrip(PREFACE_RE.sub("", out));
  if (!src.includes("```")) {
    const fence = FENCE_RE.match(out);
    if (fence) out = fence.group(1);
  }
  if (!WORD_COLON_RE.match(src)) out = LABEL_RE.sub("", out);
  out = pyStrip(out);
  const first = firstCp(out);
  const last = lastCp(out);
  if (cpLen(out) >= 2 && QUOTES.has(first) && last === QUOTES.get(first) && !QUOTES.has(firstCp(pyStrip(src)))) {
    const inner = out.slice(first.length, out.length - last.length);
    if (!inner.includes(first) && !inner.includes(last)) out = pyStrip(inner);
  }
  const lead = src.slice(0, src.length - pyLstrip(src).length);
  const trail = src.slice(pyRstrip(src).length);
  return lead + out + trail;
}

/** Index of the first letter or digit outside tag tokens, or -1. */
export function firstAlnum(text) {
  let pos = 0;
  while (pos < text.length) {
    const m = TOKEN_RE.match(text, pos);
    if (m) pos = m.end();
    else if (isAlnum(cpAt(text, pos))) return pos;
    else pos = nextIndex(text, pos);
  }
  return -1;
}

const WORD_RE = compile(String.raw`[^\W_]+`);

/** Sentence-initial case from the source: when the source starts with a capital letter and the translation starts
 * with a lower-case letter, that letter becomes a capital; a first word with a digit or a capital, or written that
 * way in the source, keeps its case; tags are skipped. */
export function sourceCase(srcPlain, out) {
  const s = firstAlnum(srcPlain);
  const i = firstAlnum(out);
  if (s < 0 || i < 0 || !isUpperCh(cpAt(srcPlain, s)) || !isLowerCh(cpAt(out, i))) return out;
  const word = WORD_RE.match(out, i).group(0);
  if (Array.from(word).some((c) => isDigit(c) || isUpperCh(c))) return out;
  if (compile(String.raw`(?<![^\W_])` + escape(word) + String.raw`(?![^\W_])`).search(srcPlain)) return out;
  const ch = cpAt(out, i);
  return out.slice(0, i) + ch.toUpperCase() + out.slice(i + ch.length);
}

/** Text with quoted / bracketed spans and Title-Case runs (WHO titles, journals) removed. */
function prose(text) {
  return TITLE_RUN_RE.sub(" ", QUOTED_RE.sub(" ", text));
}

function stopCount(text) {
  return LOWER_WORDS_RE.findall(prose(text).toLowerCase()).filter((w) => EN_STOP.has(w)).length;
}

/** True when the source reads as English prose and the output still does. */
export function englishLeft(srcPlain, outPlain) {
  const norm = (t) => pySplit(t.toLowerCase()).join(" ");
  if (norm(srcPlain) === norm(outPlain) && WORDS3_RE.findall(prose(srcPlain)).length >= 3) return true;
  if (stopCount(srcPlain) < 2) return false;
  return stopCount(outPlain) >= 2;
}

// Anatomical sites: a Vietnamese form and the English word stems that name it (a stem starts a source word).
export const SITES = [
  ["b\u1ec3 th\u1eadn", ["pelvis", "pelvic", "pyel", "calyx", "calyc", "calice"]],
  ["th\u01b0\u1ee3ng th\u1eadn", ["adrenal", "suprarenal"]],
  ["th\u1eadn", ["kidney", "renal", "nephr"]],
  ["ni\u1ec7u qu\u1ea3n", ["ureter"]],
  ["ni\u1ec7u \u0111\u1ea1o", ["urethr"]],
  ["b\u00e0ng quang", ["bladder", "vesic", "urothel"]],
  ["gan", ["liver", "hepat"]],
  ["m\u00e0ng ph\u1ed5i", ["pleura"]],
  ["ph\u1ed5i", ["lung", "pulmon", "pneum"]],
  ["c\u1eadn gi\u00e1p", ["parathyroid"]],
  ["tuy\u1ebfn gi\u00e1p", ["thyroid"]],
  ["v\u00fa", ["breast", "mammar"]],
  ["tuy\u1ebfn ti\u1ec1n li\u1ec7t", ["prostat"]],
  ["c\u1ed5 t\u1eed cung", ["cervix", "cervical"]],
  ["t\u1eed cung", ["uterus", "uterine", "endometri", "womb"]],
  ["bu\u1ed3ng tr\u1ee9ng", ["ovary", "ovarian", "ovaries"]],
  ["tinh ho\u00e0n", ["testis", "testes", "testic"]],
  ["d\u1ea1 d\u00e0y", ["stomach", "gastr"]],
  ["\u0111\u1ea1i tr\u00e0ng", ["colon", "colorect"]],
  ["tr\u1ef1c tr\u00e0ng", ["rectum", "rectal", "rectosigm"]],
  ["t\u1ee5y", ["pancrea"]],
  ["l\u00e1ch", ["spleen", "splen"]],
  ["th\u1ef1c qu\u1ea3n", ["esophag", "oesophag"]],
  ["m\u00e0ng n\u00e3o", ["mening"]],
  ["ti\u1ec3u n\u00e3o", ["cerebell"]],
  ["n\u00e3o", ["brain", "cerebr", "encephal"]],
  ["x\u01b0\u01a1ng", ["bone", "osse", "osteo", "skelet"]],
  ["tim", ["heart", "cardi"]],
  ["t\u00fai m\u1eadt", ["gallbladder", "cholecyst"]],
  ["tuy\u1ebfn n\u01b0\u1edbc b\u1ecdt", ["saliv", "parotid", "submandib"]],
  ["thanh qu\u1ea3n", ["laryn"]],
  ["tuy\u1ebfn y\u00ean", ["pituitar", "hypophys"]],
  ["amidan", ["tonsil"]],
];
export const SITE_STEMS = SITES.flatMap(([, stems]) => stems);
export const LATERALITY = new Set(["left", "right", "upper", "lower", "bilateral"]);

/** A laterality word or a word that starts with a site stem, in any case. */
function siteWord(word) {
  const low = word.toLowerCase();
  return LATERALITY.has(low) || SITE_STEMS.some((s) => low.startsWith(s));
}

export const COPY_MIN_WORDS = 3;
// Frequent general English words (function words, everyday vocabulary), never technical names.
const EN_COMMON = new Set([...EN_STOP, ...pySplit(`
an or but nor without to in on at as onto over under during within about above below through than then who whom
whose what when where why how be being do does did can could may might must should would will shall no all any some
each every both more most less least other such only also very its it they them there here we our you your he she
his her if so per via while because although though since until upon whether either neither same
right left upper lower total partial whole half single double main major minor high low new old first last long
great little own big small large next early young important few public bad good well able please just now even back
still never always often usually again however today different similar various several many much time person year
way day thing man world life hand part child eye woman place work week case point number group problem fact say get
make go know take see seen come think look want give use find tell ask seem feel try leave call show shows shown
note notes`)]);
const LINK_RE = compile(String.raw`\S*(?:://|@|www\.)\S*`);

/** [word or null, start, end] per word of text; null for what never counts as a copied English word. */
function runWords(text, tokens) {
  const masked = [];
  for (const t of tokens) for (const m of tokenRx(t).finditer(text)) masked.push(m.span());
  for (const rx of [QUOTED_RE, TITLE_RUN_RE, LINK_RE]) for (const m of rx.finditer(text)) masked.push(m.span());
  const out = [];
  for (const m of WORD_RE.finditer(text)) {
    const w = m.group(0);
    const english = pyIsAscii(w) && pyIsAlpha(w) && !masked.some(([a, b]) => a < m.end() && m.start() < b);
    out.push([english ? w : null, m.start(), m.end()]);
  }
  return out;
}

/** English fragments copied word for word from the source into the output (COPY_MIN_WORDS or more English words in a
 * row that also follow each other in the source, one of them a frequent lower-case word or a side / site word). */
export function copiedEnglish(srcPlain, outPlain) {
  const tokens = protectedTokens(srcPlain);
  const where = new Map();
  runWords(srcPlain, tokens).forEach(([w], j) => {
    if (!w) return;
    const k = w.toLowerCase();
    if (!where.has(k)) where.set(k, []);
    where.get(k).push(j);
  });
  const words = runWords(outPlain, tokens);
  const ends = [];
  let prev = new Map();
  for (const [w] of words) {
    const cur = new Map();
    if (w) for (const j of where.get(w.toLowerCase()) || []) cur.set(j, (prev.get(j - 1) || 0) + 1);
    ends.push(cur.size ? Math.max(...cur.values()) : 0);
    prev = cur;
  }
  const found = [];
  let i = words.length - 1;
  while (i >= 0) {
    const n = ends[i];
    if (n < COPY_MIN_WORDS) {
      i -= 1;
      continue;
    }
    const run = words.slice(i - n + 1, i + 1);
    if (run.some(([w]) => (pyIsLower(w) && cpLen(w) > 1 && EN_COMMON.has(w)) || siteWord(w))) {
      found.push(outPlain.slice(run[0][1], run[run.length - 1][2]));
    }
    i -= n;
  }
  return found.reverse();
}

/** A word in lower case with its plural / singular (-s, -es). */
function forms(word) {
  const w = word.toLowerCase();
  const out = new Set([w, w + "s", w + "es"]);
  if (w.endsWith("es")) out.add(w.slice(0, -2));
  if (w.endsWith("s")) out.add(w.slice(0, -1));
  return out;
}

const meets = (a, b) => [...a].some((x) => b.has(x));

/** True when the text has a Vietnamese letter (a letter with a diacritic, or d with a stroke). */
export function vietnamese(text) {
  return Array.from(text).some((ch) => isAlpha(ch) && (ch === "\u0111" || ch === "\u0110" || ch.normalize("NFD") !== ch));
}

/** Single English words copied from the source into an otherwise Vietnamese answer ("Hepatocyte ..."). */
export function singleEnglish(srcPlain, outPlain, terms = []) {
  if (!vietnamese(outPlain)) return [];
  const tokens = protectedTokens(srcPlain);
  const srcWords = runWords(srcPlain, tokens).map(([w]) => w).filter(Boolean);
  const lowerSrc = new Set(srcWords.filter((w) => isLowerCh(w[0])).map((w) => w.toLowerCase()));
  const anySrc = new Set(srcWords.map((w) => w.toLowerCase()));
  const keys = new Set([...terms].map((t) => t.toLowerCase()));
  const words = runWords(outPlain, tokens);
  const capitalCopy = (j, a, b) => {
    if (!(j >= 0 && j < words.length) || !words[j][0]) return false;
    const w = words[j][0];
    return isUpperCh(w[0]) && meets(forms(w), anySrc) && !hasNonSpace(outPlain.slice(a, b));
  };
  const found = [];
  words.forEach(([w, s, e], i) => {
    if (!w || cpLen(w) < 3 || isValid(w) || !meets(forms(w), lowerSrc)) return;
    if (capitalCopy(i - 1, i ? words[i - 1][2] : s, s) ||
      capitalCopy(i + 1, e, i + 1 < words.length ? words[i + 1][1] : e)) return;
    if ((pyIsLower(w) && EN_COMMON.has(w)) || siteWord(w) || meets(forms(w), keys)) found.push(w);
  });
  return found;
}

/** English copied from the source: the runs of copiedEnglish, then the single words not part of a run. */
export function englishCopies(srcPlain, outPlain, terms = []) {
  const runs = copiedEnglish(srcPlain, outPlain);
  const inRuns = new Set(runs.flatMap((r) => ASCII_WORDS_RE.findall(r).map((w) => w.toLowerCase())));
  return runs.concat(singleEnglish(srcPlain, outPlain, terms).filter((w) => !inRuns.has(w.toLowerCase())));
}

// LaTeX / math markup (spec Amendment E): a command that stands for one symbol is written as that symbol by
// fixLatex; anything else stays for the sanity gate.
export const LATEX_SYMBOLS = new Map(Object.entries({
  alpha: "\u03b1", beta: "\u03b2", gamma: "\u03b3", delta: "\u03b4", epsilon: "\u03b5",
  varepsilon: "\u03b5", zeta: "\u03b6", eta: "\u03b7", theta: "\u03b8", iota: "\u03b9", kappa: "\u03ba",
  lambda: "\u03bb", mu: "\u03bc", nu: "\u03bd", xi: "\u03be", pi: "\u03c0", rho: "\u03c1",
  sigma: "\u03c3", tau: "\u03c4", upsilon: "\u03c5", phi: "\u03c6", varphi: "\u03c6", chi: "\u03c7",
  psi: "\u03c8", omega: "\u03c9", Gamma: "\u0393", Delta: "\u0394", Theta: "\u0398", Lambda: "\u039b",
  Xi: "\u039e", Pi: "\u03a0", Sigma: "\u03a3", Upsilon: "\u03a5", Phi: "\u03a6", Psi: "\u03a8",
  Omega: "\u03a9",
  rightarrow: "\u2192", to: "\u2192", longrightarrow: "\u2192", leftarrow: "\u2190", gets: "\u2190",
  leftrightarrow: "\u2194", Rightarrow: "\u21d2", Leftarrow: "\u21d0", Leftrightarrow: "\u21d4",
  uparrow: "\u2191", downarrow: "\u2193",
  ge: "\u2265", geq: "\u2265", le: "\u2264", leq: "\u2264", ne: "\u2260", neq: "\u2260",
  approx: "\u2248", sim: "~", times: "\u00d7", pm: "\u00b1", mp: "\u2213", cdot: "\u00b7",
  div: "\u00f7", infty: "\u221e", circ: "\u00b0", degree: "\u00b0", ldots: "\u2026", dots: "\u2026",
}));
const LATEX_OTHER = new Set(("frac dfrac tfrac sqrt text textrm textit textbf mathrm mathbf mathit mathsf operatorname " +
  "left right big Big quad qquad sum prod int lim log ln exp").split(" "));
const LATEX_RE = compile(String.raw`\$([^$\n]{1,80}?)\$|\\([A-Za-z]+)|[\^_]\{[^{}\n]*\}`);
const MATH_MARK_RE = compile(String.raw`[\\^_{]`);
const DEGREE_RE = compile(String.raw`\^\s*\{?\s*\\circ\s*\}?`);
const COMMAND_RE = compile(String.raw`\\([A-Za-z]+)`);
const LEFT_MARK_RE = compile(String.raw`[\\^_{}]`);

/** LaTeX / math pieces of a text, in order. */
export function latexMarkup(text) {
  const found = [];
  for (const m of LATEX_RE.finditer(text)) {
    if (m.group(1) !== null) {
      if (MATH_MARK_RE.search(m.group(1))) found.push(m.group(0));
    } else if (m.group(2) === null || LATEX_SYMBOLS.has(m.group(2)) || LATEX_OTHER.has(m.group(2))) {
      found.push(m.group(0));
    }
  }
  return found;
}

/** LaTeX / math pieces of the output that the source does not have. */
export function newLatex(srcPlain, outPlain) {
  return latexMarkup(outPlain).filter((p) => !srcPlain.includes(p));
}

function latexSymbol(name, srcPlain) {
  if (name === "mu" && srcPlain.includes("\u00b5")) return "\u00b5"; // the micro sign, as the source writes it
  return LATEX_SYMBOLS.has(name) ? LATEX_SYMBOLS.get(name) : null;
}

/** Write LaTeX symbol markup that the source does not have as the symbols; other markup and markup the source has
 * stay as they are. Tags are kept. */
export function fixLatex(srcPlain, out) {
  const convert = (content) => {
    let text = DEGREE_RE.sub("\u00b0", content).replaceAll("\\%", "%");
    text = COMMAND_RE.sub((m) => latexSymbol(m.group(1), srcPlain) || m.group(0), text);
    return LEFT_MARK_RE.search(TOKEN_RE.sub("", text)) ? null : text;
  };
  return LATEX_RE.sub((m) => {
    const piece = m.group(0);
    if (srcPlain.includes(piece)) return piece;
    if (m.group(1) !== null) {
      const text = MATH_MARK_RE.search(m.group(1)) ? convert(m.group(1)) : null;
      return text === null ? piece : text;
    }
    if (m.group(2) !== null) return latexSymbol(m.group(2), srcPlain) || piece;
    return piece;
  }, out);
}

// Clauses of a specimen line or a list ("Site, procedure --- Diagnosis & finding"; "a; b"): the length gate per clause
const CLAUSE_SEP_RE = compile(String.raw`\s*(?:-{2,}|\u2014|\u2013|;|\|)\s*`);
export const OMIT_MIN_LETTERS = 20;
export const OMIT_RATIO = 0.5;

/** Source clauses whose translation is far too short (same 2+ clauses on both sides). */
export function omittedClauses(srcPlain, outPlain) {
  const letters = (t) => Array.from(t).filter(isAlpha).length;
  const src = CLAUSE_SEP_RE.split(srcPlain).map((c) => pyStrip(c)).filter((c) => c);
  const out = CLAUSE_SEP_RE.split(outPlain).map((c) => pyStrip(c)).filter((c) => c);
  if (src.length < 2 || src.length !== out.length) return [];
  return src.filter((s, k) => letters(s) >= OMIT_MIN_LETTERS && letters(out[k]) < OMIT_RATIO * letters(s));
}

function numbers(text) {
  return NUM_RE.findall(text).map((n) => n.replaceAll(",", ".")).sort(cmpStr);
}

const MONTHS = new Map(Object.entries({ january: "1", jan: "1", february: "2", feb: "2", march: "3", mar: "3",
  april: "4", apr: "4", may: "5", june: "6", jun: "6", july: "7", jul: "7", august: "8", aug: "8", september: "9",
  sept: "9", sep: "9", october: "10", oct: "10", november: "11", nov: "11", december: "12", dec: "12" }));
const MONTH_RE = compile("(?<![A-Za-z])(" + [...MONTHS.keys()].sort((x, y) => y.length - x.length).join("|") +
  ")(?![A-Za-z])", "i");

/** True when the output's numbers are not the source's; an English month name of the source may come back as its
 * number ("1-3 November 2026" -> "1-3 tháng 11 năm 2026"), once per name. */
export function numbersChanged(srcPlain, outPlain) {
  const a = numbers(srcPlain);
  const b = numbers(outPlain);
  for (const name of MONTH_RE.findall(srcPlain)) {
    const n = MONTHS.get(name.toLowerCase());
    if (b.filter((x) => x === n).length > a.filter((x) => x === n).length) b.splice(b.indexOf(n), 1);
  }
  return a.length !== b.length || a.some((x, k) => x !== b[k]);
}

/** Syllable-boundary wrapper: a Vietnamese term never starts or ends in the middle of a word. */
function wb(pattern) {
  return compile(String.raw`(?<!\w)(?:` + pattern + String.raw`)(?!\w)`, "i");
}

const TAG_RE = compile(String.raw`</?[A-Za-z][^<>]*>`);
const PAREN_RE = compile(String.raw`\s*(\([^()]*\))`);

function startsSentence(text, pos) {
  const before = pyRstrip(TAG_RE.sub("", text.slice(0, pos)), " \t");
  return before === "" || ".!?:\n".includes(lastCp(before));
}

/** Grow the span [s, e) over canonical words already sitting next to a wrong-form match. */
function extend(text, s, e, vi, lo) {
  const words = pySplit(vi);
  let ls = s;
  let reEnd = e;
  for (let k = words.length; k > 0; k--) {
    const pat = String.raw`(?<!\w)` + words.slice(0, k).map(escape).join(String.raw`\s+`) + String.raw`\s+\Z`;
    const m = compile(pat, "i").search(text.slice(lo, s));
    if (m) {
      ls = lo + m.start();
      break;
    }
  }
  const tail = text.slice(e);
  const pm = PAREN_RE.match(tail);
  if (pm && vi.toLowerCase().endsWith(pm.group(1).toLowerCase())) {
    reEnd = e + pm.end();
  } else {
    for (let k = words.length; k > 0; k--) {
      const pat = String.raw`\s+` + words.slice(-k).map(escape).join(String.raw`\s+`) + String.raw`(?!\w)`;
      const m = compile(pat, "i").match(tail);
      if (m) {
        reEnd = e + m.end();
        break;
      }
    }
  }
  return [ls, reEnd];
}

/** out with every match of rx (outside the canonical spans) replaced by vi; each [text found, text written] pair is
 * added to done. */
function replaceWrong(rx, out, vi, canonSpans, done) {
  const parts = [];
  let pos = 0;
  for (const m of rx.finditer(out)) {
    const [s, e] = m.span();
    if (s < pos || canonSpans.some(([a, b]) => a <= s && e <= b)) continue;
    const [ls, reEnd] = extend(out, s, e, vi, pos);
    const word = out.slice(ls, reEnd);
    let rep;
    if (cpLen(word) > 1 && pyIsUpper(word)) rep = vi.toUpperCase();
    else if (isUpperCh(firstCp(word)) && startsSentence(out, ls)) rep = firstCp(vi).toUpperCase() + vi.slice(firstCp(vi).length);
    else rep = vi;
    parts.push(out.slice(pos, ls), rep);
    done.push([word, rep]);
    pos = reEnd;
  }
  parts.push(out.slice(pos));
  return parts.join("");
}

/** Add one fix row {en, from, to} to log unless it is there already. */
function logFix(log, en, found, written) {
  if (!log.some((r) => r.en === en && r.from === found && r.to === written)) log.push({ en, from: found, to: written });
}

/** Source-gated, idempotent VN->VN replacement of known wrong variants (term-lock). fixes: TermFix-like {en, vi,
 * wrong}. Returns [text, applied English keys]. With an array log, every replacement not logged yet is added as
 * {en: the fix's English key, from: the text found (the whole replaced span), to: the text written}. */
export function applyTermFixes(out, srcPlain, fixes, log = null) {
  out = nfc(out);
  const srcLow = nfc(srcPlain).toLowerCase();
  const applied = [];
  for (const fx of [...fixes].sort((a, b) => cpLen(b.vi) - cpLen(a.vi))) {
    const need = compile(bounded(nfc(fx.en)), "i").findall(srcLow).length;
    if (!need) continue;
    const vi = nfc(fx.vi);
    const canon = vi ? wb(escape(vi)) : null; // empty vi = pure deletion fix
    const wrongs = [...fx.wrong].sort((a, b) => cpLen(b) - cpLen(a)).map((w) => wb(nfc(w)));
    if (canon) {
      const wspans = [];
      for (const rx of wrongs) for (const m of rx.finditer(out)) wspans.push(m.span());
      let present = 0;
      for (const m of canon.finditer(out)) if (!wspans.some(([a, b]) => a < m.end() && m.start() < b)) present++;
      if (present >= need) continue;
    }
    let hit = false;
    for (const rx of wrongs) {
      const spans = canon ? [...canon.finditer(out)].map((m) => m.span()) : [];
      const done = [];
      const next = replaceWrong(rx, out, vi, spans, done);
      if (next !== out) {
        hit = true;
        out = next;
        for (const [found, written] of done) if (log && found !== written) logFix(log, fx.en, found, written);
      }
    }
    if (hit) applied.push(fx.en);
  }
  return [out, applied];
}

// Vietnamese academic titles go before the name, highest first, with a dot after each (his rule): GS. / PGS. (academic
// rank), TS. (doctorate), ThS. (master), then BS. / CN. / KS. (first degrees); equal ranks keep their order.
export const TITLE_RANK = new Map([["GS", 0], ["PGS", 0], ["TS", 1], ["ThS", 2], ["BS", 3], ["CN", 3], ["KS", 3]]);
export const TITLE_FIX = "title-order"; // the "en" of its log rows and its term_fix flag
const ACADEMIC_RUN_RE = compile(String.raw`(?<![\w.\-])(?:(?:PGS|GS|ThS|TS|BS|CN|KS)\.?[ \t]+)+(?=(?:<g\d+>)*[^\W\d_])`);
const ACADEMIC_RE = compile("PGS|GS|ThS|TS|BS|CN|KS");
const NAME_AFTER_RE = compile(String.raw`(?:<g\d+>)*([^\W\d_][\w'\u2019\-]*)`);

/** [text, applied]: each run of Vietnamese academic titles (TITLE_RANK) written right before a capitalised name (a
 * word with a capital first letter and a lower-case letter; opening tags may come between) is written in TITLE_RANK
 * order, each title once, with a dot after each: "BS TS Jane Doe" -> "TS. BS. Jane Doe". Titles after a name, titles
 * split by a tag, a comma or a hyphen, and every other word stay as they are. applied = [TITLE_FIX] when a run
 * changed; with an array log, every rewrite not logged yet is added as {en: TITLE_FIX, from: the run, to: the run
 * written}. */
export function fixTitleOrder(out, log = null) {
  const parts = [];
  let pos = 0;
  for (const m of ACADEMIC_RUN_RE.finditer(out)) {
    const name = NAME_AFTER_RE.match(out, m.end()).group(1);
    if (!isUpperCh(firstCp(name)) || pyIsUpper(name)) continue;
    const run = pyRstrip(m.group(0), " \t");
    const titles = ACADEMIC_RE.findall(run);
    const order = [...new Set([...titles].sort((a, b) => TITLE_RANK.get(a) - TITLE_RANK.get(b)))];
    if (order.length === titles.length && order.every((t, k) => t === titles[k]) &&
      run.split(".").length - 1 === titles.length) continue;
    const written = order.map((t) => t + ".").join(" ");
    parts.push(out.slice(pos, m.start()), written);
    pos = m.start() + run.length;
    if (log) logFix(log, TITLE_FIX, run, written);
  }
  if (!parts.length) return [out, []];
  parts.push(out.slice(pos));
  return [parts.join(""), [TITLE_FIX]];
}

// Acronyms and codes the output must keep (HER2, CCRCC, ChRCC, UCa, 22q11.2, NM_000546.6, p.V600E).
const ALNUM_RE = compile(String.raw`(?<![A-Za-z0-9])[A-Za-z0-9]+(?![A-Za-z0-9])`);
const HGVS_RE = compile(String.raw`(?<![\w.])(?:[cgmnpr]\.[A-Za-z0-9_*>+\-]*[A-Za-z0-9*>]|N[MRPGC]_\d+(?:\.\d+)?` +
  String.raw`|(?:\d{1,2}|[XY])?[pq]\d+(?:\.\d+)+)(?![\w])`);
const NOT_TOKENS = new Set(pySplit(
  "MD PHD JD BSC MSC MBBS MBCHB DPHIL MPH MBA DO RN DDS DMD BS MS MA BA FRCPATH FRCPA FRCP FRCS MRCP FIBMS FFSC " +
  "FAHMS FACP FCAP PHARMD JAN FEB MAR APR MAY JUN JUL AUG SEP SEPT OCT NOV DEC NO YES OK VS AND OR THE OF IN ON TO " +
  "BY AT FOR NOT ALL NEW NOTE US UK USA EU HCMC LN LNS"));
const ROMAN_RE = compile("^[IVX]+$");
// ordinals, ages, number + unit (19th, 65yo, 65fmol, mm2), multipliers and sizes (x2, 9x17)
const COUNT_RE = compile(String.raw`^(?:\d+[a-z]{2,}|\d+[xyhd]|x\d+|\d+x\d+|[cmun]?m[23])$`, "i");
const LETTER_DIGIT_RE = compile(String.raw`[a-z]\d|\d[a-z]`);
const LETTERS3_RE = compile("[A-Za-z]{3,}");
const PLURAL_ACRONYM_RE = compile("[A-Z]{2,}s");

function isAcronym(tok, shouting) {
  const chars = Array.from(tok);
  const letters = chars.filter(isAlpha);
  const upper = letters.filter(isUpperCh).length;
  if (!letters.length || NOT_TOKENS.has(tok.toUpperCase()) || ROMAN_RE.match(tok) || COUNT_RE.match(tok)) return false;
  if (chars.some(isDigit)) return upper >= 1 || (LETTER_DIGIT_RE.search(tok) !== null && letters.length <= 4);
  if (upper < 2 || upper < letters.length - upper || letters.length > 7) return false;
  if (pyIsUpper(tok)) {
    if (shouting || NOT_TOKENS.has(pyRstrip(tok, "S").toUpperCase())) return false;
    return !(cpLen(tok) >= 5 && chars.filter((c) => "AEIOU".includes(c)).length >= 2);
  }
  return true; // mixed case: ChRCC, TcRCC, UCa, LNs, PTCs
}

/** Acronyms and codes of the source, first occurrence order, no duplicates. */
export function protectedTokens(srcPlain) {
  const words = LETTERS3_RE.findall(srcPlain);
  const caps = words.filter(pyIsUpper);
  const shouting = caps.length >= 2 && 2 * caps.length >= words.length;
  const found = [...HGVS_RE.finditer(srcPlain)].map((m) => m.group(0));
  const covered = [...HGVS_RE.finditer(srcPlain)].map((m) => m.span());
  for (const m of ALNUM_RE.finditer(srcPlain)) {
    if (!covered.some(([a, b]) => a <= m.start() && m.start() < b) && isAcronym(m.group(0), shouting)) found.push(m.group(0));
  }
  return [...new Set(found)];
}

/** Case-insensitive whole-token pattern; a hyphen or space may come between letters and digits or before a capital,
 * a plural acronym may come back singular. */
function tokenRx(tok) {
  let tail = "";
  if (PLURAL_ACRONYM_RE.fullmatch(tok)) {
    tok = tok.slice(0, -1);
    tail = "s?";
  }
  const parts = [];
  let prev = "";
  for (const ch of tok) {
    if (isAlnum(prev) && isAlnum(ch) && (isAlpha(prev) !== isAlpha(ch) || (isLowerCh(prev) && isUpperCh(ch)))) {
      parts.push(String.raw`[-\s]?`);
    }
    parts.push(escape(ch));
    prev = ch;
  }
  return compile("(?<![A-Za-z0-9])" + parts.join("") + tail + "(?![A-Za-z0-9])", "i");
}

/** Acronyms / codes of the source that the output does not contain (case-insensitive, whole tokens). */
export function missingTokens(srcPlain, outPlain) {
  return protectedTokens(srcPlain).filter((t) => !tokenRx(t).search(outPlain));
}

/** Glossary keys (hits: [en, vi] pairs) found in the source whose Vietnamese the output lacks. */
export function glossaryMisses(srcPlain, outPlain, hits) {
  const lowSrc = srcPlain.toLowerCase();
  const lowOut = outPlain.toLowerCase();
  return hits.filter(([en, vi]) => compile(bounded(en)).search(lowSrc) && !lowOut.includes(vi.toLowerCase()))
    .map(([en]) => en);
}

/** Invalid-looking Vietnamese tokens, ignoring words copied from the source (eponyms) and the words of allowed (an
 * array or Set of lower-case words: the words of the active packs' Vietnamese values that are no regular syllable,
 * packs.allowedWords) in any case. */
export function suspiciousTokens(outPlain, srcPlain = "", allowed = []) {
  const srcLow = srcPlain.toLowerCase();
  const allow = allowed instanceof Set ? allowed : new Set(allowed);
  return suspicious(outPlain).filter((t) => !srcLow.includes(t.toLowerCase()) && !allow.has(t.toLowerCase()));
}
