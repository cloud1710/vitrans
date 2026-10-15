// The author's review API (spec Amendment G): GET /admin/api/feedback?status= and POST /admin/api/decide {key,
// decision}, under /admin/ with the review page, behind Cloudflare Access. Every request is checked here too, never
// open (the second lock): no ACCESS_AUD /
// ACCESS_TEAM / ADMIN_EMAILS -> 503 admin_not_configured; the Cf-Access-Jwt-Assertion header must be an RS256 JWT
// signed by a key of https://<team>.cloudflareaccess.com/cdn-cgi/access/certs (cached per isolate) with that issuer,
// the application's AUD, a valid time and an allowed e-mail -> else 403 forbidden. The certs are made in the test (no
// network); synthetic rows only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminFeedbackApi, adminDecideApi } from "../../functions/_lib/api.js";
import { storeFeedback, feedbackKey, listFeedback } from "../../functions/_lib/feedback.js";
import { makeEnv, makeCtx, readJson, syntheticBundle, FakeD1, withConsoleSpy, accessTeam, rsaKey, publicJwk, b64url,
  ACCESS_AUD as AUD, ADMIN_EMAIL as EMAIL } from "./helpers.mjs";

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const T = NOW / 1000;
const IPH = "I".repeat(22);
const ROWS = [
  { en: "hepatocellular carcinoma", vi_used: "ung thư biểu mô tế bào gan", vi_user: "carcinom tế bào gan", pack: "alpha",
    kind: "new" },
  { en: "tumour", vi_used: "khối u", vi_user: "u", pack: "alpha", kind: "fixed" },
  { en: "core needle", vi_used: "kim lõi", vi_user: "kim sinh thiết lõi", pack: "alpha-kid", kind: "new" },
];

const enc = new TextEncoder();
const b64u = b64url;

function adminEnv(world, over = {}) {
  return makeEnv({ FEEDBACK: new FakeD1(), ACCESS_AUD: AUD, ACCESS_TEAM: world.team,
    ADMIN_EMAILS: "Reviewer@Example.org, second@example.org", ...over });
}

function depsOf(world, now = NOW) {
  return { bundle: syntheticBundle(), fetch: world.fetch, now: () => now };
}

async function call(api, deps, { token = null, ...opts }) {
  const headers = { ...(opts.headers || {}) };
  if (token !== null) headers["Cf-Access-Jwt-Assertion"] = token;
  const res = await api(makeCtx({ ...opts, headers }), deps);
  return { res, status: res.status, body: await readJson(res) };
}

const LIST = "/admin/api/feedback";
const DECIDE = "/admin/api/decide";

async function list(world, env, token, status = "all", deps = depsOf(world)) {
  return call(adminFeedbackApi, deps, { method: "GET", path: LIST + "?status=" + status, env, token });
}

// ------------------------------------------------------------------ never open

test("admin: without ACCESS_AUD, ACCESS_TEAM or ADMIN_EMAILS the admin API is closed (503 admin_not_configured)", async () => {
  const world = await accessTeam();
  const token = await world.token();
  for (const over of [{ ACCESS_AUD: undefined }, { ACCESS_TEAM: undefined }, { ADMIN_EMAILS: undefined },
    { ACCESS_AUD: " " }, { ADMIN_EMAILS: " , " }, { ACCESS_TEAM: "not a team!" }, { ACCESS_TEAM: "https://evil.example" }]) {
    const env = adminEnv(world, over);
    const r = await list(world, env, token);
    assert.deepEqual([r.status, r.body.code], [503, "admin_not_configured"], JSON.stringify(over));
    const d = await call(adminDecideApi, depsOf(world), { path: DECIDE, env, token,
      body: { key: "0".repeat(64), decision: "approved" } });
    assert.deepEqual([d.status, d.body.code], [503, "admin_not_configured"], JSON.stringify(over));
  }
  assert.deepEqual(world.fetches, [], "the certs are not even fetched");
});

test("admin: the team may be given as a name, a host or an https origin", async () => {
  const world = await accessTeam();
  const token = await world.token();
  for (const team of [world.team, world.team + ".cloudflareaccess.com", world.origin, world.origin + "/"]) {
    const r = await list(world, adminEnv(world, { ACCESS_TEAM: team }), token);
    assert.equal(r.status, 200, team + " " + JSON.stringify(r.body));
  }
});

