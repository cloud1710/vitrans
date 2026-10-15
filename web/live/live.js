"use strict";
// Live captions (/live/; his decisions 2026-10-14 20:15 and 2026-10-15 07:15-07:17): a caption source -- the browser's
// speech recognizer (microphone; Chrome on a desktop, Safari on iPhone / iPad) or, on Windows, the ViTranslate
// helper reading Windows Live Captions / Chrome's Live Caption -- gives growing text; the segmenter commits sentences
// (fillers without meaning dropped); each sentence goes straight to the cloud core (profile "live", the previous 1-2
// sentences as context) and is shown as a subtitle running in the page: the newest sentence and the one before it,
// Vietnamese large, English small only when the bilingual switch is on (Vietnamese only by default, his choice
// 2026-10-15; the transcript list and the floating window follow it), the sentence being spoken faded; full screen; an
// optional floating window (Document Picture-in-Picture, Chrome on a desktop). Term repair (the host replaced
// mis-heard medical terms): the English shown is the repaired one, each repaired term lightly underlined with the words
// heard in its title; the exports use it too. The transcript (EN + VI) stays in this
// page's memory only, is exported on a button (TXT / SRT / DOCX) and cleared 10 minutes after stop. Consent and the
// browser check (Turnstile) as on the other tool pages. Text is rendered with textContent only. The tool is the "Dịch
// đuổi" tab of the app shell (formerly /live/): its elements carry the prefix "live-", and app.js imports this module
// when the tab first opens, then calls enter() / leave() as the tab opens and closes: with the helper source and the
// consent given it starts by itself (the helper keeps Windows Live Captions hidden; no helper -> a button that opens
// ViTranslate, found again every 2 s for 60 s); leaving the tab (or the page) stops the session. The cloud session is
// the page's one (shared with the other tools, kept across reloads) and its browser check is the page's one too; with
// the helper source the check comes first and the helper (Windows Live Captions) starts only once the session exists;
// with the microphone the recognizer starts in the tap and the sentences said meanwhile wait for the session (his
// report 2026-10-15). The menu (../settings.js) holds Song ngữ and the text size (../prefs.js; the stage follows) and
// the engine: on "Trên máy" the sentences go to the ViTranslate helper (../adapter.js: no session, never the cloud),
// chosen at Bắt đầu for the whole run, and the tab first shows the expected speed from the helper's calibration.
import { createCloud, sharedSessionStore } from "../cloud.js";
import { createAdapter, callLogger } from "../adapter.js";
import { prefs, SUB_SIZES } from "../prefs.js";
import { pageLog } from "../log.js";
import { helperLink, speedText } from "../helper.js";
import { cloudErrorText } from "../advice.js";
import { createSessionFlow, pageChecks } from "../turnstile.js";
import { createSegmenter, segmenterOptions } from "./segmenter.js";
import { createLiveApi, createLiveQueue, prevContext, newJobId } from "./translator.js";
import { createTranscript, toTxt, toSrt, toDocx, clockTime, enParts } from "./transcript.js";
import { createRecognizerSource, createHelperSource, autoStartOk, helperOk, agreeAndStart,
  startInOrder } from "./sources.js";

