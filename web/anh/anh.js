"use strict";
// The image tool (the "Ảnh" tab of the app shell, formerly /anh/; spec Amendment H "Images"): a photo or an uploaded
// picture -> on-device OCR (../ocr/ocr.js) -> lines grouped into blocks (blocks.js) -> the blocks translated by the cloud core (../cloud.js: /classify once per
// photo with profile photo -- a short text gets the pack it names --, /translate in batches of <= 20; segments {id,
// tagged: block text, ALL-CAPS in normal case (caps.js), essential: [], prev, nxt, where: "Ảnh, dòng n"}) -> the
// Vietnamese back in capitals where the line was; a block whose translation is its source keeps its pixels -> the
// English / Vietnamese text per block (copy, share) and the photo with the Vietnamese drawn over the English in the
// original's colour, weight, size and alignment, inside each block's own box (overlay.js; PNG / JPEG download; blocks
// that had to be squeezed are named in the list). Only text leaves the page: never the photo, its boxes or its name. The
// first-use consent is the main page's own dialog (same wording, same remembered key), the browser check and session the
// same flow (../turnstile.js). Its elements carry the prefix "anh-" in the shell; app.js imports this module when the
// tab first opens. Several photos: one after another, a result card each. Already-Vietnamese pictures and
// pictures without text get a short line and are not sent. The menu's "Trên máy" sends the blocks to the ViTranslate
// helper instead (../adapter.js: only the base URL changes; no consent, no browser check, never the cloud).
import { createCloud, cloudJob, sharedSessionStore } from "../cloud.js";
import { cloudErrorText, CLOUD_CONSENT_KEY, isFlagged, packsLineShort } from "../advice.js";
import { createSessionFlow, pageChecks } from "../turnstile.js";
import { createAdapter, callLogger } from "../adapter.js";
import { prefs } from "../prefs.js";
import { pageLog } from "../log.js";
import { helperLink } from "../helper.js";
import { loadOcr, DOWNLOAD_BYTES } from "../ocr/ocr.js";
import { groupBlocks, blockSegments, photoVerdict } from "./blocks.js";
import { exifOrientation, jpegSize, browserMissedTurn, scaledSize } from "./image.js";
import { drawOverlay } from "./overlay.js";
import { coreCase, casedTerms, restoreCaps, dateDash, sameText } from "./caps.js";

const MAX_SIDE = 2048;
// ?ocr=wasm: the WebAssembly reader even where WebGPU exists (a way out for a GPU that reads badly)
const OCR_BACKEND = new URLSearchParams(location.search).get("ocr") === "wasm" ? "wasm" : "auto";
const OCR_ERRORS = {
  ocr_download: "Không tải được bộ đọc chữ. Hãy kiểm tra mạng rồi thử lại.",
  ocr_integrity: "Bộ đọc chữ tải về bị lỗi. Hãy tải lại trang rồi thử lại.",
  ocr_runtime: "Trình duyệt này không chạy được bộ đọc chữ. Hãy dùng Chrome, Edge hoặc Safari bản mới.",
  ocr_unsupported: "Trình duyệt này không chạy được bộ đọc chữ. Hãy dùng Chrome, Edge hoặc Safari bản mới.",
  image_heic: "Trình duyệt này không mở được ảnh HEIC. Hãy chọn ảnh JPEG hoặc PNG (iPhone: Cài đặt > Camera > Định dạng"
    + " > Tương thích nhất), hoặc mở trang bằng Safari.",
  image_unsupported: "Không mở được ảnh này. Hãy chọn ảnh JPEG hoặc PNG.",
  not_image: "Tệp này không phải ảnh.",
};
// the daily limits in this page's words: the main page's texts (advice.js) also point to "Dịch trên máy", a mode this
// page does not have
const LIMIT_ERRORS = {
  quota_exceeded: "Đã hết lượt dịch hôm nay. Hãy thử lại vào ngày mai.",
  budget_exhausted: "Máy chủ dịch đã dùng hết ngân sách hôm nay. Hãy thử lại vào ngày mai.",
};
const MSG_EMPTY = "Không thấy chữ trong ảnh.";
const MSG_VI = "Ảnh đã là tiếng Việt, không cần dịch.";
const MSG_SQUEEZED = "Chữ dài, đã thu nhỏ";
const MB = (b) => Math.round(b / 1048576);

const $ = (id) => document.getElementById("anh-" + id);  // this tool's view in the shell
const byId = (id) => document.getElementById(id);         // the shell's shared consent dialog
const cloud = createCloud({ store: sharedSessionStore(), onCall: callLogger(() => "anh", "cloud", pageLog) });
const flow = createSessionFlow({ cloud, box: () => $("turnstile-box"), log: (line) => setStatus(line),
  hub: pageChecks() });
