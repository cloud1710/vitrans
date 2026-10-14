// The page's own recommender (no helper), its cache, and the texts built from the helper's /api/hardware and job
// events. Pure functions: no network, no DOM; a Map-backed store and explicit clock values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adviseBrowser, answerDevice, cheapFingerprint, fullFingerprint, readAdviceCache, writeAdviceCache,
  clearAdviceCache, ADVICE_KEY, ADVICE_TTL_MS, helperAdvice, setupLine, modelName, modelQuality, etaText,
  durationText, overallPercent, makeThrottle, packsLine, reviewText, vnNum } from "../advice.js";
import { screenCandidates, screenDecision } from "../lab/core.js";

const UA = {
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1",
  iphoneOld: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
};
const GPU = { available: true, adapter: { vendor: "apple", architecture: "metal-3", description: "" },
  features: ["shader-f16"], limits: { maxBufferSize: 1073741824, maxStorageBufferBindingSize: 1073741824 } };

function env(over) {
  return Object.assign({ ua: UA.windows, touchPoints: 0, screen: { w: 1920, h: 1080, dpr: 1 }, webgpu: null,
    deviceMemory: null, declared: null, unfit: {} }, over);
}

function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, raw: m };
}

test("a Windows desktop without the helper is told to install it", () => {
  const a = adviseBrowser(env());
  assert.equal(a.kind, "desktop-windows");
  assert.match(a.line, /cài bộ dịch ViTranslate/);
  assert.match(a.line, /Gemma 4 E4B \(máy có GPU\) hoặc Qwen 3.5 9B \(chỉ CPU\)/);
  assert.match(a.detail, /mã nguồn|liên hệ/);
  assert.equal(a.ask, null);
});

test("macOS and Linux desktops are pointed to the lab (in-browser engine in development)", () => {
  for (const ua of [UA.mac, UA.linux]) {
    const a = adviseBrowser(env({ ua, webgpu: GPU }));
    assert.equal(a.kind, "desktop-other");
    assert.ok(a.link);
    assert.match(a.line, /trong trình duyệt/);
  }
});

test("an iPhone below the minimum is told so without a question", () => {
  const a = adviseBrowser(env({ ua: UA.iphone, touchPoints: 5, screen: { w: 375, h: 812, dpr: 3 }, webgpu: GPU }));
  assert.equal(a.kind, "mobile-below");
  assert.match(a.line, /Chưa đạt/);
  assert.match(a.line, /8 GB/);
  assert.equal(a.ask, null);
  assert.ok(a.link);  // "not the right model? choose it in the lab"
});

test("an iPad above the minimum is told so without a question", () => {
  const a = adviseBrowser(env({ ua: UA.ipad, touchPoints: 5, screen: { w: 1032, h: 1376, dpr: 2 }, webgpu: GPU }));
  assert.equal(a.kind, "mobile-ok");
  assert.match(a.line, /Đạt yêu cầu tối thiểu/);
  assert.match(a.line, /iPad Pro 13 inch/);
});

test("a straddling screen asks one two-way question and the answer is remembered", () => {
  const e = env({ ua: UA.iphone, touchPoints: 5, screen: { w: 390, h: 844, dpr: 3 }, webgpu: GPU });
  const a = adviseBrowser(e);
  assert.equal(a.kind, "mobile-ask");
  assert.equal(a.ask.options.length, 2);
  assert.match(a.ask.question, /^Máy bạn là iPhone .* hay iPhone .*\?$/);
  const [below, ok] = a.ask.options;
  assert.equal(below.label, "iPhone 12 / 12 Pro / 13 / 13 Pro / …");
  assert.equal(ok.label, "iPhone 16e / 17e");
  // the answer is stored as the declared device (the lab reads the same key): next time no question
  assert.equal(adviseBrowser(Object.assign({}, e, { declared: ok.device })).kind, "mobile-ok");
  assert.equal(adviseBrowser(Object.assign({}, e, { declared: below.device })).kind, "mobile-below");
});

test("the remembered answer is the most telling device of the chosen group", () => {
  const d = screenDecision(screenCandidates("iPhone", 393, 852, 3));
  assert.equal(answerDevice(d.ok), "iPhone 15 Pro");       // smallest RAM of the >= 8 GB side
  assert.equal(answerDevice(d.below), "iPhone 14 Pro / 14 Pro Max");
});

