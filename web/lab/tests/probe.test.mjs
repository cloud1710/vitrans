// Unit tests for the pre-download memory probe (web/lab/core.js). No network, no real GPU: a Map-backed store
// stands in for localStorage and a fake WebGPU object records what the allocator does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS, checkFit, STATE_KEY, UNFIT_KEY, probeBytes, probeChunks, memoryProbe, takeKilledProbe,
  readUnfit, markUnfit, clearUnfit, gpuAllocate, unfitFor } from "../core.js";

const MB = 1024 * 1024;
const GIB = 1024 * MB;

test("unfitFor: a failed probe also rules out every model that needs as much memory or more", () => {
  const failed = { model: "mlc-2b", name: "Qwen 3.5 2B (WebLLM)", bytes: 2 * GIB, reason: "killed" };
  const unfit = { "mlc-2b": failed };
  assert.equal(unfitFor("mlc-2b", 2 * GIB, unfit), failed);            // its own record
  assert.equal(unfitFor("mlc-4b", 4 * GIB, unfit), failed);            // needs more: inherited
  assert.equal(unfitFor("onnx-0.8b", 0.7 * GIB, unfit), null);         // needs less: still allowed
  assert.equal(unfitFor("mlc-2b", 2 * GIB, {}), null);
  // with several failures the smallest one that covers the model is reported
  const big = { model: "mlc-4b", name: "Qwen 3.5 4B (WebLLM)", bytes: 4 * GIB, reason: "oom" };
  assert.equal(unfitFor("mlc-9b", 6 * GIB, { "mlc-4b": big, "mlc-2b": failed }), failed);
  assert.equal(unfitFor("x", 3 * GIB, { bad: { model: "bad", bytes: "?" } }), null);  // malformed record ignored
});

function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    raw: m,
  };
}

// device info as probeDevice() reports it for a WebGPU phone with 1 GiB buffers and shader-f16
function info(maxBufferSize) {
  return {
    device_class: "iPhone",
    webgpu: { available: true, adapter: {}, features: ["shader-f16"],
      limits: { maxBufferSize: maxBufferSize || GIB, maxStorageBufferBindingSize: GIB,
        maxStorageBuffersPerShaderStage: 10, maxComputeWorkgroupStorageSize: 32768 } },
  };
}

const MLC2B = MODELS.find((m) => m.key === "mlc-2b");
const ONNX2B = MODELS.find((m) => m.key === "onnx-2b");

// ---- chunking ----

test("probeChunks splits the total into buffers no larger than maxBufferSize", () => {
  const chunks = probeChunks(2245 * MB, 256 * MB);
  assert.ok(chunks.every((n) => n <= 256 * MB));
  assert.equal(chunks.reduce((a, n) => a + n, 0), 2245 * MB);
  assert.equal(chunks.length, Math.ceil(2245 / 256));
});

test("probeChunks never goes above the 1 GiB cap even when the adapter allows more", () => {
  const chunks = probeChunks(2245 * MB, 4 * GIB);
  assert.deepEqual(chunks, [GIB, GIB, 2245 * MB - 2 * GIB]);
});

test("probeChunks keeps every size a multiple of 4 (writeBuffer rule) and covers the total", () => {
  const chunks = probeChunks(10 * MB + 3, 1000003);
  assert.ok(chunks.every((n) => n % 4 === 0 && n <= 1000003));
  assert.ok(chunks.reduce((a, n) => a + n, 0) >= 10 * MB + 3);
});

test("probeChunks rejects a missing buffer limit", () => {
  assert.throws(() => probeChunks(MB, 0));
});

test("probeBytes uses the fit's memory estimate (f32 builds need more)", () => {
  assert.equal(probeBytes(checkFit(MLC2B, info())), 2245 * MB);
  const noF16 = info();
  noF16.webgpu.features = [];
  assert.equal(probeBytes(checkFit(MLC2B, noF16)), 2592 * MB);
});

// ---- state machine ----

test("the probe marker is saved before any allocation and names the model and the bytes", async () => {
  const store = memStore();
  let seen = null;
  await memoryProbe(MLC2B, info(), { store, allocate: async () => { seen = JSON.parse(store.getItem(STATE_KEY)); return { ok: true }; } });
  assert.equal(seen.phase, "probe");
  assert.equal(seen.model, "mlc-2b");
  assert.equal(seen.bytes, 2245 * MB);
  assert.equal(seen.name, MLC2B.name);
});

test("the allocator receives chunks bounded by the adapter's maxBufferSize", async () => {
  const store = memStore();
  let got = null;
  await memoryProbe(ONNX2B, info(512 * MB), { store, allocate: async (chunks) => { got = chunks; return { ok: true }; } });
  assert.equal(got.length, Math.ceil(1700 / 512));
  assert.ok(got.every((n) => n <= 512 * MB));
});

