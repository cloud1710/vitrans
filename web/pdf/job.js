// One PDF job in the page (spec Amendment H, "PDF giữ bố cục + DOCX"): read -> blocks -> translate (the core,
// local or the cloud engine: only the blocks' text leaves the device) -> write a PDF that keeps every page, picture,
// vector and table with the Vietnamese in place of the English, and a DOCX of the same blocks.
//   translatePdf(bytes, name, opts) -> {pdf: {bytes, name} | null, docx: {bytes, name}, report, state}
//   writeOutputs(state, results) -> {pdf, docx, overflow}: the outputs again from kept results (the term review's
//     corrected files), without reading or translating anything again
// opts: libs {pdfjs, PL, fontkit, wasmUrl, loadFont(face) -> bytes} (web/pdf/libs.js), prepare(fullText, {domain,
// signal}) -> setup, translateSegments(segments, {setup, tm, signal}) -> results (the core's contract; segments {id,
// tagged: the block text, essential: [], prev, nxt, where: "Trang n"}), batchSize, modelId, device, domain, tm,
// onProgress (the DOCX path's events, plus {stage: "ocr", page, pages}), signal, ocr {load() -> {recognize(canvas)}}
// (web/ocr/ocr.js; pages without a usable text layer), render(pdf, pageIndex, scale) -> canvas (browser), yieldFn,
// now. Errors carry .code: "password", "unsupported_file", "model_failed", "aborted" (as the DOCX path).
// How the English goes: the strings of each translated block are taken out of the page's content streams (and of a
// form drawn only inside translated blocks), the strings after them keep their places (content.js); where that
// cannot be done (invisible OCR text over a picture, a scanned page, a string shared with text that stays, no
// string found) the block is covered with the background colour sampled around it. The Vietnamese is drawn with
// Noto Sans / Noto Serif, bold / italic per inline span (the block's bold / italic runs travel as <gN> tags, as in the
// DOCX path), fitted to the block (fit.js) at the original leading; the blocks of one page that shared a size take
// one size (the smallest any of them needs, floored), overflow marked in the report.
import { openPdfjs, readPages, ocrItems, sampleRing } from "./read.js";
import { openPdfLib, analyzePage, applyEdits, FontSet, drawLine, drawCover } from "./pdfdoc.js";
import { attachStyles, planRemoval, toViewport, invert } from "./plan.js";
import { layoutDocument, segmentsOf, runsOfTagged, splitRuns, runsText } from "./layout.js";
import { roomFor, sizeNeeded, sharedSizes, placeAt, MIN_SHARE, FLOOR_SHARE } from "./fit.js";
import { buildDocx } from "./docx.js";
import { applyPoint } from "./content.js";
import { buildReport } from "../engine/report.js";

export const MIME_PDF = "application/pdf";
const OCR_LONG_SIDE = 2000;  // pixels: the long side of a page rendered for OCR
const SAMPLE_SCALE = 1.5;    // a page rendered to sample the background around covered blocks
const STOP = ["header_footer", "page_number"];
const EMPTY_SETUP = { classify: { stage: "classify", offline: false, unavailable: [], packs: [], candidates: [] },
  pack: { id: "_none", name: "Chung", key: "_none@0" }, packRows: [], unavailable: [], unavailableNames: [], offline: false };

const abort = () => new DOMException("The operation was aborted.", "AbortError");
const check = (signal) => { if (signal && signal.aborted) throw abort(); };
const head = (s, n) => (Array.from(s).length <= n ? s : Array.from(s).slice(0, n).join(""));
const plainOut = (t) => String(t || "").replace(/<x\d+\/>/g, " ").replace(/<\/?g\d+>/g, "").replace(/\s+/g, " ").trim();
const yieldDefault = () => new Promise((r) => setTimeout(r, 0));

/** <stem>_vi.pdf and <stem>_vi.docx of an uploaded name. */
export function outputNames(name) {
  const base = String(name || "input.pdf").split(/[\\/]/).pop();
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return { pdf: stem + "_vi.pdf", docx: stem + "_vi.docx" };
}