const CONSENT_KEY = "vitranslate-live-consent-v1";
const SOURCE_KEY = "vitranslate-live-source-v1";
const TICK_MS = 200;
const CLASSIFY_EVERY = 10;        // sentences between two pack choices
const CLASSIFY_MIN_WORDS = 60;
const CLASSIFY_WORDS = 400;       // the window of recent English the packs are chosen from
const RENEW_BEFORE_MS = 5 * 60 * 1000;
const WARN_FLAGS = /^(?:english_left|unchanged|deadline|suspect_output|acronym_lost|omitted|empty_output)/;
const MESSAGES = {
  listening: "Đang nghe…",
  mic_denied: "Trình duyệt chưa cho dùng micro. Hãy cho phép micro cho trang này rồi bấm Bắt đầu lại.",
  no_mic: "Không tìm thấy micro trên thiết bị này.",
  unsupported: "Trình duyệt này không có nhận dạng giọng nói. Trên iPhone / iPad hãy mở bằng Safari; trên máy tính dùng Chrome.",
  recognizer_network: "Nhận dạng giọng nói mất kết nối, đang thử lại…",
  no_helper: "Không tìm thấy ViTranslate trên máy này. Hãy mở ViTranslate (bản có phụ đề trực tiếp) rồi bấm Bắt đầu lại.",
  no_helper_retry: "Chưa thấy ViTranslate trên máy. Bấm Mở ViTranslate; trang sẽ tự kết nối.",
  docked: "Live Captions đang ghim ở mép màn hình; hãy chọn Position > Floating trong cài đặt Live Captions để ẩn hoàn toàn.",
  lost: "Mất kết nối với bộ đọc phụ đề trên máy.",
  reconnecting: "Đang nối lại với bộ đọc phụ đề trên máy…",
  waiting: "Chưa thấy phụ đề trên máy: bật Windows Live Captions (Win + Ctrl + L) hoặc Live Caption của Chrome.",
  uia_changed: "Bản Windows này đã đổi giao diện Live Captions nên chưa đọc được; hãy thử Live Caption của Chrome.",
  helper_error: "Bộ đọc phụ đề trên máy gặp lỗi; hãy thử nguồn khác.",
  live_time_exceeded: "Phiên phụ đề này đã dùng hết 4 giờ hôm nay. Phụ đề tiếng Anh vẫn hiện; hãy dịch tiếp vào ngày mai.",
  budget_exhausted: "Phần ngân sách dành cho phụ đề trực tiếp hôm nay đã hết. Phụ đề tiếng Anh vẫn hiện; hãy thử lại vào ngày mai.",
  quota_exceeded: "Đã hết lượt dịch hôm nay. Phụ đề tiếng Anh vẫn hiện; hãy thử lại vào ngày mai.",
  prompt: "Bấm vào ô xác minh để bắt đầu dịch.",
  verified: "Đã xác minh trình duyệt. Bấm Bắt đầu.",
  finding: "Đang tìm ViTranslate trên máy…",
};
// The helper reads captions of Windows only (Windows Live Captions, Chrome's Live Caption on Windows): a phone or a
// tablet (iPadOS too, which reports a Mac) always uses the microphone. Chrome on iOS is WebKit and may expose no
// SpeechRecognition at all: its start() then says "unsupported", whose text points to Safari.
const HELPER_OK = helperOk(navigator.userAgent, navigator.maxTouchPoints);

const $ = (id) => document.getElementById("live-" + id);  // this tool's view in the shell
const cloud = createCloud({ store: sharedSessionStore(), onCall: callLogger(() => "live", "cloud", pageLog) });
const flow = createSessionFlow({ cloud, box: () => $("turnstile-box"), hub: pageChecks(), onPrompt, onRetried });
const adapter = createAdapter({ cloud, flow, prefs, helper: helperLink, log: pageLog, tool: () => "live" });
const jobId = newJobId();          // one live job per page: its 4 hours a day, its prefix cache
const transcript = createTranscript();
let setup = { packs: [], hits: [] };
let source = "mic";
let running = false;
let seg = null;
let src = null;
let tickTimer = null;
let renewTimer = null;
let wakeLock = null;
let committed = [];                // [{id, en}] of this session, in order (context, packs)
let draft = "";
let shown = new Set();             // ids already drawn on the stage (the new ones rise in)
let pip = null;                    // {win, stage, lines}
let sessionReady = false;           // this run has its session: the queue sends
let runNo = 0;                     // a stop or a new start ends the start in progress
let active = false;                // the tab is open (enter / leave)
let classifying = false;
let eng = null;                    // the engine of this run (adapter.ready at Bắt đầu): cloud or the helper
let helperRetry = null;            // after "Mở ViTranslate" with Trên máy: looked for again every 2 s

function store(key, value) {
  try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); }
  catch (e) { return null; }
  return null;
}

function setStatus(text, bad) {
  $("status").textContent = text || "";
  $("status").hidden = !text;
  $("status").classList.toggle("bad", !!bad);
}

// ---------------------------------------------------------------- consent, session

function askConsent() {
  if (store(CONSENT_KEY) === "yes") return Promise.resolve(true);
  const dlg = $("consent");
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => {
      const ok = $("agree").checked;
      if (ok) store(CONSENT_KEY, "yes");
      resolve(ok);
    }, { once: true });
    if (!dlg.open) dlg.showModal();
  });
}

// the page's session (one Turnstile check at a time for every tool, web/turnstile.js): the cloud engine only
async function sessionToken() {
  await flow.ensure();
  return cloud.session.token;
}

// the run's engine: the browser check for the cloud, the helper found for Trên máy (helper_not_found otherwise)
async function engineReady() {
  eng = await adapter.ready();
  return eng;
}

