// The pdf-lib side of the PDF path (web/pdf/pdfdoc.js) on PDFs made here with pdf-lib: font metrics from the font
// dictionaries (a standard font without /Widths, an embedded TrueType as Type0 / Identity-H, a form XObject with
// its own resources), string boxes that agree with pdf.js, strings taken out of the page and of a form, the
// Vietnamese drawn with an embedded Noto font (subset), a cover rectangle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeLibs, pdfjsText } from "./node_libs.mjs";
import { openPdfLib, analyzePage, applyEdits, FontSet, drawLine, drawCover } from "../pdfdoc.js";

const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;
const dec = (b) => Array.from(b, (c) => String.fromCharCode(c)).join("");

async function sample() {
  const { PL, fontkit, loadFont } = await nodeLibs();
  const doc = await PL.PDFDocument.create();
  doc.registerFontkit(fontkit);
  const helv = await doc.embedFont(PL.StandardFonts.Helvetica);
  const bold = await doc.embedFont(PL.StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(await loadFont("NotoSerif-Regular"), { subset: true });
  const page = doc.addPage([595, 842]);
  page.drawText("Bold title", { x: 50, y: 760, size: 18, font: bold });
  page.drawText("Remove me please", { x: 50, y: 700, size: 12, font: helv });
  page.drawText("Keep this line", { x: 50, y: 650, size: 12, font: helv });
  page.drawText("Serif words here", { x: 300, y: 700, size: 10, font: serif });
  const src = await PL.PDFDocument.create();
  const sp = src.addPage([200, 100]);
  sp.drawText("Inside form", { x: 10, y: 50, size: 10, font: await src.embedFont(PL.StandardFonts.TimesRoman) });
  const [emb] = await doc.embedPdf(await src.save());
  page.drawPage(emb, { x: 300, y: 400 });
  return { bytes: await doc.save(), widths: { remove: helv.widthOfTextAtSize("Remove me please", 12),
    serif: serif.widthOfTextAtSize("Serif words here", 10), title: bold.widthOfTextAtSize("Bold title", 18) } };
}

const strText = (s) => s.elements.filter((e) => e.kind === "str").map((e) => e.bytes);

test("string boxes, fonts and styles come from the font dictionaries and agree with pdf.js", async () => {
  const { PL } = await nodeLibs();
  const { bytes, widths } = await sample();
  const doc = await openPdfLib(PL, bytes);
  const a = analyzePage(PL, doc, doc.getPages()[0], 0);
  assert.equal(a.shows.length, 5);
  const find = (x, y) => a.shows.find((s) => near(s.box[0], x, 0.5) && near(s.box[1], y - 0.25 * s.size, 0.5));
  // pdf.js puts the same strings at the same places, with the same widths (pdf-lib's own measure adds kerning,
  // which a plain Tj does not apply)
  const items = (await pdfjsText(bytes))[0];
  const width = (str) => items.find((i) => i.str === str).width;
  const remove = find(50, 700);
  assert.ok(near(remove.box[2], 50 + width("Remove me please")), "width " + (remove.box[2] - 50));
  assert.ok(Math.abs(width("Remove me please") - widths.remove) < 1);
  assert.equal(remove.widthsKnown, true);
  assert.equal(remove.style.bold, false);
  const title = find(50, 760);
  assert.equal(title.style.bold, true);
  assert.ok(near(title.box[2], 50 + width("Bold title")));
  const serif = find(300, 700);
  assert.equal(serif.widthsKnown, true);
  assert.equal(serif.style.serif, true);
  assert.ok(near(serif.box[2], 300 + widths.serif), "serif width " + (serif.box[2] - 300) + " vs " + widths.serif);
  const form = a.shows.find((s) => s.stream !== "page:0");
  assert.ok(form && /^form:/.test(form.stream));
  assert.ok(near(form.box[0], 310, 0.5) && near(form.box[1], 450 - 2.5, 0.5));
  assert.equal(form.style.serif, true);
  const it = items.find((i) => i.str === "Remove me please");
  assert.ok(near(it.transform[4], 50) && near(it.transform[5], 700));
  const fi = items.find((i) => i.str === "Inside form");
  assert.ok(near(fi.transform[4], form.box[0]) && near(fi.transform[5], form.box[1] + 2.5));
});

test("strings taken out of the page stream and of a form; the rest stays where it was", async () => {
  const { PL } = await nodeLibs();
  const { bytes } = await sample();
  const doc = await openPdfLib(PL, bytes);
  const pages = doc.getPages();
  const a = analyzePage(PL, doc, pages[0], 0);
  const edits = new Map();
  for (const s of a.shows) {
    const t = strText(s).map(dec).join("");
    if (s.stream === "page:0" && !/Keep|Bold|\u0000/.test(t) && s.font.name === "Helvetica") {
      edits.set("page:0", new Map([[s.index, { remove: new Set([0]) }]]));
    }
    if (s.stream !== "page:0") edits.set(s.stream, new Map([[s.index, { remove: new Set([0]) }]]));
  }
  assert.equal(edits.size, 2);
  applyEdits(PL, doc, [a], edits);
  const out = await doc.save();
  const before = (await pdfjsText(bytes))[0];
  const after = (await pdfjsText(out))[0];
  const strs = after.map((i) => i.str);
  assert.ok(!strs.includes("Remove me please") && !strs.includes("Inside form"), JSON.stringify(strs));
  for (const keep of ["Bold title", "Keep this line", "Serif words here"]) {
    const b = before.find((i) => i.str === keep);
    const c = after.find((i) => i.str === keep);
    assert.ok(c, keep + " missing");
    assert.deepEqual(c.transform, b.transform);
  }
});

test("Vietnamese is drawn with an embedded font, a symbol the font lacks with the fallback; covers are drawn", async () => {
  const { PL, fontkit, loadFont } = await nodeLibs();
  const doc = await PL.PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 842]);
  const fonts = new FontSet(PL, doc, loadFont);
  await fonts.prepare(["NotoSans-Regular", "NotoSerif-Bold"]);
  const vi = "Khối u gồm tế bào hình thoi, độ mô học ≥ 2; TGF-β và α-SMA dương tính.";
  const w = fonts.measure(vi, 11, "NotoSans-Regular");
  assert.ok(w > 200 && w < 500, "width " + w);
  drawCover(PL, page, [40, 600, 400, 640], [1, 1, 0.8]);
  drawLine(PL, page, fonts, { text: vi, x: 50, y: 620, size: 11, face: "NotoSans-Regular", color: [0, 0, 0.5], rotate: 0 });
  drawLine(PL, page, fonts, { text: "Tiêu đề in đậm", x: 50, y: 700, size: 16, face: "NotoSerif-Bold", color: [0, 0, 0], rotate: 0 });
  const bytes = await doc.save();
  const items = (await pdfjsText(bytes))[0];
  const text = items.map((i) => i.str).join("");
  assert.ok(text.includes("Khối u gồm tế bào hình thoi, độ mô học "), text);
  assert.ok(text.includes("2; TGF-β và α-SMA dương tính."), text);
  assert.ok(text.includes("≥"), "the fallback symbol is there: " + text);
  assert.ok(items.some((i) => i.str === "Tiêu đề in đậm" && near(i.transform[4], 50) && near(i.transform[5], 700)));
  assert.ok(bytes.length < 60000, "subset fonts: " + bytes.length + " bytes");
});

