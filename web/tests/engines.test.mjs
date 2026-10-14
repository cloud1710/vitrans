// The page's two engines (spec Amendment F): the cloud engine by default, the helper on 127.0.0.1 only in the local
// mode the user picks ("Dịch trên máy"); the cloud's error texts, and the progress event -> page text mapping shared
// by both engines. Pure functions only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseEngine, localMode, cloudBlocked, cloudUsable, cloudErrorText, CLOUD_MODEL, ENGINE_KEY,
  CLOUD_CONSENT_KEY, eventView, makeThrottle, modelName, modelQuality, noticeText, reviewText, deviceWord,
  isFlagged } from "../advice.js";

test("only the local mode looks for the helper: the user's remembered pick, or the helper's own page", () => {
  // a public page reaching 127.0.0.1 makes Chrome ask for Local Network Access: cloud users must never see that
  assert.equal(localMode(null, false), false);
  assert.equal(localMode("cloud", false), false);
  assert.equal(localMode("local", false), true);
  assert.equal(localMode(null, true), true);  // the page served by the helper itself (no cloud API there)
  assert.equal(localMode("cloud", true), false);
  assert.equal(ENGINE_KEY, "vitranslate-engine-v1");
  assert.equal(CLOUD_CONSENT_KEY, "vitranslate-cloud-consent-v1");
});

test("the cloud engine unless the local mode is on; the local mode never falls back to the cloud", () => {
  assert.equal(chooseEngine({ local: false, helper: false }), "cloud");
  assert.equal(chooseEngine({ local: false, helper: true }), "cloud");
  assert.equal(chooseEngine({ local: true, helper: true }), "helper");
  assert.equal(chooseEngine({ local: true, helper: false }), null);  // the private mode: nothing sent behind his back
});

test("the cloud can take jobs when /api/v1/status is ok and today's budget is not used up", () => {
  assert.deepEqual(cloudUsable({ ok: true, model: CLOUD_MODEL, budget_left_today: 0.4 }), { ok: true, why: null });
  assert.deepEqual(cloudUsable({ ok: true, model: CLOUD_MODEL }), { ok: true, why: null });
  assert.deepEqual(cloudUsable({ ok: true, budget_left_today: 0 }), { ok: false, why: "budget_exhausted" });
  assert.deepEqual(cloudUsable({ ok: false }), { ok: false, why: "unreachable" });
  assert.deepEqual(cloudUsable(null), { ok: false, why: "unreachable" });
});

test("the Dịch button of the cloud waits for nothing: only a used-up budget stops it", () => {
  assert.equal(cloudBlocked(undefined), false);  // not checked yet
  assert.equal(cloudBlocked(null), false);       // the check failed: the job reports its own error
  assert.equal(cloudBlocked({ ok: true, model: CLOUD_MODEL, budget_left_today: 0.4 }), false);
  assert.equal(cloudBlocked({ ok: true, budget_left_today: null }), false);
  assert.equal(cloudBlocked({ ok: true, budget_left_today: 0 }), true);
});

test("cloud errors read in Vietnamese: quota, budget, model, Turnstile, network, abort", () => {
  assert.match(cloudErrorText("quota_exceeded"), /hết lượt dịch hôm nay/);
  assert.match(cloudErrorText("quota_exceeded"), /Dịch trên máy/);
  assert.match(cloudErrorText("budget_exhausted"), /hết ngân sách hôm nay/);
  assert.match(cloudErrorText("model_error"), /thử lại 2 lần/);
  // the Functions' other codes (functions/_lib): the packs changed under a job, a refused request, a misconfiguration
  assert.match(cloudErrorText("packs_changed"), /dịch lại/);
  assert.match(cloudErrorText("bad_request"), /từ chối/);
  assert.match(cloudErrorText("server_misconfigured"), /cấu hình/);
  // the page pipeline's own code when its model gives up (pipeline.js: ModelError after one retry)
  assert.match(cloudErrorText("model_failed"), /Mô hình không trả lời/);
  assert.match(cloudErrorText("output_invalid"), /không mở được/);
  assert.match(cloudErrorText("unsupported_file"), /Tệp không hợp lệ/);
  assert.match(cloudErrorText("bad_turnstile"), /Turnstile/);
  assert.match(cloudErrorText("network"), /kiểm tra mạng/);
  assert.equal(cloudErrorText("aborted"), "Đã dừng dịch.");
  assert.match(cloudErrorText("something_new"), /Có lỗi/);
});

test("the cloud's lines name the model only, short: no device, no provider (his 20:48 copy)", () => {
  assert.equal(modelName(CLOUD_MODEL), "Gemma 4 26B");
  assert.equal(modelName("gemma4:e4b"), "Gemma 4 E4B");
  assert.equal(modelQuality(CLOUD_MODEL), "");
  assert.equal(deviceWord("cloud"), "máy chủ");
  assert.equal(deviceWord("gpu"), "GPU");
  assert.equal(deviceWord("cpu"), "CPU");
  assert.equal(noticeText(CLOUD_MODEL, "cloud"), "Mô hình: Gemma 4 26B");
  assert.equal(noticeText("gemma4:e4b", "gpu"), "Mô hình: Gemma 4 E4B trên GPU · chất lượng chuẩn");
  // the review in one line; the read-back and the fast draft are no reasons on the cloud (not available there)
  const rv = reviewText({ model: CLOUD_MODEL, device: "cloud", fast: false, polish: { enabled: false },
    packs: [{ name: "Giải phẫu bệnh" }], review: { level: "careful", reasons: ["polish_off", "flagged_over_5"], flagged: 2,
      segments: 40 } });
  assert.equal(rv.line, "Mức kiểm tra khuyến nghị: kỹ (2 đoạn cần xem lại; hơn 5% số đoạn cần xem lại)");
});

