// The translation API (spec Amendment F), one handler per route; functions/api/v1/*.js bind them to the routes.
//   POST /api/v1/session   {turnstile}                         -> {session, expires_s, quota: {segments_left_today}}
//   POST /api/v1/classify  {session, text, domain?: [ids], profile? (file | photo)} -> the helper's classify event
//        (each pack with its version) + {setup: {packs, hits}, setup_id}; text = the whole document (the segments'
//        plain text joined by "\n", what the client's translateFile passes to its injected prepare); profile photo
//        (the image tool's few short lines): no pack by the automatic selection -> the packs the text names
//        (engine.js photoPacks)
//   POST /api/v1/translate {session, job_id, setup, setup_id?, profile? (file | photo | live), segments: [{id, tagged,
//        essential?, prev?, nxt?, where?}] (<= 20)} -> {results: [{id, text, level, flags, cached, reduced, spans}],
//        usage, quota}; profile "live" (live captions, live.js): <= LIVE_MAX_SEGMENTS sentences {id, tagged, prev?},
//        the setup's packs only (glossary hits per sentence, term repair of mis-heard terms: each result + {en_fixed,
//        repairs: [{from, to}]}), a deadline, + {live: {minutes_left_today}}
//   GET  /api/v1/status                                        -> {ok, model, budget_left_today, month_spent_usd}
//   POST /api/v1/terms     {session, job_id, setup, setup_id?, items: [{id, src, vi}] (<= 200, <= 60,000
//        characters)} -> {terms: [{en, vi, count, ids}], usage} (spec Amendment G; terms.js)
//   POST /api/v1/feedback  {session, items: [{en, vi_used, vi_user, pack, kind}] (<= 50)} -> {ok: true, stored}
//        (term pairs to the author, D1; feedback.js)
//   GET  /admin/api/feedback?status=new|approved|rejected|all  -> {rows} \  the author's review (web/admin/), behind
//   POST /admin/api/decide {key, decision: approved | rejected} -> {ok}  /  Cloudflare Access + access.js
// Text only: JSON bodies with known fields, size caps, no file, image or binary payload. Nothing is stored but
// counters; nothing that a request or the model wrote is logged. deps: {bundle (tools/bundle_packs.py output),
// fetch (Turnstile siteverify), now () -> ms, sleep? (tests: no waiting between retries or paced model calls)}.
import { ApiError, json, readJsonBody, handle } from "./http.js";
import { loadConfig } from "./config.js";
import { issueSession, verifySession, ipHash } from "./session.js";
import { verifyTurnstile } from "./turnstile.js";
import { readLimits, enforce, record, utcDay, readLiveTime, enforceLiveTime, recordLiveMinute } from "./limits.js";
import { createModel, newUsage, ModelCallError } from "./model.js";
import { packSetOf, classifyDocument, checkSetup, translate } from "./engine.js";
import { checkTermItems, findTerms } from "./terms.js";
import { translateLive } from "./live.js";
import { checkFeedbackItems, storeFeedback, listFeedback, decideFeedback, STATUSES, DECISIONS } from "./feedback.js";
import { requireAdmin } from "./access.js";

const SESSION_BYTES = 8192;
const FEEDBACK_BYTES = 128 * 1024;
const DECIDE_BYTES = 4096;
const KEY_RE = /^[0-9a-f]{64}$/;
const JOB_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PACK_ID_RE = /^[a-z0-9_-]+$/;
const MAX_DOMAIN = 6;
const MAX_ESSENTIAL = 1000;
const MAX_WHERE = 300;
const PROFILES = ["file", "photo", "live"]; // sub-projects; "live" is limited to LIVE_BUDGET_SHARE of the day

const badRequest = (message) => new ApiError(400, "bad_request", message);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const round3 = (x) => Math.round(x * 1000) / 1000;

function cpLen(text) {
  let n = 0;
  for (const ch of text) n += ch ? 1 : 0;
  return n;
}

