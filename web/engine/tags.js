// Inline tag tokens that carry formatting through translation (port of helper/vitranslate/tags.py).
// Paired tags <gN>..</gN> wrap a formatted span; self-closing <xN/> stands for a fixed element (tab, break, field,
// image). Ids are positive integers, unique within one segment. Python's \d is any Unicode decimal digit.
// Indices are UTF-16 units throughout; counts that Python takes with len() use code points (cpLen).
import { pyInt, isSpace, isAlnum, cpAt, cpBefore, cpLen, hasNonSpace, pyRound, pyStrip, firstCp, lastCp,
  nextIndex } from "./py.js";
import { compile } from "./pyre.js";

const TOKEN_SRC = "<(\\/?)g(\\p{Nd}+)>|<x(\\p{Nd}+)\\/>";

/** A fresh global TOKEN_RE (no shared lastIndex state); used by the OOXML codec. */
export function tokenRe() {
  return new RegExp(TOKEN_SRC, "gu");
}

/** TOKEN_RE.finditer: {index, end, text, close, g, x} per token (g / x are ints or null). */
export function* tokens(text) {
  const re = tokenRe();
  let m;
  while ((m = re.exec(text)) !== null) {
    yield { index: m.index, end: m.index + m[0].length, text: m[0], close: m[1] === "/",
      g: m[2] !== undefined ? pyInt(m[2]) : null, x: m[3] !== undefined ? pyInt(m[3]) : null };
  }
}

export const TOKEN_RE = compile(String.raw`<(/?)g(\d+)>|<x(\d+)/>`);
const LOOSE_RE = compile(String.raw`<\s*(/?)\s*([gGxX])\s*(\d+)\s*(/?)\s*>`);
// Markup that is not a canonical token. "complete" = whole loose g/x tag, whitelisted inline html tag, or html-escaped
// token (repair may delete these); "frag" = broken fragment such as "<g2" (check only flags it).
const STRAY_RE = compile(
  String.raw`(?P<complete><\s*/?\s*[gGxX]\s*\d+\s*/?\s*>` +
  String.raw`|(?i:</?(?:b|i|u|s|em|strong|sup|sub|span|font|br|small|mark|a|p)(?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>=]+))*\s*/?>)` +
  String.raw`|(?i:&lt;/?[gx]\d+/?&gt;))` +
  String.raw`|(?P<frag></?\s*[gGxX]\s*\d)`);
const G_TOKEN_RE = compile(String.raw`</?g\d+>`);
const EMPTY_PAIR_RE = compile(String.raw`<g(\d+)>((?:\s|<x\d+/>)*)</g\1>`);
const SPACES_RE = compile(String.raw`\s+`);
const CLOSING_PUNCT = ":,;.)";
const OPENING_PUNCT = "([{\u201c\u2018";

/** "%d" % int(digits): the decimal form of a Unicode digit string (exact for any length). */
function intText(digits) {
  const n = pyInt(digits);
  return Number.isSafeInteger(n) ? String(n) : BigInt(String(digits).replace(/\p{Nd}/gu, (d) => String(pyInt(d)))).toString();
}

function squash(text) {
  return SPACES_RE.sub("", text);
}

/** (g ids in opening order, x ids in order). */
export function ids(text) {
  const g = [];
  const x = [];
  for (const t of tokens(text)) {
    if (t.x !== null) x.push(t.x);
    else if (!t.close) g.push(t.g);
  }
  return [g, x];
}

export function stripTags(text, keepX = false) {
  if (keepX) return text.replace(/<\/?g\p{Nd}+>/gu, "");
  return text.replace(tokenRe(), "");
}

/** Fix spacing / case variants such as "< G1 >" or "</ g1 >" produced by the model. Loose matches that appear in the
 * plain text of src (ignoring whitespace) are legitimate source text and are kept. Self-closing g tags have no
 * meaning and are dropped; any loose x tag becomes <xN/>. */
export function normalizeTokens(text, src = "") {
  const plainSrc = squash(TOKEN_RE.sub("", src));
  return LOOSE_RE.sub((m) => {
    if (plainSrc.includes(squash(m.group(0)))) return m.group(0);
    const [slash, letter, num, selfclose] = m.groups();
    if (letter.toLowerCase() === "x") return "<x" + intText(num) + "/>";
    if (selfclose) return "";
    return "<" + slash + "g" + intText(num) + ">";
  }, text);
}

/** Stray markup matches in text: not canonical tokens, not legitimate source text (whitespace ignored). */
function strays(text, plainSrc, completeOnly = false) {
  const squashedSrc = squash(plainSrc);
  const out = [];
  for (const m of STRAY_RE.finditer(text)) {
    const piece = m.group(0);
    if (TOKEN_RE.fullmatch(piece) || squashedSrc.includes(squash(piece))) continue;
    if (completeOnly && !m.group("complete")) continue;
    out.push(m);
  }
  return out;
}

