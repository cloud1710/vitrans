// ViTranslate WebGPU lab page: measures whether an in-browser model can translate on this device.
// Synthetic test items only; nothing is sent anywhere. Results stay on the page until the user copies them.
import { MODELS, TJS_VERSION, WEBLLM_VERSION, LITERT_VERSION, probeDevice, checkFit, deleteCached, loadModel,
  speedSummary, tagCheck, tagIds, cleanAnswer, round, STATE_KEY, memoryProbe, gpuAllocate, takeKilledProbe, readUnfit,
  clearUnfit, unfitFor, probeBytes, APPLE_DEVICES, MIN_RAM_GB, deviceVerdict, screenCandidates, wasmFeatures,
  bufferTracker, watchGpuBuffers, watchGpuTextures } from "./core.js";

const LAB_VERSION = "4";
const GIB = 1073741824;
// ?litert_wasm=compat-asyncify loads Safari's LiteRT-LM wasm build on another browser (measurement only)
const LITERT_WASM_FORCE = new URLSearchParams(location.search).get("litert_wasm");
// every GPU buffer and texture the runtimes create (installed before any library loads)
const gpuWatch = { buffers: bufferTracker(), textures: bufferTracker() };
const gpuMB = (s) => ({ count: s.count, live_mb: Math.round(s.live / 1048576), peak_mb: Math.round(s.peak / 1048576),
  largest_mb: Math.round(s.largest / 1048576) });
const gpuReset = () => { gpuWatch.buffers.reset(); gpuWatch.textures.reset(); };
const gpuStats = () => ({ buffers: gpuMB(gpuWatch.buffers.stats()), textures: gpuMB(gpuWatch.textures.stats()) });

// ---- prompts: modelled on helper/vitranslate/translate.py build_system / build_user, self-contained ----

const STYLE = `Quy tắc hành văn tiếng Việt (bắt buộc):
1. Định ngữ đứng sau danh từ chính; dịch theo nghĩa, câu văn tự nhiên, không dịch từng chữ.
2. Bỏ chủ ngữ giả "It is / There is"; bỏ "một / của / sự / việc" thừa; giữ bị động khi tự nhiên.
3. Viết hoa kiểu Việt: chỉ chữ đầu câu và tên riêng.
4. Số thập phân trong câu văn dùng dấu phẩy (0.36% -> 0,36%); giữ nguyên mã, đơn vị, khoảng số.
5. Tiêu đề, nhãn, ô bảng: cụm danh từ ngắn gọn, không viết thành câu.`;

const DOMAIN = `Chuyên ngành: Giải phẫu bệnh. Giọng giáo trình y khoa Việt Nam, chính xác.
- Giữ nguyên tiếng Anh: tên gen, protein, kháng thể, dấu ấn (BRAF, SOX10, Ki-67), mã và staging.`;

const TAG_RULES = `The text may contain inline formatting tag pairs such as <g1>…</g1> and placeholders such as <x1/>.
Rules:
- Keep EVERY tag and placeholder exactly once, with the same number. Put each tag pair around the Vietnamese words
  that translate the words it wraps. Word order may change; tags move with their words.
- Do not add new tags. Do not translate gene names, numbers, units, codes or abbreviations.
- Use the glossary translations for the listed terms.
- Output ONLY the Vietnamese translation, nothing else.`;

const GLOSSARY = [
  ["spindle cell", "tế bào hình thoi"], ["fascicle", "bó"], ["immunohistochemistry", "hóa mô miễn dịch"],
  ["mitotic figures", "phân bào"], ["HPF", "vi trường"], ["necrosis", "hoại tử"], ["H&E staining", "nhuộm H&E"],
  ["resection margin", "diện cắt"], ["lymphovascular invasion", "xâm lấn mạch bạch huyết"],
  ["papillary thyroid carcinoma", "ung thư biểu mô tuyến giáp dạng nhú"], ["high-grade", "độ cao"],
  ["overall survival", "sống còn toàn bộ"], ["biopsy", "sinh thiết"], ["differential diagnosis", "chẩn đoán phân biệt"],
];