const NEEDS = {
  SESSION_SECRET: (v) => typeof v === "string" && v.length >= 32,
  TURNSTILE_SECRET: (v) => typeof v === "string" && v.length > 0,
  COUNTERS: (v) => Boolean(v) && typeof v.get === "function" && typeof v.put === "function",
  AI: (v) => Boolean(v) && typeof v.run === "function",
  FEEDBACK: (v) => Boolean(v) && typeof v.prepare === "function" && typeof v.batch === "function",
};
const TRANSLATION_NEEDS = ["SESSION_SECRET", "TURNSTILE_SECRET", "COUNTERS", "AI"]; // what /status reports as ok

function need(env, names) {
  for (const n of names) {
    if (!NEEDS[n](env[n])) throw new ApiError(500, "server_misconfigured", n + " is not configured.");
  }
}

function onlyKeys(obj, allowed) {
  if (!Object.keys(obj).every((k) => allowed.includes(k))) throw badRequest("The request has a field it may not have.");
}

function requireSession(body) {
  if (!("session" in body)) throw badRequest("session is required (POST /api/v1/session first).");
}

function checkSegments(list, cfg) {
  if (!Array.isArray(list) || list.length < 1 || list.length > cfg.maxSegments) {
    throw badRequest("segments must hold 1 to " + cfg.maxSegments + " segments.");
  }
  const ids = new Set();
  return list.map((s) => {
    if (!isObject(s)) throw badRequest("Each segment must be an object.");
    onlyKeys(s, ["id", "tagged", "essential", "prev", "nxt", "where"]);
    const idOk = (typeof s.id === "string" && s.id.length >= 1 && s.id.length <= 64) || Number.isSafeInteger(s.id);
    if (!idOk || ids.has(String(s.id))) throw badRequest("Each segment needs its own id (text or an integer).");
    ids.add(String(s.id));
    if (typeof s.tagged !== "string") throw badRequest("A segment's tagged text is missing.");
    for (const k of ["prev", "nxt", "where"]) {
      if (s[k] !== undefined && typeof s[k] !== "string") throw badRequest("A segment's " + k + " must be text.");
    }
    if (s.where !== undefined && cpLen(s.where) > MAX_WHERE) throw badRequest("A segment's where label is too long.");
    if ([s.tagged, s.prev || "", s.nxt || ""].some((t) => cpLen(t) > cfg.maxSegmentChars)) {
      throw new ApiError(413, "too_large", "A segment or its context is longer than " + cfg.maxSegmentChars +
        " characters.");
    }
    if (s.essential !== undefined && (!Array.isArray(s.essential) || s.essential.length > MAX_ESSENTIAL ||
      !s.essential.every((n) => Number.isInteger(n) && n >= 0 && n <= 1e6))) {
      throw badRequest("A segment's essential list must hold span numbers.");
    }
    return { id: s.id, tagged: s.tagged, essential: s.essential || [], prev: s.prev || "", nxt: s.nxt || "",
      where: s.where || "" };
  });
}

/** The API error for a failed batch: abort (client gone), the account's Workers AI allocation (429), any other
 * model trouble (502 model_error, logged with the Workers AI code only); anything else is not a model error. */
function modelFailure(err) {
  if (err && (err.name === "AbortError" || err.code === "aborted")) {
    return new ApiError(499, "aborted", "The request was cancelled.");
  }
  let call = null;
  for (let e = err, depth = 0; e && depth < 6; e = e.cause, depth++) {
    if (e instanceof ModelCallError) {
      call = e;
      break;
    }
  }
  if (call && call.kind === "budget") {
    return new ApiError(429, "budget_exhausted", "Today's translation budget of the service is used up; " +
      "try again after 00:00 UTC.");
  }
  if (call || (err && err.name === "ModelError")) { // kind json: a term list that is not the JSON asked for
    console.error("model_error", call ? call.kind : "model", (call && call.aiCode) || "-");
    return new ApiError(502, "model_error", "The translation model did not answer; try again shortly.");
  }
  return err;
}

