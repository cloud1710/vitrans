// Daily and monthly limits, kept as counters in the COUNTERS KV namespace (KV holds counters only, never content):
//   v1:b:<day>        neurons used by all users (the daily budget)
//   v1:l:<day>        neurons used by live captions (profile "live": at most LIVE_BUDGET_SHARE of the daily budget)
//   v1:m:<month>      billed neurons of the month: what each day used above the free allocation
//   v1:s:<day>:<sid>  segments translated by one session
//   v1:i:<day>:<iph>  segments translated by one client IP hash (session.js)
//   v1:t / v1:u:<day>:<job>  active minutes of one live job (live captions, below)
// <day> / <month> are UTC (2026-10-14 / 2026-10); day keys expire after KEY_TTL_S, month keys after MONTH_TTL_S.
// Counters are read, then written (read-modify-write): two requests at the same moment can lose an increment, and KV
// reads may lag up to 60 s between Cloudflare locations, so the limits are approximate -- a little overshoot is
// possible, never an unbounded one (each request is capped). The free allocation is the account's: other Workers AI
// use on the same account is not counted here.
import { ApiError } from "./http.js";

export const KEY_TTL_S = 2 * 86400;
export const MONTH_TTL_S = 40 * 86400;

export function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function utcMonth(now) {
  return new Date(now).toISOString().slice(0, 7);
}

const budgetKey = (day) => "v1:b:" + day;
const liveKey = (day) => "v1:l:" + day;
const monthKey = (month) => "v1:m:" + month;
const sessionKey = (day, sid) => "v1:s:" + day + ":" + sid;
const ipKey = (day, iph) => "v1:i:" + day + ":" + iph;
const round3 = (x) => Math.round(x * 1000) / 1000;

async function readNum(kv, key) {
  const v = Number(await kv.get(key));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** {day, month, budgetUsed, liveUsed, monthBilled, sessionUsed, ipUsed, segmentsLeft, budgetLeft (fraction of the
 * day's budget still usable, 0 once the month's cap is reached), monthSpentUsd}; sid / iph may be null. */
export async function readLimits(kv, cfg, { now, sid = null, iph = null }) {
  const day = utcDay(now);
  const month = utcMonth(now);
  const [budgetUsed, liveUsed, monthBilled, sessionUsed, ipUsed] = await Promise.all([readNum(kv, budgetKey(day)),
    readNum(kv, liveKey(day)), readNum(kv, monthKey(month)), sid ? readNum(kv, sessionKey(day, sid)) : 0,
    iph ? readNum(kv, ipKey(day, iph)) : 0]);
  const segmentsLeft = Math.max(0, Math.min(cfg.sessionSegments - sessionUsed, cfg.ipSegments - ipUsed));
  const budgetLeft = monthBilled >= cfg.monthlyBilledCap || cfg.dailyBudget <= 0 ? 0
    : round3(Math.max(0, 1 - budgetUsed / cfg.dailyBudget));
  const monthSpentUsd = Math.round(monthBilled * cfg.usdPer1000 / 10) / 100;
  return { day, month, budgetUsed, liveUsed, monthBilled, sessionUsed, ipUsed, segmentsLeft, budgetLeft, monthSpentUsd };
}

const exhausted = (message) => new ApiError(429, "budget_exhausted", message);

/** 429 budget_exhausted when the day's budget, the month's billed cap or (profile "live") the live share is used up
 * (checked first); 429 quota_exceeded when the session or the IP has reached its cap. A request is served while at
 * least one segment is left. */
export function enforce(state, cfg, profile = "file") {
  if (state.monthBilled >= cfg.monthlyBilledCap) {
    throw exhausted("This month's translation budget of the service is used up; it starts again on the 1st (UTC).");
  }
  if (state.budgetUsed >= cfg.dailyBudget) {
    throw exhausted("Today's translation budget of the service is used up; try again after 00:00 UTC.");
  }
  if (profile === "live" && state.liveUsed >= cfg.liveShare * cfg.dailyBudget) {
    throw exhausted("Today's share for live captions is used up; try again after 00:00 UTC.");
  }
  if (state.sessionUsed >= cfg.sessionSegments || state.ipUsed >= cfg.ipSegments) {
    throw new ApiError(429, "quota_exceeded", "The daily translation limit is reached; try again after 00:00 UTC.");
  }
}

// Live captions: active minutes of one live job (its job_id) per UTC day.
//   v1:t:<day>:<job>  minutes in which the job sent at least one request
//   v1:u:<day>:<job>  the last minute counted (minutes since the epoch)
// Written once a minute per job at most; approximate like every counter here.
const liveTimeKey = (day, job) => "v1:t:" + day + ":" + job;
const liveMinuteKey = (day, job) => "v1:u:" + day + ":" + job;

/** {used (active minutes today), last (the last minute counted, or 0)} of a live job. */
export async function readLiveTime(kv, { now, job }) {
  const day = utcDay(now);
  const [used, last] = await Promise.all([readNum(kv, liveTimeKey(day, job)), readNum(kv, liveMinuteKey(day, job))]);
  return { used, last };
}

/** 429 live_time_exceeded once a live job has used its minutes of the day. */
export function enforceLiveTime(t, cfg) {
  if (t.used >= cfg.liveMinutes) {
    throw new ApiError(429, "live_time_exceeded", "This live session has used its " + Math.round(cfg.liveMinutes / 60) +
      " hours for today; try again after 00:00 UTC.");
  }
}

/** Count this request's minute for a live job (once per minute) -> the minutes used today, this one included. */
export async function recordLiveMinute(kv, { now, job }, t) {
  const minute = Math.floor(now / 60000);
  if (t.last === minute) return t.used;
  const day = utcDay(now);
  await Promise.all([put(kv, liveTimeKey(day, job), t.used + 1, KEY_TTL_S, "live_time"),
    put(kv, liveMinuteKey(day, job), minute, KEY_TTL_S, "live_minute")]);
  return t.used + 1;
}

async function put(kv, key, value, ttl, kind) {
  try {
    await kv.put(key, String(value), { expirationTtl: ttl });
  } catch (err) {
    console.warn("counter_write_failed", kind); // best effort: the answer is already earned
  }
}

async function add(kv, key, delta, kind, ttl = KEY_TTL_S) {
  let before = 0;
  try {
    before = await readNum(kv, key);
  } catch (err) {
    console.warn("counter_read_failed", kind);
  }
  await put(kv, key, round3(before + delta), ttl, kind);
  return before;
}

/** Count a served request: segments on the session and IP counters; neurons on the day's budget, on the month's
 * billed counter (only the part above the day's free allocation) and, for profile "live", on the live counter.
 * Never throws. */
export async function record(kv, cfg, { now, sid = null, iph = null, segments = 0, neurons = 0, profile = "file" }) {
  const day = utcDay(now);
  const writes = [];
  if (neurons > 0) {
    writes.push((async () => {
      const before = await add(kv, budgetKey(day), neurons, "budget");
      const after = before + neurons;
      const billed = round3(Math.max(0, after - cfg.freeNeurons) - Math.max(0, before - cfg.freeNeurons));
      if (billed > 0) await add(kv, monthKey(utcMonth(now)), billed, "month", MONTH_TTL_S);
    })());
    if (profile === "live") writes.push(add(kv, liveKey(day), neurons, "live"));
  }
  if (segments > 0 && sid) writes.push(add(kv, sessionKey(day, sid), segments, "session"));
  if (segments > 0 && iph) writes.push(add(kv, ipKey(day, iph), segments, "ip"));
  await Promise.all(writes);
}
