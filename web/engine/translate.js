// Translate one segment: prompt, model call, tag ladder L0-L5, sanity gate, deterministic finishing, translation
// memory (port of helper/vitranslate/translate.py; the same prompt strings byte for byte).
//
// The model is injected: an async function (messages, options) -> answer, where messages = [{role: "system",
// content}, {role: "user", content}] and options = {temperature: 0, maxTokens, think: false, signal} -- what the
// helper sends Ollama (temperature 0 = greedy, num_predict = min(4096, 64 + 2 * len(user)), "think": false). The
// answer is the text, or {text, truncated}: an answer cut off at maxTokens must come back as "" or {truncated: true}
// (the helper treats Ollama's done_reason "length" as an empty answer). A model error becomes a ModelError;
// core.translateSegments retries the segment once.
//
// Runtime-agnostic (browser, Cloudflare workerd, Node): no DOM here. A segment is anything with {tagged, spans:
// Map(id -> span), reduced(keep), plain}: the OOXML codec's Segment in the client, or a TaggedSegment built from
// plain data ({tagged, essential ids}) wherever the paragraph XML is not at hand.
import { compile, escape } from "./pyre.js";
import * as qa from "./qa.js";
import { TOKEN_RE, check, ids, normalizeTokens, repair, restoreSpaces, strayMarkup, stripTags } from "./tags.js";
import { tmKey, sha256Hex } from "./tm.js";
import { pyStrip, pyLstrip, pyRstrip, pySplit, pyInt, cpLen, firstCp, lastCp, nextIndex, isAlnum, isAlpha, isDigit,
  isLowerCh, pyIsUpper, latinGreekName } from "./py.js";

// Part of the TM key. The TM stores the text before finishing, so this must change whenever the prompts, the ladder,
// the gate, qa.stripLeaks or tags.repair change what that text would be.
export const TRANSLATOR_VERSION = "8";
export const MAX_TAGS = 12;
export const MAX_SPAN_CALLS = 8; // model calls for span phrases at L4, per segment
export const SHORT_WORDS = 7; // sources shorter than this are sent without neighbour context
export const EMPTY = "empty answer";

// No "..." inside example tags: the model copies "<g1>...</g1>" into answers that have no tags.
export const TAG_RULES = [
  "The text may contain inline formatting tag pairs such as <g1>\u2026</g1> and placeholders such as <x1/>.",
  "Rules:",
  "- Keep EVERY tag and placeholder exactly once, with the same number. Put each tag pair around the Vietnamese words",
  "  that translate the words it wraps. Word order may change; tags move with their words.",
  "- Do not add new tags. Do not translate gene names, numbers, units, codes or abbreviations.",
  "- Use the glossary translations for the listed terms.",
  "- Output ONLY the Vietnamese translation, nothing else.",
].join("\n");

export const KEEP_TAGS = "Keep these tags exactly once each, around the matching Vietnamese words: ";
export const NO_TAGS = "This text has no tags; do not add any.";
export const RETRY_TAGS = "Your previous answer broke the tags (%s). Translate again and keep every tag exactly once.";
export const RETRY_EMPTY = "You gave an empty answer. Translate the text into Vietnamese and keep every tag exactly once.";
export const RETRY_ENGLISH = "Your previous answer was still in English. Translate into Vietnamese.";
export const RETRY_ENGLISH_WORDS = "Your previous answer was:\n%s\nIt left these words in English: %s. Write that answer " +
  "again with these words translated into Vietnamese; keep the rest and every tag.";
export const ENGLISH_ISSUE = "english:";
export const RETRY_SUSPECT = "Your previous answer was not a clean translation (%s). Output only the Vietnamese " +
  "translation of the text after \"Translate:\", nothing else.";
export const RETRY_TOKENS = "Your previous answer dropped or changed these abbreviations or codes: %s. Translate again " +
  "and write each of them exactly as in the text.";
export const TOKENS_ISSUE = "acronym:";
export const RETRY_OMITTED = "Your previous answer left out part of the text: %s. Translate the whole text, every part " +
  "of it.";
export const OMITTED_ISSUE = "omitted:";
export const SPAN_PROMPT = "Translate this short phrase into Vietnamese. Output only the translation:\n";

