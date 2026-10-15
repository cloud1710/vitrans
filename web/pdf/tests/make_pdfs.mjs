// Synthetic PDFs for the PDF path's tests, built with the vendored pdf-lib (synthetic text only):
//   article  A4, two pages: a running header, a centred bold title, authors, an abstract, two columns with a heading,
//            a figure (an embedded PNG) and its caption, a table drawn with rules, a footnote under a rule, page
//            numbers; a sentence cut by the column break; page 2 ends with References (left in English). Body text in
//            an embedded TrueType font (Type0 / Identity-H, as Word writes), the rest in standard fonts.
//   slide    a 960 x 540 landscape slide: a dark title bar with white bold text, bullets, a footer and a number.
//   scan     an image-only A4 page (the picture of text lines made by tests/scan_image.py), plus its OCR lines.
//   book     a book page: a heading, three tight paragraphs of one size with italic / bold words inside lines, and
//            CV rows with a bold label before a regular value.
// node web/pdf/tests/make_pdfs.mjs <out dir> writes article.pdf, slide.pdf, book.pdf (and scan.pdf when scan.png is in the
// fixtures folder); the tests call the builders directly.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeLibs } from "./node_libs.mjs";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const EPOCH = new Date(Date.UTC(2026, 0, 1));

// a tiny grey-gradient PNG (16 x 12) made without a canvas: zlib through pdf-lib's own deflate is not exported, so
// the picture is stored uncompressed (deflate "stored" blocks)
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const chunk = (type, data) => {
    const t = Array.from(type, (c) => c.charCodeAt(0));
    return [...u32(data.length), ...t, ...data, ...u32(crc([...t, ...data]))];
  };
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) raw.push(60 + 10 * x, 90 + 8 * y, 160);
  }
  let a = 1;
  let b = 0;
  for (const v of raw) { a = (a + v) % 65521; b = (b + a) % 65521; }
  const zlib = [0x78, 0x01, 0x01, raw.length & 255, raw.length >> 8, ~raw.length & 255, (~raw.length >> 8) & 255, ...raw,
    ...u32(((b << 16) | a) >>> 0)];
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...u32(w), ...u32(h), 8, 2, 0, 0, 0]), ...chunk("IDAT", zlib), ...chunk("IEND", [])]);
}