test("admin: a missing, malformed, forged, foreign, expired or not-yet-valid JWT is 403 forbidden", async () => {
  const world = await accessTeam();
  const env = adminEnv(world);
  const other = await rsaKey();
  const parts = (await world.token()).split(".");
  const tampered = [parts[0], b64u(enc.encode(JSON.stringify({ aud: [AUD], email: EMAIL, exp: T + 3600,
    iss: world.origin }))), parts[2]].join(".");
  const cases = {
    "no header": null,
    "empty": "",
    "not a JWT": "abc",
    "garbage parts": "a.b.c",
    "four parts": parts.join(".") + ".x",
    "tampered claims": tampered,
    "another key": await world.token({}, { privateKey: other.privateKey }),
    "HS256 header": await world.token({}, { alg: "HS256" }),
    "none header": await world.token({}, { alg: "none" }),
    "unknown kid": await world.token({}, { kid: "k9" }),
    "another application": await world.token({ aud: ["0".repeat(64)] }),
    "no aud": await world.token({ aud: undefined }),
    "another team": await world.token({ iss: "https://other.cloudflareaccess.com" }),
    "expired": await world.token({ exp: T - 60 }),
    "no exp": await world.token({ exp: undefined }),
    "not yet valid": await world.token({ nbf: T + 600 }),
    "another e-mail": await world.token({ email: "someone@example.org" }),
    "no e-mail": await world.token({ email: undefined }),
    "too long": "x".repeat(20000),
  };
  const reasons = new Map();
  for (const [name, token] of Object.entries(cases)) {
    const r = await list(world, env, token);
    assert.deepEqual([r.status, r.body.code], [403, "forbidden"], name);
    reasons.set(name, r.body.message);
    const d = await call(adminDecideApi, depsOf(world), { path: DECIDE, env, token,
      body: { key: "0".repeat(64), decision: "approved" } });
    assert.deepEqual([d.status, d.body.code], [403, "forbidden"], name);
  }
  // a short reason in each answer, so a login with another e-mail is noticed at once (never the token's content)
  assert.match(reasons.get("another e-mail"), /ADMIN_EMAILS/);
  assert.match(reasons.get("no e-mail"), /ADMIN_EMAILS/);
  assert.match(reasons.get("no header"), /no Cloudflare Access token/i);
  assert.match(reasons.get("expired"), /expired/);
  assert.match(reasons.get("another application"), /another Access application/);
  assert.match(reasons.get("another key"), /not valid/);
  for (const m of reasons.values()) assert.ok(!m.includes(EMAIL) && !m.includes("someone@"), m);
  const later = await list(world, env, await world.token(), "all", depsOf(world, NOW + (3600 + 31) * 1000));
  assert.deepEqual([later.status, later.body.code], [403, "forbidden"], "expired by the clock (30 s of leeway)");
  const edge = await list(world, env, await world.token(), "all", depsOf(world, NOW + (3600 + 29) * 1000));
  assert.equal(edge.status, 200, "within the leeway");
});

// ------------------------------------------------------------------ the review

