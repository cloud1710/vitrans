// Python string / number semantics used by the helper (helper/vitranslate), so the JavaScript port takes the same
// decisions: str.isspace / strip / split / isalpha, len() in code points, int(), float() and round().
// JavaScript's trim() and \s differ from Python's whitespace (U+FEFF, U+0085, U+001C-U+001F), and String.length
// counts UTF-16 units.
import { CASEFOLD, DIGIT_EXTRA, NAME_OK } from "./unitables.js";

// Characters for which Python's str.isspace() is true (bidi class WS / B / S or category Zs).
export const PY_WS = "\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u{1680}\\u{2000}-\\u{200a}\\u{2028}\\u{2029}" +
  "\\u{202f}\\u{205f}\\u{3000}";
const WS_ONE = new RegExp("^[" + PY_WS + "]$", "u");
const WS_SPLIT = new RegExp("[" + PY_WS + "]+", "gu");
const LEAD_WS = new RegExp("^[" + PY_WS + "]+", "u");
const TRAIL_WS = new RegExp("[" + PY_WS + "]+$", "u");
const ALPHA = /\p{L}/u;
const ND = /\p{Nd}/u;

export function isSpace(ch) {
  return WS_ONE.test(ch);
}

/** True when s has a character other than Python whitespace (Python: bool(s.strip())). */
export function hasNonSpace(s) {
  return s.replace(WS_SPLIT, "") !== "";
}

function stripSet(s, chars, left, right) {
  const set = new Set(chars);
  const cps = Array.from(s);
  let i = 0;
  let j = cps.length;
  if (left) while (i < j && set.has(cps[i])) i++;
  if (right) while (j > i && set.has(cps[j - 1])) j--;
  return cps.slice(i, j).join("");
}

export function pyStrip(s, chars) {
  if (chars !== undefined) return stripSet(s, chars, true, true);
  return s.replace(LEAD_WS, "").replace(TRAIL_WS, "");
}

export function pyLstrip(s, chars) {
  if (chars !== undefined) return stripSet(s, chars, true, false);
  return s.replace(LEAD_WS, "");
}

export function pyRstrip(s, chars) {
  if (chars !== undefined) return stripSet(s, chars, false, true);
  return s.replace(TRAIL_WS, "");
}

export function pySplit(s) {
  return s.split(WS_SPLIT).filter((w) => w !== "");
}

export function isAlpha(ch) {
  return ALPHA.test(ch);
}

/** Python: any(c.isalpha() for c in s). */
export function hasAlpha(s) {
  return ALPHA.test(s);
}

/** len() of a Python str: code points (a lone surrogate counts as one). */
export function cpLen(s) {
  let n = 0;
  for (const _ of s) n++; // eslint-disable-line no-unused-vars
  return n;
}

/** Value 0-9 of a Unicode decimal digit (Nd digits come in runs of ten starting at zero). */
function digitValue(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x30 && cp <= 0x39) return cp - 0x30;
  let start = cp;
  while (start > 0 && ND.test(String.fromCodePoint(start - 1))) start--;
  return (cp - start) % 10;
}

function asciiDigits(s) {
  let out = "";
  for (const ch of s) out += ND.test(ch) ? String(digitValue(ch)) : ch;
  return out;
}

function valueError(s, what) {
  const e = new Error("ValueError: invalid literal for " + what + ": " + JSON.stringify(s));
  e.name = "ValueError";
  return e;
}

/** int(s) for a str: whitespace, sign, Unicode decimal digits, single underscores between digits. */
export function pyInt(s) {
  const t = asciiDigits(pyStrip(String(s)));
  if (!/^[+-]?[0-9](?:_?[0-9])*$/.test(t)) throw valueError(s, "int()");
  return Number(t.replace(/_/g, ""));
}

const FLOAT_RE = /^[+-]?(?:(?:[0-9](?:_?[0-9])*)?\.[0-9](?:_?[0-9])*|[0-9](?:_?[0-9])*\.?)(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/;
const SPECIAL_RE = /^([+-]?)(inf|infinity|nan)$/i;

/** float(s) for a str. */
export function pyFloat(s) {
  const t = asciiDigits(pyStrip(String(s)));
  const sp = SPECIAL_RE.exec(t);
  if (sp) return sp[2].toLowerCase() === "nan" ? NaN : (sp[1] === "-" ? -Infinity : Infinity);
  if (!FLOAT_RE.test(t)) throw valueError(s, "float()");
  return Number(t.replace(/_/g, ""));
}

/** round(x) -> int: half to even on the exact double value. */
export function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f; // exact for doubles of these magnitudes
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** round(x, n) -> float: the exact binary value rounded half to even at n decimals. */
export function pyRoundN(x, n) {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e21) return x;
  const neg = x < 0 || Object.is(x, -0);
  const s = Math.abs(x).toFixed(100);
  const dot = s.indexOf(".");
  const intPart = s.slice(0, dot);
  const frac = s.slice(dot + 1);
  const kept = frac.slice(0, n);
  const rest = frac.slice(n);
  let up;
  if (rest[0] > "5") up = true;
  else if (rest[0] < "5") up = false;
  else if (/[1-9]/.test(rest.slice(1))) up = true;
  else up = Number((intPart + kept).slice(-1)) % 2 === 1; // exact tie: to even
  let digits = BigInt(intPart + kept) + (up ? 1n : 0n);
  let str = digits.toString().padStart(n + 1, "0");
  str = n > 0 ? str.slice(0, str.length - n) + "." + str.slice(str.length - n) : str;
  const v = Number(str);
  return neg ? -v : v;
}

