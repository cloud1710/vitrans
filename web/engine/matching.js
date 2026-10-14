// Pack selection v1 (port of helper/vitranslate/matching.py): TF-IDF cosine between the document and each pack
// profile of the registry manifest, gated by the pack's detect keywords, then the family rule (a chosen pack brings
// its parent chain; at most MAX_FAMILIES families and MAX_PACKS packs; a child comes before its parent).
// The sums run in the helper's order (document terms in order of first occurrence, profile terms in manifest
// order), so scores match the helper's to the last bits except where Python's set order differs (terms that
// tokenize alike): tests compare scores with a tolerance and everything else exactly.
import { compile } from "./pyre.js";
import { cmpStr, cpLen } from "./py.js";

export const THRESHOLD = 0.10;
export const MIN_TERMS = 3;
export const MIN_DETECT = 2;
export const MAX_FAMILIES = 3; // families per document (family = a root pack + its selected children)
export const MAX_PACKS = 6; // hard cap on packs per document
const TOKEN_RE = compile(String.raw`[^\W_]+(?:-[^\W_]+)*`); // words; hyphenated compounds stay one token
const SEP = "\u0000";
const own = (obj, k) => obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, k);

export class Match {
  constructor(entry, score, matched = [], terms = 0, detectHits = 0, reason = "match") {
    this.entry = entry;
    this.score = score;
    this.matched = matched; // up to 8 terms, highest contribution first
    this.terms = terms; // distinct profile terms found in the document
    this.detectHits = detectHits; // occurrences of the pack's detect keywords
    this.reason = reason; // match | parent | user
  }

  with(reason) {
    return new Match(this.entry, this.score, this.matched, this.terms, this.detectHits, reason);
  }
}

export function tokens(text) {
  return TOKEN_RE.findall(text.toLowerCase());
}

/** Forms a final word may stand for, tried in order after the word itself. */
export function variants(word) {
  const out = [];
  const n = cpLen(word);
  if (n > 3 && word.endsWith("s")) {
    out.push(word.slice(0, -1));
    if (word.endsWith("es")) out.push(word.slice(0, -2));
    if (n > 4 && word.endsWith("ies")) out.push(word.slice(0, -3) + "y");
    if (n > 4 && word.endsWith("us")) out.push(word.slice(0, -2) + "i");
  }
  if (n > 4 && word.endsWith("i")) out.push(word.slice(0, -1) + "us");
  return out;
}

/** Map {term: occurrences} for the terms found in text (insertion order = order of first count, as Counter). */
export function countTerms(text, terms) {
  const index = new Map();
  const first = new Set();
  let longest = 0;
  for (const term of terms) {
    const key = tokens(term);
    if (key.length) {
      const k = key.join(SEP);
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(term);
      first.add(key[0]);
      longest = Math.max(longest, key.length);
    }
  }
  const toks = tokens(text);
  const counts = new Map();
  toks.forEach((tok, i) => {
    if (!first.has(tok) && !variants(tok).some((v) => first.has(v))) return;
    for (let n = 1; n <= Math.min(longest, toks.length - i); n++) {
      const gram = toks.slice(i, i + n);
      let hit = index.get(gram.join(SEP));
      if (hit === undefined) {
        for (const v of variants(gram[gram.length - 1])) {
          hit = index.get(gram.slice(0, -1).concat([v]).join(SEP));
          if (hit !== undefined) break;
        }
      }
      for (const term of hit || []) counts.set(term, (counts.get(term) || 0) + 1);
    }
  });
  return counts;
}

const pyStr = (v) => (v === null || v === undefined ? "None" : String(v));

