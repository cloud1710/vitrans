"use strict";
// The page: two engines (spec Amendment F). The cloud engine is the default: the page reads and writes the document
// itself (engine/pipeline.js on the OOXML layer) and sends only the segments to the Pages Functions API on this
// origin (/api/v1/, web/cloud.js) after the first-use consent and a Cloudflare Turnstile check. The small "Dịch trên
// máy" switch turns on the local mode (private / offline: jobs on the helper on 127.0.0.1, events over SSE): only
// that mode looks for the helper, since a public page reaching 127.0.0.1 makes Chrome ask for Local Network Access,
// and only that mode shows the helper's cards and wording. The cloud view waits for nothing: "Dịch" works as soon as
// there is something to translate. Both engines feed the same progress view (advice.js eventView), report view and
// log. Two modes (his order of 20:22: text first, then files): "Văn bản" sends pasted paragraphs to the cloud engine
// and shows the Vietnamese paragraph by paragraph (cloud only: the helper has no text endpoint); "Tệp" translates a
// .docx / .pptx with either engine.
import { helperAdvice, modelName, makeThrottle, reviewText, eventView, noticeText, packsLineShort, locLabel, deviceWord,
  chooseEngine, localMode, cloudBlocked, cloudUsable, cloudErrorText, isFlagged, CLOUD_MODEL, ENGINE_KEY,
  CLOUD_CONSENT_KEY } from "./advice.js";
import { createCloud, cloudJob, BATCH_SIZE, CONCURRENCY } from "./cloud.js";
import { textSegments, textOutput, countText } from "./text.js";
import { runBrowserJob, errorCode, loadEngine } from "./engine/browser_job.js";

const PORTS = [47831, 47832, 47833, 47834, 47835];
// the page served by the helper itself (http://127.0.0.1:<port>/): the local mode by default, no permission prompt
const HELPER_PAGE = ["127.0.0.1", "localhost"].includes(location.hostname) && PORTS.includes(Number(location.port));
const STAGES = [
  ["extract", "Đọc tệp"], ["classify", "Chọn gói thuật ngữ"], ["device", "Chọn thiết bị"],
  ["translate", "Dịch"], ["polish", "Đọc lại cho mượt"], ["write", "Ghi tệp và định dạng"], ["done", "Hoàn tất"],
];
// the cloud engine first checks the browser (Turnstile) for a session; no device to choose, no read-back pass
const CLOUD_STAGES = [["session", "Xác minh trình duyệt"]].concat(STAGES.filter(([k]) => k !== "polish" && k !== "device"));
const TEXT_STAGES = [["session", "Xác minh trình duyệt"], ["classify", "Chọn gói thuật ngữ"], ["translate", "Dịch"],
  ["done", "Hoàn tất"]];
const TEXT_LOCAL_NOTE = "Dịch văn bản chỉ chạy trên máy chủ. Văn bản riêng tư: hãy lưu thành tệp .docx rồi dịch ở mục "
  + "Tệp, hoặc bỏ chọn Dịch trên máy.";
const LEVELS = ["Chuẩn", "Tự sửa thẻ", "Dịch lại", "Giảm thẻ", "Gắn lại định dạng", "Gộp định dạng"];
const FLAGS = {
  english_left: "Còn tiếng Anh", numbers_changed: "Số liệu khác bản gốc",
  formatting_lost: "Mất một phần định dạng", suspicious: "Từ lạ", glossary_miss: "Chưa dùng thuật ngữ glossary",
  term_fix: "Đã sửa thuật ngữ", stray_markup: "Còn thẻ lạ trong bản dịch",
  locked_text: "Chữ trong field / mục lục / ô nội dung chưa dịch", apply: "Đã sửa placeholder khi ghi",
  unchanged: "Còn nguyên bản gốc (cần xem lại)",
  tags_broken: "Thẻ định dạng hỏng", empty_output: "Mô hình trả về rỗng, giữ nguyên bản gốc",
  suspect_output: "Bản dịch đáng ngờ", kept_code: "Giữ nguyên (mã/ký hiệu)", kept_english: "Giữ tiếng Anh",
  kept_reference: "Giữ nguyên (trích dẫn tài liệu)",
  retried: "Đã dịch lại", acronym_lost: "Mất từ viết tắt / mã so với bản gốc",
  omitted: "Có thể bỏ sót một vế so với bản gốc",
  polish_rejected: "Giữ bản dịch đầu (bản đọc lại bị loại)",
};
// flag values shown in Vietnamese (anything else is shown as it is)
const FLAG_VALUES = {
  suspect_output: { ratio: "độ dài bất thường", script: "chữ lạ", scaffold: "lẫn hướng dẫn", markdown: "markdown",
    angle: "dấu < >", latex: "còn ký hiệu LaTeX ($…$, \\beta…)" },
  retried: { tags: "thẻ hỏng", empty: "trả về rỗng", english: "còn tiếng Anh", gate: "bản dịch đáng ngờ" },
  polish_rejected: { numbering: "thiếu dòng trong câu trả lời", error: "lỗi gọi mô hình", empty: "trả về rỗng",
    tags: "thẻ định dạng", scaffold: "lẫn hướng dẫn", script: "chữ lạ", angle: "dấu < >", markdown: "markdown",
    latex: "thêm ký hiệu LaTeX",
    numbers: "số liệu khác", acronym: "mất từ viết tắt / mã", units: "đơn vị khác", glossary: "bỏ thuật ngữ glossary",
    dropped: "bỏ mất chữ mang nghĩa",
    ratio: "độ dài bất thường", english: "còn tiếng Anh", suspicious: "từ lạ",
    symbols: "mất ký hiệu chú thích (*, †, [1]...)", term_weakened: "làm nhẹ thuật ngữ ác tính (ung thư thành u)",
    anatomy: "thêm vị trí giải phẫu bản gốc không có", repeat: "lặp lại cụm từ" },
};
const SKIPS = { references: "đoạn tài liệu tham khảo (giữ nguyên)",
  "tracked changes": "đoạn có theo dõi thay đổi (hãy chấp nhận hoặc từ chối thay đổi rồi dịch lại)",
  "locked text: field or content control": "đoạn chỉ có chữ trong field hoặc mục lục (giữ nguyên, cần dịch tay)",
  non_latin: "đoạn không phải tiếng Anh (chữ Trung, Thái...; giữ nguyên)" };