function shownUsage(u) {
  return { calls: u.calls, prompt_tokens: u.prompt_tokens, cached_tokens: u.cached_tokens,
    completion_tokens: u.completion_tokens, neurons: round3(u.neurons) };
}

export const sessionApi = (ctx, deps) => handle(ctx, ["POST"], async ({ request, env }) => {
  const cfg = loadConfig(env);
  need(env, ["SESSION_SECRET", "TURNSTILE_SECRET", "COUNTERS"]);
  const body = await readJsonBody(request, SESSION_BYTES);
  onlyKeys(body, ["turnstile"]);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  await verifyTurnstile({ token: body.turnstile, secret: env.TURNSTILE_SECRET, ip, fetch: deps.fetch, cfg });
  const now = deps.now();
  const iph = await ipHash(env.SESSION_SECRET, ip);
  const state = await readLimits(env.COUNTERS, cfg, { now, sid: null, iph });
  enforce(state, cfg);
  const s = await issueSession(env.SESSION_SECRET, { ip, ttl: cfg.sessionTtl, now });
  return json(200, { session: s.token, expires_s: cfg.sessionTtl, quota: { segments_left_today: state.segmentsLeft } });
});

export const classifyApi = (ctx, deps) => handle(ctx, ["POST"], async ({ request, env }) => {
  const cfg = loadConfig(env);
  need(env, ["SESSION_SECRET", "COUNTERS"]);
  const body = await readJsonBody(request, cfg.maxClassifyBytes);
  onlyKeys(body, ["session", "text", "domain", "profile"]);
  requireSession(body);
  if (typeof body.text !== "string") throw badRequest("text must be the document's text.");
  const profile = body.profile === undefined ? "file" : body.profile;
  if (profile !== "file" && profile !== "photo") throw badRequest("profile must be file or photo.");
  const domain = body.domain === undefined ? [] : body.domain;
  if (!Array.isArray(domain) || domain.length > MAX_DOMAIN ||
    !domain.every((d) => typeof d === "string" && PACK_ID_RE.test(d))) {
    throw badRequest("domain must be a list of at most " + MAX_DOMAIN + " pack ids.");
  }
  const now = deps.now();
  const s = await verifySession(env.SESSION_SECRET, body.session, now);
  const state = await readLimits(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph });
  enforce(state, cfg);
  const set = await packSetOf(deps.bundle);
  const r = await classifyDocument(set, body.text, domain, { photo: profile === "photo" });
  const units = Math.max(1, Math.ceil(cpLen(body.text) / cfg.classifyCharsPerUnit));
  await record(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph, segments: units });
  return json(200, { ...r.event, setup: r.setup, setup_id: r.setupId });
});

function checkLiveSegments(segments, cfg) {
  if (segments.length > cfg.liveMaxSegments) {
    throw badRequest("A live request holds at most " + cfg.liveMaxSegments + " sentences.");
  }
  if (segments.some((s) => cpLen(s.tagged) > cfg.liveMaxChars || cpLen(s.prev) > cfg.liveMaxChars)) {
    throw new ApiError(413, "too_large", "A live sentence or its context is longer than " + cfg.liveMaxChars +
      " characters.");
  }
}

/** Profile "live" (live.js): the live job's minutes and the live share checked, the sentences translated with the
 * short prompt by the deadline; the counters are written after the answer (ctx.waitUntil), with the neurons of calls
 * that finish after it. */
