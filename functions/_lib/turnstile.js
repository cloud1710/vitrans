// Turnstile check before a session is issued (siteverify, secret TURNSTILE_SECRET). Results made with Cloudflare's
// test keys (metadata.result_with_testing_key) are accepted only where ALLOW_TEST_TURNSTILE=1 (local dev and the
// preview deployment: a secret set per environment, never in production). With TURNSTILE_HOSTNAMES set, the
// hostname the widget ran on must be one of them ("*.suffix" matches any subdomain).
import { ApiError } from "./http.js";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN = 2048;

const bad = () => new ApiError(403, "bad_turnstile", "The anti-abuse check (Turnstile) failed; reload and try again.");

function hostMatches(host, patterns) {
  if (typeof host !== "string" || !host) return false;
  const h = host.toLowerCase();
  return patterns.some((p) => {
    const pat = p.toLowerCase();
    return pat.startsWith("*.") ? h.endsWith(pat.slice(1)) && h.length > pat.length - 1 : h === pat;
  });
}

export async function verifyTurnstile({ token, secret, ip, fetch, cfg }) {
  if (!secret) throw new ApiError(500, "server_misconfigured", "TURNSTILE_SECRET is not set.");
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN) throw bad();
  const body = { secret, response: token };
  if (ip && ip !== "unknown") body.remoteip = ip;
  let result;
  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error("siteverify HTTP " + res.status);
    result = await res.json();
  } catch (err) {
    throw new ApiError(503, "turnstile_unavailable", "The anti-abuse check could not be reached; try again shortly.");
  }
  if (!result || result.success !== true) throw bad();
  if (result.metadata && result.metadata.result_with_testing_key === true) {
    if (!cfg.allowTestTurnstile) throw bad();
    return;
  }
  if (cfg.turnstileHostnames.length && !hostMatches(result.hostname, cfg.turnstileHostnames)) throw bad();
}