const ERRORS = { pdf_phase2: "PDF sẽ được hỗ trợ ở phiên bản sau.", unsupported_type: "Chỉ nhận tệp .docx hoặc .pptx.",
  too_large: "Tệp quá lớn (tối đa 200 MB).", cannot_store: "Bộ dịch không lưu được tệp này (tên hoặc đường dẫn quá dài?).",
  forbidden_origin: "Trang này không được phép gọi bộ dịch trên máy.", bad_options: "Tùy chọn dịch không hợp lệ.",
  bad_domain: "Tên gói thuật ngữ không hợp lệ." };
// error event codes sent by the helper, shown in Vietnamese; the raw message goes into a small "Chi tiết" line
const JOB_ERRORS = {
  unsupported_file: "Tệp không hợp lệ (sai định dạng, bị khóa mật khẩu hoặc hỏng).",
  ollama_unavailable: "Không gọi được Ollama trên máy. Hãy mở Ollama rồi thử lại.",
  output_invalid: "Bản dịch ghi ra không mở được nên đã bỏ; xem báo cáo.",
  internal: "Lỗi nội bộ của bộ dịch.",
};
const POLL_MS = 5000;
const HW_POLL_MS = 3000;
const CHECKING = "Đang kiểm tra cấu hình phù hợp…";
const LNA_HINT_MS = 2500;  // the helper answers in milliseconds; a longer wait is the browser's permission prompt
const CLOUD_DEVICE = { kind: "cloud", name: "Cloudflare Workers AI" };
// Cloudflare Turnstile: the site's widget (vitrans.pages.dev, managed; public key) everywhere but on 127.0.0.1 /
// localhost, where the always-pass test key keeps the local test runs offline
const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_TEST_KEY = "1x00000000000000000000AA";
const TURNSTILE_SITE_KEY = "0x4AAAAAAFWpPjhZYuN91QqX";

function turnstileSiteKey() {
  if (["127.0.0.1", "localhost"].includes(location.hostname)) return TURNSTILE_TEST_KEY;
  return TURNSTILE_SITE_KEY;
}

let API = "";
let health = null;
let currentJob = null;
let polishTouched = false; // the user changed "Đọc lại cho mượt": keep the choice
let fastTouched = false;   // the user changed "Bản nháp nhanh": keep the choice
let jobStages = STAGES;
let hardware = null;       // last /api/hardware answer (helper engine)
let hwTimer = null;
let calRequested = false;
let lastSetup = "", lastCal = "", lastCard = "";
let askOptions = [];
let engine = null;         // "cloud" | "helper" | null (the local mode without a helper)
let local = false;         // the local mode ("Dịch trên máy"): the switch, remembered under ENGINE_KEY
let refreshSeq = 0;        // the newest refreshStatus(): an older one that comes back late changes nothing
let consented = false;     // the first-use consent was given in this tab (also when the browser cannot store it)
let cloudStatus;           // last GET /api/v1/status answer (undefined: not asked yet; null: not reachable)
let engineMod;             // undefined: not looked for yet; null: this page has no page pipeline
let running = false;       // a cloud job is running in this tab
let wakeLock = null;
let resultUrl = null;      // Blob URL of the last cloud result
let tsReady = null;        // Promise of the loaded Turnstile API
let tsWidget = null;       // Turnstile widget id
let tsWaiter = null;       // { resolve, reject } of the token being waited for
let mode = "text";         // "text" (pasted paragraphs, cloud only) | "file" (.docx / .pptx)
let textJob = null;        // { t: textSegments(), results } of the last text translation (the copy button)
const cloud = createCloud();
const $ = (id) => document.getElementById(id);

function store(key, value) {
  try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); }
  catch (e) { return null; }
  return null;
}

// ---- progress log (terminal-like panel) ----

function clock() {
  return new Date().toTimeString().slice(0, 8);
}

function log(text) {
  const ol = $("log");
  const prev = ol.querySelector("li.new");
  if (prev) prev.classList.remove("new");
  const li = document.createElement("li");
  li.className = "new";
  const t = document.createElement("span");
  t.className = "t";
  t.textContent = clock();
  li.append(t, document.createTextNode(text));
  ol.appendChild(li);
  while (ol.children.length > 400) ol.removeChild(ol.firstChild);
  $("log-card").hidden = false;  // the log card shows up with its first line
  ol.scrollTop = ol.scrollHeight;
}

function logOnce(text) {
  if (text !== lastCard) { log(text); lastCard = text; }
}

// ---- helper connection ----

// only ever called in the local mode (refreshStatus)
async function findHelper() {
  const bases = HELPER_PAGE ? [""] : PORTS.map((p) => "http://127.0.0.1:" + p);
  for (const base of bases) {
    try {
      const r = await fetch(base + "/api/health", { cache: "no-store" });
      if (r.ok) { API = base; return await r.json(); }
    } catch (e) { /* try next port */ }
  }
  return null;
}

async function getCloudStatus() {
  try { return await cloud.status(); } catch (e) { return null; }
}