// Sanity gate: reasons a tag-exact answer is still not a translation of its source.
export const SUSPECT_NOTES = new Map([["ratio", "its length did not match the text"],
  ["script", "it contained non-Vietnamese script"], ["scaffold", "it repeated the instructions or the context"],
  ["angle", "it added angle brackets"], ["markdown", "it added markdown"],
  ["latex", "it added LaTeX math markup (%s); write each symbol as a plain character such as \u03b2, \u2192 or \u2265"]]);
const SCAFFOLD = ["translate:", "previous paragraph", "next paragraph", "your previous answer", "vietnamese:"];
const MARKDOWN = ["```", "**", "__"];
const EMPHASIS = ["**", "__"];
const STAR_RE = compile(String.raw`(?<![*\w])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![*\w])`); // *emphasis*
const LOWER_WORD_RE = compile(String.raw`(?<![A-Za-z])[a-z]{4,}(?![A-Za-z])`);
const PAIR_RE = compile(String.raw`<g(\d+)>.*?</g\1>`, "s");
const LEAF_PAIR_RE = compile(String.raw`[ \t]*<g(\d+)>((?:(?!</?g\d+>).)*?)</g\1>`, "s");
// Code-only cells: no ASCII word of 3+ letters with 2+ lowercase ones, units aside, and no short function word.
const ASCII_WORD_RE = compile("[A-Za-z]+");
const UNITS = new Set(["mm", "cm", "ml", "mg", "kg", "ng", "um", "nm", "hpf"]);
const SMALL_WORDS = new Set(["no", "or", "of", "in", "on", "to", "at", "by", "up", "is", "an"]);
// Flag kinds that Translator.checks derives from a finished text (keep in step with it)
export const CHECK_KINDS = new Set(["formatting_lost", "tags_broken", "unchanged", "kept_english", "english_left",
  "numbers_changed", "acronym_lost", "suspect_output", "suspicious", "stray_markup", "glossary_miss", "omitted"]);
const NON_LETTERS_RE = compile("[^A-Za-z]");
const CAPS_WORD_RE = compile(String.raw`(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])`);
const ETAL_RE = compile(String.raw`\bet\s+al\b\.?`);
const VOLUME_RE = compile(String.raw`\b(?:19|20)\d\d\b[^;]{0,12};\s*\d+|\d+\(\d+\):\s*e?\d+`);
const YEAR_RE = compile(String.raw`\b(?:19|20)\d\d\b`);
const CITE_WORD_RE = compile(String.raw`[^\W\d_][\w.\-']*`);
const CITE_LOWER = new Set(["et", "al", "and", "in", "of", "de", "van", "von", "der", "le", "la"]);
const NON_WORD_RE = compile(String.raw`[\W_]+`);
const ALPHA_ONLY_RE = compile("[A-Za-z]+");

/** Python "%s" % args for the prompt templates (arguments are inserted as they are). */
export function fmt(template, ...args) {
  const parts = template.split("%s");
  let out = parts[0];
  for (let k = 1; k < parts.length; k++) out += String(args[k - 1]) + parts[k];
  return out;
}

/** The first n code points (Python s[:n]). */
function head(s, n) {
  return cpLen(s) <= n ? s : Array.from(s).slice(0, n).join("");
}

/** Python str.find(sub, start) with a negative start counted from the end. */
function pyFind(s, sub, start) {
  if (start < 0) start = Math.max(0, s.length + start);
  return s.indexOf(sub, start);
}

export class Outcome {
  constructor(text, segment, level, flags = [], cached = false) {
    this.text = text;
    this.segment = segment;
    this.level = level;
    this.flags = flags;
    this.cached = cached;
  }
}

export function buildSystem(stylePrompt, pack, hits) {
  const parts = ["You translate English documents (" + pack.name + ") into natural academic Vietnamese.", stylePrompt];
  if (pack.prompt) parts.push(pack.prompt);
  parts.push(TAG_RULES);
  if (hits.length) parts.push("Glossary (English = Vietnamese):\n" + hits.map((h) => "- " + h[0] + " = " + h[1]).join("\n"));
  return parts.filter((p) => p).join("\n\n");
}

