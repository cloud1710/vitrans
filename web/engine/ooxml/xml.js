// XML parts: bytes -> DOM Document with the platform DOMParser (native in the page, @xmldom/xmldom in Node tests), and
// Document -> bytes with our own serializer. The serializer writes what lxml writes for the helper
// (etree.tostring(tree, xml_declaration=True, encoding="UTF-8", standalone=True)): the same declaration, escaping
// (CR as &#13; in text; TAB / LF / CR as character references in attributes, so nothing is normalised away on
// reload) and empty-element form, independent of the browser's XMLSerializer quirks.
import { XML_NS, XMLNS_NS } from "./ns.js";

/** An XML part is not well-formed (the helper's lxml raises XMLSyntaxError). */
export class XmlParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "XmlParseError";
  }
}

let Parser = typeof globalThis.DOMParser === "function" ? globalThis.DOMParser : null;
// Browsers do not throw on ill-formed XML: Chrome / WebKit insert an XHTML <parsererror> into the partly parsed
// document, Firefox returns a <parsererror> root in its own namespace.
const PARSERERROR_NS = ["http://www.w3.org/1999/xhtml", "http://www.mozilla.org/newlayout/xml/parsererror.xml"];

/** Use this DOMParser class (Node tests pass @xmldom/xmldom's). */
export function useDomParser(cls) {
  Parser = cls;
}

function sniffEncoding(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes.length >= 2 && bytes[0] === 0x3c && bytes[1] === 0x00) return "utf-16le";
  if (bytes.length >= 2 && bytes[0] === 0x00 && bytes[1] === 0x3c) return "utf-16be";
  let head = "";
  for (let i = 0; i < Math.min(bytes.length, 200); i++) head += String.fromCharCode(bytes[i]);
  const m = /^<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(head);
  return m ? m[1].toLowerCase() : "utf-8";
}

/** Bytes of an XML part -> string (BOM / declared encoding; invalid UTF-8 is an error, as in libxml2). */
export function decodeXml(bytes) {
  const label = sniffEncoding(bytes);
  let decoder;
  try {
    decoder = new TextDecoder(label, { fatal: true });
  } catch {
    throw new XmlParseError("unsupported XML encoding: " + label);
  }
  try {
    return decoder.decode(bytes);
  } catch {
    throw new XmlParseError("XML part is not valid " + label);
  }
}

/** Parse an XML part (bytes or string) into a Document; throws XmlParseError on ill-formed XML. */
export function parseXml(input) {
  if (!Parser) throw new Error("no DOMParser available: call useDomParser()");
  const text = typeof input === "string" ? input : decodeXml(input);
  let doc;
  try {
    doc = new Parser().parseFromString(text, "application/xml");
  } catch (err) {
    throw new XmlParseError("XML parse error: " + String((err && err.message) || err).slice(0, 200));
  }
  if (!doc || !doc.documentElement) throw new XmlParseError("XML parse error: no root element");
  for (const ns of PARSERERROR_NS) {
    const found = doc.getElementsByTagNameNS(ns, "parsererror");
    if (found.length > 0) throw new XmlParseError("XML parse error: " + (found[0].textContent || "").slice(0, 200));
  }
  for (const n of Array.from(doc.childNodes)) {
    if (n.nodeType === 7 && n.target === "xml") doc.removeChild(n); // xmldom keeps the declaration as a PI
  }
  return doc;
}

function escText(s) {
  let out = "";
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 0x26) rep = "&amp;";
    else if (c === 0x3c) rep = "&lt;";
    else if (c === 0x3e) rep = "&gt;";
    else if (c === 0x0d) rep = "&#13;";
    if (rep !== null) {
      out += s.slice(last, i) + rep;
      last = i + 1;
    }
  }
  return last === 0 ? s : out + s.slice(last);
}

function escAttr(s) {
  let out = "";
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 0x26) rep = "&amp;";
    else if (c === 0x3c) rep = "&lt;";
    else if (c === 0x3e) rep = "&gt;";
    else if (c === 0x22) rep = "&quot;";
    else if (c === 0x0a) rep = "&#10;";
    else if (c === 0x0d) rep = "&#13;";
    else if (c === 0x09) rep = "&#9;";
    if (rep !== null) {
      out += s.slice(last, i) + rep;
      last = i + 1;
    }
  }
  return last === 0 ? s : out + s.slice(last);
}

function qname(n) {
  return n.prefix ? n.prefix + ":" + n.localName : n.localName;
}

function serializeElement(el, scope, out) {
  let inner = scope;
  const decls = [];
  const attrs = [];
  const declare = (prefix, uri) => {
    if (inner === scope) inner = new Map(scope);
    inner.set(prefix, uri);
    decls.push([prefix, uri]);
  };
  for (const a of Array.from(el.attributes)) {
    if (a.namespaceURI === XMLNS_NS) declare(a.prefix ? a.localName : "", a.value);
    else attrs.push(a);
  }
  const ns = el.namespaceURI || "";
  const prefix = el.prefix || "";
  if ((inner.get(prefix) ?? "") !== ns) declare(prefix, ns);
  for (const a of attrs) {
    const ans = a.namespaceURI || "";
    if (!ans || ans === XML_NS) continue;
    if (!a.prefix) throw new Error("namespaced attribute without a prefix: " + a.localName);
    if (inner.get(a.prefix) !== ans) declare(a.prefix, ans);
  }
  const name = qname(el);
  out.push("<", name);
  for (const [p, u] of decls) out.push(p ? " xmlns:" + p : " xmlns", "=\"", escAttr(u), "\"");
  for (const a of attrs) out.push(" ", qname(a), "=\"", escAttr(a.value), "\"");
  if (!el.firstChild) {
    out.push("/>");
    return;
  }
  out.push(">");
  for (let c = el.firstChild; c; c = c.nextSibling) serializeNode(c, inner, out);
  out.push("</", name, ">");
}

function serializeNode(n, scope, out) {
  switch (n.nodeType) {
    case 1:
      serializeElement(n, scope, out);
      break;
    case 3:
    case 4:
      out.push(escText(n.data));
      break;
    case 7:
      out.push("<?", n.target, n.data ? " " + n.data : "", "?>");
      break;
    case 8:
      out.push("<!--", n.data, "-->");
      break;
    default:
      break;
  }
}

/** Document -> UTF-8 bytes, as lxml writes them for the helper. */
export function serializeXml(doc) {
  const out = ["<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n"];
  const scope = new Map([["xml", XML_NS]]);
  for (let n = doc.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 10) out.push("<!DOCTYPE ", n.name, ">\n");
    else if (n.nodeType === 1 || n.nodeType === 7 || n.nodeType === 8) serializeNode(n, scope, out);
  }
  return new TextEncoder().encode(out.join(""));
}

/** One node as markup in the given scope (tests and debugging). */
export function serializeFragment(node) {
  const out = [];
  serializeNode(node, new Map([["xml", XML_NS]]), out);
  return out.join("");
}
