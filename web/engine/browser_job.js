// Glue between the page (app.js) and the page pipeline (pipeline.js, loaded on demand): one document job in the
// browser through
//   translateFile(bytes, name, { ...engine, domain, notes, onProgress, signal }) -> { bytes, name, report }
// where `engine` holds what the engine injects (the cloud engine: classify, translateSegments, modelId, device; see
// web/cloud.js), and its result as a Blob for the download link. The document is read and written in the page; only
// what the engine's functions send leaves it. No DOM here.

export const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** The helper's output name: <stem>_vi.<ext> of the uploaded file name. */
export function outputName(name) {
  const base = String(name || "input");
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) + "_vi" + base.slice(dot) : base + "_vi";
}

const extOf = (name) => (/\.([^.]+)$/.exec(String(name || "")) || [])[1] || "";

/** The code the page shows for a failed job: the engine's own code, "aborted" for a cancel, else "internal". */
export function errorCode(err) {
  if (err && err.name === "AbortError") return "aborted";
  return (err && typeof err.code === "string" && err.code) || "internal";
}

/**
 * One document job in the page. opts: { pipeline ({translateFile}), file (Blob / File), name, engine (options the
 * engine injects), domain, notes, onProgress, signal } -> { blob, name, report, bytes }. Errors are thrown as they
 * come (errorCode() names them).
 */
export async function runBrowserJob(opts) {
  const o = opts || {};
  const bytes = new Uint8Array(await o.file.arrayBuffer());
  const res = await o.pipeline.translateFile(bytes, o.name, Object.assign({}, o.engine, { domain: o.domain || "",
    notes: o.notes !== false, onProgress: o.onProgress || (() => {}), signal: o.signal }));
  const name = outputName(o.name);
  const type = MIME[extOf(name).toLowerCase()] || "application/octet-stream";
  return { blob: new Blob([res.bytes], { type }), name, report: res.report, bytes: res.bytes };
}

/** The page pipeline, or null when this page has none (an older deploy): { translateFile, openTm() }.
 * openTm() opens the translation memory once per page: IndexedDB (tm.js IndexedDbTM), an in-memory one when
 * IndexedDB is blocked (private mode), null without tm.js. */
export async function loadEngine(importer) {
  const load = importer || ((p) => import(p));
  let mod;
  try {
    mod = await load("./pipeline.js");
  } catch (e) {
    return null;
  }
  if (!mod || typeof mod.translateFile !== "function") return null;
  let tmMod = null;
  try { tmMod = await load("./tm.js"); } catch (e) { tmMod = null; }
  let tm;
  const openTm = async () => {
    if (tm !== undefined) return tm;
    if (!tmMod || !tmMod.IndexedDbTM) { tm = null; return tm; }
    try {
      tm = await tmMod.IndexedDbTM.open();
    } catch (e) {
      tm = tmMod.MemoryTM ? new tmMod.MemoryTM() : null;
    }
    return tm;
  };
  return { translateFile: mod.translateFile, openTm };
}