// Turnstile shows its checkbox (before-interactive) / not any more
function onPrompt(on) {
  if (on) setStatus(MESSAGES.prompt, false);
  else if ($("status").textContent === MESSAGES.prompt) setStatus("", false);
}

// the "Thử lại" check in this tab's box ended: with the helper source the session starts by itself (no gesture
// needed); the microphone waits for Bắt đầu (the recognizer starts only inside a tap)
function onRetried(err) {
  if (err) { setStatus(cloudErrorText(err.code || "network"), true); return; }
  if (running) return;
  if (active && autoStartOk({ helperOk: HELPER_OK, source, consent: store(CONSENT_KEY), running })) start();
  else setStatus(MESSAGES.verified, false);
}

const api = createLiveApi({ jobId, setup: () => setup, session: sessionToken, renew: (used) => flow.renew(undefined, used),
  endpoint: (path) => (eng ? eng.endpoint(path) : { url: "/api/v1/" + path, local: false }),
  onCall: callLogger(() => "live", "cloud", pageLog) });
const queue = createLiveQueue({ translate: (items) => api.translate(items), onResult, onState: onStopped,
  ready: () => sessionReady });

function onResult(id, r) {
  if (r.error) transcript.setVi(id, "", [], r.error);
  else transcript.setVi(id, r.text || "", r.flags || [], null, { en_fixed: r.en_fixed, repairs: r.repairs });
  render();
}

function onStopped(code) {
  setStatus(MESSAGES[code] || cloudErrorText(code), true);
}

// ---------------------------------------------------------------- packs (chosen from the recent English)

async function choosePacks() {
  if (classifying) return;
  const words = committed.map((c) => c.en).join(" ").split(/\s+/).filter(Boolean);
  if (words.length < CLASSIFY_MIN_WORDS) return;
  classifying = true;
  try {
    const e = eng || await engineReady();
    const answer = await e.client.classify(words.slice(-CLASSIFY_WORDS).join(" "));
    const packs = answer && answer.setup && Array.isArray(answer.setup.packs) ? answer.setup.packs : [];
    if (packs.length) {  // sticky: a window that matches nothing keeps the packs already chosen
      setup = { packs: packs.map((p) => ({ id: p.id, version: p.version })), hits: [] };
      const ev = answer.classify || answer;
      const names = (Array.isArray(ev.packs) ? ev.packs : []).map((p) => p.name || p.id);
      $("packs").textContent = "Gói thuật ngữ: " + (names.length ? names.join(", ") : packs.map((p) => p.id).join(", "));
      $("packs").hidden = false;
    }
  } catch (e) {
    /* the sentences go on with the packs they have */
  } finally {
    classifying = false;
  }
}

// ---------------------------------------------------------------- segmenter events

function prevOf(id) {
  const i = committed.findIndex((c) => c.id === id);
  return prevContext(committed.slice(Math.max(0, i - 2), i).map((c) => c.en));
}

function handle(events) {
  let changed = false;
  for (const e of events) {
    if (e.type === "commit") {
      committed.push({ id: e.id, en: e.en });
      transcript.add({ id: e.id, en: e.en, t: e.t });
      queue.add({ id: e.id, en: e.en, prev: prevOf(e.id) });
      if (committed.length % CLASSIFY_EVERY === 0 || (setup.packs.length === 0 && committed.length % 3 === 0)) {
        choosePacks();
      }
      changed = true;
    } else if (e.type === "revise") {
      const c = committed.find((x) => x.id === e.id);
      if (c) c.en = e.en;
      transcript.revise(e.id, e.en);
      queue.add({ id: e.id, en: e.en, prev: prevOf(e.id), revision: true });
      changed = true;
    } else if (e.type === "draft") {
      draft = e.text;
      changed = true;
    }
  }
  if (changed) render();
}

function onText(text) {
  if (!running || !seg) return;
  handle(seg.push(text, Date.now()));
}

function onSourceState(code) {
  if (code === "stopped") return;
  $("open-helper").hidden = !["no_helper_retry", "no_helper"].includes(code);
  if (code === "listening") {
    // the line asking for the checkbox stays until the check is done
    if (!queue.stopped && $("status").textContent !== MESSAGES.prompt) setStatus(MESSAGES.listening, false);
    return;
  }
  setStatus(MESSAGES[code] || code, !["reconnecting", "recognizer_network", "waiting", "docked", "no_helper_retry"]
    .includes(code));
  if (["mic_denied", "no_mic", "unsupported", "no_helper", "lost"].includes(code)) stop();
}

// ---------------------------------------------------------------- start / stop

