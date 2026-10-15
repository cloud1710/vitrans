// Term repair candidates for speech-recognition text (port of helper/vitranslate/repair.py; parity fixtures:
// tools/export_engine_fixtures.py section "repair"). findCandidates lists the glossary English keys that are CLOSE BUT
// NOT EQUAL to a window of 1-4 words of a sentence, by spelling and by sound ("puppy thyroid carcinoma" -> papillary
// thyroid carcinoma); the live translation of the host (functions/_lib/live.js) offers them to the model. See the
// Python module for the rules; every score is an integer (per mille), so both runtimes rank alike.
import { compile } from "./pyre.js";
import { pyLower, cmpStr, pyRstrip, lastCp, isUpperCh, isLowerCh } from "./py.js";
import { variants } from "./matching.js";

export const MAX_CANDIDATES = 10;
export const MAX_WORDS = 4;
export const MIN_SCORE = 750; // per mille: mean of the spelling and the sound similarity
export const MIN_PART = 600; // per mille: each of them
export const MIN_CHARS = 4; // folded letters / digits of a key
export const GATES = ["off", "any", "changed"];
export const LEXICON_GATE = "changed"; // see repair.py (the owner's choice, 2026-10-15)
export const PROCEDURES = ["ectomy", "otomy", "ostomy", "plasty", "scopy", "graphy", "pexy", "rrhaphy", "centesis",
  "tripsy"];
export const FORMED = 8; // a word this long with one of ENDINGS is taken as a real word as heard
export const ENDINGS = ["al", "ar", "ary", "ic", "ism", "ist", "ia", "ion", "osis", "itis", "oma", "ous", "ive", "ity",
  "ment", "ence", "ance", "ent", "ant", "able", "ible", "ing", "ogy", "copy", "phy", "cyte", "cytes",
  "ure"];
export const STEM = 5; // letters two forms of one stem share at least ...
export const ENDING = 4; // ... before endings of at most this many letters (hyperplastic / hyperplasia)
const APOSTROPHES = "'" + String.fromCharCode(0x2019);
const WORD_RE = compile(String.raw`[^\W_]+(?:[` + APOSTROPHES + String.raw`][^\W_]+)*`);
const VOWELS = "aeiou";
const HEADS = [["kn", "n"], ["gn", "n"], ["pn", "n"], ["wr", "r"], ["ps", "s"], ["wh", "w"], ["x", "s"]];
const UK_US = [["ae", "e"], ["oe", "e"], ["our", "or"], ["ise", "ize"], ["yse", "yze"], ["tre", "ter"]];
// function and talk words: a window made of glossary words with these around them is trusted
export const STOPWORDS = new Set((
  "a an the and or but if so as at by for from in into of on onto to with without about over under than then that " +
  "this these those there here is are was were be been being am do does did has have had can could will would " +
  "shall should may might must it its we you he she they i me my our your his her their them us not no yes very " +
  "just also only even still all any some each every let lets go going okay ok well now one two three four five " +
  "six seven eight nine ten " +
  "else something anything nothing everything someone anyone everyone thing things stuff kind sort really " +
  "actually maybe quite much many more most less few other another same such like get got see saw seen look " +
  "looks looking say said think know mean right yeah um uh oh ah hmm which what who when where why how " +
  "because while again out up down off back way").split(" "));
const CODES = { b: "P", p: "P", d: "T", t: "T", k: "K", q: "K", f: "F", v: "F", s: "S", z: "S", j: "J", l: "L",
  m: "M", n: "N", r: "R" };
const SEP = " "; // never inside a folded word

/** A word as [a-z0-9] only: NFKD, lower case, everything else dropped. */
export function fold(word) {
  let out = "";
  for (const c of pyLower(word.normalize("NFKD"))) if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) out += c;
  return out;
}

/** [[start, end (UTF-16 indices), folded word]] of text; words that fold to nothing are left out. */
export function words(text) {
  const out = [];
  for (const m of WORD_RE.finditer(text)) {
    let word = m.group(0);
    if (word.length > 2 && APOSTROPHES.includes(word[word.length - 2]) && "sS".includes(word[word.length - 1])) {
      word = word.slice(0, -2); // a possessive: Hodgkin's = Hodgkin
    }
    const w = fold(word);
    if (w) out.push([m.start(), m.end(), w]);
  }
  return out;
}