test("a list bullet the fonts lack (a black circle) is drawn as the bullet they have, not as '?'", async () => {
  const { PL, fontkit, loadFont } = await nodeLibs();
  const doc = await PL.PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = new FontSet(PL, doc, loadFont);
  await fonts.prepare(["NotoSerif-Regular"]);
  for (const b of ["\u25cf", "\u25aa", "\u25a0"]) {
    const runs = fonts.runs(b + " Phế quản", "NotoSerif-Regular");
    assert.equal(runs.map((r) => r.text).join(""), "• Phế quản", b);
  }
});

test("a rotated page gets upright text in the viewer", async () => {
  const { PL, fontkit, loadFont, pdfjs } = await nodeLibs();
  const doc = await PL.PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 842]);
  page.setRotation(PL.degrees(90));
  const fonts = new FontSet(PL, doc, loadFont);
  await fonts.prepare(["NotoSans-Regular"]);
  drawLine(PL, page, fonts, { text: "Chữ đứng", x: 100, y: 100, size: 12, face: "NotoSans-Regular", color: [0, 0, 0], rotate: 90 });
  const bytes = await doc.save();
  const pdf = await pdfjs.getDocument({ data: bytes, useWasm: false, verbosity: 0 }).promise;
  const p = await pdf.getPage(1);
  const vp = p.getViewport({ scale: 1 });
  const it = (await p.getTextContent()).items.find((i) => i.str === "Chữ đứng");
  const t = pdfjs.Util.transform(vp.transform, it.transform);
  assert.ok(t[0] > 0 && Math.abs(t[1]) < 1e-6, "horizontal in the viewport: " + t);
  await pdf.loadingTask.destroy();
});
