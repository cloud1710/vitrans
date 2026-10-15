"use strict";
// The page: two engines (spec Amendment F). The cloud engine is the default: the page reads and writes the document
// itself (engine/pipeline.js on the OOXML layer) and sends only the segments to the Pages Functions API on this
// origin (/api/v1/, web/cloud.js) after the first-use consent and a Cloudflare Turnstile check. The menu's "Trên máy"
// turns on the local mode (private / offline: the helper on 127.0.0.1): only that mode looks for the helper, since a
// public page reaching 127.0.0.1 makes Chrome ask for Local Network Access, and only that mode shows the helper's
// cards and wording. The cloud view waits for nothing: "Dịch" works as soon as there is something to translate. Both
// engines feed the same progress view (advice.js eventView), report view and log. "Văn bản" sends pasted paragraphs
// and shows the Vietnamese paragraph by paragraph; "Tệp" translates a .docx / .pptx / .pdf with either engine.
// After a cloud job (file or text), "Xem lại thuật ngữ" (spec Amendment G,
// web/terms.js): new terms from /api/v1/terms and the core's own term fixes, the user's Vietnamese applied to the
// text or written into a corrected file (the original stays), then term pairs sent to the author only when the user
// says so. The local mode has no such panel (the helper has no /terms and its report no term details).
// The engine is the menu's "Dịch bằng" (web/settings.js, web/prefs.js; his 2026-10-15 design): Máy chủ or Trên máy for
// every tool. On Trên máy, text, subtitles and PDFs go through the same page pipeline with the helper's sentence routes
// (web/adapter.js: only the base URL changes, never the cloud); .docx / .pptx keep the helper's own jobs (/api/jobs:
// the read-back pass and the fast draft of the menu's Trên máy section). Every API call is one line of the menu's
// Nhật ký (web/log.js), never any text.
// The app shell (his 2026-10-15 request, web/shell.js): five tool tabs. "Văn bản", "Tài liệu" and "Phụ đề" are this
// module's three modes (one upload card, the same progress card, log and term review; the helper's cards only on
// "Tài liệu"); "Ảnh" and "Dịch đuổi" are their own modules (anh/anh.js, live/live.js), imported when their tab first
// opens, as is the subtitle parser (sub/subtitles.js). "Phụ đề": a .srt / .vtt file or pasted text, its cues
// translated through the cloud core (classify once with profile file, then batches with the neighbouring cues as
// context), written back as SRT or VTT, bilingual or Vietnamese only.
import { helperAdvice, modelName, makeThrottle, reviewText, eventView, noticeText, packsLineShort, locLabel, deviceWord,
  chooseEngine, cloudBlocked, cloudUsable, cloudErrorText, isFlagged, CLOUD_MODEL, CLOUD_CONSENT_KEY } from "./advice.js";
import { createCloud, cloudJob, sharedSessionStore, BATCH_SIZE, CONCURRENCY } from "./cloud.js";
import { createSessionFlow, pageChecks } from "./turnstile.js";
import { textSegments, textOutput, countText } from "./text.js";
import { runBrowserJob, errorCode, loadEngine, MIME } from "./engine/browser_job.js";
import { setupView } from "./setup.js";
import { TermReview, feedbackBatch, mainPack, rewriteFile, termsErrorText, feedbackErrorText, VI_MAX_CHARS }
  from "./terms.js";
import { initTabs, APP_TOOLS } from "./shell.js";
import { prefs } from "./prefs.js";
import { pageLog } from "./log.js";
import { helperLink } from "./helper.js";
import { createAdapter, callLogger } from "./adapter.js";
import { initSettings } from "./settings.js";

const STAGES = [
  ["extract", "Đọc tệp"], ["classify", "Chọn gói thuật ngữ"], ["device", "Chọn thiết bị"],
  ["translate", "Dịch"], ["polish", "Đọc lại cho mượt"], ["write", "Ghi tệp và định dạng"], ["done", "Hoàn tất"],
];
// the cloud engine first checks the browser (Turnstile) for a session; no device to choose, no read-back pass
const CLOUD_STAGES = [["session", "Xác minh trình duyệt"]].concat(STAGES.filter(([k]) => k !== "polish" && k !== "device"));
const TEXT_STAGES = [["session", "Xác minh trình duyệt"], ["classify", "Chọn gói thuật ngữ"], ["translate", "Dịch"],
  ["done", "Hoàn tất"]];
const SUB_NONE = "Chưa có câu thoại";
const SUB_BAD = "Không thấy câu thoại: cần nội dung tệp .srt hoặc .vtt";
const SUB_BIG = "Tệp quá lớn (tối đa 2 MB).";
const TOOL_ERROR = "Không tải được công cụ này. Hãy tải lại trang.";
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
  pdf_overflow: "Chữ tràn khung trong PDF",
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
  non_latin: "đoạn không phải tiếng Anh (chữ Trung, Thái...; giữ nguyên)",
  scan_no_ocr: "trang ảnh quét chưa nhận dạng được chữ (giữ nguyên)" };
// PDF (spec Amendment H): read and written in the page (web/pdf/), cloud mode only
const PDF_ERRORS = { password: "PDF có mật khẩu mở tệp: hãy bỏ mật khẩu rồi dịch lại.",
  unsupported_file: "Không đọc được tệp PDF này (hỏng hoặc không phải PDF).",
  ocr_unsupported: "Trình duyệt này không chạy được bộ nhận dạng chữ cho trang ảnh quét.",
  ocr_download: "Không tải được bộ nhận dạng chữ cho trang ảnh quét.",
  ocr_integrity: "Bộ nhận dạng chữ tải về không đúng bản, hãy thử lại.",
  ocr_runtime: "Bộ nhận dạng chữ không khởi động được." };
const PDF_NO_LAYOUT = { encrypted: "PDF bị khóa chỉnh sửa nên chỉ có bản DOCX.",
  unsupported_pdf: "Không ghi lại được PDF này nên chỉ có bản DOCX.", write_failed: "Ghi PDF lỗi nên chỉ có bản DOCX." };
