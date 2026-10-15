// The page's event log ("Nhật ký" in the menu): one line per event, for a bug report -- time, tool, engine (máy chủ /
// trên máy), operation, number of segments, latency, result or error code ("503 server_error", "helper_not_found"),
// helper state changes. NEVER the text of a document or a caption: a line is built from known fields only, each
// checked (a code that does not look like one becomes "error"). Kept in memory, plus the last MAX_LINES lines in
// localStorage (this browser only); every storage access is wrapped, so a blocked or full storage only loses the
// stored copy. Every tool reports through pageLog.add(); no DOM here.
export const LOG_KEY = "vitranslate-log-v1";
export const MAX_LINES = 500;
const MAX_LINE_CHARS = 300;
const TOOL_LABELS = { text: "Văn bản", file: "Tài liệu", anh: "Ảnh", sub: "Phụ đề", live: "Dịch đuổi",
  helper: "ViTranslate", page: "Trang" };
const ENGINE_LABELS = { cloud: "máy chủ", local: "trên máy" };
const OPS = new Set(["session", "classify", "translate", "terms", "feedback", "job", "state", "engine", "start", "stop"]);
const CODE_RE = /^[A-Za-z0-9_.:-]{1,48}$/;

const pad = (n) => String(n).padStart(2, "0");
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);

function stamp(ms) {
  const d = new Date(ms);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" +
    pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

/** One event -> its line. ev: { tool, engine?, op, segments?, ms?, status? (HTTP), code? ("ok" or an error code) }. */
export function formatEvent(ev, at) {
  const e = ev || {};
  const parts = [stamp(at)];
  parts.push(TOOL_LABELS[e.tool] || "?");
  if (ENGINE_LABELS[e.engine]) parts.push(ENGINE_LABELS[e.engine]);
  parts.push(OPS.has(e.op) ? e.op : "?");
  if (count(e.segments) !== null) parts.push(e.segments + " đoạn");
  if (count(e.ms) !== null) parts.push((e.ms / 1000).toFixed(1) + " s");
  const code = e.code === undefined ? "" : typeof e.code === "string" && CODE_RE.test(e.code) ? e.code : "error";
  const status = count(e.status) !== null && e.status >= 100 && e.status < 600 ? String(e.status) : "";
  const result = [status, code].filter(Boolean).join(" ");
  if (result) parts.push(result);
  return parts.join(" · ");
}

/** opts: { storage () -> a localStorage-like object (default globalThis.localStorage), now () -> ms, max }. */
export function createLog(opts) {
  const o = opts || {};
  const max = o.max || MAX_LINES;
  const now = o.now || (() => Date.now());
  const storage = () => {
    try { return o.storage ? o.storage() : globalThis.localStorage; } catch (e) { return null; }
  };
  const listeners = new Set();
  let lines = null;  // read from storage at the first use

  function load() {
    if (lines) return lines;
    lines = [];
    try {
      const st = storage();
      const raw = st ? st.getItem(LOG_KEY) : null;
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        lines = list.filter((l) => typeof l === "string" && l.length <= MAX_LINE_CHARS).slice(-max);
      }
    } catch (e) { lines = []; }
    return lines;
  }

  function save() {
    try {
      const st = storage();
      if (!st) return;
      if (lines.length) st.setItem(LOG_KEY, JSON.stringify(lines)); else st.removeItem(LOG_KEY);
    } catch (e) { /* blocked or full: the memory copy stays */ }
  }

  function changed() {
    for (const fn of listeners) {
      try { fn(); } catch (e) { /* a listener's problem */ }
    }
  }

  return {
    add(ev) {
      load().push(formatEvent(ev, now()));
      if (lines.length > max) lines.splice(0, lines.length - max);
      save();
      changed();
    },
    lines() { return load().slice(); },
    text() { return load().join("\n"); },
    clear() {
      lines = [];
      save();
      changed();
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** The page's one log (every tool, every engine). */
export const pageLog = createLog();
