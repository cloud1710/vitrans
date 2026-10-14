// Python regular expressions in JavaScript: compile(pattern, flags) translates a pattern written in Python's `re`
// syntax into a JavaScript RegExp with Python's semantics, so the port can keep the helper's patterns verbatim.
// - \w = str.isalnum() or "_" ([\p{L}\p{N}_]), \d = Unicode decimal digits (\p{Nd}), \s = str.isspace() (PY_WS);
//   \b / \B use that \w (JavaScript's \b and \w are ASCII only, its \s differs);
// - "." is [^\n] (JavaScript's "." also stops at \r, U+2028, U+2029), [\s\S] under re.S; "^" / "$" / \A / \Z as in
//   Python ("$" also matches before a final "\n");
// - re.I (flag, leading (?i) or a scoped (?i:...)) is written out as classes of the case variants sre matches
//   (simple lower case + re._casefix's extra cases: "i" also matches U+0130 / U+0131, Cyrillic small letters their
//   U+1C80.. forms...); JavaScript's /i folds differently and its (?i:) modifiers are too new. Only a re.I pattern
//   with back-references (found while parsing) uses /i; a re.I class range wider than 0x400 is refused;
// - classes holding \W or \S, "{" that is not a quantifier, {,n}, (?P<name>...) / (?P=name), (?#...), octal / \x /
//   \u / \U escapes; \b and \B never match an empty string (Python 3.11);
// - finditer / sub / split follow Python 3.7+: after an empty match the next match may start at the same place if
//   it is not empty; sub templates follow sre's parse_template (\g<...>, \1.., octal \0 / \012, \b = backspace);
// - match objects report JavaScript (UTF-16) indices; every index the port computes stays in those units.
// Known differences, outside the helper's patterns: Python refuses variable-width look-behinds, JavaScript takes
// them; Unicode version drift (letters added after Unicode 14 are \w in JavaScript only). Unsupported Python syntax
// (atomic groups, possessive quantifiers, conditionals, verbose / ASCII / locale flags, \N{...}) raises PyReError.
import { PY_WS } from "./py.js";
import { LOWER_IRREGULAR, CASE_EXTRA } from "./unitables.js";

export class PyReError extends Error {
  constructor(message) {
    super(message);
    this.name = "PyReError";
  }
}

const WORD = "\\p{L}\\p{N}_";
const SPACE = PY_WS;
const ANY = "[\\s\\S]";
const START = "(?<!" + ANY + ")";
const END = "(?!" + ANY + ")";
const BOUNDARY = "(?:(?<=[" + WORD + "])(?![" + WORD + "])|(?<![" + WORD + "])(?=[" + WORD + "]))";
// sre's AT_NON_BOUNDARY fails on an empty string (start = end)
const NOT_BOUNDARY = "(?!" + START + END + ")(?:(?<=[" + WORD + "])(?=[" + WORD + "])|(?<![" + WORD + "])(?![" + WORD +
  "]))";
const WIDE_RANGE = 0x400; // re.I class ranges wider than this are refused, not approximated
const SYNTAX = new Set("^$\\.*+?()[]{}|/");
const CLASS_SPECIAL = new Set("\\]-[^");
const OCT = /[0-7]/;
const DIGIT = /[0-9]/;
const HEX = /^[0-9a-fA-F]+$/;
const ASCII_LETTER = /[A-Za-z]/;
const QUANT_BRACE = /^\{([0-9]*)(?:(,)([0-9]*))?\}/;
// re.I as Python's sre does it: a cased character matches every character whose simple lower case is its own simple
// lower case or one of that form's extra cases (re._casefix._EXTRA_CASES, generated into unitables.js). The parser
// writes those characters out as a class (JavaScript's /i folds U+0130 / U+0131 / U+1E9E ... differently).
const FIXES = new Map(CASE_EXTRA);
// Characters whose simple lower case (_sre.unicode_tolower) does not give them back through toUpperCase() as one
// code point (titlecase digraphs, Greek with prosgegrammeni, Kelvin / Angstrom / Ohm signs, U+0130, U+03F4, U+1E9E).
const IRREGULAR_FROM = new Map();
for (const [cp, lo] of LOWER_IRREGULAR) IRREGULAR_FROM.set(lo, [...(IRREGULAR_FROM.get(lo) || []), cp]);