const isPdf = (file) => !!file && /\.pdf$/i.test(file.name);
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
const HELPER_RETRY_MS = 2000;   // after "Mở ViTranslate": looked for every 2 s ...
const HELPER_RETRY_FOR_MS = 60000;  // ... for a minute

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
let engine = null;         // "cloud" | "helper" | null (the local mode without a helper)
let local = false;         // the menu's "Trên máy" (web/prefs.js, remembered)
let localMissing = false;  // Trên máy looked for the helper and did not find it (the "Mở ViTranslate" bar)
let settings = null;       // the menu (web/settings.js)
let helperRetry = null;    // the timer of the look-again loop after "Mở ViTranslate"
let refreshSeq = 0;        // the newest refreshStatus(): an older one that comes back late changes nothing
let consented = false;     // the first-use consent was given in this tab (also when the browser cannot store it)
let cloudStatus;           // last GET /api/v1/status answer (undefined: not asked yet; null: not reachable)
let engineMod;             // undefined: not looked for yet; null: this page has no page pipeline
let running = false;       // a cloud job is running in this tab
let wakeLock = null;
let resultUrl = null;      // Blob URL of the last cloud result
let docxUrl = null;        // Blob URL of the DOCX of the last PDF job
let setupTimer = null;     // polling GET /api/setup while the installed helper sets itself up
let mode = "text";         // "text" (pasted paragraphs, cloud only) | "file" (.docx / .pptx / .pdf) | "sub" (subtitles)
let tool = "text";         // the open tab: one of the modes, "anh" or "live"
let tabs = null;           // the shell's tab switcher (initTabs)
let jobMode = null;        // the mode of the last job: its progress / result / error cards show on its tab only
let localFound = false;    // the local mode found the helper (its recommendation card) or not (its set-up note)
let enginePill = { text: "Đang tải…", ok: null };  // the pill of the translating engine (text / file / sub tabs)
const loaded = {};         // tool modules imported so far (anh, live)
let subMod = null;         // sub/subtitles.js, imported when the "Phụ đề" tab first opens
let subDoc = null;         // the parsed subtitle text of the "Phụ đề" box
let subSource = "";        // its file name ("" for pasted text)
let subJob = null;         // { doc, sub, results, name } of the last subtitle translation
let textJob = null;        // { t: textSegments(), results } of the last text translation (the copy button)
let review = null;         // "Xem lại thuật ngữ" of the last cloud job (openReview), null when there is none
// the page's one session (every tool, kept across reloads); every call one log line of the job's tool
const cloud = createCloud({ store: sharedSessionStore(), onCall: callLogger(() => jobMode || mode, "cloud", pageLog) });
const $ = (id) => document.getElementById(id);
// Cloudflare Turnstile -> session (web/turnstile.js, one check at a time for every tool): the site's widget everywhere
// but on 127.0.0.1 / localhost, where the always-pass test key keeps the local test runs offline
const session = createSessionFlow({ cloud, box: () => $("turnstile-box"), log, hub: pageChecks() });
const adapter = createAdapter({ cloud, flow: session, prefs, helper: helperLink, log: pageLog, tool: () => jobMode || mode });

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
  const h = await helperLink.find();  // web/helper.js: the ports in turn, the page's own origin on its page
  if (h) API = helperLink.base;
  return h;
}

async function getCloudStatus() {
  try { return await cloud.status(); } catch (e) { return null; }
}

// ok: true (ready), false (a problem), null (looking)
function setStatus(text, ok) {
  enginePill = { text, ok };
  renderPill();
}

// the cloud's own state (the image and live tools' pill when Máy chủ is chosen)
function cloudPill() {
  const u = cloudUsable(cloudStatus);
  if (cloudStatus === undefined || u.ok) return { text: "Sẵn sàng", ok: true };
  return { text: u.why === "budget_exhausted" ? "Hết lượt dịch hôm nay" : "Chưa kết nối được máy chủ", ok: false };
}

function renderPill() {
  const p = (tool === "anh" || tool === "live") && !local ? cloudPill() : enginePill;
  const s = $("status");
  s.textContent = p.text;
  s.className = "pill" + (p.ok === true ? " ok" : p.ok === false ? " bad" : "");
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
  setStatus("Đang tìm bộ dịch trên máy…", null);
  const wait = setTimeout(() => {
    if (seq !== refreshSeq) return;
    setStatus("Nếu trình duyệt hỏi quyền truy cập mạng cục bộ, hãy bấm Cho phép", null);
  }, LNA_HINT_MS);
  const h = await findHelper();
  clearTimeout(wait);
  if (seq !== refreshSeq) return;
  health = h;
  if (chooseEngine({ local, helper: !!h }) === "helper") return showHelper();
  return showLocalMissing(seq);
}

// the read-back pass and the fast draft exist only on the helper (the menu shows them with Trên máy only)
function setOptions(kind) {
  for (const [id, hint] of [["opt-polish", "polish-hint"], ["opt-fast", "fast-hint"]]) {
    $(id).disabled = kind !== "helper";
    $(hint).textContent = "";
  }
}

// the local mode's cards: its set-up card (what it is, what it needs) and the helper's recommendation card, on the
// "Tài liệu" tab (the helper translates files only)
function showLocalCards(found) {
  localFound = found;
  renderLocalCards();
}

function renderLocalCards() {
  const on = local && mode === "file";
  $("setup").hidden = !on;
  $("setup-missing").hidden = !on || localFound;
  $("advice").hidden = !on || !localFound;
  // the other tabs: one short bar (the Tài liệu tab's set-up card says it there)
  $("helper-bar").hidden = !(local && localMissing && tool !== "file");
}

function showCloud() {
  engine = "cloud";
  localMissing = false;
  stopSetup();
  clearTimeout(hwTimer);
  showLocalCards(false);
  setOptions("cloud");
  const p = cloudPill();
  setStatus(p.text, p.ok);
  if (!p.ok) logOnce(cloudErrorText(cloudUsable(cloudStatus).why));
  updateGo();
}

// the local mode without a helper: the set-up card says what to install; "Dịch" stays off (never the cloud)
async function showLocalMissing(seq) {
  engine = null;
  localMissing = true;
  stopSetup();
  setOptions(null);
  showLocalCards(false);
  updateGo();
  const denied = (await lnaState()) === "denied";
  if (seq !== refreshSeq) return;
  $("lna-denied").hidden = !denied;
  setStatus(denied ? "Trình duyệt đang chặn kết nối tới bộ dịch trên máy" : "Chưa thấy bộ dịch trên máy", false);
}