async function translateLiveApi(ctx, deps, { cfg, body, segments, now, s }) {
  const { request, env } = ctx;
  const job = { now, job: body.job_id };
  const [state, time] = await Promise.all([readLimits(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph }),
    readLiveTime(env.COUNTERS, job)]);
  enforce(state, cfg, "live");
  enforceLiveTime(time, cfg);
  const set = await packSetOf(deps.bundle);
  const setup = await checkSetup(set, body.setup, body.setup_id);
  const usage = newUsage();
  const model = createModel(env.AI, { model: cfg.model, rates: cfg.rates, affinity: body.job_id, usage, retries: 0 });
  const minute = recordLiveMinute(env.COUNTERS, job, time);
  const later = (p) => (typeof ctx.waitUntil === "function" ? ctx.waitUntil(p) : null);
  let out;
  try {
    out = await translateLive(set, setup, segments, { model, modelKey: cfg.model, deadlineMs: cfg.liveDeadlineMs,
      signal: request.signal || null });
  } catch (err) {
    later(minute);
    later(record(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph, neurons: usage.neurons, profile: "live" }));
    throw modelFailure(err);
  }
  const shown = shownUsage(usage);
  const counted = usage.neurons;
  later(record(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph, segments: segments.length, neurons: counted,
    profile: "live" }));
  if (out.pending.length) {
    later(Promise.all(out.pending).then(() => (usage.neurons > counted
      ? record(env.COUNTERS, cfg, { now, neurons: usage.neurons - counted, profile: "live" }) : null)));
  }
  const used = await minute;
  return json(200, { results: out.results, usage: shown,
    quota: { segments_left_today: Math.max(0, state.segmentsLeft - segments.length) },
    live: { minutes_left_today: Math.max(0, cfg.liveMinutes - used) } });
}

export const translateApi = (ctx, deps) => handle(ctx, ["POST"], async ({ request, env }) => {
  const cfg = loadConfig(env);
  need(env, ["SESSION_SECRET", "COUNTERS", "AI"]);
  const body = await readJsonBody(request, cfg.maxTranslateBytes);
  onlyKeys(body, ["session", "job_id", "setup", "setup_id", "segments", "profile"]);
  requireSession(body);
  if (typeof body.job_id !== "string" || !JOB_RE.test(body.job_id)) {
    throw badRequest("job_id must be 1 to 64 letters, digits, - or _.");
  }
  if (!("setup" in body)) throw badRequest("setup is required (as /api/v1/classify returned it).");
  const profile = body.profile === undefined ? "file" : body.profile;
  if (!PROFILES.includes(profile)) throw badRequest("profile must be one of " + PROFILES.join(", ") + ".");
  const segments = checkSegments(body.segments, cfg);
  if (profile === "live") checkLiveSegments(segments, cfg);
  const now = deps.now();
  const s = await verifySession(env.SESSION_SECRET, body.session, now);
  if (profile === "live") return translateLiveApi(ctx, deps, { cfg, body, segments, now, s });
  const state = await readLimits(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph });
  enforce(state, cfg, profile);
  const set = await packSetOf(deps.bundle);
  const setup = await checkSetup(set, body.setup, body.setup_id);
  const usage = newUsage();
  const model = createModel(env.AI, { model: cfg.model, rates: cfg.rates, affinity: body.job_id, usage,
    ...(deps.sleep ? { sleep: deps.sleep } : {}) });
  let results;
  try {
    results = await translate(set, setup, segments, { model, modelKey: cfg.model, signal: request.signal || null,
      sleep: deps.sleep });
  } catch (err) {
    await record(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph, neurons: usage.neurons, profile }); // spent even so
    throw modelFailure(err);
  }
  await record(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph, segments: segments.length, neurons: usage.neurons,
    profile });
  return json(200, { results, usage: shownUsage(usage),
    quota: { segments_left_today: Math.max(0, state.segmentsLeft - segments.length) } });
});