function single(s) {
  return s.length > 0 && String.fromCodePoint(s.codePointAt(0)) === s ? s.codePointAt(0) : null;
}

/** _sre.unicode_tolower: the simple lower case (toLowerCase differs only for U+0130, which it writes as 2). */
function lowerS(cp) {
  if (cp === 0x130) return 0x69;
  const x = single(String.fromCodePoint(cp).toLowerCase());
  return x === null ? cp : x;
}

/** Every code point whose simple lower case is x. */
function withLower(x) {
  const out = [];
  if (lowerS(x) === x) out.push(x);
  const up = single(String.fromCodePoint(x).toUpperCase());
  if (up !== null && up !== x && lowerS(up) === x) out.push(up);
  return out.concat(IRREGULAR_FROM.get(x) || []);
}

/** Code points re.I matches for cp. */
function caseVariants(cp) {
  const lo = lowerS(cp);
  const out = new Set([cp]);
  for (const g of [lo, ...(FIXES.get(lo) || [])]) for (const c of withLower(g)) out.add(c);
  return [...out].sort((a, b) => a - b);
}

function hexCp(cp) {
  return "\\u{" + cp.toString(16) + "}";
}

function needsHex(cp) {
  return cp < 0x20 || cp === 0x7f || cp === 0x2028 || cp === 0x2029 || (cp >= 0xd800 && cp <= 0xdfff);
}

function litChar(cp) {
  if (needsHex(cp)) return hexCp(cp);
  const c = String.fromCodePoint(cp);
  return SYNTAX.has(c) ? "\\" + c : c;
}

function classChar(cp) {
  if (needsHex(cp)) return hexCp(cp);
  const c = String.fromCodePoint(cp);
  return CLASS_SPECIAL.has(c) ? "\\" + c : c;
}

class Parser {
  /** jsI: write re.I as JavaScript's /i (the second parse of a re.I pattern that has back-references: Python compares
   * the group text case-insensitively there); otherwise re.I becomes case-variant classes. */
  constructor(pattern, flags, jsI = false) {
    this.p = pattern;
    this.i = 0;
    this.groups = 0;
    this.names = new Map();
    this.open = new Set();
    this.globalI = flags.includes("i");
    this.scope = { i: this.globalI, s: flags.includes("s"), m: flags.includes("m") };
    this.wantJsI = jsI;
    this.jsI = false;
    this.sawBackref = false;
  }

  error(msg) {
    return new PyReError(msg + " at position " + this.i);
  }

  peek(k = 0) {
    return this.p[this.i + k];
  }

  nextCp() {
    const cp = this.p.codePointAt(this.i);
    this.i += cp > 0xffff ? 2 : 1;
    return cp;
  }

  run() {
    for (;;) { // global inline flags, only at the start (Python 3.11)
      const m = /^\(\?([aiLmsux]+)\)/.exec(this.p.slice(this.i));
      if (!m) break;
      this.applyFlags(m[1], "", this.scope, true);
      this.i += m[0].length;
    }
    this.jsI = this.globalI && this.wantJsI;
    const src = this.alternation(this.scope);
    if (this.i < this.p.length) {
      if (this.peek() === ")") throw this.error("unbalanced parenthesis");
      throw this.error("unexpected end of pattern");
    }
    return src;
  }

  applyFlags(on, off, scope, global) {
    for (const f of on + off) {
      if (!"ims".includes(f)) throw this.error("unsupported flag " + f);
    }
    for (const f of on) {
      if (global && f === "i") this.globalI = true;
      scope[f] = true;
    }
    for (const f of off) {
      if (f === "i" && this.jsI) throw this.error("cannot turn re.I off in a re.I pattern with back-references");
      scope[f] = false;
    }
  }

  alternation(scope) {
    const branches = [this.sequence(scope)];
    while (this.peek() === "|") {
      this.i++;
      branches.push(this.sequence(scope));
    }
    return branches.join("|");
  }

  sequence(scope) {
    let out = "";
    while (this.i < this.p.length) {
      const c = this.peek();
      if (c === "|" || c === ")") break;
      const atom = this.atom(scope);
      if (atom === null) continue;
      out += atom.src + this.quantifier(atom);
    }
    return out;
  }

