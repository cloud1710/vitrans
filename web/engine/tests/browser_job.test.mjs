// Glue between the page and the page pipeline (web/engine/browser_job.js): one job through translateFile with the
// cloud engine's injected functions (classify, translateSegments), the result as a Blob named <stem>_vi.<ext>, error
// codes and the pipeline module loaded on demand. Fakes only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runBrowserJob, outputName, MIME, errorCode, loadEngine } from "../browser_job.js";

const enc = (s) => new TextEncoder().encode(s);

function fakePipeline(result, fail) {
  const calls = [];
  return {
    calls,
    async translateFile(bytes, name, opts) {
      calls.push({ bytes, name, opts });
      opts.onProgress({ stage: "extract" });
      opts.onProgress({ stage: "translate", done: 1, total: 1 });
      if (fail) throw fail;
      return result || { bytes: enc("PK translated"), name: name.replace(/(\.[^.]+)$/, "_vi$1"), report: { counts: {} } };
    },
  };
}

test("output names follow the helper: <stem>_vi.<ext>", () => {
  assert.equal(outputName("Bao cao.docx"), "Bao cao_vi.docx");
  assert.equal(outputName("deck.v2.pptx"), "deck.v2_vi.pptx");
  assert.equal(outputName("noext"), "noext_vi");
  assert.equal(MIME.docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(MIME.pptx, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
});

test("a job hands the file's bytes and the engine's functions to translateFile and returns a typed Blob", async () => {
  const p = fakePipeline();
  const events = [];
  const classify = async () => ({ offline: false, unavailable: [], packs: [], candidates: [] });
  const translateSegments = async (segs) => segs.map((s) => ({ id: s.id, text: s.tagged, level: 0, flags: [] }));
  const ctrl = new AbortController();
  const file = new Blob([enc("PK source")]);
  const res = await runBrowserJob({ pipeline: p, file, name: "report.docx", onProgress: (ev) => events.push(ev),
    signal: ctrl.signal, notes: true, engine: { classify, translateSegments, modelId: "@cf/google/gemma-4-26b-a4b-it",
      device: { kind: "cloud", name: "Cloudflare Workers AI" } } });
  const call = p.calls[0];
  assert.deepEqual(Array.from(call.bytes), Array.from(enc("PK source")));
  assert.ok(call.bytes instanceof Uint8Array);
  assert.equal(call.name, "report.docx");
  assert.equal(call.opts.classify, classify);
  assert.equal(call.opts.translateSegments, translateSegments);
  assert.equal(call.opts.modelId, "@cf/google/gemma-4-26b-a4b-it");
  assert.deepEqual(call.opts.device, { kind: "cloud", name: "Cloudflare Workers AI" });
  assert.equal(call.opts.signal, ctrl.signal);
  assert.equal(call.opts.notes, true);
  assert.equal(call.opts.domain, "");
  assert.deepEqual(events.map((e) => e.stage), ["extract", "translate"]);
  assert.equal(res.name, "report_vi.docx");
  assert.equal(res.blob.type, MIME.docx);
  assert.equal(new TextDecoder().decode(new Uint8Array(await res.blob.arrayBuffer())), "PK translated");
  assert.deepEqual(res.report, { counts: {} });
});

test("the download name is <stem>_vi.<ext> of the uploaded name whatever the pipeline calls it", async () => {
  const p = fakePipeline({ bytes: enc("x"), name: "input_vi.pptx", report: {} });
  const res = await runBrowserJob({ pipeline: p, file: new Blob([enc("y")]), name: "Slides 1.pptx", engine: {} });
  assert.equal(res.name, "Slides 1_vi.pptx");
  assert.equal(res.blob.type, MIME.pptx);
});

test("errors keep the engine's code; an abort is 'aborted'; anything else is 'internal'", async () => {
  const coded = Object.assign(new Error("bad zip"), { code: "unsupported_file" });
  await assert.rejects(runBrowserJob({ pipeline: fakePipeline(null, coded), file: new Blob([]), name: "a.docx",
    engine: {} }), (e) => e === coded);
  assert.equal(errorCode(coded), "unsupported_file");
  assert.equal(errorCode(new DOMException("x", "AbortError")), "aborted");
  assert.equal(errorCode(new TypeError("boom")), "internal");
  assert.equal(errorCode(Object.assign(new Error("x"), { code: "quota_exceeded" })), "quota_exceeded");
});

test("the pipeline module is loaded on demand; a page without it has no page pipeline", async () => {
  const seen = [];
  const ok = await loadEngine(async (p) => { seen.push(p); return p === "./pipeline.js" ? { translateFile: async () => ({}) } : {}; });
  assert.equal(typeof ok.translateFile, "function");
  assert.deepEqual(seen, ["./pipeline.js", "./tm.js"]);
  assert.equal(await loadEngine(async () => { throw new TypeError("Failed to fetch dynamically imported module"); }), null);
  assert.equal(await loadEngine(async () => ({ other: 1 })), null);
});

test("the translation memory is the IndexedDB one, opened once per page; in-memory when IndexedDB is blocked", async () => {
  const pipeline = { translateFile: async () => ({}) };
  class MemoryTM { constructor() { this.kind = "memory"; } }
  let opened = 0;
  const idb = { kind: "indexeddb" };
  const eng = await loadEngine(async (p) => (p === "./pipeline.js" ? pipeline
    : { IndexedDbTM: { open: async () => { opened += 1; return idb; } }, MemoryTM }));
  assert.equal(await eng.openTm(), idb);
  assert.equal(await eng.openTm(), idb);
  assert.equal(opened, 1);
  const blocked = await loadEngine(async (p) => (p === "./pipeline.js" ? pipeline
    : { IndexedDbTM: { open: async () => { throw new Error("IndexedDB is not available"); } }, MemoryTM }));
  assert.equal((await blocked.openTm()).kind, "memory");
  // a page without tm.js translates without a memory
  const none = await loadEngine(async (p) => { if (p === "./tm.js") throw new TypeError("404"); return pipeline; });
  assert.equal(await none.openTm(), null);
});
