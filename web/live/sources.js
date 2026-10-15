// Caption sources of the live page; each calls onText(full current caption text) again and again, onState(code):
//   createRecognizerSource: the browser's speech recognizer (SpeechRecognition / webkitSpeechRecognition: Chrome on
//     a desktop, Safari on iPhone / iPad), continuous with interim results, en-US. Its final + interim text of the
//     current recognition is one snapshot (the last MAX_WORDS words). When it ends (silence, a time limit, iOS) it is
//     started again after restartMs, and an empty snapshot tells the segmenter that the words pending are final.
//     The recognizer is the browser's (Google / Apple), which may send the audio to their servers.
//     States: listening | mic_denied | no_mic | recognizer_network | unsupported | stopped.
//   createHelperSource: the ViTranslate helper on this computer reads Windows Live Captions or Chrome's Live Caption
//     (helper/, another part): POST http://127.0.0.1:<port>/api/live/start {source: "auto" | "windows" | "chrome",
//     hide: true} (the helper starts Windows Live Captions if needed and keeps its window hidden) on the
//     first port of HELPER_PORTS that answers, then the SSE stream GET /api/live/stream, events {t, source, text,
//     seq} (default "message" or named "caption"); POST /api/live/stop. Only called after the user chose this
//     source (Chrome asks for Local Network Access). Source "auto" = Windows Live Captions first, Chrome when it
//     is not there (the helper decides). Its "status" events give: waiting (no caption window yet) | uia_changed |
//     helper_error | listening (code docked: Live Captions docked at a screen edge -> docked). States: listening |
//     docked | waiting | uia_changed | helper_error | lost | reconnecting | no_helper_retry | no_helper | stopped.
export const HELPER_PORTS = [47831, 47832, 47833, 47834, 47835];
export const MAX_WORDS = 400;
export const HELPER_RETRY_MS = 2000;
export const HELPER_RETRY_FOR_MS = 60000;

/** The live tab starts by itself (no click) only on Windows with the helper source chosen and the consent given;
 *  the microphone always waits for a click (the browser asks for it from a user gesture). */
export function autoStartOk({ helperOk, source, consent, running }) {
  return Boolean(helperOk) && source === "helper" && consent === "yes" && !running;
}

/** The helper reads captions of Windows only: a Windows desktop, never a phone or a tablet. iPadOS reports a Mac
 *  user agent; its touch points give it away (treated as not-Windows like any Mac). */
export function helperOk(ua, maxTouchPoints) {
  const s = String(ua || "");
  const ipad = /Macintosh/.test(s) && Number(maxTouchPoints) > 1;
  return /Windows/.test(s) && !/Mobile|Android|iPhone|iPad/.test(s) && !ipad;
}

/** The consent dialog's button (a user gesture): the consent is stored and the session begins in the same click,
 *  before anything async -- iOS Safari starts speech recognition only inside a gesture. */
export function agreeAndStart({ agreed, save, begin }) {
  if (!agreed) return false;
  save();
  begin();
  return true;
}

/** The order of a live start (his report 2026-10-15): the microphone's recognizer starts at once, synchronously
 *  inside the tap (iOS Safari), and the session comes while it listens; the helper source starts only once the
 *  session exists, so a failed browser check never launches Windows Live Captions. steps: { mic, startSource () ->
 *  promise | value, session () -> promise (its error is thrown), onSession () (the session is there), alive () ->
 *  false when the run was stopped meanwhile (nothing more is started) }. */
export async function startInOrder({ mic, startSource, session, onSession, alive }) {
  const started = mic ? startSource() : null;  // nothing awaited before it: still the user's gesture
  await session();
  if (!alive()) return;
  onSession();
  await (mic ? started : startSource());
}

/** Vietnamese only by default (his choice 2026-10-15); English too once the bilingual switch was ticked ("on" stored). */
export function bilingual(stored) {
  return stored === "on";
}

/** The recognizer's results as one text: final ones, then interim ones; the last MAX_WORDS words. */
export function recognizerText(results) {
  let text = "";
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r && r[0] && typeof r[0].transcript === "string") text += " " + r[0].transcript;
  }
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(-MAX_WORDS).join(" ");
}