  braceQuant() {
    const m = QUANT_BRACE.exec(this.p.slice(this.i));
    if (!m) return null;
    const lo = m[1] === "" ? 0 : Number(m[1]);
    if (!m[2]) {
      if (m[1] === "") return null; // "{}" is a literal
      return { len: m[0].length, src: "{" + lo + "}" };
    }
    if (m[3] !== "" && Number(m[3]) < lo) throw this.error("min repeat greater than max repeat");
    return { len: m[0].length, src: "{" + lo + "," + m[3] + "}" };
  }

  isQuant() {
    const c = this.peek();
    return c === "*" || c === "+" || c === "?" || (c === "{" && this.braceQuant() !== null);
  }

  quantifier(atom) {
    if (!this.isQuant()) return "";
    if (!atom.quantifiable) throw this.error("nothing to repeat");
    let q;
    const c = this.peek();
    if (c === "{") {
      const b = this.braceQuant();
      q = b.src;
      this.i += b.len;
    } else {
      q = c;
      this.i++;
    }
    if (this.peek() === "?") {
      q += "?";
      this.i++;
    } else if (this.peek() === "+") {
      throw this.error("possessive quantifiers are not supported");
    }
    if (this.isQuant()) throw this.error("multiple repeat");
    return q;
  }

  literal(cp, scope) {
    if (scope.i && !this.jsI) {
      const v = caseVariants(cp);
      if (v.length > 1) return "[" + v.map(classChar).join("") + "]";
    }
    return litChar(cp);
  }

  atom(scope) {
    const c = this.peek();
    if (c === "(") return this.group(scope);
    if (c === "[") {
      this.i++;
      return { src: this.charClass(scope), quantifiable: true };
    }
    if (c === ".") {
      this.i++;
      return { src: scope.s ? ANY : "[^\\n]", quantifiable: true };
    }
    if (c === "^") {
      this.i++;
      return { src: scope.m ? "(?:" + START + "|(?<=\\n))" : START, quantifiable: false };
    }
    if (c === "$") {
      this.i++;
      return { src: scope.m ? "(?=\\n|" + END + ")" : "(?=\\n?" + END + ")", quantifiable: false };
    }
    if (c === "\\") return this.escape(scope);
    if (c === "*" || c === "+" || c === "?") throw this.error("nothing to repeat");
    if (c === "{" && this.braceQuant() !== null) throw this.error("nothing to repeat");
    return { src: this.literal(this.nextCp(), scope), quantifiable: true };
  }