const adapter = createAdapter({ cloud, flow, prefs, helper: helperLink, log: pageLog, tool: () => "anh" });
const queue = [];
let running = false;
let ctrl = null;       // AbortController of the photo being processed
let photoNo = 0;
let ocrReady = false;
let consented = false;

function store(key, value) {
  try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); }
  catch (e) { return null; }
  return null;
}

function setStatus(text) {
  $("status").textContent = text || "";
  $("status").hidden = !text;
}

function setBar(pct) {
  $("bar").hidden = pct === null;
  if (pct !== null) $("bar-fill").style.width = Math.max(0, Math.min(100, pct)) + "%";
}

// The main page's first-use consent (same wording, same key): shown at the first visit, again before anything is
// sent if it was not given; only its button closes it.
function askConsent() {
  if (consented || store(CLOUD_CONSENT_KEY) === "yes") {
    consented = true;
    return Promise.resolve(true);
  }
  const dlg = byId("consent");
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => {
      consented = byId("agree").checked;
      if (consented) store(CLOUD_CONSENT_KEY, "yes");
      resolve(consented);
    }, { once: true });
    if (!dlg.open) dlg.showModal();
  });
}

const coded = (code, message) => Object.assign(new Error(message || code), { code });

function stemOf(name) {
  const base = String(name || "anh").replace(/^.*[\\/]/, "");
  return base.replace(/\.[^.]+$/, "") || "anh";
}

// The picture as a canvas: decoded by the browser through <img> (it turns photos by their EXIF orientation; WebKit's
// createImageBitmap does not), turned here when the browser did not, reduced to a long side of 2048.
async function decodePhoto(file) {
  const heic = /\.(heic|heif)$/i.test(file.name || "") || /heic|heif/i.test(file.type || "");
  if (file.type && !/^image\//.test(file.type) && !heic) throw coded("not_image");
  const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const orientation = exifOrientation(head);
  const stored = jpegSize(head);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch (e) {
      throw coded(heic ? "image_heic" : "image_unsupported");
    }
    const turnIt = browserMissedTurn(orientation, img.naturalWidth, img.naturalHeight, stored);
    const swap = turnIt && orientation >= 5;
    const s = scaledSize(swap ? img.naturalHeight : img.naturalWidth, swap ? img.naturalWidth : img.naturalHeight, MAX_SIDE);
    const c = document.createElement("canvas");
    c.width = s.w;
    c.height = s.h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    if (turnIt) {
      const W = s.w, H = s.h;
      const m = { 2: [-1, 0, 0, 1, W, 0], 3: [-1, 0, 0, -1, W, H], 4: [1, 0, 0, -1, 0, H], 5: [0, 1, 1, 0, 0, 0],
        6: [0, 1, -1, 0, W, 0], 7: [0, -1, -1, 0, W, H], 8: [0, -1, 1, 0, 0, H] }[orientation];
      if (m) ctx.transform(...m);
    }
    ctx.drawImage(img, 0, 0, swap ? s.h : s.w, swap ? s.w : s.h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- result cards ----

function newCard(n, name) {
  const node = $("result-tpl").content.firstElementChild.cloneNode(true);
  node.dataset.photo = String(n);
  node.querySelector(".result-title").textContent = "Ảnh " + n + (name ? " · " + name : "");
  $("results").append(node);
  const q = (sel) => node.querySelector(sel);
  return {
    node, q,
    status(text) { q(".result-status").textContent = text || ""; },
    note(text) {
      q(".result-note").textContent = text;
      q(".result-note").hidden = !text;
      node.dataset.state = "done";
    },
    fail(text) {
      q(".result-note").textContent = text;
      q(".result-note").hidden = false;
      node.classList.add("error");
      node.dataset.state = "error";
    },
  };
}

// the translated text of a photo in reading order: the Vietnamese of the translated blocks, the kept ones as they are
function photoText(blocks, byId) {
  return blocks.map((b) => {
    const r = byId.get(b.id);
    const t = r ? r.text || "" : b.text;
    return b.bullet ? b.bullet + " " + t : t;
  }).join("\n");
}

// squeezed: ids of the blocks whose Vietnamese needed tighter letters at the smallest size
function showText(card, blocks, byId, squeezed) {
  const ol = card.q(".pairs");
  ol.textContent = "";
  for (const b of blocks) {
    const li = document.createElement("li");
    const r = byId.get(b.id);
    const en = document.createElement("p");
    en.className = "en";
    en.lang = "en";
    en.textContent = (b.bullet ? b.bullet + " " : "") + b.text;
    li.appendChild(en);
    const vi = document.createElement("p");
    if (r) {
      vi.className = "vi";
      vi.textContent = r.text || "";
    } else {
      vi.className = "kept";
      vi.textContent = b.keep === "vi" ? "Giữ nguyên (tiếng Việt)" : "Giữ nguyên";
      en.lang = b.keep === "vi" ? "vi" : "en";
    }
    li.appendChild(vi);
    const notes = [];
    if (r && isFlagged(r.level, r.flags)) notes.push("Cần xem lại");
    if (squeezed.has(b.id)) notes.push(MSG_SQUEEZED);
    if (notes.length) {
      const f = document.createElement("p");
      f.className = "flags";
      f.textContent = notes.join(" · ");
      li.appendChild(f);
    }
    ol.appendChild(li);
  }
  const text = photoText(blocks, byId);
  card.q(".copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      card.q(".copied").textContent = "Đã sao chép.";
    } catch (e) {
      card.q(".copied").textContent = "Trình duyệt không cho sao chép tự động: hãy chọn chữ rồi sao chép.";
    }
  };
  if (navigator.share) {
    card.q(".share").hidden = false;
    card.q(".share").onclick = () => navigator.share({ text }).catch(() => {});
  }
  card.q(".result-text").hidden = false;
}

function blobOf(canvas, type) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), type,
    type === "image/jpeg" ? 0.92 : undefined));
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

