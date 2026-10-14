// Canonical forms for the parity tests, mirrored from tools/export_ooxml_fixtures.py (esc, canon_xml, ecanon, desc,
// ckey, seg_summary). Used in Node (xmldom) and in the browser check page (native DOMParser).
import { parseXml } from "../ooxml/xml.js";
import { textOf, tailText, isText } from "../ooxml/lx.js";
import { cmpStr } from "../py.js";

const XMLNS = "http://www.w3.org/2000/xmlns/";

/** Quoted string, every UTF-16 unit outside printable ASCII (and the quote / backslash) as \uXXXX. */
export function esc(s) {
  let out = "\"";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f && c !== 0x22 && c !== 0x5c) out += s[i];
    else out += "\\u" + c.toString(16).padStart(4, "0");
  }
  return out + "\"";
}

function cmpTuple(a, b) {
  for (let i = 0; i < a.length; i++) {
    const d = cmpStr(a[i], b[i]);
    if (d) return d;
  }
  return 0;
}

function attrs(el) {
  const out = [];
  for (const a of Array.from(el.attributes)) {
    if (a.namespaceURI === XMLNS) continue;
    out.push([a.namespaceURI || "", a.localName, a.value]);
  }
  return out.sort(cmpTuple);
}

function qname(el) {
  return (el.prefix ? el.prefix + ":" : "") + el.localName;
}

function nodeKids(el) {
  const out = [];
  for (let c = el.firstChild; c; c = c.nextSibling) if (!isText(c)) out.push(c);
  return out;
}

/** Canonical lines of an XML document (bytes or string), as canon_xml() in the exporter. */
export function canonXml(data) {
  const doc = parseXml(data);
  const lines = [];
  const other = (n) => {
    if (n.nodeType === 8) lines.push("C " + esc(n.data));
    else if (n.nodeType === 7) lines.push("P " + n.target + " " + esc(n.data || ""));
    else lines.push("? " + esc(String(n.nodeName)));
  };
  const walk = (el, scope) => {
    lines.push("E " + qname(el) + " " + esc(el.namespaceURI || ""));
    const inner = new Map(scope);
    for (const a of Array.from(el.attributes)) {
      if (a.namespaceURI === XMLNS) inner.set(a.prefix ? a.localName : "", a.value);
    }
    const own = [...inner].filter(([p, u]) => scope.get(p) !== u).map(([p]) => p).sort(cmpStr);
    for (const p of own) lines.push("N " + p + "=" + esc(inner.get(p)));
    for (const [ns, loc, v] of attrs(el)) lines.push("A " + esc(ns) + " " + loc + "=" + esc(v));
    const text = textOf(el);
    if (text) lines.push("T " + esc(text));
    for (const ch of nodeKids(el)) {
      if (ch.nodeType === 1) walk(ch, inner);
      else other(ch);
      const tail = tailText(ch);
      if (tail) lines.push("T " + esc(tail));
    }
    lines.push("/E");
  };
  for (let n = doc.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1) walk(n, new Map());
    else if (n.nodeType === 7 || n.nodeType === 8) other(n);
  }
  return lines.join("\n");
}

/** Compact form of an element subtree, without namespace declarations or its own tail. */
export function ecanon(el) {
  if (!el) return null;
  const walk = (e) => {
    if (e.nodeType === 8) return "<!--" + esc(e.data) + "-->";
    if (e.nodeType === 7) return "<?" + e.target + " " + esc(e.data || "") + "?>";
    let s = "<{" + (e.namespaceURI || "") + "}" + e.localName +
      attrs(e).map(([a, b, v]) => " {" + a + "}" + b + "=" + esc(v)).join("") + ">";
    const text = textOf(e);
    if (text) s += esc(text);
    for (const ch of nodeKids(e)) {
      s += walk(ch);
      const tail = tailText(ch);
      if (tail) s += esc(tail);
    }
    return s + "</>";
  };
  return walk(el);
}

export function desc(n) {
  if (n.nodeType === 1) return "{" + (n.namespaceURI || "") + "}" + n.localName;
  if (n.nodeType === 8) return "#comment";
  return "#pi " + n.target;
}

export function ckey(el) {
  if (!el) return null;
  return "{" + (el.namespaceURI || "") + "}" + el.localName +
    attrs(el).map(([a, b, v]) => " {" + a + "}" + b + "=" + esc(v)).join("");
}

const spanSummary = (s) => ({ sig: s.sig, rpr: ecanon(s.rpr), container: ckey(s.container) });

export function segSummary(seg) {
  if (!seg) return null;
  const spans = {};
  for (const [n, s] of seg.spans) spans[String(n)] = spanSummary(s);
  const fixed = {};
  for (const [n, f] of seg.fixed) {
    fixed[String(n)] = { wrap: f.wrap, nodes: f.elements.map(desc), container: ckey(f.container),
      wrap_rpr: ecanon(f.wrapRpr) };
  }
  return { kind: seg.kind, tagged: seg.tagged, locked: [...seg.locked], dominant: spanSummary(seg.dominant), spans,
    fixed, anchors_start: seg.anchorsStart.map(desc), anchors_end: seg.anchorsEnd.map(desc) };
}

export function itemSummary(i) {
  return { part: i.part, index: i.index, location: i.location, skip: i.skip, text: i.text, seg: segSummary(i.segment) };
}