  group(scope) {
    this.i++; // "("
    if (this.peek() !== "?") {
      const n = ++this.groups;
      this.open.add(n);
      const body = this.alternation(scope);
      this.close();
      this.open.delete(n);
      return { src: "(" + body + ")", quantifiable: true };
    }
    this.i++; // "?"
    const rest = this.p.slice(this.i);
    if (rest.startsWith(":")) {
      this.i++;
      const body = this.alternation(scope);
      this.close();
      return { src: "(?:" + body + ")", quantifiable: true };
    }
    for (const [mark, js] of [["=", "(?="], ["!", "(?!"], ["<=", "(?<="], ["<!", "(?<!"]]) {
      if (rest.startsWith(mark)) {
        this.i += mark.length;
        const body = this.alternation(scope);
        this.close();
        return { src: js + body + ")", quantifiable: false };
      }
    }
    if (rest.startsWith("P<")) {
      const m = /^P<([^>]*)>/.exec(rest);
      if (!m || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(m[1])) throw this.error("bad character in group name");
      if (this.names.has(m[1])) throw this.error("redefinition of group name");
      this.i += m[0].length;
      const n = ++this.groups;
      this.names.set(m[1], n);
      this.open.add(n);
      const body = this.alternation(scope);
      this.close();
      this.open.delete(n);
      return { src: "(?<" + m[1] + ">" + body + ")", quantifiable: true };
    }
    if (rest.startsWith("P=")) {
      const m = /^P=([A-Za-z_][A-Za-z0-9_]*)\)/.exec(rest);
      if (!m || !this.names.has(m[1])) throw this.error("unknown group name");
      if (this.open.has(this.names.get(m[1]))) throw this.error("cannot refer to an open group");
      this.i += m[0].length;
      this.sawBackref = true;
      return { src: "\\k<" + m[1] + ">", quantifiable: true };
    }
    if (rest.startsWith("#")) {
      const end = this.p.indexOf(")", this.i);
      if (end < 0) throw this.error("missing ), unterminated comment");
      this.i = end + 1;
      return null;
    }
    const f = /^([aiLmsux]*)(?:-([imsx]*))?([:)])/.exec(rest);
    if (f && (f[1] || f[2])) {
      if (f[3] === ")") throw this.error("global flags not at the start of the expression");
      this.i += f[0].length;
      const inner = { ...scope };
      this.applyFlags(f[1], f[2] || "", inner, false);
      const body = this.alternation(inner);
      this.close();
      return { src: "(?:" + body + ")", quantifiable: true };
    }
    throw this.error("unsupported group (?" + rest.slice(0, 2));
  }

  close() {
    if (this.peek() !== ")") throw this.error("missing ), unterminated subpattern");
    this.i++;
  }

  /** Escape outside a class. */
  escape(scope) {
    this.i++; // backslash
    if (this.i >= this.p.length) throw this.error("bad escape (end of pattern)");
    const c = this.peek();
    const sets = { d: "\\p{Nd}", D: "\\P{Nd}", w: "[" + WORD + "]", W: "[^" + WORD + "]", s: "[" + SPACE + "]",
      S: "[^" + SPACE + "]" };
    if (Object.prototype.hasOwnProperty.call(sets, c)) {
      this.i++;
      return { src: sets[c], quantifiable: true };
    }
    const at = { b: BOUNDARY, B: NOT_BOUNDARY, A: START, Z: END };
    if (Object.prototype.hasOwnProperty.call(at, c)) {
      this.i++;
      return { src: at[c], quantifiable: false };
    }
    if (DIGIT.test(c)) {
      if (c === "0") {
        let digits = "0";
        this.i++;
        while (digits.length < 3 && OCT.test(this.peek() || "")) digits += this.p[this.i++];
        return { src: this.literal(parseInt(digits, 8), scope), quantifiable: true };
      }
      let digits = c;
      this.i++;
      if (DIGIT.test(this.peek() || "")) {
        digits += this.p[this.i++];
        if (OCT.test(digits[0]) && OCT.test(digits[1]) && OCT.test(this.peek() || "")) {
          digits += this.p[this.i++];
          const v = parseInt(digits, 8);
          if (v > 0o377) throw this.error("octal escape value outside of range 0-0o377");
          return { src: this.literal(v, scope), quantifiable: true };
        }
      }
      const n = Number(digits);
      if (n > this.groups) throw this.error("invalid group reference " + n);
      if (this.open.has(n)) throw this.error("cannot refer to an open group");
      this.sawBackref = true;
      return { src: "(?:\\" + n + ")", quantifiable: true };
    }
    const cp = this.simpleEscape();
    return { src: this.literal(cp, scope), quantifiable: true };
  }

  /** \a \f \n \r \t \v \x \u \U or an escaped non-letter; the code point. this.i is at the escaped character. */
  simpleEscape() {
    const c = this.peek();
    const simple = { a: 7, f: 12, n: 10, r: 13, t: 9, v: 11 };
    if (Object.prototype.hasOwnProperty.call(simple, c)) {
      this.i++;
      return simple[c];
    }
    for (const [letter, len] of [["x", 2], ["u", 4], ["U", 8]]) {
      if (c === letter) {
        const hex = this.p.slice(this.i + 1, this.i + 1 + len);
        if (hex.length !== len || !HEX.test(hex)) throw this.error("incomplete escape \\" + letter);
        const v = parseInt(hex, 16);
        if (v > 0x10ffff) throw this.error("bad escape \\" + letter);
        this.i += 1 + len;
        return v;
      }
    }
    if (ASCII_LETTER.test(c)) throw this.error("bad escape \\" + c);
    return this.nextCp();
  }

  /** One class item after a backslash: {set} or {cp}. */
  classEscape() {
    this.i++; // backslash
    if (this.i >= this.p.length) throw this.error("bad escape (end of pattern)");
    const c = this.peek();
    if ("dDwWsS".includes(c)) {
      this.i++;
      return { set: c };
    }
    if (c === "b") {
      this.i++;
      return { cp: 8 };
    }
    if (OCT.test(c)) {
      let digits = "";
      while (digits.length < 3 && OCT.test(this.peek() || "")) digits += this.p[this.i++];
      const v = parseInt(digits, 8);
      if (v > 0o377) throw this.error("octal escape value outside of range 0-0o377");
      return { cp: v };
    }
    if (DIGIT.test(c)) throw this.error("bad escape \\" + c);
    return { cp: this.simpleEscape() };
  }

  charClass(scope) {
    let negate = false;
    if (this.peek() === "^") {
      negate = true;
      this.i++;
    }
    const ranges = [];
    const sets = [];
    let first = true;
    for (;;) {
      if (this.i >= this.p.length) throw this.error("unterminated character set");
      if (this.peek() === "]" && !first) {
        this.i++;
        break;
      }
      first = false;
      let lo;
      if (this.peek() === "\\") {
        const e = this.classEscape();
        if (e.set) {
          sets.push(e.set);
          if (this.peek() === "-" && this.peek(1) !== "]" && this.i + 1 < this.p.length) {
            throw this.error("bad character range");
          }
          continue;
        }
        lo = e.cp;
      } else {
        lo = this.nextCp();
      }
      if (this.peek() === "-" && this.i + 1 < this.p.length && this.peek(1) !== "]") {
        this.i++; // "-"
        let hi;
        if (this.peek() === "\\") {
          const e = this.classEscape();
          if (e.set) throw this.error("bad character range");
          hi = e.cp;
        } else {
          hi = this.nextCp();
        }
        if (hi < lo) throw this.error("bad character range");
        ranges.push([lo, hi]);
      } else {
        ranges.push([lo, lo]);
      }
    }
    if (scope.i && !this.jsI) {
      const extra = [];
      for (const [lo, hi] of ranges) {
        if (hi - lo > WIDE_RANGE) throw this.error("unsupported: a re.I class range wider than 0x400 characters");
        for (let cp = lo; cp <= hi; cp++) for (const v of caseVariants(cp)) if (v < lo || v > hi) extra.push([v, v]);
      }
      ranges.push(...extra);
    }
    let pos = ranges.map(([lo, hi]) => (lo === hi ? classChar(lo) : classChar(lo) + "-" + classChar(hi))).join("");
    const neg = [];
    for (const s of sets) {
      if (s === "d") pos += "\\p{Nd}";
      else if (s === "D") pos += "\\P{Nd}";
      else if (s === "w") pos += WORD;
      else if (s === "s") pos += SPACE;
      else if (s === "W") neg.push(WORD);
      else if (s === "S") neg.push(SPACE);
    }
    if (!neg.length) return "[" + (negate ? "^" : "") + pos + "]";
    if (!negate) return "(?:" + [pos ? "[" + pos + "]" : null, ...neg.map((n) => "[^" + n + "]")].filter(Boolean).join("|") + ")";
    return "(?:" + (pos ? "(?![" + pos + "])" : "") + neg.map((n) => "(?=[" + n + "])").join("") + ANY + ")";
  }
}

