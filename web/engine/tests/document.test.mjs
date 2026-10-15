// Port of helper/tests/test_document.py on the synthetic files the Python tests build (committed as fixtures by
// tools/export_ooxml_fixtures.py): item lists, references region, labels, identity round trip.
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe } from "./describe.mjs";
import { collectItems, isStopHeading, isBackMatterHeading } from "../ooxml/document.js";
import { apply } from "../ooxml/codec.js";
import { OoxmlPackage } from "../ooxml/package.js";
import { iterElements } from "../ooxml/lx.js";
import { W } from "../ooxml/ns.js";

const fixture = (name) => new Uint8Array(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
const items = (name, opts) => collectItems(new OoxmlPackage(fixture(name)), opts);
const texts = (its) => its.filter((i) => i.segment).map((i) => i.segment.plain);
const byText = (its) => new Map(its.map((i) => [i.text, i]));

const CHINESE = String.fromCodePoint(0x8fd9, 0x662f, 0x75c5, 0x7406, 0x8bca, 0x65ad, 0x3002);
const GREEK_CLONE = "34\u{3b2}E12";
const MICRO_UNIT = "5 \u{b5}m";
const PRIME_END = "3\u{2b9}";

test("stop headings", () => {
  assert.ok(isStopHeading("References:"));
  assert.ok(isStopHeading("REFERENCE"));
  assert.ok(isStopHeading("  BIBLIOGRAPHY "));
  assert.ok(!isStopHeading("References for grading"));
  assert.ok(isStopHeading("19. BIBLIOGRAPHY"));
  assert.ok(isStopHeading("3) References"));
  assert.ok(isStopHeading("Selected\u{a0}references"));
  assert.ok(!isStopHeading("2021 references"));
  for (const phrase of ["Reference list", "Further reading", "Suggested reading", "Key references", "Works cited"]) {
    assert.ok(isStopHeading(phrase), phrase);
  }
  const nfc = "t\u{e0}i li\u{1ec7}u tham kh\u{1ea3}o";
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfd, nfc);
  assert.ok(isStopHeading(nfd));
  assert.ok(isStopHeading("5. " + nfd.toUpperCase() + ":"));
});

test("pptx items", () => {
  const its = items("deck.pptx");
  const t = texts(its);
  for (const want of ["Meningioma grading", "Negative staining", "Atypical features are present",
    "Speaker note about grading"]) assert.ok(t.includes(want), want);
  const body = its.find((i) => i.segment && i.segment.plain.includes("NF2-altered"));
  assert.equal(body.segment.tagged, "In <g1>NF2-altered</g1> meningiomas, 1p loss matters<x1/><g2>See the WHO site</g2><x2/>");
  assert.equal(body.location, "Slide 1");
  const refs = its.filter((i) => i.part.endsWith("slides/slide2.xml"));
  assert.ok(refs.length && refs.every((i) => i.segment === null));
  assert.ok(refs.some((i) => i.skip === "references"));
  assert.ok(!t.some((x) => x.includes("Click to edit")));
});

test("pptx references stop", () => {
  const its = items("deck.pptx");
  const skips = (loc) => new Set(its.filter((i) => i.location === loc).map((i) => i.skip));
  assert.deepEqual(skips("Slide 2"), new Set(["references"]));
  assert.deepEqual(skips("Slide 5"), new Set(["references"]));
  for (const [loc, wants] of [["Slide 3", ["Survival by grade", "References:", "References"]],
    ["Notes 3", ["References", "Mention the 2021 criteria"]], ["Slide 4", ["Reference", "Ki-67 index"]]]) {
    assert.ok(!skips(loc).has("references"), loc);
    const plains = its.filter((i) => i.location === loc && i.segment).map((i) => i.segment.plain);
    for (const want of wants) assert.ok(plains.includes(want), loc + " " + want);
  }
});

