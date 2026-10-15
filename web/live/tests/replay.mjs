// Replay harness for the live segmenter (web/live/segmenter.js), used by replay.test.mjs and tools/live_cut_replay.mjs.
// A lecture script (one sentence per line) -> words with spoken times at about 150 words / min (pauses after a
// sentence, shorter ones after a comma, a hesitation of 0.6-1.5 s now and then anywhere) -> caption snapshots the way
// a source shows them -> the segmenter, ticked every 200 ms as live.js does -> metrics. Sources:
//   safari: the browser's speech recognizer as iPhone Safari shows it: interim text without punctuation or capitals,
//     the last words rewritten while the speaker talks (a word first shown wrong and corrected 0.3-0.9 s later,
//     sometimes through a second wrong form; a long word now and then shown as two pieces, then joined; a word now and
//     then corrected only 1.5-3.5 s later); every 30-60 s the recognition ends (after a sentence, or 30 % of the time
//     in the middle of one): its final text with punctuation, an empty snapshot, then a new recognition from word 0
//   lc: Windows Live Captions through the helper: punctuated, capitals, the visible window (the last 300 characters,
//     so the first word is often cut), the last word now and then first shown wrong, a comma now and then missing,
//     an end mark that half of the time appears only with the next word (or 0.6 s later)
// Metrics: latency = commit time - the end of the word in the speech (median / p90 over the script words found again
// in the committed text, revisions included); words per commit (median / max); bad cuts = commits that end on a
// function word or cut inside a multiword term of the pathology packs, as a share of the commits; revise events;
// script words missed and committed words extra (a duplicate commit shows here). Pure, seeded, no clock.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createSegmenter, normWord } from "../segmenter.js";
import { loadPack } from "../../engine/packs.js";

export const FUNCTION_WORDS = new Set(["the", "a", "an", "of", "to", "in", "with", "and", "or", "for", "by", "on", "at",
  "from", "as", "that", "is", "are", "was", "were", "be", "this", "these", "its", "their"]);
export const TICK_MS = 200;  // live.js TICK_MS

export function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Script words with spoken times: [{w (as written), norm, start, end, sentEnd}]; the whole run lasts n * 60000 / wpm. */
export function speechWords(text, seed, wpm = 150) {
  const rnd = seeded(seed);
  const out = [];
  for (const line of String(text).split(/\n+/)) {
    const toks = line.trim().split(/\s+/).filter((w) => normWord(w));
    toks.forEach((w, i) => {
      const sentEnd = i === toks.length - 1;
      let gap = 0;
      if (sentEnd) gap = 350 + 550 * rnd();
      else if (/[,;:]$/.test(w)) gap = 120 + 230 * rnd();
      else if (rnd() < 0.03) gap = 600 + 900 * rnd();
      out.push({ w, norm: normWord(w), dur: (0.8 + 0.4 * rnd()) * (2 + normWord(w).length), gap, sentEnd });
    });
  }
  const gaps = out.reduce((a, x) => a + x.gap, 0);
  const durs = out.reduce((a, x) => a + x.dur, 0);
  const scale = Math.max(0.1, (out.length * 60000 / wpm - gaps) / durs);
  let t = 0;
  for (const x of out) {
    x.start = Math.round(t);
    t += x.dur * scale;
    x.end = Math.round(t);
    t += x.gap;
    delete x.dur;
    delete x.gap;
  }
  return out;
}

const plain = (w) => {
  const core = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return /\p{N}|.\p{Lu}/u.test(core) || core === "I" ? core : core.toLowerCase();
};

function wrongForm(p, rnd) {
  const ends = ["s", "er", "ing", "e", "ed", "al"];
  let v = p.slice(0, Math.max(1, Math.ceil(p.length * (0.4 + 0.3 * rnd())))) + ends[Math.floor(rnd() * ends.length)];
  if (normWord(v) === normWord(p)) v += "x";
  return v;
}

// [[t, text]] from per-word form timelines; words: [{at, forms: [[t, tokens[]]]}] of one recognition, until `until`
function render(list, until, out, finalText) {
  const times = new Set();
  for (const x of list) for (const [t] of x.forms) if (t < until) times.add(t);
  for (const t of [...times].sort((a, b) => a - b)) {
    const toks = [];
    for (const x of list) {
      if (x.forms[0][0] > t) break;
      let f = x.forms[0][1];
      for (const [ft, ff] of x.forms) if (ft <= t) f = ff;
      toks.push(...f);
    }
    out.push([t, toks.join(" ")]);
  }
  if (finalText !== undefined) {
    out.push([until, finalText]);
    out.push([until + 50, ""]);
  }
}