async function start() {
  if (running) return;
  if (store(CONSENT_KEY) !== "yes") {  // asked once; agreeing starts the session in that click (consent-ok)
    askConsent();
    return;
  }
  // nothing is awaited before startInOrder: iOS Safari starts the recognizer only inside the user's tap
  const me = ++runNo;
  seg = createSegmenter(segmenterOptions(source === "helper" ? "helper" : "mic"));  // cuts per source
  committed = [];
  draft = "";
  running = true;
  stopHelperRetry();
  eng = null;
  const viaCloud = adapter.kind() === "cloud";
  sessionReady = viaCloud && cloud.hasSession();
  queue.resume();
  transcript.start(Date.now());
  $("start").hidden = true;
  $("stop").hidden = false;
  $("clear-at").textContent = "";
  const helper = source === "helper";
  const s = helper ? createHelperSource({ onText, onState: onSourceState })
    : createRecognizerSource({ onText, onState: onSourceState });
  src = s;
  $("open-helper").hidden = true;
  tickTimer = setInterval(() => { if (seg) handle(seg.tick(Date.now())); }, TICK_MS);
  if (viaCloud) {
    renewTimer = setInterval(() => {
      const cur = cloud.session;
      if (cur && cur.expiresAt - Date.now() < RENEW_BEFORE_MS) flow.renew(undefined, cur.token).catch(() => {});
    }, 60000);
  }
  pageLog.add({ tool: "live", engine: viaCloud ? "cloud" : "local", op: "start", code: source });
  keepAwake();
  render();
  // the microphone at once, inside the click (Safari asks for it only from a user gesture), the session meanwhile;
  // the helper (it launches Windows Live Captions) only once the session exists
  setStatus("", false);
  try {
    await startInOrder({ mic: !helper, session: engineReady, alive: () => running && me === runNo,
      startSource: () => (helper ? s.start($("helper-source").value, { retry: true }) : s.start()),
      onSession: () => {
        sessionReady = true;
        queue.release();  // the sentences said during the check: the last few are translated now
        const st = $("status").textContent;
        if (helper) setStatus(MESSAGES.finding, false);
        else if (!st || st === MESSAGES.prompt) setStatus(MESSAGES.listening, false);
      } });
  } catch (e) {
    if (!running || me !== runNo) return;
    const code = (e && e.code) || "network";
    setStatus(cloudErrorText(code), true);
    stop();
    $("open-helper").hidden = code !== "helper_not_found";  // Trên máy without the helper: open it, then retry
  }
}

function stop() {
  if (!running) return;
  running = false;
  pageLog.add({ tool: "live", engine: eng && eng.kind === "local" ? "local" : "cloud", op: "stop",
    segments: committed.length });
  if (src) src.stop();
  src = null;
  if (seg) handle(seg.flush(Date.now()));
  seg = null;
  if (!sessionReady) queue.release(0);  // no session came: what waits stays untranslated
  draft = "";
  clearInterval(tickTimer);
  clearInterval(renewTimer);
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  $("start").hidden = false;
  $("stop").hidden = true;
  if (!$("status").classList.contains("bad")) setStatus("Đã dừng.", false);
  const at = transcript.stopped(Date.now());
  const d = new Date(at);
  $("clear-at").textContent = transcript.list().length ? "Sẽ tự xóa lúc " + String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + "." : "";
  render();
}

async function keepAwake() {
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { wakeLock = null; }
}

document.addEventListener("visibilitychange", () => {
  if (running && document.visibilityState === "visible" && !wakeLock) keepAwake();
});

// ---------------------------------------------------------------- rendering

/** The English line of an entry: the repaired English, each repaired term in a span.fixed titled with the words
 * heard. */
function enEl(doc, e) {
  const en = doc.createElement("span");
  en.className = "en";
  en.append(...enParts(e).map((part) => {
    if (part.heard === undefined) return doc.createTextNode(part.text);
    const s = doc.createElement("span");
    s.className = "fixed";
    s.title = "Nghe được: " + part.heard;
    s.textContent = part.text;
    return s;
  }));
  return en;
}

function lineEl(doc, e, older) {
  const p = doc.createElement("p");
  const flagged = (e.flags || []).some((f) => WARN_FLAGS.test(f));
  p.className = "line" + (older ? " prev" : "") + (!e.vi && !e.error ? " waiting" : "") +
    (flagged || e.error ? " flagged" : "") + (shown.has(e.id) ? "" : " new");
  const vi = doc.createElement("span");
  vi.className = "vi";
  vi.textContent = e.vi || (e.error || (e.flags || []).includes("deadline") ? "(chưa dịch)" : "…");
  p.append(vi, enEl(doc, e));
  return p;
}

