// The live-captions profile of /api/v1/translate (profile "live"; the /live/ page sends each committed caption
// sentence with the previous 1-2 sentences). Built for speed, with the core's checks:
// - a short system prompt, fixed per live job (the packs' name only), so x-session-affinity = the job id reuses its
//   prefix; the glossary hits of THIS sentence (never the whole-text hits of setup.hits) and the previous sentences
//   go in the user message;
// - no read-back; at most two model calls per sentence: the first, then one retry -- of a failed call (no wait), of
//   an empty answer, or of an answer the core's QA gate rejects (without the context, as the core retries);
// - a deadline per request: a sentence with no answer by then comes back empty, flagged "deadline" (the page shows
//   the English); a retry still running then is dropped and the first answer kept, flagged "deadline"; calls still
//   running are left to finish and returned in `pending` so their neurons are counted after the answer;
// - the core's finishing as for files: term-lock fixes (term_fix), title order, sentence case, the check flags;
// - term repair (repair.js): a sentence with candidates of the core's finder (glossary keys close to its words: a
//   recognizer's mis-hearing) gets them numbered in its user message and answers "USE: <numbers or none>" / "VI:
//   <translation>"; the corrections used give en_fixed (the source otherwise) and repairs [{from, to}], and the checks,
//   the finishing and the one retry (plain live prompt) work on en_fixed. Without candidates nothing changes.
// Nothing is logged or kept.
import { Translator, TaggedSegment, glossaryHits, termIndex, findCandidates } from "../../web/engine/core.js";
import { gateNote, retried, stripEmphasis, plain, codeOnly, capsProse, RETRY_EMPTY, TOKENS_ISSUE, ENGLISH_ISSUE,
  OMITTED_ISSUE } from "../../web/engine/translate.js";
import { baseFor } from "./engine.js";
import { ModelCallError } from "./model.js";
import { buildRepairBlock, parseRepairAnswer, applyRepairs } from "./repair.js";
import MEDICAL from "../../web/engine/medical_words.json" with { type: "json" };

export const LIVE_SYSTEM_MARK = "live English speech captions";
export const LIVE_MAX_HITS = 12;
const PREV_CHARS = 300;

const LIVE_RULES = [
  "Rules:",
  "- Translate the meaning naturally, as a Vietnamese speaker would say it: short, clear subtitle sentences, never " +
    "word by word.",
  "- Drop fillers that carry no meaning (um, uh, you know, I mean, kind of, sort of, like, well, so at the start) and " +
    "repeated or abandoned words; never drop content.",
  "- Keep names, gene names, codes, numbers, units and abbreviations as written; decimals take a comma (0.5 -> 0,5).",
  "- Use the glossary translations given with the text; prefer the usage of Ho Chi Minh City hospitals.",
  "- The captions come from speech recognition and may hold mistakes: translate what is written, do not guess " +
    "other words (only the corrections offered with a text may be used).",
  "- Output ONLY the Vietnamese translation of the text after \"Translate:\", nothing else (or the two lines USE: / " +
    "VI: when the message asks for them).",
].join("\n");

/** The live system prompt: fixed for a live job (topic = the packs' name, "" when none). */
export function buildLiveSystem(topic = "") {
  return "You translate " + LIVE_SYSTEM_MARK + " (a talk, lecture or meeting" + (topic ? "; topic: " + topic : "") +
    ") into natural Vietnamese subtitles.\n\n" + LIVE_RULES;
}

function head(s, n) {
  const cps = Array.from(s);
  return cps.length <= n ? s : cps.slice(cps.length - n).join("");  // the end of the context: nearest the sentence
}

/** The user message: this sentence's glossary hits, the term repair block (repair.js), the previous sentence(s) as
 * context, a retry note, the text. */
export function buildLiveUser(text, prev = "", hits = [], note = "", repair = "") {
  const lines = [];
  if (hits.length) lines.push("Glossary (English = Vietnamese):\n" + hits.map((h) => "- " + h[0] + " = " + h[1]).join("\n"));
  if (repair) lines.push(repair);
  if (prev) lines.push("Previous paragraph (context only, do not translate): " + head(prev, PREV_CHARS));
  if (note) lines.push(note);
  lines.push("Translate:\n" + text);
  return lines.join("\n\n");
}

class LiveTranslator extends Translator {
  _ask(tagged, prev, nxt, note = "") {
    return this._chat(buildLiveUser(tagged, prev, this.hits, note, this.repair || ""));
  }
}

const indexes = new WeakMap(); // base (engine.js baseFor) -> the core's TermIndex of its glossary keys
const LEXICON = MEDICAL.terms.concat(MEDICAL.corpus); // the lexicon gate's medical words (tools/build_lexicon.py)

/** The core's TermIndex of a base's glossary keys with the medical lexicon (the gate: repair.js LEXICON_GATE). */
export function repairIndex(base) {
  if (!indexes.has(base)) indexes.set(base, termIndex([...base.rows.keys()], LEXICON));
  return indexes.get(base);
}

class Deadline extends Error {
  constructor() {
    super("The live deadline passed.");
    this.name = "LiveDeadline";
  }
}

function causes(err) {
  const out = [];
  for (let e = err, depth = 0; e && depth < 6; e = e.cause, depth++) out.push(e);
  return out;
}
const isDeadline = (err) => causes(err).some((e) => e instanceof Deadline);
const isBudget = (err) => causes(err).some((e) => e instanceof ModelCallError && e.kind === "budget");
const isAbort = (err) => causes(err).some((e) => e && (e.name === "AbortError" || e.code === "aborted"));

