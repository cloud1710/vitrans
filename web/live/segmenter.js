// Live captions -> committed sentences (live-captions spec section 8, on the page). Input: the source's full current
// caption text, again and again (Windows Live Captions / Chrome Live Caption through the helper: the visible lines;
// the browser's speech recognizer: its final text + the interim words). Output events:
//   {type: "commit", id, en, raw, t, reason: punct | pause | long | flush}  a sentence that will not change any more
//     (en: without the fillers that carry no meaning -- his decision 2026-10-14 Q3 -- with a capital first letter;
//     raw: the words as the source showed them). A sentence made of fillers only is not committed as an event.
//   {type: "revise", id, en, raw}  the source rewrote a committed sentence within reviseMs
//   {type: "draft", text}          the words not committed yet (the sentence being spoken), when they change
// Alignment: the committed words are found again in each snapshot (the last 6 committed words, else the longest
// overlap of the committed words' end with the snapshot's start, else the last sentence's own words for a
// revision); nothing found = the source reset (cleared or restarted): the words pending are committed first, the new
// text is all new, and a recent long sentence shown again is not committed again. Rules for the earliest sentence not
// committed: an end mark (. ? ! ...) not of an abbreviation, a decimal or an initial, AND words after it or the same
// words in K = 2 snapshots in a row; no change for pauseMs (tick) -> the whole tail; maxWords without an end mark ->
// cut at the last soft boundary after >= 8 words (, ; : or before and / but / so / because / which) once stable.
// The microphone (his report 2026-10-15: the iPhone's recognizer shows no punctuation and keeps rewriting its last
// words, so a sentence waited for maxWords, 10-13 s of speech) cuts earlier, options from segmenterOptions("mic"):
// each pending word remembers since when it reads the same; once the words unchanged for stableMs hold >= minWords
// and a clause boundary (goodCut: a soft mark, before a subordinator or a subject pronoun, before and / or / but / so
// / then / now / next when a determiner or a pronoun follows) the stable words are committed up to the last one;
// pending >= capWords without one: cut before a preposition (weakCut); never after a function word, never inside a
// term of the pathology packs (and + a content word is a list, carcinoma in situ, with...); a pause after a function
// word waits pauseWeakMs. Alignment also finds the committed words again when the recognizer fixed some of them (one
// word in place, else a common subsequence) and, after a reset, the last sentence of the new recognition at word 0:
// a revision or nothing, never the same words committed twice. Pure: no DOM, the clock is the t passed in (ms).

