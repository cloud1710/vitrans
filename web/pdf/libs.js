// The PDF path's libraries in the page, loaded on demand from this origin (no CDN: the page's CSP stays
// default-src 'self'): pdf.js 6.3.289 (legacy build, module worker), pdf-lib 1.17.1 (ES module), fontkit 1.1.1 (UMD,
// loaded as a classic script: it defines self.fontkit) and the Noto fonts (fetched when a face is first needed).
// Also the two browser-only pieces of a job: a page rendered to a canvas, and the shared OCR engine (web/ocr/ocr.js).
import { renderPage } from "./read.js";

const here = (p) => new URL(p, import.meta.url).href;
const PDFJS = "vendor/pdfjs-6.3.289/";

function classicScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(Object.assign(new Error("script not loaded: " + src), { code: "engine_missing" })));
    document.head.appendChild(s);
  });
}

let libs = null;

/** {pdfjs, PL, fontkit, wasmUrl, loadFont(face) -> Uint8Array}, loaded once per page. */
export function loadPdfLibs() {
  if (!libs) {
    libs = (async () => {
      const pdfjs = await import(here(PDFJS + "pdf.min.js"));
      pdfjs.GlobalWorkerOptions.workerSrc = here(PDFJS + "pdf.worker.min.js");
      const PL = await import(here("vendor/pdf-lib-1.17.1/pdf-lib.esm.min.js"));
      if (!globalThis.fontkit) await classicScript(here("vendor/fontkit-1.1.1/fontkit.umd.min.js"));
      const fonts = new Map();
      const loadFont = (face) => {
        if (!fonts.has(face)) {
          fonts.set(face, fetch(here("fonts/" + face + ".ttf")).then((r) => {
            if (!r.ok) throw Object.assign(new Error("font " + face + ": HTTP " + r.status), { code: "network" });
            return r.arrayBuffer();
          }).then((b) => new Uint8Array(b)));
          fonts.get(face).catch(() => fonts.delete(face));
        }
        return fonts.get(face);
      };
      return { pdfjs, PL, fontkit: globalThis.fontkit, wasmUrl: here(PDFJS + "wasm/"), loadFont };
    })();
    libs.catch(() => { libs = null; });
  }
  return libs;
}

/** render(pdf, pageIndex, scale) -> canvas, for translatePdf. */
export const render = renderPage;

/** The OCR engine for translatePdf: {load() -> {recognize(canvas)}}; onProgress sees the one-time model download. */
export function ocrEngine(o = {}) {
  return {
    async load() {
      const m = await import(here("../ocr/ocr.js"));
      const eng = await m.loadOcr({ onProgress: o.onProgress, signal: o.signal });
      return { recognize: (canvas) => eng.recognize(canvas, { signal: o.signal }) };
    },
  };
}
