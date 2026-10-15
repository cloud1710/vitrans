// The live page's translation side (live-captions spec 9.1-9.6, his decision 2026-10-15 07:15: each committed
// sentence goes straight to the cloud core with the previous sentence(s) as context, fast).
//   createLiveApi({fetch, jobId, setup () -> {packs, hits}, session () -> token, renew (), sleep}) -> {translate(items)}
//     POST /api/v1/translate {session, job_id, profile: "live", setup: {packs, hits: []}, segments: [{id, tagged,
//     prev}]} -> {results, usage, quota, live}; a 401 renews the session once (renew(token) gets the token that
//     failed); a network / server / model failure is sent once more after RETRY_MS; anything else (429 quota_exceeded /
//     budget_exhausted / live_time_exceeded, 400) is thrown with its code. endpoint () -> {url, local} (web/adapter.js):
//     local = the same route on the ViTranslate helper ("Tren may"): no session, no renewal, a longer wait
//     (LOCAL_TIMEOUT_MS: a CPU takes seconds a sentence); onCall ({op, engine, segments, ms, status, code}): a log line.
//   createLiveQueue({translate, onResult (id, result | {error}), onState (code), maxInFlight, maxBatch, ready}) ->
//     {add, stop, release}: sentences added in the same moment go together (<= maxBatch per request); <= maxInFlight
//     requests at once; while ready() is false (no session yet: the browser check runs) nothing is sent and nothing is
//     marked, the sentences wait; release(keep) once the session is there sends the last WAIT_KEEP waiting and answers
//     the older ones {error: "skipped"} (left untranslated in the transcript);
//     when it falls behind (requests in flight and more than 2 waiting) the newest goes first and the older ones
//     follow; a sentence translated before is answered from memory (this page only, never stored; with its term
//     repair en_fixed / repairs when the host gave one); a quota error
//     stops the queue and answers every sentence with it.
// No DOM; fetch and sleep are injected for the tests.
export const API_PATH = "/api/v1/translate";
export const RETRY_MS = 1000;
export const CLIENT_TIMEOUT_MS = 8000;  // the server answers by its own deadline (3 s) -- this is for a lost network
export const LOCAL_TIMEOUT_MS = 60000;  // the helper has no deadline: a sentence on a slow CPU
export const PREV_CHARS = 300;
export const WAIT_KEEP = 5;             // sentences said before the session exists that are still translated
const RETRYABLE = new Set(["network", "server_error", "model_error", "bad_response", "timeout"]);
const STOPPING = new Set(["quota_exceeded", "budget_exhausted", "live_time_exceeded"]);

const coded = (code, message, status) => Object.assign(new Error(message || code), { code, status: status || 0 });

/** "live-" + 22 random url-safe characters (128 bits): the live job id, also the server's prefix-cache key. */
export function newJobId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return "live-" + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The previous 1-2 committed sentences (oldest first), at most PREV_CHARS characters (the nearest kept). */
export function prevContext(sentences) {
  const last = sentences.slice(-2);
  let text = last.join(" ");
  if (Array.from(text).length > PREV_CHARS) text = last[last.length - 1] || "";
  const cps = Array.from(text);
  return cps.length > PREV_CHARS ? cps.slice(cps.length - PREV_CHARS).join("") : text;
}