function setStatus(text, ok) {
  const s = $("status");
  s.textContent = text;
  s.className = "pill " + (ok ? "ok" : "bad");
}

// Chrome asks before a public page may reach 127.0.0.1 (Local Network Access); until the user answers, the check
// just waits. "" when the browser does not know this permission.
async function lnaState() {
  try { return (await navigator.permissions.query({ name: "local-network-access" })).state; }
  catch (e) { return ""; }
}

// the recommendation decides the defaults; a box the user changed keeps the user's choice
function applyRecommendation(rec) {
  if (!rec || engine !== "helper") return;
  if (!polishTouched) $("opt-polish").checked = !!rec.polish_default;
  const fastOk = !!health && health.model_fast_ready !== false;
  if (!fastTouched) $("opt-fast").checked = !!rec.fast_default && fastOk;  // fast draft missing: the job uses the default
}

// Which engine translates now (chooseEngine): the cloud unless the local mode is on. The cloud view is shown at once
// ("Dịch" waits for nothing) and GET /api/v1/status only fills in the pill, or stops "Dịch" when today's budget is used
// up. The local mode looks for the helper on 127.0.0.1 (the only place that does) and never falls back to the cloud.
async function refreshStatus() {
  if (running) return;  // never switch engines under a running job
  const seq = ++refreshSeq;
  if (chooseEngine({ local, helper: false }) === "cloud") {
    showCloud();
    const st = await getCloudStatus();
    if (seq !== refreshSeq) return;  // the switch moved meanwhile
    cloudStatus = st;
    showCloud();
    return;
  }
  $("status").textContent = "Đang tìm bộ dịch trên máy…";
  $("status").className = "pill";
  const wait = setTimeout(() => {
    if (seq !== refreshSeq) return;
    $("status").textContent = "Nếu trình duyệt hỏi quyền truy cập mạng cục bộ, hãy bấm Cho phép";
  }, LNA_HINT_MS);
  const h = await findHelper();
  clearTimeout(wait);
  if (seq !== refreshSeq) return;
  health = h;
  if (chooseEngine({ local, helper: !!h }) === "helper") return showHelper();
  return showLocalMissing(seq);
}

// the read-back pass and the fast draft exist only on the helper: their options show in the local mode only
function setOptions(kind) {
  $("local-options").hidden = !local;
  for (const [id, hint] of [["opt-polish", "polish-hint"], ["opt-fast", "fast-hint"]]) {
    $(id).disabled = kind !== "helper";
    $(hint).textContent = "";
  }
}

// the local mode's cards: its set-up card (what it is, what it needs) and the helper's recommendation card
function showLocalCards(found) {
  $("setup").hidden = !local;
  $("setup-missing").hidden = !local || found;
  $("advice").hidden = !local || !found;
}

function showCloud() {
  engine = "cloud";
  clearTimeout(hwTimer);
  showLocalCards(false);
  setOptions("cloud");
  const u = cloudUsable(cloudStatus);
  if (cloudStatus === undefined || u.ok) setStatus("Sẵn sàng", true);
  else {
    setStatus(u.why === "budget_exhausted" ? "Hết lượt dịch hôm nay" : "Chưa kết nối được máy chủ", false);
    logOnce(cloudErrorText(u.why));
  }
  updateGo();
}

// the local mode without a helper: the set-up card says what to install; "Dịch" stays off (never the cloud)
async function showLocalMissing(seq) {
  engine = null;
  setOptions(null);
  showLocalCards(false);
  updateGo();
  const denied = (await lnaState()) === "denied";
  if (seq !== refreshSeq) return;
  $("lna-denied").hidden = !denied;
  setStatus(denied ? "Trình duyệt đang chặn kết nối tới bộ dịch trên máy" : "Chưa thấy bộ dịch trên máy", false);
}

function showHelper() {
  engine = "helper";
  setOptions("helper");
  showLocalCards(true);
  $("lna-denied").hidden = true;
  if (!health.ollama) { setStatus("Ollama chưa chạy trên máy này", false); pollHardware(); updateGo(); return; }
  if (!health.model_ready) {
    setStatus("Chưa có mô hình " + modelName(health.model_default) + " (bấm nút tải ở thẻ gợi ý, hoặc chạy: ollama pull "
      + health.model_default + ")", false);
    pollHardware();
    updateGo();
    return;
  }
  setStatus("Sẵn sàng", true);  // the device and the model are on the recommendation card
  const fastOk = health.model_fast_ready !== false;
  $("opt-fast").disabled = !fastOk;
  if (!fastOk) $("opt-fast").checked = false;
  $("fast-hint").textContent = fastOk ? "" : " (chưa có " + modelName(health.model_fast) + ")";
  // the read-back editor pass costs about as much again as the translation: on by default only with a GPU
  if (health.recommendation) applyRecommendation(health.recommendation);
  else if (!polishTouched) $("opt-polish").checked = health.device.kind === "gpu";
  updateGo();
  pollHardware();
}

// ---- "Gợi ý cho máy này" ----

function showText(id, text) {
  $(id).textContent = text || "";
  $(id).hidden = !text;
}

function renderAdvice(a) {
  $("advice-line").textContent = a.title && !a.ask ? a.title + " · " + a.line : a.line;
  showText("advice-estimate", a.estimate);
  showText("advice-detail", a.detail);
  showText("advice-status", a.status);
  askOptions = a.ask ? a.ask.options : [];
  $("advice-ask").hidden = !a.ask;
  if (a.ask) {
    $("ask-a").textContent = askOptions[0].label;
    $("ask-b").textContent = askOptions[1].label;
  }
  $("advice-link").hidden = !a.link;
  const pull = $("advice-pull");
  pull.hidden = !a.pull;
  if (a.pull) { pull.textContent = a.pull.text; pull.disabled = !!a.pull.disabled; }
}

