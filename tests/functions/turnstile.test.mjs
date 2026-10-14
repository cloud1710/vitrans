// Turnstile: the token from the page is checked with siteverify (secret from TURNSTILE_SECRET) before a session is
// issued. Test-key results ("result_with_testing_key") pass only where ALLOW_TEST_TURNSTILE=1 (local dev, preview);
// with TURNSTILE_HOSTNAMES set, the widget's hostname must be one of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile, SITEVERIFY_URL } from "../../functions/_lib/turnstile.js";
import { loadConfig } from "../../functions/_lib/config.js";
import { ApiError } from "../../functions/_lib/http.js";
import { fakeSiteverify, PASS, TEST_PASS, FAIL, TEST_TURNSTILE_SECRET } from "./helpers.mjs";

const prod = loadConfig({ TURNSTILE_HOSTNAMES: "vitrans.pages.dev,*.vitrans.pages.dev" });
const dev = loadConfig({ ALLOW_TEST_TURNSTILE: "1" });
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

async function code(p) {
  try {
    await p;
    return null;
  } catch (e) {
    assert.ok(e instanceof ApiError, String(e));
    return e.status + " " + e.code;
  }
}

test("a passing token is verified with the secret, the token and the client IP", async () => {
  const sv = fakeSiteverify(PASS);
  assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: "real-secret", ip: "203.0.113.7", fetch: sv.fetch,
    cfg: prod })), null);
  assert.equal(sv.calls.length, 1);
  assert.equal(sv.calls[0].url, SITEVERIFY_URL);
  assert.equal(SITEVERIFY_URL, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.deepEqual(sv.calls[0].body, { secret: "real-secret", response: TOKEN, remoteip: "203.0.113.7" });
});

test("missing, empty or oversized tokens are refused without calling siteverify", async () => {
  const sv = fakeSiteverify(PASS);
  for (const token of [undefined, null, "", 42, "x".repeat(2049)]) {
    assert.equal(await code(verifyTurnstile({ token, secret: "s", ip: "1.2.3.4", fetch: sv.fetch, cfg: prod })),
      "403 bad_turnstile", String(token).slice(0, 20));
  }
  assert.equal(sv.calls.length, 0);
});

test("a failed check is 403 bad_turnstile; siteverify down is 503 turnstile_unavailable", async () => {
  assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: "s", ip: "1.2.3.4", fetch: fakeSiteverify(FAIL).fetch,
    cfg: prod })), "403 bad_turnstile");
  assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: "s", ip: "1.2.3.4",
    fetch: fakeSiteverify(new TypeError("network")).fetch, cfg: prod })), "503 turnstile_unavailable");
  const html = async () => new Response("<html>bad gateway</html>", { status: 502 });
  assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: "s", ip: "1.2.3.4", fetch: html, cfg: prod })),
    "503 turnstile_unavailable");
});

test("test-key results pass only with ALLOW_TEST_TURNSTILE=1; a missing secret is a server misconfiguration", async () => {
  const sv = fakeSiteverify(TEST_PASS);
  assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: TEST_TURNSTILE_SECRET, ip: "1.2.3.4",
    fetch: sv.fetch, cfg: prod })), "403 bad_turnstile");
  assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: TEST_TURNSTILE_SECRET, ip: "1.2.3.4",
    fetch: sv.fetch, cfg: dev })), null);
  assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: "", ip: "1.2.3.4", fetch: sv.fetch, cfg: dev })),
    "500 server_misconfigured");
});

test("with TURNSTILE_HOSTNAMES the widget's hostname must match (exact or *.suffix)", async () => {
  for (const [hostname, ok] of [["vitrans.pages.dev", true], ["w1-preview.vitrans.pages.dev", true],
    ["a.b.vitrans.pages.dev", true], ["evilvitrans.pages.dev", false], ["vitrans.pages.dev.evil.example", false],
    ["example.com", false], [undefined, false]]) {
    const sv = fakeSiteverify({ ...PASS, hostname });
    assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: "s", ip: "1.2.3.4", fetch: sv.fetch, cfg: prod })),
      ok ? null : "403 bad_turnstile", String(hostname));
  }
  const any = fakeSiteverify({ ...PASS, hostname: "anything.example" });
  assert.equal(await code(verifyTurnstile({ token: TOKEN, secret: "s", ip: "1.2.3.4", fetch: any.fetch,
    cfg: loadConfig({}) })), null, "no hostname list: not checked");
});