test("old iOS, a failed memory probe and Android", () => {
  const old = adviseBrowser(env({ ua: UA.iphoneOld, touchPoints: 5, screen: { w: 402, h: 874, dpr: 3 } }));
  assert.equal(old.kind, "mobile-update");
  assert.match(old.line, /iOS 26/);
  const failed = adviseBrowser(env({ ua: UA.iphone, touchPoints: 5, screen: { w: 402, h: 874, dpr: 3 }, webgpu: GPU,
    unfit: { "mlc-2b": { model: "mlc-2b", bytes: 2 ** 31, reason: "killed" } } }));
  assert.equal(failed.kind, "mobile-below");
  const android = adviseBrowser(env({ ua: UA.android, touchPoints: 5, deviceMemory: 8 }));
  assert.equal(android.kind, "android");
  assert.match(android.detail, /8 GB/);
  const unknown = adviseBrowser(env({ ua: UA.iphone, touchPoints: 5, screen: { w: 360, h: 740, dpr: 3 }, webgpu: GPU }));
  assert.equal(unknown.kind, "mobile-unknown");
  assert.ok(unknown.link);
});

test("the advice is cached per browser fingerprint for 90 days", () => {
  const store = memStore();
  const e = env({ ua: UA.ipad, touchPoints: 5, screen: { w: 1032, h: 1376, dpr: 2 }, webgpu: GPU });
  const advice = adviseBrowser(e);
  const t0 = Date.UTC(2026, 9, 14);
  assert.equal(readAdviceCache(store, cheapFingerprint(e), t0), null);
  writeAdviceCache(store, cheapFingerprint(e), fullFingerprint(e), advice, t0);
  const hit = readAdviceCache(store, cheapFingerprint(e), t0 + 10 * 86400000);
  assert.deepEqual(hit.advice, advice);
  assert.equal(hit.fp, fullFingerprint(e));
  assert.equal(readAdviceCache(store, cheapFingerprint(e), t0 + ADVICE_TTL_MS + 1), null);   // expired
  assert.equal(ADVICE_TTL_MS, 90 * 86400000);
  // another browser / device / declared model / failed probe: not this record
  for (const other of [env({ ua: UA.windows }), Object.assign({}, e, { declared: "iPad Pro (M4, 2024)" }),
    Object.assign({}, e, { unfit: { "mlc-4b": {} } }), Object.assign({}, e, { screen: { w: 834, h: 1210, dpr: 2 } })]) {
    assert.equal(readAdviceCache(store, cheapFingerprint(other), t0), null);
  }
  // the GPU part is only in the full fingerprint (known after the async WebGPU probe)
  assert.notEqual(fullFingerprint(e), fullFingerprint(Object.assign({}, e, { webgpu: null })));
  assert.equal(cheapFingerprint(e), cheapFingerprint(Object.assign({}, e, { webgpu: null })));
  clearAdviceCache(store);
  assert.equal(store.raw.has(ADVICE_KEY), false);
  // broken storage never throws
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.equal(readAdviceCache(broken, "x", t0), null);
  writeAdviceCache(broken, "x", "y", advice, t0);
  store.setItem(ADVICE_KEY, "{not json");
  assert.equal(readAdviceCache(store, cheapFingerprint(e), t0), null);
});

function hw(over) {
  const base = {
    ready: true,
    profile: { cpu: { model: "13th Gen Intel(R) Core(TM) i5-13500", cores: 14, threads: 20 },
      ram: { total_mb: 65314, free_mb: 36000 },
      gpu_now: { present: true, name: "NVIDIA GeForce RTX 5080", total_mb: 16303, free_mb: 14540, usable: true, busy: false },
      ollama: { reachable: true, model_gpu: true, model_cpu: true, model_fast: true } },
    calibration: { state: "done", device: "gpu", results: {} },
    recommendation: { engine: "helper-gpu", device: "gpu", model: "gemma4:e4b", polish_default: true,
      fast_default: false, needs_download: false, reasons: [{ code: "gpu_ok", name: "NVIDIA GeForce RTX 5080", free_mb: 14540 }],
      estimates: { seconds_per_a4_page: 37.4, seconds_per_slide: 5.0, polish: true, basis: "measured" } },
    pull: { model: null, state: "idle", error: null },
  };
  return Object.assign(base, over);
}

test("helper card on a GPU machine: device, model, time per page and slide, read-back, one reason", () => {
  const a = helperAdvice(hw());
  assert.equal(a.line, "GPU NVIDIA GeForce RTX 5080 (trống 14,2 GB) → Gemma 4 E4B trên GPU");
  assert.equal(a.estimate, "Ước tính ~37 giây / trang A4 · ~5 giây / slide · đọc lại cho mượt: bật (đã đo trên máy này)");
  assert.match(a.detail, /GPU đủ bộ nhớ/);
  assert.match(a.detail, /Gemma 4 E4B/);
  assert.equal(a.pull, null);
  assert.equal(a.status, "");
});

