// The link to the ViTranslate helper on this computer (127.0.0.1:47831-47835, or the page's own origin when the helper
// serves the page): found by GET /api/health on each port in turn, remembered until a call to it fails. Only the
// "Trên máy" engine uses it (a public page reaching 127.0.0.1 makes Chrome ask for Local Network Access). Each change
// of its state (found on a port / not found / lost) is one log line. No DOM here; fetch is injectable for the tests.
import { pageLog } from "./log.js";

export const HELPER_PORTS = [47831, 47832, 47833, 47834, 47835];
export const SENTENCE_WORDS = 15;  // a spoken sentence, for the live tool's speed line
// helper/vitranslate/recommend.py DEFAULT_RATES: before this machine is measured
const DEFAULT_RATES = { gpu: { overhead_s: 0.3, word_s: 0.039 }, cpu: { overhead_s: 2.0, word_s: 0.357 } };

/** The page is the helper's own (http://127.0.0.1:<helper port>/): the helper is the page's origin. */
export function helperPageOf(loc) {
  return !!loc && ["127.0.0.1", "localhost"].includes(loc.hostname) && HELPER_PORTS.includes(Number(loc.port));
}

/** Seconds one live sentence takes on the helper, from its /api/hardware answer (the calibration of the device a
 * job would use, else the defaults): { device: "gpu" | "cpu", seconds, measured } or null. */
export function sentenceSeconds(hw) {
  if (!hw || !hw.ready || !hw.recommendation) return null;
  const device = hw.recommendation.device === "gpu" ? "gpu" : "cpu";
  const got = ((hw.calibration || {}).results || {})[device];
  const ok = got && Number.isFinite(got.overhead_s) && Number.isFinite(got.word_s);
  const r = ok ? got : DEFAULT_RATES[device];
  return { device, seconds: r.overhead_s + r.word_s * SENTENCE_WORDS, measured: !!ok };
}

/** The live tool's line before Bắt đầu on Trên máy: a GPU keeps up with speech, a CPU takes seconds a sentence. */
export function speedText(hw) {
  const s = sentenceSeconds(hw);
  if (!s) return "";
  const sec = s.seconds < 1 ? "dưới 1" : String(Math.round(s.seconds));
  return s.device === "gpu" ? "Trên máy (GPU): khoảng " + sec + " giây mỗi câu."
    : "Trên máy chỉ có CPU: khoảng " + sec + " giây mỗi câu, phụ đề sẽ trễ.";
}

/** opts: { fetch, ports, helperPage, log (web/log.js) }. -> { base, health, find(), forget(), hardware(), onChange } */
export function createHelperLink(opts) {
  const o = opts || {};
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  const ports = o.ports || HELPER_PORTS;
  const listeners = new Set();
  let base = null;      // "http://127.0.0.1:<port>" ("" on the helper's own page), null when not found
  let health = null;
  let state = "unknown";  // "found:<port>" | "helper_not_found" | "lost"
  let finding = null;

  function setState(next) {
    if (next === state) return;
    state = next;
    if (o.log) o.log.add({ tool: "helper", op: "state", code: next });
    for (const fn of listeners) {
      try { fn(next); } catch (e) { /* a listener's problem */ }
    }
  }

  async function look() {
    const bases = o.helperPage ? [""] : ports.map((p) => "http://127.0.0.1:" + p);
    for (const b of bases) {
      try {
        const r = await doFetch(b + "/api/health", { cache: "no-store" });
        if (r.ok) {
          health = await r.json();
          base = b;
          setState("found:" + (b ? b.split(":").pop() : "page"));
          return health;
        }
      } catch (e) { /* the next port */ }
    }
    base = null;
    health = null;
    setState("helper_not_found");
    return null;
  }

  return {
    get base() { return base; },
    get health() { return health; },
    get state() { return state; },
    /** Looks for the helper (one look at a time; callers meanwhile share it) -> its /api/health answer or null. */
    find() {
      if (!finding) finding = look().finally(() => { finding = null; });
      return finding;
    },
    /** A call to the helper failed to connect: look again next time. */
    forget() {
      if (base === null) return;
      base = null;
      health = null;
      setState("lost");
    },
    async hardware() {
      if (base === null) return null;
      try {
        const r = await doFetch(base + "/api/hardware", { cache: "no-store" });
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** The page's one link (every tool, the menu's engine). */
export const helperLink = createHelperLink({ helperPage: helperPageOf(globalThis.location), log: pageLog });