// Synthetic sentences written for this lab (not from any user document).
const ITEMS = [
  "The tumour is composed of <g1>spindle cells</g1> arranged in short fascicles.",
  "Immunohistochemistry showed diffuse nuclear positivity for <g1>SOX10</g1> and was negative for <g2>desmin</g2>.",
  "Mitotic figures were rare (2 per 10 HPF), and no necrosis was identified.",
  "<g1>Figure 2.</g1> H&E staining of the resected specimen at low magnification.",
  "All resection margins were free of tumour, the closest being 3 mm.<x1/>Lymphovascular invasion was not seen.",
  "Molecular testing detected a <g1>BRAF</g1> V600E mutation, which supports the diagnosis of <g2>papillary thyroid carcinoma</g2>.",
  "Differential diagnosis",
  "Patients with <g1>high-grade</g1> tumours had a shorter overall survival (p < 0.001).",
  "A core biopsy is recommended when the nodule is larger than 1 cm or has <g1>irregular borders</g1> on ultrasound.",
  "The Ki-67 index reached 15% in the <g1>most <g2>proliferative</g2> areas</g1> of the tumour.",
];

function buildSystem() {
  const gl = "Glossary (English = Vietnamese):\n" + GLOSSARY.map(([en, vi]) => "- " + en + " = " + vi).join("\n");
  return ["You translate English documents (Giải phẫu bệnh) into natural academic Vietnamese.", STYLE, DOMAIN,
    TAG_RULES, gl].join("\n\n");
}

function buildUser(tagged) {
  const { g, x } = tagIds(tagged);
  const reminder = (!g.length && !x.length) ? "This text has no tags; do not add any."
    : "Keep these tags exactly once each, around the matching Vietnamese words: "
      + g.map((n) => "<g" + n + ">…</g" + n + ">").concat(x.map((n) => "<x" + n + "/>")).join(", ");
  return reminder + "\n\nTranslate:\n" + tagged;
}

// Glossary adherence: for each glossary term in the source (case-insensitive, plurals ok), is its Vietnamese present?
// "HPF" kept as "HPF" counts as correct (the domain rules keep abbreviations).
function termCheck(src, out) {
  const s = src.toLowerCase(), o = out.toLowerCase();
  const res = { want: 0, ok: 0, missed: [] };
  for (const [en, vi] of GLOSSARY) {
    const stem = en.toLowerCase();
    if (!s.includes(stem)) continue;
    res.want += 1;
    if (o.includes(vi.toLowerCase()) || (en === en.toUpperCase() && out.includes(en))) res.ok += 1; else res.missed.push(en);
  }
  return res;
}

// ---- page state ----

const $ = (id) => document.getElementById(id);
let device = null, session = null, loaded = null, results = null, heapPeak = 0, heapTimer = null, prevCrash = null;
let lastProbe = null;
const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();

function saveState(st) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) { /* private mode: no recovery */ }
}
function readState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { return null; }
}

const fmtMB = (bytes) => (bytes == null ? "?" : Math.floor(bytes / 1048576) + " MB");
const vn = (x, d) => (x == null ? "?" : Number(x).toFixed(d).replace(".", ","));
const errText = (e) => String(e && e.message ? e.message : e);

function row(dl, k, v) {
  const dt = document.createElement("dt"); dt.textContent = k;
  const dd = document.createElement("dd"); dd.textContent = v == null || v === "" ? "không rõ" : String(v);
  dl.append(dt, dd);
}