/** Snapshots [[t, text]] as iPhone Safari's recognizer shows the speech (see the header). */
export function safariSnapshots(words, seed, rates = {}) {
  const { split = 0.04, late = 0.05, quick = 0.3 } = rates;  // shares of the words rewritten each way
  const rnd = seeded(seed * 7919 + 17);
  const out = [];
  let session = [];
  let sessionStart = 0;
  let limit = 30000 + 30000 * rnd();
  let mid = rnd() < 0.3;
  let shift = 0;  // a word said while the recognizer restarts shows once it listens again
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const at = Math.max(w.end, shift);
    const p = plain(w.w);
    const forms = [];
    const r = rnd();
    if (p.length >= 8 && r < split) {
      const k = Math.floor(p.length / 2);
      forms.push([at, [p.slice(0, k), p.slice(k)]], [at + 400 + Math.round(600 * rnd()), [p]]);
    } else if (r < split + late) {
      forms.push([at, [wrongForm(p, rnd)]], [at + 1500 + Math.round(2000 * rnd()), [p]]);
    } else if (r < split + late + quick) {
      forms.push([at, [wrongForm(p, rnd)]]);
      let t2 = at + 300 + Math.round(600 * rnd());
      if (rnd() < 0.3) {
        forms.push([t2, [wrongForm(p, rnd)]]);
        t2 += 300 + Math.round(600 * rnd());
      }
      forms.push([t2, [p]]);
    } else {
      forms.push([at, [p]]);
    }
    if (!session.length) sessionStart = at;
    session.push({ w, forms });
    const last = i === words.length - 1;
    if (last || (at - sessionStart >= limit && (mid || w.sentEnd))) {
      const end = at + 250;
      render(session, end, out, session.map((x) => x.w.w).join(" "));
      shift = end + 300;
      session = [];
      limit = 30000 + 30000 * rnd();
      mid = rnd() < 0.3;
    }
  }
  return out;
}

/** Snapshots [[t, text]] as Windows Live Captions shows the speech through the helper (see the header). */
export function lcSnapshots(words, seed, windowChars = 300) {
  const rnd = seeded(seed * 104729 + 3);
  const list = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let shownW = w.w;
    if (/,$/.test(shownW) && rnd() < 0.3) shownW = shownW.slice(0, -1);
    const forms = [];
    let endLate = null;
    if (w.sentEnd && /[.?!]$/.test(shownW) && rnd() < 0.5) {
      const next = words[i + 1];
      endLate = Math.min(next ? next.end : Infinity, w.end + 600);
      shownW = shownW.replace(/[.?!]+$/, "");
    }
    if (rnd() < 0.2) forms.push([w.end, [wrongForm(shownW, rnd)]], [w.end + 150 + Math.round(250 * rnd()), [shownW]]);
    else forms.push([w.end, [shownW]]);
    if (endLate !== null) forms.push([Math.max(endLate, forms[forms.length - 1][0] + 1), [w.w]]);
    list.push({ w, forms });
  }
  const raw = [];
  render(list, Infinity, raw);
  return raw.map(([t, text]) => [t, text.length > windowChars ? text.slice(-windowChars) : text]);
}

/** Feed snapshots to a segmenter, ticking every TICK_MS; the sentences in commit order (raw as last revised). */
export function replay(snaps, opts = {}) {
  const seg = createSegmenter(opts);
  const byId = new Map();
  const order = [];
  let revisions = 0;
  const take = (evs) => {
    for (const e of evs) {
      if (e.type === "commit") {
        const s = { id: e.id, raw: e.raw, t: e.t, reason: e.reason };
        byId.set(e.id, s);
        order.push(s);
      } else if (e.type === "revise") {
        revisions += 1;
        const s = byId.get(e.id);
        if (s) s.raw = e.raw;
      }
    }
  };
  let tick = 0;
  for (const [t, text] of snaps) {
    while (tick <= t) { take(seg.tick(tick)); tick += TICK_MS; }
    take(seg.push(text, t));
  }
  const endT = snaps.length ? snaps[snaps.length - 1][0] : 0;
  while (tick <= endT + 3000) { take(seg.tick(tick)); tick += TICK_MS; }
  take(seg.flush(tick));
  return { sentences: order, revisions };
}

/** Multiword English keys of the pathology / molecular packs (includes expanded as the engine reads them), as arrays
 * of words (as written). */