function drawLines(doc, box) {
  const list = transcript.list().slice(-2);
  const nodes = list.map((e, i) => lineEl(doc, e, i < list.length - 1));
  if (draft) {
    const d = doc.createElement("p");
    d.className = "draft";
    d.textContent = draft;
    nodes.push(d);
  }
  if (!nodes.length) {
    const empty = doc.createElement("p");
    empty.className = "stage-empty";
    empty.textContent = running ? "Đang nghe…" : "Phụ đề sẽ hiện ở đây";
    nodes.push(empty);
  }
  box.replaceChildren(...nodes);
}

const items = new Map();  // id -> li of the transcript list

function drawTranscript() {
  const list = transcript.list();
  const ol = $("transcript");
  if (!list.length && items.size) { ol.replaceChildren(); items.clear(); }
  const nearBottom = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
  const t0 = transcript.startedAt || 0;
  for (const e of list) {
    let li = items.get(e.id);
    if (!li) {
      li = document.createElement("li");
      items.set(e.id, li);
      ol.append(li);
    }
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = clockTime(e.t - t0);
    const vi = document.createElement("span");
    vi.className = "vi";
    vi.textContent = e.vi || (e.error || (e.flags || []).includes("deadline") ? "(chưa dịch)" : "…");
    const parts = [t, vi];
    if (e.revised) {
      const m = document.createElement("span");
      m.className = "mark";
      m.textContent = "đã sửa";
      parts.push(m);
    }
    parts.push(enEl(document, e));
    li.replaceChildren(...parts);
  }
  if (nearBottom) ol.scrollTop = ol.scrollHeight;
  const has = list.length > 0;
  for (const id of ["dl-txt", "dl-srt", "dl-docx", "clear"]) $(id).disabled = !has;
}

function render() {
  drawLines(document, $("lines"));
  if (pip) drawLines(pip.win.document, pip.lines);
  for (const e of transcript.list().slice(-2)) shown.add(e.id);
  drawTranscript();
}

transcript.onClear(() => {
  shown = new Set();
  $("clear-at").textContent = "";
  render();
});

// ---------------------------------------------------------------- stage tools

// the menu's text size (the stylesheet's size until a step) and Song ngữ
function applySize() {
  const k = prefs.subSize();
  const targets = [$("stage")].concat(pip ? [pip.stage] : []);
  for (const el of targets) {
    if (k >= 0) el.style.setProperty("--sub-size", SUB_SIZES[k] + "rem");
  }
}

function applyEn() {
  const off = !prefs.bilingual();
  $("stage").classList.toggle("no-en", off);
  $("transcript").classList.toggle("no-en", off);
  if (pip) pip.stage.classList.toggle("no-en", off);
}

function fullscreen() {
  const st = $("stage");
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  if (st.classList.contains("focus")) { st.classList.remove("focus"); $("fullscreen").textContent = "Toàn màn hình"; return; }
  const req = st.requestFullscreen || st.webkitRequestFullscreen;
  if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    Promise.resolve(req.call(st)).catch(() => focusMode());
  } else {
    focusMode();  // iPhone Safari: no element full screen -> the stage fills the screen
  }
}

function focusMode() {
  $("stage").classList.add("focus");
  $("fullscreen").textContent = "Thoát toàn màn hình";
}

async function openPip() {
  if (pip) { pip.win.close(); return; }
  try {
    const win = await window.documentPictureInPicture.requestWindow({ width: 760, height: 230 });
    const link = win.document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("live.css", import.meta.url).href;  // next to this module, wherever the shell is
    win.document.head.append(link);
    win.document.title = "Phụ đề";
    win.document.body.className = "pip";
    const stage = win.document.createElement("div");
    stage.className = "stage";
    const lines = win.document.createElement("div");
    lines.className = "lines";
    stage.append(lines);
    win.document.body.append(stage);
    pip = { win, stage, lines };
    win.addEventListener("pagehide", () => { pip = null; $("pip").textContent = "Cửa sổ nổi"; });
    $("pip").textContent = "Đóng cửa sổ nổi";
    applySize();
    applyEn();
    render();
  } catch (e) {
    setStatus("Không mở được cửa sổ nổi trong trình duyệt này.", true);
  }
}

// ---------------------------------------------------------------- export