function showDevice(info) {
  const dl = $("device");
  dl.textContent = "";
  row(dl, "Loại thiết bị", info.device_class);
  row(dl, "Trình duyệt", info.browser);
  row(dl, "Số luồng CPU", info.cores);
  row(dl, "RAM (trình duyệt báo)", info.device_memory_gb ? "~" + info.device_memory_gb + " GB" : "không báo (Safari/Firefox)");
  row(dl, "Bộ nhớ lưu trữ cho trang", info.storage && info.storage.quota_mb != null
    ? info.storage.usage_mb + " / " + info.storage.quota_mb + " MB đã dùng" : "không rõ");
  const g = info.webgpu || {};
  row(dl, "WebGPU", g.available ? (g.adapter ? "có" : "có API nhưng không có GPU") : "không có");
  if (g.adapter) {
    const a = g.adapter;
    row(dl, "GPU", [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(" / ") || "không rõ (trình duyệt ẩn)");
    row(dl, "shader-f16", (g.features || []).includes("shader-f16") ? "có" : "không");
    row(dl, "maxBufferSize", fmtMB(g.limits.maxBufferSize));
    row(dl, "maxStorageBufferBindingSize", fmtMB(g.limits.maxStorageBufferBindingSize));
    row(dl, "maxStorageBuffersPerShaderStage", g.limits.maxStorageBuffersPerShaderStage);
  }
  if (g.error) row(dl, "Lỗi WebGPU", g.error);
  if (info.wasm) {
    row(dl, "Wasm (cho LiteRT-LM)", "JSPI " + (info.wasm.jspi ? "có" : "không") + " · relaxed SIMD "
      + (info.wasm.relaxedSimd ? "có" : "không"));
  }
}

function selectedModel() {
  const r = document.querySelector("input[name=model]:checked");
  return r ? MODELS.find((m) => m.key === r.value) : null;
}

const GROUPS = [
  ["onnx", "ONNX · onnxruntime-web (transformers.js " + TJS_VERSION + ")"],
  ["webllm", "WebLLM " + WEBLLM_VERSION + " (MLC, để so sánh)"],
  ["litert", "LiteRT-LM " + LITERT_VERSION + " (Google, Gemma 4)"],
];

const UNFIT_WHY = { killed: "trang bị hệ điều hành đóng", oom: "GPU báo hết bộ nhớ", lost: "GPU bị ngắt (device lost)" };

// A model whose memory probe failed on this device: disabled, with a "Thử lại" button that forgets the failure.
// A smaller model's failure also rules out this one; "Thử lại" then forgets that smaller model's failure.
function unfitLine(m, rec) {
  const p = document.createElement("span"); p.className = "bad";
  const via = rec.model && rec.model !== m.key ? " (" + (rec.name || rec.model) + " cần ít bộ nhớ hơn mà đã không chạy được)" : "";
  p.textContent = "Không khuyến nghị trên máy này: " + (UNFIT_WHY[rec.reason] || rec.reason) + " khi thử cấp phát ~"
    + vn(rec.bytes / GIB, 1) + " GB" + via + ". ";
  const retry = document.createElement("button");
  retry.type = "button"; retry.className = "link"; retry.textContent = "Thử lại";
  retry.addEventListener("click", (e) => {
    e.preventDefault();
    clearUnfit(store, rec.model && rec.model !== m.key ? rec.model : m.key);
    showModels();
    const r = document.querySelector("input[name=model][value=\"" + m.key + "\"]");
    if (r && !r.disabled) { r.checked = true; updateConfirm(); }
  });
  p.append(retry);
  return p;
}

function showModels() {
  const box = $("models");
  box.textContent = "";
  let firstOk = null;
  const unfit = readUnfit(store);
  for (const [runtime, heading] of GROUPS) {
    const h = document.createElement("h3"); h.textContent = heading;
    box.append(h);
    for (const m of MODELS.filter((x) => x.runtime === runtime)) {
      const fit = checkFit(m, device);
      const failed = unfitFor(m.key, probeBytes(fit), unfit);
      const usable = fit.ok && !failed;
      const label = document.createElement("label");
      label.className = "model" + (usable ? "" : " no");
      const input = document.createElement("input");
      input.type = "radio"; input.name = "model"; input.value = m.key; input.disabled = !usable;
      if (usable && !firstOk && m.kind !== "mt") { firstOk = m; input.checked = true; }
      const body = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = m.name + " · tải ~" + vn(m.downloadGB, 2) + " GB · cần ~" + vn(fit.memMB / 1024, 1) + " GB bộ nhớ GPU"
        + (fit.heapMB ? " + ~" + vn(fit.heapMB / 1024, 1) + " GB RAM của trang" : "");
      body.append(title);
      if (m.note) { const p = document.createElement("span"); p.className = "muted"; p.textContent = m.note; body.append(p); }
      for (const t of fit.reasons) { const p = document.createElement("span"); p.className = "bad"; p.textContent = t; body.append(p); }
      for (const t of fit.warnings) { const p = document.createElement("span"); p.className = "warn"; p.textContent = t; body.append(p); }
      if (failed) body.append(unfitLine(m, failed));
      label.append(input, body);
      box.append(label);
      input.addEventListener("change", updateConfirm);
    }
  }
  updateConfirm();
  if (!firstOk) { $("load").disabled = true; $("confirm-text").textContent = "Thiết bị này không chạy được mô hình nào trong danh sách."; }
}

// The device the user named in the picker; a device under MIN_RAM_GB blocks loading unless the user overrides.
const DEVICE_KEY = "vt-lab-device";
let declared = null;

function deviceBlocked() {
  const v = deviceVerdict(declared);
  return !!(v && !v.ok && !$("dev-override").checked);
}

function showVerdict() {
  const v = deviceVerdict(declared);
  const out = $("dev-verdict");
  out.hidden = !v;
  $("dev-override-wrap").hidden = !v || v.ok;
  if (!v) return;
  out.className = "status " + (v.ok ? "ok" : "bad");
  out.textContent = v.ok
    ? "Đạt: " + declared.name + " có " + v.ramText + " RAM (mốc " + MIN_RAM_GB + " GB). Có thể thử bản 4B (WebLLM). "
      + "Máy 8 GB chưa được đo thật, kết quả đo của bạn rất có ích."
    : "Chưa đạt: " + declared.name + " có " + v.ramText + " RAM, cần từ " + MIN_RAM_GB + " GB. Máy này chưa dịch được "
      + "ngay trong trình duyệt, không cần tải mô hình." + (v.measured ? " (Đã đo: iPhone 4–6 GB bị đóng trang khi nạp bản 2B.)" : "")
      + " Vẫn có thể đo thử Gemma 4 E2B (LiteRT-LM): tích ô bên dưới.";
}

function fillDevicePicker() {
  const sel = $("dev-pick");
  // models with this screen size (core.js SCREENS) come first; a single one is pre-selected
  const scr = globalThis.screen || {};
  const near = [...new Set(screenCandidates(device ? device.device_class : "desktop", scr.width, scr.height,
    globalThis.devicePixelRatio || 1).map((c) => c.device))];
  const add = (label, names) => {
    if (!names.length) return;
    const og = document.createElement("optgroup"); og.label = label;
    for (const n of names) { const o = document.createElement("option"); o.value = n; o.textContent = n; og.append(o); }
    sel.append(og);
  };
  add("Cùng kích thước màn hình với máy này", near);
  for (const group of ["iPhone", "iPad"]) {
    add(group, APPLE_DEVICES.filter((x) => x.group === group && !near.includes(x.name)).map((x) => x.name));
  }
  let saved = null;
  try { saved = localStorage.getItem(DEVICE_KEY); } catch (e) { /* private mode */ }
  declared = APPLE_DEVICES.find((d) => d.name === saved) || null;
  if (!declared && near.length === 1) declared = APPLE_DEVICES.find((d) => d.name === near[0]) || null;
  if (declared) sel.value = declared.name;
  sel.addEventListener("change", () => {
    declared = APPLE_DEVICES.find((d) => d.name === sel.value) || null;
    try { if (declared) localStorage.setItem(DEVICE_KEY, declared.name); else localStorage.removeItem(DEVICE_KEY); } catch (e) { /* ignore */ }
    $("dev-override").checked = false;
    showVerdict(); updateConfirm();
  });
  $("dev-override").addEventListener("change", updateConfirm);
  showVerdict();
}

function updateConfirm() {
  const m = selectedModel();
  $("confirm").checked = false;
  $("load").disabled = true;
  $("confirm").disabled = deviceBlocked();
  if (!m) return;
  $("confirm-text").textContent = "Tôi đồng ý tải khoảng " + vn(m.downloadGB, 2)
    + " GB (nên dùng Wi-Fi). Lần sau trình duyệt dùng lại bản đã tải, nếu còn chỗ trống.";
}

function startHeapWatch() {
  heapPeak = 0;
  if (!performance.memory) return;
  heapTimer = setInterval(() => { heapPeak = Math.max(heapPeak, performance.memory.usedJSHeapSize); }, 500);
}
function stopHeapWatch() { if (heapTimer) clearInterval(heapTimer); heapTimer = null; }

async function storageUsedMB() {
  try { const est = await navigator.storage.estimate(); return Math.round(est.usage / 1048576); } catch (e) { return null; }
}

// Memory probe before any download: true = enough memory, go on. A failure is shown, kept in the JSON and, for an
// out-of-memory / lost-device answer, remembered for this model. If iOS kills the tab here, main() reports it.
async function probeFirst(m, fit) {
  if (session) { try { await session.unload(); } catch (e) { /* freed with the page */ } session = null; }
  const size = "~" + vn(probeBytes(fit) / GIB, 1) + " GB";
  $("load-text").textContent = "Đang thử cấp phát " + size + " bộ nhớ GPU trước khi tải (vài giây). "
    + "Nếu máy không đủ bộ nhớ, trình duyệt có thể tự tải lại trang; khi đó trang sẽ báo và không tải mô hình.";
  lastProbe = await memoryProbe(m, device, { store, allocate: (chunks) => gpuAllocate(navigator.gpu, chunks) });
  if (lastProbe.ok) return true;
  const why = UNFIT_WHY[lastProbe.reason];
  $("load-text").textContent = lastProbe.reason === "oom" || lastProbe.reason === "lost"
    ? "Máy này chưa đủ bộ nhớ cho mô hình " + m.name + ": " + why + " khi thử cấp phát " + size + ". Không cần tải mô hình."
    : "Không thử được bộ nhớ GPU trước khi tải (" + lastProbe.message + "). Chưa tải gì.";
  results = makeResults([], "probe_failed");
  showJSON();
  showModels();
  return false;
}

async function doLoad() {
  const m = selectedModel();
  if (!m || !$("confirm").checked) return;
  const fit = checkFit(m, device);
  $("load").disabled = true; $("run").disabled = true;
  if (!(await probeFirst(m, fit))) return;
  $("load-progress").hidden = false; $("load-progress").value = 0;
  $("load-text").textContent = "Đang tải thư viện…";
  const storageBefore = await storageUsedMB();
  saveState({ phase: "load", model: fit.id, at: new Date().toISOString() });
  startHeapWatch();
  gpuReset();
  const loadAt = new Date().toISOString();
  let savedPct = -1;
  try {
    session = await loadModel(m, device, (f, text) => {
      $("load-progress").value = f;
      $("load-text").textContent = Math.round(f * 100) + "% · " + text;
      // every 5 %: if iOS kills the tab, the next page load tells how far loading got
      const pct = Math.floor(f * 20) * 5;
      if (pct !== savedPct) {
        savedPct = pct;
        saveState({ phase: "load", model: fit.id, at: loadAt, pct, text, gpu: gpuStats(),
          js_heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null });
      }
    }, { litertWasm: LITERT_WASM_FORCE });
    const gpu = gpuStats();
    loaded = { key: m.key, model: session.id, runtime: session.runtime, dtype: session.dtype, timings: session.timings,
      download_gb_listed: m.downloadGB, storage_before_mb: storageBefore, storage_after_mb: await storageUsedMB(),
      js_heap_peak_mb: heapPeak ? Math.round(heapPeak / 1048576) : null, gpu, runtime_info: session.info || null };
    $("load-text").textContent = "Đã nạp " + session.id + ": " + vn(session.timings.load_s, 1) + " s, khởi động "
      + vn(session.timings.warmup_s, 1) + " s. Bộ nhớ GPU: bộ đệm " + gpu.buffers.peak_mb + " MB (lớn nhất "
      + gpu.buffers.largest_mb + " MB), texture " + gpu.textures.peak_mb + " MB.";
    $("run").disabled = false;
    saveState({ phase: "loaded", model: session.id, at: new Date().toISOString(), load: loaded });
  } catch (e) {
    $("load-text").textContent = "Lỗi khi nạp mô hình: " + errText(e);
    loaded = { key: m.key, model: fit.id, runtime: m.runtime, error: errText(e), gpu: gpuStats() };
    results = makeResults([], null);
    showJSON();
    saveState({ phase: "load-failed", model: fit.id, at: new Date().toISOString(), error: loaded.error });
    $("load").disabled = false;
  } finally {
    stopHeapWatch();
  }
}

function makeResults(items, error) {
  const ok = items.filter((r) => !r.error);
  return {
    lab_version: LAB_VERSION, libs: { transformers_js: TJS_VERSION, web_llm: WEBLLM_VERSION, litert_lm: LITERT_VERSION },
    time: new Date().toISOString(), device, load: loaded, error: error || null,
    js_heap_peak_mb: heapPeak ? Math.round(heapPeak / 1048576) : null,
    gpu_run: items.length ? gpuStats() : null,
    summary: {
      items: items.length,
      tag_exact: ok.filter((r) => !r.tag_errors.length).length,
      terms_ok: ok.reduce((a, r) => a + r.terms.ok, 0),
      terms_want: ok.reduce((a, r) => a + r.terms.want, 0),
      ...speedSummary(ok),
      total_s: round(items.reduce((a, r) => a + (r.ms || 0), 0) / 1000, 1),
    },
    previous_interruption: prevCrash,
    probe: lastProbe,
    probe_failed: Object.values(readUnfit(store)),
    declared_device: declared ? { name: declared.name, ram_gb: declared.ram, ok: deviceVerdict(declared).ok } : null,
    items,
  };
}

function renderItem(r) {
  const li = document.createElement("li");
  const src = document.createElement("div"); src.className = "src"; src.textContent = r.src;
  const out = document.createElement("div"); out.className = "out"; out.textContent = r.error ? "Lỗi: " + r.error : r.out;
  const meta = document.createElement("div"); meta.className = "meta";
  if (!r.error) {
    const ok = !r.tag_errors.length;
    const tag = document.createElement("span"); tag.className = ok ? "ok" : "bad";
    tag.textContent = ok ? "thẻ đúng" : "thẻ sai: " + r.tag_errors.join("; ");
    const terms = document.createElement("span");
    terms.textContent = " · thuật ngữ " + r.terms.ok + "/" + r.terms.want + (r.terms.missed.length ? " (thiếu: " + r.terms.missed.join(", ") + ")" : "");
    const sp = document.createElement("span"); sp.className = "muted";
    sp.textContent = " · " + vn(r.ms / 1000, 1) + " s · đề " + r.prompt_tokens + " tok" + (r.prefill_tps ? " @ " + r.prefill_tps + " tok/s" : "")
      + " · sinh " + r.completion_tokens + " tok @ " + r.decode_tps + " tok/s" + (r.finish === "length" ? " · BỊ CẮT" : "")
      + (r.thought_chars ? " · CÓ SUY NGHĨ (" + r.thought_chars + " ký tự)" : "");
    meta.append(tag, terms, sp);
  }
  li.append(src, out, meta);
  return li;
}

async function doRun() {
  if (!session) return;
  $("run").disabled = true; $("load").disabled = true;
  const list = $("items");
  list.textContent = "";
  const system = buildSystem();
  const rows = [];
  $("run-progress").hidden = false; $("run-progress").max = ITEMS.length; $("run-progress").value = 0;
  startHeapWatch();
  gpuReset();
  let fatal = null;
  for (let i = 0; i < ITEMS.length; i++) {
    const src = ITEMS[i];
    $("run-text").textContent = "Câu " + (i + 1) + "/" + ITEMS.length + "…";
    saveState({ phase: "run", model: loaded.model, item: i + 1, at: new Date().toISOString(), load: loaded, done: rows });
    const user = buildUser(src);
    let r;
    try {
      const res = await session.generate(system, user, Math.min(1024, 64 + 2 * user.length), src);
      const out = cleanAnswer(src, res.text);
      r = { id: i + 1, src, raw: res.text, out, ...res, tag_errors: tagCheck(src, out), terms: termCheck(src, out) };
      delete r.text;
    } catch (e) {
      r = { id: i + 1, src, error: errText(e) };
      fatal = r.error;
    }
    rows.push(r);
    list.append(renderItem(r));
    $("run-progress").value = i + 1;
    if (fatal && /device|lost|memory|OOM/i.test(fatal)) break;
  }
  stopHeapWatch();
  results = makeResults(rows, fatal);
  const s = results.summary;
  $("run-text").textContent = "Xong: thẻ đúng " + s.tag_exact + "/" + s.items + " · thuật ngữ " + s.terms_ok + "/" + s.terms_want
    + (s.prefill_tps ? " · đọc đề " + s.prefill_tps + " tok/s" : "") + " · sinh " + s.decode_tps + " tok/s · tổng " + vn(s.total_s, 1) + " s"
    + (session.tagsSupported === false ? " (mô hình này không nhận thẻ: thẻ sai là đương nhiên)" : "");
  saveState({ phase: "done", model: loaded.model, at: new Date().toISOString() });
  showJSON();
  $("run").disabled = false; $("load").disabled = !$("confirm").checked;
}

function showJSON() {
  $("json").value = JSON.stringify(results, null, 1);
  $("result-card").hidden = false;
}

async function doCopy() {
  const text = $("json").value;
  try {
    await navigator.clipboard.writeText(text);
    $("copy-text").textContent = "Đã sao chép. Dán vào tin nhắn gửi lại cho nhóm.";
  } catch (e) {
    $("json").focus(); $("json").select();
    $("copy-text").textContent = "Trình duyệt không cho sao chép tự động: chữ đã được chọn, hãy bấm Sao chép trên bàn phím.";
  }
}

async function doClear() {
  const m = selectedModel();
  if (!m) return;
  $("clear-text").textContent = "Đang xóa…";
  try {
    if (session && loaded && loaded.key === m.key) { await session.unload(); session = null; $("run").disabled = true; }
    await deleteCached(m, device);
    const used = await storageUsedMB();
    $("clear-text").textContent = "Đã xóa " + m.name + " khỏi bộ nhớ trình duyệt." + (used != null ? " Trang đang dùng " + used + " MB." : "");
  } catch (e) {
    $("clear-text").textContent = "Không xóa được: " + errText(e);
  }
}

async function main() {
  const killed = takeKilledProbe(store, new Date().toISOString());
  if (killed) {
    prevCrash = killed.marker;
    const p = $("crash");
    p.hidden = false;
    p.textContent = "Máy này chưa đủ bộ nhớ cho mô hình " + (killed.marker.name || killed.marker.model)
      + ": trình duyệt đã bị hệ điều hành đóng khi thử cấp phát ~" + vn(killed.marker.bytes / GIB, 1)
      + " GB. Không cần tải mô hình. Mô hình này được đánh dấu không khuyến nghị trên máy này; "
      + "có thể chọn mô hình nhỏ hơn, hoặc gửi kết quả bên dưới cho nhóm.";
  }
  const st = readState();
  if (st && (st.phase === "load" || st.phase === "run")) {
    prevCrash = st;
    const p = $("crash");
    p.hidden = false;
    p.textContent = "Lần trước trang bị đóng đột ngột khi đang " + (st.phase === "load" ? "nạp " : "chạy câu " + st.item + " với ")
      + st.model + (st.phase === "load" && st.pct != null ? " (đến " + st.pct + "%)" : "") + " (" + st.at
      + "). Thường là do hết bộ nhớ. Thông tin này sẽ được đưa vào kết quả.";
  }
  const devProto = globalThis.GPUDevice && GPUDevice.prototype;
  watchGpuBuffers(devProto, globalThis.GPUBuffer && GPUBuffer.prototype, gpuWatch.buffers);
  watchGpuTextures(devProto, globalThis.GPUTexture && GPUTexture.prototype, gpuWatch.textures);
  device = await probeDevice();
  device.wasm = wasmFeatures();
  showDevice(device);
  fillDevicePicker();
  showModels();
  $("confirm").addEventListener("change", () => {
    $("load").disabled = !$("confirm").checked || !selectedModel() || deviceBlocked();
  });
  $("load").addEventListener("click", doLoad);
  $("run").addEventListener("click", doRun);
  $("copy").addEventListener("click", doCopy);
  $("clear").addEventListener("click", doClear);
  $("device-json").addEventListener("click", () => { results = makeResults([], null); showJSON(); });
  if (prevCrash) { results = makeResults(prevCrash.done || [], killed ? "probe_killed" : "interrupted"); showJSON(); }
}

main();