async function getHardware() {
  try {
    const r = await fetch(API + "/api/hardware", { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

async function post(path, body) {
  try {
    const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

function applyHardware(hw) {
  hardware = hw;
  const a = helperAdvice(hw);
  renderAdvice(a);
  const rec = hw.recommendation;
  if (a.line !== lastSetup) {
    log(a.line + " · đọc lại cho mượt: " + (rec.polish_default ? "bật" : "tắt"));
    lastSetup = a.line;
  }
  const cal = (hw.calibration || {}).state + ":" + ((hw.calibration || {}).reason || "");
  if (cal !== lastCal) {
    if (hw.calibration.state === "done") log("Tốc độ máy: " + a.estimate.replace(/^Ước tính /, ""));
    else if (a.status) log(a.status);
    lastCal = cal;
  }
  applyRecommendation(rec);
}

// /api/hardware until the scan is ready; ask for a calibration when this machine has none; keep polling while it
// is being measured or the fast model is downloading
async function pollHardware() {
  clearTimeout(hwTimer);
  if (engine !== "helper") return;
  const hw = await getHardware();
  if (!hw) { if (!hardware) log("Không đọc được cấu hình máy từ bộ dịch; dùng cài đặt mặc định."); return; }
  if (!hw.ready) { hwTimer = setTimeout(pollHardware, 1000); return; }
  if (engine !== "helper") return;
  applyHardware(hw);
  const st = hw.calibration && hw.calibration.state;
  if (st === "missing" && !calRequested) {
    calRequested = true;
    await post("/api/hardware/calibrate", {});
  }
  const pulling = hw.pull && hw.pull.state === "running";
  if (st === "missing" || st === "running" || pulling) hwTimer = setTimeout(pollHardware, HW_POLL_MS);
  else if (pulledButNotSeen(hw.pull)) refreshStatus();
}

// a finished download of a model that the last health check still listed as missing
function pulledButNotSeen(pull) {
  if (!pull || pull.state !== "done" || !health) return false;
  return (pull.model === health.model_default && health.model_ready === false)
    || (pull.model === health.model_fast && health.model_fast_ready === false);
}

function answer(k) {
  const opt = askOptions[k];
  if (!opt) return;
  log("Đã ghi nhớ: " + opt.label);
}

async function redo() {
  if (engine === "helper") {
    log("Đo lại tốc độ máy…");
    calRequested = true;
    lastCal = "";
    await post("/api/hardware/calibrate", { force: true });
    pollHardware();
  } else {
    log(CHECKING);
    lastCard = "";
    refreshStatus();
  }
}

// the helper downloads the model the card recommends (and only when it is missing)
async function pullModel() {
  $("advice-pull").disabled = true;
  const rec = hardware && hardware.recommendation;
  log("Bắt đầu tải mô hình " + (rec ? modelName(rec.model) : "") + " (bạn đã cho phép)…");
  await post("/api/models/pull", {});
  pollHardware();
}

// "Dịch": on as soon as there is something to translate; the cloud waits for nothing (cloudBlocked: only a used-up
// budget), the helper for its model
function updateGo() {
  let can;
  const cloudOk = engine === "cloud" && !cloudBlocked(cloudStatus);
  if (mode === "text") {
    // text goes to the cloud only: with "Dịch trên máy" picked, the page says so instead of sending it
    const c = countText($("src-text").value);
    can = cloudOk && /\S/.test($("src-text").value) && !c.over;
    showText("text-note", local ? TEXT_LOCAL_NOTE : "");
  } else {
    can = !!$("file").files.length && (cloudOk || (engine === "helper" && !!health && health.model_ready));
  }
  $("go").disabled = running || !can;
}

function updateCount() {
  const c = countText($("src-text").value);
  $("text-count").textContent = c.text;
  $("text-count").classList.toggle("over", c.over);
  updateGo();
}

// "Văn bản" / "Tệp": one panel at a time; the text result card belongs to the text mode
function setMode(m) {
  if (running) return;
  mode = m;
  $("mode-text").setAttribute("aria-pressed", String(m === "text"));
  $("mode-file").setAttribute("aria-pressed", String(m === "file"));
  $("text-panel").hidden = m !== "text";
  $("file-panel").hidden = m !== "file";
  $("text-result").hidden = m !== "text" || !$("text-out").children.length;
  updateGo();
}

// The first-use consent: one dialog (his 20:48 wording: AI output needs an expert's review, the text goes to the
// server and is neither kept nor trained on, no patient-identifying documents), shown at the first visit and
// remembered; only its one button closes it (Esc does nothing). Resolves true once agreed.
function askConsent() {
  if (consented || store(CLOUD_CONSENT_KEY) === "yes") {
    consented = true;
    return Promise.resolve(true);
  }
  const dlg = $("consent");
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => {
      consented = $("agree").checked;
      if (consented) store(CLOUD_CONSENT_KEY, "yes");
      resolve(consented);
    }, { once: true });
    if (!dlg.open) dlg.showModal();
  });
}

function renderSteps(current, done) {
  const ol = $("steps");
  ol.textContent = "";
  let reached = true;
  for (const [key, label] of jobStages) {
    const li = document.createElement("li");
    li.textContent = label;
    if (key === current && !done) { li.className = "active"; reached = false; }
    else if (reached || done) li.className = "done";
    ol.appendChild(li);
  }
}

function flagLabel(flag) {
  const [kind, value] = flag.split(/:(.*)/s);
  const shown = value && FLAG_VALUES[kind] && FLAG_VALUES[kind][value] ? FLAG_VALUES[kind][value] : value;
  return (FLAGS[kind] || kind) + (shown ? ": " + shown : "");
}

function cell(text, cls, label) {
  const td = document.createElement("td");
  td.textContent = text;
  if (label) td.setAttribute("data-label", label);
  if (cls) td.className = cls;
  return td;
}

function polishLine(rep) {
  const p = rep.polish;
  if (!p || !p.enabled) return "";
  const kept = Object.values(p.rejected || {}).reduce((a, b) => a + b, 0);
  return " · Đọc lại " + p.groups + " nhóm: sửa " + p.changed + "/" + p.lines + " dòng" +
    (kept ? ", " + kept + " dòng giữ bản dịch đầu" : "") +
    " (" + Math.round((rep.seconds || {}).polish || 0) + " giây)";
}

// dl: { href, name } of the translated file (helper URL or Blob URL), null when there is none
function renderReport(rep, failed, dl) {
  $("result").hidden = false;
  const c = rep.counts || { segments: 0, flagged: 0 };
  const lv = rep.levels || {};
  const parts = [];
  LEVELS.forEach((name, i) => { if (lv[String(i)]) parts.push(lv[String(i)] + " " + name.toLowerCase()); });
  const ladder = (c.segments - (lv["0"] || 0)) > 0 ? " (" + parts.join(", ") + ")" : "";
  $("summary").textContent = (failed ? "Báo cáo một phần (không có bản dịch để tải): " : "") +
    c.segments + " đoạn đã dịch" + ladder + " · " + c.flagged + " đoạn cần xem lại · " + packsLineShort(rep) +
    (rep.device === "cloud" ? "" : " · Thiết bị: " + deviceWord(rep.device)) + " · Mô hình: " + modelName(rep.model) +
    " · " + Math.round((rep.seconds || {}).translate || 0) + " giây dịch" + polishLine(rep);
  const rv = reviewText(rep);
  showText("review", rv ? rv.line : "");
  $("review").className = "review" + (rv ? " " + rv.level : "");
  $("download").hidden = !!failed || !dl;
  if (dl) {
    $("download").href = dl.href;
    if (dl.name) $("download").setAttribute("download", dl.name);
    else $("download").removeAttribute("download");
  }
  const sk = $("skipped");
  sk.textContent = "";
  const missing = rep.packs_unavailable_names || rep.packs_unavailable || [];
  if (missing.length) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = "Không tải được gói: " + missing.join(", ") + (rep.registry_offline ? " (ngoại tuyến?)" : "");
    sk.appendChild(p);
  }
  for (const [reason, n] of Object.entries(rep.skipped || {})) {
    if (!SKIPS[reason]) continue;
    const p = document.createElement("p");
    p.className = "note";
    const where = (rep.skipped_items || []).filter((s) => s.reason === reason).map((s) => s.where);
    p.textContent = "Bỏ qua " + n + " " + SKIPS[reason] + (where.length ? " – " + [...new Set(where.map(locLabel))].join(", ") : "");
    sk.appendChild(p);
  }
  const fonts = $("fonts");
  fonts.textContent = "";
  for (const f of rep.fonts || []) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = f.action === "replaced"
      ? "Font " + f.font + " thiếu chữ tiếng Việt, đã thay bằng " + f.to
      : "Font " + f.font + " không có trên máy này, chưa kiểm tra được dấu tiếng Việt";
    fonts.appendChild(p);
  }
  const body = $("flagged").querySelector("tbody");
  body.textContent = "";
  for (const r of rep.flagged || []) {
    const tr = document.createElement("tr");
    const notes = [LEVELS[r.level]].concat(r.flags.map(flagLabel));
    tr.append(cell(locLabel(r.where), "", "Vị trí"), cell(r.src, "", "Bản gốc"), cell(r.out, "", "Bản dịch"),
      cell(notes.join("; "), "flags", "Ghi chú"));
    body.appendChild(tr);
  }
  $("flagged").hidden = $("flagged-title").hidden = !(rep.flagged || []).length;
}

function showError(text, detail) {
  $("error").hidden = false;
  $("error-text").textContent = text;
  $("error-detail").hidden = !detail;
  $("error-detail").textContent = detail ? "Chi tiết: " + detail : "";
}

async function fetchReport(id) {
  try {
    const r = await fetch(API + "/api/jobs/" + id + "/report");
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

// ---- one job: quality notice, estimate, progress lines ----

let job = null; // { engine, started, est, translateLog, polishLog, ctrl? }

function setBar(pct) {
  $("bar-fill").style.width = Math.max(0, Math.min(100, pct)) + "%";
}

function elapsedText() {
  const s = Math.round((Date.now() - job.started) / 1000);
  return s < 60 ? s + " giây" : Math.floor(s / 60) + " phút " + (s % 60) + " giây";
}

function beginProgress(stages) {
  $("go").disabled = true;
  $("result").hidden = $("error").hidden = true;
  $("progress").hidden = false;
  setBar(0);
  $("progress-note").textContent = "";
  jobStages = stages;
  renderSteps(stages[0][0], false);
}

// One progress event of either engine (helper SSE or the page pipeline's onProgress) onto the page.
function renderEvent(ev) {
  const v = eventView(ev, { est: job.est, elapsed: elapsedText(), translateLog: job.translateLog,
    polishLog: job.polishLog, now: Date.now() });
  if (v.est !== undefined) job.est = v.est;
  if (v.step && jobStages.some(([k]) => k === v.step)) renderSteps(v.step, false);  // the cloud has no device step
  if (v.bar !== undefined) setBar(v.bar);
  if (v.note !== undefined) $("progress-note").textContent = v.note;
  if (v.model !== undefined) $("q-model").textContent = v.model;
  if (v.polish !== undefined && job.engine === "helper") $("q-polish").textContent = v.polish;
  if (v.eta !== undefined) $("q-eta").textContent = v.eta;
  if (v.packs !== undefined) $("q-packs").textContent = v.packs;
  for (const line of v.log || []) log(line);
}

async function onDone(id) {
  renderSteps("done", true);
  setBar(100);
  const rep = await fetchReport(id);
  const dl = { href: API + "/api/jobs/" + id + "/result", name: rep ? rep.output : "" };
  if (rep) renderReport(rep, false, dl);
  else showError("Dịch xong nhưng không tải được báo cáo. Bạn vẫn có thể tải bản dịch.", "");
  if (!rep) { $("result").hidden = false; $("summary").textContent = "Đã dịch xong."; $("download").hidden = false;
    $("download").href = dl.href; }
  $("q-eta").textContent = "Đã xong sau " + elapsedText();
  log("Xong sau " + elapsedText() + (rep ? " · " + ((rep.counts || {}).flagged || 0) + " đoạn cần xem lại" : ""));
  const rv = rep ? reviewText(rep) : null;
  if (rv) log(rv.line);
  updateGo();
  if (health) pollHardware(); // a calibration that waited for this job can run now
}

async function onFail(id, ev) {
  const code = ev && ev.code;
  showError(JOB_ERRORS[code] || "Có lỗi khi dịch.", ev && ev.message);
  log("Lỗi: " + (JOB_ERRORS[code] || "Có lỗi khi dịch.") + (ev && ev.message ? " (" + ev.message + ")" : ""));
  if (code === "output_invalid") {
    const rep = await fetchReport(id);
    if (rep) renderReport(rep, true, null);
  }
  updateGo();
}

function poll(id, settle) {
  // fallback when the event stream is lost: ask for the job state until it is final
  const timer = setInterval(async () => {
    try {
      const r = await fetch(API + "/api/jobs/" + id, { cache: "no-store" });
      if (r.status === 404) { clearInterval(timer); showError("Bộ dịch không còn công việc này (đã khởi động lại?).", ""); updateGo(); return; }
      if (!r.ok) return;
      const j = await r.json();
      if (j.state === "done" || j.state === "error") { clearInterval(timer); settle(j); }
    } catch (e) { /* helper unreachable: keep trying */ }
  }, POLL_MS);
}

async function start() {
  if (running) return;
  if (mode === "text") {
    if (engine === "cloud") return startText();
    return;
  }
  const file = $("file").files[0];
  if (!file) return;
  if (engine === "cloud") return startCloud(file);
  if (engine === "helper") return startHelper(file);
}

async function startHelper(file) {
  beginProgress(STAGES.filter(([k]) => k !== "polish" || $("opt-polish").checked));
  job = { engine: "helper", started: Date.now(), est: null, translateLog: makeThrottle(5, 10000),
    polishLog: makeThrottle(5, 10000) };
  $("q-model").textContent = noticeText($("opt-fast").checked ? health.model_fast : health.model_default, null);
  $("q-packs").textContent = "Đang chọn gói thuật ngữ…";
  $("q-polish").textContent = "Đọc lại cho mượt: " + ($("opt-polish").checked ? "bật" : "tắt");
  $("q-polish").hidden = false;
  $("q-eta").textContent = "Đang ước tính thời gian…";
  log("Bắt đầu dịch trên máy: " + file.name);
  const form = new FormData();
  form.append("file", file);
  form.append("options", JSON.stringify({ fast: $("opt-fast").checked, notes: $("opt-notes").checked,
    polish: $("opt-polish").checked }));
  let res;
  try { res = await fetch(API + "/api/jobs", { method: "POST", body: form }); }
  catch (e) { showError("Không gửi được tệp tới bộ dịch trên máy."); log("Lỗi: không gửi được tệp."); updateGo(); return; }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail;
    showError(ERRORS[detail] || "Bộ dịch từ chối tệp (" + res.status + ").");
    log("Lỗi: " + (ERRORS[detail] || "bộ dịch từ chối tệp (" + res.status + ")."));
    updateGo();
    return;
  }
  const { id } = await res.json();
  currentJob = id;
  let settled = false;
  const settle = async (state, ev) => {
    if (settled) return;
    settled = true;
    if (state === "done") await onDone(id); else await onFail(id, ev);
  };
  const es = new EventSource(API + "/api/jobs/" + id + "/events");
  es.onmessage = async (msg) => {
    const ev = JSON.parse(msg.data);
    if (ev.stage === "finished") {
      es.close();
      await settle("done");
    } else if (ev.stage === "error") {
      es.close();
      await settle("error", ev);
    } else {
      renderEvent(ev);
    }
  };
  es.onerror = () => {
    if (settled) return;
    es.close();
    $("progress-note").textContent = "Mất kết nối với bộ dịch";
    log("Mất kết nối với bộ dịch, đang thử lại…");
    poll(id, (j) => { $("progress-note").textContent = ""; settle(j.state, j.last); });
  };
}

// ---- the cloud engine ----

// the screen stays on while translating in this tab (where the browser allows it)
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      const w = wakeLock;
      wakeLock = null;
      await w.release();
    }
  } catch (e) {
    wakeLock = null;
  }
}