const END_RE = /[.?!\u2026]["'\u201d\u2019)\]]*$/;
const SOFT_RE = /[,;:]["'\u201d\u2019)\]]*$/;
const SOFT_NEXT = new Set(["and", "but", "so", "because", "which"]);
const ABBR_NEVER = new Set(["dr", "mr", "mrs", "ms", "prof", "vs", "e.g", "i.e", "fig", "figs", "approx", "st", "jr",
  "sr", "dept", "ca", "cf"]);
const ABBR_MAYBE = new Set(["etc", "al", "a.m", "p.m", "u.s", "u.k", "no", "nos"]);
const FILLER_RE = /^(?:u+m+|u+h+m*|e+r+m*|a+h+|h+m+|m{3,}|m+h+m+)$/i; // never "mm" (millimetres)
const REPEAT_OK = new Set(["very", "no", "bye", "ha", "so", "really"]);
const ANCHOR = 6;
const STREAM_MAX = 400;
const OVERLAP_MAX = 200;
const RECENT = 5;
const LCS_TAIL = 40;  // committed words compared when the anchor is not found as it was
// a commit never ends on these (articles, prepositions, auxiliaries, conjunctions, determiners, subject pronouns)
const NO_END = new Set(["the", "a", "an", "of", "to", "in", "with", "and", "or", "for", "by", "on", "at", "from", "as",
  "that", "is", "are", "was", "were", "be", "this", "these", "its", "their", "nor", "but", "so", "then", "because",
  "which", "who", "whom", "whose", "where", "when", "while", "whereas", "although", "though", "if", "unless", "than",
  "very", "not", "no", "our", "my", "your", "his", "her", "has", "have", "had", "been", "being", "am", "can", "will",
  "would", "should", "could", "may", "might", "must", "do", "does", "did", "into", "about", "between", "within",
  "without", "under", "over", "per", "such", "more", "most", "less", "i", "we", "they", "he", "she", "those", "let",
  "let's", "also", "both", "either", "neither", "each", "every", "some", "any", "all", "many", "much", "few", "after",
  "before", "during", "through", "onto", "upon", "via", "like", "just", "really", "quite", "rather", "only", "even",
  "whether", "once", "since", "until"]);
// a clause starts at these
const STARTERS = new Set(["because", "which", "who", "whom", "whose", "where", "when", "while", "whereas", "although",
  "though", "however", "if", "unless", "we", "i", "they", "let's", "there's", "okay"]);
// ... and at these when LEADS follow (and the cells / and we: a clause; and smooth muscle actin: a list)
const LINKS = new Set(["and", "or", "but", "so", "then", "now", "next", "here", "there"]);
const LEADS = new Set(["the", "a", "an", "this", "these", "those", "that", "we", "i", "you", "it", "they", "he", "she",
  "there", "here", "if", "when", "then", "now", "so", "our", "my", "your", "its", "their", "his", "her", "let's",
  "because", "which", "although", "while", "once", "after", "before", "since"]);
const HERE_LEADS = new Set(["is", "are", "was", "were", "we", "you", "i", "the", "a", "an", "this", "these"]);
const NUMBERED = new Set(["type", "grade", "stage", "class", "phase", "level", "tier", "category", "group", "zone",
  "part", "figure", "table", "chapter", "appendix", "mode", "schedule"]);  // grade I: a numeral, not the pronoun
// weakCut: a phrase starts at these prepositions (not of / for / to: positive for, loss of, went on to)
const WEAK_NEXT = new Set(["in", "on", "at", "from", "into", "after", "before", "during", "within", "between", "under",
  "over", "without", "near", "along", "across", "around", "with", "by", "through", "about"]);
// ... except inside the terms of the pathology packs (tests/segmenter_cut.test.mjs reads the packs and fails on a new
// one): carcinoma with medullary pattern, consistent with, spread through air spaces; in situ is checked apart
const TERM_PAIRS = new Set(["carcinoma with", "neoplasm with", "astrocytoma with", "angiomyolipoma with",
  "dementia with", "disease with", "granulomatosis with", "rcc with", "consistent with", "keeping with", "present with",
  "spread through", "aml with", "mds with", "histiocytosis with", "involved by"]);
// chosen on the replay harness (tools/live_cut_replay.mjs, 2026-10-15, 8 seeds): Safari-like median / p90 latency
// 6.7 / 11.4 s -> 2.7 / 5.2 s, 19 -> 9 words per commit, bad cuts 7.9 % -> 3.0 %; the helper keeps its cuts, only its
// pause after a function word waits (Live Captions-like bad cuts 9.1 % -> 1.9 %, median latency +0.2 s)
const MIC = { pauseMs: 700, pauseWeakMs: 2000, maxWords: 32, stableMs: 500, leadMs: 0, minWords: 6, capWords: 12 };
const HELPER = { pauseWeakMs: 2000 };

/** Segmenter options of a caption source: the microphone's recognizer (no punctuation, the last words rewritten)
 * cuts early; the helper (Windows Live Captions / Chrome's Live Caption, punctuated) keeps its cuts. */
export function segmenterOptions(source) {
  return { ...(source === "mic" ? MIC : HELPER) };
}

/** Is the cut after word i (tw: as shown, tn: normalized) a clause boundary? Words from n on are not stable yet:
 * the words a rule reads after the cut must come before n. */
export function goodCut(tw, tn, i, n) {
  if (i >= n || NO_END.has(tn[i])) return false;
  if (SOFT_RE.test(tw[i])) return true;
  if (i + 1 >= n) return false;
  const next = tn[i + 1];
  if (next === "i" && NUMBERED.has(tn[i])) return false;
  if (next === "who" && tw[i + 1] === "WHO") return false;
  if (STARTERS.has(next)) return true;
  if (!LINKS.has(next) || i + 2 >= n) return false;
  return (next === "here" || next === "there" ? HERE_LEADS : LEADS).has(tn[i + 2]);
}

/** A cut before a preposition (after a content word), for a long run without a clause boundary; never inside a term
 * (TERM_PAIRS, "in situ"). */
export function weakCut(tn, i, n) {
  if (i + 2 >= n || NO_END.has(tn[i]) || !WEAK_NEXT.has(tn[i + 1])) return false;
  return tn[i + 2] !== "situ" && !TERM_PAIRS.has(tn[i] + " " + tn[i + 1]);
}

/** A word without case and without the punctuation at its edges ("Mass." -> "mass", "\"Ki-67,\"" -> "ki-67"). */
export function normWord(w) {
  return String(w).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Does this token end a sentence (next: the token after it, if any)? */
export function isBoundary(tok, next) {
  if (!END_RE.test(tok)) return false;
  const core = tok.replace(/["'\u201d\u2019)\]]+$/, "");
  if (core.endsWith("?") || core.endsWith("!") || core.endsWith("\u2026")) return true;
  const stem = core.slice(0, -1).toLowerCase();
  if (/^\p{Lu}$/u.test(core.slice(0, -1))) return false; // an initial: J. Smith
  if (ABBR_NEVER.has(stem)) return false;
  if (ABBR_MAYBE.has(stem)) {
    if (next === undefined) return false;
    if ((stem === "no" || stem === "nos") && /^\d/.test(next)) return false;
    return /^["'(\u201c]?\p{Lu}/u.test(next);
  }
  return true;
}

function isSoft(tok, next) {
  return SOFT_RE.test(tok) || (next !== undefined && SOFT_NEXT.has(normWord(next)));
}

const capFirst = (s) => s.replace(/^(["'(\u201c]?)(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());

/** The sentence without hesitation sounds (um, uh, er, ah, hmm) and stuttered repeats ("the the"); "" when nothing
 * that carries meaning is left. The first letter is a capital. */
export function cleanFillers(text) {
  const toks = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  for (const tok of toks) {
    const n = normWord(tok);
    if (FILLER_RE.test(n) && !/^\p{Lu}{2,}[,.?!]*$/u.test(tok)) { // "ER" (estrogen receptor) is not "er"
      const trail = /[.?!\u2026]+$/.exec(tok);
      if (out.length) {
        const prev = out[out.length - 1];
        if (trail && !END_RE.test(prev)) out[out.length - 1] = prev.replace(/[,;:]+$/, "") + trail[0];
        else if (/,$/.test(tok) && /,$/.test(prev)) out[out.length - 1] = prev.slice(0, -1);
      }
      continue;
    }
    if (out.length) {
      const prev = out[out.length - 1];
      if (n && normWord(prev) === n && !REPEAT_OK.has(n) && /^[\p{L}']+,?$/u.test(prev)) {
        out[out.length - 1] = tok; // "we we we move" -> "we move"; keeps the last one's punctuation
        continue;
      }
    }
    out.push(tok);
  }
  while (out.length && /^[,;:]+$/.test(out[0])) out.shift();
  if (out.length) out[out.length - 1] = out[out.length - 1].replace(/[,;:]+$/, (m) => (out.length > 1 ? "" : m));
  const s = out.join(" ").replace(/^[,;:\s]+/, "");
  if (!/[\p{L}\p{N}]/u.test(s)) return "";
  return capFirst(s);
}

function lastIndexOfSeq(hay, needle) {
  if (!needle.length || needle.length > hay.length) return -1;
  for (let i = hay.length - needle.length; i >= 0; i--) {
    let ok = true;
    for (let k = 0; k < needle.length; k++) {
      if (hay[i + k] !== needle[k]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

// the end (index after) of the last window of hay that reads as needle with one word changed (in place), else with
// one word added or dropped (same last word); -1 if none. The recognizer fixed a word that was already committed.
function fuzzyEnd(hay, needle) {
  const n = needle.length;
  if (n < 4) return -1;
  for (let i = hay.length - n; i >= 0; i--) {
    let miss = 0;
    for (let k = 0; k < n && miss <= 1; k++) if (hay[i + k] !== needle[k]) miss++;
    if (miss <= 1) return i + n;
  }
  for (const len of [n - 1, n + 1]) {
    for (let i = hay.length - len; i >= 0; i--) {
      const win = hay.slice(i, i + len);
      if (win[len - 1] === needle[n - 1] && similarity(win, needle) * (len + n) / 2 > n - 1.5) return i + len;
    }
  }
  return -1;
}

// the index in hay right after the committed words `tail` when the source rewrote several of them (the recognizer
// fixed words already committed): a longest common subsequence of the two; from the first committed word found, at
// least 70 % (and 4, 2 of them not function words) must be found; the committed words after the last one found
// count as replaced one for one. -1 if they are not there (another text).
function lcsEnd(hay, tail) {
  const n = tail.length;
  const m = hay.length;
  if (n < 4 || !m) return -1;
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = tail[i] === hay[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  let first = -1;
  let lastI = -1;
  let lastJ = -1;
  let found = 0;
  let content = 0;
  while (i < n && j < m) {
    if (tail[i] === hay[j]) {
      if (first < 0) first = i;
      lastI = i;
      lastJ = j;
      found++;
      if (!NO_END.has(tail[i])) content++;
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
    else j++;
  }
  if (found < 4 || found < 0.7 * (n - first) || content < 2) return -1;
  return Math.min(m, lastJ + 1 + (n - 1 - lastI));
}

// 2 * LCS / (|a| + |b|) over words
export function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(dp[j], dp[j - 1]);
      diag = up;
    }
  }
  return (2 * dp[b.length]) / (a.length + b.length);
}

export function createSegmenter(opts = {}) {
  const pauseMs = opts.pauseMs ?? 1200;
  const maxWords = opts.maxWords ?? 32;
  const reviseMs = opts.reviseMs ?? 3000;
  const K = opts.stable ?? 2;
  const stableMs = opts.stableMs ?? 0;  // 0: no stable-prefix cuts
  const leadMs = opts.leadMs ?? stableMs;
  const minWords = opts.minWords ?? 8;
  const capWords = opts.capWords ?? maxWords;
  const pauseWeakMs = opts.pauseWeakMs ?? pauseMs;
  let stream = [];      // normalized committed words (the end of them)
  let sentences = [];   // the last committed sentences {id, raw, norm, en, t, start (index in stream when committed)}
  let recent = [];      // normalized words of the last RECENT long sentences (repeat check after a reset)
  let nextId = 1;
  let pending = { words: [], norm: [], since: [] };  // since[i]: when pending word i got its current form
  let sessionBase = 0;  // the index in stream where the text after the last reset starts
  let pendingKey = "";
  let changedAt = 0;
  let cand = { key: "", count: 0 };
  let draft = "";
  let dedupe = false;
  let zeroBased = true; // since the start or a reset, before any commit: the snapshot's text starts at word 0

  function emitCommit(words, norm, t, reason, events) {
    stream.push(...norm);
    if (stream.length > STREAM_MAX) {
      const cut = stream.length - STREAM_MAX;
      stream = stream.slice(cut);
      sentences.forEach((s) => { s.start -= cut; });
      sessionBase = Math.max(0, sessionBase - cut);
    }
    const start = stream.length - norm.length;  // after the trim (it was taken before it: no revision after 400 words)
    zeroBased = false;
    const raw = words.join(" ");
    const en = cleanFillers(raw);
    if (dedupe && norm.length >= 5 && recent.some((r) => similarity(r, norm) >= 0.9)) return; // old text shown again
    const s = { id: en ? nextId : 0, raw, norm, en, t, start };
    sentences.push(s);
    if (sentences.length > 10) sentences.shift();
    if (norm.length >= 5) {
      recent.push(norm);
      if (recent.length > RECENT) recent.shift();
    }
    if (!en) return; // fillers only: nothing to translate
    nextId += 1;
    events.push({ type: "commit", id: s.id, en, raw, t, reason });
  }

  function commitPending(t, reason, events) {
    if (pending.words.length) emitCommit(pending.words, pending.norm, t, reason, events);
    pending = { words: [], norm: [], since: [] };
    pendingKey = "";
    cand = { key: "", count: 0 };
  }

  // the source cleared its text or started again: what follows starts at word 0
  function startOver() {
    dedupe = true;
    zeroBased = true;
    sessionBase = stream.length;
  }

  // stable-prefix commits (stableMs > 0): the words unchanged for stableMs, >= minWords, up to the last clause
  // boundary among them; pending >= capWords without one: up to the last weak boundary. [words, norm, since] left.
  function stableCuts(t, tw, tn, ts, events) {
    while (stableMs > 0) {
      let n = 0;
      while (n < tn.length && t - ts[n] >= stableMs) n++;
      if (n < minWords) break;
      let lead = n;  // the words after the cut that a rule reads: unchanged for leadMs
      while (lead < tn.length && t - ts[lead] >= leadMs) lead++;
      let cut = -1;
      let reason = "stable";
      for (let i = n - 1; i >= minWords - 1 && cut < 0; i--) if (goodCut(tw, tn, i, lead)) cut = i;
      if (cut < 0 && tn.length >= capWords) {
        reason = "long";
        for (let i = n - 1; i >= minWords - 1 && cut < 0; i--) if (weakCut(tn, i, lead)) cut = i;
      }
      if (cut < 0) break;
      emitCommit(tw.slice(0, cut + 1), tn.slice(0, cut + 1), t, reason, events);
      cand = { key: "", count: 0 };
      tw = tw.slice(cut + 1);
      tn = tn.slice(cut + 1);
      ts = ts.slice(cut + 1);
    }
    return [tw, tn, ts];
  }

  // the index in the snapshot right after the committed words; -1 = the source reset
  function align(norm, words, t, events) {
    if (zeroBased || !stream.length) {
      // still the text that started at word 0; a pending run of 3+ words that the snapshot no longer starts with is
      // another reset
      const n = pending.norm.length;
      if (n >= 3 && similarity(norm.slice(0, n), pending.norm) < 0.5) return -1;
      return 0;
    }
    const anchor = stream.slice(-ANCHOR);
    const at = lastIndexOfSeq(norm, anchor);
    if (at >= 0) return at + anchor.length;
    for (let k = Math.min(stream.length, norm.length, OVERLAP_MAX); k >= 2; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) {
        if (stream[stream.length - k + i] !== norm[i]) { ok = false; break; }
      }
      if (ok) return k;
    }
    const last = sentences[sentences.length - 1];
    if (last && last.start + last.norm.length === stream.length) {
      // the words before it, from the text since the last reset only (the first sentence after it starts at word 0)
      const pre = stream.slice(Math.max(0, sessionBase, last.start - ANCHOR), last.start);
      let r = -1;
      if (pre.length) {
        const i = lastIndexOfSeq(norm, pre);
        r = i >= 0 ? i + pre.length : fuzzyEnd(norm, pre);
      } else {
        r = 0;
      }
      if (r >= 0) {
        let end = -1;
        for (let i = r; i < words.length; i++) {
          if (isBoundary(words[i], words[i + 1])) { end = i; break; }
        }
        const len = end >= 0 ? end + 1 - r : Math.min(words.length - r, last.norm.length);
        const candNorm = norm.slice(r, r + len);
        if (len > 0 && similarity(candNorm, last.norm) >= 0.6) {
          const same = candNorm.length === last.norm.length && candNorm.every((w, i) => w === last.norm[i]);
          if (!same && t - last.t <= reviseMs && last.id) {
            const raw = words.slice(r, r + len).join(" ");
            const en = cleanFillers(raw);
            stream = stream.slice(0, last.start).concat(candNorm);
            last.norm = candNorm;
            last.raw = raw;
            if (en && en !== last.en) {
              last.en = en;
              events.push({ type: "revise", id: last.id, en, raw });
            }
          }
          return r + len;
        }
      }
    }
    return lcsEnd(norm, stream.slice(Math.max(sessionBase, stream.length - LCS_TAIL)));
  }

  function push(text, t) {
    const events = [];
    const words = String(text || "").split(/\s+/).filter((w) => normWord(w));
    const norm = words.map(normWord);
    if (!words.length) { // the source cleared its text (a silence, a restart): what was pending is final
      commitPending(t, "flush", events);
      startOver();
      return events.concat(setDraft(""));
    }
    let pos = align(norm, words, t, events);
    if (pos < 0) {
      commitPending(t, "flush", events);
      startOver();
      pos = 0;
    } else if (pos > 0) {
      dedupe = false;
    }
    let tw = words.slice(pos);
    let tn = norm.slice(pos);
    let ts = tn.map((w, i) => (pending.norm[i] === w ? pending.since[i] : t));
    for (;;) {
      if (!tw.length) break;
      let b = -1;
      for (let i = 0; i < tw.length; i++) {
        if (isBoundary(tw[i], tw[i + 1])) { b = i; break; }
      }
      let cut = -1;
      let reason = "punct";
      if (b >= 0 && b < maxWords) {
        cut = b;
      } else if (tw.length >= maxWords) {
        reason = "long";
        cut = maxWords - 1;
        for (let i = Math.min(maxWords, tw.length) - 2; i >= 7; i--) {
          if (isSoft(tw[i], tw[i + 1])) { cut = i; break; }
        }
      }
      if (cut < 0) break;
      const key = tn.slice(0, cut + 1).join(" ");
      const after = reason === "punct" && tw.length > cut + 1;
      const count = key === cand.key ? cand.count + 1 : 1;
      if (!after && count < K) {
        cand = { key, count };
        break;
      }
      emitCommit(tw.slice(0, cut + 1), tn.slice(0, cut + 1), t, reason, events);
      cand = { key: "", count: 0 };
      tw = tw.slice(cut + 1);
      tn = tn.slice(cut + 1);
      ts = ts.slice(cut + 1);
    }
    [tw, tn, ts] = stableCuts(t, tw, tn, ts, events);
    pending = { words: tw, norm: tn, since: ts };
    const pk = tn.join(" ");
    if (pk !== pendingKey) {
      pendingKey = pk;
      changedAt = t;
    }
    return events.concat(setDraft(tw.join(" ")));
  }

  function setDraft(text) {
    if (text === draft) return [];
    draft = text;
    return [{ type: "draft", text }];
  }

  function tick(t) {
    if (!pending.words.length) return [];
    const events = [];
    const [tw, tn, ts] = stableCuts(t, pending.words, pending.norm, pending.since, events);
    if (events.length) {
      pending = { words: tw, norm: tn, since: ts };
      pendingKey = tn.join(" ");
    }
    // a pause: the whole tail; after a function word (the... um) the speaker is likely to go on: wait longer
    const weak = NO_END.has(pending.norm[pending.norm.length - 1]);
    if (pending.words.length && t - changedAt >= (weak ? pauseWeakMs : pauseMs)) commitPending(t, "pause", events);
    return events.length ? events.concat(setDraft(pending.words.join(" "))) : events;
  }

  function flush(t) {
    const events = [];
    commitPending(t, "flush", events);
    return events.concat(setDraft(""));
  }

  function reset() {
    zeroBased = true;
    stream = [];
    sentences = [];
    recent = [];
    pending = { words: [], norm: [], since: [] };
    sessionBase = 0;
    pendingKey = "";
    cand = { key: "", count: 0 };
    draft = "";
    dedupe = false;
  }

  return { push, tick, flush, reset };
}
