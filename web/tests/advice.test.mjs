// The texts built from the helper's /api/hardware and job events. Pure functions: no network, no DOM; explicit
// clock values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { helperAdvice, setupLine, modelName, modelQuality, etaText, durationText, overallPercent, makeThrottle,
  packsLine, reviewText, vnNum } from "../advice.js";

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
