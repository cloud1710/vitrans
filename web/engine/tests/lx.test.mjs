// lxml's tree model on top of the DOM: text after an element (its "tail") belongs to the element and moves, is
// removed and is copied with it; children are elements, comments and PIs, never text. Expected results were taken
// from lxml 6.1 (tools probe), so the codec's moves give the same documents as the helper's.
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXml } from "../ooxml/xml.js";
import { children, textOf, tailText, append, remove, addnext, addprevious, insertAt, deepCopy, findChild,
  iterElements, local, nsOf, getAttr, setAttr, delAttr, lastChild, subElement } from "../ooxml/lx.js";

const xml = (n) => {
  if (n.nodeType === 3 || n.nodeType === 4) return n.data;
  if (n.nodeType === 8) return "<!--" + n.data + "-->";
  return "<" + n.nodeName + ">" + Array.from(n.childNodes).map(xml).join("") + "</" + n.nodeName + ">";
};
const root = (s) => parseXml(s).documentElement;

test("children are elements, comments and PIs; text / tail come from text nodes", () => {
  const p = root("<p>lead<!--c--><?pi d?><a>in</a>tail<![CDATA[more]]><b/></p>");
  assert.deepEqual(children(p).map((n) => n.nodeType), [8, 7, 1, 1]);
  assert.equal(textOf(p), "lead");
  assert.equal(tailText(children(p)[2]), "tailmore");
  assert.equal(textOf(children(p)[3]), null);
  assert.equal(lastChild(p).nodeName, "b");
});

test("remove keeps the tail on the element; append brings it along", () => {
  const p = root("<p><a/>TA<b/>TB<c/>TC</p>");
  const b = children(p)[1];
  remove(b);
  assert.equal(xml(p), "<p><a></a>TA<c></c>TC</p>");
  assert.equal(tailText(b), "TB");
  append(p, b);
  assert.equal(xml(p), "<p><a></a>TA<c></c>TC<b></b>TB</p>");
});

test("addnext places after the tail, addprevious right before the reference", () => {
  const p = root("<p><w/>WT<e/></p>");
  const n = subElement(p, "", "n");
  addnext(children(p)[0], n);
  assert.equal(xml(p), "<p><w></w>WT<n></n><e></e></p>");
  const q = root("<p><a/>AT<end/>ET</p>");
  const m = q.ownerDocument.createElement("m");
  addprevious(children(q)[1], m);
  assert.equal(xml(q), "<p><a></a>AT<m></m><end></end>ET</p>");
});

test("insertAt(0) goes after the leading text", () => {
  const p = root("<p>LEAD<a/>AT</p>");
  const k = subElement(p, "", "k");
  insertAt(p, 0, k);
  assert.equal(xml(p), "<p>LEAD<k></k><a></a>AT</p>");
  const solo = root("<p/>");
  const only = subElement(solo, "", "o");
  insertAt(solo, 0, only);
  assert.equal(xml(solo), "<p><o></o></p>");
});

test("deepCopy copies the tail, and the copy's tail follows it when appended", () => {
  const r = root("<r><rPr k=\"1\"/>\n  <t>x</t>tailT</r>");
  const c = deepCopy(children(r)[0]);
  assert.equal(tailText(c), "\n  ");
  const h = r.ownerDocument.createElementNS(null, "h");
  append(h, c);
  assert.equal(xml(h), "<h><rPr></rPr>\n  </h>");
  assert.equal(xml(r), "<r><rPr></rPr>\n  <t>x</t>tailT</r>"); // the original is untouched
});

test("find / iter / attributes by namespace and local name", () => {
  const p = root("<a:p xmlns:a=\"urn:a\" xmlns:w=\"urn:w\" k=\"1\" w:v=\"2\"><a:r><a:t>1</a:t></a:r><a:t>2</a:t></a:p>");
  assert.equal(textOf(findChild(p, "urn:a", "t")), "2");
  assert.deepEqual(iterElements(p, "urn:a", "t").map(textOf), ["1", "2"]);
  assert.equal(local(p), "p");
  assert.equal(nsOf(p), "urn:a");
  assert.equal(getAttr(p, "", "k"), "1");
  assert.equal(getAttr(p, "urn:w", "v"), "2");
  assert.equal(getAttr(p, "", "missing"), null);
  setAttr(p, "urn:w", "v", "3");
  setAttr(p, "urn:w", "n", "4");
  setAttr(p, "", "k", "5");
  assert.deepEqual(Array.from(p.attributes).map((a) => a.name + "=" + a.value),
    ["xmlns:a=urn:a", "xmlns:w=urn:w", "k=5", "w:v=3", "w:n=4"]);
  delAttr(p, "urn:w", "v");
  assert.equal(getAttr(p, "urn:w", "v"), null);
});