test("helper card when the GPU is busy: CPU, read-back off, waiting to measure", () => {
  const busy = hw({
    calibration: { state: "waiting", reason: "gpu_busy", results: {} },
    recommendation: { engine: "helper-cpu", device: "cpu", model: "qwen3.5:9b", polish_default: false, fast_default: false,
      needs_download: false, reasons: [{ code: "gpu_busy", name: "NVIDIA GeForce RTX 5080", foreign_mb: 15922, util_pct: 83 },
        { code: "polish_off_cpu" }],
      estimates: { seconds_per_a4_page: 214.5, seconds_per_slide: 26.3, polish: false, basis: "default" } } });
  const a = helperAdvice(busy);
  assert.equal(a.line, "CPU 13th Gen Intel(R) Core(TM) i5-13500 (14 nhân, RAM 64 GB) → Qwen 3.5 9B trên CPU");
  assert.equal(a.estimate, "Ước tính ~3,6 phút / trang A4 · ~26 giây / slide · đọc lại cho mượt: tắt (ước tính sơ bộ)");
  assert.match(a.detail, /đang bận/);
  assert.match(a.detail, /15,5 GB/);
  assert.match(a.status, /GPU rảnh/);
});

test("helper card asks before downloading the recommended fast draft", () => {
  const low = hw({ recommendation: { engine: "helper-cpu-fast", device: "cpu", model: "gemma4:e2b", polish_default: false,
    fast_default: true, needs_download: true, reasons: [{ code: "no_gpu" }, { code: "ram_low", ram_mb: 8192 }, { code: "polish_off_cpu" }],
    estimates: { seconds_per_a4_page: 118, seconds_per_slide: 14.5, polish: false, basis: "default" } } });
  const a = helperAdvice(low);
  assert.match(a.line, /→ Bản nháp nhanh Gemma 4 E2B trên CPU$/);
  assert.match(a.detail, /dùng bản nháp nhanh Gemma 4 E2B/);
  assert.equal(a.pull.text, "Cho phép tải Gemma 4 E2B (~4,6 GB)");
  assert.equal(a.pull.disabled, false);
  const running = helperAdvice(Object.assign(low, { pull: { model: "gemma4:e2b", state: "running", error: null } }));
  assert.equal(running.pull.disabled, true);
  assert.match(running.pull.text, /Đang tải Gemma 4 E2B/);
});

test("helper card offers one button for a missing GPU default, whatever was downloaded before", () => {
  const rec = Object.assign({}, hw().recommendation, { needs_download: true });
  const a = helperAdvice(hw({ recommendation: rec }));
  assert.equal(a.pull.text, "Cho phép tải Gemma 4 E4B (~6,6 GB)");
  // an earlier, finished download of another model does not hide the button
  const b = helperAdvice(hw({ recommendation: rec, pull: { model: "gemma4:e2b", state: "done", error: null } }));
  assert.equal(b.pull.text, "Cho phép tải Gemma 4 E4B (~6,6 GB)");
  const done = helperAdvice(hw({ recommendation: rec, pull: { model: "gemma4:e4b", state: "done", error: null } }));
  assert.equal(done.pull, null);
  const waiting = helperAdvice(hw({ recommendation: rec, calibration: { state: "waiting", reason: "model_missing", results: {} } }));
  assert.equal(waiting.status, "Chưa đo được tốc độ: chưa có mô hình dịch mặc định.");
});

test("setup line and model words", () => {
  assert.equal(setupLine(hw().profile, hw().recommendation), "GPU NVIDIA GeForce RTX 5080 (trống 14,2 GB) → Gemma 4 E4B trên GPU");
  assert.equal(modelName("gemma4:e4b"), "Gemma 4 E4B");
  assert.equal(modelName("gemma4:e2b"), "Gemma 4 E2B");
  assert.equal(modelName("qwen3.5:9b"), "Qwen 3.5 9B");
  assert.equal(modelName("qwen3.5:4b"), "Qwen 3.5 4B");
  assert.equal(modelName("other:1"), "other:1");
  assert.equal(modelQuality("gemma4:e4b"), "chất lượng chuẩn");
  assert.equal(modelQuality("qwen3.5:9b"), "chất lượng chuẩn");
  assert.equal(modelQuality("gemma4:e2b"), "bản nháp nhanh, chất lượng thấp hơn, cần duyệt kỹ");
  assert.equal(vnNum(14.24, 1), "14,2");
});

