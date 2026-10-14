// "Gợi ý cho máy này" and the texts of a job, for both engines (spec Amendment F): the cloud engine (the Pages
// Functions API on this origin, default) and the helper on 127.0.0.1 ("Dịch trên máy"). Also the page's own device
// cards (device class, screen size, iOS version, WebGPU, the device named in the lab) for the case where neither
// engine answers, their cache, the texts built from the helper's /api/hardware, the progress events of either engine
// and the cloud engine's error texts. Pure functions (no DOM, no network): app.js renders them with textContent only.
import { deviceClass, APPLE_DEVICES, deviceVerdict, MIN_RAM_GB, screenCandidates, screenDecision, groupLabel,
  iosMajor } from "./lab/core.js";

export const DEVICE_KEY = "vt-lab-device";    // the device the user named (lab picker or the question here)
export const ADVICE_KEY = "vt-advice-v1";
export const ADVICE_TTL_MS = 90 * 24 * 3600 * 1000;
// download sizes (ollama list) of the models the helper may offer (spec Amendment E roles)
const MODEL_GB = { "gemma4:e4b": 6.6, "qwen3.5:9b": 6.6, "gemma4:e2b": 4.6 };
const FAST_MODEL = "gemma4:e2b";

export function vnNum(x, digits) {
  return Number(x).toFixed(digits || 0).replace(".", ",").replace(/,0+$/, "");
}
const gb = (mb) => vnNum((mb || 0) / 1024, 1) + " GB";

function platformOf(ua) {
  if (/Windows NT/.test(ua)) return "windows";
  if (/CrOS/.test(ua)) return "chromeos";
  if (/Macintosh/.test(ua)) return "mac";
  if (/Linux|X11/.test(ua)) return "linux";
  return "other";
}

const LAB = "Phòng đo";

// The device of the larger-RAM side that tells the most (smallest RAM above the line) or of the smaller side
// (largest RAM under it): stored as the declared device when the user answers the two-way question.
export function answerDevice(cands) {
  if (!cands.length) return null;
  const ok = cands[0].ram >= MIN_RAM_GB;
  let best = cands[0];
  for (const c of cands) if (ok ? c.ram < best.ram : c.ram > best.ram) best = c;
  return best.device;
}

function ramText(cands) {
  const lo = Math.min(...cands.map((c) => c.ram)), hi = Math.max(...cands.map((c) => c.ram));
  return lo === hi ? lo + " GB" : lo + "–" + hi + " GB";
}