// The installed helper sets itself up at the first run (Ollama, the model): GET /api/setup while it is busy, one short
// line on the local card; an error offers "Thử cài đặt lại" (POST /api/setup/start). A helper run from source answers
// {"state": "off"}: nothing shown.
function stopSetup() {
  clearTimeout(setupTimer);
  setupTimer = null;
  showText("setup-status", "");
  $("setup-retry").hidden = true;
}

async function watchSetup() {
  clearTimeout(setupTimer);
  let st = null;
  try {
    const r = await fetch(API + "/api/setup", { cache: "no-store" });
    st = r.ok ? await r.json() : null;
  } catch (e) { st = null; }
  if (engine !== "helper") { stopSetup(); return; }
  const v = setupView(st);
  showText("setup-status", v.text);
  $("setup-retry").hidden = !v.error;
  if (v.active) setupTimer = setTimeout(watchSetup, 1500);
  else if (st && st.state === "ready" && health && !health.model_ready) refreshStatus();
}

function showHelper() {
  engine = "helper";
  localMissing = false;
  stopHelperRetry();
  setOptions("helper");
  showLocalCards(true);
  $("lna-denied").hidden = true;
  const sst = health.setup && health.setup.state;
  if (sst === "running" || sst === "waiting" || sst === "error") watchSetup(); else stopSetup();
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
  $("advice-line").textContent = a.title ? a.title + " · " + a.line : a.line;
  showText("advice-estimate", a.estimate);
  showText("advice-detail", a.detail);
  showText("advice-status", a.status);
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
  const localOk = engine === "helper" && !!health && health.model_ready;  // Trên máy: the helper and its model
  if (mode === "text") {
    const c = countText($("src-text").value);
    can = (cloudOk || localOk) && /\S/.test($("src-text").value) && !c.over;
  } else if (mode === "sub") {
    can = (cloudOk || localOk) && !!subDoc && subDoc.cues.length > 0 && !$("sub-count").classList.contains("over");
  } else {
    can = !!$("file").files.length && (cloudOk || localOk);
  }
  $("go").disabled = running || !can;
}

function updateCount() {
  const c = countText($("src-text").value);
  $("text-count").textContent = c.text;
  $("text-count").classList.toggle("over", c.over);
  updateGo();
}

// "Văn bản" / "Tài liệu" / "Phụ đề" (their tabs): one panel at a time; each result card, and the last job's progress,
// result and error cards, show on their own tab only (the tabs of the other modes are locked while a job runs)
function setMode(m) {
  mode = m;
  $("text-panel").hidden = m !== "text";
  $("file-panel").hidden = m !== "file";
  $("sub-panel").hidden = m !== "sub";
  $("text-result").hidden = m !== "text" || !$("text-out").children.length;
  $("sub-result").hidden = m !== "sub" || !$("sub-out").children.length;
  $("terms").hidden = !review || review.mode !== m;  // the review belongs to its job's mode
  markAway();
  renderLocalCards();
  updateGo();
}

function markAway() {
  for (const id of ["progress", "result", "error"]) $(id).classList.toggle("away", jobMode !== null && jobMode !== mode);
}