export function createLiveApi(o) {
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

  // sent.token: the session token of this request (a 401 renews that one)
  async function once(items, sent) {
    const setup = o.setup();
    const ep = o.endpoint ? o.endpoint("translate") : { url: API_PATH, local: false };
    sent.local = ep.local;
    sent.token = ep.local ? null : await o.session();
    const body = { ...(ep.local ? {} : { session: sent.token }), job_id: o.jobId, profile: "live",
      setup: { packs: setup.packs || [], hits: [] },
      segments: items.map((i) => ({ id: i.id, tagged: i.en, ...(i.prev ? { prev: i.prev } : {}) })) };
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ep.local ? LOCAL_TIMEOUT_MS : CLIENT_TIMEOUT_MS) : null;
    let res;
    try {
      res = await doFetch(ep.url, { method: "POST", cache: "no-store", credentials: ep.local ? "omit" : "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
    } catch (e) {
      if (ctrl && ctrl.signal.aborted) throw coded("timeout", String((e && e.message) || e));
      throw coded(ep.local ? "helper_not_found" : "network", String((e && e.message) || e));
    } finally {
      if (timer) clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const code = data && typeof data.code === "string" ? data.code
        : res.status === 401 ? "session_expired" : res.status >= 500 ? "server_error" : "http_" + res.status;
      throw coded(code, data && data.message, res.status);
    }
    if (!data || !Array.isArray(data.results)) throw coded("bad_response", "no results");
    return data;
  }

  function report(items, t0, sent, err) {
    if (!o.onCall) return;
    try {
      o.onCall({ op: "translate", engine: sent.local ? "local" : "cloud", segments: items.length,
        ms: Date.now() - t0, status: err && err.status ? err.status : undefined, code: err ? err.code : "ok" });
    } catch (e) { /* the log never stops the captions */ }
  }

  return {
    async translate(items) {
      let renewed = false;
      let retried = false;
      const sent = { token: null, local: false };
      for (;;) {
        const t0 = Date.now();
        try {
          const d = await once(items, sent);
          report(items, t0, sent, null);
          return d;
        } catch (e) {
          report(items, t0, sent, e);
          if (e.code === "session_expired" && !renewed && o.renew && !sent.local) {
            renewed = true;
            await o.renew(sent.token);
            continue;
          }
          if (RETRYABLE.has(e.code) && !retried) {
            retried = true;
            await sleep(RETRY_MS);
            continue;
          }
          throw e;
        }
      }
    },
  };
}

export function createLiveQueue(o) {
  const maxInFlight = o.maxInFlight || 2;
  const maxBatch = o.maxBatch || 3;
  const ready = o.ready || (() => true);
  const memory = new Map();  // English sentence -> its translation (this page's memory only)
  let queue = [];
  let inFlight = 0;
  let stopped = null;        // the code that stopped the queue
  let scheduled = false;

  function answer(id, r) {
    try { o.onResult(id, r); } catch (e) { /* the page's problem, not the queue's */ }
  }

  function take() {
    if (inFlight > 0 && queue.length > 2) return [queue.pop()];  // falling behind: the newest first
    return queue.splice(0, maxBatch);
  }

  function pump() {
    scheduled = false;
    while (!stopped && ready() && inFlight < maxInFlight && queue.length) {
      const batch = take();
      inFlight += 1;
      o.translate(batch).then((d) => {
        const byId = new Map(d.results.map((r) => [String(r.id), r]));
        for (const it of batch) {
          const r = byId.get(String(it.id));
          if (!r) { answer(it.id, { id: it.id, error: "bad_response" }); continue; }
          if (r.text && !(r.flags || []).includes("deadline")) {
            memory.set(it.en, { text: r.text, flags: r.flags || [],
              ...(typeof r.en_fixed === "string" ? { en_fixed: r.en_fixed, repairs: r.repairs || [] } : {}) });
          }
          answer(it.id, { ...r, ...(it.revision ? { revision: true } : {}) });
        }
      }, (e) => {
        const code = (e && e.code) || "network";
        if (STOPPING.has(code)) {
          stopped = code;
          if (o.onState) o.onState(code);
          for (const it of batch.concat(queue)) answer(it.id, { id: it.id, error: code });
          queue = [];
          return;
        }
        for (const it of batch) answer(it.id, { id: it.id, error: code });
      }).finally(() => {
        inFlight -= 1;
        pump();
      });
    }
  }

  return {
    add(item) {
      if (stopped) { answer(item.id, { id: item.id, error: stopped }); return; }
      const known = !item.revision && memory.get(item.en);
      if (known) { answer(item.id, { id: item.id, ...known, cached: true }); return; }
      queue = queue.filter((q) => q.id !== item.id);  // a revision replaces the waiting version
      queue.push(item);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(pump);  // the sentences committed in this moment go together
      }
    },
    stop() {
      queue = [];
    },
    // the session is there (or the run ended without one: keep 0): the older waiting sentences stay untranslated
    release(keep = WAIT_KEEP) {
      const old = queue.slice(0, Math.max(0, queue.length - keep));
      queue = queue.slice(old.length);
      for (const it of old) answer(it.id, { id: it.id, error: "skipped" });
      pump();
    },
    get stopped() { return stopped; },
    resume() { stopped = null; },
  };
}