// The overlay's font (the PDF tool's Noto Sans: full Vietnamese, same origin), loaded once; the fallback fonts draw
// the text when it cannot be had.
let fontsReady = null;
function loadFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all([["NotoSans-Regular.ttf", "400"], ["NotoSans-Bold.ttf", "700"]].map(([file, weight]) => {
      const face = new FontFace("VT Noto Sans", "url(../pdf/fonts/" + file + ")", { weight });
      document.fonts.add(face);
      return face.load();
    })).catch(() => null);
  }
  return fontsReady;
}

// The picture with the Vietnamese drawn over the translated blocks (byId: the blocks whose text changed) -> the drawn
// blocks [{ id, size, squeezed, ... }].
async function showImage(card, source, blocks, byId, name) {
  const canvas = card.q("canvas.shot");
  const items = blocks.filter((b) => byId.has(b.id)).map((b) => ({ block: b, text: byId.get(b.id).text || "" }));
  await loadFonts();
  const drawn = drawOverlay(canvas, source, items, blocks);
  const over = drawn.filter((d) => d.squeezed).length;
  canvas.dataset.sizes = drawn.map((d) => d.size).join(",");  // the font size of each block (the page runner reads it)
  const byDrawn = new Map(drawn.map((d) => [d.id, d]));
  // every block's style as drawn (the page runner reads it): kept ones with drawn false
  canvas.dataset.blocks = JSON.stringify(blocks.map((b) => Object.assign({ id: b.id, en: b.text, box: b.box.map(Math.round),
    drawn: byDrawn.has(b.id) }, byDrawn.get(b.id) || {})));
  card.q(".overflow").textContent = over ? over + " đoạn chữ dài, đã thu nhỏ cho vừa khung chữ gốc." : "";
  card.q(".overflow").hidden = !over;
  const stem = stemOf(name);
  card.q(".save-png").onclick = async () => saveBlob(await blobOf(canvas, "image/png"), stem + "_vi.png");
  card.q(".save-jpg").onclick = async () => saveBlob(await blobOf(canvas, "image/jpeg"), stem + "_vi.jpg");
  const probe = typeof File === "function" ? new File([""], "x.png", { type: "image/png" }) : null;
  if (probe && navigator.canShare && navigator.canShare({ files: [probe] })) {
    card.q(".share-image").hidden = false;
    card.q(".share-image").onclick = async () => {
      const file = new File([await blobOf(canvas, "image/png")], stem + "_vi.png", { type: "image/png" });
      navigator.share({ files: [file] }).catch(() => {});
    };
  }
  card.q(".result-image").hidden = false;
  return drawn;
}

// ---- one photo ----

