// Session tokens of the translation API. After a Turnstile check the server issues
//   base64url(JSON {v: 1, sid, iph, exp}) "." base64url(HMAC-SHA256(SESSION_SECRET, "vt-session.v1." + payload))
// sid: 16 random bytes; iph: keyed hash of the client IP at Turnstile time (IPv6 counted per /64, so one host cannot
// rotate through its prefix); exp: Unix seconds. The token is not bound to the IP of later requests (a phone that
// switches network keeps its session); per-IP limits count against iph. The raw IP is never stored or logged.
import { ApiError } from "./http.js";

const enc = new TextEncoder();
const keys = new Map(); // secret -> Promise<CryptoKey> (per isolate)

function checkSecret(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new ApiError(500, "server_misconfigured", "SESSION_SECRET is missing or shorter than 32 characters.");
  }
}

function hmacKey(secret) {
  if (!keys.has(secret)) {
    keys.set(secret, crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false,
      ["sign", "verify"]));
  }
  return keys.get(secret);
}

export function b64u(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(text) {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function ipv4(text) {
  const parts = text.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return parts.map(Number);
}

function ipv6Groups(text) {
  let head = text;
  let tail4 = null;
  const lastColon = text.lastIndexOf(":");
  if (text.includes(".")) { // embedded IPv4 in the last 32 bits
    tail4 = ipv4(text.slice(lastColon + 1));
    if (!tail4) return null;
    head = text.slice(0, lastColon + 1) + "0:0";
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const side = (s) => (s === "" ? [] : s.split(":"));
  const left = side(halves[0]);
  const right = halves.length === 2 ? side(halves[1]) : [];
  if (![...left, ...right].every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right].map((g) => parseInt(g, 16));
  if (tail4) {
    groups[6] = tail4[0] * 256 + tail4[1];
    groups[7] = tail4[2] * 256 + tail4[3];
  }
  return groups;
}

/** IPv4 as it is; IPv6 as its /64 prefix ("2001:db8:0:0::/64"); IPv4-mapped IPv6 as the IPv4; else "unknown". */
export function normalizeIp(ip) {
  if (typeof ip !== "string" || !ip) return "unknown";
  const text = ip.trim();
  const v4 = ipv4(text);
  if (v4) return v4.join(".");
  if (!text.includes(":")) return "unknown";
  const g = ipv6Groups(text);
  if (!g) return "unknown";
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
  }
  return g.slice(0, 4).map((x) => x.toString(16)).join(":") + "::/64";
}

async function sign(secret, text) {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(text)));
}

/** Keyed hash of the normalised IP: 16 bytes of HMAC-SHA256, base64url (22 characters). */
export async function ipHash(secret, ip) {
  checkSecret(secret);
  return b64u((await sign(secret, "vt-ip.v1|" + normalizeIp(ip))).slice(0, 16));
}

const SIG_PREFIX = "vt-session.v1.";
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** {token, sid, iph, exp} for a new session of the client at `ip`, valid ttl seconds from now (ms). */
export async function issueSession(secret, { ip, ttl, now }) {
  checkSecret(secret);
  const sid = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const iph = await ipHash(secret, ip);
  const exp = Math.floor(now / 1000) + ttl;
  const payload = b64u(enc.encode(JSON.stringify({ v: 1, sid, iph, exp })));
  const token = payload + "." + b64u(await sign(secret, SIG_PREFIX + payload));
  return { token, sid, iph, exp };
}

const expired = () => new ApiError(401, "session_expired", "The session is not valid or has expired; open a new one.");

/** {sid, iph, exp} of a valid, unexpired token; 401 session_expired for anything else. */
export async function verifySession(secret, token, now) {
  checkSecret(secret);
  if (typeof token !== "string" || token.length > 512) throw expired();
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw expired();
  const sig = fromB64u(parts[1]);
  if (!sig || !fromB64u(parts[0])) throw expired();
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(SIG_PREFIX + parts[0]));
  if (!ok) throw expired();
  let p;
  try {
    p = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fromB64u(parts[0])));
  } catch (err) {
    throw expired();
  }
  if (!p || p.v !== 1 || !ID_RE.test(String(p.sid)) || !ID_RE.test(String(p.iph)) || !Number.isInteger(p.exp)) {
    throw expired();
  }
  if (Math.floor(now / 1000) >= p.exp) throw expired();
  return { sid: p.sid, iph: p.iph, exp: p.exp };
}