export const termsApi = (ctx, deps) => handle(ctx, ["POST"], async ({ request, env }) => {
  const cfg = loadConfig(env);
  need(env, ["SESSION_SECRET", "COUNTERS", "AI"]);
  const body = await readJsonBody(request, cfg.maxTranslateBytes);
  onlyKeys(body, ["session", "job_id", "setup", "setup_id", "items"]);
  requireSession(body);
  if (typeof body.job_id !== "string" || !JOB_RE.test(body.job_id)) {
    throw badRequest("job_id must be 1 to 64 letters, digits, - or _.");
  }
  if (!("setup" in body)) throw badRequest("setup is required (as /api/v1/classify returned it).");
  const items = checkTermItems(body.items);
  const now = deps.now();
  const s = await verifySession(env.SESSION_SECRET, body.session, now);
  const state = await readLimits(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph });
  enforce(state, cfg, "file");
  const set = await packSetOf(deps.bundle);
  const setup = await checkSetup(set, body.setup, body.setup_id);
  const usage = newUsage();
  const model = createModel(env.AI, { model: cfg.model, rates: cfg.rates, affinity: body.job_id, usage,
    ...(deps.sleep ? { sleep: deps.sleep } : {}) });
  let terms;
  try {
    terms = await findTerms(set, setup, items, { model, signal: request.signal || null });
  } catch (err) {
    await record(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph, neurons: usage.neurons, profile: "file" });
    throw modelFailure(err);
  }
  const chars = items.reduce((n, it) => n + cpLen(it.src) + cpLen(it.vi), 0);
  const units = Math.max(1, Math.ceil(chars / cfg.termsCharsPerUnit));
  await record(env.COUNTERS, cfg, { now, sid: s.sid, iph: s.iph, segments: units, neurons: usage.neurons,
    profile: "file" });
  return json(200, { terms, usage: shownUsage(usage) });
});

export const feedbackApi = (ctx, deps) => handle(ctx, ["POST"], async ({ request, env }) => {
  const cfg = loadConfig(env);
  need(env, ["SESSION_SECRET", "FEEDBACK"]);
  const body = await readJsonBody(request, FEEDBACK_BYTES);
  onlyKeys(body, ["session", "items"]);
  requireSession(body);
  const set = await packSetOf(deps.bundle);
  // "_none": the page's pack id for a job that matched no pack (terms of a new domain are still worth a review)
  const items = checkFeedbackItems(body.items, [...set.manifest.packs.map((p) => p.id), "_none"]);
  const now = deps.now();
  const s = await verifySession(env.SESSION_SECRET, body.session, now);
  const stored = await storeFeedback(env.FEEDBACK, items, { day: utcDay(now), iph: s.iph,
    limit: cfg.feedbackRowsPerDay });
  return json(200, { ok: true, stored });
});

export const adminFeedbackApi = (ctx, deps) => handle(ctx, ["GET"], async ({ request, env }) => {
  await requireAdmin(request, loadConfig(env), deps);
  need(env, ["FEEDBACK"]);
  const status = new URL(request.url).searchParams.get("status") || "all";
  if (status !== "all" && !STATUSES.includes(status)) {
    throw badRequest("status must be one of " + STATUSES.join(", ") + " or all.");
  }
  return json(200, { rows: await listFeedback(env.FEEDBACK, status) });
});

export const adminDecideApi = (ctx, deps) => handle(ctx, ["POST"], async ({ request, env }) => {
  await requireAdmin(request, loadConfig(env), deps);
  need(env, ["FEEDBACK"]);
  const body = await readJsonBody(request, DECIDE_BYTES);
  onlyKeys(body, ["key", "decision"]);
  if (typeof body.key !== "string" || !KEY_RE.test(body.key)) throw badRequest("key must be a row's key.");
  if (!DECISIONS.includes(body.decision)) throw badRequest("decision must be " + DECISIONS.join(" or ") + ".");
  if (!(await decideFeedback(env.FEEDBACK, body.key, body.decision))) {
    throw new ApiError(404, "not_found", "No row has this key.");
  }
  return json(200, { ok: true, key: body.key, status: body.decision });
});

export const statusApi = (ctx, deps) => handle(ctx, ["GET"], async ({ env }) => {
  const cfg = loadConfig(env);
  const ok = TRANSLATION_NEEDS.every((n) => NEEDS[n](env[n]));
  let state = null;
  if (NEEDS.COUNTERS(env.COUNTERS)) {
    try {
      state = await readLimits(env.COUNTERS, cfg, { now: deps.now() });
    } catch (err) {
      state = null;
    }
  }
  return json(200, { ok, model: cfg.model, budget_left_today: state ? state.budgetLeft : null,
    month_spent_usd: state ? state.monthSpentUsd : null });
});
