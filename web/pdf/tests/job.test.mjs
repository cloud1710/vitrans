// The PDF job end to end in Node (web/pdf/job.js) on the synthetic PDFs of make_pdfs.mjs, with a scripted translator:
// the events and the segments sent (block text only, "Trang n"), the PDF re-read by pdf.js (the Vietnamese in, the
// English of the translated blocks out, headers / page numbers / References kept, the picture kept, the same page
// count), the DOCX re-read by the M1 reader, the report, a scanned page through an OCR stub, outputs written again
// from changed results, and a document with nothing to translate.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../../engine/tests/dom-node.mjs";
import { OoxmlPackage } from "../../engine/ooxml/package.js";
import { readZip, inflateEntry } from "../../engine/ooxml/zip.js";
import { nodeLibs, pdfjsText } from "./node_libs.mjs";
import { articlePdf, slidePdf, scanPdf, scanOcr, ARTICLE, SLIDE } from "./make_pdfs.mjs";
import { translatePdf, writeOutputs } from "../job.js";
import { openPdfLib, analyzePage } from "../pdfdoc.js";

const PHRASE = "tế bào hình thoi xếp thành bó dài với nhân không điển hình nhẹ và hiếm nhân chia";
const vi = (s) => {
  const words = PHRASE.split(" ");
  const n = Math.max(2, Math.round(s.tagged.split(" ").length * 1.2));
  return "Bản dịch " + (s.id + 1) + ": " + Array.from({ length: n }, (_, k) => words[k % words.length]).join(" ");
};
const SETUP = { classify: { stage: "classify", offline: false, unavailable: [], packs: [{ id: "pathology",
  name: "Giải phẫu bệnh", score: 0.3, matched: ["tumour"] }], candidates: [] },
pack: { id: "pathology", name: "Giải phẫu bệnh", key: "pathology@0.2.0" }, packRows: [{ id: "pathology",
  name: "Giải phẫu bệnh", version: "0.2.0" }], unavailable: [], unavailableNames: [], offline: false };

function engine(calls) {
  return {
    prepare: async (text) => { calls.prepare.push(text); return SETUP; },
    translateSegments: async (segs) => {
      calls.batches.push(segs);
      return segs.map((s) => ({ id: s.id, text: vi(s), level: 0, flags: [] }));
    },
  };
}

async function run(bytes, name, extra = {}) {
  const libs = await nodeLibs();
  const calls = { prepare: [], batches: [], events: [] };
  const res = await translatePdf(bytes, name, { libs, ...engine(calls), batchSize: 20, modelId: "test-model",
    device: { kind: "cloud", name: "" }, onProgress: (e) => calls.events.push(e), yieldFn: async () => {}, ...extra });
  return { res, calls };
}