function lines(text, font, size, width) {
  const out = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const next = cur ? cur + " " + w : w;
    if (cur && font.widthOfTextAtSize(next, size) > width) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export const ARTICLE = {
  header: "Synthetic Journal of Soft Tissue Pathology 2026; 3: 101-102",
  title: "Spindle cell lesions in a synthetic series",
  authors: "First Author, Second Author and Third Author",
  abstractHead: "Abstract",
  abstract: "This synthetic abstract describes a small series of spindle cell lesions. The tumours were reviewed by two "
    + "observers and the results were compared with the immunohistochemical profile of each case.",
  col1: "Spindle cell tumours of soft tissue form a broad group of lesions with overlapping morphology. The tumour "
    + "cells are arranged in long fascicles and show mild nuclear atypia with rare mitoses. In the second series the "
    + "cells were",
  col2a: "stained with eosin and reviewed again by the same observers before the final diagnosis was made.",
  methodsHead: "Methods",
  methods: "All specimens were fixed in buffered formalin and embedded in paraffin. Sections were cut at four microns.",
  caption: "Figure 1. Spindle cells arranged in long fascicles.",
  table: [["Marker", "Positive", "Negative"], ["CD34", "12", "3"], ["S100 protein", "4", "11"]],
  footnote: "1 Corresponding author: synthetic address, Example City.",
  page2: "The second page continues the discussion of the series. Most lesions were benign and no tumour recurred.",
  refsHead: "References",
  refs: ["1. Synthetic A, Author B. A study of spindle cells. J Synth Path. 2020;1:1-9.",
    "2. Synthetic C. Another study of fascicles. J Synth Path. 2021;2:10-19."],
};

export async function articlePdf() {
  const { PL, fontkit, loadFont } = await nodeLibs();
  const doc = await PL.PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);
  doc.setProducer("synthetic");
  doc.setCreator("synthetic");
  const body = await doc.embedFont(await loadFont("NotoSerif-Regular"), { subset: true });
  const helv = await doc.embedFont(PL.StandardFonts.Helvetica);
  const bold = await doc.embedFont(PL.StandardFonts.HelveticaBold);
  const times = await doc.embedFont(PL.StandardFonts.TimesRoman);
  const img = await doc.embedPng(png(16, 12));
  const A = ARTICLE;
  const H = 842;
  const L = 50;
  const R = 545;
  const C1 = [L, 285];
  const C2 = [310, R];
  const gray = PL.rgb(0.3, 0.3, 0.3);
  // page 1
  let page = doc.addPage([595, H]);
  page.drawText(A.header, { x: L, y: H - 30, size: 8, font: helv, color: gray });
  const tw = bold.widthOfTextAtSize(A.title, 18);
  page.drawText(A.title, { x: (595 - tw) / 2, y: H - 80, size: 18, font: bold });
  const aw = helv.widthOfTextAtSize(A.authors, 10);
  page.drawText(A.authors, { x: (595 - aw) / 2, y: H - 100, size: 10, font: helv });
  page.drawText(A.abstractHead, { x: L, y: H - 130, size: 11, font: bold });
  let y = H - 145;
  for (const l of lines(A.abstract, body, 10, R - L)) { page.drawText(l, { x: L, y, size: 10, font: body }); y -= 12; }
  // column 1: paragraph that runs to the bottom of its column region, then the figure and the caption
  y = H - 205;
  const top = y;
  const c1 = lines(A.col1, body, 10, C1[1] - C1[0]);
  for (const l of c1) { page.drawText(l, { x: C1[0], y, size: 10, font: body }); y -= 12; }
  page.drawImage(img, { x: C1[0], y: y - 110, width: 200, height: 100 });
  y -= 125;
  page.drawText(A.caption, { x: C1[0], y, size: 8, font: helv });
  // column 2: the continuation (lower case), the Methods heading and paragraph, the table
  y = top;
  for (const l of lines(A.col2a, body, 10, C2[1] - C2[0])) { page.drawText(l, { x: C2[0], y, size: 10, font: body }); y -= 12; }
  y -= 10;
  page.drawText(A.methodsHead, { x: C2[0], y, size: 11, font: bold });
  y -= 15;
  for (const l of lines(A.methods, body, 10, C2[1] - C2[0])) { page.drawText(l, { x: C2[0], y, size: 10, font: body }); y -= 12; }
  y -= 14;
  const cols = [C2[0] + 4, C2[0] + 90, C2[0] + 160];
  page.drawLine({ start: { x: C2[0], y: y + 12 }, end: { x: C2[1], y: y + 12 }, thickness: 0.6 });
  for (const row of A.table) {
    row.forEach((c, k) => page.drawText(c, { x: cols[k], y, size: 9, font: helv }));
    page.drawLine({ start: { x: C2[0], y: y - 5 }, end: { x: C2[1], y: y - 5 }, thickness: 0.4 });
    y -= 17;
  }
  // footnote under a rule, page number
  page.drawLine({ start: { x: L, y: 70 }, end: { x: L + 120, y: 70 }, thickness: 0.5 });
  page.drawText(A.footnote, { x: L, y: 58, size: 7, font: times });
  page.drawText("1", { x: 295, y: 30, size: 9, font: helv });
  // page 2
  page = doc.addPage([595, H]);
  page.drawText(A.header, { x: L, y: H - 30, size: 8, font: helv, color: gray });
  y = H - 80;
  for (const l of lines(A.page2, body, 10, R - L)) { page.drawText(l, { x: L, y, size: 10, font: body }); y -= 12; }
  y -= 20;
  page.drawText(A.refsHead, { x: L, y, size: 11, font: bold });
  y -= 16;
  for (const r of A.refs) { page.drawText(r, { x: L, y, size: 9, font: times }); y -= 13; }
  page.drawText("2", { x: 295, y: 30, size: 9, font: helv });
  return doc.save();
}

export const SLIDE = {
  title: "Grading of spindle cell tumours",
  bullets: ["• Mitotic count per ten high power fields", "• Necrosis and its extent in the tumour",
    "• Differentiation score of the lesion"],
  footer: "Synthetic teaching deck",
};

export async function slidePdf() {
  const { PL } = await nodeLibs();
  const doc = await PL.PDFDocument.create();
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);
  doc.setProducer("synthetic");
  doc.setCreator("synthetic");
  const helv = await doc.embedFont(PL.StandardFonts.Helvetica);
  const bold = await doc.embedFont(PL.StandardFonts.HelveticaBold);
  const page = doc.addPage([960, 540]);
  page.drawRectangle({ x: 0, y: 440, width: 960, height: 100, color: PL.rgb(0.1, 0.2, 0.45) });
  page.drawText(SLIDE.title, { x: 60, y: 478, size: 32, font: bold, color: PL.rgb(1, 1, 1) });
  let y = 370;
  for (const b of SLIDE.bullets) { page.drawText(b, { x: 80, y, size: 22, font: helv }); y -= 48; }
  page.drawText(SLIDE.footer, { x: 60, y: 24, size: 10, font: helv, color: PL.rgb(0.4, 0.4, 0.4) });
  page.drawText("3", { x: 900, y: 24, size: 10, font: helv, color: PL.rgb(0.4, 0.4, 0.4) });
  return doc.save();
}