function setRunning(on) {
  running = on;
  $("cancel").hidden = !on;
  $("cancel").disabled = false;
  $("engine-local").disabled = on;
  $("mode-text").disabled = $("mode-file").disabled = on;
  keepAwake(on);
  updateGo();
}

function loadTurnstile() {
  if (!tsReady) {
    tsReady = new Promise((resolve, reject) => {
      if (window.turnstile) { resolve(window.turnstile); return; }
      const s = document.createElement("script");
      s.src = TURNSTILE_URL;
      s.async = true;
      s.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile)
        : reject(Object.assign(new Error("Turnstile API missing"), { code: "turnstile" }))));
      s.addEventListener("error", () => reject(Object.assign(new Error("Turnstile script not loaded"), { code: "turnstile" })));
      document.head.appendChild(s);
    });
    tsReady.catch(() => { tsReady = null; });  // a later job tries again
  }
  return tsReady;
}

// A fresh Turnstile token (single use): the widget is rendered once, then reset for each new session.
async function turnstileToken(signal) {
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    const settle = (fn, v) => { const w = tsWaiter; tsWaiter = null; if (w) fn(v); };
    tsWaiter = { resolve, reject };
    if (signal) {
      signal.addEventListener("abort", () => settle(reject, new DOMException("The operation was aborted.", "AbortError")),
        { once: true });
    }
    if (tsWidget === null) {
      tsWidget = turnstile.render($("turnstile-box"), {
        sitekey: turnstileSiteKey(), action: "session", appearance: "interaction-only",
        callback: (token) => { if (tsWaiter) tsWaiter.resolve(token); tsWaiter = null; },
        "error-callback": (code) => {
          if (tsWaiter) tsWaiter.reject(Object.assign(new Error("Turnstile error " + code), { code: "bad_turnstile" }));
          tsWaiter = null;
          return true;
        },
      });
    } else {
      turnstile.reset(tsWidget);
    }
  });
}

