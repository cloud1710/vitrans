// The admin gate (spec Amendment G): the author's review page and its API live under /admin/ (web/admin/,
// functions/admin/api/), which a Cloudflare Access application protects (his e-mail only). Every admin request is
// checked here as well -- the second lock, never open:
// - ACCESS_AUD (the Access application's AUD tag), ACCESS_TEAM (the team name, <team>.cloudflareaccess.com or its
//   https origin) and ADMIN_EMAILS (comma-separated) must be set: else 503 admin_not_configured;
// - the Cf-Access-Jwt-Assertion header (Access adds it to the requests it lets through) must be an RS256 JWT signed by
//   a key of https://<team>.cloudflareaccess.com/cdn-cgi/access/certs, with that origin as issuer, ACCESS_AUD in its
//   audience, a valid time (exp, nbf; CLOCK_SKEW_S of leeway) and an e-mail of ADMIN_EMAILS (any case): else 403
//   forbidden with a short reason (no token, not valid, another application, expired, e-mail not on the list) --
//   never the token's content;
// - the certs are kept per isolate for CERTS_TTL_MS and fetched again for an unknown key id (Access rotates its keys)
//   at most once per REFETCH_MS; certs that cannot be fetched: 503 access_unavailable.
// Nothing here logs a token, a claim or an e-mail.
import { ApiError } from "./http.js";
import { fromB64u } from "./session.js";

export const CERTS_TTL_MS = 3600 * 1000;
export const REFETCH_MS = 60 * 1000;
export const CLOCK_SKEW_S = 30;
const MAX_TOKEN = 8192;
const TEAM_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const enc = new TextEncoder();

const notConfigured = () => new ApiError(503, "admin_not_configured", "The admin page is not configured " +
  "(Cloudflare Access: ACCESS_AUD, ACCESS_TEAM, ADMIN_EMAILS).");
const forbidden = (reason) => new ApiError(403, "forbidden", "Admin access only (Cloudflare Access): " + reason);
const NO_TOKEN = "no Cloudflare Access token came with the request.";
const NOT_VALID = "the Cloudflare Access token is not valid.";
const unavailable = () => new ApiError(503, "access_unavailable", "The Cloudflare Access keys could not be " +
  "fetched; try again shortly.");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** https://<team>.cloudflareaccess.com of a team name, host or origin; null when it is none of these. */
export function teamOrigin(team) {
  let t = String(team || "").trim().toLowerCase().replace(/^https:\/\//, "").replace(/\/+$/, "");
  if (t.endsWith(".cloudflareaccess.com")) t = t.slice(0, -".cloudflareaccess.com".length);
  return TEAM_RE.test(t) ? "https://" + t + ".cloudflareaccess.com" : null;
}

const certs = new Map(); // team origin -> {at, keys: Map(kid -> Promise<CryptoKey | null>)}

async function fetchKeys(origin, fetch) {
  let data;
  try {
    const res = await fetch(origin + "/cdn-cgi/access/certs", { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error("certs HTTP " + res.status);
    data = await res.json();
  } catch (err) {
    throw unavailable();
  }
  const keys = new Map();
  for (const k of isObject(data) && Array.isArray(data.keys) ? data.keys : []) {
    if (!isObject(k) || typeof k.kid !== "string" || k.kty !== "RSA" || typeof k.n !== "string" ||
      typeof k.e !== "string") continue;
    keys.set(k.kid, crypto.subtle.importKey("jwk", { kty: "RSA", n: k.n, e: k.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]).catch(() => null));
  }
  return keys;
}

async function keyFor(origin, kid, { fetch, now }) {
  const t = now();
  let entry = certs.get(origin);
  if (!entry || t - entry.at > CERTS_TTL_MS || (!entry.keys.has(kid) && t - entry.at > REFETCH_MS)) {
    entry = { at: t, keys: await fetchKeys(origin, fetch) };
    certs.set(origin, entry);
  }
  return entry.keys.has(kid) ? entry.keys.get(kid) : null;
}

function jsonPart(part) {
  const bytes = fromB64u(part);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (err) {
    return null;
  }
}

/** {email} of the admin making this request, or the ApiError described in the module notes. cfg: loadConfig(env);
 * deps: {fetch (the certs), now () -> ms}. */
export async function requireAdmin(request, cfg, { fetch, now }) {
  const origin = teamOrigin(cfg.accessTeam);
  if (!cfg.accessAud || !origin || !cfg.adminEmails.length) throw notConfigured();
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw forbidden(NO_TOKEN);
  const parts = token.length > MAX_TOKEN ? [] : token.split(".");
  if (parts.length !== 3) throw forbidden(NOT_VALID);
  const header = jsonPart(parts[0]);
  const claims = jsonPart(parts[1]);
  const sig = fromB64u(parts[2]);
  if (!isObject(header) || !isObject(claims) || !sig || !sig.length || header.alg !== "RS256" ||
    typeof header.kid !== "string") throw forbidden(NOT_VALID);
  const key = await keyFor(origin, header.kid, { fetch, now });
  if (!key || !(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, enc.encode(parts[0] + "." + parts[1])))) {
    throw forbidden(NOT_VALID);
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== origin || !aud.includes(cfg.accessAud)) {
    throw forbidden("the token is for another Access application or team (ACCESS_AUD, ACCESS_TEAM).");
  }
  const t = Math.floor(now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp <= t - CLOCK_SKEW_S || (claims.nbf !== undefined &&
    !(Number.isFinite(claims.nbf) && claims.nbf <= t + CLOCK_SKEW_S))) {
    throw forbidden("the Access login has expired or is not valid yet; reload the page.");
  }
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || !cfg.adminEmails.includes(email)) {
    throw forbidden("the e-mail of this Access login is not on the admin list (ADMIN_EMAILS).");
  }
  return { email };
}
