// Client of the cloud engine (spec Amendment F): the Pages Functions API on the page's own origin.
//   POST /api/v1/session   {turnstile}                      -> {session, expires_s, quota: {segments_left_today}}
//   POST /api/v1/classify  {session, text: the whole document text (what translateFile hands to prepare: the
//                           helper's whole-document glossary hits), domain?: [ids]}
//                          -> {classify: the helper's "classify" event, setup: {packs: [{id, version}], hits: [EN keys]},
//                              setup_id} (the event may also come at the top level next to setup / setup_id)
//   POST /api/v1/translate {session, job_id, setup_id, setup: {packs, hits} (the document's setup as classify gave it,
//                           the same in every batch),
//                           segments: [{id, tagged, essential, prev, nxt, where}] (<= 20)}
//                          -> {results: [{id, text, level, flags, cached, reduced, spans}], usage}
//   GET  /api/v1/status                                      -> {ok, model, budget_left_today}
// Errors are JSON {code}: bad_turnstile (403), quota_exceeded / budget_exhausted (429), model_error (502); a 401 is a
// session that expired. The page reads and writes the document itself (OOXML in the browser): only text is sent
// (segments, their neighbours' text, location labels), never file bytes or images. No DOM here; fetch and sleep are
// injectable for the tests.
export const API_BASE = "/api/v1/";
export const BATCH_SIZE = 20;
export const CONCURRENCY = 3;                // translate batches of one job in flight at once
export const MAX_RETRIES = 2;                // a failed batch is sent at most 3 times
export const BACKOFF_MS = [2000, 6000];      // waits before the 1st and the 2nd retry
export const SESSION_MARGIN_S = 30;          // a session is renewed this long before the server's expiry

/** An API answer that is not a success: code = the server's code, or network | server_error | bad_response |
 * session_expired | no_session | http_<status>. */
export class CloudError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "CloudError";
    this.code = code;
    this.status = status || 0;
  }
}

const RETRYABLE = new Set(["network", "server_error", "model_error", "bad_response"]);
const errText = (e) => String(e && e.message ? e.message : e);

function abortError(signal) {
  const r = signal && signal.reason;
  return r && r.name === "AbortError" ? r : new DOMException("The operation was aborted.", "AbortError");
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError(signal)); return; }
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => { clearTimeout(t); reject(abortError(signal)); }, { once: true });
    }
  });
}

/** The API client: { status(), openSession(turnstileToken), hasSession(), dropSession(), session, classify(),
 * translateBatch() }. opts: { base, fetch, sleep, now }. */