/** A match with Python's accessors; indices are UTF-16 units of the searched string. */
export class PyMatch {
  constructor(m, string, pattern) {
    this._m = m;
    this.string = string;
    this.re = pattern;
  }

  _n(g) {
    if (typeof g === "string") {
      const n = this.re.names.get(g);
      if (n === undefined) throw new PyReError("no such group " + g);
      return n;
    }
    if (g < 0 || g > this.re.groups) throw new PyReError("no such group " + g);
    return g;
  }

  group(g = 0) {
    const v = this._m[this._n(g)];
    return v === undefined ? null : v;
  }

  groups() {
    const out = [];
    for (let g = 1; g <= this.re.groups; g++) out.push(this.group(g));
    return out;
  }

  start(g = 0) {
    const n = this._n(g);
    if (n === 0) return this._m.index;
    const span = this._m.indices[n];
    return span ? span[0] : -1;
  }

  end(g = 0) {
    const n = this._n(g);
    if (n === 0) return this._m.index + this._m[0].length;
    const span = this._m.indices[n];
    return span ? span[1] : -1;
  }

  span(g = 0) {
    return [this.start(g), this.end(g)];
  }
}

function cpCount(text, end) {
  let n = 0;
  for (let u = 0; u < end; u += text.codePointAt(u) > 0xffff ? 2 : 1) n++;
  return n;
}