function faceOf(style, docSerif) {
  const serif = style ? style.serif : docSerif;
  const b = !!(style && style.bold);
  const i = !!(style && style.italic);
  return (serif ? "NotoSerif" : "NotoSans") + "-" + (b && i ? "BoldItalic" : b ? "Bold" : i ? "Italic" : "Regular");
}

function luminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

const median = (xs) => [...xs].sort((x, y) => x - y)[xs.length >> 1];
const sizeKey = (size) => Math.round(size * 2) / 2;

/** Leading (baseline pitch / size) of each block: its own when it has two lines or more, else the median of the
 * document's blocks of its size, else of all its blocks, else 1.2; kept within 1.1 .. 1.6. */
function leadingOf(layout) {
  const own = (b) => {
    if (b.lines.length < 2) return null;
    const ps = [];
    for (let k = 1; k < b.lines.length; k++) ps.push(b.lines[k].base - b.lines[k - 1].base);
    const r = median(ps) / b.size;
    return r > 0 ? r : null;
  };
  const bySize = new Map();
  const all = [];
  for (const b of layout.blocks) {
    const r = own(b);
    if (r === null) continue;
    all.push(r);
    const k = sizeKey(b.size);
    if (!bySize.has(k)) bySize.set(k, []);
    bySize.get(k).push(r);
  }
  return (b) => {
    const k = sizeKey(b.size);
    const r = own(b) || (bySize.has(k) ? median(bySize.get(k)) : all.length ? median(all) : 1.2);
    return Math.max(1.1, Math.min(1.6, r));
  };
}

/** The box each table cell may use: its column up to the next column (the last one: a quarter of the table's width
 * more, never past the page's text edge), its row down to the next row. */
function cellBoxes(layout, rightEdge) {
  const out = new Map();
  for (const t of layout.tables) {
    const width = t.colBox[t.colBox.length - 1].x1 - t.colBox[0].x0;
    const edge = rightEdge(t.page);
    const cells = t.cells.map((id) => layout.blocks[id]);
    const rowTop = [];
    const rowBottom = [];
    for (const c of cells) {
      const r = c.table.row;
      rowTop[r] = Math.min(rowTop[r] === undefined ? Infinity : rowTop[r], c.box.top);
      rowBottom[r] = Math.max(rowBottom[r] === undefined ? -Infinity : rowBottom[r], c.box.bottom);
    }
    for (const c of cells) {
      const { row, col } = c.table;
      const next = t.colBox[col + 1];
      const nextTop = rowTop.slice(row + 1).find((v) => v !== undefined);
      const last = Math.max(t.colBox[col].x1 + c.size, Math.min(edge, t.colBox[col].x1 + 0.25 * width));
      out.set(c.id, { x0: t.colBox[col].x0, x1: next ? next.x0 - 0.4 * c.size : last,
        top: c.box.top, bottom: nextTop !== undefined ? nextTop - 0.1 * c.size : rowBottom[row] + 0.3 * c.size });
    }
  }
  return out;
}

/**
 * Read and translate a PDF; see the file comment.
 */