/** The segment's own tags, listed right before the text, or a no-tags note. */
export function reminder(tagged) {
  const [g, x] = ids(tagged);
  if (!g.length && !x.length) return NO_TAGS;
  return KEEP_TAGS + [...g.map((n) => "<g" + n + ">\u2026</g" + n + ">"), ...x.map((n) => "<x" + n + "/>")].join(", ");
}

export function buildUser(tagged, prev = "", nxt = "", note = "") {
  const lines = [];
  if (prev) lines.push("Previous paragraph (context only, do not translate): " + head(prev, 300));
  if (nxt) lines.push("Next paragraph (context only, do not translate): " + head(nxt, 300));
  if (note) lines.push(note);
  lines.push(reminder(tagged));
  lines.push("Translate:\n" + tagged);
  return lines.join("\n\n");
}

/** Spans kept at ladder level 3 (bold, italic, superscript / subscript, links): a span marked {essential: true}.
 * The client decides from the run properties (ooxml/essential.js isEssentialSpan, the helper's is_essential). */
export function isEssential(span) {
  return Boolean(span && span.essential === true);
}

/** A segment as plain data: its tagged text and the ids of its essential spans (what a client sends; the same
 * spans, reduction and plain text as the OOXML codec's Segment). */
export class TaggedSegment {
  constructor(tagged, essential = []) {
    this.tagged = tagged;
    const keep = new Set(essential);
    this.spans = new Map();
    for (const n of ids(tagged)[0]) if (!this.spans.has(n)) this.spans.set(n, { essential: keep.has(n) });
  }

  get plain() {
    return stripTags(this.tagged);
  }

  /** Copy without the tags of spans where keep(span) is false (codec Segment.reduced). */
  reduced(keep) {
    const kept = new Map([...this.spans].filter(([, s]) => keep(s)));
    const out = new TaggedSegment("", []);
    out.tagged = TOKEN_RE.sub((m) => (m.group(3) !== null || kept.has(pyInt(m.group(2))) ? m.group(0) : ""), this.tagged);
    out.spans = kept;
    return out;
  }
}

/** True when no ASCII word reads as English: marker names, stages and values are kept without a model call. */
export function codeOnly(plainText) {
  for (const w of ASCII_WORD_RE.findall(plainText)) {
    const low = w.toLowerCase();
    if (UNITS.has(low)) continue;
    if (cpLen(w) >= 3 && Array.from(w).filter(isLowerCh).length >= 2) return false;
    if (SMALL_WORDS.has(low) && !pyIsUpper(w)) return false;
  }
  return true;
}

/** True for ALL-CAPS English that codeOnly would keep: two capital words of 4+ letters with 2+ vowels each, or a
 * glossary term written with lower-case letters found in it. hits: [en, vi] pairs. */
export function capsProse(plainText, hits = []) {
  const wordy = CAPS_WORD_RE.findall(plainText).filter((w) => Array.from(w).filter((c) => "AEIOU".includes(c)).length >= 2);
  if (wordy.length >= 2) return true;
  const low = plainText.toLowerCase();
  return hits.some(([en]) => en !== en.toUpperCase() && NON_LETTERS_RE.sub("", en).length >= 4 &&
    compile(String.raw`(?<![\w-])` + escape(en.toLowerCase()) + String.raw`(?![\w-])`).search(low) !== null);
}

/** A segment that is only a literature citation. References stay in English. */
export function citationOnly(plainText) {
  if (!YEAR_RE.search(plainText) || !(ETAL_RE.search(plainText) || VOLUME_RE.search(plainText))) return false;
  for (let w of CITE_WORD_RE.findall(plainText)) {
    w = pyStrip(w, ".");
    if (w && isLowerCh(firstCp(w)) && !CITE_LOWER.has(w.toLowerCase()) && !w.includes(".") &&
      !Array.from(w).some(isDigit)) return false;
  }
  return true;
}

export function spanText(tagged, n) {
  const m = compile("<g" + n + ">(.*?)</g" + n + ">", "s").search(tagged);
  return m ? stripTags(m.group(1)) : "";
}

/** Text without tags for the checks; a placeholder (line break, tab) keeps the words on its sides apart. */
export function plain(text) {
  return TOKEN_RE.sub((m) => (m.group(3) !== null ? " " : ""), text);
}

/** Equal when spaces, punctuation and case are ignored. */
export function same(a, b) {
  return NON_WORD_RE.sub("", a).toLowerCase() === NON_WORD_RE.sub("", b).toLowerCase();
}