export async function packTerms(packsDir) {
  const reader = (dir) => async (f) => (existsSync(dir + f) ? readFileSync(dir + f, "utf8") : null);
  const seen = new Set();
  const out = [];
  for (const id of readdirSync(packsDir).sort()) {
    if (!/^(pathology|molecular)/.test(id)) continue;
    const pack = await loadPack(reader(packsDir + id + "/"), reader(packsDir + "_shared/"));
    for (const [en] of pack.glossary) {
      const ws = en.split(/\s+/).filter((w) => normWord(w));
      const key = ws.map(normWord).join(" ");
      if (ws.length >= 2 && !seen.has(key)) {
        seen.add(key);
        out.push(ws);
      }
    }
  }
  return out;
}

const quantile = (xs, q) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

// pairs [i in a, j in b] of a longest common subsequence
function lcsPairs(a, b) {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** Metrics of one replay (see the header); terms: packTerms(). Raw lists are kept for pooling over seeds. */
export function measure(words, run, terms = []) {
  const script = words.map((w) => w.norm);
  const toks = [];
  run.sentences.forEach((s, si) => {
    for (const x of s.raw.split(/\s+/)) {
      const n = normWord(x);
      if (n) toks.push({ n, t: s.t, si });
    }
  });
  const pairs = lcsPairs(script, toks.map((x) => x.n));
  const lat = pairs.map(([i, j]) => toks[j].t - words[i].end);
  const scriptOf = new Map(pairs.map(([i, j]) => [j, i]));
  const inside = new Array(script.length).fill(false);  // a cut after word j splits a term
  const byFirst = new Map();
  for (const term of terms.map((ws) => ws.map(normWord))) {
    if (!byFirst.has(term[0])) byFirst.set(term[0], []);
    byFirst.get(term[0]).push(term);
  }
  for (let i = 0; i < script.length; i++) {
    for (const term of byFirst.get(script[i]) || []) {
      if (term.every((x, k) => script[i + k] === x)) for (let k = 0; k < term.length - 1; k++) inside[i + k] = true;
    }
  }
  const sizes = [];
  let badEnd = 0;
  let termSplit = 0;
  let mid = 0;  // cuts where the script has no punctuation (inside a clause: informational)
  const badList = [];
  let j = 0;
  run.sentences.forEach((s, si) => {
    let lastJ = -1;
    let count = 0;
    while (j < toks.length && toks[j].si === si) { lastJ = j; count++; j++; }
    sizes.push(count);
    if (lastJ < 0) return;
    const fw = FUNCTION_WORDS.has(toks[lastJ].n);
    const si2 = scriptOf.get(lastJ);
    const split = si < run.sentences.length - 1 && si2 !== undefined && inside[si2];
    if (fw) badEnd++;
    if (split) termSplit++;
    if (si2 !== undefined && !/[.,;:?!]["')]*$/.test(words[si2].w)) mid++;
    if (fw || split) badList.push(s.raw.split(/\s+/).slice(-4).join(" ") + " |");
  });
  const reasons = {};
  for (const s of run.sentences) reasons[s.reason] = (reasons[s.reason] || 0) + 1;
  return {
    lat, sizes, commits: run.sentences.length, badEnd, termSplit, bad: badEnd + termSplit, badList, mid,
    revisions: run.revisions, missed: script.length - pairs.length, extra: toks.length - pairs.length,
    words: script.length, reasons,
  };
}

/** Pool the measures of several runs into one summary (latency in seconds). */
export function summarize(ms) {
  const lat = ms.flatMap((m) => m.lat);
  const sizes = ms.flatMap((m) => m.sizes);
  const commits = ms.reduce((a, m) => a + m.commits, 0);
  const sum = (k) => ms.reduce((a, m) => a + m[k], 0);
  const reasons = {};
  for (const m of ms) for (const [k, v] of Object.entries(m.reasons)) reasons[k] = (reasons[k] || 0) + v;
  return {
    latMedian: +(quantile(lat, 0.5) / 1000).toFixed(2), latP90: +(quantile(lat, 0.9) / 1000).toFixed(2),
    wpcMedian: quantile(sizes, 0.5), wpcMax: Math.max(...sizes), commits,
    badShare: +(sum("bad") / Math.max(1, commits)).toFixed(3), badEnd: sum("badEnd"), termSplit: sum("termSplit"),
    midShare: +(sum("mid") / Math.max(1, commits)).toFixed(3),
    revisions: sum("revisions"), missed: sum("missed"), extra: sum("extra"), words: sum("words"), reasons,
  };
}

/** One source over several seeds: the summary and the per-run measures. */
export function runSource(text, source, opts, seeds, terms, rates) {
  const ms = [];
  for (const seed of seeds) {
    const words = speechWords(text, seed);
    const snaps = source === "safari" ? safariSnapshots(words, seed, rates) : lcSnapshots(words, seed);
    ms.push(measure(words, replay(snaps, opts), terms));
  }
  return { summary: summarize(ms), runs: ms };
}