// env: { ua, touchPoints, screen: {w, h, dpr}, webgpu: {available, adapter, limits, features} | null,
//        deviceMemory, declared (APPLE_DEVICES name | null), unfit ({model: record} from the lab's memory probe) }
// -> { kind, title, line, detail, link (show the lab link), ask: {question, options: [{label, device}]} | null }
export function adviseBrowser(env) {
  const ua = env.ua || "";
  const cls = deviceClass(ua, env.touchPoints || 0);
  const gpu = env.webgpu || null;
  const out = (kind, title, line, detail, link, ask) => ({ kind, title, line, detail: detail || "", link: !!link,
    ask: ask || null });
  if (cls === "desktop") {
    const plat = platformOf(ua);
    if (plat === "windows") {
      return out("desktop-windows", "Máy tính Windows",
        "Nên cài bộ dịch ViTranslate: Gemma 4 E4B (máy có GPU) hoặc Qwen 3.5 9B (chỉ CPU) chạy ngay trên máy này, "
        + "tài liệu không rời máy.",
        "Bộ cài đang được hoàn thiện; hiện có thể chạy bộ dịch từ mã nguồn hoặc liên hệ người phát triển.", false);
    }
    const title = { mac: "Máy Mac", linux: "Máy Linux", chromeos: "Chromebook" }[plat] || "Máy tính";
    return out("desktop-other", title,
      "Bản dịch ngay trong trình duyệt (không cần cài) đang được phát triển cho máy này.",
      gpu && gpu.available ? "Trình duyệt có WebGPU: có thể đo thử máy ở " + LAB + "."
        : "Trình duyệt này chưa có WebGPU.", true);
  }
  if (cls === "Android phone" || cls === "Android tablet") {
    return out("android", "Thiết bị Android",
      "Dịch trong trình duyệt trên Android đang thử nghiệm, chưa đo (cần Chrome bản mới, RAM từ 12 GB).",
      env.deviceMemory ? "Trình duyệt báo RAM khoảng " + env.deviceMemory + " GB (con số này tối đa là 8)." : "", true);
  }
  const os = cls === "iPad" ? "iPadOS" : "iOS";
  const major = iosMajor(ua);
  const later = "Bản dịch ngay trong trình duyệt đang được phát triển; có thể đo thử máy ở " + LAB + ".";
  const noGpu = gpu && gpu.available ? "" : " Hãy mở trang bằng Safari (cần WebGPU).";
  if (major !== null && major < 26) {
    return out("mobile-update", cls, "Cần " + os + " 26 trở lên để dịch ngay trong trình duyệt (máy đang chạy " + os
      + " " + major + ").", "", true);
  }
  if (env.unfit && Object.keys(env.unfit).length) {
    return out("mobile-below", cls, "Máy này chưa đủ cấu hình: lần đo bộ nhớ trước ở " + LAB + " không đạt.",
      "Hãy dịch trên máy tính Windows có cài bộ dịch.", true);
  }
  const declared = APPLE_DEVICES.find((d) => d.name === env.declared);
  if (declared) {
    const v = deviceVerdict(declared);
    return v.ok
      ? out("mobile-ok", cls, "Đạt yêu cầu tối thiểu: " + declared.name + " có RAM " + v.ramText + " (mốc "
        + MIN_RAM_GB + " GB).", later + noGpu, true)
      : out("mobile-below", cls, "Chưa đạt yêu cầu tối thiểu: " + declared.name + " có RAM " + v.ramText + ", cần từ "
        + MIN_RAM_GB + " GB.", "Hãy dịch trên máy tính Windows có cài bộ dịch. Không đúng đời máy? Chọn lại ở "
        + LAB + ".", true);
  }
  const s = env.screen || {};
  const d = screenDecision(screenCandidates(cls, s.w, s.h, s.dpr));
  if (d.state === "ok") {
    return out("mobile-ok", cls, "Đạt yêu cầu tối thiểu: " + groupLabel(d.ok) + " có RAM từ "
      + Math.min(...d.ok.map((c) => c.ram)) + " GB (mốc " + MIN_RAM_GB + " GB).", later + noGpu, true);
  }
  if (d.state === "below") {
    return out("mobile-below", cls, "Chưa đạt yêu cầu tối thiểu: " + groupLabel(d.below) + " có RAM "
      + ramText(d.below) + ", cần từ " + MIN_RAM_GB + " GB.",
      "Hãy dịch trên máy tính Windows có cài bộ dịch. Không đúng đời máy? Chọn lại ở " + LAB + ".", true);
  }
  if (d.state === "ask") {
    const a = { label: groupLabel(d.below), device: answerDevice(d.below) };
    const b = { label: groupLabel(d.ok), device: answerDevice(d.ok) };
    return out("mobile-ask", cls, "Máy bạn là " + a.label + " hay " + b.label + "?",
      "Cùng kích thước màn hình nhưng RAM khác nhau (mốc " + MIN_RAM_GB + " GB).", false,
      { question: "Máy bạn là " + a.label + " hay " + b.label + "?", options: [a, b] });
  }
  return out("mobile-unknown", cls, "Chưa nhận ra đời máy này.",
    "Chọn đời máy ở " + LAB + " để so với mốc RAM " + MIN_RAM_GB + " GB.", true);
}

