// The OCR pipeline around the two models (web/ocr/ocr.js recognizeRgba, with the models replaced by scripted
// stand-ins: the real ones run in Chrome, tests/accuracy.mjs) and the pinned files of the vendored runtime / models.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { recognizeRgba, OCR_FILES, ORT_FILES, ORT_GPU_FILES, chooseBackend, selfTestPassed, startWithFallback }
  from "../ocr.js";
import { charList } from "../ctc.js";
import { REC_H } from "../pre.js";

const OCR_DIR = fileURLToPath(new URL("..", import.meta.url));
const white = (w, h) => new Uint8ClampedArray(w * h * 4).fill(255);
const DIGITS = charList("0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n");

// a detection stand-in: a map of the input size with the given rectangles (input coordinates) at 0.9
function fakeDet(rects, seen) {
  return async (data, w, h) => {
    seen.push([w, h, data.length]);
    const m = new Float32Array(w * h);
    for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 0.9;
    return m;
  };
}

// a recognition stand-in: each line reads as its content width in the tensor (the columns of row 24 that are not
// padding), with probability `p(width)`; one time step per character
function fakeRec(p, calls) {
  return async (data, n, width) => {
    calls.push([n, width]);
    const steps = 8, classes = DIGITS.length;
    const out = new Float32Array(n * steps * classes);
    for (let r = 0; r < n; r++) {
      let content = 0;
      for (let x = 0; x < width; x++) if (data[r * 3 * REC_H * width + 24 * width + x] !== 0) content = x + 1;
      const digits = String(content);
      for (let t = 0; t < steps; t++) {
        // digit, blank, digit, blank ... so that repeated digits survive
        const k = t % 2 === 0 && t / 2 < digits.length ? 1 + Number(digits[t / 2]) : 0;
        out[(r * steps + t) * classes + k] = k ? p(content) : 1;
      }
    }
    return { probs: out, steps, classes };
  };
}

test("recognizeRgba: boxes in image coordinates, reading order, text per box, low scores dropped", async () => {
  const seen = [], calls = [];
  // image 256 x 128, detection at 128 x 64 (max side 128): every coordinate doubles
  const res = await recognizeRgba(white(256, 128), 256, 128, {
    detMaxSide: 128, chars: DIGITS,
    runDet: fakeDet([[10, 15, 49, 19], [10, 30, 39, 34], [70, 3, 84, 7]], seen),
    runRec: fakeRec((w) => (w < 150 ? 0.3 : 0.95), calls),  // the 15 x 5 box (38 x 18 -> 102 wide) reads badly
  });
  assert.deepEqual(seen, [[128, 64, 3 * 128 * 64]]);
  assert.equal(res.width, 256);
  assert.equal(res.height, 128);
  assert.equal(res.lines.length, 2, JSON.stringify(res.lines));
  const [a, b] = res.lines;
  // the first box: 40 x 5 in the map, grown by d = 200 * 1.5 / 90 = 3.33 -> about 47 x 12, doubled
  assert.ok(a.box[0] < 20 && a.box[2] > 98 && a.box[1] < 30 && a.box[3] > 38, JSON.stringify(a.box));
  assert.ok(b.box[1] > a.box[1]);
  for (const l of res.lines) {
    assert.equal(l.quad.length, 4);
    assert.ok(l.score > 0.9);
    // the stand-in reads the line's content width, which is ceil(48 * w / h) of its crop
    const w = Math.trunc(Math.hypot(l.quad[1][0] - l.quad[0][0], l.quad[1][1] - l.quad[0][1]));
    const h = Math.trunc(Math.hypot(l.quad[3][0] - l.quad[0][0], l.quad[3][1] - l.quad[0][1]));
    assert.equal(l.text, String(Math.ceil((REC_H * w) / h)));
  }
  assert.deepEqual(calls.map((c) => c[0]), [3]);  // one batch of three lines
});