test("a successful probe clears the marker and marks nothing", async () => {
  const store = memStore();
  const res = await memoryProbe(MLC2B, info(), { store, allocate: async () => ({ ok: true }) });
  assert.equal(res.ok, true);
  assert.equal(res.bytes, 2245 * MB);
  assert.equal(store.getItem(STATE_KEY), null);
  assert.deepEqual(readUnfit(store), {});
});

test("an out-of-memory answer from the GPU marks the model, clears the marker and does not throw", async () => {
  const store = memStore();
  const res = await memoryProbe(MLC2B, info(), { store, allocate: async () => ({ ok: false, reason: "oom", message: "x" }) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "oom");
  assert.equal(store.getItem(STATE_KEY), null);
  const u = readUnfit(store);
  assert.equal(u["mlc-2b"].reason, "oom");
  assert.equal(u["mlc-2b"].bytes, 2245 * MB);
});

test("a lost device also marks the model", async () => {
  const store = memStore();
  const res = await memoryProbe(MLC2B, info(), { store, allocate: async () => ({ ok: false, reason: "lost", message: "gone" }) });
  assert.equal(res.reason, "lost");
  assert.equal(readUnfit(store)["mlc-2b"].reason, "lost");
});

test("an allocator that throws gives an error result, clears the marker and marks nothing", async () => {
  const store = memStore();
  const res = await memoryProbe(MLC2B, info(), { store, allocate: async () => { throw new Error("boom"); } });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "error");
  assert.match(res.message, /boom/);
  assert.equal(store.getItem(STATE_KEY), null);
  assert.deepEqual(readUnfit(store), {});
});

test("a reload after the tab was killed during the probe is detected once and marks the model", async () => {
  const store = memStore();
  // the allocation never returns: the OS killed the tab, so only the marker is left behind
  memoryProbe(MLC2B, info(), { store, allocate: () => new Promise(() => {}) });
  await Promise.resolve();
  assert.equal(JSON.parse(store.getItem(STATE_KEY)).phase, "probe");
  const killed = takeKilledProbe(store, "2026-10-14T13:30:00Z");
  assert.equal(killed.marker.model, "mlc-2b");
  assert.equal(killed.record.reason, "killed");
  assert.equal(killed.record.bytes, 2245 * MB);
  assert.equal(readUnfit(store)["mlc-2b"].reason, "killed");
  assert.equal(store.getItem(STATE_KEY), null);
  assert.equal(takeKilledProbe(store, "later"), null);
});

test("takeKilledProbe leaves load / run markers alone for the existing recovery path", () => {
  const st = JSON.stringify({ phase: "load", model: "Qwen3.5-2B-q4f16_1-MLC" });
  const store = memStore({ [STATE_KEY]: st });
  assert.equal(takeKilledProbe(store, "now"), null);
  assert.equal(store.getItem(STATE_KEY), st);
  assert.deepEqual(readUnfit(store), {});
});

test("failures are remembered per model and 'thu lai' clears only that model", () => {
  const store = memStore();
  markUnfit(store, "mlc-2b", { model: "mlc-2b", reason: "killed", bytes: 1 });
  markUnfit(store, "onnx-2b", { model: "onnx-2b", reason: "oom", bytes: 2 });
  assert.deepEqual(Object.keys(readUnfit(store)).sort(), ["mlc-2b", "onnx-2b"]);
  clearUnfit(store, "mlc-2b");
  assert.deepEqual(Object.keys(readUnfit(store)), ["onnx-2b"]);
  assert.ok(store.getItem(UNFIT_KEY).includes("onnx-2b"));
});

test("a probe that passes after a retry does not bring back an old failure of another model", async () => {
  const store = memStore();
  markUnfit(store, "mlc-2b", { model: "mlc-2b", reason: "killed", bytes: 1 });
  await memoryProbe(ONNX2B, info(), { store, allocate: async () => ({ ok: true }) });
  assert.deepEqual(Object.keys(readUnfit(store)), ["mlc-2b"]);
});

test("broken or missing storage never throws", async () => {
  assert.deepEqual(readUnfit(null), {});
  assert.deepEqual(readUnfit(memStore({ [UNFIT_KEY]: "{not json" })), {});
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); } };
  markUnfit(throwing, "k", {});
  clearUnfit(throwing, "k");
  assert.equal(takeKilledProbe(throwing, "now"), null);
  const res = await memoryProbe(MLC2B, info(), { store: null, allocate: async () => ({ ok: true }) });
  assert.equal(res.ok, true);
});