/** True when a source with letters or digits came back without any. */
function blank(work, out) {
  return Array.from(work.plain).some(isAlnum) && !Array.from(stripTags(out)).some(isAlnum);
}

/** An invented tag pair with no letter or digit inside goes with its content and the spaces before it. */
export function dropBlankInvented(src, out) {
  const known = new Set(ids(src)[0]);
  const keep = (m) => known.has(pyInt(m.group(1))) || Array.from(m.group(2)).some(isAlnum);
  const next = LEAF_PAIR_RE.sub((m) => (keep(m) ? m.group(0) : ""), out);
  if (next === out) return out;
  return src.slice(0, src.length - pyLstrip(src).length) + pyStrip(next) + src.slice(pyRstrip(src).length);
}

/** [out, stripped]: markdown emphasis (**x**, __x__, *x*) that the source does not have is removed. */
export function stripEmphasis(src, out) {
  let stripped = false;
  for (const mark of EMPHASIS) {
    if (out.includes(mark) && !src.includes(mark)) {
      out = out.replaceAll(mark, "");
      stripped = true;
    }
  }
  if (STAR_RE.search(out) && !STAR_RE.search(src)) {
    out = STAR_RE.sub((m) => m.group(1), out);
    stripped = true;
  }
  return [out, stripped];
}

function letters(text) {
  return Array.from(text).filter(isAlpha).length;
}

/** Sanity gate reasons (length, script, scaffold, angle brackets, markdown, LaTeX). */
export function suspect(srcPlain, outPlain, context = false) {
  const reasons = [];
  const nSrc = letters(srcPlain);
  const nOut = letters(outPlain);
  const high = context ? 1.5 : 1.8;
  if ((nSrc >= 40 && !(nOut / nSrc >= 0.5 && nOut / nSrc <= high)) || (nSrc < 40 && nOut > 3 * nSrc + 10)) {
    reasons.push("ratio");
  }
  const srcChars = new Set(Array.from(srcPlain));
  if ([...new Set(Array.from(outPlain))].some((ch) => isAlpha(ch) && !srcChars.has(ch) && !latinGreekName(ch))) {
    reasons.push("script");
  }
  const lowSrc = srcPlain.toLowerCase();
  const lowOut = outPlain.toLowerCase();
  if (SCAFFOLD.some((m) => lowOut.includes(m) && !lowSrc.includes(m))) reasons.push("scaffold");
  if (["<", ">"].some((ch) => outPlain.includes(ch) && !srcPlain.includes(ch))) reasons.push("angle");
  if (MARKDOWN.some((m) => outPlain.includes(m) && !srcPlain.includes(m)) ||
    (STAR_RE.search(outPlain) && !STAR_RE.search(srcPlain))) reasons.push("markdown");
  if (qa.newLatex(srcPlain, outPlain).length) reasons.push("latex");
  return reasons;
}

export function gateNote(issues, answer = "", src = "") {
  const notes = issues.includes("english_left") ? [RETRY_ENGLISH] : [];
  const copied = issues.filter((i) => i.startsWith(ENGLISH_ISSUE)).map((i) => "\"" + i.slice(ENGLISH_ISSUE.length) + "\"");
  if (copied.length) notes.push(fmt(RETRY_ENGLISH_WORDS, answer, copied.join(", ")));
  const latex = [...new Set(qa.newLatex(src, plain(answer)))].map((p) => "\"" + p + "\"").join(", ");
  const reasons = issues.filter((i) => SUSPECT_NOTES.has(i))
    .map((i) => (i === "latex" ? fmt(SUSPECT_NOTES.get(i), latex) : SUSPECT_NOTES.get(i)));
  if (reasons.length) notes.push(fmt(RETRY_SUSPECT, reasons.join("; ")));
  const tokens = issues.filter((i) => i.startsWith(TOKENS_ISSUE)).map((i) => i.slice(TOKENS_ISSUE.length));
  if (tokens.length) notes.push(fmt(RETRY_TOKENS, tokens.join(", ")));
  const leftOut = issues.filter((i) => i.startsWith(OMITTED_ISSUE)).map((i) => "\"" + i.slice(OMITTED_ISSUE.length) + "\"");
  if (leftOut.length) notes.push(fmt(RETRY_OMITTED, leftOut.join(", ")));
  return notes.join(" ");
}