// A tab opened (initTabs): a mode of this module, or a tool module imported the first time
function onTool(t) {
  tool = t;
  if (APP_TOOLS.includes(t)) setMode(t);
  if (t === "sub") loadSub().then(readSub, () => showText("sub-note", TOOL_ERROR));
  if ((t === "anh" || t === "live") && !loaded[t]) {
    loaded[t] = t === "anh" ? import("./anh/anh.js") : import("./live/live.js");
    loaded[t].catch(() => { loaded[t] = null; showText(t + "-status", TOOL_ERROR); });
  }
  // the live tool starts by itself on its tab (helper source) and stops when another tab opens
  if (loaded.live) loaded.live.then((m) => (t === "live" ? m.enter() : m.leave()), () => {});
  renderLocalCards();
  renderPill();
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
  jobMode = mode;
  markAway();
  $("go").disabled = true;
  $("result").hidden = $("error").hidden = true;
  $("download").textContent = "Tải bản dịch";
  $("download-docx").hidden = true;
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

// the helper's own job (/api/jobs) as one log line: segments, time, result code
function logHelperJob(code, rep) {
  pageLog.add({ tool: "file", engine: "local", op: "job", segments: rep && rep.counts ? rep.counts.segments : undefined,
    ms: job ? Date.now() - job.started : undefined, code });
}

async function onDone(id) {
  renderSteps("done", true);
  setBar(100);
  const rep = await fetchReport(id);
  logHelperJob("ok", rep);
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
  logHelperJob(code || "error", null);
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
  const page = engine === "cloud" || engine === "helper";  // the page pipeline: the cloud or the helper's routes
  if (mode === "text") {
    if (page) return startText();
    return;
  }
  if (mode === "sub") {
    if (page) return startSub();
    return;
  }
  const file = $("file").files[0];
  if (!file) return;
  if (page && isPdf(file)) return startPdf(file);
  if (isPdf(file)) return;
  if (engine === "cloud") return startCloud(file);
  if (engine === "helper") return startHelper(file);
}

async function startHelper(file) {
  closeReview();  // no term review for the helper's jobs
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
  catch (e) {
    showError("Không gửi được tệp tới bộ dịch trên máy.");
    log("Lỗi: không gửi được tệp.");
    logHelperJob("helper_not_found", null);
    updateGo();
    return;
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail;
    pageLog.add({ tool: "file", engine: "local", op: "job", status: res.status, code: detail || "error" });
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
  if (settings) settings.lockEngine(on);  // never switch engines under a running job
  if (tabs) tabs.lock(APP_TOOLS, on);  // the other modes' tabs wait for the job (the image and live tools do not)
  keepAwake(on);
  updateGo();
}

// the job's opening lines on the progress card and in the log: the model in one short line (no read-back pass on the
// page pipeline); kind: "cloud", or the helper's device (Trên máy)
function cloudNotice(model, kind) {
  $("q-model").textContent = noticeText(model, kind || "cloud");
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
  const text = PDF_ERRORS[code] || cloudErrorText(code);
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
  closeReview();
  beginProgress(CLOUD_STAGES);
  job = { engine: "cloud", started: Date.now(), est: null, translateLog: makeThrottle(5, 10000),
    polishLog: makeThrottle(5, 10000), ctrl: new AbortController() };
  const signal = job.ctrl.signal;
  const model = (cloudStatus && cloudStatus.model) || CLOUD_MODEL;
  const notes = $("opt-notes").checked;
  cloudNotice(model);
  setRunning(true);
  log("Bắt đầu dịch: " + file.name);
  try {
    await session.ensure(signal);
    if (!engineMod) engineMod = await loadEngine();
    if (!engineMod) throw Object.assign(new Error("engine/pipeline.js"), { code: "engine_missing" });
    const cj = cloudJob(cloud, { jobId: crypto.randomUUID(), signal,
      renew: () => session.renew(signal), onRetry: retryLine });
    // the term review keeps the bytes the job reads, its setup, its segments and the engine's results: a corrected
    // file is the same M1 write with other text (spec Amendment G)
    const input = new Uint8Array(await file.arrayBuffer());
    const kept = { setup: null, segments: [], results: [] };
    renderSteps("extract", false);
    // pipeline.js: the document is read and written here; prepare / translateSegments send only segment text. Each
    // pipeline call hands over CONCURRENCY batches, which cloud.js sends at once.
    const res = await runBrowserJob({ pipeline: engineMod, file: { arrayBuffer: async () => input.buffer },
      name: file.name, notes, onProgress: renderEvent, signal, engine: {
        prepare: async (text, o) => (kept.setup = await cj.prepare(text, o)),
        translateSegments: async (segments, o) => {
          const out = await cj.translateSegments(segments, o);
          kept.segments.push(...segments);
          kept.results.push(...out);
          return out;
        }, batchSize: BATCH_SIZE * CONCURRENCY, modelId: model, device: CLOUD_DEVICE } });
    onCloudDone(res, cj);
    openReview({ mode: "file", cj, segments: kept.segments, results: kept.results,
      job: { input, name: file.name, setup: kept.setup, notes, modelId: model, device: CLOUD_DEVICE } });
  } catch (e) {
    onCloudFail(e);
  } finally {
    setRunning(false);
  }
}

// ---- PDF (spec Amendment H, cloud only): web/pdf/job.js reads the PDF in the page (pdf.js; scanned pages through
// the shared OCR module), sends only the blocks' text through the same cloud job as a DOCX, and writes two files here:
// <stem>_vi.pdf (the layout kept, the Vietnamese in place of the English) and <stem>_vi.docx (the same blocks).

let pdfMods = null;  // { job, libs } of web/pdf/, loaded at the first PDF

async function loadPdfMods() {
  if (!pdfMods) {
    try {
      const [job, libs] = await Promise.all([import("./pdf/job.js"), import("./pdf/libs.js")]);
      pdfMods = { job, libs, loaded: await libs.loadPdfLibs() };
    } catch (e) {
      throw Object.assign(new Error("web/pdf: " + (e && e.message ? e.message : e)), { code: "engine_missing" });
    }
  }
  return pdfMods;
}

const pdfBlob = (out, type) => URL.createObjectURL(new Blob([out.bytes], { type }));

// both downloads on the result card; without a layout PDF (encrypted ...) the DOCX is the main one
function showPdfDownloads(res) {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  if (docxUrl) URL.revokeObjectURL(docxUrl);
  docxUrl = null;
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const main = res.pdf || res.docx;
  resultUrl = pdfBlob(main, res.pdf ? "application/pdf" : DOCX);
  renderReport(res.report, false, { href: resultUrl, name: main.name });
  $("download").textContent = res.pdf ? "Tải PDF" : "Tải bản DOCX";
  if (res.pdf) {
    docxUrl = pdfBlob(res.docx, DOCX);
    $("download-docx").href = docxUrl;
    $("download-docx").setAttribute("download", res.docx.name);
    $("download-docx").hidden = false;
  }
  const why = res.report.pdf && res.report.pdf.error;
  if (why) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = PDF_NO_LAYOUT[why] || PDF_NO_LAYOUT.write_failed;
    $("skipped").prepend(p);
  }
}

// the job's own events (OCR) as log lines; the rest as for a DOCX
function pdfEvent(ev) {
  if (ev.stage === "ocr") {
    const line = "Nhận dạng chữ trang ảnh quét " + ev.page + "/" + ev.pages;
    $("progress-note").textContent = line;
    log(line);
    return;
  }
  renderEvent(ev);
}

// The engine of a page-pipeline job (text, subtitles, PDF): the cloud, or the helper's sentence routes (Trên máy: no
// consent dialog, no browser check, its model and device in the notice and the report, no term review)
function pageJobEngine() {
  if (engine === "cloud") {
    return { viaCloud: true, model: (cloudStatus && cloudStatus.model) || CLOUD_MODEL, kind: "cloud", device: CLOUD_DEVICE };
  }
  return { viaCloud: false, model: health.model_default, kind: health.device.kind,
    device: { kind: health.device.kind, name: health.device.name } };
}

const stagesOf = (stages, pe) => (pe.viaCloud ? stages : stages.filter(([k]) => k !== "session"));

async function startPdf(file) {
  const pe = pageJobEngine();
  if (pe.viaCloud && !(await askConsent())) { log(cloudErrorText("declined")); return; }
  closeReview();
  beginProgress(stagesOf(CLOUD_STAGES, pe));
  job = { engine: "cloud", started: Date.now(), est: null, translateLog: makeThrottle(5, 10000),
    polishLog: makeThrottle(5, 10000), ctrl: new AbortController() };
  const signal = job.ctrl.signal;
  const model = pe.model;
  cloudNotice(model, pe.kind);
  setRunning(true);
  log("Bắt đầu dịch: " + file.name);
  try {
    const eng = await adapter.ready(signal);
    const mods = await loadPdfMods();
    const cj = cloudJob(eng.client, { jobId: crypto.randomUUID(), signal, renew: eng.renew, onRetry: retryLine });
    const input = new Uint8Array(await file.arrayBuffer());
    const kept = { segments: [], results: [] };
    let ocrShown = -1;
    const ocr = mods.libs.ocrEngine({ signal, onProgress: (p) => {
      if (p.stage !== "download" || !p.total) return;
      const pct = Math.floor((100 * p.loaded) / p.total);
      if (pct === ocrShown || (pct % 10 && pct !== 100)) return;
      ocrShown = pct;
      $("progress-note").textContent = "Đang tải bộ nhận dạng chữ (một lần): " + pct + "%";
      if (pct === 0 || pct === 100) log("Tải bộ nhận dạng chữ: " + pct + "%");
    } });
    renderSteps("extract", false);
    const res = await mods.job.translatePdf(input, file.name, { libs: mods.loaded, onProgress: pdfEvent, signal,
      prepare: (text, o) => cj.prepare(text, o),
      translateSegments: async (segments, o) => {
        const out = await cj.translateSegments(segments, o);
        kept.segments.push(...segments);
        kept.results.push(...out);
        return out;
      }, batchSize: BATCH_SIZE * CONCURRENCY, modelId: model, device: pe.device, ocr, render: mods.libs.render });
    renderSteps("done", true);
    setBar(100);
    showPdfDownloads(res);
    $("q-eta").textContent = "Đã xong sau " + elapsedText();
    log("Xong sau " + elapsedText() + " · " + ((res.report.counts || {}).flagged || 0) + " đoạn cần xem lại · tệp: "
      + [res.pdf && res.pdf.name, res.docx.name].filter(Boolean).join(", "));
    const rv = reviewText(res.report);
    if (rv) log(rv.line);
    if (kept.segments.length && pe.viaCloud) {  // the term review asks the cloud (/terms): not on Trên máy
      openReview({ mode: "file", cj, segments: kept.segments, results: kept.results,
        job: { kind: "pdf", state: res.state, name: file.name } });
    }
  } catch (e) {
    onCloudFail(e);
  } finally {
    setRunning(false);
  }
}

// ---- text mode (the cloud, or the helper's sentence routes on Trên máy) ----

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
  const pe = pageJobEngine();
  if (pe.viaCloud && !(await askConsent())) { log(cloudErrorText("declined")); return; }
  closeReview();
  beginProgress(stagesOf(TEXT_STAGES, pe));
  textJob = { t, results: [] };
  $("text-out").textContent = "";
  $("text-packs").textContent = "";
  $("text-copied").textContent = "";
  $("text-result").hidden = true;
  job = { engine: "cloud", started: Date.now(), est: null, translateLog: makeThrottle(5, 10000),
    polishLog: makeThrottle(5, 10000), ctrl: new AbortController() };
  const signal = job.ctrl.signal;
  const model = pe.model;
  cloudNotice(model, pe.kind);
  setRunning(true);
  log("Bắt đầu dịch văn bản: " + t.segments.length + " đoạn");
  log(noticeText(model, pe.kind));  // the file flow logs it from the pipeline's device event
  try {
    const eng = await adapter.ready(signal);
    const cj = cloudJob(eng.client, { jobId: crypto.randomUUID(), signal, renew: eng.renew, onRetry: retryLine });
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
    if (pe.viaCloud) openReview({ mode: "text", cj, segments: t.segments, results: textJob.results });
  } catch (e) {
    onCloudFail(e);
  } finally {
    setRunning(false);
  }
}