/** A compiled Python pattern: search / match / fullmatch / finditer / findall / sub / split like re.Pattern. */
export class PyPattern {
  constructor(pattern, flags = "") {
    let parser = new Parser(pattern, flags);
    let source = parser.run();
    if (parser.globalI && parser.sawBackref) { // back-references under re.I: JavaScript's /i compares them
      parser = new Parser(pattern, flags, true);
      source = parser.run();
    }
    this.pattern = pattern;
    this.flags = flags;
    this.source = source;
    this.groups = parser.groups;
    this.names = parser.names;
    this.jsFlags = "du" + (parser.jsI ? "i" : "");
    try {
      this._g = new RegExp(source, "g" + this.jsFlags);
    } catch (err) {
      throw new PyReError("pattern " + JSON.stringify(pattern) + " has no JavaScript form: " + err.message);
    }
    this._y = new RegExp(source, "y" + this.jsFlags);
    this._full = null;
  }

  _wrap(m, text) {
    return m === null ? null : new PyMatch(m, text, this);
  }

  search(text, pos = 0) {
    this._g.lastIndex = Math.min(Math.max(pos, 0), text.length);
    return this._wrap(this._g.exec(text), text);
  }

  match(text, pos = 0) {
    this._y.lastIndex = Math.min(Math.max(pos, 0), text.length);
    return this._wrap(this._y.exec(text), text);
  }

  fullmatch(text) {
    if (this._full === null) this._full = new RegExp("(?:" + this.source + ")" + END, "y" + this.jsFlags);
    this._full.lastIndex = 0;
    return this._wrap(this._full.exec(text), text);
  }

  test(text) {
    return this.search(text) !== null;
  }

  /** Non-empty match starting exactly at pos (Python's search after an empty match at pos), or null. */
  _nonEmptyAt(text, pos) {
    const need = cpCount(text, pos) + 1;
    const rx = new RegExp("(?:" + this.source + ")(?<=^" + ANY + "{" + need + ",})", "y" + this.jsFlags);
    rx.lastIndex = pos;
    return rx.exec(text);
  }

  *finditer(text, pos = 0) {
    const rx = new RegExp(this._g);
    rx.lastIndex = Math.min(Math.max(pos, 0), text.length);
    let emptyAt = -1;
    while (rx.lastIndex <= text.length) {
      let m;
      if (emptyAt >= 0) {
        m = this._nonEmptyAt(text, emptyAt);
        if (m === null) {
          if (emptyAt >= text.length) return;
          rx.lastIndex = emptyAt + (text.codePointAt(emptyAt) > 0xffff ? 2 : 1);
          emptyAt = -1;
          continue;
        }
        emptyAt = -1;
      } else {
        m = rx.exec(text);
        if (m === null) return;
      }
      const end = m.index + m[0].length;
      yield new PyMatch(m, text, this);
      if (m[0].length === 0) emptyAt = end;
      rx.lastIndex = end;
    }
  }

  findall(text) {
    const out = [];
    for (const m of this.finditer(text)) {
      if (this.groups === 0) out.push(m.group(0));
      else if (this.groups === 1) out.push(m.group(1) === null ? "" : m.group(1));
      else out.push(m.groups().map((g) => (g === null ? "" : g)));
    }
    return out;
  }

  /** re.sub: repl is a function of the match or a Python template ("\\1", "\\g<name>", "\\n"). */
  sub(repl, text, count = 0) {
    const fn = typeof repl === "function" ? repl : template(repl, this);
    let out = "";
    let last = 0;
    let n = 0;
    for (const m of this.finditer(text)) {
      if (count && n >= count) break;
      out += text.slice(last, m.start()) + fn(m);
      last = m.end();
      n++;
    }
    return out + text.slice(last);
  }