/** Info flags naming why a gate retry was made. */
export function retried(issues) {
  const english = issues.map((i) => i === "english_left" || i.startsWith(ENGLISH_ISSUE));
  return (english.some(Boolean) ? ["retried:english"] : []).concat(english.every(Boolean) ? [] : ["retried:gate"]);
}

/** Bad results stay out of the TM, so the next run tries again. */
export function cacheable(level, flags) {
  return !flags.some((f) => ["english_left", "unchanged", "tags_broken", "empty_output"].includes(f) ||
    f.startsWith("suspect_output:") || f.startsWith(OMITTED_ISSUE) || (f === "formatting_lost" && level === 5));
}

/** True when index i falls between two letters / digits of one word (tags ignored, placeholders separate). */
function splitsWord(text, i) {
  return isAlnum(lastCp(plain(text.slice(0, i)))) && isAlnum(firstCp(plain(text.slice(i))));
}

/** [left, right]: whether span n starts / ends inside a word of the source. */
export function sourceSplits(tagged, n) {
  const o = tagged.indexOf("<g" + n + ">");
  const close = "</g" + n + ">";
  const c = pyFind(tagged, close, o) + close.length;
  return [splitsWord(tagged, o), splitsWord(tagged, c)];
}

/** First case-insensitive occurrence of target outside every tag token and every existing pair that cuts a word only
 * on a side where the source span did, or null. */
export function findFree(text, target, splitLeft = false, splitRight = false) {
  const taken = [...TOKEN_RE.finditer(text)].map((m) => m.span()).concat([...PAIR_RE.finditer(text)].map((m) => m.span()));
  const pattern = compile(escape(target), "i");
  let m = pattern.search(text);
  while (m !== null) {
    if (!taken.some(([s, e]) => s < m.end() && m.start() < e) && (splitLeft || !splitsWord(text, m.start())) &&
      (splitRight || !splitsWord(text, m.end()))) return m;
    if (m.start() >= text.length) return null; // Python would search the same place forever
    m = pattern.search(text, nextIndex(text, m.start()));
  }
  return null;
}

function answerText(answer) {
  if (answer === null || answer === undefined) return "";
  if (typeof answer === "string") return answer;
  if (answer.truncated) return "";
  return answer.text || "";
}

/** The model could not answer (the helper's LLMError): thrown by the model function, wrapped here. The job retries
 * the segment once, then fails with code "model_failed". */
export class ModelError extends Error {
  constructor(message, cause = undefined) {
    super(message);
    this.name = "ModelError";
    this.code = "model_failed";
    if (cause !== undefined) this.cause = cause;
  }
}

/** The job was stopped through its AbortSignal. */
export function abortError() {
  const err = new Error("The translation was stopped.");
  err.name = "AbortError";
  err.code = "aborted";
  return err;
}

const isAbort = (err) => Boolean(err) && (err.name === "AbortError" || err.code === "aborted");

export class Translator {
  /** model: async (messages, options) -> answer (see the module notes); system: the system prompt; modelKey /
   * packKey: parts of the TM key; fixes: term fixes {en, vi, wrong} (term-lock); hits: [en, vi] glossary hits; tm:
   * {get, put} or null; signal: AbortSignal checked before every model call; essential: which spans level 3 keeps
   * (default: spans marked {essential: true}, as TaggedSegment builds them). */
  constructor({ model, system, modelKey, packKey, fixes = [], hits = [], tm = null, signal = null,
    essential = isEssential }) {
    this.model = model;
    this.system = system;
    this.modelKey = modelKey;
    this.packKey = packKey;
    this.fixes = [...fixes];
    this.hits = hits.map((h) => [h[0], h[1]]);
    this.tm = tm;
    this.signal = signal;
    this.essential = essential;
    this._systemHash = null;
    // glossary terms kept in English (vi == en) never count as English left
    this._kept = this.hits.filter(([en, vi]) => pyStrip(en) && pyStrip(en).toLowerCase() === pyStrip(vi).toLowerCase())
      .map(([en]) => compile(String.raw`(?<!\w)` + escape(pyStrip(en)) + String.raw`(?!\w)`, "i"));
    // single-word glossary keys whose Vietnamese does not contain them: left in English, they are English left
    this._terms = new Set(this.hits.filter(([en, vi]) => ALPHA_ONLY_RE.fullmatch(pyStrip(en)) &&
      !compile("(?<![A-Za-z])" + escape(pyStrip(en).toLowerCase()) + "(?![A-Za-z])").search(vi.toLowerCase()))
      .map(([en]) => pyStrip(en).toLowerCase()));
  }