const pageTexts = async (bytes) => (await pdfjsText(bytes)).map((items) => items.map((i) => i.str).join(" "));
const docxText = (bytes) => {
  const e = readZip(bytes).entries.find((x) => x.name === "word/document.xml");
  return [...new TextDecoder().decode(inflateEntry(e)).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("\n");
};

async function imageCount(bytes) {
  const { PL } = await nodeLibs();
  const doc = await openPdfLib(PL, bytes);
  return doc.getPages().reduce((n, p, i) => n + analyzePage(PL, doc, p, i).images.length, 0);
}

test("the article: block text out, Vietnamese in, layout and untranslated parts kept, a DOCX alongside", async () => {
  const bytes = await articlePdf();
  const { res, calls } = await run(bytes, "article.pdf");
  // events in the DOCX path's order
  const stages = calls.events.map((e) => e.stage);
  assert.deepEqual([...new Set(stages)], ["extract", "classify", "device", "translate", "write", "done"]);
  const counts = calls.events.find((e) => e.stage === "extract" && e.segments !== undefined);
  assert.equal(counts.segments, res.state.segments.length);
  // one classify with the segments' text; nothing of the header, the page numbers or the References in it
  assert.equal(calls.prepare.length, 1);
  const full = calls.prepare[0];
  assert.ok(full.includes(ARTICLE.title) && full.includes(ARTICLE.caption) && full.includes("S100 protein"));
  assert.ok(!full.includes("Synthetic Journal") && !full.includes("J Synth Path") && !full.includes("References"));
  assert.ok(full.includes("the cells were stained with eosin"), "the sentence cut by the column break is one segment");
  // segments: block text only, "Trang n", the neighbours as context, batches of at most 20
  const segs = calls.batches.flat();
  assert.ok(calls.batches.every((b) => b.length <= 20));
  assert.deepEqual(Object.keys(segs[0]).sort(), ["essential", "id", "nxt", "prev", "tagged", "where"]);
  assert.ok(segs.every((s, k) => s.id === k && /^Trang [12]$/.test(s.where) && s.essential.length === 0));
  assert.equal(segs[1].prev, segs[0].tagged);
  // the PDF: same pages, the picture kept, Vietnamese in, translated English out, the rest kept
  assert.equal(res.pdf.name, "article_vi.pdf");
  const [p1, p2] = await pageTexts(res.pdf.bytes);
  assert.equal((await pdfjsText(res.pdf.bytes)).length, 2);
  assert.equal(await imageCount(res.pdf.bytes), 1);
  assert.ok(p1.includes("Bản dịch 1: tế bào hình thoi"), p1.slice(0, 300));
  for (const en of [ARTICLE.title, "Spindle cell tumours of soft tissue", "Figure 1.", "Corresponding author", "Marker"]) {
    assert.ok(!p1.includes(en), "still in English: " + en);
  }
  assert.ok(p1.includes("Synthetic Journal of Soft Tissue Pathology") && p2.includes("Synthetic Journal"));
  assert.ok(p2.includes("J Synth Path. 2020") && p2.includes("References"), "References stay in English");
  assert.ok(p1.includes("12") && p1.includes("11"), "number cells stay");
  // the DOCX: the same blocks in order, the table, the References in English
  assert.equal(res.docx.name, "article_vi.docx");
  assert.equal(new OoxmlPackage(res.docx.bytes).kind, "docx");
  const dt = docxText(res.docx.bytes);
  assert.ok(dt.startsWith("Bản dịch 1:"), dt.slice(0, 80));
  assert.ok(dt.includes("J Synth Path. 2020") && !dt.includes("Synthetic Journal"));
  assert.ok(/<w:tbl>/.test(new TextDecoder().decode(inflateEntry(readZip(res.docx.bytes).entries
    .find((x) => x.name === "word/document.xml")))));
  // the report: the DOCX path's shape for a PDF
  const r = res.report;
  assert.equal(r.kind, "pdf");
  assert.equal(r.output, "article_vi.pdf");
  assert.deepEqual(r.outputs, ["article_vi.pdf", "article_vi.docx"]);
  assert.equal(r.counts.segments, segs.length);
  assert.equal(r.skipped.references, 3);
  assert.ok(r.pdf.removed_strings > 10 && r.pdf.covered_blocks === 0, JSON.stringify(r.pdf));
  assert.equal(r.pdf.error, null);
});

test("the slide: white title on the dark bar stays white, bullets translated, landscape page kept", async () => {
  const { res } = await run(await slidePdf(), "slide.pdf");
  const { PL } = await nodeLibs();
  const doc = await openPdfLib(PL, res.pdf.bytes);
  const page = doc.getPages()[0];
  assert.deepEqual([page.getWidth(), page.getHeight()], [960, 540]);
  const a = analyzePage(PL, doc, page, 0);
  const noto = a.shows.filter((s) => /Noto/.test(s.font && s.font.name));
  assert.ok(noto.some((s) => s.style.color.join() === "1,1,1" && s.size > 20), "a white title");
  const [t] = await pageTexts(res.pdf.bytes);
  assert.ok(!t.includes(SLIDE.title) && !t.includes("Mitotic count"));
  assert.ok(t.includes("Bản dịch 1:"));
});

test("a scanned page goes through OCR; the English picture is covered with the paper colour", async () => {
  const paper = [245, 243, 236];
  const render = async (pdf, index, scale) => {
    const page = await pdf.getPage(index + 1);
    const vp = page.getViewport({ scale });
    const w = Math.ceil(vp.width);
    const h = Math.ceil(vp.height);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let k = 0; k < w * h; k++) data.set([...paper, 255], k * 4);
    return { width: w, height: h, getContext: () => ({ getImageData: () => ({ width: w, height: h, data }) }) };
  };
  const ocr = { load: async () => ({ recognize: async (c) => scanOcr(c.width, c.height) }) };
  const { res, calls } = await run(await scanPdf(), "scan.pdf", { render, ocr });
  assert.ok(calls.events.some((e) => e.stage === "ocr" && e.page === 1 && e.pages === 1));
  assert.equal(res.report.pdf.ocr_pages, 1);
  assert.ok(res.report.pdf.covered_blocks >= 2);
  const sent = calls.batches.flat().map((s) => s.tagged);
  // the OCR lines become blocks like any text: the full-width first line runs on into the next two
  assert.deepEqual(sent, ["Case report", "A synthetic scanned page with English text lines. The lesion is composed of "
    + "bland spindle cells arranged in short fascicles without necrosis.",
  "Immunohistochemistry was negative for S100 protein."]);
  const [t] = await pageTexts(res.pdf.bytes);
  assert.ok(t.includes("Bản dịch 3:"), t);
  const { PL } = await nodeLibs();
  const doc = await openPdfLib(PL, res.pdf.bytes);
  const contents = doc.getPages()[0].node.Contents();
  const raw = contents.asArray().map((ref) => new TextDecoder("latin1").decode(
    PL.decodePDFRawStream(doc.context.lookup(ref)).decode())).join(" ");
  assert.match(raw, /0\.96\d* 0\.95\d* 0\.92\d* rg/, "the cover in the paper colour");
});