export function createCloud(opts) {
  const o = opts || {};
  const base = o.base || API_BASE;
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  const now = o.now || (() => Date.now());
  let session = null;  // { token, expiresAt (ms), quota }

  async function call(method, path, body, signal) {
    if (signal && signal.aborted) throw abortError(signal);
    let res;
    try {
      res = await doFetch(base + path, { method, cache: "no-store", credentials: "same-origin", signal,
        headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      if ((signal && signal.aborted) || (e && e.name === "AbortError")) throw abortError(signal);
      throw new CloudError("network", "Không kết nối được máy chủ dịch (" + errText(e) + ").", 0);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const code = data && typeof data.code === "string" ? data.code
        : res.status === 401 ? "session_expired" : res.status >= 500 ? "server_error" : "http_" + res.status;
      throw new CloudError(code, (data && typeof data.message === "string" && data.message) || "HTTP " + res.status,
        res.status);
    }
    if (data === null || typeof data !== "object") {
      throw new CloudError("bad_response", "The server's answer is not JSON.", res.status);
    }
    return data;
  }

  function token() {
    if (!session) throw new CloudError("no_session", "No session: Turnstile must run first.", 0);
    return session.token;
  }

  return {
    sleep: o.sleep || null,  // the backoff wait of the jobs (tests make it instant)
    get session() { return session; },
    hasSession() { return !!session && now() < session.expiresAt; },
    dropSession() { session = null; },
    status(signal) { return call("GET", "status", null, signal); },
    async openSession(turnstile, signal) {
      const d = await call("POST", "session", { turnstile }, signal);
      if (typeof d.session !== "string" || !d.session) throw new CloudError("bad_response", "No session token.", 200);
      const life = Math.max(0, (Number(d.expires_s) || 0) - SESSION_MARGIN_S);
      session = { token: d.session, expiresAt: now() + life * 1000, quota: d.quota || null };
      return session;
    },
    async classify(text, copts) {
      const c = copts || {};
      const body = { session: token(), text: String(text == null ? "" : text) };
      if (c.domain && c.domain.length) body.domain = c.domain;
      return call("POST", "classify", body, c.signal);
    },
    // doc: the document's {setup_id?, setup: {packs, hits}} from classify, sent unchanged with every batch
    async translateBatch(jobId, doc, segments, signal) {
      if (segments.length > BATCH_SIZE) throw new RangeError("at most " + BATCH_SIZE + " segments per request");
      const body = { session: token(), job_id: jobId };
      if (doc.setup_id !== undefined) body.setup_id = doc.setup_id;
      Object.assign(body, { setup: { packs: doc.setup.packs, hits: doc.setup.hits }, segments });
      const d = await call("POST", "translate", body, signal);
      if (!Array.isArray(d.results)) throw new CloudError("bad_response", "The answer has no results.", 200);
      return d;
    },
  };
}

// The fields of a segment that are sent: its tagged text, its location label, and when the pipeline gives them the
// neighbouring segments' plain text (prev / nxt: the core's context lines) and the span ids kept at level 3. Text
// only: never file bytes or images (spec Amendment F, 20:01).
const SENT_FIELDS = ["id", "tagged", "where", "prev", "nxt", "essential"];

function wireSegment(s) {
  const out = {};
  for (const k of SENT_FIELDS) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

// The pipeline's setup (core.prepareTranslation's fields that translateFile reads) from a classify answer.
function setupFrom(ev) {
  const packs = Array.isArray(ev.packs) ? ev.packs.filter((p) => p && typeof p.id === "string") : [];
  const unavailable = Array.isArray(ev.unavailable) ? ev.unavailable : [];
  return {
    classify: Object.assign({}, ev, { stage: "classify" }),
    pack: packs.length ? { id: packs.map((p) => p.id).join("+"), name: packs.map((p) => p.name || p.id).join(" + "),
      key: packs.map((p) => p.id + "@" + p.version).join("+") } : { id: "_none", name: "Chung", key: "_none@0" },
    packRows: packs.map((p) => ({ id: p.id, name: p.name || p.id, version: p.version || null, score: p.score,
      matched: p.matched || [], reason: p.reason, source: null })),
    unavailable, unavailableNames: unavailable, offline: !!ev.offline,
  };
}

const packIds = (packs) => (Array.isArray(packs) ? packs : []).filter((p) => p && typeof p.id === "string")
  .map((p) => ({ id: p.id, version: p.version }));

// translateFile's domain ("pathology, breast") -> ids for /classify
const domainIds = (domain) => String(domain || "").split(",").map((d) => d.trim()).filter(Boolean);

/**
 * The functions one cloud job injects into the page pipeline (pipeline.js translateFile):
 *   prepare(fullText, {domain, signal}) -> setup: POST /classify once with the whole document text; the answer's
 *     setup {packs, hits} and setup_id are kept for the document
 *   translateSegments(segments, {setup, tm, signal, onBatch(done, batchResults)}) -> [{id, text, level, flags, ...}],
 *     sent in batches of <= 20 with the job id and the SAME setup (setup_id, packs, hits) in every batch, up to
 *     CONCURRENCY batches in flight at once; the results come back in segment order, and onBatch sees the batches in
 *     segment order too (one that finishes early waits for the ones before it); every field of a result passes
 *     through (reduced / spans tell the pipeline which segment the text belongs to).
 * A failed batch is retried twice with backoff (network, server error, model_error, an incomplete answer);
 * quota_exceeded / budget_exhausted (or a batch that fails for good) stop the job at once: the batches in flight are
 * aborted and no other one is sent; so does the job's signal. An expired session is renewed once through renew() (a
 * new Turnstile token), one renewal for all the batches in flight. opts: { jobId, domain (ids, when prepare gets
 * none), signal, sleep, renew, onRetry }.
 */
export function cloudJob(cloud, opts) {
  const o = opts || {};
  const signal = o.signal;
  const sleep = o.sleep || cloud.sleep || defaultSleep;
  let doc = { setup: { packs: [], hits: [] } };  // the document's setup for /translate: {setup_id?, setup}
  const usage = { neurons: 0 };
  let renewing = null;  // the session renewal in progress, shared by the batches in flight

  function renewSession() {
    if (!renewing) renewing = Promise.resolve().then(() => o.renew()).finally(() => { renewing = null; });
    return renewing;
  }

  async function withRetries(send, sig) {
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      if (renewing) await renewing.catch(() => {});  // never send while another batch renews the session
      const used = cloud.session && cloud.session.token;
      try {
        return await send();
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        if (e instanceof CloudError && e.code === "session_expired" && o.renew && !renewed) {
          renewed = true;
          // renewed by another batch meanwhile: just send again
          if (!cloud.session || cloud.session.token === used) await renewSession();
          attempt -= 1;  // a renewed session is not a retry of the batch
          continue;
        }
        if (!(e instanceof CloudError) || !RETRYABLE.has(e.code) || attempt >= MAX_RETRIES) throw e;
        if (o.onRetry) o.onRetry(attempt + 1, e);
        await sleep(BACKOFF_MS[attempt], sig);
      }
    }
  }

  // one batch with its retries -> its results in the batch's order
  function sendBatch(batch, sig) {
    return withRetries(async () => {
      const d = await cloud.translateBatch(o.jobId, doc, batch, sig);
      const byId = new Map(d.results.filter((r) => r && r.id !== undefined).map((r) => [String(r.id), r]));
      const missing = batch.filter((s) => !byId.has(String(s.id)));
      if (missing.length) {
        throw new CloudError("bad_response", "The answer misses " + missing.length + " segment(s).", 200);
      }
      if (d.usage && Number.isFinite(d.usage.neurons)) usage.neurons += d.usage.neurons;
      return batch.map((s) => byId.get(String(s.id)));
    }, sig);
  }

  return {
    jobId: o.jobId,
    usage,
    get setup() { return doc; },
    /** POST /classify -> the classify event; keeps the document's setup for the batches. */
    async classify(text, domain) {
      const ids = domain && domain.length ? domain : o.domain;
      const answer = await withRetries(() => cloud.classify(text, { domain: ids, signal }), signal);
      const ev = answer.classify && typeof answer.classify === "object" ? answer.classify
        : Object.fromEntries(Object.entries(answer).filter(([k]) => k !== "setup" && k !== "setup_id"));
      const s = answer.setup && typeof answer.setup === "object" ? answer.setup : null;
      doc = { setup: { packs: s && Array.isArray(s.packs) ? packIds(s.packs) : packIds(ev.packs),
        hits: s && Array.isArray(s.hits) ? s.hits : [] } };
      if (answer.setup_id !== undefined) doc.setup_id = answer.setup_id;
      return ev;
    },
    async prepare(fullText, popts) {
      return setupFrom(await this.classify(fullText, domainIds((popts || {}).domain)));
    },
    async translateSegments(segments, topts) {
      const t = topts || {};
      if (signal && signal.aborted) throw abortError(signal);
      const batches = [];
      for (let i = 0; i < segments.length; i += BATCH_SIZE) batches.push(segments.slice(i, i + BATCH_SIZE).map(wireSegment));
      const results = new Array(batches.length);  // per batch, filled as they come back
      // stops the batches in flight: the job's signal, or the first error that ends the job
      const stop = new AbortController();
      const onAbort = () => stop.abort(signal.reason);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      let failure = null;
      let next = 0, shown = 0, done = 0;
      const flush = () => {  // onBatch in segment order
        while (shown < batches.length && results[shown]) {
          done += results[shown].length;
          if (t.onBatch) t.onBatch(done, results[shown]);
          shown += 1;
        }
      };
      const worker = async () => {
        while (!failure && !stop.signal.aborted && next < batches.length) {
          const k = next++;
          try {
            results[k] = await sendBatch(batches[k], stop.signal);
          } catch (e) {
            if (!failure) {
              failure = e;
              stop.abort();
            }
            return;
          }
          flush();
        }
      };
      try {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
      }
      if (signal && signal.aborted) throw abortError(signal);
      if (failure) throw failure;
      return results.flat();
    },
  };
}