/** A Match for every pack of the manifest, best first (no threshold, no gate). */
export function scorePacks(text, manifest) {
  const packs = (manifest && manifest.packs) || [];
  const idf = (manifest && manifest.idf) || {};
  const vocab = new Set();
  for (const entry of packs) {
    for (const t of Object.keys(entry.profile || {})) vocab.add(t);
    for (const t of entry.detect || []) vocab.add(t);
  }
  const counts = countTerms(text, vocab);
  const doc = new Map();
  for (const [t, c] of counts) doc.set(t, (1.0 + Math.log(c)) * (own(idf, t) ? idf[t] : 1.0));
  let sq = 0;
  for (const v of doc.values()) sq += v * v;
  const dnorm = Math.sqrt(sq);
  const out = [];
  for (const entry of packs) {
    const prof = entry.profile || {};
    let psq = 0;
    for (const w of Object.values(prof)) psq += w * w;
    const pnorm = Math.sqrt(psq);
    const contrib = new Map();
    for (const [t, v] of doc) if (own(prof, t)) contrib.set(t, v * prof[t]);
    let sum = 0;
    for (const v of contrib.values()) sum += v;
    const score = dnorm && pnorm ? sum / (dnorm * pnorm) : 0.0;
    const ranked = [...contrib.keys()].sort((a, b) => contrib.get(b) - contrib.get(a) || cmpStr(a, b));
    let hits = 0;
    for (const t of new Set(entry.detect || [])) hits += counts.get(t) || 0;
    out.push(new Match(entry, score, ranked.slice(0, 8), contrib.size, hits));
  }
  out.sort((a, b) => b.score - a.score || cmpStr(pyStr(a.entry.id), pyStr(b.entry.id)));
  return out;
}

/** Parent chain of pid inside byId, nearest first (a parent missing from the manifest ends it; cycles stop). */
function ancestors(pid, byId) {
  const chain = [];
  let parent = byId.get(pid).entry.parent;
  while (byId.has(parent) && parent !== pid && !chain.includes(parent)) {
    chain.push(parent);
    parent = byId.get(parent).entry.parent;
  }
  return chain;
}

/** The chosen matches in merge order, grouped by family (see the module notes); null = no limit. */
export function families(chosen, scored, maxFamilies = null, maxPacks = null) {
  const byId = new Map();
  for (const m of scored) byId.set(m.entry.id, m);
  for (const m of chosen) byId.set(m.entry.id, m);
  const groups = new Map(); // root id -> Map(pack id -> [depth, match])
  for (const m of chosen) {
    const pid = m.entry.id;
    const chain = ancestors(pid, byId);
    const root = chain.length ? chain[chain.length - 1] : pid;
    if (!groups.has(root)) groups.set(root, new Map());
    const members = groups.get(root);
    members.set(pid, [chain.length, m]);
    chain.forEach((anc, depth) => {
      if (!members.has(anc)) members.set(anc, [chain.length - 1 - depth, byId.get(anc).with("parent")]);
    });
  }
  const chosenIds = new Set(chosen.map((m) => m.entry.id));
  const best = (root) => Math.max(...[...groups.get(root)].filter(([pid]) => chosenIds.has(pid)).map(([, [, m]]) => m.score));
  const out = [];
  let used = 0;
  const roots = [...groups.keys()].sort((a, b) => best(b) - best(a) || cmpStr(pyStr(a), pyStr(b)));
  for (const root of roots) {
    if (maxFamilies !== null && used >= maxFamilies) break;
    const members = [...groups.get(root).values()]
      .sort((x, y) => y[0] - x[0] || y[1].score - x[1].score || cmpStr(pyStr(x[1].entry.id), pyStr(y[1].entry.id)));
    if (maxPacks !== null && out.length + members.length > maxPacks) continue;
    out.push(...members.map(([, m]) => m));
    used += 1;
  }
  return out;
}

export function selectPacks(text, manifest, { threshold = THRESHOLD, minTerms = MIN_TERMS, maxPacks = MAX_PACKS,
  minDetect = MIN_DETECT, maxFamilies = MAX_FAMILIES } = {}) {
  const scored = scorePacks(text, manifest);
  const chosen = scored.filter((m) => m.score >= threshold && m.terms >= minTerms && m.detectHits >= minDetect);
  return families(chosen, scored, maxFamilies, maxPacks);
}