test("locations follow presentation order", () => {
  const its = items("deck_reordered.pptx");
  const by = byText(its);
  assert.equal(by.get("Meningioma grading").location, "Slide 5");
  assert.equal(by.get("Speaker note about grading").location, "Notes 5");
  assert.equal(by.get("Survival by grade").location, "Slide 3");
  assert.ok(its[0].part === "ppt/slides/slide5.xml" && its[0].location === "Slide 1");
});

test("docx items", () => {
  const its = items("doc.docx");
  const t = texts(its);
  for (const want of ["Meningioma grading", "Department of Pathology", "Confidential draft", "Negative staining"]) {
    assert.ok(t.includes(want), want);
  }
  const para = its.find((i) => i.segment && i.segment.plain.includes("NF2-altered"));
  assert.equal(para.segment.tagged, "In <g1>NF2-altered</g1> meningiomas<g2>1</g2><x1/>criteria");
  const link = its.find((i) => i.segment && i.segment.plain.includes("WHO site"));
  assert.equal(link.segment.tagged, "See <g1>the WHO site</g1> for page <x1/><x2/>Next line of text");
  assert.ok(its.some((i) => i.skip === "tracked changes"));
  const body = its.filter((i) => i.part === "word/document.xml");
  const heading = body.findIndex((i) => i.text === "References");
  assert.ok(!body.slice(0, heading).some((i) => i.skip === "references"));
  assert.deepEqual(body.slice(heading).map((i) => i.skip), ["references", "references"]);
  assert.ok(body[body.length - 1].text.startsWith("Louis DN"));
  const by = byText(its);
  for (const text of ["52", "+", "<0.001", GREEK_CLONE, MICRO_UNIT, PRIME_END]) {
    assert.ok(by.get(text).skip === "no_text" && by.get(text).segment === null, text);
  }
  for (const text of ["No", "Yes"]) assert.equal(by.get(text).segment.plain, text);
  assert.ok(by.get(CHINESE).skip === "non_latin" && by.get(CHINESE).segment === null);
  const box = by.get("Text box caption");
  assert.equal(box.segment.plain, "Text box caption");
  const outer = body.find((i) => i.element !== box.element && iterElements(i.element, W, "p").includes(box.element));
  assert.ok(outer.skip === "no_text" && outer.segment === null);
});

test("a docx Reference column does not stop", () => {
  const its = items("refs_column.docx");
  assert.ok(!its.some((i) => i.skip === "references"));
  assert.ok(byText(its).get("Final diagnosis: atypical meningioma.").segment);
});

test("a docx text box does not stop", () => {
  const its = items("refs_textbox.docx");
  assert.ok(!its.some((i) => i.skip === "references"));
  assert.ok(byText(its).get("Final diagnosis: atypical meningioma.").segment);
});

// 4 and 5: a plain "References" (no style, outline level 9) is closed by the back-matter title "Appendix A"
for (let k = 1; k <= 5; k++) {
  test("docx references region " + k, () => {
    const by = byText(items("refs_region_" + k + ".docx"));
    assert.ok(by.get("Body text before the list").segment);
    assert.equal(by.get("References").skip, "references");
    assert.equal(by.get("Louis DN et al. Neuro Oncol 2021").skip, "references");
    for (const text of ["Appendix A", "Staining protocol for the lab"]) {
      assert.ok(by.get(text).segment && !by.get(text).skip, text);
    }
  });
}

const BACK_MATTER = ["Appendix", "Appendix A", "APPENDIX 2", "Appendix S1: Staining protocols", "Appendices", "Annex 1",
  "Supplementary", "Supplementary Material", "Supplementary data", "Supplementary Information",
  "Supplementary methods", "Supplementary Figures", "Supplementary tables", "Supporting Information",
  "Online Resource 1", "Acknowledgements", "Acknowledgments", "Abbreviations", "Glossary", "Figure legends", "Tables",
  "Author contributions", "Funding", "Conflict of interest", "Conflicts of Interest", "Competing interests",
  "Data availability", "About the author", "About the Authors", "7. Acknowledgements", "A. Appendix",
  "Appendix 1. Questionnaire", "Funding:", "Ph\u{1ee5} l\u{1ee5}c", "PH\u{1ee4} L\u{1ee4}C 2", "Phu luc 1"];