// ---- subtitles (the cloud or the helper): sub/subtitles.js parses the box, makes the segments and writes the file ----

async function loadSub() {
  if (!subMod) subMod = await import("./sub/subtitles.js");
  return subMod;
}

// the box parsed again after each change: the cue count, the output format following the input's
let lastFormat = "";
function readSub() {
  if (!subMod) return;
  const text = $("sub-src").value;
  const big = text.length > subMod.SUB_MAX_BYTES;
  subDoc = /\S/.test(text) && !big ? subMod.parseSubs(text) : null;
  const n = subDoc ? subDoc.cues.length : 0;
  const count = $("sub-count");
  count.textContent = big ? SUB_BIG : n ? n + " câu thoại · " + subDoc.format.toUpperCase() : /\S/.test(text) ? SUB_BAD
    : SUB_NONE;
  count.classList.toggle("over", big || (!n && /\S/.test(text)));
  if (subDoc && n && subDoc.format !== lastFormat) {
    lastFormat = subDoc.format;
    for (const r of document.querySelectorAll('input[name="sub-format"]')) r.checked = r.value === subDoc.format;
  }
  if (!/\S/.test(text)) { subSource = ""; $("sub-filename").textContent = ""; }
  updateGo();
}

async function pickSub(file) {
  if (!file) return;
  const mod = await loadSub();
  if (file.size > mod.SUB_MAX_BYTES) {
    $("sub-count").textContent = SUB_BIG;
    $("sub-count").classList.add("over");
    subDoc = null;
    updateGo();
    return;
  }
  $("sub-src").value = mod.decodeSubs(new Uint8Array(await file.arrayBuffer()));
  subSource = file.name;
  readSub();
  $("sub-filename").textContent = file.name;
}

const subChoice = (name) => (document.querySelector('input[name="' + name + '"]:checked') || {}).value;

