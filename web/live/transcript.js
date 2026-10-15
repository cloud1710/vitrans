// The live page's transcript (his decision 2026-10-14 Q5: in memory only, exported on a button, cleared 10 minutes
// after stop): the committed English sentences with their Vietnamese, in order, revisions in place; exports TXT,
// SRT (Vietnamese line over the English line) and DOCX (a table, through the PDF tool's minimal DOCX writer on the M1
// zip layer). Term repair (the host's answer en_fixed / repairs: mis-heard medical terms replaced): the English
// shown and exported is en_fixed (englishOf), and enParts marks the repaired words with the words heard. Nothing is
// written to storage. No DOM.
import { buildDocx } from "../pdf/docx.js";

export const CLEAR_AFTER_MS = 10 * 60 * 1000;
export const NOTICE = "Bản dịch máy, cần chuyên gia duyệt trước khi sử dụng.";
const MIN_CUE_MS = 2000;
const MS_PER_WORD = 400;
const MAX_HOLD_MS = 7000;

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** ms -> "hh:mm:ss,mmm" (SRT). */
export function srtTime(ms) {
  const v = Math.max(0, Math.round(ms));
  return pad(Math.floor(v / 3600000)) + ":" + pad(Math.floor(v / 60000) % 60) + ":" + pad(Math.floor(v / 1000) % 60) +
    "," + pad(v % 1000, 3);
}

/** ms -> "hh:mm:ss". */
export function clockTime(ms) {
  return srtTime(ms).slice(0, 8);
}

function localStamp(t) {
  const d = new Date(t);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" +
    pad(d.getMinutes());
}

/** The English of an entry: the repaired English when the host repaired a term, else the English heard. */
export function englishOf(e) {
  return e.enFixed || e.en;
}

/** The English of an entry in parts [{text, heard?}]: heard (the words the recognizer wrote) on each repaired term,
 * found in order in en_fixed; no repair: one part. */
export function enParts(e) {
  const text = englishOf(e);
  const out = [];
  let at = 0;
  for (const r of e.enFixed ? e.repairs || [] : []) {
    const i = r && typeof r.to === "string" && r.to ? text.indexOf(r.to, at) : -1;
    if (i < 0) continue;
    if (i > at) out.push({ text: text.slice(at, i) });
    out.push({ text: r.to, heard: String(r.from || "") });
    at = i + r.to.length;
  }
  if (at < text.length || !out.length) out.push({ text: text.slice(at) });
  return out;
}

export function createTranscript(opts = {}) {
  const timers = opts.timers || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) };
  let entries = [];
  const byId = new Map();
  let startedAt = null;
  let clearTimer = null;
  const listeners = [];

  function cancelClear() {
    if (clearTimer !== null) timers.clearTimeout(clearTimer);
    clearTimer = null;
  }

  function clear() {
    cancelClear();
    entries = [];
    byId.clear();
    startedAt = null;
    for (const f of listeners) f();
  }

  return {
    start(t) {
      cancelClear();
      if (startedAt === null) startedAt = t;
    },
    get startedAt() { return startedAt; },
    add({ id, en, t }) {
      if (byId.has(id)) return;
      const e = { id, en, vi: "", flags: [], t, revised: false, error: null, enFixed: null, repairs: [] };
      entries.push(e);
      byId.set(id, e);
    },
    /** fix: the host's {en_fixed, repairs} of the sentence (live term repair), if any. */
    setVi(id, vi, flags = [], error = null, fix = null) {
      const e = byId.get(id);
      if (!e) return;
      e.vi = vi || "";
      e.flags = flags || [];
      e.error = error;
      const fixed = fix && typeof fix.en_fixed === "string" && fix.en_fixed && fix.en_fixed !== e.en;
      e.enFixed = fixed ? fix.en_fixed : null;
      e.repairs = fixed && Array.isArray(fix.repairs) ? fix.repairs : [];
    },
    revise(id, en) {
      const e = byId.get(id);
      if (!e) return;
      e.en = en;
      e.vi = "";
      e.enFixed = null;
      e.repairs = [];
      e.revised = true;
    },
    get(id) { return byId.get(id) || null; },
    list() { return entries.slice(); },
    /** The session stopped at t: everything is cleared CLEAR_AFTER_MS later -> the time it will be cleared. */
    stopped(t) {
      cancelClear();
      clearTimer = timers.setTimeout(clear, CLEAR_AFTER_MS);
      return t + CLEAR_AFTER_MS;
    },
    clear,
    onClear(f) { listeners.push(f); },
  };
}

// a cue stays until the next one starts (when it starts within MAX_HOLD_MS), else for its reading time
function cueEnd(list, i) {
  const e = list[i];
  const own = e.t + Math.max(MIN_CUE_MS, e.en.split(/\s+/).length * MS_PER_WORD);
  if (i + 1 >= list.length) return own;
  const next = list[i + 1].t;
  return next - e.t <= MAX_HOLD_MS ? next - 1 : Math.min(own, next - 1);
}

export function toSrt(list, t0) {
  return list.map((e, i) => [String(i + 1), srtTime(e.t - t0) + " --> " + srtTime(cueEnd(list, i) - t0),
    ...(e.vi ? [e.vi] : []), englishOf(e)].join("\r\n")).join("\r\n\r\n") + "\r\n";
}

export function toTxt(list, t0) {
  const head = ["ViTranslate - Phụ đề trực tiếp", "Bắt đầu: " + localStamp(t0), NOTICE, ""];
  const body = list.map((e) => "[" + clockTime(e.t - t0) + "] " + (e.vi || "(chưa dịch)") + "\n  EN: " + englishOf(e) + "\n");
  return head.join("\n") + "\n" + body.join("");
}

export function toDocx(list, t0) {
  const rows = [["Thời điểm", "Tiếng Việt", "Tiếng Anh"]].concat(list.map((e) => [clockTime(e.t - t0),
    e.vi || "(chưa dịch)", englishOf(e)]));
  return buildDocx({ items: [{ kind: "heading", level: 1, text: "Phụ đề trực tiếp: bản ghi song ngữ" },
    { kind: "para", text: "Bắt đầu: " + localStamp(t0) }, { kind: "para", text: NOTICE },
    { kind: "table", rows }] });
}
