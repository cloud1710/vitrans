// Reading a PDF in the page with pdf.js 6.3.289 (vendored, Apache-2.0; spec Amendment H): the text items of every
// page in viewport space for layout.js, whether a page has a usable text layer, a page rendered to a canvas (OCR of
// scanned pages through web/ocr/ocr.js, and the background colour sampled around a block that is covered).
// pdf.js runs with useWasm: false (its JBIG2 / OpenJPEG decoders fall back to their JavaScript builds, imported from
// the same origin), so the page's CSP needs no 'wasm-unsafe-eval'; its worker is a module worker from this origin.
import { multiply } from "./content.js";

export class ReadError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ReadError";
    this.code = code;
  }
}

/** pdf.js's document. ReadError "password" (a user password is needed) / "unsupported_file". */
export async function openPdfjs(pdfjs, bytes, opts = {}) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useWasm: false, wasmUrl: opts.wasmUrl,
    isEvalSupported: false, verbosity: 0, stopAtErrors: false, disableAutoFetch: true });
  try {
    return await task.promise;
  } catch (e) {
    const name = (e && e.name) || "";
    if (name === "PasswordException") throw new ReadError("the PDF needs a password", "password");
    throw new ReadError("pdf.js could not read the file (" + (name || String(e)).slice(0, 120) + ")", "unsupported_file");
  }
}

const JUNK = /[-�\u0000-\u0008\u000b\u000c\u000e-\u001f]/u;

/** {chars (non-space characters), junk (private use, controls, U+FFFD), usable}: a page whose text is mostly junk
 * (fonts without a usable Unicode map) has no text layer worth translating. */
export function textStats(items) {
  let chars = 0;
  let junk = 0;
  for (const it of items) {
    for (const ch of it.str || "") {
      if (/\s/u.test(ch)) continue;
      chars += 1;
      if (JUNK.test(ch)) junk += 1;
    }
  }
  return { chars, junk, usable: chars > 0 && junk <= 0.3 * chars };
}

/** pdf.js getTextContent() -> {items (horizontal, left to right in the viewport), rotated (characters of the other
 * items, left untranslated)}. V: the page's viewport transform at scale 1. */
export function itemsFromText(tc, V) {
  const items = [];
  let rotated = 0;
  for (const it of tc.items || []) {
    if (typeof it.str !== "string" || !it.str.trim()) continue;
    const t = multiply(it.transform, V);
    const size = Math.hypot(t[2], t[3]);
    if (it.dir === "ttb" || !(t[0] > 0) || Math.abs(t[1]) > 0.05 * t[0] || !(size > 0)) {
      rotated += Array.from(it.str).length;
      continue;
    }
    const base = t[5];
    items.push({ str: it.str, x0: t[4], x1: t[4] + Math.max(0, it.width || 0), base, size, top: base - 0.75 * size,
      bottom: base + 0.25 * size });
  }
  return { items, rotated };
}

/** A box [x0, y0, x1, y1] from the shapes an OCR engine may give: [x0, y0, x1, y1], four points, {x, y, w|width,
 * h|height}, {x0, y0, x1, y1}, {left, top, right, bottom}. */
export function boxOfOcr(b) {
  if (Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === "number")) return b.slice();
  if (Array.isArray(b) && b.length && Array.isArray(b[0])) {
    const xs = b.map((p) => p[0]);
    const ys = b.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  if (b && typeof b === "object") {
    if ("x0" in b) return [b.x0, b.y0, b.x1, b.y1];
    if ("left" in b) return [b.left, b.top, b.right, b.bottom];
    if ("x" in b) return [b.x, b.y, b.x + (b.w !== undefined ? b.w : b.width), b.y + (b.h !== undefined ? b.h : b.height)];
  }
  return null;
}

/** OCR result {lines: [{text, box}]} of a page rendered at `scale` -> items at scale 1 (one per line). */
export function ocrItems(result, scale) {
  const out = [];
  for (const l of (result && result.lines) || []) {
    const text = String(l.text || "").replace(/\s+/g, " ").trim();
    const b = boxOfOcr(l.box);
    if (!text || !b) continue;
    const [x0, y0, x1, y1] = b.map((v) => v / scale);
    const h = y1 - y0;
    if (!(h > 0) || !(x1 > x0)) continue;
    const size = h * 0.82;
    const base = y1 - 0.2 * size;
    out.push({ str: text, x0, x1, base, size, top: base - 0.75 * size, bottom: base + 0.25 * size,
      style: { bold: false, italic: false, serif: false, color: [0, 0, 0], invisible: false } });
  }
  // a line box is taller with ascenders / descenders than without: sizes within -25 % .. +30 % of the page's
  // typical line are one size (layout.js would otherwise cut paragraphs at every such line)
  const sizes = out.map((it) => it.size).sort((a, b) => a - b);
  const typical = sizes.length ? sizes[sizes.length >> 1] : 0;
  for (const it of out) {
    if (it.size >= 0.75 * typical && it.size <= 1.3 * typical) {
      it.size = typical;
      it.top = it.base - 0.75 * typical;
      it.bottom = it.base + 0.25 * typical;
    }
  }
  return out;
}

/** The median colour ([r, g, b] in 0..1) of a ring of pixels 1-4 px outside a block's box (viewport points at scale
 * 1) on an image rendered at `scale` ({width, height, data} RGBA). White when the ring is empty. */
export function sampleRing(img, box, scale) {
  const x0 = Math.floor(box.x0 * scale);
  const x1 = Math.ceil(box.x1 * scale);
  const y0 = Math.floor(box.top * scale);
  const y1 = Math.ceil(box.bottom * scale);
  const rs = [];
  const gs = [];
  const bs = [];
  for (let y = Math.max(0, y0 - 4); y < Math.min(img.height, y1 + 4); y++) {
    for (let x = Math.max(0, x0 - 4); x < Math.min(img.width, x1 + 4); x++) {
      if (x >= x0 - 1 && x < x1 + 1 && y >= y0 - 1 && y < y1 + 1) continue;
      const k = (y * img.width + x) * 4;
      rs.push(img.data[k]);
      gs.push(img.data[k + 1]);
      bs.push(img.data[k + 2]);
    }
  }
  if (!rs.length) return [1, 1, 1];
  const med = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1] / 255;
  return [med(rs), med(gs), med(bs)];
}

/** Every page: {index, width, height, transform, rotation, items, rotated, stats}; the pdf.js page objects stay in
 * pdfPages for rendering. yieldFn between pages (the page stays responsive). */
export async function readPages(pdf, opts = {}) {
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    if (opts.signal && opts.signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const { items, rotated } = itemsFromText(tc, vp.transform);
    pages.push({ index: i - 1, width: vp.width, height: vp.height, transform: vp.transform, rotation: vp.rotation,
      items, rotated, stats: textStats(items) });
    if (opts.onPage) opts.onPage(i, pdf.numPages);
    if (opts.yieldFn) await opts.yieldFn();
  }
  return pages;
}

/** A page rendered to a canvas at `scale` (browser: OffscreenCanvas when there is one, else a canvas element). */
export async function renderPage(pdf, index, scale) {
  const page = await pdf.getPage(index + 1);
  const vp = page.getViewport({ scale });
  const w = Math.max(1, Math.ceil(vp.width));
  const h = Math.max(1, Math.ceil(vp.height));
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  await page.render({ canvasContext: ctx, viewport: vp, background: "#ffffff" }).promise;
  page.cleanup();
  return canvas;
}