test("the outputs are written again from changed results without reading the file again", async () => {
  const { res } = await run(await slidePdf(), "slide.pdf");
  const changed = res.state.results.map((r, k) => (k === 0 ? { ...r, text: "Phân độ u tế bào hình thoi" } : r));
  const out = await writeOutputs(res.state, changed);
  const [t] = await pageTexts(out.pdf.bytes);
  assert.ok(t.includes("Phân độ u tế bào hình thoi") && !t.includes("Bản dịch 1:"), t);
  assert.ok(docxText(out.docx.bytes).startsWith("Phân độ u tế bào hình thoi"));
});

test("a scan without OCR: nothing to send, the page reported, both files still written", async () => {
  const { res, calls } = await run(await scanPdf(), "scan.pdf");
  assert.equal(calls.prepare.length, 0);
  assert.equal(calls.batches.length, 0);
  assert.equal(res.report.skipped.scan_no_ocr, 1);
  assert.equal(res.report.counts.segments, 0);
  assert.ok(res.pdf && res.docx);
});

// ---------------------------------------------------------------- the book page: sizes, leading, inline styles

// word by word, about 1.3 times the English, the inline tags kept where they are (as the core does)
const SYL = ["te", "bao", "hinh", "thoi", "xep", "thanh", "nhan", "khong", "dien", "benh", "hoc", "chan", "doan"];
const wordVi = (w, k) => {
  const m = /^([^A-Za-z]*)([A-Za-z'-]*)(.*)$/.exec(w);
  if (!m[2]) return w;
  const n = m[2].length <= 3 ? 1 : 2;
  let v = Array.from({ length: n }, (_, j) => SYL[(k * 3 + j + m[2].length) % SYL.length]).join(" ");
  if (/^[A-Z]/.test(m[2])) v = v[0].toUpperCase() + v.slice(1);
  return m[1] + v + m[3];
};
const keepTags = (tagged) => {
  let k = 0;
  return tagged.split(/(<\/?g\d+>)/).map((p) => (/^<\/?g\d+>$/.test(p) ? p : p.replace(/\S+/g, (w) => wordVi(w, k++)))).join("");
};
const tagEngine = (calls) => ({
  prepare: async (text) => { calls.prepare.push(text); return SETUP; },
  translateSegments: async (segs) => {
    calls.batches.push(segs);
    return segs.map((s) => ({ id: s.id, text: keepTags(s.tagged), level: 0, flags: [] }));
  },
});

/** The Vietnamese drawn on page 0 by block: {block id: [{size, face, x, base (viewport y)}]}. */
async function drawnByBlock(res) {
  const { PL } = await nodeLibs();
  const doc = await openPdfLib(PL, res.pdf.bytes);
  const page = doc.getPages()[0];
  const H = page.getHeight();
  const a = analyzePage(PL, doc, page, 0);
  const blocks = res.state.layout.blocks.filter((b) => b.page === 0);
  const out = {};
  for (const s of a.shows.filter((x) => /Noto/.test(x.font && x.font.name))) {
    const base = H - s.matrix[5];
    const x = s.matrix[4];
    const owner = blocks.filter((b) => b.box.top - 1 <= base && x >= b.box.x0 - 1 && x <= b.box.x1 + 1)
      .sort((p, q) => q.box.top - p.box.top)[0];
    // pdf-lib names an embedded subset "<face>-<number>"
    const face = s.font.name.replace(/^[A-Z]{6}\+/, "").replace(/-\d+$/, "");
    (out[owner.id] = out[owner.id] || []).push({ size: Math.round(s.size * 100) / 100, face, x, base });
  }
  return out;
}

test("the book page: siblings share one size, lines keep the original leading, italic and bold stay on their words", async () => {
  const { bookPdf } = await import("./make_pdfs.mjs");
  const libs = await nodeLibs();
  const calls = { prepare: [], batches: [], events: [] };
  const res = await translatePdf(await bookPdf(), "book.pdf", { libs, ...tagEngine(calls), batchSize: 20, modelId: "m",
    device: { kind: "cloud", name: "" }, yieldFn: async () => {} });
  const sent = calls.batches.flat().map((s) => s.tagged);
  assert.ok(sent.some((t) => t.includes("<g1>The Synthetic Basis of Lesions</g1>")), sent.join("\n"));
  assert.ok(sent.some((t) => t.includes("<g1>practical pearls</g1>")));
  assert.ok(sent.includes("<g1>Name:</g1> Synthetic Person, MD"), sent.join("\n"));
  const L = res.state.layout.blocks;
  const paras = L.filter((b) => b.kind === "para" && b.page === 0 && b.lines.length > 1);
  assert.equal(paras.length, 3, L.map((b) => b.kind + ":" + b.text.slice(0, 30)).join(" | "));
  const drawn = await drawnByBlock(res);
  // one size for the three paragraphs (they were all 10 pt), never under the floor
  const sizes = new Set(paras.flatMap((b) => drawn[b.id].map((d) => d.size)));
  assert.equal(sizes.size, 1, "sizes " + [...sizes]);
  const size = [...sizes][0];
  assert.ok(size < 10 && size >= 7.2 - 1e-9, "size " + size);
  // the original leading: 12 pt over 10 pt, so the baselines are 1.2 times the size apart
  for (const b of paras) {
    const bases = [...new Set(drawn[b.id].map((d) => Math.round(d.base * 100) / 100))].sort((p, q) => p - q);
    assert.ok(bases.length > 1);
    for (let k = 1; k < bases.length; k++) {
      assert.ok(Math.abs((bases[k] - bases[k - 1]) / size - 1.2) < 0.01, "pitch " + (bases[k] - bases[k - 1]));
    }
  }
  // the italic title in the first paragraph only, the bold phrase in the second only
  const faces = paras.map((b) => new Set(drawn[b.id].map((d) => d.face.replace(/^[A-Z]{6}\+/, ""))));
  assert.deepEqual(faces.map((f) => [...f].sort()), [["NotoSerif-Italic", "NotoSerif-Regular"],
    ["NotoSerif-Bold", "NotoSerif-Regular"], ["NotoSerif-Regular"]]);
  // the CV rows: a bold label, then the regular value on the same baseline
  for (const label of ["Name:", "Position:"]) {
    const b = L.find((x) => x.text.startsWith(label));
    const ds = drawn[b.id].sort((p, q) => p.x - q.x);
    assert.deepEqual(ds.map((d) => d.face.replace(/^[A-Z]{6}\+/, "")), ["NotoSans-Bold", "NotoSans-Regular"]);
    assert.equal(new Set(ds.map((d) => Math.round(d.base))).size, 1);
  }
  // the DOCX: the label bold at run level, the value not
  const xml = new TextDecoder().decode(inflateEntry(readZip(res.docx.bytes).entries.find((x) => x.name === "word/document.xml")));
  const label = keepTags("<g1>Name:</g1> Synthetic Person, MD");
  const lv = /<g1>(.*)<\/g1>(.*)/.exec(label);
  assert.ok(xml.includes("<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space=\"preserve\">" + lv[1]), xml.slice(0, 2000));
  assert.ok(xml.includes("<w:r><w:t xml:space=\"preserve\">" + lv[2]), xml.slice(0, 2000));
  assert.ok(xml.includes("<w:i/>"), "an italic run");
});