export async function translatePdf(bytes, name, o) {
  const libs = o.libs;
  const signal = o.signal || null;
  const progress = o.onProgress || (() => {});
  const yieldFn = o.yieldFn || yieldDefault;
  const now = o.now || (() => Date.now());
  const started = now();
  progress({ stage: "extract" });
  const original = new Uint8Array(bytes);
  const pdf = await openPdfjs(libs.pdfjs, original.slice(), { wasmUrl: libs.wasmUrl });
  try {
    const pages = await readPages(pdf, { signal, yieldFn });
    // pdf-lib: the content streams (styles, what can be taken out); an encrypted or unreadable file gives a DOCX only
    let doc = null;
    let pdfError = null;
    try { doc = await openPdfLib(libs.PL, original); } catch (e) { pdfError = e.code || "unsupported_pdf"; }
    const caches = { fonts: new Map(), forms: new Map() };
    const analyses = pages.map((p) => {
      if (!doc) return null;
      try { return analyzePage(libs.PL, doc, doc.getPages()[p.index], p.index, caches); } catch (e) { return null; }
    });
    for (const p of pages) {
      const a = analyses[p.index];
      if (a) attachStyles(p.items, a.shows, p.transform);
      p.images = a ? a.images.map((b) => toViewport(p.transform, b)) : [];
    }
    // pages without a usable text layer: OCR on the device
    const canvases = new Map();
    let recognizer = null;
    const scanPages = pages.filter((p) => !p.stats.usable && (!analyses[p.index] || p.images.length > 0));
    const noOcr = [];
    for (const [k, p] of scanPages.entries()) {
      check(signal);
      if (!o.ocr || !o.render) { noOcr.push(p.index); continue; }
      progress({ stage: "ocr", page: k + 1, pages: scanPages.length });
      const scale = Math.max(1, Math.min(3, OCR_LONG_SIDE / Math.max(p.width, p.height)));
      const canvas = await o.render(pdf, p.index, scale);
      if (!recognizer) recognizer = await o.ocr.load();
      const res = await recognizer.recognize(canvas);
      p.items = ocrItems(res, scale);
      p.ocr = true;
      canvases.set(p.index, { canvas, scale });
      await yieldFn();
    }
    check(signal);
    const layout = layoutDocument(pages);
    const segments = segmentsOf(layout);
    const translated = new Set(segments.flatMap((s) => s.blocks));
    const geom = pages.map((p) => ({ index: p.index, width: p.width, height: p.height, transform: p.transform,
      ocr: !!p.ocr }));
    const plan = doc ? planRemoval(geom, analyses.map((a) => a || { shows: [], images: [] }), layout.blocks, translated)
      : { edits: new Map(), cover: new Set(), removed: 0, invisible: 0 };
    // background colours around the covered blocks (a rendered page; white without a renderer)
    const covers = new Map();
    const coverPages = [...new Set([...plan.cover].map((id) => layout.blocks[id].page))];
    for (const pi of coverPages) {
      check(signal);
      let entry = canvases.get(pi);
      if (!entry && o.render) {
        try { entry = { canvas: await o.render(pdf, pi, SAMPLE_SCALE), scale: SAMPLE_SCALE }; } catch (e) { entry = null; }
      }
      let img = null;
      if (entry) {
        try { img = entry.canvas.getContext("2d").getImageData(0, 0, entry.canvas.width, entry.canvas.height); } catch (e) { img = null; }
      }
      for (const id of plan.cover) {
        const b = layout.blocks[id];
        if (b.page === pi) covers.set(id, img ? sampleRing(img, b.box, entry.scale) : [1, 1, 1]);
      }
    }
    canvases.clear();
    const skipped = layout.blocks.filter((b) => b.skip).map((b) => ({ where: "Trang " + (b.page + 1), reason: b.skip,
      text: head(b.text, 200) }));
    for (const pi of noOcr) skipped.push({ where: "Trang " + (pi + 1), reason: "scan_no_ocr", text: "" });
    const words = segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
    progress({ stage: "extract", segments: segments.length, words,
      skipped: skipped.filter((s) => !STOP.includes(s.reason) && s.reason !== "no_text").length });

    const fullText = segments.map((s) => s.text).join("\n");
    // nothing to translate (a scan without OCR, numbers only): no request at all
    const setup = segments.length ? await o.prepare(fullText, { domain: o.domain || "", signal }) : EMPTY_SETUP;
    check(signal);
    progress(setup.classify);
    const device = o.device || { kind: "cloud", name: "" };
    progress({ stage: "device", device: device.kind, device_name: device.name, model: o.modelId, polish: false });
    const tTranslate = now();
    const wire = segments.map((s, n) => ({ id: n, tagged: s.tagged, essential: [], prev: n > 0 ? segments[n - 1].text : "",
      nxt: n + 1 < segments.length ? segments[n + 1].text : "", where: s.where }));
    const results = [];
    const size = Math.max(1, Math.floor(o.batchSize || 1));
    for (let start = 0; start < wire.length; start += size) {
      check(signal);
      const batch = wire.slice(start, start + size);
      const res = await o.translateSegments(batch, { setup, tm: o.tm || null, signal });
      if (!Array.isArray(res) || res.length !== batch.length) {
        throw new Error("translateSegments returned " + (Array.isArray(res) ? res.length : typeof res) + " results for "
          + batch.length + " segments");
      }
      res.forEach((r, k) => {
        if (r.id !== batch[k].id) throw new Error("translateSegments answered segment " + r.id + " for " + batch[k].id);
        results.push(r);
        progress({ stage: "translate", done: start + k + 1, total: wire.length, where: batch[k].where });
      });
      await yieldFn();
    }
    check(signal);
    const tWrite = now();
    progress({ stage: "write" });
    const names = outputNames(name);
    const state = { bytes: original, name, names, layout, segments, wire, plan, geom, covers, pdfError, libs,
      images: pages.map((p) => p.images), yieldFn };
    const out = await writeOutputs(state, results);
    const rows = segments.map((s, n) => {
      const r = results[n];
      const flags = [...(r.flags || [])];
      if (out.overflow.has(n)) flags.push("pdf_overflow");
      return { where: s.where, src: head(s.text, 300), out: head(plainOut(r.text), 300), level: r.level || 0, flags,
        cached: !!r.cached };
    });
    const seconds = (a, b) => Math.round((b - a) / 100) / 10;
    const meta = { file: String(name).split(/[\\/]/).pop(), output: out.pdf ? names.pdf : names.docx,
      outputs: [out.pdf ? names.pdf : null, names.docx].filter(Boolean), kind: "pdf", domain: setup.pack.id,
      domain_name: setup.pack.name, pack: setup.pack.key, packs: setup.packRows, packs_unavailable: setup.unavailable,
      packs_unavailable_names: setup.unavailableNames, registry_offline: setup.offline, device: device.kind,
      device_name: device.name, model: o.modelId, fast: false, polish: { enabled: false },
      seconds: { prepare: seconds(started, tTranslate), translate: seconds(tTranslate, tWrite), polish: 0,
        write: seconds(tWrite, now()) },
      pdf: { pages: pages.length, ocr_pages: pages.filter((p) => p.ocr).length, scan_pages_without_ocr: noOcr.length,
        removed_strings: plan.removed, invisible_strings: plan.invisible, covered_blocks: plan.cover.size,
        overflow_blocks: out.overflowBlocks, rotated_chars: pages.reduce((n, p) => n + p.rotated, 0),
        error: out.pdfError || null } };
    const report = buildReport(meta, rows, skipped, [], []);
    progress({ stage: "done", flagged: report.counts.flagged });
    state.results = results;
    return { pdf: out.pdf, docx: out.docx, report, state };
  } finally {
    try { await pdf.loadingTask.destroy(); } catch (e) { /* already gone */ }
  }
}

