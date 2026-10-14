// Port of helper/tests/test_parts.py: which parts carry text, in reading order, and their labels.
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectParts, partLabels, paragraphKind, location, keepParagraph } from "../ooxml/parts.js";
import { relsTargets, normpath } from "../ooxml/rels.js";
import { OoxmlPackage } from "../ooxml/package.js";
import { parseXml } from "../ooxml/xml.js";
import { iterElements, findChild, children, remove, insertAt } from "../ooxml/lx.js";
import { A, P } from "../ooxml/ns.js";

const fixture = (name) => new Uint8Array(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
const fake = (kind, names) => ({ kind, names: () => names });

test("pptx order and options", () => {
  const pkg = fake("pptx", ["ppt/slides/slide10.xml", "ppt/slides/slide2.xml", "ppt/notesSlides/notesSlide2.xml",
    "ppt/charts/chart1.xml", "ppt/slideLayouts/slideLayout1.xml", "ppt/theme/theme1.xml", "ppt/presentation.xml"]);
  assert.deepEqual(selectParts(pkg), ["ppt/slides/slide2.xml", "ppt/slides/slide10.xml",
    "ppt/notesSlides/notesSlide2.xml", "ppt/charts/chart1.xml", "ppt/slideLayouts/slideLayout1.xml"]);
  assert.ok(!selectParts(pkg, { notes: false }).includes("ppt/notesSlides/notesSlide2.xml"));
});

test("docx parts and kinds", () => {
  const pkg = fake("docx", ["word/document.xml", "word/header2.xml", "word/footer1.xml", "word/footnotes.xml",
    "word/comments.xml", "word/styles.xml", "word/charts/chart1.xml"]);
  assert.deepEqual(selectParts(pkg), ["word/document.xml", "word/header2.xml", "word/footer1.xml",
    "word/footnotes.xml", "word/charts/chart1.xml"]);
  assert.ok(selectParts(pkg, { comments: true }).includes("word/comments.xml"));
  assert.equal(paragraphKind("docx", "word/document.xml"), "w");
  assert.equal(paragraphKind("docx", "word/charts/chart1.xml"), "a");
  assert.equal(paragraphKind("pptx", "ppt/slides/slide1.xml"), "a");
});

test("locations", () => {
  assert.equal(location("ppt/slides/slide3.xml"), "Slide 3");
  assert.equal(location("ppt/notesSlides/notesSlide3.xml"), "Notes 3");
  assert.equal(location("word/document.xml"), "Body");
  assert.equal(location("word/header1.xml"), "Header 1");
  assert.equal(location("word/header.xml"), "Header 1");
  assert.equal(location("word/footnotes.xml"), "Footnotes");
  assert.equal(location("ppt/diagrams/data2.xml"), "SmartArt 2");
  assert.equal(location("word/charts/chart.xml"), "Chart 1");
  assert.equal(location("ppt/slides/slide07.xml"), "Slide 07");
  assert.equal(location("docProps/app.xml"), "docProps/app.xml");
});

const NS = "xmlns:a=\"" + A + "\" xmlns:p=\"" + P + "\"";
const PH = "<p:sp><p:nvSpPr><p:cNvPr id=\"1\" name=\"x\"/><p:cNvSpPr/><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr>" +
  "<p:txBody><a:p><a:r><a:t>Click</a:t></a:r></a:p></p:txBody></p:sp>";
const BOX = "<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"t\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr>" +
  "<p:txBody><a:p><a:r><a:t>Box</a:t></a:r></a:p></p:txBody></p:sp>";
const tree = (shapes) => "<p:sld " + NS + "><p:cSld><p:spTree>" + shapes + "</p:spTree></p:cSld></p:sld>";
const firstPara = (xml) => iterElements(parseXml(xml).documentElement, A, "p")[0];

test("keepParagraph skips layout / master placeholder prompts only", () => {
  const layout = "ppt/slideLayouts/slideLayout1.xml";
  assert.equal(keepParagraph(layout, firstPara(tree(PH))), false);
  assert.equal(keepParagraph(layout, firstPara(tree(BOX))), true);
  assert.equal(keepParagraph(layout, firstPara(tree("<p:grpSp>" + BOX + "</p:grpSp>"))), true);
  assert.equal(keepParagraph("ppt/slides/slide1.xml", firstPara(tree(PH))), true);
});

test("more included and skipped parts", () => {
  const pkg = fake("pptx", ["ppt/slideMasters/slideMaster1.xml", "ppt/diagrams/data1.xml", "ppt/diagrams/drawing1.xml",
    "ppt/theme/theme1.xml", "ppt/notesMasters/notesMaster1.xml", "ppt/handoutMasters/handoutMaster1.xml",
    "ppt/presProps.xml", "ppt/diagrams/layout1.xml", "ppt/slides/slide1.xml.bak"]);
  assert.deepEqual(selectParts(pkg), ["ppt/diagrams/data1.xml", "ppt/diagrams/drawing1.xml",
    "ppt/slideMasters/slideMaster1.xml"]);
  const d = fake("docx", ["word/header.xml", "word/endnotes.xml", "word/diagrams/data1.xml", "word/diagrams/drawing1.xml",
    "word/glossary/document.xml", "word/theme/theme1.xml"]);
  assert.deepEqual(selectParts(d), ["word/header.xml", "word/endnotes.xml", "word/diagrams/data1.xml",
    "word/diagrams/drawing1.xml"]);
  assert.equal(paragraphKind("docx", "word/diagrams/data1.xml"), "a");
});

test("labels, used layouts and slide order (and after moving slide 3 first)", () => {
  const pkg = new OoxmlPackage(fixture("deck3.pptx"));
  const labels = partLabels(pkg);
  assert.equal(labels.get("ppt/slides/slide3.xml"), "Slide 3");
  assert.equal(labels.get("ppt/notesSlides/notesSlide1.xml"), "Notes 3");
  const sel = selectParts(pkg);
  assert.deepEqual(sel.filter((n) => n.includes("slideLayouts")), ["ppt/slideLayouts/slideLayout2.xml"]);
  assert.deepEqual(sel.filter((n) => n.includes("slideMasters")), ["ppt/slideMasters/slideMaster1.xml"]);
  assert.deepEqual(sel.filter((n) => n.includes("/slides/")),
    ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide3.xml"]);
  const root = pkg.root("ppt/presentation.xml");
  const lst = iterElements(root, P, "sldIdLst")[0];
  const kids = children(lst);
  const last = kids[kids.length - 1];
  remove(last);
  insertAt(lst, 0, last);
  pkg.markDirty("ppt/presentation.xml");
  const pkg2 = new OoxmlPackage(pkg.save());
  const labels2 = partLabels(pkg2);
  assert.equal(labels2.get("ppt/slides/slide3.xml"), "Slide 1");
  assert.equal(labels2.get("ppt/slides/slide1.xml"), "Slide 2");
  assert.equal(labels2.get("ppt/notesSlides/notesSlide1.xml"), "Notes 1");
  const sel2 = selectParts(pkg2);
  assert.equal(sel2.filter((n) => n.includes("/slides/"))[0], "ppt/slides/slide3.xml");
  assert.ok(sel2.indexOf("ppt/notesSlides/notesSlide1.xml") > sel2.indexOf("ppt/slides/slide2.xml"));
});

test("label fallback for docx", () => {
  assert.equal(partLabels(new OoxmlPackage(fixture("refs_column.docx"))).get("word/document.xml"), "Body");
});

test("an orphan slide and its notes are skipped", () => {
  const pkg = new OoxmlPackage(fixture("deck3_orphan.pptx"));
  const sel = selectParts(pkg);
  assert.ok(!sel.includes("ppt/slides/slide3.xml"));
  assert.deepEqual(sel.filter((n) => n.includes("notesSlides")), []);
  const labels = partLabels(pkg);
  assert.equal(labels.get("ppt/slides/slide1.xml"), "Slide 1");
  assert.equal(labels.get("ppt/slides/slide2.xml"), "Slide 2");
});

test("notes are ordered by slide number", () => {
  const pkg = new OoxmlPackage(fixture("notes_order.pptx"));
  const labels = partLabels(pkg);
  assert.equal(labels.get("ppt/notesSlides/notesSlide1.xml"), "Notes 3");
  assert.equal(labels.get("ppt/notesSlides/notesSlide2.xml"), "Notes 1");
  assert.deepEqual(selectParts(pkg).filter((n) => n.includes("notesSlides")),
    ["ppt/notesSlides/notesSlide2.xml", "ppt/notesSlides/notesSlide1.xml"]);
});

test("relationship targets resolve like posixpath", () => {
  const pkg = new OoxmlPackage(fixture("deck3.pptx"));
  const t = relsTargets(pkg, "ppt/slides/slide1.xml");
  assert.ok([...t.values()].includes("ppt/slideLayouts/slideLayout2.xml"));
  assert.equal(normpath("ppt/slides/../media/./image1.png"), "ppt/media/image1.png");
  assert.equal(normpath("a//b/"), "a/b");
  assert.equal(normpath("../x"), "../x");
  assert.equal(normpath(""), ".");
  assert.equal(normpath("/a/../../b"), "/b");
  assert.equal(normpath("//a"), "//a");
  assert.equal(normpath("///a"), "/a");
});

test("findChild is namespace-aware", () => {
  const sp = parseXml(tree(PH)).documentElement;
  assert.ok(findChild(sp, P, "cSld"));
  assert.equal(findChild(sp, A, "cSld"), null);
});
