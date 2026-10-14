// Port of helper/tests/test_codec.py (paragraph <-> tagged segment), same inputs and expectations.
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { describe } from "./describe.mjs";
import { Skip, apply, encode } from "../ooxml/codec.js";
import { parseXml, serializeFragment } from "../ooxml/xml.js";
import { A, W, R, XML_NS } from "../ooxml/ns.js";
import { children, local, findChild, findChildren, iterElements, textOf, getAttr, parentElement } from "../ooxml/lx.js";

const A_P = `<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:pPr algn="l"/>
  <a:r><a:rPr lang="en-US" sz="1800" dirty="0"/><a:t>In </a:t></a:r>
  <a:r><a:rPr lang="en-US" sz="1800" b="1" dirty="0"/><a:t>NF2-altered</a:t></a:r>
  <a:r><a:rPr lang="en-US" sz="1800" dirty="0"/><a:t> meningiomas, </a:t></a:r>
  <a:r><a:rPr lang="en-US" sz="2000"/><a:t>chromosome</a:t></a:r>
  <a:br><a:rPr lang="en-US"/></a:br>
  <a:r><a:rPr lang="en-US" sz="1800" i="1"/><a:t>1p loss</a:t></a:r>
  <a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>3</a:t></a:fld>
  <a:endParaRPr lang="en-US" sz="1800"/>
</a:p>`;

const W_P = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
     xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
  <w:bookmarkStart w:id="0" w:name="_GoBack"/>
  <w:r w:rsidR="00A1"><w:rPr><w:lang w:val="en-US"/></w:rPr><w:t xml:space="preserve">See </w:t></w:r>
  <w:proofErr w:type="spellStart"/>
  <w:hyperlink r:id="rId5"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>the WHO site</w:t></w:r></w:hyperlink>
  <w:proofErr w:type="spellEnd"/>
  <w:r><w:t xml:space="preserve"> for </w:t></w:r>
  <w:r><w:rPr><w:b/></w:rPr><w:t>grading</w:t></w:r>
  <w:r><w:tab/><w:t>criteria</w:t></w:r>
  <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
  <w:r><w:t>4</w:t></w:r>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
  <w:bookmarkEnd w:id="0"/>