/** The Vietnamese of each translated block as styled runs {text, style {bold, italic} | null} (the inline tags of
 * the answer; text outside them in the style of the segment's first block): a segment over several blocks is split
 * in proportion to the English. -> Map(block id -> {text, runs, seg}). */
function blockTexts(state, results) {
  const map = new Map();
  state.segments.forEach((s, n) => {
    const r = results[n];
    const first = state.layout.blocks[s.blocks[0]];
    const runs = runsOfTagged(r ? r.text : "", s.spans, first.style);
    const parts = splitRuns(runs, s.blocks.map((id) => Array.from(state.layout.blocks[id].text).length));
    s.blocks.forEach((id, k) => {
      const p = parts[k] || [];
      map.set(id, { text: runsText(p), runs: p, seg: n });
    });
  });
  return map;
}

/** Runs of a block in its known styles -> {text, bold, italic} for the DOCX (null: the paragraph style decides). */
const docxRuns = (runs) => runs.map((r) => ({ text: r.text, bold: r.style ? !!r.style.bold : null,
  italic: r.style ? !!r.style.italic : null }));

function docxModel(state, results) {
  const { layout, segments, geom } = state;
  const segOfHead = new Map(segments.map((s, n) => [s.blocks[0], n]));
  const inSeg = new Set(segments.flatMap((s) => s.blocks.slice(1)));
  const landscape = geom.length && geom[0].width > geom[0].height;
  const items = [];
  const tables = new Map();
  let lastPage = null;
  // a translated block: the whole segment's Vietnamese with its inline spans; one left in English: its own runs
  const runsOf = (b) => {
    if (!segOfHead.has(b.id)) return (b.runs || [{ text: b.text, style: b.style }]).map((r) => ({ text: r.text, style: r.style || b.style }));
    const n = segOfHead.get(b.id);
    return runsOfTagged(results[n].text, segments[n].spans, b.style);
  };
  const textOf = (b) => {
    const runs = runsOf(b);
    return { text: runsText(runs), runs: docxRuns(runs) };
  };
  const styled = layout.blocks.filter((b) => b.style);
  const serifShare = styled.length ? styled.filter((b) => b.style.serif).length / styled.length : 0;
  for (const b of layout.blocks) {
    if (STOP.includes(b.skip) || inSeg.has(b.id)) continue;
    if (landscape && lastPage !== null && b.page !== lastPage) items.push({ kind: "pagebreak" });
    lastPage = b.page;
    if (b.kind === "cell") {
      const t = layout.tables[b.table.id];
      let entry = tables.get(t.id);
      if (!entry) {
        entry = { kind: "table", rows: Array.from({ length: t.rows }, () => Array(t.cols).fill(null)) };
        tables.set(t.id, entry);
        items.push(entry);
      }
      entry.rows[b.table.row][b.table.col] = textOf(b);
      continue;
    }
    items.push({ kind: b.kind, level: b.level, align: b.align, ...textOf(b) });
  }
  // the body text's leading (its size's median) for the DOCX line spacing
  return { pageSize: geom.length ? { w: geom[0].width, h: geom[0].height } : null, serif: serifShare > 0.5, items,
    leading: layout.bodySize ? leadingOf(layout)({ lines: [], size: layout.bodySize }) : null };
}