function collapse(w) {
  let out = "";
  for (let i = 0; i < w.length; i++) if (i === 0 || w[i] !== w[i - 1]) out += w[i];
  return out;
}

const isVowel = (c) => c !== "" && VOWELS.includes(c);

/** A simple English sound key of a folded word (see repair.py sound_key). */
export function soundKey(word) {
  let w = collapse(word);
  for (const [head, rest] of HEADS) {
    if (w.startsWith(head)) {
      w = rest + w.slice(head.length);
      break;
    }
  }
  const out = [];
  let last = "";
  const emit = (code) => {
    if (code !== last) out.push(code);
    last = code;
  };
  const n = w.length;
  let i = 0;
  while (i < n) {
    const c = w[i];
    const nxt = i + 1 < n ? w[i + 1] : "";
    if (c >= "0" && c <= "9") {
      emit(c);
      i += 1;
      continue;
    }
    if (isVowel(c)) {
      if (i === 0) emit("A");
      last = "";
      i += 1;
      continue;
    }
    if ("hwy".includes(c)) {
      if (i === 0 && nxt !== "" && (VOWELS + "y").includes(nxt)) {
        emit("A");
        i += 2;
        last = "";
        continue;
      }
      i += 1;
      continue;
    }
    if (w.startsWith("tion", i) || w.startsWith("sion", i)) {
      emit("X");
      emit("N");
      i += 4;
      continue;
    }
    const two = w.slice(i, i + 2);
    if (two === "ph") emit("F");
    else if (two === "th") emit("0");
    else if (two === "sh") emit("X");
    else if (two === "ch") {
      const after = w.slice(i + 2, i + 3);
      emit(after === "r" || after === "l" || (i === 0 && after === "o") ? "K" : "X");
    } else if (two === "ck") emit("K");
    else if (two === "gh") {
      if (i === 0) emit("K");
    } else if (two === "dg") emit("J");
    else {
      if (c === "c") emit(nxt !== "" && "eiy".includes(nxt) ? "S" : "K");
      else if (c === "g") emit(nxt !== "" && "eiy".includes(nxt) ? "J" : "K");
      else if (c === "x") {
        emit("K");
        emit("S");
      } else emit(CODES[c]);
      i += 1;
      continue;
    }
    i += 2;
  }
  return out.join("");
}

function uk(w) {
  for (const [a, b] of UK_US) w = w.split(a).join(b);
  return w;
}

/** Every way the word list may be written as the same term (keys of joined words). */
function forms(toks) {
  toks = toks.map(uk);
  const last = toks[toks.length - 1];
  const alts = [last, ...variants(last)];
  if (last.length > 5) {
    if (last.endsWith("ed")) alts.push(last.slice(0, -2), last.slice(0, -1));
    if (last.endsWith("ing")) alts.push(last.slice(0, -3), last.slice(0, -3) + "e");
  }
  const head = toks.slice(0, -1);
  return new Set(alts.map((a) => head.concat([a]).join(SEP)));
}

function pairsOf(s) {
  const out = [];
  for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** True when the word lists differ only in the ending of the last word (see repair.py _related). */
function related(toks, ktoks) {
  if (toks.length !== ktoks.length) return false;
  for (let i = 0; i + 1 < toks.length; i++) if (uk(toks[i]) !== uk(ktoks[i])) return false;
  const a = toks[toks.length - 1];
  const b = ktoks[ktoks.length - 1];
  let n = 0;
  while (n < Math.min(a.length, b.length) && a[n] === b[n]) n++;
  return n >= STEM && a.length - n <= ENDING && b.length - n <= ENDING && soundKey(a) !== soundKey(b);
}

/** Levenshtein distance of a and b, or limit + 1 once it is known to be larger. */
function distance(a, b, limit) {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > limit) return limit + 1;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    const ca = a[i - 1];
    let low = i;
    for (let j = 1; j <= lb; j++) {
      let v = ca === b[j - 1] ? prev[j - 1] : prev[j - 1] + 1;
      if (prev[j] + 1 < v) v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      cur[j] = v;
      if (v < low) low = v;
    }
    if (low > limit) return limit + 1;
    prev = cur;
  }
  return prev[lb];
}