// ---- cache (localStorage) ----
// cheap: known at once (user agent, class, screen, declared device, failed probes) -> the cached card shows instantly;
// full: cheap + the WebGPU adapter (async): a different GPU recomputes the card and rewrites the cache.
export function cheapFingerprint(env) {
  const s = env.screen || {};
  return JSON.stringify(["v1", env.ua || "", deviceClass(env.ua || "", env.touchPoints || 0), s.w || 0, s.h || 0,
    s.dpr || 0, env.declared || "", Object.keys(env.unfit || {}).sort()]);
}

export function fullFingerprint(env) {
  const g = env.webgpu;
  const a = (g && g.adapter) || {}, l = (g && g.limits) || {};
  return JSON.stringify([cheapFingerprint(env), g ? [!!g.available, a.vendor || "", a.architecture || "",
    a.description || "", l.maxBufferSize || 0, l.maxStorageBufferBindingSize || 0,
    (g.features || []).includes("shader-f16")] : null]);
}

export function readAdviceCache(store, cheap, now) {
  try {
    const rec = JSON.parse(store.getItem(ADVICE_KEY) || "null");
    if (!rec || rec.cheap !== cheap || typeof rec.at !== "number" || now - rec.at > ADVICE_TTL_MS || now < rec.at) {
      return null;
    }
    return rec.advice ? { advice: rec.advice, fp: rec.fp } : null;
  } catch (e) {
    return null;
  }
}

export function writeAdviceCache(store, cheap, fp, advice, now) {
  try { store.setItem(ADVICE_KEY, JSON.stringify({ cheap, fp, at: now, advice })); } catch (e) { /* blocked */ }
}

export function clearAdviceCache(store) {
  try { store.removeItem(ADVICE_KEY); } catch (e) { /* blocked */ }
}

// ---- engines: the cloud engine by default, the helper only in the local mode the user picks ("Dịch trên máy") ----

export const ENGINE_KEY = "vitranslate-engine-v1";          // "local" | "cloud": the "Dịch trên máy" switch, remembered
export const CLOUD_CONSENT_KEY = "vitranslate-cloud-consent-v1";
export const CLOUD_MODEL = "@cf/google/gemma-4-26b-a4b-it";  // spec Amendment F; /api/v1/status names the one in use

/** The cloud engine can take jobs: its /api/v1/status answered ok and today's budget is not used up. */
export function cloudUsable(status) {
  if (!status || status.ok !== true) return { ok: false, why: "unreachable" };
  if (typeof status.budget_left_today === "number" && status.budget_left_today <= 0) {
    return { ok: false, why: "budget_exhausted" };
  }
  return { ok: true, why: null };
}

/** The "Dịch" button of the cloud waits for nothing (not the helper, not /api/v1/status: undefined while it is being
 * asked, null when it failed and the job will report its own error): only an answer that today's budget is used up
 * stops it. */
export function cloudBlocked(status) {
  return cloudUsable(status).why === "budget_exhausted";
}

/** The local mode ("Dịch trên máy") is on: the switch as the user left it (pref = ENGINE_KEY), on by default on the
 * helper's own page (helperPage: 127.0.0.1, no cloud API there). Only the local mode looks for the helper: a public
 * page reaching 127.0.0.1 makes Chrome ask for Local Network Access, a prompt cloud users must never see. */
export function localMode(pref, helperPage) {
  return helperPage ? pref !== "cloud" : pref === "local";
}

/** Which engine translates: the cloud, unless the local mode is on; then the helper when it answers, else none (the
 * private mode never falls back to the cloud). s: { local (localMode), helper (a helper answered) }. */
export function chooseEngine(s) {
  if (!s.local) return "cloud";
  return s.helper ? "helper" : null;
}