/** The model raced against the deadline (ms epoch); every started call is added to pending. */
function withDeadline(model, at, pending, clock) {
  return (messages, opts) => {
    const left = at - clock();
    if (left <= 0) return Promise.reject(new Deadline());
    const call = model(messages, opts);
    pending.push(call.catch(() => null));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Deadline()), left);
      call.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
  };
}

/** One sentence. rep (term repair, the sentence has candidates): {cands, make(text) -> the translator of a text without
 * the repair block}; tr then carries the block. -> {text, level, flags, fixes, en (en_fixed), repairs}. */
async function liveOne(tr, seg, prev, rep = null) {
  let work = new TaggedSegment(seg.tagged, []);
  let src = plain(work.tagged);
  let fixed = { en: seg.tagged, repairs: [] };
  if (codeOnly(src) && !capsProse(src, tr.hits)) {
    return { text: seg.tagged, level: 0, flags: ["kept_code"], fixes: [], ...fixed };
  }
  const flags = [];
  const log = [];
  let calls = 0;
  const ask = (p, note) => {
    calls += 1;
    return tr._ask(work.tagged, p, "", note);
  };
  let raw;
  try {
    raw = await ask(prev, "");
  } catch (err) {
    if (isDeadline(err)) return { text: "", level: 5, flags: ["deadline"], fixes: [], ...fixed };
    if (isBudget(err) || isAbort(err)) throw err;
    try {
      raw = await ask(prev, ""); // one retry of a failed call, at once
    } catch (again) {
      if (isDeadline(again)) return { text: "", level: 5, flags: ["deadline"], fixes: [], ...fixed };
      throw again;
    }
  }
  if (rep) { // the two lines: the corrections used give en_fixed, then the checks and the retry work on that text
    const answer = parseRepairAnswer(raw);
    const applied = applyRepairs(src, answer.use, rep.cands);
    raw = answer.vi;
    if (applied.repairs.length) {
      fixed = { en: applied.text, repairs: applied.repairs };
      work = new TaggedSegment(applied.text, []);
      src = applied.text;
    }
    tr = rep.make(work.tagged);
  }
  let [out] = tr._tagfix(work, raw);
  let level = 0;
  let context = Boolean(prev);
  const second = async (note) => { // the one retry: [answer text or null, ok]
    try {
      return await ask("", note);
    } catch (err) {
      if (isBudget(err) || isAbort(err)) throw err;
      flags.push(isDeadline(err) ? "deadline" : "retry_failed");
      return null;
    }
  };
  if (out === null) { // an empty answer (captions carry no tags)
    if (calls < 2) {
      flags.push("retried:empty");
      const r = await second(RETRY_EMPTY);
      if (r !== null) [out] = tr._tagfix(work, r);
      level = 2;
      context = false;
    }
    if (out === null) return { text: "", level: 5, flags: [...flags, "empty_output"], fixes: [], ...fixed };
  } else if (calls < 2) {
    const issues = tr._issues(work, out, context);
    if (issues.length) { // the core's gate: one retry without the context, accepted as the core accepts it
      flags.push(...retried(issues));
      const r = await second(gateNote(issues, out, src));
      const [again] = r !== null ? tr._tagfix(work, r) : [null];
      const left = again !== null ? tr._issues(work, again, false) : null;
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
  [out, stripped] = stripEmphasis(src, out);
  if (stripped) flags.push("suspect_output:markdown");
  out = tr._finish(work, out, flags, context, log);
  return { text: out, level, flags, fixes: log, ...fixed };
}

/** The sentences of one live request, all at once (a request holds at most a few). -> {results: [{id, text, level,
 * flags, fixes, cached, reduced, spans, ms, en_fixed, repairs}], pending: [promises of calls still running]}. A failed
 * sentence (two failed calls) fails the request, as a failed segment fails a file batch. clock: ms epoch (the
 * deadline's). */
export async function translateLive(set, setup, segments, { model, modelKey, deadlineMs, signal = null,
  clock = () => Date.now() } = {}) {
  const base = await baseFor(set, setup.packs);
  const topic = base.pack.id === "_none" ? "" : base.pack.name;
  const system = buildLiveSystem(topic);
  const t0 = clock();
  const pending = [];
  const timed = withDeadline(model, t0 + deadlineMs, pending, clock);
  const make = (text, repair = "") => {
    const hits = glossaryHits(plain(text), base.pack.glossary, LIVE_MAX_HITS);
    const tr = new LiveTranslator({ model: timed, system, modelKey, packKey: base.scope, fixes: base.fixes, hits,
      tm: null, signal, allowed: base.allowed });
    tr.repair = repair;
    return tr;
  };
  const index = repairIndex(base);
  const results = await Promise.all(segments.map(async (s) => {
    const cands = findCandidates(plain(s.tagged), index);
    const rep = cands.length ? { cands, make: (text) => make(text) } : null;
    const r = await liveOne(make(s.tagged, buildRepairBlock(cands, base.rows)), s, s.prev || "", rep);
    return { id: s.id, text: r.text, level: r.level, flags: r.flags, fixes: r.fixes, cached: false, reduced: false,
      spans: [], ms: clock() - t0, en_fixed: r.en, repairs: r.repairs };
  }));
  return { results, pending };
}