test("a paragraph needs a look as in the report: ladder level 3 or more, or a flag that is not informational", () => {
  assert.equal(isFlagged(0, []), false);
  assert.equal(isFlagged(2, ["retried:tags"]), false);
  assert.equal(isFlagged(0, ["term_fix:biopsy", "glossary_miss:x", "kept_code", "kept_english", "kept_reference"]), false);
  assert.equal(isFlagged(3, []), true);
  assert.equal(isFlagged(0, ["english_left"]), true);
  assert.equal(isFlagged(1, ["suspect_output:ratio"]), true);
  assert.equal(isFlagged(0, undefined), false);
});

// ---- progress events -> page text (helper and cloud engine alike) ----

function ctx() {
  return { est: null, elapsed: "12 giây", translateLog: makeThrottle(5, 10000), polishLog: makeThrottle(5, 10000), now: 0 };
}

test("extract, classify, device and write events give the same lines for both engines", () => {
  const c = ctx();
  assert.deepEqual(eventView({ stage: "extract" }, c), { step: "extract" });
  const ex = eventView({ stage: "extract", segments: 12, words: 340, skipped: 2 }, c);
  assert.deepEqual(ex.log, ["Đọc tệp: 12 đoạn, 340 chữ (bỏ qua 2 đoạn)"]);
  const cl = eventView({ stage: "classify", offline: false, packs: [{ id: "pathology", name: "Giải phẫu bệnh", score: 0.31,
    matched: ["biopsy"], reason: "match", version: "0.1.8" }], candidates: [] }, c);
  assert.equal(cl.step, "classify");
  assert.equal(cl.packs, "Đang dùng gói thuật ngữ: Giải phẫu bệnh");
  assert.match(cl.log[0], /^Chọn gói thuật ngữ \(cosine\): Giải phẫu bệnh 0,31 ✓/);
  assert.equal(eventView({ stage: "classify", offline: true, packs: [], candidates: [] }, c).packs,
    "Không có gói thuật ngữ phù hợp với tài liệu này: thuật ngữ chuyên ngành có thể chưa chuẩn");
  const dev = eventView({ stage: "device", device: "cloud", device_name: "Cloudflare Workers AI", model: CLOUD_MODEL,
    polish: false }, c);
  assert.equal(dev.step, "device");
  assert.equal(dev.note, "Mô hình: Gemma 4 26B");
  assert.equal(dev.model, "Mô hình: Gemma 4 26B");
  assert.equal(dev.polish, "Đọc lại cho mượt: tắt");
  assert.equal(dev.eta, "");
  assert.deepEqual(dev.log, ["Mô hình: Gemma 4 26B"]);  // one short line: no device, no provider
  const est = { translate_s: 60, polish_s: 0, write_s: 10, total_s: 70, basis: "measured" };
  const helperDev = eventView({ stage: "device", device: "gpu", device_name: "RTX", model: "gemma4:e4b", polish: true,
    estimate: est }, c);
  assert.equal(helperDev.note, "Thiết bị: GPU RTX · Mô hình: Gemma 4 E4B");
  assert.equal(helperDev.est, est);
  assert.match(helperDev.eta, /^Dự kiến khoảng 1 phút/);
  assert.match(helperDev.log[1], /theo tốc độ đã đo$/);
  assert.equal(eventView({ stage: "device", device: "cpu", device_name: "i5", model: "qwen3.5:9b" }, c).log[0],
    "Thiết bị: CPU i5 · Mô hình: Qwen 3.5 9B · chất lượng chuẩn");
  const wr = eventView({ stage: "write" }, Object.assign(c, { est }));
  assert.equal(wr.step, "write");
  assert.equal(wr.bar, 86);
  assert.deepEqual(wr.log, ["Ghi tệp và định dạng…"]);
  assert.deepEqual(eventView({ stage: "session" }, c), { step: "session" });
  assert.deepEqual(eventView({ stage: "queued" }, c), {});
});

test("translate events move the bar, show counts and remaining time, and log at most every 5 % or 10 s", () => {
  const c = ctx();
  const first = eventView({ stage: "translate", done: 1, total: 40, where: "Slide 3" }, c);
  assert.equal(first.step, "translate");
  assert.equal(first.bar, 3);
  assert.equal(first.note, "Đã dịch 1/40 đoạn · 12 giây");
  assert.deepEqual(first.log, ["Dịch: 1/40 đoạn (3%) · Slide 3"]);
  const second = eventView({ stage: "translate", done: 2, total: 40, where: "Notes 3", eta_s: 200 }, Object.assign(c, { now: 1000 }));
  assert.equal(second.log, undefined);  // throttled
  assert.equal(second.eta, "Dự kiến còn khoảng 3 phút");
  const loc = eventView({ stage: "translate", done: 20, total: 40, where: "Notes 3" }, c);
  assert.deepEqual(loc.log, ["Dịch: 20/40 đoạn (50%) · Ghi chú slide 3"]);
});