const limitFor = (longest, need) => Math.floor((longest * (1000 - need)) / 1000);
const bound = (la, lb) => {
  const longest = Math.max(la, lb);
  return Math.floor((1000 * (longest - Math.abs(la - lb))) / longest);
};

/** The glossary keys of a job, read once (see repair.py TermIndex). */
export class TermIndex {
  constructor(keys, lexicon = []) {
    this.lexicon = new Set(lexicon); // folded medical words (the lexicon gate)
    this.keys = []; // [key, spelling, sound, letter pairs, sound pairs, words, word count (hyphenated = 1)]
    this.byForm = new Map();
    this.byHead = new Map(); // first sound code -> Map(sound length -> [key index])
    this.vocab = new Set(); // every word of a key, in each of its forms
    const seen = new Set();
    for (const key of keys) {
      const kws = words(key);
      const toks = kws.map((w) => w[2]);
      if (!toks.length || seen.has(pyLower(key))) continue;
      seen.add(pyLower(key));
      const k = this.keys.length;
      const spell = toks.join("");
      const sound = toks.map(soundKey).join("");
      this.keys.push([key, spell, sound, new Set(pairsOf(spell)), new Set(pairsOf(sound)), toks,
        units(key, kws, 0, kws.length)]);
      for (const f of forms(toks)) {
        if (!this.byForm.has(f)) this.byForm.set(f, []);
        this.byForm.get(f).push(k);
      }
      for (const t of toks) for (const f of forms([t])) this.vocab.add(f);
      if (spell.length >= MIN_CHARS && sound) {
        if (!this.byHead.has(sound[0])) this.byHead.set(sound[0], new Map());
        const byLen = this.byHead.get(sound[0]);
        if (!byLen.has(sound.length)) byLen.set(sound.length, []);
        byLen.get(sound.length).push(k);
      }
    }
  }
}

export function termIndex(keys, lexicon = []) {
  return new TermIndex(keys, lexicon);
}

function medical(word, lexicon) {
  for (const f of forms([word])) if (lexicon.has(f)) return true;
  return lexicon.has(word) || PROCEDURES.some((e) => word.endsWith(e));
}

/** Words i..j-1 of ws counted with the ones joined by a hyphen as one ("high-grade" = 1). */
function units(text, ws, i, j) {
  let n = j - i;
  for (let k = i; k < j - 1; k++) if (text.slice(ws[k][1], ws[k + 1][0]) === "-") n--;
  return n;
}

/** True when the lexicon gate drops the pair of a window (its words, whether it holds a name, its word count with
 * hyphenated words as one) and a key (its words and word count). */
function gated(gate, toks, ktoks, named, lexicon, count, kcount) {
  if (gate === "off" || !lexicon.size || named || count !== kcount) return false;
  let content = toks.filter((t) => !STOPWORDS.has(t));
  if (gate === "changed") {
    const own = new Set(ktoks.map(uk));
    content = content.filter((t) => !own.has(uk(t)));
  }
  return content.some((t) => medical(t, lexicon));
}

/** Per word: a capitalised word (an upper-case first letter, a lower-case letter after it) inside a sentence. */
function names(text, ws) {
  return ws.map(([start, end], n) => {
    const word = Array.from(text.slice(start, end));
    const before = pyRstrip(text.slice(0, start));
    return n > 0 && before !== "" && !".!?:".includes(lastCp(before)) && isUpperCh(word[0]) &&
      word.slice(1).some(isLowerCh);
  });
}

/** True when the words, without the stopwords at either end, are all words of the glossary keys or long words of a
 * well-formed shape (see repair.py known). */
export function known(toks, index) {
  let a = 0;
  let b = toks.length;
  while (a < b && STOPWORDS.has(toks[a])) a++;
  while (b > a && STOPWORDS.has(toks[b - 1])) b--;
  return toks.slice(a, b).every((t) => index.vocab.has(uk(t)) || (t.length >= FORMED &&
    ENDINGS.some((e) => t.endsWith(e))));
}