export function pyLower(s) {
  return s.toLowerCase();
}

// Letters of the Latin script whose Unicode name does not start with LATIN (and that NFKC does not fold): the helper
// tests names, the browser tests scripts. Found by comparing both over every code point (Unicode 14).
const NAMED_NON_LATIN = new Set([0x2132, 0x214e, 0x2183]);
const SKIP_SCRIPTS = /\p{Lm}|\p{sc=Latin}|\p{sc=Greek}/u;

/** document.py _non_latin: a letter outside the Latin and Greek scripts, after NFKC, modifier letters excepted. */
export function nonLatin(text) {
  for (const c of text.normalize("NFKC")) {
    if (!ALPHA.test(c)) continue;
    if (NAMED_NON_LATIN.has(c.codePointAt(0))) return true;
    if (!SKIP_SCRIPTS.test(c)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- M2: more str predicates (per code point)

function inRanges(ranges, cp) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid][0]) hi = mid - 1;
    else if (cp > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

const ALNUM = /[\p{L}\p{N}]/u;
const UPPER = /\p{Uppercase}/u;
const LOWER = /\p{Lowercase}/u;
const TITLE = /\p{Lt}/u;
const FOLD = new Map(CASEFOLD.map(([cp, v]) => [cp, String.fromCodePoint(...v)]));

/** The code point starting at UTF-16 index i, or "" past the end (Python: text[i] on code points). */
export function cpAt(s, i) {
  if (i < 0 || i >= s.length) return "";
  return String.fromCodePoint(s.codePointAt(i));
}

/** The code point ending at UTF-16 index i, or "" at the start (Python: text[i - 1]). */
export function cpBefore(s, i) {
  if (i <= 0 || i > s.length) return "";
  const lo = s.charCodeAt(i - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && i >= 2) {
    const hi = s.charCodeAt(i - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) return s.slice(i - 2, i);
  }
  return s[i - 1];
}

/** UTF-16 index after the code point at i (Python: i + 1). */
export function nextIndex(s, i) {
  return i + (s.codePointAt(i) > 0xffff ? 2 : 1);
}

/** First code point of s, "" when empty (Python: s[:1]). */
export function firstCp(s) {
  return cpAt(s, 0);
}

/** Last code point of s, "" when empty (Python: s[-1:]). */
export function lastCp(s) {
  return cpBefore(s, s.length);
}

/** str.isdigit() of one character: decimal digits and digit-valued characters such as superscripts. */
export function isDigit(ch) {
  if (!ch) return false;
  return ND.test(ch) || inRanges(DIGIT_EXTRA, ch.codePointAt(0));
}

/** str.isalnum() of one character. */
export function isAlnum(ch) {
  return Boolean(ch) && ALNUM.test(ch);
}

/** str.isupper() of one character. */
export function isUpperCh(ch) {
  return Boolean(ch) && UPPER.test(ch);
}

/** str.islower() of one character. */
export function isLowerCh(ch) {
  return Boolean(ch) && LOWER.test(ch);
}

/** str.isupper(): no lower-case or title-case character and at least one upper-case one. */
export function pyIsUpper(s) {
  let cased = false;
  for (const c of s) {
    if (LOWER.test(c) || TITLE.test(c)) return false;
    if (UPPER.test(c)) cased = true;
  }
  return cased;
}

/** str.islower(): no upper-case or title-case character and at least one lower-case one. */
export function pyIsLower(s) {
  let cased = false;
  for (const c of s) {
    if (UPPER.test(c) || TITLE.test(c)) return false;
    if (LOWER.test(c)) cased = true;
  }
  return cased;
}

/** str.isalpha(): not empty, every character a letter. */
export function pyIsAlpha(s) {
  if (!s) return false;
  for (const c of s) if (!ALPHA.test(c)) return false;
  return true;
}

/** str.isascii() ("" is ASCII). */
export function pyIsAscii(s) {
  return /^[\x00-\x7f]*$/.test(s);
}

/** str.casefold(). */
export function pyCasefold(s) {
  let out = "";
  for (const c of s) out += FOLD.has(c.codePointAt(0)) ? FOLD.get(c.codePointAt(0)) : c.toLowerCase();
  return out;
}

/** unicodedata.name(ch, "").startswith(("LATIN", "GREEK", "MICRO SIGN")) for a letter (translate._suspect). */
export function latinGreekName(ch) {
  return Boolean(ch) && inRanges(NAME_OK, ch.codePointAt(0));
}

/** str.splitlines() (no keepends): \n \r \r\n \v \f \x1c \x1d \x1e \x85 U+2028 U+2029 end a line. */
export function pySplitlines(s) {
  const parts = s.split(/\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** Python str ordering (code points). */
export function cmpStr(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}