test("admin: an allowed e-mail (any case) lists the rows by status, most frequent first, and decides", async () => {
  const world = await accessTeam();
  const env = adminEnv(world);
  await storeFeedback(env.FEEDBACK, ROWS, { day: "2026-10-14", iph: IPH, limit: 500 });
  await storeFeedback(env.FEEDBACK, [ROWS[2]], { day: "2026-10-14", iph: "J".repeat(22), limit: 500 });
  const token = await world.token({ email: "REVIEWER@example.org" });
  const all = await list(world, env, token, "all");
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.deepEqual(Object.keys(all.body), ["rows"]);
  assert.deepEqual(all.body.rows.map((r) => [r.en, r.count, r.status]), [["core needle", 2, "new"],
    ["hepatocellular carcinoma", 1, "new"], ["tumour", 1, "new"]]);
  assert.equal(all.res.headers.get("cache-control"), "no-store");
  const dflt = await call(adminFeedbackApi, depsOf(world), { method: "GET", path: LIST, env, token });
  assert.deepEqual(dflt.body, all.body, "no status: all rows");
  const key = await feedbackKey(ROWS[2]);
  const ok = await call(adminDecideApi, depsOf(world), { path: DECIDE, env, token, body: { key, decision: "approved" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body, { ok: true, key, status: "approved" });
  const bin = await call(adminDecideApi, depsOf(world), { path: DECIDE, env, token,
    body: { key: await feedbackKey(ROWS[1]), decision: "rejected" } });
  assert.equal(bin.status, 200);
  assert.deepEqual((await list(world, env, token, "approved")).body.rows.map((r) => r.en), ["core needle"]);
  assert.deepEqual((await list(world, env, token, "rejected")).body.rows.map((r) => r.en), ["tumour"]);
  assert.deepEqual((await list(world, env, token, "new")).body.rows.map((r) => r.en), ["hepatocellular carcinoma"]);
  const second = await list(world, env, await world.token({ email: "second@example.org" }), "approved");
  assert.equal(second.status, 200, "every e-mail of ADMIN_EMAILS");
  assert.equal(world.fetches.length, 1, "the certs are fetched once per isolate");
});

test("admin: requests are validated (status, key, decision, fields, methods); an unknown key is 404 not_found", async () => {
  const world = await accessTeam();
  const env = adminEnv(world);
  await storeFeedback(env.FEEDBACK, ROWS, { day: "2026-10-14", iph: IPH, limit: 500 });
  const token = await world.token();
  const bad = await list(world, env, token, "pending");
  assert.deepEqual([bad.status, bad.body.code], [400, "bad_request"]);
  const key = await feedbackKey(ROWS[0]);
  const cases = [
    [{ key, decision: "maybe" }, 400, "bad_request"],
    [{ key, decision: "new" }, 400, "bad_request"],
    [{ key: "XYZ", decision: "approved" }, 400, "bad_request"],
    [{ key: key.toUpperCase(), decision: "approved" }, 400, "bad_request"],
    [{ key, decision: "approved", note: "x" }, 400, "bad_request"],
    [{ decision: "approved" }, 400, "bad_request"],
    [{ key: "0".repeat(64), decision: "approved" }, 404, "not_found"],
  ];
  for (const [body, status, code] of cases) {
    const r = await call(adminDecideApi, depsOf(world), { path: DECIDE, env, token, body });
    assert.deepEqual([r.status, r.body.code], [status, code], JSON.stringify(body));
  }
  assert.deepEqual((await listFeedback(env.FEEDBACK, "new")).length, 3, "nothing decided");
  assert.equal((await call(adminDecideApi, depsOf(world), { method: "GET", path: DECIDE, env, token })).status, 405);
  assert.equal((await call(adminFeedbackApi, depsOf(world), { path: LIST, env, token, body: {} })).status, 405);
  const foreign = await call(adminDecideApi, depsOf(world), { path: DECIDE, env, token, origin: "https://evil.example",
    body: { key, decision: "approved" } });
  assert.deepEqual([foreign.status, foreign.body.code], [403, "bad_origin"]);
  const noDb = await list(world, { ...env, FEEDBACK: undefined }, token);
  assert.deepEqual([noDb.status, noDb.body.code], [500, "server_misconfigured"]);
});

test("admin: a new signing key is fetched when an unknown kid comes (at most once a minute); certs down -> 503", async () => {
  const world = await accessTeam();
  const env = adminEnv(world);
  assert.equal((await list(world, env, await world.token())).status, 200);
  const rotated = await rsaKey();
  world.certs.keys = [await publicJwk(rotated, "k2"), ...world.certs.keys];
  const k2 = await world.token({}, { privateKey: rotated.privateKey, kid: "k2" });
  assert.equal((await list(world, env, k2)).status, 403, "within a minute of the last fetch: not fetched again");
  assert.equal(world.fetches.length, 1);
  const r = await list(world, env, k2, "all", depsOf(world, NOW + 61 * 1000));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(world.fetches.length, 2);
  const down = await accessTeam({ certsDown: true });
  const [d, lines] = await withConsoleSpy(async () => list(down, adminEnv(down), await down.token()));
  assert.deepEqual([d.status, d.body.code], [503, "access_unavailable"]);
  for (const l of lines) assert.ok(!l.includes(EMAIL) && !l.includes(down.team), l);
});