test("recognizeRgba: each line carries the span of its text along the box, from the CTC steps", async () => {
  // one box; the stand-in puts its characters at steps 2..4 of 8 (stride = tensor width / 8)
  const rec = async (data, n, width) => {
    const steps = 8, classes = DIGITS.length;
    const out = new Float32Array(n * steps * classes);
    for (let t = 0; t < steps; t++) out[t * classes + (t >= 2 && t <= 4 ? 1 + t : 0)] = 1;
    return { probs: out, steps, classes };
  };
  const res = await recognizeRgba(white(256, 128), 256, 128, { detMaxSide: 256, chars: DIGITS,
    runDet: fakeDet([[20, 40, 219, 59]], []), runRec: rec });
  assert.equal(res.lines.length, 1);
  const l = res.lines[0];
  assert.equal(l.text, "234");
  // content width of the crop in the tensor: ceil(48 * w / h); stride 40 (320 / 8); text from step 2 to 4, one
  // step of slack on each side (a CTC spike sits inside its character, not on its edge)
  const w = Math.trunc(Math.hypot(l.quad[1][0] - l.quad[0][0], l.quad[1][1] - l.quad[0][1]));
  const h = Math.trunc(Math.hypot(l.quad[3][0] - l.quad[0][0], l.quad[3][1] - l.quad[0][1]));
  const content = Math.min(Math.trunc(48 * Math.max(320 / 48, w / h)), Math.ceil((48 * w) / h));
  const stride = Math.trunc(48 * Math.max(320 / 48, w / h)) / 8;
  assert.ok(Math.abs(l.span[0] - (1 * stride) / content) < 1e-9, JSON.stringify(l.span));
  assert.ok(Math.abs(l.span[1] - Math.min(1, (6 * stride) / content)) < 1e-9, JSON.stringify(l.span));
});

test("recognizeRgba: an image without text gives no lines and runs no recognition", async () => {
  const calls = [];
  const res = await recognizeRgba(white(64, 64), 64, 64, { chars: DIGITS, runDet: fakeDet([], []),
    runRec: fakeRec(() => 1, calls) });
  assert.deepEqual(res, { width: 64, height: 64, lines: [] });
  assert.equal(calls.length, 0);
});

test("recognizeRgba: an aborted signal stops between the steps with an AbortError", async () => {
  const ctrl = new AbortController();
  const det = fakeDet([[10, 15, 49, 19]], []);
  await assert.rejects(recognizeRgba(white(64, 64), 64, 64, { chars: DIGITS, signal: ctrl.signal,
    runDet: async (...a) => { ctrl.abort(); return det(...a); }, runRec: fakeRec(() => 1, []) }),
  (e) => e.name === "AbortError");
});

test("backend: WebGPU when the browser has it, JSPI and an adapter (unless WASM is asked for), else WASM", () => {
  assert.equal(chooseBackend({ gpu: true, jspi: true, adapter: true }), "webgpu");
  assert.equal(chooseBackend({ gpu: true, jspi: true, adapter: true, prefer: "wasm" }), "wasm");
  assert.equal(chooseBackend({ gpu: true, jspi: false, adapter: true }), "wasm");    // Safari: no JSPI
  assert.equal(chooseBackend({ gpu: false, jspi: true, adapter: false }), "wasm");
  assert.equal(chooseBackend({ gpu: true, jspi: true, adapter: false }), "wasm");   // no adapter (blocklisted GPU)
});

test("startWithFallback: WebGPU kept only when it starts and passes its check; else the WASM runtime", async () => {
  const log = [];
  const rt = (name) => ({ name, release: async () => { log.push("release " + name); } });
  const start = (fail) => async (b) => {
    log.push("start " + b);
    if (b === fail) throw new Error(b + " broke");
    return rt(b);
  };
  assert.deepEqual(await startWithFallback("webgpu", start(null), async () => true).then((r) => [r.backend, r.rt.name, r.fallback]),
    ["webgpu", "webgpu", null]);
  log.length = 0;
  const bad = await startWithFallback("webgpu", start(null), async () => false);
  assert.deepEqual([bad.backend, bad.rt.name, bad.fallback], ["wasm", "wasm", "self-test"]);
  assert.deepEqual(log, ["start webgpu", "release webgpu", "start wasm"]);
  const broke = await startWithFallback("webgpu", start("webgpu"), async () => true);
  assert.deepEqual([broke.backend, broke.fallback], ["wasm", "webgpu broke"]);
  log.length = 0;
  assert.equal((await startWithFallback("wasm", start(null), async () => true)).backend, "wasm");
  assert.deepEqual(log, ["start wasm"]);
  const abort = async () => { throw new DOMException("stop", "AbortError"); };
  await assert.rejects(startWithFallback("webgpu", abort, async () => true), (e) => e.name === "AbortError");
});

test("the self-test line: a known text the engine must read back before WebGPU is trusted", () => {
  assert.equal(selfTestPassed("ViTranslate 2026 OCR"), true);
  assert.equal(selfTestPassed("ViTranslate 2O26 OCR"), true);   // one character off
  assert.equal(selfTestPassed(""), false);
  assert.equal(selfTestPassed("lllllll"), false);
});

test("the pinned files match the vendored bytes (sha256 and size)", () => {
  for (const f of Object.values(OCR_FILES).concat(Object.values(ORT_FILES), Object.values(ORT_GPU_FILES))) {
    const b = readFileSync(OCR_DIR + f.path);
    assert.equal(b.length, f.bytes, f.path);
    assert.equal(createHash("sha256").update(b).digest("hex"), f.sha256, f.path);
  }
});