const CLOUD_ERRORS = {
  unreachable: "Máy chủ dịch chưa trả lời. Hãy kiểm tra mạng rồi thử lại.",
  network: "Không kết nối được máy chủ dịch. Hãy kiểm tra mạng rồi thử lại.",
  server_error: "Máy chủ dịch gặp lỗi. Hãy thử lại sau ít phút.",
  bad_response: "Máy chủ dịch trả lời không đúng dạng. Hãy thử lại sau ít phút.",
  model_error: "Mô hình trên máy chủ không trả lời được (đã thử lại 2 lần). Hãy thử lại sau ít phút.",
  model_failed: "Mô hình không trả lời được dù đã thử lại. Hãy thử lại sau ít phút.",
  quota_exceeded: "Đã hết lượt dịch hôm nay. Hãy thử lại vào ngày mai, hoặc dùng Dịch trên máy.",
  budget_exhausted: "Máy chủ dịch đã dùng hết ngân sách hôm nay. Hãy thử lại vào ngày mai, hoặc dùng Dịch trên máy.",
  bad_turnstile: "Không xác minh được trình duyệt (Turnstile). Hãy tải lại trang rồi thử lại.",
  turnstile: "Không tải được bước xác minh Turnstile (bị chặn hoặc mất mạng). Hãy tải lại trang rồi thử lại.",
  session_expired: "Phiên làm việc đã hết hạn. Hãy thử lại.",
  packs_changed: "Bộ thuật ngữ trên máy chủ vừa được cập nhật trong lúc dịch. Hãy dịch lại tệp này.",
  bad_request: "Máy chủ từ chối yêu cầu (dữ liệu gửi lên không đúng dạng). Hãy tải lại trang rồi thử lại.",
  server_misconfigured: "Máy chủ dịch chưa được cấu hình xong. Hãy thử lại sau.",
  no_session: "Chưa xác minh trình duyệt (Turnstile). Hãy thử lại.",
  declined: "Chưa dịch: bạn chưa đồng ý gửi tài liệu lên máy chủ.",
  aborted: "Đã dừng dịch.",
  unsupported_file: "Tệp không hợp lệ (sai định dạng, bị khóa mật khẩu hoặc hỏng).",
  output_invalid: "Bản dịch ghi ra không mở được nên đã bỏ; xem báo cáo.",
  engine_missing: "Trang này chưa có bộ dịch tài liệu cho máy chủ.",
  internal: "Lỗi nội bộ khi dịch.",
};

/** A cloud-engine error code -> the Vietnamese text of the page. */
export function cloudErrorText(code) {
  return CLOUD_ERRORS[code] || "Có lỗi khi dịch trên máy chủ.";
}

// ---- helper (/api/hardware) ----

export function modelName(model) {
  const q = /^qwen(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)b$/i.exec(model || "");
  if (q) return "Qwen " + q[1] + " " + q[2] + "B";
  const c = /^@cf\/google\/gemma-(\d+)-(\d+)b-a(\d+)b(?:-it)?$/i.exec(model || "");
  if (c) return "Gemma " + c[1] + " " + c[2] + "B";  // the cloud model, short: "Gemma 4 26B"
  const g = /^gemma(\d+):e(\d+)b$/i.exec(model || "");
  return g ? "Gemma " + g[1] + " E" + g[2] + "B" : (model || "?");
}

// the fast draft (Gemma 4 E2B; Qwen 3.5 4B in reports made before spec Amendment E)
function isFast(model) {
  return model === FAST_MODEL || /^qwen[\d.]+:4b$/i.test(model || "");
}

const isCloudModel = (model) => /^@cf\//.test(model || "");

// "" for the cloud model: its lines name the model only
export function modelQuality(model) {
  if (isCloudModel(model)) return "";
  return isFast(model) ? "bản nháp nhanh, chất lượng thấp hơn, cần duyệt kỹ" : "chất lượng chuẩn";
}

// "Gemma 4 E4B", "Qwen 3.5 9B", "Bản nháp nhanh Gemma 4 E2B"
function modelLabel(model) {
  return (isFast(model) ? "Bản nháp nhanh " : "") + modelName(model);
}