const missingPairs = (pairs, set) => {
  let n = pairs.length;
  for (const q of pairs) if (set.has(q)) n--;
  return n;
};

/** [{from: the heard span as written, to: the key, score: per mille, words: [first, end) word indices}] of text,
 * best first (see repair.py find_candidates). */
export function findCandidates(text, index, { limit = MAX_CANDIDATES, minScore = MIN_SCORE,
  gate = LEXICON_GATE } = {}) {
  const ws = words(text);
  const sounds = ws.map((w) => soundKey(w[2]));
  const named = names(text, ws);
  const present = new Set();
  const windows = [];
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j <= Math.min(i + MAX_WORDS, ws.length); j++) {
      const toks = ws.slice(i, j).map((w) => w[2]);
      let trusted = known(toks, index);
      for (const f of forms(toks)) {
        for (const k of index.byForm.get(f) || []) {
          present.add(k);
          trusted = true;
        }
      }
      const spell = toks.join("");
      const sound = sounds.slice(i, j).join("");
      windows.push([i, j, spell, sound, trusted, pairsOf(spell), pairsOf(sound), toks, units(text, ws, i, j)]);
    }
  }
  const need = 2 * minScore;
  const best = new Map(); // key -> [score, start, length, trusted]
  for (const [i, j, spell, sound, trusted, pairs, spairs, toks, count] of windows) {
    const lengths = index.byHead.get(sound.slice(0, 1));
    if (!lengths) continue;
    const ls = sound.length;
    const lp = spell.length;
    for (const [lk, ks] of lengths) {
      const b1 = bound(ls, lk);
      if (b1 < MIN_PART || b1 + 1000 < need) continue;
      for (const k of ks) {
        if (present.has(k)) continue;
        const [, kspell, ksound, kpairs, kspairs, ktoks, kcount] = index.keys[k];
        const b2 = bound(lp, kspell.length);
        if (b2 < MIN_PART || b1 + b2 < need) continue;
        // each edit changes at most two letter pairs of the window: d >= (pairs not in the key + 1) // 2
        let longest = Math.max(lp, kspell.length);
        if (Math.floor((missingPairs(pairs, kpairs) + 1) / 2) > limitFor(longest, Math.max(MIN_PART, need - b1))) {
          continue;
        }
        longest = Math.max(ls, lk);
        if (Math.floor((missingPairs(spairs, kspairs) + 1) / 2) > limitFor(longest, Math.max(MIN_PART, need - b2))) {
          continue;
        }
        let d = distance(sound, ksound, limitFor(longest, Math.max(MIN_PART, need - b2)));
        const s1 = Math.floor((1000 * (longest - d)) / longest);
        if (s1 < MIN_PART || s1 + b2 < need) continue;
        longest = Math.max(lp, kspell.length);
        d = distance(spell, kspell, limitFor(longest, Math.max(MIN_PART, need - s1)));
        const s2 = Math.floor((1000 * (longest - d)) / longest);
        if (s2 < MIN_PART || s1 + s2 < need) continue;
        const score = Math.floor((s1 + s2) / 2);
        const sure = trusted || related(toks, ktoks) || gated(gate, toks, ktoks, named.slice(i, j).some(Boolean),
          index.lexicon, count, kcount);
        const have = best.get(k);
        if (!have || score > have[0] || (score === have[0] && (i < have[1] || (i === have[1] && j - i < have[2]))) ||
          (score === have[0] && sure && !have[3])) {
          best.set(k, [score, i, j - i, sure]);
        }
      }
    }
  }
  const out = [];
  for (const [k, [score, i, length, trusted]] of best) {
    if (trusted) continue;
    const key = index.keys[k][0];
    out.push([score, i, pyLower(key), key, { from: text.slice(ws[i][0], ws[i + length - 1][1]), to: key, score,
      words: [i, i + length] }]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1] - b[1] || cmpStr(a[2], b[2]) || cmpStr(a[3], b[3]));
  return out.slice(0, limit).map((r) => r[4]);
}
