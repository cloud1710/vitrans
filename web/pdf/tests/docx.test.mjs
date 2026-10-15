// The DOCX of a translated PDF (web/pdf/docx.js): headings, paragraphs, list items, captions, footnotes and simple
// tables in reading order, written with the M1 OOXML layer (zip.js) from a minimal template; the M1 reader opens
// it again and finds the same text in the same order.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../../engine/tests/dom-node.mjs";  // the DOMParser the engine reads with in Node
import { OoxmlPackage } from "../../engine/ooxml/package.js";
import { readZip, inflateEntry } from "../../engine/ooxml/zip.js";
import { buildDocx, xmlText } from "../docx.js";

const part = (bytes, name) => new TextDecoder().decode(inflateEntry(readZip(bytes).entries.find((e) => e.name === name)));

const MODEL = {
  pageSize: { w: 595, h: 842 }, serif: true,
  items: [
    { kind: "heading", level: 1, text: "U tế bào hình thoi của mô mềm" },
    { kind: "para", text: "Các khối u gồm tế bào hình thoi <độ 2> & hoại tử.", align: "left" },
    { kind: "list", text: "• Mục thứ nhất" },
    { kind: "caption", text: "Hình 1. Tế bào xếp thành bó." },
    { kind: "table", rows: [["Dấu ấn", "Dương tính"], ["CD34", "12"], ["S100", null]] },
    { kind: "heading", level: 2, text: "Tài liệu tham khảo" },
    { kind: "para", text: "1. Synthetic A. A study. J Synth Path. 2020;1:1-9.", align: "center" },
    { kind: "footnote", text: "1 Tác giả liên hệ." },
    { kind: "pagebreak" },
    { kind: "para", text: "Trang sau." },
  ],
};

test("the DOCX opens with the M1 reader: the paragraphs and cells in order, the styles in place", () => {
  const bytes = buildDocx(MODEL);
  const pkg = new OoxmlPackage(bytes);
  assert.equal(pkg.kind, "docx");
  const doc = part(bytes, "word/document.xml");
  const texts = [...doc.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ["U tế bào hình thoi của mô mềm", "Các khối u gồm tế bào hình thoi &lt;độ 2&gt; &amp; hoại tử.",
    "• Mục thứ nhất", "Hình 1. Tế bào xếp thành bó.", "Dấu ấn", "Dương tính", "CD34", "12", "S100",
    "Tài liệu tham khảo", "1. Synthetic A. A study. J Synth Path. 2020;1:1-9.", "1 Tác giả liên hệ.", "Trang sau."]);
  assert.match(doc, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(doc, /<w:pStyle w:val="Heading2"\/>/);
  assert.match(doc, /<w:pStyle w:val="Caption"\/>/);
  assert.match(doc, /<w:jc w:val="center"\/>/);
  assert.match(doc, /<w:tbl>[\s\S]*<w:gridCol[\s\S]*<w:gridCol[\s\S]*<\/w:tbl>/);
  assert.equal((doc.match(/<w:tr>/g) || []).length, 3);
  assert.match(doc, /<w:br w:type="page"\/>/);
  assert.match(doc, /<w:pgSz w:w="11900" w:h="16840"\/>/);
  const styles = part(bytes, "word/styles.xml");
  assert.match(styles, /w:styleId="Heading1"/);
  assert.match(styles, /Times New Roman/);
  // every part the package needs is there and parses
  for (const name of ["[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/styles.xml",
    "word/settings.xml", "docProps/core.xml", "docProps/app.xml"]) {
    assert.ok(pkg.has(name), name);
    pkg.root(name);
  }
});

test("a landscape page and a sans-serif document give a landscape section and a sans font", () => {
  const bytes = buildDocx({ pageSize: { w: 960, h: 540 }, serif: false, items: [{ kind: "para", text: "Slide" }] });
  const doc = part(bytes, "word/document.xml");
  assert.match(doc, /<w:pgSz w:w="19200" w:h="10800" w:orient="landscape"\/>/);
  assert.match(part(bytes, "word/styles.xml"), /Arial/);
});

test("bold and italic follow the runs; a heading run that was not bold says so; the leading sets the line spacing", () => {
  const bytes = buildDocx({ pageSize: { w: 595, h: 842 }, serif: true, leading: 1.2, items: [
    { kind: "para", text: "Name: Synthetic Person", runs: [{ text: "Name:", bold: true, italic: false },
      { text: " Synthetic Person", bold: false, italic: false }] },
    { kind: "para", text: "See Basis of Lesions now", runs: [{ text: "See ", bold: false, italic: false },
      { text: "Basis of Lesions", bold: false, italic: true }, { text: " now", bold: null, italic: null }] },
    { kind: "heading", level: 1, text: "Preface", runs: [{ text: "Preface", bold: false, italic: false }] },
    { kind: "table", rows: [[{ text: "Label: value", runs: [{ text: "Label:", bold: true, italic: false },
      { text: " value", bold: false, italic: false }] }, "plain"]] },
  ] });
  const doc = part(bytes, "word/document.xml");
  const R = (rpr, t) => "<w:r>" + (rpr ? "<w:rPr>" + rpr + "</w:rPr>" : "") + "<w:t xml:space=\"preserve\">" + t + "</w:t></w:r>";
  assert.ok(doc.includes(R("<w:b/><w:bCs/>", "Name:") + R("", " Synthetic Person")), doc);
  assert.ok(doc.includes(R("", "See ") + R("<w:i/><w:iCs/>", "Basis of Lesions") + R("", " now")), doc);
  assert.ok(doc.includes(R("<w:b w:val=\"0\"/><w:bCs w:val=\"0\"/>", "Preface")), doc);
  assert.ok(doc.includes(R("<w:b/><w:bCs/>", "Label:") + R("", " value")), doc);
  // 1.2 x the size apart: Word's single line is about 1.15 x the size, so 240 * 1.2 / 1.15 = 250
  assert.match(part(bytes, "word/styles.xml"), /<w:spacing w:after="120" w:line="250" w:lineRule="auto"\/>/);
  // without a leading the template's spacing stays
  assert.match(part(buildDocx(MODEL), "word/styles.xml"), /<w:spacing w:after="120" w:line="276" w:lineRule="auto"\/>/);
});

test("text is escaped for XML and characters XML cannot hold are dropped", () => {
  assert.equal(xmlText("a < b & \"c\" \u0001\u000b d"), "a &lt; b &amp; \"c\"  d");
});