// "GPU", "CPU" or "máy chủ" for the cloud engine (device "cloud")
export function deviceWord(device) {
  return device === "gpu" ? "GPU" : device === "cloud" ? "máy chủ" : "CPU";
}

export function durationText(s) {
  if (s < 60) return Math.round(s) + " giây";
  if (s < 600) return vnNum(s / 60, 1) + " phút";
  if (s < 3600) return Math.round(s / 60) + " phút";
  return vnNum(s / 3600, 1) + " giờ";
}

export function setupLine(profile, rec) {
  const p = profile || {}, g = p.gpu_now || {}, cpu = p.cpu || {}, ram = p.ram || {};
  const model = modelLabel(rec.model);
  if (rec.device === "gpu") return "GPU " + g.name + " (trống " + gb(g.free_mb) + ") → " + model + " trên GPU";
  const bits = [];
  if (cpu.cores) bits.push(cpu.cores + " nhân");
  if (ram.total_mb) bits.push("RAM " + Math.round(ram.total_mb / 1024) + " GB");
  return "CPU " + (cpu.model || "") + (bits.length ? " (" + bits.join(", ") + ")" : "") + " → " + model + " trên CPU";
}

// a reason of the recommendation in Vietnamese; model = the recommended model
function reasonText(r, model) {
  switch (r && r.code) {
    case "gpu_ok": return "Có GPU đủ bộ nhớ (cần ~9 GB trống) nên dịch bằng " + modelName(model)
      + " trên GPU và bật đọc lại cho mượt.";
    case "gpu_busy": return "GPU " + r.name + " đang bận (chương trình khác dùng " + gb(r.foreign_mb)
      + ") nên tạm dịch bằng CPU; tắt đọc lại cho đỡ thời gian.";
    case "gpu_small": return "GPU " + r.name + " chỉ có " + gb(r.total_mb)
      + ", chưa đủ ~9 GB trống để dịch trên GPU nên dịch bằng CPU.";
    case "no_gpu": return "Không có GPU NVIDIA đủ bộ nhớ nên dịch bằng CPU; tắt đọc lại cho đỡ thời gian.";
    case "ram_low": return "RAM " + gb(r.ram_mb) + " chưa đủ cho mô hình 9B: dùng bản nháp nhanh " + modelName(model) + ".";
    case "cpu_slow": return "CPU dịch chậm (~" + durationText(r.seconds_per_a4_page)
      + " / trang A4 với 9B): gợi ý bản nháp nhanh " + modelName(model) + ".";
    default: return "";
  }
}

const CAL_STATUS = {
  running: "Đang đo tốc độ máy (một bản dịch ngắn)…",
  missing: "Sắp đo tốc độ máy (vài giây)…",
  error: "Chưa đo được tốc độ máy; đang dùng số ước tính.",
};
const CAL_WAIT = {
  job: "Sẽ đo tốc độ máy sau khi dịch xong.",
  gpu_busy: "Sẽ đo tốc độ khi GPU rảnh (đang có chương trình khác dùng GPU).",
  ollama: "Chưa đo được tốc độ: Ollama chưa chạy.",
  model_missing: "Chưa đo được tốc độ: chưa có mô hình dịch mặc định.",
};

