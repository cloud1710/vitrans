// lxml's tree model on top of the DOM, as far as the helper's code relies on it:
// - children of an element are elements, comments and PIs (never text); el.text is the text before the first child
//   and child.tail the text after a child, up to the next child;
// - the tail belongs to its element: remove() takes it along, append / addprevious / addnext / insert move it with
//   the element, and deepcopy copies it (lxml 6, checked with a probe);
// - SubElement / set() pick the prefix already declared for a namespace; a namespace not in scope gets lxml's
//   prefix (xml, xsi... or ns0, ns1... counted per document) declared on the element itself;
// - a moved element (and each of its descendants) loses the namespace declarations its new parent already has in
//   scope (lxml's moveNodeToDocument), so moved and copied runs carry no redundant xmlns.
// A detached element keeps its tail in TAILS until it is placed again.
import { XML_NS, XMLNS_NS } from "./ns.js";

const TAILS = new WeakMap();
const PREFIX_COUNT = new WeakMap(); // Document -> next N of "ns<N>" (lxml: _Document._ns_counter)
// lxml's _DEFAULT_NAMESPACE_PREFIXES
const DEFAULT_PREFIXES = new Map([
  [XML_NS, "xml"], ["http://www.w3.org/1999/xhtml", "html"], ["http://www.w3.org/1999/XSL/Transform", "xsl"],
  ["http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf"], ["http://schemas.xmlsoap.org/wsdl/", "wsdl"],
  ["http://www.w3.org/2001/XMLSchema", "xs"], ["http://www.w3.org/2001/XMLSchema-instance", "xsi"],
  ["http://purl.org/dc/elements/1.1/", "dc"], ["http://codespeak.net/lxml/objectify/pytype", "py"],
]);

export function isText(n) {
  return n.nodeType === 3 || n.nodeType === 4;
}

export function isElement(n) {
  return n != null && n.nodeType === 1;
}

/** lxml local(): local name of an element, "" for comments / PIs. */
export function local(n) {
  return n && n.nodeType === 1 ? n.localName : "";
}

/** lxml ns_of(): namespace of an element (null when none), "" for comments / PIs. */
export function nsOf(n) {
  return n && n.nodeType === 1 ? (n.namespaceURI || null) : "";
}

export function is(n, ns, name) {
  return n != null && n.nodeType === 1 && n.localName === name && (n.namespaceURI || "") === (ns || "");
}

/** list(el): child elements, comments and PIs. */
export function children(el) {
  const out = [];
  for (let c = el.firstChild; c; c = c.nextSibling) if (!isText(c)) out.push(c);
  return out;
}

export function lastChild(el) {
  for (let c = el.lastChild; c; c = c.previousSibling) if (!isText(c)) return c;
  return null;
}

/** el.text: the text before the first child, or null. */
export function textOf(el) {
  let s = null;
  for (let c = el.firstChild; c && isText(c); c = c.nextSibling) s = (s || "") + c.data;
  return s;
}

function tailNodes(n) {
  if (n.parentNode) {
    const out = [];
    for (let c = n.nextSibling; c && isText(c); c = c.nextSibling) out.push(c);
    return out;
  }
  return TAILS.get(n) || [];
}

/** el.tail, or null. */
export function tailText(n) {
  const t = tailNodes(n);
  return t.length ? t.map((x) => x.data).join("") : null;
}

/** parent.remove(n): n leaves the tree together with its tail. */
export function remove(n) {
  if (!n.parentNode) return;
  const tail = tailNodes(n);
  const parent = n.parentNode;
  parent.removeChild(n);
  for (const t of tail) parent.removeChild(t);
  TAILS.set(n, tail);
}

function place(parent, n, ref) {
  const tail = tailNodes(n);
  remove(n);
  parent.insertBefore(n, ref);
  for (const t of tail) parent.insertBefore(t, ref);
  TAILS.delete(n);
  if (n.nodeType === 1) stripRedundant(n);
}

/** lxml moveNodeToDocument step 1: in the moved subtree, drop each declaration whose namespace the element's parent
 * already binds to the same prefix. (lxml also drops one bound to another prefix and renames; that never occurs in
 * Office files and is not done here.) */
function stripRedundant(top) {
  const stack = [top];
  while (stack.length) {
    const e = stack.pop();
    for (const a of Array.from(e.attributes)) {
      if (a.namespaceURI !== XMLNS_NS) continue;
      const prefix = a.prefix ? a.localName : "";
      const parent = parentElement(e);
      if (parent !== null && searchByHref(parent, a.value, false, false) === prefix) e.removeAttributeNode(a);
    }
    for (let c = e.lastChild; c; c = c.previousSibling) if (c.nodeType === 1) stack.push(c);
  }
}

/** parent.append(n) */
export function append(parent, n) {
  place(parent, n, null);
}

/** ref.addprevious(n): right before ref (after the previous child's tail). */
export function addprevious(ref, n) {
  place(ref.parentNode, n, ref);
}

/** ref.addnext(n): after ref's tail, before the next child. */
export function addnext(ref, n) {
  let next = ref.nextSibling;
  while (next && isText(next)) next = next.nextSibling;
  if (next === n) return;
  place(ref.parentNode, n, next);
}

/** parent.insert(index, n) */
export function insertAt(parent, index, n) {
  const at = children(parent)[index];
  if (at === undefined) {
    append(parent, n);
    return;
  }
  if (at === n) return;
  place(parent, n, at);
}