// the subtitle file of the job's results (results: the job's, or the corrected ones) in the chosen form
function subFile(results) {
  const format = subChoice("sub-format") === "vtt" ? "vtt" : "srt";
  const vi = subMod.subResults(subJob.doc, subJob.sub, results);
  const text = subMod.writeSubs(subJob.doc, vi, { format, bilingual: subChoice("sub-kind") !== "vi" });
  // SRT with a BOM (players on Windows read it as UTF-8), as the live tool's export
  return { name: subMod.subName(subJob.name, format), blob: new Blob([(format === "srt" ? "﻿" : "") + text],
    { type: format === "srt" ? "application/x-subrip;charset=utf-8" : "text/vtt;charset=utf-8" }) };
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// the translated cues in order (time, Vietnamese, English, flags); a batch at a time, or all of them again
function appendSub(results) {
  const ol = $("sub-out");
  const vi = subMod.subResults(subJob.doc, subJob.sub, results);
  for (const r of results) {
    const ref = subJob.sub.refs[r.id];
    const cue = subJob.doc.cues[ref.cue];
    const li = document.createElement("li");
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = subMod.formatTime(cue.start, "vtt").slice(0, 8);
    const v = document.createElement("p");
    v.className = "vi";
    v.textContent = subMod.shownText(vi[ref.cue] || []);  // on screen without markup; the file keeps it
    const en = document.createElement("p");
    en.className = "en";
    en.lang = "en";
    en.textContent = subMod.shownText(cue.lines);
    li.append(t, v, en);
    if (isFlagged(r.level, r.flags)) {
      const f = document.createElement("p");
      f.className = "flags";
      f.textContent = [LEVELS[r.level]].concat((r.flags || []).map(flagLabel)).filter(Boolean).join("; ");
      li.appendChild(f);
    }
    ol.appendChild(li);
  }
  $("sub-result").hidden = mode !== "sub";
}

function showSubName() {
  if (subJob) $("sub-name").textContent = subMod.subName(subJob.name, subChoice("sub-format") === "vtt" ? "vtt" : "srt");
}

// after Áp dụng: the corrected file next to the job's own one (both in the chosen form)
function setCorrectedSub(r) {
  if (!r || r.mode !== "sub" || !r.corrected) return;
  if (r.url) URL.revokeObjectURL(r.url);
  const f = subFile(r.corrected);
  r.url = URL.createObjectURL(f.blob);
  const a = $("terms-download");
  a.href = r.url;
  a.setAttribute("download", f.name);
  a.hidden = false;
}

// The cues through the cloud engine: classify once (the cue texts, profile file), then batches of <= 20 with the
// neighbouring cues as context; the Vietnamese shows up batch by batch.
async function startSub() {
  if (!subMod || !subDoc) return;
  const doc = subDoc;
  const sub = subMod.subSegments(doc);
  if (!sub.segments.length) return;
  const pe = pageJobEngine();
  if (pe.viaCloud && !(await askConsent())) { log(cloudErrorText("declined")); return; }
  closeReview();
  beginProgress(stagesOf(TEXT_STAGES, pe));
  subJob = { doc, sub, results: [], name: subSource };
  $("sub-out").textContent = "";
  $("sub-packs").textContent = "";
  $("sub-summary").textContent = "";
  $("sub-result").hidden = true;
  showSubName();
  job = { engine: "cloud", started: Date.now(), est: null, translateLog: makeThrottle(5, 10000),
    polishLog: makeThrottle(5, 10000), ctrl: new AbortController() };
  const signal = job.ctrl.signal;
  const model = pe.model;
  cloudNotice(model, pe.kind);
  setRunning(true);
  const total = sub.segments.length;
  log("Bắt đầu dịch phụ đề: " + (subSource || "nội dung đã dán") + " · " + total + " câu thoại");
  log(noticeText(model, pe.kind));
  try {
    const eng = await adapter.ready(signal);
    const cj = cloudJob(eng.client, { jobId: crypto.randomUUID(), signal, renew: eng.renew, onRetry: retryLine });
    const setup = await cj.prepare(sub.fullText, { domain: "", profile: "file" });
    renderEvent(setup.classify);
    $("sub-packs").textContent = packsLineShort(setup.classify);
    await cj.translateSegments(sub.segments, { onBatch: (done, batch) => {
      subJob.results.push(...batch);
      appendSub(batch);
      renderEvent({ stage: "translate", done, total, where: sub.segments[done - 1].where });
    } });
    renderSteps("done", true);
    setBar(100);
    $("q-eta").textContent = "Đã xong sau " + elapsedText();
    const flagged = subJob.results.filter((r) => isFlagged(r.level, r.flags)).length;
    $("sub-summary").textContent = total + " câu thoại đã dịch · " + flagged + " câu cần xem lại";
    log("Xong sau " + elapsedText() + " · " + total + " câu thoại · " + flagged + " câu cần xem lại");
    if (pe.viaCloud) openReview({ mode: "sub", cj, segments: sub.segments, results: subJob.results });
  } catch (e) {
    onCloudFail(e);
  } finally {
    setRunning(false);
  }
}

// results: the paragraphs to copy (default: what the page shows); done: the line once copied
async function copyText(results, done) {
  if (!textJob) return;
  const text = textOutput(textJob.t, results || textJob.results);
  try {
    await navigator.clipboard.writeText(text);
    $("text-copied").textContent = done || "Đã sao chép.";
  } catch (e) {
    $("text-copied").textContent = "Trình duyệt không cho sao chép tự động: hãy chọn bản dịch rồi sao chép.";
  }
}

// ---- "Xem lại thuật ngữ" (spec Amendment G): after a cloud job, file or text. Two lists: "Từ mới" (POST /terms when
// the panel is first opened) and "Đã tự sửa" (the results' fixes). "Áp dụng" puts the user's Vietnamese into the
// segments whose source has the English term (web/terms.js), then the text shows it or the corrected file is written
// by the same M1 layer as the job (rewriteFile); the original stays. Every time, one question before term pairs go
// to the author (POST /feedback), also from the "Gửi cho tác giả" button. Errors stay in the panel: the
// translation itself is valid. Not in the local mode. ----

const TERMS_LOADING = "Đang tìm từ mới…";
const TERMS_NONE = "Không có từ mới.";

function drafts() {
  return new Map(Array.from($("terms").querySelectorAll("input.term-vi"), (i) => [i.dataset.key, i.value]));
}

function updateTermButtons() {
  if (!review) return;
  $("terms-apply").disabled = review.busy || !review.state.changes(drafts()).length;
  $("terms-send").disabled = review.busy || !review.state.toSend().length;
}

// the Vietnamese of a row, editable; typed: what the user has typed so far (kept across re-renders)
function termInput(row, typed) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "term-vi";
  input.maxLength = VI_MAX_CHARS;
  input.lang = "vi";
  input.spellcheck = false;
  input.dataset.key = row.key;
  input.value = typed.has(row.key) ? typed.get(row.key) : row.value;
  input.setAttribute("aria-label", "Tiếng Việt của " + row.en);
  input.addEventListener("input", updateTermButtons);
  return input;
}