// /api/hardware -> { kind: "helper", title, line, estimate, detail, status, pull: {text, disabled} | null }
export function helperAdvice(hw) {
  const rec = hw.recommendation, est = rec.estimates || {};
  const reasons = rec.reasons || [];
  const fastWhy = reasons.find((r) => r.code === "ram_low" || r.code === "cpu_slow");
  const cal = hw.calibration || {};
  let status = "";
  if (cal.state === "waiting") status = CAL_WAIT[cal.reason] || "";
  else if (cal.state !== "done") status = CAL_STATUS[cal.state] || "";
  let pull = null;
  // the download state of the recommended model only (an earlier download of another model does not count)
  const p = hw.pull && hw.pull.model === rec.model ? hw.pull : {};
  if (rec.needs_download && p.state !== "done") {
    const name = modelName(rec.model);
    const size = MODEL_GB[rec.model];
    pull = p.state === "running" ? { text: "Đang tải " + name + "…", disabled: true }
      : p.state === "error" ? { text: "Tải " + name + " bị lỗi, bấm để thử lại", disabled: false }
        : { text: "Cho phép tải " + name + (size ? " (~" + vnNum(size, 1) + " GB)" : ""), disabled: false };
  }
  return {
    kind: "helper", title: "Bộ dịch trên máy này", line: setupLine(hw.profile, rec),
    estimate: "Ước tính ~" + durationText(est.seconds_per_a4_page) + " / trang A4 · ~" + durationText(est.seconds_per_slide)
      + " / slide · đọc lại cho mượt: " + (est.polish ? "bật" : "tắt")
      + (est.basis === "measured" ? " (đã đo trên máy này)" : " (ước tính sơ bộ)"),
    detail: [reasonText(reasons[0], rec.model), fastWhy && fastWhy !== reasons[0] ? reasonText(fastWhy, rec.model) : ""]
      .filter(Boolean).join(" "),
    status, pull,
  };
}

// ---- job progress ----

export function etaText(seconds, refined) {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return "";
  if (seconds < 60) return refined ? "Dự kiến còn dưới 1 phút" : "Dự kiến dưới 1 phút";
  return (refined ? "Dự kiến còn khoảng " : "Dự kiến khoảng ") + Math.round(seconds / 60) + " phút";
}

// Whole-job percentage: the stages weighted by their estimated seconds (translate / read-back / write).
export function overallPercent(est, stage, done, total) {
  const frac = total ? Math.min(1, Math.max(0, done / total)) : 0;
  if (stage === "done" || stage === "finished") return 100;
  const T = est ? est.translate_s || 0 : 0, P = est ? est.polish_s || 0 : 0, W = est ? est.write_s || 0 : 0;
  if (!est || T + P + W <= 0) return stage === "translate" || stage === "polish" ? Math.round(100 * frac) : 0;
  const at = { translate: T * frac, polish: T + P * frac, write: T + P }[stage];
  return at === undefined ? 0 : Math.min(100, Math.round(100 * at / (T + P + W)));
}

// A progress line every stepPct percent or every ms milliseconds (and always the first and the last).
export function makeThrottle(stepPct, ms) {
  let lastPct = null, lastT = 0;
  return (pct, now) => {
    if (lastPct === null || pct >= 100 || pct - lastPct >= stepPct || now - lastT >= ms) {
      lastPct = pct;
      lastT = now;
      return true;
    }
    return false;
  };
}

const REASON_MARK = { parent: " (gói cha)", user: " (bạn chọn)" };
const score = (x) => Number(x || 0).toFixed(2).replace(".", ",");

// classify event -> "Chọn gói thuật ngữ (cosine): A 0,30 ✓ · B 0,01 — khớp: x, y"
export function packsLine(ev) {
  const sel = ev.packs || [], cand = ev.candidates || [];
  const parts = sel.map((p) => p.name + " " + score(p.score) + " ✓" + (REASON_MARK[p.reason] || ""))
    .concat(cand.map((c) => c.name + " " + score(c.score)));
  const matched = [...new Set(sel.flatMap((p) => p.matched || []))].slice(0, 5);
  return "Chọn gói thuật ngữ (cosine): " + (sel.length ? "" : "không có gói phù hợp" + (parts.length ? " · " : ""))
    + parts.join(" · ") + (matched.length ? " — khớp: " + matched.join(", ") : "");
}

export const NO_PACK = "Không có gói thuật ngữ phù hợp với tài liệu này: thuật ngữ chuyên ngành có thể chưa chuẩn";

