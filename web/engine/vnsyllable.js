// Flag tokens that carry Vietnamese letters but are not valid Vietnamese syllables (port of
// helper/vitranslate/vnsyllable.py). Only tokens with a Vietnamese-specific letter or a tone mark are checked; plain
// ASCII words (English terms, gene names) are ignored. The check is permissive: it rejects impossible spellings, not
// rare-but-real ones.
import { compile } from "./pyre.js";

const TONE_MARKS = new Set(["\u0300", "\u0301", "\u0303", "\u0309", "\u0323"]);
const VN_MARKS = new Set(["\u0302", "\u0306", "\u031b"]); // circumflex, breve, horn
const D_BAR = "\u0111";

const ONSET = "(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnprstvx]|\u0111)?";
const NUCLEI = [
  "oai", "oay", "oeo", "u\u00e2y", "u\u00f4i", "uya", "uy\u00ea", "\u01b0\u01a1i", "\u01b0\u01a1u",
  "y\u00eau", "i\u00eau", "uyu",
  "ai", "ao", "au", "ay", "\u00e2u", "\u00e2y", "eo", "\u00eau", "ia", "i\u00ea", "iu", "oa", "o\u0103",
  "oe", "oi", "\u00f4i", "\u01a1i", "ua", "u\u00e2", "u\u00ea", "ui", "u\u00f4", "u\u01a1", "uy",
  "\u01b0a", "\u01b0i", "\u01b0\u01a1", "\u01b0u", "y\u00ea", "oo",
  "a", "\u0103", "\u00e2", "e", "\u00ea", "i", "o", "\u00f4", "\u01a1", "u", "\u01b0", "y",
];
const CODA = "(?:ch|ng|nh|c|m|n|p|t)?";
const SYLLABLE_RE = compile("^" + ONSET + "(?:" +
  [...NUCLEI].sort((a, b) => Array.from(b).length - Array.from(a).length).join("|") + ")" + CODA + "$");
const TOKEN_RE = compile(String.raw`[^\W\d_]+`);

export function needsCheck(token) {
  const nfd = token.toLowerCase().normalize("NFD");
  return nfd.includes(D_BAR) || Array.from(nfd).some((ch) => TONE_MARKS.has(ch) || VN_MARKS.has(ch));
}

export function isValid(token) {
  const nfd = Array.from(token.toLowerCase().normalize("NFD"));
  if (nfd.filter((ch) => TONE_MARKS.has(ch)).length > 1) return false;
  const base = nfd.filter((ch) => !TONE_MARKS.has(ch)).join("").normalize("NFC");
  return SYLLABLE_RE.match(base) !== null;
}

/** Tokens with Vietnamese letters that are not valid syllables, first occurrence order, no duplicates. */
export function suspicious(text) {
  const seen = new Set();
  const out = [];
  for (const token of TOKEN_RE.findall(text.normalize("NFC"))) {
    if (seen.has(token) || !needsCheck(token)) continue;
    seen.add(token);
    if (!isValid(token)) out.push(token);
  }
  return out;
}