// ---- the WebGPU allocator against a fake GPU ----

function fakeGpu(opts) {
  const o = opts || {};
  const log = { buffers: [], writes: [], waits: 0, pending: 0, deviceDestroyed: false, requiredLimits: null, maxPending: 0 };
  let lostResolve;
  const scopes = [];
  const device = {
    lost: new Promise((r) => { lostResolve = r; }),
    pushErrorScope(filter) { scopes.push({ filter, error: null }); },
    async popErrorScope() { return scopes.pop().error; },
    createBuffer(desc) {
      const i = log.buffers.length;
      const b = { size: desc.size, usage: desc.usage, written: 0, destroyed: false, destroy() { b.destroyed = true; } };
      log.buffers.push(b);
      if (o.oomAt === i) {
        const s = scopes.slice().reverse().find((x) => x.filter === "out-of-memory");
        if (s && !s.error) s.error = { message: "Out of memory" };
      }
      if (o.loseAt === i) lostResolve({ reason: "unknown", message: "GPU process exited" });
      return b;
    },
    queue: {
      writeBuffer(buf, off, data, dataOff, size) {
        const n = size === undefined ? data.byteLength : size;
        assert.ok(off + n <= buf.size, "write past the end");
        assert.equal(n % 4, 0);
        assert.ok(data[0] !== 0, "fill must be non-zero so pages are committed");
        buf.written += n;
        log.writes.push(n);
        log.pending += n;
        log.maxPending = Math.max(log.maxPending, log.pending);
      },
      async onSubmittedWorkDone() { log.waits += 1; log.pending = 0; },
    },
    destroy() { log.deviceDestroyed = true; },
  };
  const adapter = {
    limits: { maxBufferSize: o.maxBufferSize || GIB },
    async requestDevice(desc) {
      if (o.deviceFails) throw new Error("requestDevice failed");
      log.requiredLimits = desc && desc.requiredLimits;
      return device;
    },
  };
  return { gpu: { async requestAdapter() { return o.noAdapter ? null : adapter; } }, log };
}

const noSleep = { holdMs: 1000, sleep: async () => {} };

test("gpuAllocate writes data into every byte of every buffer, waits for the GPU, then frees everything", async () => {
  const { gpu, log } = fakeGpu();
  let held = null;
  const chunks = [GIB, GIB, 197 * MB];
  const res = await gpuAllocate(gpu, chunks, { holdMs: 1000, sleep: async (ms) => { held = ms; }, fillBytes: 64 * MB });
  assert.equal(res.ok, true);
  assert.deepEqual(log.buffers.map((b) => b.size), chunks);
  assert.ok(log.buffers.every((b) => b.written === b.size));
  assert.ok(log.buffers.every((b) => b.destroyed));
  assert.equal(log.deviceDestroyed, true);
  assert.equal(held, 1000);
  assert.ok(log.waits >= 1);
  assert.ok(log.maxPending <= 64 * MB, "staging must stay bounded: wait after each write");
  assert.equal(log.requiredLimits.maxBufferSize, GIB);
});

test("gpuAllocate reports an out-of-memory error scope without throwing and frees what it made", async () => {
  const { gpu, log } = fakeGpu({ oomAt: 1 });
  const res = await gpuAllocate(gpu, [GIB, GIB, GIB], noSleep);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "oom");
  assert.equal(log.buffers.length, 2);
  assert.ok(log.buffers.every((b) => b.destroyed));
  assert.equal(log.deviceDestroyed, true);
});

test("gpuAllocate reports a lost device without throwing", async () => {
  const { gpu, log } = fakeGpu({ loseAt: 0 });
  const res = await gpuAllocate(gpu, [GIB, GIB], noSleep);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "lost");
  assert.match(res.message, /GPU process exited/);
  assert.ok(log.buffers.every((b) => b.destroyed));
});

test("gpuAllocate turns a missing adapter or a failed device request into an error result", async () => {
  assert.equal((await gpuAllocate(fakeGpu({ noAdapter: true }).gpu, [MB], noSleep)).reason, "error");
  assert.equal((await gpuAllocate(fakeGpu({ deviceFails: true }).gpu, [MB], noSleep)).reason, "error");
  assert.equal((await gpuAllocate(null, [MB], noSleep)).reason, "error");
});

test("gpuAllocate refuses chunks above the adapter limit instead of asking for an invalid device", async () => {
  const { gpu, log } = fakeGpu({ maxBufferSize: 256 * MB });
  const res = await gpuAllocate(gpu, [GIB], noSleep);
  assert.equal(res.reason, "error");
  assert.equal(log.requiredLimits, null);
});