const LOCATIONS = [
  [/^Body$/, () => "Thân văn bản"], [/^Notes\s*(\d*)$/, (n) => "Ghi chú slide" + (n ? " " + n : "")],
  [/^Header\s*(\d*)$/, (n) => "Đầu trang" + (n ? " " + n : "")], [/^Footer\s*(\d*)$/, (n) => "Chân trang" + (n ? " " + n : "")],
  [/^Footnotes$/, () => "Chú thích cuối trang"], [/^Endnotes$/, () => "Chú thích cuối văn bản"],
  [/^Comments$/, () => "Nhận xét"], [/^Chart\s*(\d*)$/, (n) => "Biểu đồ" + (n ? " " + n : "")],
  [/^Layout\s*(\d*)$/, (n) => "Bố cục" + (n ? " " + n : "")], [/^Master\s*(\d*)$/, (n) => "Trang mẫu" + (n ? " " + n : "")],
];

export function locLabel(where) {
  for (const [rx, fn] of LOCATIONS) {
    const m = rx.exec(where);
    if (m) return fn(m[1]);
  }
  return where; // "Slide N", "SmartArt N" and anything unknown stay as they are
}

export function packsNames(info) {
  return (info.packs || []).map((p) => p.name).filter(Boolean);
}

// info: a report or a "classify" progress event; both carry packs [{name, matched}]
export function packsLineShort(info) {
  const packs = info.packs || [];
  if (!packs.length) return "Không dùng gói thuật ngữ nào";
  return packs.map((p) => "Gói thuật ngữ: " + p.name +
    ((p.matched || []).length ? " (khớp: " + p.matched.slice(0, 3).join(", ") + ")" : "")).join(" · ");
}

/** The quality-notice line of the progress card: "Mô hình: Gemma 4 E4B trên GPU · chất lượng chuẩn"; the cloud:
 * "Mô hình: Gemma 4 26B". */
export function noticeText(model, device) {
  const q = modelQuality(model);
  return "Mô hình: " + modelName(model) + (device && device !== "cloud" ? " trên " + deviceWord(device) : "")
    + (q ? " · " + q : "");
}

export function estimateLine(est) {
  return etaText(est.total_s, false) + " (dịch ~" + durationText(est.translate_s)
    + (est.polish_s ? ", đọc lại ~" + durationText(est.polish_s) : "") + ")";
}

const STEP_KEYS = new Set(["session", "extract", "classify", "device", "translate", "polish", "write", "done"]);

/**
 * One progress event of either engine (the helper's job events or the page pipeline's onProgress) -> what the page
 * shows: { step, bar, note, eta, packs, model, polish, est, log: [lines] } (only the keys the event changes).
 * c: { est (the job's estimate or null), elapsed (text), translateLog / polishLog (makeThrottle), now (ms) }.
 */