/** Stray pieces (complete tags and fragments) in out that check() reports, after the source exception. */
export function strayMarkup(src, out) {
  return strays(out, TOKEN_RE.sub("", src)).map((m) => m.group(0));
}

const list = (ns) => "[" + ns.join(", ") + "]";
const numeric = (a, b) => a - b;

/** List of problems of out against the tags of src; empty list means tag-exact. */
export function check(src, out) {
  const [srcG, srcX] = ids(src);
  const errors = [];
  const stack = [];
  const opened = [];
  const xs = [];
  const openAt = new Map();
  for (const m of TOKEN_RE.finditer(out)) {
    if (m.group(3) !== null) {
      xs.push(pyInt(m.group(3)));
      continue;
    }
    const n = pyInt(m.group(2));
    if (m.group(1)) {
      if (stack.length && stack[stack.length - 1] === n) {
        stack.pop();
        if (!hasNonSpace(stripTags(out.slice(openAt.get(n), m.start())))) errors.push("empty <g" + n + ">");
      } else {
        errors.push("crossed or unopened </g" + n + ">");
        const at = stack.indexOf(n);
        if (at >= 0) stack.splice(at, 1);
      }
    } else {
      opened.push(n);
      stack.push(n);
      openAt.set(n, m.end());
    }
  }
  for (const n of stack) errors.push("unclosed <g" + n + ">");
  const openedSet = new Set(opened);
  const srcSet = new Set(srcG);
  const missing = [...srcSet].filter((n) => !openedSet.has(n)).sort(numeric);
  const extra = [...openedSet].filter((n) => !srcSet.has(n)).sort(numeric);
  const dup = [...new Set(opened.filter((n) => opened.indexOf(n) !== opened.lastIndexOf(n)))].sort(numeric);
  if (missing.length) errors.push("missing " + missing.map((n) => "<g" + n + ">").join(", "));
  if (extra.length) errors.push("invented " + extra.map((n) => "<g" + n + ">").join(", "));
  if (dup.length) errors.push("duplicated " + dup.map((n) => "<g" + n + ">").join(", "));
  const a = [...xs].sort(numeric);
  const b = [...srcX].sort(numeric);
  if (a.length !== b.length || a.some((v, k) => v !== b[k])) {
    errors.push("placeholders differ: want " + list(b) + " got " + list(a));
  }
  for (const piece of strayMarkup(src, out)) errors.push("stray markup: " + piece);
  return errors;
}

function plainLen(text) {
  return cpLen(TOKEN_RE.sub("", text));
}

/** Python text[:i] for a find() result (-1 = all but the last character). */
function prefix(text, i) {
  return i >= 0 ? text.slice(0, i) : text.slice(0, text.length - cpBefore(text, text.length).length);
}

/** Index in out matching the relative plain-text position token has in src, moved to a word end. */
function relativePos(src, out, token) {
  const i = src.indexOf(token);
  const frac = plainLen(prefix(src, i)) / Math.max(plainLen(src), 1);
  const total = plainLen(out);
  const target = pyRound(frac * total);
  if (target <= 0) return 0;
  if (target >= total) return out.length;
  let count = 0;
  let pos = 0;
  while (pos < out.length) {
    const m = TOKEN_RE.match(out, pos);
    if (m) {
      pos = m.end();
      continue;
    }
    if (count === target) break;
    count += 1;
    pos = nextIndex(out, pos);
  }
  while (pos < out.length && !isSpace(cpAt(out, pos)) && !TOKEN_RE.match(out, pos)) pos = nextIndex(out, pos);
  return pos;
}

/** Turn crossed pairs into nested ones: close inner tags before the outer close, drop their later close. */
function uncross(out) {
  const res = [];
  const stack = [];
  const drop = new Map();
  let pos = 0;
  for (const m of TOKEN_RE.finditer(out)) {
    res.push(out.slice(pos, m.start()));
    pos = m.end();
    if (m.group(3) !== null) {
      res.push(m.group(0));
      continue;
    }
    const n = pyInt(m.group(2));
    if (!m.group(1)) {
      stack.push(n);
      res.push(m.group(0));
      continue;
    }
    if (drop.get(n)) {
      drop.set(n, drop.get(n) - 1);
      continue;
    }
    if (!stack.includes(n)) continue;
    while (stack[stack.length - 1] !== n) {
      const inner = stack.pop();
      res.push("</g" + inner + ">");
      drop.set(inner, (drop.get(inner) || 0) + 1);
    }
    stack.pop();
    res.push(m.group(0));
  }
  res.push(out.slice(pos));
  return res.join("");
}