test("time texts", () => {
  assert.equal(etaText(30, false), "Dự kiến dưới 1 phút");
  assert.equal(etaText(400, false), "Dự kiến khoảng 7 phút");
  assert.equal(etaText(400, true), "Dự kiến còn khoảng 7 phút");
  assert.equal(etaText(null, false), "");
  assert.equal(durationText(37.4), "37 giây");
  assert.equal(durationText(214.5), "3,6 phút");
  assert.equal(durationText(1500), "25 phút");
  assert.equal(durationText(5400), "1,5 giờ");
});

test("overall progress weights the stages by their estimated time", () => {
  const est = { translate_s: 60, polish_s: 30, write_s: 10, total_s: 100 };
  assert.equal(overallPercent(est, "translate", 5, 10), 30);
  assert.equal(overallPercent(est, "polish", 1, 2), 75);
  assert.equal(overallPercent(est, "write", 0, 0), 90);
  assert.equal(overallPercent(est, "done", 0, 0), 100);
  assert.equal(overallPercent(est, "classify", 0, 0), 0);
  // without an estimate: the stage's own fraction, as before
  assert.equal(overallPercent(null, "translate", 5, 10), 50);
});

test("progress lines are throttled to every 5 % or 10 s", () => {
  const should = makeThrottle(5, 10000);
  assert.equal(should(1, 0), true);     // the first one
  assert.equal(should(3, 1000), false);
  assert.equal(should(6, 2000), true);  // +5 %
  assert.equal(should(7, 5000), false);
  assert.equal(should(8, 12001), true); // 10 s
  assert.equal(should(100, 12002), true);  // the last one always
});

test("pack line shows cosine scores of the loaded packs and of the best others", () => {
  const ev = { packs: [{ id: "pathology", name: "Giải phẫu bệnh", score: 0.3012, matched: ["meningioma", "histologic", "WHO classification", "grade"], reason: "match" }],
    candidates: [{ id: "breast", name: "GPB vú", score: 0.012 }, { id: "gi", name: "GPB tiêu hóa", score: 0 }] };
  assert.equal(packsLine(ev), "Chọn gói thuật ngữ (cosine): Giải phẫu bệnh 0,30 ✓ · GPB vú 0,01 · GPB tiêu hóa 0,00 — khớp: meningioma, histologic, WHO classification, grade");
  assert.equal(packsLine({ packs: [], candidates: [{ id: "a", name: "A", score: 0.04 }] }),
    "Chọn gói thuật ngữ (cosine): không có gói phù hợp · A 0,04");
  assert.equal(packsLine({ packs: [{ id: "b", name: "B", score: 0.2, matched: [], reason: "parent" }], candidates: [] }),
    "Chọn gói thuật ngữ (cosine): B 0,20 ✓ (gói cha)");
});

test("review: the recommended level with its reasons, in one line", () => {
  const rep = { model: "gemma4:e4b", device: "gpu", fast: false, polish: { enabled: true },
    packs: [{ name: "Giải phẫu bệnh" }], review: { level: "careful", reasons: ["flagged_over_5"], flagged: 7, segments: 100 } };
  const r = reviewText(rep);
  assert.deepEqual(r, { line: "Mức kiểm tra khuyến nghị: kỹ (7 đoạn cần xem lại; hơn 5% số đoạn cần xem lại)",
    level: "careful" });
  const fast = reviewText({ model: "gemma4:e2b", device: "cpu", fast: true, polish: { enabled: false }, packs: [],
    review: { level: "thorough", reasons: ["fast_draft", "no_pack", "polish_off"], flagged: 0, segments: 10 } });
  assert.equal(fast.line, "Mức kiểm tra khuyến nghị: thật kỹ (0 đoạn cần xem lại; dùng bản nháp nhanh Gemma 4 E2B; "
    + "không có gói thuật ngữ phù hợp; không đọc lại cho mượt)");
  assert.equal(reviewText({}), null);
  assert.equal(reviewText({ review: { level: "moderate", reasons: [], flagged: 0, segments: 3 }, model: "qwen3.5:9b",
    device: "gpu", polish: { enabled: true }, packs: [{ name: "X" }] }).line,
  "Mức kiểm tra khuyến nghị: vừa phải (0 đoạn cần xem lại)");
});