function renderTerms() {
  const s = review.state;
  const typed = drafts();
  const nb = $("terms-new").querySelector("tbody");
  nb.textContent = "";
  for (const row of s.fresh) {
    const vi = cell("", "", "Tiếng Việt");
    vi.appendChild(termInput(row, typed));
    const tr = document.createElement("tr");
    tr.append(cell(row.en, "", "Tiếng Anh"), vi, cell(String(row.count), "num", "Số lần"));
    nb.appendChild(tr);
  }
  $("terms-new").hidden = !s.fresh.length;
  const fb = $("terms-fixed").querySelector("tbody");
  fb.textContent = "";
  for (const row of s.fixed) {
    const was = cell("", "", "Mô hình viết");
    const del = document.createElement("del");
    del.textContent = row.from;
    was.appendChild(del);
    const vi = cell("", "", "Đã sửa thành");
    vi.appendChild(termInput(row, typed));
    const tr = document.createElement("tr");
    tr.append(cell(row.en, "", "Tiếng Anh"), was, vi, cell(String(row.count), "num", "Số lần"));
    fb.appendChild(tr);
  }
  $("terms-fixed-box").hidden = !s.fixed.length;
  updateTermButtons();
}

function closeReview() {
  if (review) {
    review.ctrl.abort();
    if (review.url) URL.revokeObjectURL(review.url);
    if (review.docxUrl) URL.revokeObjectURL(review.docxUrl);
  }
  review = null;
  $("terms").hidden = true;
  $("terms-box").open = false;
  for (const id of ["terms-new", "terms-fixed"]) $(id).querySelector("tbody").textContent = "";
  $("terms-new").hidden = $("terms-fixed-box").hidden = $("terms-retry").hidden = true;
  $("terms-download").hidden = $("terms-copy-original").hidden = $("terms-download-docx").hidden = true;
  $("terms-download").href = $("terms-download-docx").href = "#";
  for (const id of ["terms-new-note", "terms-status", "terms-sent"]) showText(id, "");
  $("terms-apply").disabled = $("terms-send").disabled = true;
}

// The review of a finished cloud job, closed, right under its result. r: { mode, cj (the job's cloudJob: its id,
// setup and session renewal), segments, results, job (file mode: input bytes, name, setup, notes, modelId, device) }
function openReview(r) {
  closeReview();
  review = Object.assign({}, r, { state: new TermReview({ segments: r.segments, results: r.results,
    pack: mainPack(r.cj.setup) }), ctrl: new AbortController(), queue: Promise.resolve(), loaded: false,
    loading: false, busy: false, url: null });
  (r.mode === "text" ? $("text-result") : r.mode === "sub" ? $("sub-result") : $("result")).after($("terms"));
  renderTerms();
  $("terms").hidden = mode !== r.mode;
}

// one request of the review at a time (a renewed session needs Turnstile once, not twice at once)
function serial(r, fn) {
  const run = r.queue.then(fn, fn);
  r.queue = run.catch(() => {});
  return run;
}

async function loadTerms() {
  const r = review;
  if (!r || r.loaded || r.loading) return;
  $("terms-retry").hidden = true;
  const items = r.state.items();
  if (!items.length) {
    r.loaded = true;
    showText("terms-new-note", TERMS_NONE);
    return;
  }
  r.loading = true;
  showText("terms-new-note", TERMS_LOADING);
  try {
    const answer = await serial(r, async () => {
      await session.ensure(r.ctrl.signal);
      return r.cj.terms(items, { signal: r.ctrl.signal });
    });
    if (review !== r) return;
    r.state.setNew(answer);
    r.loaded = true;
    showText("terms-new-note", r.state.fresh.length ? "" : TERMS_NONE);
    renderTerms();
  } catch (e) {
    const code = errorCode(e);
    if (review !== r || code === "aborted") return;
    showText("terms-new-note", termsErrorText(code));
    $("terms-retry").hidden = code === "quota_exceeded" || code === "budget_exhausted";
    if (code === "bad_turnstile" || code === "session_expired") cloud.dropSession();
  } finally {
    r.loading = false;
  }
}

// the corrected file: the job's M1 write again with the corrected results, offered next to the original
async function writeCorrected(r) {
  if (r.job.kind === "pdf") return writeCorrectedPdf(r);
  const out = await rewriteFile(engineMod.translateFile, r.job, r.state.current);
  if (review !== r) return;
  if (r.url) URL.revokeObjectURL(r.url);
  const ext = ((/\.([^.]+)$/.exec(out.name) || [])[1] || "").toLowerCase();
  r.url = URL.createObjectURL(new Blob([out.bytes], { type: MIME[ext] || "application/octet-stream" }));
  const a = $("terms-download");
  a.href = r.url;
  a.setAttribute("download", out.name);
  a.hidden = false;
}

// a PDF job: both files again from the corrected results (nothing is read or translated again)
async function writeCorrectedPdf(r) {
  const out = await pdfMods.job.writeOutputs(r.job.state, r.state.current);
  if (review !== r) return;
  if (r.url) URL.revokeObjectURL(r.url);
  if (r.docxUrl) URL.revokeObjectURL(r.docxUrl);
  r.docxUrl = null;
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const main = out.pdf || out.docx;
  r.url = pdfBlob(main, out.pdf ? "application/pdf" : DOCX);
  const a = $("terms-download");
  a.href = r.url;
  a.setAttribute("download", main.name);
  a.hidden = false;
  if (out.pdf) {
    r.docxUrl = pdfBlob(out.docx, DOCX);
    const d = $("terms-download-docx");
    d.href = r.docxUrl;
    d.setAttribute("download", out.docx.name);
    d.hidden = false;
  }
}

async function applyTerms() {
  const r = review;
  if (!r || r.busy) return;
  const res = r.state.apply(drafts());
  if (!res.rows.length) return;
  r.busy = true;
  updateTermButtons();
  let line = res.segments ? "Đã sửa " + res.segments + " đoạn." : "";
  if (res.missing.length) line += (line ? " " : "") + "Không thấy trong bản dịch: " + res.missing.join(", ") + ".";
  try {
    if (res.segments && r.mode === "file") await writeCorrected(r);
    else if (res.segments && r.mode === "sub") {
      // the cues show the corrected Vietnamese; the corrected file next to the job's own download
      r.corrected = r.state.current;
      $("sub-out").textContent = "";
      appendSub(r.corrected);
      setCorrectedSub(r);
    } else if (res.segments) {
      textJob.results = r.state.current;
      $("text-out").textContent = "";
      $("text-copied").textContent = "";
      appendText(r.state.current);
      $("terms-copy-original").hidden = false;
    }
  } catch (e) {
    line = "Chưa ghi được tệp đã sửa.";
  } finally {
    r.busy = false;
  }
  if (review !== r) return;
  showText("terms-status", line);
  renderTerms();
  await askFeedback(res.rows);
}