/** The outputs from the kept results: {pdf: {bytes, name} | null, docx: {bytes, name}, overflow: Set(segment index),
 * overflowBlocks, pdfError}. */
export async function writeOutputs(state, results) {
  const docx = { bytes: buildDocx(docxModel(state, results)), name: state.names.docx };
  const overflow = new Set();
  if (state.pdfError) return { pdf: null, docx, overflow, overflowBlocks: 0, pdfError: state.pdfError };
  const { PL, fontkit, loadFont } = state.libs;
  let pdfBytes = null;
  let overflowBlocks = 0;
  let pdfError = null;
  try {
    const doc = await openPdfLib(PL, state.bytes);
    doc.registerFontkit(fontkit);
    const pages = doc.getPages();
    const caches = { fonts: new Map(), forms: new Map() };
    const analyses = state.geom.map((g) => {
      try { return analyzePage(PL, doc, pages[g.index], g.index, caches); } catch (e) { return null; }
    });
    applyEdits(PL, doc, analyses, state.plan.edits);
    const texts = blockTexts(state, results);
    const styled = state.layout.blocks.filter((b) => b.style);
    const docSerif = styled.length > 0 && styled.filter((b) => b.style.serif).length > 0.5 * styled.length;
    // each run in the block's family, bold / italic as the run (the block's own style where the run has none)
    const faceRuns = (b, runs) => runs.map((r) => ({ text: r.text, face: faceOf(r.style
      ? { serif: b.style ? b.style.serif : docSerif, bold: r.style.bold, italic: r.style.italic } : b.style, docSerif) }));
    const faces = new Set();
    for (const [id, t] of texts) for (const r of faceRuns(state.layout.blocks[id], t.runs)) faces.add(r.face);
    const fonts = new FontSet(PL, doc, loadFont);
    await fonts.prepare([...faces].sort());
    const leading = leadingOf(state.layout);
    const cells = cellBoxes(state.layout, (pi) => Math.max(...state.layout.blocks.filter((b) => b.page === pi)
      .map((b) => b.box.x1)));
    for (const g of state.geom) {
      const mine = state.layout.blocks.filter((b) => b.page === g.index);
      const todo = mine.filter((b) => texts.has(b.id));
      if (!todo.length) continue;
      const page = pages[g.index];
      const Vi = invert(g.transform);
      const deg = Math.round(Math.atan2(Vi[1], Vi[0]) * 180 / Math.PI / 90) * 90;
      const right = Math.max(...mine.map((b) => b.box.x1));
      const bottom = Math.max(...mine.map((b) => b.box.bottom), 0.95 * g.height);
      const margin = { x0: Math.min(...mine.map((b) => b.box.x0)), x1: right, top: 0, bottom };
      const imgs = (state.images[g.index] || []).map((b) => ({ x0: b[0], top: b[1], x1: b[2], bottom: b[3] }));
      // covers first, then the text (a cover never hides a neighbour's Vietnamese)
      for (const b of todo) {
        if (!state.plan.cover.has(b.id)) continue;
        const pad = (g.ocr ? 0.35 : 0.15) * b.size;  // OCR boxes sit tight on the ink
        const ub = toViewport(Vi, [b.box.x0 - pad, b.box.top - pad, b.box.x1 + pad, b.box.bottom + pad]);
        drawCover(PL, page, ub, state.covers.get(b.id) || [1, 1, 1]);
      }
      // 1. the size each block needs (its own box at a little smaller type, else its room, down to the floor);
      // 2. blocks that shared a size on the page take one: the smallest need of them (fit.js sharedSizes);
      // 3. each is drawn at that size in its own box, its room, or the free space down to the next obstacle;
      //    what fits none of them is drawn anyway and marked in the report
      const plans = [];
      for (const b of todo) {
        const { runs, seg } = texts.get(b.id);
        if (!runs.length) continue;
        const obstacles = mine.filter((x) => x.id !== b.id).map((x) => x.box).concat(imgs);
        const shape = { box: b.box, lines: b.lines, size: b.size, kind: b.kind, cellBox: cells.get(b.id), align: b.align };
        const pg = { width: g.width, height: g.height, margin };
        // headings: a group of their own, and smaller on one line (down to MIN_SHARE) before a big second line
        const heading = b.kind === "heading";
        const o = { size: b.size, lineRatio: leading(b), measure: (t, s, f) => fonts.measure(t, s, f),
          oneLine: b.lines.length === 1 && (b.kind === "cell" || heading), floor: heading ? MIN_SHARE : FLOOR_SHARE };
        const text = faceRuns(b, runs);
        const grow = roomFor(shape, obstacles, pg);
        plans.push({ b, seg, text, o, boxes: [b.box, grow, roomFor(shape, obstacles, pg, { deep: true })],
          key: (heading ? "h" : "") + sizeKey(b.size), need: sizeNeeded(text, b.box, grow, o) });
      }
      const shared = sharedSizes(plans.map((p) => ({ key: p.key, size: p.b.size, need: p.need, floor: p.o.floor })));
      for (const { b, seg, text, o, boxes, key } of plans) {
        const fit = placeAt(text, boxes, shared.get(key), o);
        const room = fit.room;
        if (fit.overflow) { overflow.add(seg); overflowBlocks += 1; }
        const bg = state.covers.get(b.id);
        let color = b.style && !b.style.invisible ? b.style.color : null;
        if (!color) color = bg && luminance(bg) < 0.45 ? [1, 1, 1] : [0, 0, 0];
        fit.runs.forEach((line, k) => {
          const widths = line.map((r) => fonts.measure(r.text, fit.size, r.face));
          const w = widths.reduce((a, v) => a + v, 0);
          let x = room.x0;
          if (b.align === "center") x = Math.min(Math.max(room.x0, (b.box.x0 + b.box.x1) / 2 - w / 2), Math.max(room.x0, room.x1 - w));
          else if (b.align === "right") x = Math.max(room.x0, b.box.x1 - w);
          const y = room.top + 0.78 * fit.size + k * fit.pitch;
          line.forEach((r, j) => {
            const [ux, uy] = applyPoint(Vi, x, y);
            drawLine(PL, page, fonts, { text: r.text, x: ux, y: uy, size: fit.size, face: r.face, color, rotate: deg });
            x += widths[j];
          });
        });
      }
      if (state.yieldFn) await state.yieldFn();
    }
    pdfBytes = await doc.save();
  } catch (e) {
    pdfError = (e && e.code) || "write_failed";
    pdfBytes = null;
    state.pdfErrorDetail = String((e && e.stack) || e).slice(0, 600);
  }
  return { pdf: pdfBytes ? { bytes: pdfBytes, name: state.names.pdf } : null, docx, overflow, overflowBlocks, pdfError };
}