// A valid session: Turnstile token -> POST /api/v1/session (again when the old one expired).
async function ensureSession(signal) {
  if (cloud.hasSession()) return;
  cloud.dropSession();
  log("Xác minh trình duyệt…");
  const token = await turnstileToken(signal);
  const s = await cloud.openSession(token, signal);
  const left = s.quota && Number.isFinite(s.quota.segments_left_today) ? s.quota.segments_left_today : null;
  log("Đã xác minh" + (left !== null ? " · hôm nay còn " + left + " đoạn" : ""));
}

// the job's opening lines on the progress card and in the log: the model in one short line (no read-back on the cloud)
function cloudNotice(model) {
  $("q-model").textContent = noticeText(model, "cloud");
  $("q-packs").textContent = "Đang chọn gói thuật ngữ…";
  $("q-polish").hidden = true;
  $("q-eta").textContent = "";
}

const retryLine = (k) => log("Máy chủ lỗi, gửi lại lần " + k + "…");

function onCloudDone(res, cj) {
  renderSteps("done", true);
  setBar(100);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(res.blob);
  currentJob = null;
  const rep = res.report || {};
  renderReport(rep, false, { href: resultUrl, name: res.name });
  $("q-eta").textContent = "Đã xong sau " + elapsedText();
  log("Xong sau " + elapsedText() + " · " + ((rep.counts || {}).flagged || 0) + " đoạn cần xem lại · tệp: " + res.name);
  const rv = reviewText(rep);
  if (rv) log(rv.line);
}