function stamp() {
  const d = new Date(transcript.startedAt || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function exportAs(kind) {
  const list = transcript.list();
  if (!list.length) return;
  const t0 = transcript.startedAt || list[0].t;
  const name = "phu-de-" + stamp();
  if (kind === "txt") download(name + ".txt", "﻿" + toTxt(list, t0), "text/plain;charset=utf-8");
  if (kind === "srt") download(name + ".srt", "﻿" + toSrt(list, t0), "application/x-subrip;charset=utf-8");
  if (kind === "docx") download(name + ".docx", toDocx(list, t0),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

// ---------------------------------------------------------------- Trên máy: the helper's speed, finding it again


let speedSeq = 0;
async function showSpeed() {
  const me = ++speedSeq;
  const line = $("speed");
  if (prefs.engine() !== "local") { line.hidden = true; return; }
  if (helperLink.base === null) await helperLink.find();
  const text = speedText(await helperLink.hardware());
  if (me !== speedSeq || prefs.engine() !== "local") return;
  line.textContent = text;
  line.hidden = !text;
}

function stopHelperRetry() {
  clearInterval(helperRetry);
  helperRetry = null;
}

function retryWhenHelper() {
  stopHelperRetry();
  const until = Date.now() + 60000;
  helperRetry = setInterval(async () => {
    if (running || !active || Date.now() > until) { stopHelperRetry(); return; }
    if (await helperLink.find()) {
      stopHelperRetry();
      showSpeed();
      if (active && !running) start();
    }
  }, 2000);
}

// ---------------------------------------------------------------- wiring

function setSource(s) {
  source = s === "helper" && HELPER_OK ? "helper" : "mic";
  store(SOURCE_KEY, source);
  $("src-mic").setAttribute("aria-pressed", String(source === "mic"));
  $("src-helper").setAttribute("aria-pressed", String(source === "helper"));
  $("note-mic").hidden = source !== "mic";
  $("helper-box").hidden = source !== "helper";
}

function init() {
  $("src-helper").hidden = !HELPER_OK;
  setSource(store(SOURCE_KEY) || "mic");
  for (const [id, s] of [["src-mic", "mic"], ["src-helper", "helper"]]) {
    $(id).addEventListener("click", () => { if (!running) setSource(s); });
  }
  applySize();
  applyEn();
  prefs.on("sub", () => { applySize(); applyEn(); });
  // another engine chosen in the menu: a run in progress stops (its engine was chosen at Bắt đầu)
  prefs.on("engine", () => { if (running) stop(); showSpeed(); });
  $("fullscreen").addEventListener("click", fullscreen);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("stage").classList.contains("focus")) fullscreen();
  });
  $("pip").hidden = !("documentPictureInPicture" in window);
  $("pip").addEventListener("click", openPip);
  $("start").addEventListener("click", start);
  $("stop").addEventListener("click", stop);
  // the installed helper registers vitranslate:// (as on the main page); the running start finds it within 2 s; on
  // Trên máy without the helper, Bắt đầu runs again once it answers
  $("open-helper").addEventListener("click", () => {
    location.href = "vitranslate://start";
    if (!running && prefs.engine() === "local") retryWhenHelper();
  });
  window.addEventListener("pagehide", stop);  // best effort; the helper also stops a session nobody listens to
  $("dl-txt").addEventListener("click", () => exportAs("txt"));
  $("dl-srt").addEventListener("click", () => exportAs("srt"));
  $("dl-docx").addEventListener("click", () => exportAs("docx"));
  $("clear").addEventListener("click", () => {
    transcript.clear();
    if (running) transcript.start(Date.now());
  });
  $("agree").addEventListener("change", () => { $("consent-ok").disabled = !$("agree").checked; });
  // one tap: agreeing starts the session at once, inside this click (a user gesture: iOS Safari's recognizer)
  $("consent-ok").addEventListener("click", () => {
    agreeAndStart({ agreed: $("agree").checked, save: () => store(CONSENT_KEY, "yes"), begin: start });
  });
  $("consent").addEventListener("cancel", (e) => e.preventDefault());
  if (store(CONSENT_KEY) !== "yes") askConsent();
  render();
}

init();

/** The tab opened (app.js): start by itself with the helper source once the consent is given. */
export function enter() {
  active = true;
  showSpeed();
  if (autoStartOk({ helperOk: HELPER_OK, source, consent: store(CONSENT_KEY), running })) start();
}

/** The tab closed (another tool chosen): no session runs on in the background. */
export function leave() {
  active = false;
  stopHelperRetry();
  stop();
}