export function eventView(ev, c) {
  const stage = ev.stage;
  if (stage === "extract") {
    if (ev.segments === undefined) return { step: "extract" };
    return { log: ["Đọc tệp: " + ev.segments + " đoạn, " + ev.words + " chữ"
      + (ev.skipped ? " (bỏ qua " + ev.skipped + " đoạn)" : "")] };
  }
  if (stage === "translate" || stage === "polish") {
    const pct = Math.round(100 * ev.done / Math.max(ev.total, 1));
    const overall = overallPercent(c.est, stage, ev.done, ev.total);
    const v = { step: stage, bar: overall,
      note: (stage === "translate" ? "Đã dịch " + ev.done + "/" + ev.total + " đoạn"
        : "Đã đọc lại " + ev.done + "/" + ev.total + " nhóm (slide / đoạn)") + " · " + c.elapsed
        + (c.est ? " · " + overall + "% toàn bộ" : "") };
    if (ev.eta_s !== undefined) v.eta = etaText(ev.eta_s, true);
    if (stage === "translate" && c.translateLog(pct, c.now)) {
      v.log = ["Dịch: " + ev.done + "/" + ev.total + " đoạn (" + pct + "%)" + (ev.where ? " · " + locLabel(ev.where) : "")];
    } else if (stage === "polish" && c.polishLog(pct, c.now)) {
      v.log = ["Đọc lại cho mượt: " + ev.done + "/" + ev.total + " nhóm (" + pct + "%)"];
    }
    return v;
  }
  if (stage === "classify") {
    const names = packsNames(ev);
    const off = ev.offline ? " (ngoại tuyến)" : "";
    return { step: "classify", note: packsLineShort(ev) + off,
      packs: names.length ? "Đang dùng gói thuật ngữ: " + names.join(", ") : NO_PACK, log: [packsLine(ev) + off] };
  }
  if (stage === "device") {
    const name = modelName(ev.model);
    const where = ev.device === "gpu" ? "GPU " + ev.device_name : "CPU";
    // the cloud: one short line with the model (no device to name)
    const v = ev.device === "cloud"
      ? { step: "device", note: "Mô hình: " + name, model: noticeText(ev.model, "cloud"), log: ["Mô hình: " + name] }
      : { step: "device", note: "Thiết bị: " + where + " · Mô hình: " + name, model: noticeText(ev.model, ev.device),
        log: ["Thiết bị: " + (ev.device === "gpu" ? where : "CPU " + ev.device_name) + " · Mô hình: " + name + " · "
          + modelQuality(ev.model)] };
    if (ev.polish !== undefined) v.polish = "Đọc lại cho mượt: " + (ev.polish ? "bật" : "tắt");
    if (ev.estimate) {
      v.est = ev.estimate;
      v.eta = estimateLine(ev.estimate);
      v.log.push(estimateLine(ev.estimate) + (ev.estimate.basis === "measured" ? ", theo tốc độ đã đo" : ", ước tính sơ bộ"));
    } else {
      v.eta = "";
    }
    return v;
  }
  if (stage === "write") {
    return { step: "write", bar: overallPercent(c.est, "write", 0, 0) || 95, log: ["Ghi tệp và định dạng…"] };
  }
  return STEP_KEYS.has(stage) ? { step: stage } : {};
}

// Informational flags never put a segment on the "Đoạn cần xem lại" list (helper report.py INFO_KINDS).
const INFO_KINDS = new Set(["term_fix", "glossary_miss", "kept_code", "kept_english", "kept_reference", "retried",
  "polish_rejected"]);

/** A segment needs a look (the report's rule): ladder level 3 or more, or a flag that is not informational. */
export function isFlagged(level, flags) {
  return (level || 0) >= 3 || (flags || []).some((f) => !INFO_KINDS.has(String(f).split(":", 1)[0]));
}

const LEVELS = { moderate: "vừa phải", careful: "kỹ", thorough: "thật kỹ" };
const REVIEW_REASONS = {
  fast_draft: "dùng bản nháp nhanh Gemma 4 E2B", flagged_over_15: "hơn 15% số đoạn cần xem lại",
  warning_flags: "còn đoạn sót tiếng Anh, thiếu ý, hỏng thẻ, mất viết tắt hoặc đáng ngờ",
  no_pack: "không có gói thuật ngữ phù hợp", polish_off: "không đọc lại cho mượt",
  flagged_over_5: "hơn 5% số đoạn cần xem lại",
};

// the cloud has no read-back pass and no fast draft: not reasons the user could act on there
const LOCAL_REASONS = new Set(["polish_off", "fast_draft"]);

// report -> { line, level }: the recommended review level with its reasons in one line, for the result card and the
// last log line (null for a report without a review); the model and the packs have their own lines
export function reviewText(rep) {
  const r = rep && rep.review;
  if (!r) return null;
  const why = (r.reasons || []).filter((c) => !(rep.device === "cloud" && LOCAL_REASONS.has(c)))
    .map((c) => REVIEW_REASONS[c] || c);
  return { line: "Mức kiểm tra khuyến nghị: " + (LEVELS[r.level] || r.level) + " (" + r.flagged + " đoạn cần xem lại"
    + (why.length ? "; " + why.join("; ") : "") + ")", level: r.level };
}
