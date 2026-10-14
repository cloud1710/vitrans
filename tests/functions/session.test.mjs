// Session tokens: HMAC-SHA256 signed (crypto.subtle), about an hour long, carrying a random session id and a keyed
// hash of the client IP (IPv6 counted per /64) -- never the IP itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIp, ipHash, issueSession, verifySession } from "../../functions/_lib/session.js";
import { ApiError } from "../../functions/_lib/http.js";
import { TEST_SESSION_SECRET } from "./helpers.mjs";

const NOW = 1_800_000_000_000;

test("IPs are normalised: IPv4 as is, IPv6 to its /64, IPv4-mapped IPv6 to IPv4, garbage to unknown", () => {
  assert.equal(normalizeIp("203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeIp("2001:db8:85a3:8d3:1319:8a2e:370:7348"), "2001:db8:85a3:8d3::/64");
  assert.equal(normalizeIp("2001:DB8::1"), "2001:db8:0:0::/64");
  assert.equal(normalizeIp("2001:db8:0:0:ffff::2"), "2001:db8:0:0::/64");
  assert.equal(normalizeIp("::1"), "0:0:0:0::/64");
  assert.equal(normalizeIp("::ffff:198.51.100.4"), "198.51.100.4");
  for (const bad of [null, undefined, "", "not an ip", "1.2.3", "300.1.1.1", "2001:db8:::1", "1:2:3:4:5:6:7:8:9"]) {
    assert.equal(normalizeIp(bad), "unknown", String(bad));
  }
});

test("the IP hash is keyed, stable, the same for one IPv6 /64, and never contains the IP", async () => {
  const a = await ipHash(TEST_SESSION_SECRET, "203.0.113.7");
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(await ipHash(TEST_SESSION_SECRET, "203.0.113.7"), a);
  assert.notEqual(await ipHash(TEST_SESSION_SECRET, "203.0.113.8"), a);
  assert.notEqual(await ipHash("another-secret-another-secret-123456", "203.0.113.7"), a);
  assert.equal(await ipHash(TEST_SESSION_SECRET, "2001:db8:1:2::5"), await ipHash(TEST_SESSION_SECRET, "2001:db8:1:2:ff::9"));
  assert.ok(!a.includes("203"));
});

test("a session token round-trips: random id, IP hash, expiry = now + ttl; URL-safe and without the IP", async () => {
  const s = await issueSession(TEST_SESSION_SECRET, { ip: "203.0.113.7", ttl: 3600, now: NOW });
  assert.match(s.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(!s.token.includes("203.0.113.7"));
  assert.equal(s.exp, Math.floor(NOW / 1000) + 3600);
  assert.equal(s.iph, await ipHash(TEST_SESSION_SECRET, "203.0.113.7"));
  assert.match(s.sid, /^[A-Za-z0-9_-]{22}$/);
  const v = await verifySession(TEST_SESSION_SECRET, s.token, NOW + 10_000);
  assert.deepEqual(v, { sid: s.sid, iph: s.iph, exp: s.exp });
  const t = await issueSession(TEST_SESSION_SECRET, { ip: "203.0.113.7", ttl: 3600, now: NOW });
  assert.notEqual(t.sid, s.sid, "every session gets its own id");
});

async function expired(promise) {
  await assert.rejects(promise, (e) => e instanceof ApiError && e.status === 401 && e.code === "session_expired");
}

test("expired, tampered, foreign or malformed tokens are 401 session_expired", async () => {
  const s = await issueSession(TEST_SESSION_SECRET, { ip: "203.0.113.7", ttl: 60, now: NOW });
  await expired(verifySession(TEST_SESSION_SECRET, s.token, NOW + 60_000));
  const [payload, sig] = s.token.split(".");
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  forged.exp += 100000;
  await expired(verifySession(TEST_SESSION_SECRET, Buffer.from(JSON.stringify(forged)).toString("base64url") + "." + sig, NOW));
  await expired(verifySession(TEST_SESSION_SECRET, payload + "." + sig.slice(0, -2) + (sig.endsWith("A") ? "BB" : "AA"), NOW));
  await expired(verifySession("another-secret-another-secret-123456", s.token, NOW));
  for (const bad of ["", "abc", "a.b.c", ".", "!!!.???", payload, payload + ".", null, 42, { token: s.token }]) {
    await expired(verifySession(TEST_SESSION_SECRET, bad, NOW));
  }
});

test("a session secret shorter than 32 characters is a server misconfiguration", async () => {
  for (const secret of [undefined, "", "short"]) {
    await assert.rejects(issueSession(secret, { ip: "203.0.113.7", ttl: 60, now: NOW }),
      (e) => e instanceof ApiError && e.status === 500 && e.code === "server_misconfigured");
    await assert.rejects(verifySession(secret, "a.b", NOW),
      (e) => e instanceof ApiError && e.status === 500 && e.code === "server_misconfigured");
  }
});