// Every time: the one question with the rows that would go; "Gửi" sends them, "Không" (or Esc) sends nothing.
function askFeedback(rows) {
  const r = review;
  if (!r) return Promise.resolve();
  const batch = feedbackBatch(rows, r.state.pack);
  if (!batch.items.length) return Promise.resolve();
  const ul = $("feedback-rows");
  ul.textContent = "";
  for (const it of batch.items) {
    const li = document.createElement("li");
    li.textContent = it.en + ": " + (it.vi_user === it.vi_used ? it.vi_user : it.vi_used + " → " + it.vi_user);
    ul.appendChild(li);
  }
  const dlg = $("feedback");
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => {
      resolve(dlg.returnValue === "send" && review === r ? sendFeedback(r, batch) : undefined);
    }, { once: true });
    dlg.returnValue = "";
    dlg.showModal();
  });
}

async function sendFeedback(r, batch) {
  r.busy = true;
  updateTermButtons();
  showText("terms-sent", "Đang gửi…");
  try {
    await serial(r, async () => {
      await session.ensure(r.ctrl.signal);
      return r.cj.feedback(batch.items, { signal: r.ctrl.signal });
    });
    if (review !== r) return;
    r.state.markSent(batch.rows);
    showText("terms-sent", "Đã gửi, cảm ơn.");
  } catch (e) {
    const code = errorCode(e);
    if (review !== r || code === "aborted") return;
    showText("terms-sent", feedbackErrorText(code));
    if (code === "bad_turnstile" || code === "session_expired") cloud.dropSession();
  } finally {
    if (review === r) {
      r.busy = false;
      updateTermButtons();
    }
  }
}

// After "Mở ViTranslate" (vitranslate://start): the helper is looked for every 2 s for a minute, until it answers.
function stopHelperRetry() {
  clearInterval(helperRetry);
  helperRetry = null;
}

function openHelper() {
  location.href = "vitranslate://start";
  stopHelperRetry();
  const until = Date.now() + HELPER_RETRY_FOR_MS;
  helperRetry = setInterval(() => {
    if (!local || engine === "helper" || Date.now() > until) { stopHelperRetry(); return; }
    refreshStatus();
  }, HELPER_RETRY_MS);
}

function init() {
  // the menu (web/settings.js); the cloud by default, Trên máy when it was chosen (the old switch carried over) or on
  // the helper's own page
  settings = initSettings();
  local = prefs.engine() === "local";
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
  $("src-text").addEventListener("input", updateCount);
  // "Phụ đề": a file (picked or dropped) fills the box; the box is parsed after each change
  const subDrop = $("sub-drop");
  $("sub-file").addEventListener("change", (e) => { pickSub(e.target.files[0]); e.target.value = ""; });
  subDrop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") $("sub-file").click(); });
  subDrop.addEventListener("dragover", (e) => { e.preventDefault(); subDrop.classList.add("over"); });
  subDrop.addEventListener("dragleave", () => subDrop.classList.remove("over"));
  subDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    subDrop.classList.remove("over");
    if (e.dataTransfer.files.length) pickSub(e.dataTransfer.files[0]);
  });
  $("sub-src").addEventListener("input", () => { if (subMod) readSub(); });
  for (const r of document.querySelectorAll('input[name="sub-format"], input[name="sub-kind"]')) {
    r.addEventListener("change", () => { showSubName(); if (review) setCorrectedSub(review); });
  }
  $("sub-download").addEventListener("click", () => {
    if (!subJob) return;
    const f = subFile(subJob.results);
    saveBlob(f.blob, f.name);
  });
  $("text-copy").addEventListener("click", () => copyText());
  $("terms-box").addEventListener("toggle", () => { if ($("terms-box").open) loadTerms(); });
  $("terms-retry").addEventListener("click", loadTerms);
  $("terms-apply").addEventListener("click", applyTerms);
  $("terms-send").addEventListener("click", () => { if (review && !review.busy) askFeedback(review.state.toSend()); });
  $("terms-copy-original").addEventListener("click", () => {
    if (review && review.mode === "text") copyText(review.state.original, "Đã sao chép bản chưa sửa.");
  });
  $("opt-polish").addEventListener("change", () => { polishTouched = true; });
  $("opt-fast").addEventListener("change", () => { fastTouched = true; });
  // the menu's "Dịch bằng": every tool follows (the menu locks it while a job runs)
  prefs.on("engine", (v) => {
    local = v === "local";
    stopHelperRetry();
    if (local) closeReview();  // nothing goes to the cloud on Trên máy: no term review there
    log(local ? "Đã chọn Trên máy: nội dung không rời máy." : "Đã chọn Máy chủ.");
    if (local) log(CHECKING);
    renderLocalCards();
    refreshStatus();
  });
  // a tool found (or lost) the helper: the pill, the cards and "Dịch" follow
  helperLink.onChange(() => { if (local && !running) setTimeout(refreshStatus, 0); });
  $("agree").addEventListener("change", () => { $("consent-ok").disabled = !$("agree").checked; });
  $("consent").addEventListener("cancel", (e) => e.preventDefault());  // only its button closes it
  $("retry").addEventListener("click", refreshStatus);
  // the installed helper registers vitranslate://; the page then looks for it again
  $("start-helper").addEventListener("click", openHelper);
  $("helper-open").addEventListener("click", openHelper);
  $("setup-retry").addEventListener("click", async () => {
    $("setup-retry").hidden = true;
    await post("/api/setup/start", {});
    watchSetup();
  });
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
    if (docxUrl) { URL.revokeObjectURL(docxUrl); docxUrl = null; }
    $("download-docx").hidden = true;
    if (review && review.mode === "file") closeReview();
    $("result").hidden = $("progress").hidden = true;
  });
  // the tool tabs: the one in the link (#tai-lieu ...) or "Văn bản"; the image and live modules load on their tab
  tabs = initTabs({ onChange: onTool });
  refreshStatus();
  // the first visit: the one consent dialog (the live tool asks its own, with its own wording); Trên máy sends
  // nothing to the server: asked at the first cloud job instead
  if (tool !== "live" && !local) askConsent();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
