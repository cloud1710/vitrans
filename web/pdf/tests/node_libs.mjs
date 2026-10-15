// The vendored PDF libraries loaded in Node for the tests (the page loads the same files: web/pdf/libs.js):
// pdf-lib 1.17.1 (ES module), fontkit 1.1.1 (UMD: Node reads it as CommonJS), pdf.js 6.3.289 legacy build with its
// worker module, and the fonts from web/pdf/fonts/. Test infrastructure only.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

export const PDF_DIR = fileURLToPath(new URL("..", import.meta.url));
const vendor = (p) => pathToFileURL(join(PDF_DIR, "vendor", p)).href;

let cached = null;
export async function nodeLibs() {
  if (cached) return cached;
  const PL = await import(vendor("pdf-lib-1.17.1/pdf-lib.esm.min.js"));
  const fk = await import(vendor("fontkit-1.1.1/fontkit.umd.min.js"));
  const fontkit = fk.default || globalThis.fontkit;
  const pdfjs = await import(vendor("pdfjs-6.3.289/pdf.min.js"));
  pdfjs.GlobalWorkerOptions.workerSrc = vendor("pdfjs-6.3.289/pdf.worker.min.js");
  cached = { PL, fontkit, pdfjs, wasmUrl: vendor("pdfjs-6.3.289/wasm/"),
    loadFont: async (face) => new Uint8Array(readFileSync(join(PDF_DIR, "fonts", face + ".ttf"))) };
  return cached;
}

/** Text items of every page as pdf.js sees them: [[{str, transform, width}]]. */
export async function pdfjsText(bytes) {
  const { pdfjs } = await nodeLibs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWasm: false, verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.filter((it) => it.str).map((it) => ({ str: it.str, transform: it.transform, width: it.width })));
  }
  await doc.loadingTask.destroy();
  return out;
}