export function createRecognizerSource(o) {
  const Rec = o.Recognition === undefined
    ? (typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null)
    : o.Recognition;
  const restartMs = o.restartMs ?? 250;
  let rec = null;
  let running = false;
  let fatal = null;
  let errors = 0;

  function make() {
    const r = new Rec();
    r.continuous = true;
    r.interimResults = true;
    r.lang = o.lang || "en-US";
    r.maxAlternatives = 1;
    r.onstart = () => { o.onState("listening"); };
    r.onresult = (ev) => {
      errors = 0;
      o.onText(recognizerText(ev.results));
    };
    r.onerror = (ev) => {
      const e = ev && ev.error;
      if (e === "not-allowed" || e === "service-not-allowed") fatal = "mic_denied";
      else if (e === "audio-capture") fatal = "no_mic";
      else if (e === "network") { errors += 1; o.onState("recognizer_network"); }
      else if (e === "language-not-supported") fatal = "unsupported";
    };
    r.onend = () => {
      o.onText("");  // what was pending is final
      if (!running) return;
      if (fatal) {
        running = false;
        o.onState(fatal);
        return;
      }
      setTimeout(() => {
        if (!running) return;
        try { r.start(); } catch (e) { /* already started */ }
      }, restartMs + Math.min(5000, errors * 1000));
    };
    return r;
  }

  return {
    supported: Boolean(Rec),
    start() {
      if (!Rec) { o.onState("unsupported"); return false; }
      running = true;
      fatal = null;
      if (!rec) rec = make();
      try { rec.start(); } catch (e) { /* already started */ }
      o.onState("listening");
      return true;
    },
    stop() {
      running = false;
      if (rec) { try { rec.stop(); } catch (e) { /* not started */ } }
      o.onState("stopped");
    },
  };
}

export function createHelperSource(o) {
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  const ES = o.EventSource || (typeof EventSource !== "undefined" ? EventSource : null);
  const ports = o.ports || HELPER_PORTS;
  const now = o.now || (() => Date.now());
  const wait = o.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let base = null;
  let es = null;
  let lastSeq = null;
  let run = 0;  // a stop (or a new start) ends the start in progress

  const post = (url, body) => doFetch(url, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body) });

  function onEvent(ev) {
    let d;
    try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (!d || typeof d.text !== "string") return;
    if (d.seq !== undefined && d.seq === lastSeq) return;
    lastSeq = d.seq;
    o.onText(d.text);
  }

  async function find(source) {
    for (const p of ports) {
      const b = "http://127.0.0.1:" + p;
      try {
        const r = await post(b + "/api/live/start", { source, hide: true });
        if (r.ok) return b;
      } catch (e) { /* the next port */ }
    }
    return null;
  }

  return {
    get base() { return base; },
    // opts.retry: no helper yet -> "no_helper_retry", asked again every HELPER_RETRY_MS for HELPER_RETRY_FOR_MS
    // (the page offers to open ViTranslate meanwhile), then "no_helper"
    async start(source, opts) {
      const me = ++run;
      const retry = Boolean(opts && opts.retry);
      const t0 = now();
      let told = false;
      base = null;
      let found = await find(source);
      while (!found && retry && me === run && now() - t0 < HELPER_RETRY_FOR_MS) {
        if (!told) o.onState("no_helper_retry");
        told = true;
        await wait(HELPER_RETRY_MS);
        if (me !== run) break;
        found = await find(source);
      }
      if (me !== run) {  // stopped meanwhile: a helper that answered late is told to stop too
        if (found) { try { await post(found + "/api/live/stop", {}); } catch (e) { /* helper gone */ } }
        return false;
      }
      base = found;
      if (!base || !ES) { base = null; o.onState("no_helper"); return false; }
      lastSeq = null;
      es = new ES(base + "/api/live/stream");
      es.addEventListener("message", onEvent);
      es.addEventListener("caption", onEvent);
      es.addEventListener("status", (ev) => {  // the reader's state: waiting (no caption window), error, listening
        let d;
        try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (!d) return;
        if (d.state === "listening") o.onState(d.code === "docked" ? "docked" : "listening");
        else if (d.state === "waiting") o.onState("waiting");
        else if (d.state === "error") o.onState(d.code === "uia_changed" ? "uia_changed" : "helper_error");
      });
      es.addEventListener("open", () => o.onState("listening"));
      es.addEventListener("error", () => o.onState(es && es.readyState === 2 ? "lost" : "reconnecting"));
      o.onState("listening");
      return true;
    },
    async stop() {
      run += 1;
      if (es) es.close();
      es = null;
      if (base) { try { await post(base + "/api/live/stop", {}); } catch (e) { /* helper gone */ } }
      base = null;
      o.onState("stopped");
    },
  };
}