  async systemHash() {
    if (this._systemHash === null) this._systemHash = (await sha256Hex(this.system)).slice(0, 12);
    return this._systemHash;
  }

  async _chat(user) {
    if (this.signal && this.signal.aborted) throw abortError();
    const messages = [{ role: "system", content: this.system }, { role: "user", content: user }];
    const options = { temperature: 0, maxTokens: Math.min(4096, 64 + 2 * cpLen(user)), think: false, signal: this.signal };
    let answer;
    try {
      answer = await this.model(messages, options);
    } catch (err) {
      if (isAbort(err) || (this.signal && this.signal.aborted)) throw abortError();
      if (err instanceof ModelError) throw err;
      throw new ModelError(String((err && err.message) || err), err);
    }
    return answerText(answer);
  }

  _ask(tagged, prev, nxt, note = "") {
    return this._chat(buildUser(tagged, prev, nxt, note));
  }

  _withoutKept(srcPlain, outPlain) {
    for (const rx of this._kept) {
      srcPlain = rx.sub(" ", srcPlain);
      outPlain = rx.sub(" ", outPlain);
    }
    return [srcPlain, outPlain];
  }

  _englishLeft(srcPlain, outPlain) {
    return qa.englishLeft(...this._withoutKept(srcPlain, outPlain));
  }

  _copied(srcPlain, outPlain) {
    return qa.englishCopies(...this._withoutKept(srcPlain, outPlain), this._terms);
  }

  _unchanged(srcPlain, outPlain) {
    const [src, out] = this._withoutKept(srcPlain, outPlain);
    return same(src, out) && Array.from(src).some(isAlpha);
  }

  static problems(work, out) {
    return check(work.tagged, out).concat(blank(work, out) ? [EMPTY] : []);
  }

  _issues(work, out, context) {
    const src = plain(work.tagged);
    const pl = plain(out);
    const english = this._unchanged(src, pl) || this._englishLeft(src, pl);
    const copied = english ? [] : this._copied(src, pl).map((c) => ENGLISH_ISSUE + c);
    return (english ? ["english_left"] : []).concat(copied, suspect(src, pl, context),
      qa.missingTokens(src, pl).map((t) => TOKENS_ISSUE + t), qa.omittedClauses(src, pl).map((c) => OMITTED_ISSUE + c));
  }

  /** [text, repaired] when tags are right, possibly after level-1 repair; [null, false] otherwise. */
  _tagfix(work, raw) {
    const out = qa.stripLeaks(work.tagged, raw);
    if (!Translator.problems(work, out).length) return [out, false];
    const fixed = repair(work.tagged, dropBlankInvented(work.tagged, normalizeTokens(out, work.tagged)));
    if (!Translator.problems(work, fixed).length) return [fixed, true];
    return [null, false];
  }

  /** Candidate translations of a span's text, cheapest first: the text as it is, its glossary entry, then one model
   * call (memoised per segment; no more calls once budget[0] reaches MAX_SPAN_CALLS). */
  async *_spanTargets(text, memo, budget) {
    const t = pyStrip(text);
    if (!t) return;
    yield t;
    if (!/[a-z]/.test(t)) return;
    for (const [en, vi] of this.hits) if (en.toLowerCase() === t.toLowerCase()) yield vi;
    if (!memo.has(t)) {
      if (budget[0] >= MAX_SPAN_CALLS) return;
      budget[0] += 1;
      memo.set(t, pyStrip(stripTags(qa.stripLeaks(t, await this._chat(SPAN_PROMPT + t)))));
    }
    if (memo.get(t)) yield memo.get(t);
  }