async function processPhoto(file, n, total) {
  const card = newCard(n, file.name);
  const signal = ctrl.signal;
  const where = total > 1 ? "Ảnh " + n + "/" + total + ": " : "";
  const step = (text) => { card.status(text); setStatus(where + text); };
  const t0 = performance.now();
  try {
    step("Đang mở ảnh…");
    const source = await decodePhoto(file);
    if (!ocrReady) step("Đang tải bộ đọc chữ (lần đầu, khoảng " + MB(DOWNLOAD_BYTES) + " MB)…");
    const ocr = await loadOcr({ signal, backend: OCR_BACKEND, onProgress: (p) => {
      if (p.stage === "download" && p.total) {
        setBar((100 * p.loaded) / p.total);
        step("Đang tải bộ đọc chữ: " + MB(p.loaded) + " / " + MB(p.total) + " MB");
      } else if (p.stage === "start") {
        step("Đang khởi động bộ đọc chữ…");
      }
    } });
    ocrReady = true;
    card.node.dataset.backend = ocr.backend;
    setBar(null);
    step("Đang đọc chữ trên máy…");
    const t1 = performance.now();
    const read = await ocr.recognize(source, { signal });
    card.node.dataset.ocrMs = String(Math.round(performance.now() - t1));
    card.node.dataset.lines = String(read.lines.length);
    const blocks = groupBlocks(read.lines);
    const verdict = photoVerdict(blocks);
    card.node.dataset.verdict = verdict;
    if (verdict !== "translate") {
      card.status("");
      card.note(verdict === "empty" ? MSG_EMPTY : MSG_VI);
      return;
    }
    const { segments, fullText } = blockSegments(blocks);
    const viaCloud = adapter.kind() === "cloud";
    if (viaCloud && !(await askConsent())) throw coded("declined");
    step(viaCloud ? "Đang xác minh trình duyệt…" : "Đang kết nối ViTranslate…");
    const eng = await adapter.ready(signal);
    const cj = cloudJob(eng.client, { jobId: crypto.randomUUID(), signal, renew: eng.renew,
      onRetry: (k) => step("Máy chủ lỗi, gửi lại lần " + k + "…") });
    step("Đang chọn gói thuật ngữ…");
    // profile photo: a few short lines name their pack ("digital pathology") where the file selection finds none
    const setup = await cj.prepare(fullText, { domain: "", profile: "photo" });
    card.q(".result-packs").textContent = packsLineShort(setup.classify);
    // ALL-CAPS lines go to the core in normal case, the packs' cased terms (Ki-67) in their own case
    const keep = casedTerms(cj.setup.setup.hits);
    const sent = segments.map((s) => Object.assign({}, s, { tagged: coreCase(s.tagged, keep), prev: coreCase(s.prev, keep),
      nxt: coreCase(s.nxt, keep) }));
    step("Đang dịch 0/" + segments.length + " đoạn…");
    const results = await cj.translateSegments(sent, { onBatch: (done) => {
      step("Đang dịch " + done + "/" + segments.length + " đoạn…");
      setBar((100 * done) / segments.length);
    } });
    setBar(null);
    // the Vietnamese back in capitals where the line was; a translation that gives the source back keeps the line
    const blockOf = new Map(blocks.map((b) => [b.id, b]));
    const byId = new Map();
    for (const r of results) {
      const src = blockOf.get(r.id).text;
      const text = dateDash(restoreCaps(r.text || "", src));
      if (!sameText(text, src)) byId.set(r.id, Object.assign({}, r, { text }));
    }
    const drawn = await showImage(card, source, blocks, byId, file.name);
    showText(card, blocks, byId, new Set(drawn.filter((d) => d.squeezed).map((d) => d.id)));
    card.status("");
    card.node.dataset.state = "done";
    card.node.dataset.totalMs = String(Math.round(performance.now() - t0));
  } catch (e) {
    setBar(null);
    card.status("");
    if (e && e.name === "AbortError") {
      card.fail("Đã dừng.");
      return;
    }
    const code = (e && e.code) || "internal";
    card.fail(OCR_ERRORS[code] || LIMIT_ERRORS[code] || cloudErrorText(code));
    card.node.dataset.code = code;
    if (code === "bad_turnstile" || code === "session_expired") cloud.dropSession();
  }
}

async function pump() {
  if (running) return;
  running = true;
  $("cancel").hidden = false;
  try {
    let done = 0;
    while (queue.length) {
      const total = done + queue.length;
      const file = queue.shift();
      ctrl = new AbortController();
      done += 1;
      await processPhoto(file, ++photoNo, total);
    }
    setStatus(done > 1 ? "Đã xong " + done + " ảnh." : "");
  } finally {
    running = false;
    ctrl = null;
    $("cancel").hidden = true;
  }
}

function addFiles(list) {
  for (const f of Array.from(list || [])) queue.push(f);
  pump();
}

function init() {
  for (const id of ["camera", "files"]) {
    $(id).addEventListener("change", (e) => {
      addFiles(e.target.files);
      e.target.value = "";  // the same photo can be picked again; iOS gives a new list each time
    });
  }
  const drop = $("drop");
  drop.addEventListener("click", () => $("files").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("files").click(); } });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    addFiles(e.dataTransfer && e.dataTransfer.files);
  });
  $("cancel").addEventListener("click", () => {
    queue.length = 0;
    if (ctrl) ctrl.abort();
  });
  byId("agree").addEventListener("change", () => { byId("consent-ok").disabled = !byId("agree").checked; });
  byId("consent").addEventListener("cancel", (e) => e.preventDefault());
  // the first visit: the one consent dialog (as on the main page); Trên máy sends nothing to the server
  if (adapter.kind() === "cloud") askConsent();
}

init();
