// Configuration of the translation API: wrangler.toml [vars] (strings) with these defaults. Secrets
// (TURNSTILE_SECRET, SESSION_SECRET; ACCESS_AUD, ACCESS_TEAM, ADMIN_EMAILS for the admin pages) and bindings (AI,
// COUNTERS, FEEDBACK) are checked where they are used.
import { ApiError } from "./http.js";

export const DEFAULTS = {
  MODEL: "@cf/google/gemma-4-26b-a4b-it",
  // Workers AI price list (neurons per million tokens) of the model; no discounted cached-input rate is listed for
  // Gemma 4 26B, so cached tokens count at the input rate until one is.
  NEURONS_PER_M_INPUT: 9091,
  NEURONS_PER_M_CACHED: 9091,
  NEURONS_PER_M_OUTPUT: 27273,
  // The user's cap (2026-10-14 20:15): $20 a month for all three sub-projects incl. the $5 Workers Paid base, so at
  // most $15 of Workers AI overage ($0.011 per 1,000 neurons above the account's free 10,000 a day).
  DAILY_NEURON_BUDGET: 55000, // all users together, per UTC day: 10,000 free + 45,000 billed = $0.50
  FREE_NEURONS_PER_DAY: 10000,
  MONTHLY_BILLED_NEURON_CAP: 1363000, // $15 of billed neurons per UTC month
  USD_PER_1000_NEURONS: 0.011,
  LIVE_BUDGET_SHARE: 0.5, // live captions may use at most this share of the daily budget
  // live captions (profile "live", the /live/ page; his decisions 2026-10-14 20:15): one live job (job_id) may run
  // LIVE_MINUTES_PER_DAY active minutes per UTC day (4 h); a request holds at most LIVE_MAX_SEGMENTS sentences of at
  // most LIVE_MAX_CHARS code points and answers by LIVE_DEADLINE_MS (a sentence not translated by then comes back
  // empty, flagged "deadline")
  LIVE_MINUTES_PER_DAY: 240,
  LIVE_MAX_SEGMENTS: 3,
  LIVE_MAX_CHARS: 1000,
  LIVE_DEADLINE_MS: 3000,
  SESSION_TTL_S: 43200, // 12 h: one browser check (Turnstile) a working day (his report 2026-10-15)
  SESSION_SEGMENTS_PER_DAY: 1500, // segments one session may translate per UTC day
  IP_SEGMENTS_PER_DAY: 3000, // segments one client IP (IPv6: its /64) may translate per UTC day
  MAX_SEGMENTS_PER_REQUEST: 20,
  MAX_SEGMENT_CHARS: 10000, // code points of one tagged segment (and of its prev / nxt context)
  MAX_CLASSIFY_BYTES: 2 * 1024 * 1024, // the whole document's text
  MAX_TRANSLATE_BYTES: 1024 * 1024,
  CLASSIFY_CHARS_PER_UNIT: 10000, // a classify call counts as one segment per started 10,000 characters
  // a /terms call counts as one segment per started 2,000 characters of src + vi: about the neurons of one
  // translated segment, so the per-session and per-IP caps bound the term review's cost as they bound translation's
  TERMS_CHARS_PER_UNIT: 2000,
  FEEDBACK_ROWS_PER_DAY: 500, // term pairs one client IP may send to the author per UTC day
};

function num(env, name, { integer = false, min = 0, max = Infinity, positive = false } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === null || raw === "") return DEFAULTS[name];
  const v = typeof raw === "number" ? raw : Number(String(raw).trim());
  const ok = Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)) && (!positive || v > 0);
  if (!ok) throw new ApiError(500, "server_misconfigured", "The setting " + name + " is not valid.");
  return v;
}

const list = (raw) => String(raw || "").split(",").map((s) => s.trim()).filter((s) => s);

export function loadConfig(env) {
  return {
    model: String(env.MODEL || DEFAULTS.MODEL),
    rates: { input: num(env, "NEURONS_PER_M_INPUT"), cached: num(env, "NEURONS_PER_M_CACHED"),
      output: num(env, "NEURONS_PER_M_OUTPUT") },
    dailyBudget: num(env, "DAILY_NEURON_BUDGET"),
    freeNeurons: num(env, "FREE_NEURONS_PER_DAY"),
    monthlyBilledCap: num(env, "MONTHLY_BILLED_NEURON_CAP"),
    usdPer1000: num(env, "USD_PER_1000_NEURONS"),
    liveShare: num(env, "LIVE_BUDGET_SHARE", { max: 1 }),
    liveMinutes: num(env, "LIVE_MINUTES_PER_DAY", { integer: true }),
    liveMaxSegments: num(env, "LIVE_MAX_SEGMENTS", { integer: true, min: 1, max: 20 }),
    liveMaxChars: num(env, "LIVE_MAX_CHARS", { integer: true, positive: true }),
    liveDeadlineMs: num(env, "LIVE_DEADLINE_MS", { integer: true, positive: true }),
    sessionTtl: num(env, "SESSION_TTL_S", { integer: true, positive: true }),
    sessionSegments: num(env, "SESSION_SEGMENTS_PER_DAY", { integer: true }),
    ipSegments: num(env, "IP_SEGMENTS_PER_DAY", { integer: true }),
    maxSegments: num(env, "MAX_SEGMENTS_PER_REQUEST", { integer: true, min: 1, max: 20 }),
    maxSegmentChars: num(env, "MAX_SEGMENT_CHARS", { integer: true, positive: true }),
    maxClassifyBytes: num(env, "MAX_CLASSIFY_BYTES", { integer: true, positive: true }),
    maxTranslateBytes: num(env, "MAX_TRANSLATE_BYTES", { integer: true, positive: true }),
    classifyCharsPerUnit: num(env, "CLASSIFY_CHARS_PER_UNIT", { integer: true, positive: true }),
    termsCharsPerUnit: num(env, "TERMS_CHARS_PER_UNIT", { integer: true, positive: true }),
    feedbackRowsPerDay: num(env, "FEEDBACK_ROWS_PER_DAY", { integer: true }),
    turnstileHostnames: list(env.TURNSTILE_HOSTNAMES),
    allowTestTurnstile: String(env.ALLOW_TEST_TURNSTILE || "") === "1",
    accessAud: String(env.ACCESS_AUD || "").trim(),
    accessTeam: String(env.ACCESS_TEAM || "").trim(),
    adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  };
}