</w:p>`;

const W_NS = "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" " +
  "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"";
const A_HEAD = "<a:p xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">";
const W_HEAD = "<w:p " + W_NS + ">";

const el = (xml) => parseXml(xml).documentElement;
const runs = (p) => findChildren(p, A, "r");
const runText = (r) => textOf(findChild(r, A, "t"));
const rPr = (r, ns = A) => findChild(r, ns, "rPr");
const kidNames = (p) => children(p).map(local);

test("encode DrawingML", () => {
  const seg = encode(el(A_P));
  assert.equal(seg.kind, "a");
  assert.equal(seg.tagged, "In <g1>NF2-altered</g1> meningiomas, chromosome<x1/><g2>1p loss</g2><x2/>");
  assert.equal(seg.plain, "In NF2-altered meningiomas, chromosome1p loss");
  assert.equal(getAttr(seg.dominant.rpr, "", "sz"), "1800");
});

test("encode does not mutate", () => {
  const p = el(A_P);
  const before = serializeFragment(p);
  encode(p);
  assert.equal(serializeFragment(p), before);
});

test("identity DrawingML", () => {
  const p = el(A_P);
  const before = describe(p);
  const seg = encode(p);
  apply(p, seg, seg.tagged);
  assert.deepEqual(describe(p), before);
});

test("apply translation DrawingML", () => {
  const p = el(A_P);
  const seg = encode(p);
  apply(p, seg, "Trong c\u{e1}c u m\u{e0}ng n\u{e3}o <g1>NF2-altered</g1>, m\u{1ea5}t<x1/><g2>1p</g2><x2/>");
  assert.deepEqual(kidNames(p), ["pPr", "r", "r", "r", "br", "r", "fld", "endParaRPr"]);
  const rs = runs(p);
  assert.deepEqual(rs.map(runText), ["Trong c\u{e1}c u m\u{e0}ng n\u{e3}o ", "NF2-altered", ", m\u{1ea5}t", "1p"]);
  assert.equal(getAttr(rPr(rs[1]), "", "b"), "1");
  assert.equal(getAttr(rPr(rs[3]), "", "i"), "1");
  assert.ok(rs.every((r) => getAttr(rPr(r), "", "lang") === "vi-VN"));
  assert.equal(getAttr(findChild(p, A, "endParaRPr"), "", "lang"), "vi-VN");
  assert.equal(getAttr(findChild(p, A, "fld"), "", "type"), "slidenum");
});

test("identity merges runs split at spaces", () => {
  const p = el(A_HEAD + "<a:r><a:rPr lang=\"en-US\"/><a:t>Smith A. et al. </a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\" i=\"1\"/><a:t>J Clin</a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\" i=\"1\" err=\"1\"/><a:t> </a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\" i=\"1\"/><a:t>Pathol</a:t></a:r></a:p>");
  const before = describe(p);
  const seg = encode(p);
  assert.equal(seg.tagged, "Smith A. et al. <g1>J Clin Pathol</g1>");
  apply(p, seg, seg.tagged);
  assert.deepEqual(describe(p), before);
});

test("symbol font runs keep their font", () => {
  let p = el(A_HEAD + "<a:r><a:rPr lang=\"en-US\"><a:latin typeface=\"Symbol\" pitchFamily=\"18\" charset=\"2\"/></a:rPr>" +
    "<a:t>\u{f061}</a:t></a:r><a:r><a:rPr lang=\"en-US\"><a:latin typeface=\"Arial\"/></a:rPr>" +
    "<a:t>-synuclein immunoreactivity</a:t></a:r></a:p>");
  let seg = encode(p);
  assert.equal(seg.tagged, "<g1>\u{f061}</g1>-synuclein immunoreactivity");
  apply(p, seg, "Ph\u{1ea3}n \u{1ee9}ng mi\u{1ec5}n d\u{1ecb}ch <g1>\u{f061}</g1>-synuclein");
  const fonts = runs(p).map((r) => [runText(r), getAttr(findChild(rPr(r), A, "latin"), "", "typeface")]);
  assert.deepEqual(fonts, [["Ph\u{1ea3}n \u{1ee9}ng mi\u{1ec5}n d\u{1ecb}ch ", "Arial"], ["\u{f061}", "Symbol"],
    ["-synuclein", "Arial"]]);
  const w = encode(el("<w:p xmlns:w=\"" + W + "\"><w:r><w:t>A</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Symbol\" " +
    "w:hAnsi=\"Symbol\"/></w:rPr><w:t>\u{f062}</w:t></w:r><w:r><w:t xml:space=\"preserve\"> amyloid plaque</w:t></w:r></w:p>"));
  assert.equal(w.tagged, "A<g1>\u{f062}</g1> amyloid plaque");
  p = el(A_HEAD + "<a:r><a:rPr lang=\"en-US\"><a:sym typeface=\"Wingdings\"/></a:rPr><a:t>\u{f0e8} </a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\"><a:sym typeface=\"Wingdings\"/></a:rPr><a:t>Lateral neck LNs</a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\"/><a:t> (14.6%)</a:t></a:r></a:p>");
  const before = describe(p);
  seg = encode(p);
  assert.equal(seg.tagged, "<g1>\u{f0e8} </g1>Lateral neck LNs (14.6%)");
  apply(p, seg, seg.tagged);
  assert.deepEqual(describe(p), before);
});

test("encode WordprocessingML", () => {
  const seg = encode(el(W_P));
  assert.equal(seg.kind, "w");
  assert.equal(seg.tagged, "See <g1>the WHO site</g1> for <g2>grading</g2><x1/>criteria<g3>1</g3><x2/>");
  assert.equal(local(seg.spans.get(1).container), "hyperlink");
});

test("identity WordprocessingML", () => {
  const p = el(W_P);
  const before = describe(p);
  const seg = encode(p);
  apply(p, seg, seg.tagged);
  assert.deepEqual(describe(p), before);
});

test("apply translation WordprocessingML", () => {
  const p = el(W_P);
  const seg = encode(p);
  apply(p, seg, "Xem <g2>ph\u{e2}n \u{111}\u{1ed9}</g2> t\u{1ea1}i <g1>trang WHO</g1><x1/>ti\u{ea}u ch\u{ed}<g3>1</g3><x2/>");
  const kids = kidNames(p);
  assert.ok(kids[0] === "pPr" && kids[1] === "bookmarkStart" && kids[kids.length - 1] === "bookmarkEnd");
  const link = findChild(p, W, "hyperlink");
  assert.equal(getAttr(link, R, "id"), "rId5");
  assert.equal(textOf(findChild(findChild(link, W, "r"), W, "t")), "trang WHO");
  const instr = iterElements(p, W, "instrText");
  assert.ok(instr.length === 1 && textOf(instr[0]) === " PAGE ");
  for (const t of iterElements(p, W, "t")) if (textOf(t) !== "4") assert.equal(getAttr(t, XML_NS, "space"), "preserve");
  for (const r of iterElements(p, W, "r")) {
    const t = findChild(r, W, "t");
    if (t && textOf(t) !== "4") assert.equal(getAttr(findChild(rPr(r, W), W, "lang"), W, "val"), "vi-VN");
  }
});

test("tracked changes skip", () => {
  assert.throws(() => encode(el("<w:p xmlns:w=\"" + W + "\"><w:ins w:id=\"1\" w:author=\"a\"><w:r><w:t>new</w:t></w:r>" +
    "</w:ins></w:p>")), Skip);
});

test("lang order and hint", () => {
  const p = el("<w:p xmlns:w=\"" + W + "\"><w:r><w:rPr><w:rFonts w:hint=\"eastAsia\"/><w:b/><w:eastAsianLayout w:id=\"1\"/>" +
    "</w:rPr><w:t>Text</w:t></w:r></w:p>");
  const seg = encode(p);
  apply(p, seg, "V\u{103}n b\u{1ea3}n");
  const rpr = rPr(findChild(p, W, "r"), W);
  assert.deepEqual(children(rpr).map(local), ["rFonts", "b", "lang", "eastAsianLayout"]);
  assert.equal(getAttr(findChild(rpr, W, "rFonts"), W, "hint"), null);
});

test("lang goes before extension elements", () => {
  const p = el("<w:p xmlns:w=\"" + W + "\" xmlns:w14=\"http://schemas.microsoft.com/office/word/2010/wordml\"><w:r><w:rPr>" +
    "<w:b/><w14:ligatures w14:val=\"standardContextual\"/></w:rPr><w:t>Text</w:t></w:r></w:p>");
  apply(p, encode(p), "V\u{103}n b\u{1ea3}n");
  assert.deepEqual(children(rPr(findChild(p, W, "r"), W)).map(local), ["b", "lang", "ligatures"]);
});

test("no text returns null", () => {
  assert.equal(encode(el(A_HEAD + "<a:endParaRPr/></a:p>")), null);
});

test("reduced keeps only selected spans", () => {
  const seg = encode(el(A_P));
  const red = seg.reduced((span) => getAttr(span.rpr, "", "i") === "1");
  assert.equal(red.tagged, "In NF2-altered meningiomas, chromosome<x1/><g2>1p loss</g2><x2/>");
  assert.deepEqual([...red.spans.keys()], [2]);
  const p = el(A_P);
  const seg2 = encode(p);
  const red2 = seg2.reduced((span) => getAttr(span.rpr, "", "i") === "1");
  apply(p, red2, "Trong NF2-altered<x1/><g2>1p</g2><x2/>");
  assert.deepEqual(runs(p).map(runText), ["Trong NF2-altered", "1p"]);
});

test("control chars and NFC", () => {
  const p = el(A_P);
  const seg = encode(p);
  apply(p, seg, "A\vB " + "ma\u{300}ng" + " <g1>x</g1><x1/><g2>y</g2><x2/>");
  assert.equal(runText(runs(p)[0]), "A B m\u{e0}ng ");
});

test("lone carriage return becomes a space", () => {
  const p = el(A_P);
  const seg = encode(p);
  apply(p, seg, "A\rB <g1>x</g1><x1/><g2>y</g2><x2/>");
  assert.equal(runText(runs(p)[0]), "A B ");
});

test("apply never drops fixed elements", () => {
  const p = el(A_P);
  const seg = encode(p);
  apply(p, seg, "A<x1/> <g1>b</g1><x1/><x9/> <g2>c</g2>");
  const kids = kidNames(p);
  assert.equal(kids.filter((k) => k === "br").length, 1);
  assert.equal(kids.filter((k) => k === "fld").length, 1);
  assert.deepEqual(kids.slice(-2), ["fld", "endParaRPr"]);
  assert.equal(getAttr(findChild(p, A, "fld"), "", "type"), "slidenum");
});

const HYPERLINKED_IMAGES = "<w:p " + W_NS + "><w:r><w:t xml:space=\"preserve\">Visit our </w:t></w:r>" +
  "<w:hyperlink r:id=\"rId9\"><w:r><w:rPr><w:noProof/></w:rPr><w:drawing/></w:r><w:r><w:t>website</w:t></w:r>" +
  "</w:hyperlink><w:r><w:t xml:space=\"preserve\"> or </w:t></w:r>" +
  "<w:hyperlink r:id=\"rId8\"><w:r><w:drawing/></w:r></w:hyperlink></w:p>";

test("identity keeps images inside links", () => {
  const p = el(HYPERLINKED_IMAGES);
  const before = describe(p);
  const seg = encode(p);
  assert.equal(seg.tagged, "Visit our <x1/><g1>website</g1> or <x2/>");
  apply(p, seg, seg.tagged);
  assert.deepEqual(describe(p), before);
});

test("apply keeps images inside links", () => {
  const p = el(HYPERLINKED_IMAGES);
  const seg = encode(p);
  apply(p, seg, "Xem <x1/><g1>trang web</g1> ho\u{1eb7}c <x2/>");
  const links = findChildren(p, W, "hyperlink");
  assert.deepEqual(links.map((h) => getAttr(h, R, "id")), ["rId9", "rId8"]);
  assert.equal(iterElements(links[0], W, "t").map(textOf).join(""), "trang web");
  const drawings = iterElements(p, W, "drawing");
  assert.equal(drawings.length, 2);
  assert.deepEqual(drawings.map((d) => parentElement(parentElement(d))), links);
});

test("identity smartTag and comment range", () => {
  const p = el("<w:p " + W_NS + "><w:r><w:t xml:space=\"preserve\">Grade </w:t></w:r>" +
    "<w:commentRangeStart w:id=\"3\"/>" +
    "<w:smartTag w:uri=\"urn:x\" w:element=\"place\"><w:smartTagPr><w:attr w:name=\"a\" w:val=\"b\"/>" +
    "</w:smartTagPr><w:r><w:rPr><w:b/></w:rPr><w:t>Hanoi</w:t></w:r></w:smartTag>" +
    "<w:r><w:tab/><w:t>tumour</w:t></w:r>" +
    "<w:commentRangeEnd w:id=\"3\"/>" +
    "<w:r><w:rPr><w:rStyle w:val=\"CommentReference\"/></w:rPr><w:commentReference w:id=\"3\"/></w:r></w:p>");
  const before = describe(p);
  const seg = encode(p);
  assert.equal(seg.tagged, "Grade <g1>Hanoi</g1><x1/>tumour<x2/>");
  apply(p, seg, seg.tagged);
  assert.deepEqual(describe(p), before);
  const kids = kidNames(p);
  assert.ok(kids[0] === "commentRangeStart" && kids[kids.length - 1] === "commentRangeEnd");
  assert.equal(iterElements(p, W, "commentReference").length, 1);
});

test("describe detects a moved placeholder", () => {
  let p = el(A_P);
  let before = describe(p);
  let seg = encode(p);
  apply(p, seg, "In <g1>NF2-altered</g1> meningiomas, chromosome<g2>1p loss</g2><x1/><x2/>");
  assert.notDeepEqual(describe(p), before);
  p = el(W_P);
  before = describe(p);
  seg = encode(p);
  apply(p, seg, "See <g1>the WHO site</g1> for <x1/><g2>grading</g2>criteria<g3>1</g3><x2/>");
  assert.notDeepEqual(describe(p), before);
});

test("XML-illegal characters are stripped", () => {
  const p = el(A_P);
  const seg = encode(p);
  apply(p, seg, "A\u{fffe}B\u{d800}C\u{ffff} <g1>x</g1><x1/><g2>y</g2><x2/>");
  assert.equal(runText(runs(p)[0]), "ABC ");
});

test("C0 controls are stripped", () => {
  const p = el(A_P);
  const seg = encode(p);
  apply(p, seg, "A\x01B\x08C\x0cD\x1fE\x00 <g1>x</g1><x1/><g2>y</g2><x2/>");
  assert.equal(runText(runs(p)[0]), "ABCDE ");
});

test("a valid astral character survives cleaning", () => {
  const p = el(A_P);
  const seg = encode(p);
  apply(p, seg, "\u{1d6fc} \u{1f600} <g1>x</g1><x1/><g2>y</g2><x2/>");
  assert.equal(runText(runs(p)[0]), "\u{1d6fc} \u{1f600} ");
});

test("apply adds no namespace declarations", () => {
  for (const xml of [A_P, W_P, HYPERLINKED_IMAGES]) {
    const p = el(xml);
    const seg = encode(p);
    apply(p, seg, seg.tagged);
    const out = serializeFragment(p);
    const head = out.slice(0, out.indexOf(">"));
    assert.equal(out.split("xmlns").length, head.split("xmlns").length, out);
  }
});

test("apply reports placeholder fixes", () => {
  let p = el(A_P);
  let seg = encode(p);
  assert.deepEqual(apply(p, seg, seg.tagged), []);
  p = el(A_P);
  seg = encode(p);
  assert.deepEqual(apply(p, seg, "A<x1/> <g1>b</g1><x1/><x9/> <g7>c</g7> <g2>d</g2>"),
    ["x_duplicate:1", "x_unknown:9", "x_missing:2", "g_unknown:7"]);
});

test("duplicate placeholder: the first one wins", () => {
  const p = el(A_P);
  const seg = encode(p);
  apply(p, seg, "A<x1/>B<x1/>C <g1>b</g1><g2>c</g2><x2/>");
  const kids = children(p);
  const br = kids.findIndex((k) => local(k) === "br");
  assert.equal(runText(kids[br - 1]), "A");
  assert.equal(runText(kids[br + 1]), "B");
});

test("whitespace-only span folds into the dominant run", () => {
  const p = el(A_HEAD + "<a:r><a:rPr lang=\"en-US\"/><a:t>Hello</a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\" u=\"sng\"/><a:t> </a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\"/><a:t>world</a:t></a:r></a:p>");
  const seg = encode(p);
  assert.ok(seg.tagged === "Hello world" && seg.spans.size === 0);
  apply(p, seg, seg.tagged);
  const rs = runs(p);
  assert.ok(rs.length === 1 && getAttr(rPr(rs[0]), "", "u") === null);
  const w = encode(el(W_HEAD + "<w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t></w:r>" +
    "<w:r><w:rPr><w:u w:val=\"single\"/></w:rPr><w:t xml:space=\"preserve\"> </w:t></w:r>" +
    "<w:r><w:t>long dominant text</w:t></w:r></w:p>"));
  assert.equal(w.tagged, "<g1>a</g1> long dominant text");
});

test("whitespace between one format joins its span", () => {
  const p = el(A_HEAD + "<a:r><a:rPr lang=\"en-US\"/><a:t>Results of the study: </a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\" u=\"sng\"/><a:t>a</a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\" b=\"1\"/><a:t> </a:t></a:r>" +
    "<a:r><a:rPr lang=\"en-US\" u=\"sng\"/><a:t>b</a:t></a:r></a:p>");
  const before = describe(p);
  const seg = encode(p);
  assert.equal(seg.tagged, "Results of the study: <g1>a b</g1>");
  apply(p, seg, seg.tagged);
  assert.deepEqual(describe(p), before);
});

test("font size and name differences fold", () => {
  const a = encode(el(A_HEAD + "<a:r><a:rPr lang=\"en-US\" sz=\"1800\"><a:latin typeface=\"Arial\"/></a:rPr>" +
    "<a:t>Tumour </a:t></a:r><a:r><a:rPr lang=\"en-US\" sz=\"2400\"><a:latin typeface=\"Calibri\"/>" +
    "</a:rPr><a:t>cells</a:t></a:r></a:p>"));
  assert.equal(a.tagged, "Tumour cells");
  const w = encode(el(W_HEAD + "<w:r><w:rPr><w:rFonts w:ascii=\"Arial\"/><w:sz w:val=\"24\"/></w:rPr>" +
    "<w:t xml:space=\"preserve\">Tumour </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Times New Roman\"/>" +
    "<w:sz w:val=\"28\"/><w:szCs w:val=\"28\"/></w:rPr><w:t>cells</w:t></w:r></w:p>"));
  assert.equal(w.tagged, "Tumour cells");
});

const run = (text, attrs = "") => "<a:r><a:rPr lang=\"en-US\"" + attrs + "/><a:t>" + text + "</a:t></a:r>";

test("character spacing differences fold", () => {
  const a = encode(el(A_HEAD + run("Spindle cell ") + run("lesion", " spc=\"-10\"") + run(" with ") +
    run("myxoid", " spc=\"-20\"") + run(" stroma ") + run("(SCL-", " spc=\"-35\"") + run("MS)", " spc=\"-20\"") + "</a:p>"));
  assert.ok(a.tagged === "Spindle cell lesion with myxoid stroma (SCL-MS)" && a.spans.size === 0);
  const b = encode(el(A_HEAD + run("Grade ", " b=\"1\"") + run("2", " b=\"1\" spc=\"-25\"") + "</a:p>"));
  assert.ok(b.tagged === "Grade 2" && b.spans.size === 0);
  const i = encode(el(A_HEAD + run("Loss of ", " spc=\"-10\"") + run("ABC1", " i=\"1\" spc=\"-45\"") +
    run("-mutated", " spc=\"-45\"") + run(" cells") + "</a:p>"));
  assert.equal(i.tagged, "Loss of <g1>ABC1</g1>-mutated cells");
  assert.equal(getAttr(i.spans.get(1).rpr, "", "i"), "1");
});

test("complex-script bold / italic do not tag", () => {
  const w = encode(el(W_HEAD + "<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>Bold</w:t></w:r>" +
    "<w:r><w:rPr><w:b/></w:rPr><w:t xml:space=\"preserve\"> words</w:t></w:r>" +
    "<w:r><w:rPr><w:iCs/></w:rPr><w:t xml:space=\"preserve\"> and plain text here</w:t></w:r></w:p>"));
  assert.equal(w.tagged, "<g1>Bold words</g1> and plain text here");
});

test("a split hyperlink is cloned", () => {
  const p = el(W_HEAD + "<w:r><w:t xml:space=\"preserve\">Read the </w:t></w:r>" +
    "<w:hyperlink r:id=\"rId5\"><w:r><w:rPr><w:b/></w:rPr><w:t>WHO</w:t></w:r>" +
    "<w:r><w:t xml:space=\"preserve\"> classification site</w:t></w:r></w:hyperlink>" +
    "<w:r><w:t xml:space=\"preserve\"> now and then again</w:t></w:r></w:p>");
  const seg = encode(p);
  assert.equal(seg.tagged, "Read the <g1>WHO</g1><g2> classification site</g2> now and then again");
  apply(p, seg, "Doc <g2>trang phan loai</g2> cua <g1>WHO</g1> ngay");
  const links = findChildren(p, W, "hyperlink");
  assert.deepEqual(links.map((h) => getAttr(h, R, "id")), ["rId5", "rId5"]);
  assert.deepEqual(links.map((h) => iterElements(h, W, "t").map(textOf).join("")), ["trang phan loai", "WHO"]);
  assert.ok(findChild(rPr(findChild(links[1], W, "r"), W), W, "b"));
});

test("lastRenderedPageBreak is dropped", () => {
  const p = el(W_HEAD + "<w:r><w:lastRenderedPageBreak/><w:t>Second page text</w:t></w:r></w:p>");
  const seg = encode(p);
  assert.ok(seg.tagged === "Second page text" && seg.fixed.size === 0);
  apply(p, seg, "Trang hai");
  assert.equal(iterElements(p, W, "lastRenderedPageBreak").length, 0);
});

for (const tracked of [
  "<w:del w:id=\"1\" w:author=\"a\"><w:r><w:delText>old</w:delText></w:r></w:del>",
  "<w:moveFrom w:id=\"2\" w:author=\"a\"><w:r><w:t>moved</w:t></w:r></w:moveFrom>",
  "<w:moveFromRangeEnd w:id=\"3\"/>",
  "<w:moveToRangeEnd w:id=\"4\"/>"]) {
  test("tracked changes skip: " + tracked.slice(0, 18), () => {
    assert.throws(() => encode(el(W_HEAD + "<w:r><w:t>Text</w:t></w:r>" + tracked + "</w:p>")), Skip);
  });
}

test("paragraph mark language", () => {
  let p = el("<w:p xmlns:w=\"" + W + "\" xmlns:w14=\"http://schemas.microsoft.com/office/word/2010/wordml\"><w:pPr><w:rPr>" +
    "<w:b/><w14:ligatures w14:val=\"all\"/></w:rPr></w:pPr><w:r><w:t>Text</w:t></w:r></w:p>");
  apply(p, encode(p), "Van ban");
  const mark = findChild(findChild(p, W, "pPr"), W, "rPr");
  assert.deepEqual(children(mark).map(local), ["b", "lang", "ligatures"]);
  assert.equal(getAttr(findChild(mark, W, "lang"), W, "val"), "vi-VN");
  p = el(W_HEAD + "<w:pPr><w:jc w:val=\"center\"/></w:pPr><w:r><w:t>Text</w:t></w:r></w:p>");
  apply(p, encode(p), "Van ban");
  assert.equal(findChild(findChild(p, W, "pPr"), W, "rPr"), null);
});

test("an open field is locked, not lost", () => {
  const p = el(W_HEAD + "<w:r><w:t xml:space=\"preserve\">Intro text </w:t></w:r>" +
    "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>" +
    "<w:r><w:instrText xml:space=\"preserve\"> TOC </w:instrText></w:r>" +
    "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r><w:r><w:t>Result text</w:t></w:r></w:p>");
  const before = describe(p);
  const seg = encode(p);
  assert.equal(seg.tagged, "Intro text <x1/>");
  assert.deepEqual(seg.locked, ["Result text"]);
  apply(p, seg, seg.tagged);
  assert.deepEqual(describe(p), before);
});

test("locked text in a content control and in fields", () => {
  const sdt = encode(el(W_HEAD + "<w:r><w:t xml:space=\"preserve\">Date: </w:t></w:r><w:sdt><w:sdtPr/><w:sdtContent>" +
    "<w:r><w:t>Click here to enter a date</w:t></w:r></w:sdtContent></w:sdt></w:p>"));
  assert.equal(sdt.tagged, "Date: <x1/>");
  assert.deepEqual(sdt.locked, ["Click here to enter a date"]);
  const fld = encode(el(W_HEAD + "<w:r><w:t xml:space=\"preserve\">See </w:t></w:r>" +
    "<w:fldSimple w:instr=\" REF _Ref1 \"><w:r><w:t>Table 1</w:t></w:r></w:fldSimple>" +
    "<w:r><w:t xml:space=\"preserve\"> for details</w:t></w:r></w:p>"));
  assert.equal(fld.tagged, "See <x1/> for details");
  assert.deepEqual(fld.locked, ["Table 1"]);
  assert.deepEqual(encode(el(W_P)).locked, []);
  assert.deepEqual(encode(el(A_P)).locked, []);
  const date = encode(el(A_HEAD + "<a:r><a:rPr lang=\"en-US\"/><a:t>Updated </a:t></a:r>" +
    "<a:fld id=\"{1}\" type=\"datetime8\"><a:rPr lang=\"en-US\"/><a:t>Tuesday, October 13</a:t></a:fld></a:p>"));
  assert.deepEqual(date.locked, ["Tuesday, October 13"]);
  assert.deepEqual(date.reduced(() => false).locked, ["Tuesday, October 13"]);
});

test("a paragraph with only locked text is skipped", () => {
  const toc = W_HEAD + "<w:hyperlink w:anchor=\"_Toc1\" w:history=\"1\">" +
    "<w:r><w:t>Introduction</w:t></w:r><w:r><w:tab/></w:r>" +
    "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>" +
    "<w:r><w:instrText xml:space=\"preserve\"> PAGEREF _Toc1 </w:instrText></w:r>" +
    "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r><w:r><w:t>3</w:t></w:r>" +
    "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r></w:hyperlink></w:p>";
  assert.throws(() => encode(el(toc)), (err) => err instanceof Skip && /locked text/.test(err.message));
});

test("a text box in a drawing is not locked", () => {
  const box = "<w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>Box text</w:t></w:r></w:p>" +
    "</w:txbxContent></w:drawing></w:r>";
  const seg = encode(el(W_HEAD + "<w:r><w:t xml:space=\"preserve\">Caption </w:t></w:r>" + box + "</w:p>"));
  assert.equal(seg.tagged, "Caption <x1/>");
  assert.deepEqual(seg.locked, []);
  assert.equal(encode(el(W_HEAD + box + "</w:p>")), null);
});

test("a closed field, then text", () => {
  const seg = encode(el(W_HEAD + "<w:r><w:t xml:space=\"preserve\">Visit </w:t></w:r>" +
    "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>" +
    "<w:r><w:instrText xml:space=\"preserve\"> HYPERLINK \"https://www.who.int\" </w:instrText></w:r>" +
    "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r><w:r><w:t>the WHO website</w:t></w:r>" +
    "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>" +
    "<w:r><w:t xml:space=\"preserve\"> today</w:t></w:r></w:p>"));
  assert.equal(seg.tagged, "Visit <x1/> today");
  assert.deepEqual(seg.locked, ["the WHO website"]);
});

test("whitespace does not join a span across a fixed element", () => {
  const seg = encode(el(W_HEAD + "<w:r><w:t xml:space=\"preserve\">Grades of the tumour: </w:t></w:r>" +
    "<w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t></w:r><w:r><w:tab/></w:r>" +
    "<w:r><w:t xml:space=\"preserve\"> </w:t></w:r>" +
    "<w:r><w:rPr><w:b/></w:rPr><w:t>b</w:t></w:r></w:p>"));
  assert.equal(seg.tagged, "Grades of the tumour: <g1>a</g1><x1/> <g2>b</g2>");
});

test("Python whitespace: U+FEFF is text, U+0085 is space", () => {
  const seg = encode(el(W_HEAD + "<w:r><w:t>closing words</w:t></w:r><w:r><w:rPr><w:u w:val=\"single\"/></w:rPr>" +
    "<w:t>\u{feff}</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space=\"preserve\">\u{85}</w:t></w:r>" +
    "<w:r><w:t>more</w:t></w:r></w:p>"));
  assert.equal(seg.tagged, "closing words<g1>\u{feff}</g1>\u{85}more");
});

test("encode is linear in blank runs", () => {
  const blank = "<a:r><a:rPr lang=\"en-US\" u=\"sng\"/><a:t> </a:t></a:r>";
  const word = "<a:r><a:rPr lang=\"en-US\"/><a:t>w</a:t></a:r>";
  const p = el(A_HEAD + word + blank.repeat(10000) + (word + blank).repeat(5000) + word + "</a:p>");
  const start = performance.now();
  const seg = encode(p);
  const elapsed = performance.now() - start;
  assert.equal(seg.plain, "w" + " ".repeat(10000) + "w ".repeat(5000) + "w");
  assert.ok(elapsed < 2000, String(elapsed));
});
