// Paragraph <-> tagged segment codec for DrawingML (a:p) and WordprocessingML (w:p)
// (port of helper/vitranslate/ooxml/codec.py; same merge rules, ignored attributes, fixed elements, anchors, fields,
// symbol fonts, and the same write-back with the dominant run and the space rules). The DOM is handled through lx.js,
// which reproduces lxml's text / tail model, so the rebuilt paragraphs are the helper's, node for node.
import { A, W, XML_NS } from "./ns.js";
import { children, local, nsOf, isElement, is, findChild, findChildren, textOf, deepCopy, remove, append, addprevious,
  iterElementsAny, getAttr, setAttr, delAttr, makeElement, subElement, lastChild, parentElement } from "./lx.js";
import { tokens, ids, stripTags, tokenRe } from "../tags.js";
import { PY_WS, hasNonSpace, pyStrip, cpLen, hasAlpha, pyInt, cmpStr } from "../py.js";

// XML 1.0 forbids C0 controls other than tab / LF / CR (LF and CR become spaces first), surrogates, U+FFFE, U+FFFF.
// With the u flag, [\u{d800}-\u{dfff}] matches lone surrogates only (a valid pair is one astral character).
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\u{d800}-\u{dfff}\u{fffe}\u{ffff}]/gu;
const XML_BAD = /[\x00-\x08\x0b\x0c\x0e-\x1f\u{d800}-\u{dfff}\u{fffe}\u{ffff}]/u;
// sz / spc (font size, character spacing) are typography, not emphasis: like font names they never make a tag
const A_IGNORE_ATTRS = new Set(["lang", "altLang", "dirty", "err", "noProof", "smtClean", "smtId", "bmk", "sz", "spc",
  "kumimoji"]);
const A_IGNORE_CHILDREN = new Set(["latin", "ea", "cs", "sym"]);
const W_IGNORE_CHILDREN = new Set(["lang", "noProof", "sz", "szCs", "rFonts", "webHidden", "rPrChange", "kern", "bCs",
  "iCs"]);
const W_ANCHOR_START = new Set(["bookmarkStart", "commentRangeStart", "permStart"]);
const W_ANCHOR_END = new Set(["bookmarkEnd", "commentRangeEnd", "permEnd"]);
const W_DROP = new Set(["proofErr", "lastRenderedPageBreak"]);
const W_TRACKED = new Set(["ins", "del", "moveFrom", "moveTo", "moveFromRangeStart", "moveToRangeStart",
  "moveFromRangeEnd", "moveToRangeEnd"]);
const W_UNWRAP = new Set(["smartTag", "customXml"]);
const W_LANG_BEFORE = new Set(["eastAsianLayout", "specVanish", "oMath", "rPrChange"]);
const SYMBOL_FONT_RE = new RegExp("^[" + PY_WS + "]*(symbol|wingdings( [23])?|webdings|marlett|mt extra)[" + PY_WS +
  "]*$", "iu");
const SYMBOL_AREA_RE = /[\u{f000}-\u{f0ff}]/u;
const EMPTY = new Set();
export const LOCKED_SKIP = "locked text: field or content control";

/** Paragraph cannot be translated safely (reason in the message). */
export class Skip extends Error {
  constructor(message) {
    super(message);
    this.name = "Skip";
  }
}

export class Span {
  constructor(rpr, container, sig) {
    this.rpr = rpr; // detached deep copy of a:rPr / w:rPr, or null
    this.container = container; // original w:hyperlink element, or null
    this.sig = sig;
  }
}

export class Fixed {
  constructor(elements, wrap = false, wrapRpr = null, container = null) {
    this.elements = elements; // original nodes, re-inserted as they are
    this.wrap = wrap; // true: put them into one new w:r (run-internal children such as w:tab)
    this.wrapRpr = wrapRpr; // rPr copy for that new run
    this.container = container; // original w:hyperlink the wrapped run belongs to, or null
  }
}

export class Segment {
  constructor(kind, tagged, dominant, spans = new Map(), fixed = new Map(), anchorsStart = [], anchorsEnd = [],
    locked = []) {
    this.kind = kind;
    this.tagged = tagged;
    this.dominant = dominant;
    this.spans = spans;
    this.fixed = fixed;
    this.anchorsStart = anchorsStart;
    this.anchorsEnd = anchorsEnd;
    this.locked = locked; // visible text inside fixed elements: it stays untranslated
  }

  get plain() {
    return stripTags(this.tagged);
  }