/** The scanned page: tests/fixtures/scan.png (text lines drawn by scan_image.py) on an A4 page, nothing else. */
export async function scanPdf() {
  const { PL } = await nodeLibs();
  const doc = await PL.PDFDocument.create();
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);
  doc.setProducer("synthetic");
  doc.setCreator("synthetic");
  const img = await doc.embedPng(readFileSync(join(FIXTURES, "scan.png")));
  const page = doc.addPage([595, 842]);
  page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  return doc.save();
}

/** The OCR answer for the scanned page rendered at width x height pixels (the line boxes of scan.json, which are
 * fractions of the page). */
export function scanOcr(width, height) {
  const lines = JSON.parse(readFileSync(join(FIXTURES, "scan.json"), "utf8")).lines;
  return { lines: lines.map((l) => ({ text: l.text, box: [l.box[0] * width, l.box[1] * height, l.box[2] * width,
    l.box[3] * height] })) };
}

// A book page: a bold heading, three paragraphs of one size and one leading (10 / 12 pt) set tight under each other
// (the second and third open with a first-line indent) with an italic title and a bold phrase inside lines, then CV
// rows with a bold label and a regular value on one line. Pieces are [text, style] with style "r" | "i" | "b".
export const BOOK = {
  heading: "About This Synthetic Book",
  paras: [
    [["This synthetic book is written for residents who start their training in surgical pathology and want a short "
      + "guide to the daily work at the bench. Classic texts such as ", "r"], ["The Synthetic Basis of Lesions", "i"],
    [" describe disease in depth, but the practical questions of grossing, staining and reporting are often left to "
      + "the attending at the microscope. The chapters that follow try to close that gap with short notes on each "
      + "organ system and on the most common pitfalls of the first year.", "r"]],
    [["Each chapter starts with the normal histology of the organ and then lists the ", "r"], ["practical pearls", "b"],
      [" that help to tell a reactive change from a true neoplasm. The aim is that a reader can finish one chapter in "
        + "twenty minutes and come away with enough knowledge to discuss the case with the attending.", "r"]],
    [["Medical students who rotate through the department will also find the notes useful before their first "
      + "sign-out session.", "r"]],
  ],
  rows: [[["Name:", "b"], [" Synthetic Person, MD", "r"]], [["Position:", "b"], [" Clinical Teacher of Pathology", "r"]]],
};

export async function bookPdf() {
  const { PL } = await nodeLibs();
  const doc = await PL.PDFDocument.create();
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);
  doc.setProducer("synthetic");
  doc.setCreator("synthetic");
  const fonts = { r: await doc.embedFont(PL.StandardFonts.TimesRoman), i: await doc.embedFont(PL.StandardFonts.TimesRomanItalic),
    b: await doc.embedFont(PL.StandardFonts.TimesRomanBold) };
  const sans = { r: await doc.embedFont(PL.StandardFonts.Helvetica), b: await doc.embedFont(PL.StandardFonts.HelveticaBold) };
  const H = 842;
  const L = 170;
  const R = 545;
  const page = doc.addPage([595, H]);
  page.drawText(BOOK.heading, { x: L, y: H - 100, size: 12, font: fonts.b });
  // words with their styles, wrapped to the column (indent on the first line), every line drawn piece by piece
  let y = H - 125;
  for (const [k, pieces] of BOOK.paras.entries()) {
    const words = pieces.flatMap(([t, st]) => t.split(" ").filter(Boolean).map((w) => [w, st]));
    const lines = [];
    let cur = [];
    const width = (ws) => ws.reduce((a, [w, st], j) => a + fonts[st].widthOfTextAtSize((j ? " " : "") + w, 10), 0);
    for (const w of words) {
      const room = R - L - (lines.length === 0 && k > 0 ? 12 : 0);
      if (cur.length && width([...cur, w]) > room) { lines.push(cur); cur = [w]; } else cur.push(w);
    }
    if (cur.length) lines.push(cur);
    lines.forEach((ws, n) => {
      let x = L + (n === 0 && k > 0 ? 12 : 0);
      ws.forEach(([w, st], j) => {
        const t = (j ? " " : "") + w;
        page.drawText(t, { x, y, size: 10, font: fonts[st] });
        x += fonts[st].widthOfTextAtSize(t, 10);
      });
      y -= 12;
    });
  }
  y -= 30;
  for (const row of BOOK.rows) {
    let x = 60;
    for (const [t, st] of row) {
      page.drawText(t, { x, y, size: 10, font: sans[st] });
      x += sans[st].widthOfTextAtSize(t, 10);
    }
    y -= 20;
  }
  return doc.save();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] || FIXTURES;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "article.pdf"), await articlePdf());
  writeFileSync(join(out, "slide.pdf"), await slidePdf());
  writeFileSync(join(out, "book.pdf"), await bookPdf());
  if (existsSync(join(FIXTURES, "scan.png"))) writeFileSync(join(out, "scan.pdf"), await scanPdf());
  console.log("written to " + out);
}