function onCloudFail(e) {
  const code = errorCode(e);
  const text = cloudErrorText(code);
  const detail = e && e.message ? e.message : "";
  if (code === "aborted") {
    $("progress-note").textContent = text;
    log(text);
    return;
  }
  showError(text, detail);
  log("Lỗi: " + text + (detail ? " (" + detail + ")" : ""));
  if (e && e.report) renderReport(e.report, true, null);
  if (code === "bad_turnstile" || code === "session_expired") cloud.dropSession();
}

async function startCloud(file) {
  if (!(await askConsent())) { log(cloudErrorText("declined")); return; }
  beginProgress(CLOUD_STAGES);
  job = { engine: "cloud", started: Date.now(), est: null, translateLog: makeThrottle(5, 10000),
    polishLog: makeThrottle(5, 10000), ctrl: new AbortController() };
  const signal = job.ctrl.signal;
  const model = (cloudStatus && cloudStatus.model) || CLOUD_MODEL;
  cloudNotice(model);
  setRunning(true);
  log("Bắt đầu dịch: " + file.name);
  try {
    await ensureSession(signal);
    if (!engineMod) engineMod = await loadEngine();
    if (!engineMod) throw Object.assign(new Error("engine/pipeline.js"), { code: "engine_missing" });
    const cj = cloudJob(cloud, { jobId: crypto.randomUUID(), signal,
      renew: async () => { cloud.dropSession(); await ensureSession(signal); }, onRetry: retryLine });
    renderSteps("extract", false);
    // pipeline.js: the document is read and written here; prepare / translateSegments send only segment text. Each
    // pipeline call hands over CONCURRENCY batches, which cloud.js sends at once.
    const res = await runBrowserJob({ pipeline: engineMod, file, name: file.name, notes: $("opt-notes").checked,
      onProgress: renderEvent, signal, engine: { prepare: (text, o) => cj.prepare(text, o),
        translateSegments: (segments, o) => cj.translateSegments(segments, o), batchSize: BATCH_SIZE * CONCURRENCY,
        modelId: model, device: CLOUD_DEVICE } });
    onCloudDone(res, cj);
  } catch (e) {
    onCloudFail(e);
  } finally {
    setRunning(false);
  }
}

// ---- text mode (cloud only) ----

// The translated paragraphs of one batch, appended in order; a paragraph that needs a look carries its flags in the
// report's words (ladder level, flag labels).
function appendText(results) {
  const ol = $("text-out");
  for (const r of results) {
    const li = document.createElement("li");
    const p = document.createElement("p");
    p.className = "vi";
    p.textContent = r.text || "";
    li.appendChild(p);
    if (isFlagged(r.level, r.flags)) {
      const f = document.createElement("p");
      f.className = "flags";
      f.textContent = [LEVELS[r.level]].concat((r.flags || []).map(flagLabel)).filter(Boolean).join("; ");
      li.appendChild(f);
    }
    ol.appendChild(li);
  }
  $("text-result").hidden = false;
}