  /** Levels 4-5: translate without <g> tags, drop markdown emphasis, apply term fixes, then wrap each span's own
   * translation where found verbatim. [text, level]; level 3 when no span is left to re-attach, [null, null] for an
   * empty answer. */
  async _reattach(work, prev, nxt, flags) {
    const plainSrc = stripTags(work.tagged, true);
    const raw = qa.stripLeaks(plainSrc, await this._ask(plainSrc, prev, nxt));
    let out = repair(plainSrc, dropBlankInvented(plainSrc, normalizeTokens(raw, plainSrc)));
    let stripped;
    [out, stripped] = stripEmphasis(plainSrc, out); // before the span search: "**pulmon**" must match
    if (blank(work, out)) return [null, null];
    if (stripped) flags.push("suspect_output:markdown");
    let applied;
    [out, applied] = qa.applyTermFixes(out, plain(work.tagged), this.fixes);
    flags.push(...applied.map((a) => "term_fix:" + a));
    if (!work.spans.size) return [out, 3];
    const memo = new Map();
    const budget = [0];
    let found = 0;
    for (const n of [...work.spans.keys()].sort((a, b) => a - b)) {
      const splits = sourceSplits(work.tagged, n);
      let m = null;
      for await (const target of this._spanTargets(spanText(work.tagged, n), memo, budget)) {
        m = findFree(out, target, ...splits);
        if (m !== null) break;
      }
      if (m === null) continue;
      out = out.slice(0, m.start()) + "<g" + n + ">" + m.group(0) + "</g" + n + ">" + out.slice(m.end());
      found += 1;
    }
    return [out, found === 0 ? 5 : 4];
  }

  /** The check flags (kinds in CHECK_KINDS) of a text that replaces a finished translation. */
  recheck(work, out) {
    return this.checks(work, out);
  }

  /** Flags for a finished text: missing spans as formatting_lost, stray markup as stray_markup, any other check()
   * failure as tags_broken, and the English / numbers / acronym / sanity / glossary / omission checks. */
  checks(work, out, context = false) {
    const pl = plain(out);
    const srcPlain = plain(work.tagged);
    const flags = [];
    const errors = check(work.tagged, out);
    if (errors.some((e) => e.startsWith("missing <g"))) flags.push("formatting_lost");
    if (errors.some((e) => !e.startsWith("missing <g") && !e.startsWith("stray markup"))) flags.push("tags_broken");
    if (this._unchanged(srcPlain, pl)) {
      // one lowercase word kept twice (a drug name) is information; anything else unchanged is a warning
      const single = pySplit(srcPlain).length === 1 && LOWER_WORD_RE.search(srcPlain) !== null;
      flags.push(single ? "kept_english" : "unchanged");
    } else if (same(srcPlain, pl) && Array.from(srcPlain).some(isAlpha)) {
      flags.push("kept_english"); // only glossary terms kept in English: said, not silent
    } else if (this._englishLeft(srcPlain, pl) || this._copied(srcPlain, pl).length) {
      flags.push("english_left");
    }
    if (qa.numbersChanged(srcPlain, pl)) flags.push("numbers_changed");
    const lost = qa.missingTokens(srcPlain, pl);
    if (lost.length) flags.push("acronym_lost:" + lost.join(","));
    flags.push(...suspect(srcPlain, pl, context).map((r) => "suspect_output:" + r));
    flags.push(...qa.suspiciousTokens(pl, srcPlain).map((t) => "suspicious:" + t));
    if (strayMarkup(work.tagged, out).length) flags.push("stray_markup");
    flags.push(...qa.glossaryMisses(srcPlain, pl, this.hits).map((en) => "glossary_miss:" + en));
    flags.push(...qa.omittedClauses(srcPlain, pl).map((c) => OMITTED_ISSUE + c));
    return flags;
  }

  _finish(work, out, flags, context = false) {
    out = restoreSpaces(work.tagged, out);
    out = qa.fixLatex(plain(work.tagged), out); // "$\beta$" -> the symbol; other LaTeX stays for the flag
    let applied;
    [out, applied] = qa.applyTermFixes(out, plain(work.tagged), this.fixes);
    out = qa.sourceCase(plain(work.tagged), out); // sentence-initial capital from the source, never the model's
    flags.push(...applied.map((a) => "term_fix:" + a));
    flags.push(...this.checks(work, out, context));
    return out;
  }