  split(text, maxsplit = 0) {
    const out = [];
    let last = 0;
    let n = 0;
    for (const m of this.finditer(text)) {
      if (maxsplit && n >= maxsplit) break;
      out.push(text.slice(last, m.start()), ...m.groups());
      last = m.end();
      n++;
    }
    out.push(text.slice(last));
    return out;
  }
}

const TEMPLATE_ESCAPES = { a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\" };

/** sre's parse_template: \g<name> / \g<number>, \1-\99 group references, octal escapes (\0, \0nn, \nnn), the C escapes
 * (\b = backspace), an unknown ASCII-letter escape is an error, any other escape stays as written. A group that did
 * not take part in the match gives "". */
function template(repl, pattern) {
  if (!repl.includes("\\")) return () => repl;
  const parts = []; // literal strings and {group: number | name}
  let lit = "";
  const group = (g) => {
    if (typeof g === "number" && g > pattern.groups) throw new PyReError("invalid group reference " + g);
    if (typeof g === "string" && !pattern.names.has(g)) throw new PyReError("unknown group name '" + g + "'");
    parts.push(lit, { group: g });
    lit = "";
  };
  for (let i = 0; i < repl.length; i++) {
    const c = repl[i];
    if (c !== "\\") {
      lit += c;
      continue;
    }
    const d = repl[++i];
    if (d === undefined) throw new PyReError("bad escape (end of pattern)");
    if (d === "g") {
      const m = /^<([^>]*)>/.exec(repl.slice(i + 1));
      if (!m) throw new PyReError("missing <, or missing >, unterminated name");
      if (/^[0-9]+$/.test(m[1])) group(Number(m[1]));
      else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(m[1])) group(m[1]);
      else throw new PyReError("bad character in group name '" + m[1] + "'");
      i += m[0].length;
    } else if (d === "0") {
      let oct = "";
      while (oct.length < 2 && OCT.test(repl[i + 1] || "")) oct += repl[++i];
      lit += String.fromCharCode(parseInt("0" + oct, 8) & 0xff);
    } else if (DIGIT.test(d)) {
      let digits = d;
      if (DIGIT.test(repl[i + 1] || "")) {
        digits += repl[++i];
        if (OCT.test(digits[0]) && OCT.test(digits[1]) && OCT.test(repl[i + 1] || "")) {
          digits += repl[++i];
          const v = parseInt(digits, 8);
          if (v > 0o377) throw new PyReError("octal escape value \\" + digits + " outside of range 0-0o377");
          lit += String.fromCharCode(v);
          continue;
        }
      }
      group(Number(digits));
    } else if (Object.prototype.hasOwnProperty.call(TEMPLATE_ESCAPES, d)) {
      lit += TEMPLATE_ESCAPES[d];
    } else if (ASCII_LETTER.test(d)) {
      throw new PyReError("bad escape \\" + d);
    } else {
      lit += "\\" + d;
    }
  }
  parts.push(lit);
  return (m) => parts.map((p) => (typeof p === "string" ? p : (m.group(p.group) || ""))).join("");
}

const CACHE = new Map();

/** re.compile(pattern, flags) with flags as letters ("i", "s", "m"); cached like re's own cache. */
export function compile(pattern, flags = "") {
  const key = flags + "\u0000" + pattern;
  let rx = CACHE.get(key);
  if (rx === undefined) {
    rx = new PyPattern(pattern, flags);
    if (CACHE.size > 4096) CACHE.clear();
    CACHE.set(key, rx);
  }
  return rx;
}

const ESCAPED = new Set("()[]{}?*+-|^$\\.&~# \t\n\r\v\f");

/** re.escape (Python 3.7+): a backslash before regex syntax characters and whitespace. */
export function escape(s) {
  let out = "";
  for (const c of s) out += ESCAPED.has(c) ? "\\" + c : c;
  return out;
}

export const search = (p, text, flags = "") => compile(p, flags).search(text);
export const match = (p, text, flags = "") => compile(p, flags).match(text);
export const fullmatch = (p, text, flags = "") => compile(p, flags).fullmatch(text);
export const findall = (p, text, flags = "") => compile(p, flags).findall(text);
export const finditer = (p, text, flags = "") => compile(p, flags).finditer(text);
export const sub = (p, repl, text, flags = "") => compile(p, flags).sub(repl, text);
export const split = (p, text, flags = "") => compile(p, flags).split(text);