test("back-matter titles (the Python list)", () => {
  for (const t of BACK_MATTER) assert.ok(isBackMatterHeading(t), t);
  for (const t of ["References", "Staining protocol for the lab", "Louis DN et al. Neuro Oncol 2021",
    "Funding. J Synth Path. 2020;1:1-9.", "Tables of the synthetic series in a long form for the lab",
    "Appendix A. Example AB et al. 2019", "Appendicitis", "Funding was provided by the synthetic fund",
    "Abbreviations used in the synthetic text are listed below in full"]) assert.ok(!isBackMatterHeading(t), t);
  assert.ok(isBackMatterHeading("Ph\u{1ee5} l\u{1ee5}c".normalize("NFD")));
});

test("a back-matter title closes the references region whatever its style or level", () => {
  for (const name of ["refs_backmatter_plain.docx", "refs_backmatter_deeper.docx"]) {
    const by = byText(items(name));
    for (const text of ["References", "Louis DN et al. Neuro Oncol 2021", "Funding. J Synth Path. 2020;1:1-9."]) {
      assert.equal(by.get(text).skip, "references", name + " " + text);
    }
    for (const text of ["Acknowledgements", "Staining protocol for the lab"]) {
      assert.ok(by.get(text).segment && !by.get(text).skip, name + " " + text);
    }
  }
  // a plain paragraph after a plain "References" that is no back-matter title stays inside
  assert.ok(items("refs_plain_inside.docx").every((i) => i.skip === "references"));
});

for (let k = 1; k <= 6; k++) {
  test("docx references sub-headings " + k, () => {
    const by = byText(items("refs_sub_" + k + ".docx"));
    for (const text of ["References", "Primary sources", "Louis DN et al. Neuro Oncol 2021", "Reviews",
      "Perry A et al. Brain Pathol 2020"]) assert.equal(by.get(text).skip, "references", text);
    for (const text of ["Appendix A", "Staining protocol for the lab"]) {
      assert.ok(by.get(text).segment && !by.get(text).skip, text);
    }
  });
}

test("a docx stop heading without a level closes at any heading", () => {
  const by = byText(items("refs_nolevel.docx"));
  assert.equal(by.get("Louis DN et al. Neuro Oncol 2021").skip, "references");
  assert.ok(by.get("Appendix A").segment && by.get("Staining protocol for the lab").segment);
});

test("comments are collected only on request", () => {
  assert.ok(!items("comments.docx").some((i) => i.part === "word/comments.xml"));
  const its = items("comments.docx", { comments: true });
  const c = its.find((i) => i.part === "word/comments.xml");
  assert.equal(c.location, "Comments");
  assert.equal(c.segment.plain, "Check this staining result");
});

for (const name of ["deck.pptx", "doc.docx", "codec_cases.docx", "codec_cases.pptx", "chart.pptx"]) {
  test("identity round trip keeps every paragraph's visible structure: " + name, () => {
    const pkg = new OoxmlPackage(fixture(name));
    // a comment inside a w:r is dropped by design (the helper's run_atoms skips non-elements): not "visible"
    const commentInRun = (p) => iterElements(p, W, "r").some((r) => Array.from(r.childNodes).some((n) => n.nodeType === 8));
    const all = collectItems(pkg).filter((i) => i.segment);
    const its = all.filter((i) => !commentInRun(i.element));
    const before = its.map((i) => describe(i.element));
    for (const i of all) {
      apply(i.element, i.segment, i.segment.tagged);
      pkg.markDirty(i.part);
    }
    its.forEach((i, n) => assert.deepEqual(describe(i.element), before[n], i.location + " " + i.segment.tagged));
    const again = collectItems(new OoxmlPackage(pkg.save())).filter((i) => i.segment);
    assert.deepEqual(again.map((i) => i.segment.tagged), all.map((i) => i.segment.tagged));
  });
}
