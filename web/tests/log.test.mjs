// The page's event log ("Nhật ký" in the menu, web/log.js): one line per event (time, tool, engine, segment count,
// latency, result or error code, helper state), in memory plus the last 500 lines in localStorage. It never holds
// the text of a document or a caption: an event is built from known fields only, each checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLog, formatEvent, LOG_KEY, MAX_LINES } from "../log.js";

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), m };
}
const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); },
  removeItem() { throw new Error("blocked"); } };
const AT = new Date(2026, 9, 15, 14, 3, 22).getTime();

test("one line per event: time, tool, engine, operation, segments, latency, result", () => {
  assert.equal(formatEvent({ tool: "text", engine: "cloud", op: "translate", segments: 20, ms: 1834, code: "ok" }, AT),
    "2026-10-15 14:03:22 · Văn bản · máy chủ · translate · 20 đoạn · 1.8 s · ok");
  assert.equal(formatEvent({ tool: "live", engine: "local", op: "translate", segments: 1, ms: 420, status: 503,
    code: "exceededCpu" }, AT), "2026-10-15 14:03:22 · Dịch đuổi · trên máy · translate · 1 đoạn · 0.4 s · 503 exceededCpu");
  assert.equal(formatEvent({ tool: "helper", op: "state", code: "helper_not_found" }, AT),
    "2026-10-15 14:03:22 · ViTranslate · state · helper_not_found");
  assert.equal(formatEvent({ tool: "anh", engine: "local", op: "classify", ms: 12, code: "ok" }, AT),
    "2026-10-15 14:03:22 · Ảnh · trên máy · classify · 0.0 s · ok");
});

test("no source text can reach a line: unknown fields dropped, free text in known fields replaced", () => {
  const secret = "Patient Nguyen Van A has a malignant tumour of the left breast";
  const line = formatEvent({ tool: "file", engine: "cloud", op: "translate", segments: 3, ms: 10, code: secret,
    text: secret, tagged: secret, en: secret, message: secret, name: "report " + secret + ".docx" }, AT);
  assert.ok(!/Patient|Nguyen|tumour|breast|docx/.test(line), line);
  assert.match(line, / · error$/);
  // a tool, engine or operation it does not know is not echoed either
  const odd = formatEvent({ tool: secret, engine: secret, op: secret, segments: secret, ms: secret }, AT);
  assert.ok(!/Patient|tumour/.test(odd), odd);
  // codes look like codes: letters, digits, _ . : - and at most 48 characters
  assert.match(formatEvent({ tool: "text", op: "translate", code: "found:47831" }, AT), /found:47831$/);
  assert.match(formatEvent({ tool: "text", op: "translate", code: "a".repeat(49) }, AT), / error$/);
});

test("in memory plus the last MAX_LINES lines in storage; a new log reads them back", () => {
  const storage = memoryStorage();
  let t = AT;
  const log = createLog({ storage: () => storage, now: () => t });
  assert.equal(MAX_LINES, 500);
  for (let k = 0; k < MAX_LINES + 20; k++) { log.add({ tool: "text", engine: "cloud", op: "translate", segments: k, code: "ok" }); t += 1000; }
  assert.equal(log.lines().length, MAX_LINES);
  assert.match(log.lines()[0], / 20 đoạn /);  // the oldest 20 went
  assert.equal(JSON.parse(storage.m.get(LOG_KEY)).length, MAX_LINES);
  const again = createLog({ storage: () => storage, now: () => t });
  assert.deepEqual(again.lines(), log.lines());
  assert.equal(again.text(), log.lines().join("\n"));
});

test("Xóa clears memory and storage; listeners hear every change", () => {
  const storage = memoryStorage();
  const log = createLog({ storage: () => storage, now: () => AT });
  let heard = 0;
  log.onChange(() => { heard += 1; });
  log.add({ tool: "sub", engine: "cloud", op: "classify", code: "ok" });
  log.clear();
  assert.equal(heard, 2);
  assert.deepEqual(log.lines(), []);
  assert.equal(storage.m.has(LOG_KEY), false);
});

test("storage failures are handled: blocked, full, missing or holding something else", () => {
  for (const storage of [() => throwing, () => null, () => { throw new Error("SecurityError"); }]) {
    const log = createLog({ storage, now: () => AT });
    log.add({ tool: "text", engine: "local", op: "translate", code: "ok" });
    log.add({ tool: "text", engine: "local", op: "translate", code: "ok" });
    assert.equal(log.lines().length, 2);  // the memory copy goes on
    log.clear();
    assert.equal(log.lines().length, 0);
  }
  for (const stored of ["not json", "{\"a\":1}", JSON.stringify([1, null, "x".repeat(400), "ok line"])]) {
    const storage = memoryStorage();
    storage.setItem(LOG_KEY, stored);
    const log = createLog({ storage: () => storage, now: () => AT });
    assert.deepEqual(log.lines(), stored.includes("ok line") ? ["ok line"] : []);
  }
});