/** copy.deepcopy(n): a detached copy that carries a copy of the tail. */
export function deepCopy(n) {
  const c = n.cloneNode(true);
  TAILS.set(c, tailNodes(n).map((t) => t.ownerDocument.createTextNode(t.data)));
  return c;
}

export function findChild(el, ns, name) {
  for (let c = el.firstChild; c; c = c.nextSibling) if (is(c, ns, name)) return c;
  return null;
}

export function findChildren(el, ns, name) {
  const out = [];
  for (let c = el.firstChild; c; c = c.nextSibling) if (is(c, ns, name)) out.push(c);
  return out;
}

/** el.iter(tag): el itself and its descendants in document order. */
export function iterElements(el, ns, name) {
  const out = [];
  const stack = [el];
  while (stack.length) {
    const n = stack.pop();
    if (is(n, ns, name)) out.push(n);
    for (let c = n.lastChild; c; c = c.previousSibling) if (c.nodeType === 1) stack.push(c);
  }
  return out;
}

/** el.iter(tag1, tag2): pairs [[ns, name], ...]. */
export function iterElementsAny(el, tags) {
  const out = [];
  const stack = [el];
  while (stack.length) {
    const n = stack.pop();
    if (tags.some(([ns, name]) => is(n, ns, name))) out.push(n);
    for (let c = n.lastChild; c; c = c.previousSibling) if (c.nodeType === 1) stack.push(c);
  }
  return out;
}

export function parentElement(n) {
  const p = n.parentNode;
  return p && p.nodeType === 1 ? p : null;
}

export function getAttr(el, ns, name) {
  const a = el.getAttributeNodeNS(ns || null, name);
  return a ? a.value : null;
}

function declarations(n) {
  const out = [];
  for (const a of Array.from(n.attributes)) {
    if (a.namespaceURI === XMLNS_NS) out.push([a.prefix ? a.localName : "", a.value]);
  }
  return out;
}

/** libxml2 xmlSearchNs: the namespace bound to `prefix` ("" = default) in scope at el, or null. An element made by
 * the engine binds its own prefix (the serializer declares it). */
function lookupPrefix(el, prefix) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    for (const [p, u] of declarations(n)) if (p === prefix) return u;
    if ((n.prefix || "") === prefix && n.namespaceURI) return n.namespaceURI;
  }
  return prefix === "xml" ? XML_NS : null;
}

/** lxml _searchNsByHref / libxml2 xmlSearchNsByHref from `start`: a prefix bound to `uri` and in scope at start, or
 * null. `ownNs`: start's own element namespace counts too. For attributes a default namespace never counts. */
function searchByHref(start, uri, attribute, ownNs) {
  for (let n = start; n && n.nodeType === 1; n = n.parentNode) {
    for (const [p, u] of declarations(n)) {
      if (u === uri && !(attribute && p === "") && lookupPrefix(start, p) === uri) return p;
    }
    if ((n !== start || ownNs) && n.namespaceURI === uri) {
      const p = n.prefix || "";
      if (!(attribute && p === "") && lookupPrefix(start, p) === uri) return p;
    }
  }
  return null;
}

/** Prefix declared for ns in scope at el (a new child of el would use it), or null. */
export function prefixFor(el, ns) {
  return searchByHref(el, ns, false, true);
}

/** lxml _findOrBuildNodeNs when nothing is in scope: its default prefix, else ns0, ns1... (per document), skipping
 * prefixes already bound at el. */
function newPrefix(el, uri) {
  const doc = el.nodeType === 9 ? el : el.ownerDocument; // a Document's own ownerDocument is null in browsers
  const next = () => {
    const n = PREFIX_COUNT.get(doc) || 0;
    PREFIX_COUNT.set(doc, n + 1);
    return "ns" + n;
  };
  let p = DEFAULT_PREFIXES.has(uri) ? DEFAULT_PREFIXES.get(uri) : next();
  while (lookupPrefix(el, p) !== null) p = next();
  return p;
}

export function setAttr(el, ns, name, value) {
  if (!ns) {
    el.setAttributeNS(null, name, value);
    return;
  }
  const old = el.getAttributeNodeNS(ns, name);
  if (old) {
    old.value = value;
    return;
  }
  if (ns === XML_NS) {
    el.setAttributeNS(ns, "xml:" + name, value);
    return;
  }
  let p = searchByHref(el, ns, true, false);
  if (p === null) {
    p = newPrefix(el, ns);
    el.setAttributeNS(XMLNS_NS, "xmlns:" + p, ns); // lxml declares the new prefix on the element itself
  }
  el.setAttributeNS(ns, p + ":" + name, value);
}

export function delAttr(el, ns, name) {
  if (el.getAttributeNodeNS(ns || null, name)) el.removeAttributeNS(ns || null, name);
}

/** A new detached element named with the prefix in scope at `context` (its future parent). */
export function makeElement(context, ns, name) {
  const doc = context.ownerDocument || context;
  if (!ns) return doc.createElementNS(null, name);
  let p = context.nodeType === 1 ? prefixFor(context, ns) : null;
  if (p !== null) return doc.createElementNS(ns, p ? p + ":" + name : name);
  p = newPrefix(context, ns);
  const el = doc.createElementNS(ns, p + ":" + name);
  el.setAttributeNS(XMLNS_NS, "xmlns:" + p, ns);
  return el;
}

/** etree.SubElement(parent, tag) */
export function subElement(parent, ns, name) {
  const el = makeElement(parent, ns, name);
  parent.appendChild(el);
  return el;
}