// Pasted English through the cloud engine: classify once (the paragraphs, as translateFile hands them to prepare),
// then batches of <= 20 paragraphs with the document's setup; the Vietnamese shows up batch by batch.
async function startText() {
  const t = textSegments($("src-text").value);
  if (!t.segments.length) return;
  if (!(await askConsent())) { log(cloudErrorText("declined")); return; }
  beginProgress(TEXT_STAGES);
  textJob = { t, results: [] };
  $("text-out").textContent = "";
  $("text-packs").textContent = "";
  $("text-copied").textContent = "";
  $("text-result").hidden = true;
  job = { engine: "cloud", started: Date.now(), est: null, translateLog: makeThrottle(5, 10000),
    polishLog: makeThrottle(5, 10000), ctrl: new AbortController() };
  const signal = job.ctrl.signal;
  const model = (cloudStatus && cloudStatus.model) || CLOUD_MODEL;
  cloudNotice(model);
  setRunning(true);
  log("Bắt đầu dịch văn bản: " + t.segments.length + " đoạn");
  log(noticeText(model, "cloud"));  // the file flow logs it from the pipeline's device event
  try {
    await ensureSession(signal);
    const cj = cloudJob(cloud, { jobId: crypto.randomUUID(), signal,
      renew: async () => { cloud.dropSession(); await ensureSession(signal); }, onRetry: retryLine });
    const setup = await cj.prepare(t.fullText, { domain: "" });
    renderEvent(setup.classify);
    $("text-packs").textContent = packsLineShort(setup.classify);
    const total = t.segments.length;
    await cj.translateSegments(t.segments, { onBatch: (done, batch) => {
      textJob.results.push(...batch);
      appendText(batch);
      renderEvent({ stage: "translate", done, total, where: t.segments[done - 1].where });
    } });
    renderSteps("done", true);
    setBar(100);
    $("q-eta").textContent = "Đã xong sau " + elapsedText();
    const flagged = textJob.results.filter((r) => isFlagged(r.level, r.flags)).length;
    log("Xong sau " + elapsedText() + " · " + total + " đoạn · " + flagged + " đoạn cần xem lại");
  } catch (e) {
    onCloudFail(e);
  } finally {
    setRunning(false);
  }
}

async function copyText() {
  if (!textJob) return;
  const text = textOutput(textJob.t, textJob.results);
  try {
    await navigator.clipboard.writeText(text);
    $("text-copied").textContent = "Đã sao chép.";
  } catch (e) {
    $("text-copied").textContent = "Trình duyệt không cho sao chép tự động: hãy chọn bản dịch rồi sao chép.";
  }
}

function init() {
  // the cloud view by default; the local mode when its switch was left on (or on the helper's own page)
  local = localMode(store(ENGINE_KEY), HELPER_PAGE);
  $("engine-local").checked = local;
  if (local) log(CHECKING);
  const drop = $("drop");
  const pick = () => { $("filename").textContent = $("file").files[0] ? $("file").files[0].name : ""; updateGo(); };
  $("file").addEventListener("change", pick);
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") $("file").click(); });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    if (e.dataTransfer.files.length) { $("file").files = e.dataTransfer.files; pick(); }
  });
  $("go").addEventListener("click", start);
  $("mode-text").addEventListener("click", () => setMode("text"));
  $("mode-file").addEventListener("click", () => setMode("file"));
  $("src-text").addEventListener("input", updateCount);
  $("text-copy").addEventListener("click", copyText);
  $("opt-polish").addEventListener("change", () => { polishTouched = true; });
  $("opt-fast").addEventListener("change", () => { fastTouched = true; });
  $("engine-local").addEventListener("change", () => {
    local = $("engine-local").checked;
    store(ENGINE_KEY, local ? "local" : "cloud");
    log(local ? "Đã chọn Dịch trên máy: tài liệu không rời máy." : "Đã chọn dịch trên máy chủ.");
    if (local) log(CHECKING);
    refreshStatus();
  });
  $("agree").addEventListener("change", () => { $("consent-ok").disabled = !$("agree").checked; });
  $("consent").addEventListener("cancel", (e) => e.preventDefault());  // only its button closes it
  $("retry").addEventListener("click", refreshStatus);
  $("ask-a").addEventListener("click", () => answer(0));
  $("ask-b").addEventListener("click", () => answer(1));
  $("advice-redo").addEventListener("click", redo);
  $("advice-pull").addEventListener("click", pullModel);
  $("cancel").addEventListener("click", () => {
    if (!running || !job || !job.ctrl) return;
    $("cancel").disabled = true;
    log("Đang dừng…");
    job.ctrl.abort();
  });
  // the helper may have been started (or the GPU freed) while the user was away from this tab
  window.addEventListener("focus", () => {
    if (running) return;
    if (engine !== "helper" || !health || !health.model_ready) refreshStatus();
    else pollHardware();
  });
  window.addEventListener("beforeunload", (e) => {
    if (!running) return;
    e.preventDefault();
    e.returnValue = "";
  });
  document.addEventListener("visibilitychange", () => {
    if (running && document.visibilityState === "visible") keepAwake(true);
  });
  $("delete").addEventListener("click", async () => {
    if (currentJob) {
      try { await fetch(API + "/api/jobs/" + currentJob, { method: "DELETE" }); } catch (e) { /* ignore */ }
      currentJob = null;
    }
    if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
    $("result").hidden = $("progress").hidden = true;
  });
  refreshStatus();
  askConsent();  // the first visit: the one consent dialog
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