  /** TM key: model, pack, translator version, system prompt hash, tagged source and the ids of its essential spans. */
  async key(seg) {
    const essential = [...seg.spans.keys()].sort((a, b) => a - b).filter((n) => this.essential(seg.spans.get(n))).join(",");
    const scope = this.packKey + "|v" + TRANSLATOR_VERSION + "|" + (await this.systemHash());
    return tmKey(this.modelKey, scope, seg.tagged + "\n" + essential);
  }

  async translate(seg, prev = "", nxt = "") {
    if (codeOnly(plain(seg.tagged)) && !capsProse(plain(seg.tagged), this.hits)) {
      return new Outcome(seg.tagged, seg, 0, ["kept_code"]); // no model call, same answer every run
    }
    if (citationOnly(plain(seg.tagged))) return new Outcome(seg.tagged, seg, 0, ["kept_reference"]);
    const key = await this.key(seg);
    if (this.tm !== null) {
      const hit = await this.tm.get(key);
      if (hit) {
        const [stored, level] = hit;
        const work = level < 3 ? seg : seg.reduced(this.essential);
        const flags = [];
        const text = this._finish(work, stored, flags); // same finishing as a fresh run: same text, same flags
        return new Outcome(text, work, level, flags, true);
      }
    }
    if (pySplit(plain(seg.tagged)).length < SHORT_WORDS) prev = nxt = ""; // titles and table cells: no neighbours
    let context = Boolean(prev || nxt);
    const flags = [];
    let work = seg;
    let level = 0;
    if (seg.spans.size > MAX_TAGS) {
      work = seg.reduced(this.essential);
      level = 3;
    }
    const raw = await this._ask(work.tagged, prev, nxt);
    let [out, repaired] = this._tagfix(work, raw);
    if (out !== null && repaired) level = Math.max(level, 1);
    if (out === null && level < 3) {
      const errors = Translator.problems(work, qa.stripLeaks(work.tagged, raw));
      const empty = errors.includes(EMPTY);
      flags.push(empty ? "retried:empty" : "retried:tags");
      const note = empty ? RETRY_EMPTY : fmt(RETRY_TAGS, errors.join("; "));
      [out] = this._tagfix(work, await this._ask(work.tagged, prev, nxt, note));
      level = 2;
    }
    if (out === null && level < 3) {
      const reduced = seg.reduced(this.essential);
      work = reduced;
      level = 3;
      if (reduced.spans.size && reduced.tagged !== seg.tagged) { // all spans essential: L3 would repeat L0, go to L4
        [out] = this._tagfix(work, await this._ask(work.tagged, prev, nxt));
      }
    }
    if (out === null) {
      [out, level] = await this._reattach(work, prev, nxt, flags);
      if (out === null) {
        // every answer was empty: keep the source as it is (flagged, not cached) rather than erase the text
        return new Outcome(seg.tagged, seg, 5, ["empty_output", ...this.checks(seg, seg.tagged)]);
      }
    } else if (level < 2) {
      const issues = this._issues(work, out, context);
      if (issues.length) { // one retry, without the neighbours: they are the usual source of bleed
        flags.push(...retried(issues));
        const [again] = this._tagfix(work, await this._ask(work.tagged, "", "", gateNote(issues, out, plain(work.tagged))));
        const left = again !== null ? this._issues(work, again, false) : null;
        // a tie is accepted (the retry ran without the neighbours), except when every issue was a missing acronym, a
        // copied English fragment or a clause left out: a retry that removes none of them is only a different wording
        const narrow = issues.every((i) => i.startsWith(TOKENS_ISSUE) || i.startsWith(ENGLISH_ISSUE) ||
          i.startsWith(OMITTED_ISSUE));
        if (left !== null && (left.length < issues.length || (left.length === issues.length && !narrow))) {
          out = again;
          level = 2;
          context = false;
        }
      }
    }
    let stripped;
    [out, stripped] = stripEmphasis(plain(work.tagged), out); // L0-L3 too (L4 already did it): never write "**"
    if (stripped) flags.push("suspect_output:markdown");
    const stored = out; // the TM keeps the text before finishing; every hit runs the same finishing again
    out = this._finish(work, out, flags, context);
    if (this.tm !== null && cacheable(level, flags)) await this.tm.put(key, stored, level);
    return new Outcome(out, work, level, flags);
  }
}