/** Ladder level 1: deterministic fixes. Run check() afterwards; leftovers go to level 2. */
export function repair(src, out) {
  out = normalizeTokens(out, src);
  const [srcG, srcX] = ids(src);
  const allowedG = new Set(srcG);
  const allowedX = new Set(srcX);
  const plainSrc = TOKEN_RE.sub("", src);
  const step = (text) => {
    const seenX = new Set();
    text = TOKEN_RE.sub((m) => {
      if (m.group(3) !== null) {
        const n = pyInt(m.group(3));
        if (!allowedX.has(n) || seenX.has(n)) return "";
        seenX.add(n);
        return m.group(0);
      }
      return allowedG.has(pyInt(m.group(2))) ? m.group(0) : "";
    }, text);
    for (const m of strays(text, plainSrc, true).reverse()) text = text.slice(0, m.start()) + text.slice(m.end());
    text = uncross(text);
    return EMPTY_PAIR_RE.sub((m) => (m.group(2).includes("<x") ? pyStrip(m.group(2)) : m.group(2)), text);
  };
  for (;;) {
    const next = step(out);
    if (next === out) break;
    out = next;
  }
  const present = new Set(ids(out)[1]);
  const missing = srcX.filter((n) => !present.has(n));
  const plan = missing.map((n, k) => [relativePos(src, out, "<x" + n + "/>"), k, "<x" + n + "/>"]);
  plan.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (const [pos, , token] of plan) out = out.slice(0, pos) + token + out.slice(pos);
  return out;
}

/** Nearest plain (non-g-tag) character before index i, or "". */
function plainLeft(text, i) {
  const ends = new Map();
  for (const m of G_TOKEN_RE.finditer(text)) ends.set(m.end(), m.start());
  while (ends.has(i)) i = ends.get(i);
  return i > 0 ? cpBefore(text, i) : "";
}

/** Nearest plain (non-g-tag) character at or after index i, or "". */
function plainRight(text, i) {
  const starts = new Map();
  for (const m of G_TOKEN_RE.finditer(text)) starts.set(m.start(), m.end());
  while (starts.has(i)) i = starts.get(i);
  return i < text.length ? cpAt(text, i) : "";
}

function glued(text, i) {
  const left = plainLeft(text, i);
  const right = plainRight(text, i);
  return Boolean(left) && Boolean(right) && (isAlnum(right) || OPENING_PUNCT.includes(right)) &&
    (isAlnum(left) || CLOSING_PUNCT.includes(left));
}

/** Re-insert a space at a tag edge when the source had one there and the model glued two words (or a word and an
 * opening bracket); at a placeholder edge when the source had one there and the output has text on that side. */
export function restoreSpaces(src, out) {
  const need = [];
  for (const n of ids(src)[0]) {
    const openTok = "<g" + n + ">";
    const closeTok = "</g" + n + ">";
    const o = src.indexOf(openTok);
    const c = o < 0 ? -1 : src.indexOf(closeTok, o);
    if (o < 0 || c < 0) continue;
    const inner = src.slice(o + openTok.length, c);
    const before = o > 0 ? cpBefore(src, o) : "";
    const after = cpAt(src, c + closeTok.length);
    need.push([n, isSpace(before) || isSpace(firstCp(inner)), isSpace(after) || isSpace(lastCp(inner))]);
  }
  let res = out;
  for (const [n, needBefore, needAfter] of need) {
    if (needBefore) {
      const i = res.indexOf("<g" + n + ">");
      if (i >= 0 && glued(res, i)) res = res.slice(0, i) + " " + res.slice(i);
    }
    if (needAfter) {
      const tok = "</g" + n + ">";
      const i = res.indexOf(tok);
      if (i >= 0 && glued(res, i + tok.length)) {
        const j = i + tok.length;
        res = res.slice(0, j) + " " + res.slice(j);
      }
    }
  }
  for (const n of ids(src)[1]) {
    const tok = "<x" + n + "/>";
    const s = src.indexOf(tok);
    let i = res.indexOf(tok);
    if (i < 0) continue;
    if (isSpace(plainLeft(src, s)) && hasNonSpace(plainLeft(res, i))) {
      res = res.slice(0, i) + " " + res.slice(i);
      i += 1;
    }
    const j = i + tok.length;
    if (isSpace(plainRight(src, s + tok.length)) && hasNonSpace(plainRight(res, j))) {
      res = res.slice(0, j) + " " + res.slice(j);
    }
  }
  return res;
}