  /** Copy without the tags of spans where keep(span) is false; their text joins the dominant run. */
  reduced(keep) {
    const kept = new Map([...this.spans].filter(([, s]) => keep(s)));
    const tagged = this.tagged.replace(tokenRe(), (m0, slash, g, x) => {
      if (x !== undefined) return m0;
      return kept.has(pyInt(g)) ? m0 : "";
    });
    return new Segment(this.kind, tagged, this.dominant, kept, this.fixed, this.anchorsStart, this.anchorsEnd,
      this.locked);
  }
}

function sortedAttrs(el) {
  const out = [];
  for (const a of Array.from(el.attributes)) {
    if (a.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
    out.push([a.namespaceURI ? "{" + a.namespaceURI + "}" + a.localName : a.localName, a.localName, a.value]);
  }
  return out.sort((x, y) => cmpStr(x[0], y[0]) || cmpStr(x[2], y[2]));
}

function canon(el, ignoreAttrs = EMPTY, ignoreChildren = EMPTY, top = true) {
  if (!el) return "";
  const attrs = sortedAttrs(el).filter((a) => !ignoreAttrs.has(a[1])).map((a) => a[1] + "=" + a[2]);
  const kids = children(el).filter((ch) => isElement(ch) && !ignoreChildren.has(local(ch)))
    .map((ch) => canon(ch, EMPTY, EMPTY, false));
  if (top && !attrs.length && !kids.length) return "";
  return "(" + local(el) + " " + attrs.join(" ") + kids.join("") + ")";
}

/** Font names are ignored, except symbol-encoded fonts: their characters are glyph codes (U+F061 = alpha in Symbol),
 * so merging such a run into another font changes the text shown. */
function withSymbolFont(sig, rpr, names, attrs) {
  for (const ch of rpr ? children(rpr) : []) {
    if (isElement(ch) && names.includes(local(ch))) {
      for (const [ns, name] of attrs) {
        const v = getAttr(ch, ns, name);
        if (SYMBOL_FONT_RE.test(v || "")) return sig + "{font " + v + "}";
      }
    }
  }
  return sig;
}

/** a:latin / a:ea / a:cs set the font of every character; a:sym only that of U+F000-U+F0FF characters. */
export function aSig(rpr, text = "") {
  const names = SYMBOL_AREA_RE.test(text) ? ["latin", "ea", "cs", "sym"] : ["latin", "ea", "cs"];
  return withSymbolFont(canon(rpr, A_IGNORE_ATTRS, A_IGNORE_CHILDREN), rpr, names, [["", "typeface"]]);
}

/** `text` is unused (same call shape as aSig): Word stores inserted symbols as w:sym, a fixed element. */
export function wSig(rpr, text = "") { // eslint-disable-line no-unused-vars
  return withSymbolFont(canon(rpr, EMPTY, W_IGNORE_CHILDREN), rpr, ["rFonts"], [[W, "ascii"], [W, "hAnsi"]]);
}

// ---------------------------------------------------------------- encode

function aAtoms(p) {
  const atoms = [];
  for (const ch of children(p)) {
    if (isElement(ch) && nsOf(ch) === A && (local(ch) === "pPr" || local(ch) === "endParaRPr")) continue;
    if (isElement(ch) && nsOf(ch) === A && local(ch) === "r") {
      const text = findChildren(ch, A, "t").map((t) => textOf(t) || "").join("");
      if (text) atoms.push({ t: true, text, rpr: findChild(ch, A, "rPr"), container: null });
      continue;
    }
    atoms.push({ t: false, fixed: new Fixed([ch]) });
  }
  return [atoms, [], []];
}

function wAtoms(p) {
  const atoms = [];
  const starts = [];
  const ends = [];
  const state = { field: null, depth: 0 };

  const runAtoms = (r, container) => {
    const rpr = findChild(r, W, "rPr");
    let buf = [];
    const flush = () => {
      if (buf.length) {
        atoms.push({ t: true, text: buf.join(""), rpr, container });
        buf = [];
      }
    };
    for (const k of children(r)) {
      const n = local(k);
      if (n === "rPr" || W_DROP.has(n) || !isElement(k)) continue;
      if (n === "t") {
        buf.push(textOf(k) || "");
        continue;
      }
      flush();
      atoms.push({ t: false, fixed: new Fixed([k], true, rpr ? deepCopy(rpr) : null, container) });
    }
    flush();
  };

  const walk = (kids, container) => {
    for (const ch of kids) {
      if (!isElement(ch) || nsOf(ch) !== W) {
        if (state.field !== null) state.field.push(ch);
        else atoms.push({ t: false, fixed: new Fixed([ch]) });
        continue;
      }
      const n = local(ch);
      if (n === "pPr" || W_DROP.has(n)) continue;
      if (W_TRACKED.has(n)) throw new Skip("tracked changes");
      if (state.field !== null && n !== "r") {
        state.field.push(ch);
        continue;
      }
      if (W_ANCHOR_START.has(n)) {
        starts.push(ch);
      } else if (W_ANCHOR_END.has(n)) {
        ends.push(ch);
      } else if (W_UNWRAP.has(n)) {
        walk(children(ch).filter((k) => local(k) !== "smartTagPr" && local(k) !== "customXmlPr"), container);
      } else if (n === "hyperlink") {
        const kids2 = children(ch).filter(isElement);
        if (container === null && kids2.every((k) => local(k) === "r" || local(k) === "proofErr") &&
            !kids2.some((k) => findChild(k, W, "fldChar") !== null)) {
          walk(kids2, ch);
        } else {
          atoms.push({ t: false, fixed: new Fixed([ch]) });
        }
      } else if (n === "r") {
        const types = findChildren(ch, W, "fldChar").map((f) => getAttr(f, W, "fldCharType"));
        if (state.field !== null || types.includes("begin")) {
          if (state.field === null) state.field = [];
          state.field.push(ch);
          state.depth += types.filter((t) => t === "begin").length - types.filter((t) => t === "end").length;
          if (state.depth <= 0) {
            atoms.push({ t: false, fixed: new Fixed(state.field) });
            state.field = null;
            state.depth = 0;
          }
        } else {
          runAtoms(ch, container);
        }
      } else {
        atoms.push({ t: false, fixed: new Fixed([ch]) });
      }
    }
  };

  walk(children(p), null);
  if (state.field !== null) {
    // field still open at the paragraph end: keep its runs as one placeholder; their text is reported as locked
    atoms.push({ t: false, fixed: new Fixed(state.field) });
  }
  return [atoms, starts, ends];
}

const isPTag = (n) => is(n, W, "p") || is(n, A, "p");

/** Visible text inside fixed elements, except nested paragraphs (text boxes are translated on their own). */
function lockedText(elements) {
  const out = [];
  for (const el of elements) {
    if (!isElement(el)) continue;
    for (const t of iterElementsAny(el, [[W, "t"], [A, "t"]])) {
      let anc = parentElement(t);
      while (anc !== null && anc !== el && !isPTag(anc)) anc = parentElement(anc);
      if (anc === el) out.push(textOf(t) || "");
    }
  }
  return pyStrip(out.join(""));
}

/** Per item, the key of the nearest non-blank text item met first along `order`; null when a fixed element or the
 * end comes first. One linear pass. */
function neighbourKeys(items, order) {
  const keys = new Array(items.length).fill(null);
  let last = null;
  for (const i of order) {
    keys[i] = last;
    if (!items[i].t) last = null;
    else if (hasNonSpace(items[i].text)) last = items[i].key;
  }
  return keys;
}

/** Paragraph -> Segment, or null when it has no text. Throws Skip for paragraphs we must not touch, and for
 * paragraphs whose only text sits inside fixed elements (locked text, e.g. a table-of-contents entry). */
export function encode(p) {
  const kind = nsOf(p) === A ? "a" : "w";
  const [atoms, starts, ends] = (kind === "a" ? aAtoms : wAtoms)(p);
  const sigFn = kind === "a" ? aSig : wSig;
  const locked = atoms.filter((at) => !at.t).map((at) => lockedText(at.fixed.elements)).filter((s) => hasAlpha(s));
  // key = (signature, container identity), as the helper's (sig, id(container)) tuples
  const containerIds = new Map();
  const sigOf = new Map();
  const keyOf = (sig, container) => {
    let id = "-";
    if (container) {
      if (!containerIds.has(container)) containerIds.set(container, String(containerIds.size));
      id = containerIds.get(container);
    }
    const key = sig + "\u{0}" + id;
    sigOf.set(key, sig);
    return key;
  };
  const items = atoms.map((at) => (at.t ? { t: true, text: at.text, rpr: at.rpr, container: at.container,
    key: keyOf(sigFn(at.rpr, at.text), at.container) } : at));
  const weights = new Map();
  for (const it of items) {
    if (it.t && hasNonSpace(it.text)) weights.set(it.key, (weights.get(it.key) || 0) + cpLen(pyStrip(it.text)));
  }
  if (weights.size === 0) {
    if (locked.length) throw new Skip(LOCKED_SKIP);
    return null;
  }
  let domKey = null;
  let best = -1;
  for (const [k, w] of weights) {
    if (w > best) {
      best = w;
      domKey = k;
    }
  }
  // Whitespace-only text has no formatting of its own: it joins a span that continues on both sides, otherwise the
  // dominant run. Decided before merging, so "<u>a</u><b> </b><u>b</u>" becomes one span.
  const forward = items.map((_, i) => i);
  const before = neighbourKeys(items, forward);
  const after = neighbourKeys(items, forward.slice().reverse());
  items.forEach((it, i) => {
    if (it.t && !hasNonSpace(it.text)) it.key = before[i] !== null && before[i] === after[i] ? before[i] : domKey;
  });
  const merged = [];
  for (const it of items) {
    if (!it.t) {
      merged.push(it);
      continue;
    }
    const real = hasNonSpace(it.text);
    const prev = merged[merged.length - 1];
    if (prev && prev.t && prev.key === it.key) {
      prev.text += it.text;
      if (real && !prev.real) { // formatting comes from text, never from folded whitespace
        prev.rpr = it.rpr;
        prev.container = it.container;
        prev.real = true;
      }
    } else {
      merged.push({ t: true, text: it.text, rpr: it.rpr, container: it.container, key: it.key, real });
    }
  }
  const dom = merged.find((m) => m.t && m.key === domKey && m.real);
  const dominant = new Span(dom.rpr ? deepCopy(dom.rpr) : null, dom.container, sigOf.get(domKey));
  const parts = [];
  const spans = new Map();
  const fixed = new Map();
  let g = 0;
  let x = 0;
  for (const m of merged) {
    if (!m.t) {
      x += 1;
      fixed.set(x, m.fixed);
      parts.push("<x" + x + "/>");
    } else if (m.key === domKey || !m.real) {
      parts.push(m.text);
    } else {
      g += 1;
      spans.set(g, new Span(m.rpr ? deepCopy(m.rpr) : null, m.container, sigOf.get(m.key)));
      parts.push("<g" + g + ">" + m.text + "</g" + g + ">");
    }
  }
  return new Segment(kind, parts.join(""), dominant, spans, fixed, starts, ends, locked);
}

// ---------------------------------------------------------------- apply

function clean(text) {
  text = text.normalize("NFC").replaceAll("\r\n", " ");
  text = text.replaceAll("\n", " ").replaceAll("\r", " ").replaceAll("\v", " ");
  return text.replace(CTRL_RE, "");
}

function pieces(text) {
  const out = [];
  const stack = [];
  let pos = 0;
  const top = () => (stack.length ? stack[stack.length - 1] : null);
  for (const m of tokens(text)) {
    if (m.index > pos) out.push(["t", text.slice(pos, m.index), top()]);
    if (m.x !== null) out.push(["x", m.x, null]);
    else if (m.close) {
      if (stack.length && stack[stack.length - 1] === m.g) stack.pop();
    } else stack.push(m.g);
    pos = m.end;
  }
  if (pos < text.length) out.push(["t", text.slice(pos), top()]);
  return out;
}

/** Each known placeholder once (first wins), unknown ones dropped, missing ones last; fixes are reported. */
function placed(pcs, fixed, fixes) {
  const out = [];
  const seen = new Set();
  for (const piece of pcs) {
    if (piece[0] === "x") {
      const n = piece[1];
      if (!fixed.has(n)) {
        fixes.push("x_unknown:" + n);
        continue;
      }
      if (seen.has(n)) {
        fixes.push("x_duplicate:" + n);
        continue;
      }
      seen.add(n);
    }
    out.push(piece);
  }
  const missing = [...fixed.keys()].sort((a, b) => a - b).filter((n) => !seen.has(n));
  for (const n of missing) fixes.push("x_missing:" + n);
  return out.concat(missing.map((n) => ["x", n, null]));
}

function spanOf(seg, spanId) {
  if (!spanId) return seg.dominant;
  return seg.spans.has(spanId) ? seg.spans.get(spanId) : seg.dominant;
}

function setWLang(rpr) {
  let lang = findChild(rpr, W, "lang");
  if (lang === null) {
    lang = subElement(rpr, W, "lang");
    // schema order: lang precedes eastAsianLayout..rPrChange and the w14 / w15 extensions Word writes last
    const anchor = children(rpr).find((c) => isElement(c) && (W_LANG_BEFORE.has(local(c)) || nsOf(c) !== W));
    if (anchor) addprevious(anchor, lang);
  }
  setAttr(lang, W, "val", "vi-VN");
  const fonts = findChild(rpr, W, "rFonts");
  if (fonts !== null && getAttr(fonts, W, "hint") === "eastAsia") delAttr(fonts, W, "hint");
}

function textNode(el, value) {
  if (XML_BAD.test(value)) throw new Error("ValueError: All strings must be XML compatible");
  el.appendChild(el.ownerDocument.createTextNode(value));
}

function aRun(ctx, span, value) {
  const r = makeElement(ctx, A, "r");
  let rpr;
  if (span.rpr !== null) {
    rpr = deepCopy(span.rpr);
    append(r, rpr);
  } else {
    rpr = subElement(r, A, "rPr");
  }
  setAttr(rpr, "", "lang", "vi-VN");
  textNode(subElement(r, A, "t"), value);
  return r;
}

function wRun(ctx, span, value) {
  const r = makeElement(ctx, W, "r");
  let rpr;
  if (span.rpr !== null) {
    rpr = deepCopy(span.rpr);
    append(r, rpr);
  } else {
    rpr = subElement(r, W, "rPr");
  }
  setWLang(rpr);
  const t = subElement(r, W, "t");
  textNode(t, value);
  setAttr(t, XML_NS, "space", "preserve");
  return r;
}

/** New runs for the text pieces (null for placeholders), built off-tree before the paragraph is touched. */
function build(seg, pcs, make, ctx) {
  return pcs.map(([kind, value, spanId]) => (kind === "t" && value ? make(ctx, spanOf(seg, spanId), value) : null));
}

function applyA(p, seg, pcs) {
  const built = build(seg, pcs, aRun, p);
  const ppr = findChild(p, A, "pPr");
  const end = findChild(p, A, "endParaRPr");
  for (const ch of children(p)) if (ch !== ppr && ch !== end) remove(ch);
  const emit = (el) => {
    if (end !== null) addprevious(end, el);
    else append(p, el);
  };
  pcs.forEach(([kind, value], i) => {
    if (kind === "x") for (const el of seg.fixed.get(value).elements) emit(el);
    else if (built[i] !== null) emit(built[i]);
  });
  if (end !== null) setAttr(end, "", "lang", "vi-VN");
}

function applyW(p, seg, pcs) {
  const built = build(seg, pcs, wRun, p);
  const ppr = findChild(p, W, "pPr");
  for (const ch of children(p)) if (ch !== ppr) remove(ch);
  const mark = ppr !== null ? findChild(ppr, W, "rPr") : null;
  if (mark !== null) setWLang(mark); // paragraph-mark run properties
  for (const a of seg.anchorsStart) append(p, a);
  const attached = new Map();

  const parentFor = (cont) => {
    if (!cont) return p;
    const current = attached.get(cont);
    if (current !== undefined && lastChild(p) === current) return current;
    if (current === undefined) {
      for (const k of children(cont)) remove(k);
      append(p, cont);
      attached.set(cont, cont);
      return cont;
    }
    const clone = subElement(p, cont.namespaceURI, cont.localName);
    for (const a of Array.from(cont.attributes)) {
      if (a.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
      setAttr(clone, a.namespaceURI || "", a.localName, a.value);
    }
    attached.set(cont, clone);
    return clone;
  };

  pcs.forEach(([kind, value, spanId], i) => {
    if (kind === "x") {
      const fx = seg.fixed.get(value);
      if (fx.wrap) {
        const wrap = subElement(parentFor(fx.container), W, "r");
        if (fx.wrapRpr !== null) append(wrap, deepCopy(fx.wrapRpr));
        for (const el of fx.elements) append(wrap, el);
      } else {
        for (const el of fx.elements) append(p, el);
      }
    } else if (built[i] !== null) {
      append(parentFor(spanOf(seg, spanId).container), built[i]);
    }
  });
  for (const a of seg.anchorsEnd) append(p, a);
}

/** Rebuild paragraph p from a translated tagged string (validate it with tags.check first).
 * Returns the fixes made to unchecked text, e.g. ["x_duplicate:1", "x_unknown:9", "x_missing:2", "g_unknown:7"]
 * (empty when the tags were exact): a placeholder is used once, unknown ones are dropped, missing ones go to the end
 * so no fixed element is ever lost, and unknown spans take the dominant formatting. New runs are built before p is
 * touched, so an error leaves p unchanged. */
export function apply(p, seg, text) {
  text = clean(text);
  const fixes = [];
  const pcs = placed(pieces(text), seg.fixed, fixes);
  const seen = new Set();
  for (const n of ids(text)[0]) {
    if (seen.has(n)) continue;
    seen.add(n);
    if (!seg.spans.has(n)) fixes.push("g_unknown:" + n);
  }
  (seg.kind === "a" ? applyA : applyW)(p, seg, pcs);
  return fixes;
}
