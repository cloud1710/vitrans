// The review page's client (web/admin/admin.js) against the admin handlers themselves: the requests the page sends,
// the rows it gets, its decisions, and the short Vietnamese messages it shows for each refusal (not configured, no
// right with the server's reason, Access login expired, network down). The fetch bridge adds the Access JWT as
// Cloudflare Access would. Synthetic rows only; no network, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminFeedbackApi, adminDecideApi } from "../../functions/_lib/api.js";
import { storeFeedback, feedbackKey } from "../../functions/_lib/feedback.js";
import { loadRows, decide, errorText, API, STATUS_LABEL, KIND_LABEL } from "../../web/admin/admin.js";
import { makeEnv, syntheticBundle, FakeD1, accessTeam, ACCESS_AUD, ORIGIN } from "./helpers.mjs";

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const ROWS = [
  { en: "hepatocellular carcinoma", vi_used: "ung thư biểu mô tế bào gan", vi_user: "carcinom tế bào gan", pack: "alpha",
    kind: "new" },
  { en: "tumour", vi_used: "khối u", vi_user: "u", pack: "alpha", kind: "fixed" },
];

/** fetch for the page: each path to its handler, as Pages routes it; Access's JWT added (token null: none). */
function bridge(env, world, token) {
  const routes = { [API.list]: adminFeedbackApi, [API.decide]: adminDecideApi };
  const deps = { bundle: syntheticBundle(), fetch: world.fetch, now: () => NOW };
  const sent = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url), ORIGIN + "/admin/");
    const headers = new Headers(init.headers || {});
    if (token) headers.set("Cf-Access-Jwt-Assertion", token);
    if ((init.method || "GET") !== "GET") headers.set("Origin", ORIGIN);
    sent.push({ path: u.pathname + u.search, method: init.method || "GET", redirect: init.redirect });
    const request = new Request(u.href, { method: init.method || "GET", headers, body: init.body });
    return routes[u.pathname]({ request, env, params: {}, data: {}, waitUntil: () => {} }, deps);
  };
  return { fetch, sent };
}

async function world() {
  const team = await accessTeam({ nowMs: NOW });
  const env = makeEnv({ FEEDBACK: new FakeD1(), ACCESS_AUD, ACCESS_TEAM: team.team, ADMIN_EMAILS: "reviewer@example.org" });
  await storeFeedback(env.FEEDBACK, ROWS, { day: "2026-10-14", iph: "I".repeat(22), limit: 500 });
  return { team, env };
}

test("the page lists the rows of a status and sends the author's decision; labels are Vietnamese", async () => {
  const { team, env } = await world();
  const b = bridge(env, team, await team.token());
  const rows = await loadRows(b.fetch, "new");
  assert.deepEqual(rows.map((r) => [r.en, r.vi_user, r.status]), [["hepatocellular carcinoma", "carcinom tế bào gan", "new"],
    ["tumour", "u", "new"]]);
  const key = await feedbackKey(ROWS[0]);
  assert.deepEqual(await decide(b.fetch, key, "approved"), { ok: true, key, status: "approved" });
  assert.deepEqual((await loadRows(b.fetch, "approved")).map((r) => r.en), ["hepatocellular carcinoma"]);
  assert.deepEqual(b.sent.map((s) => [s.method, s.path]), [["GET", "/admin/api/feedback?status=new"],
    ["POST", "/admin/api/decide"], ["GET", "/admin/api/feedback?status=approved"]]);
  assert.ok(b.sent.every((s) => s.redirect === "manual"), "an Access login redirect is not followed");
  assert.deepEqual(STATUS_LABEL, { new: "Mới", approved: "Đã duyệt", rejected: "Đã bỏ" });
  assert.deepEqual(KIND_LABEL, { new: "Từ mới", fixed: "Đã sửa" });
});

test("refusals become short Vietnamese messages; the server's reason is kept", async () => {
  const { team, env } = await world();
  const noToken = bridge(env, team, null);
  await assert.rejects(loadRows(noToken.fetch, "new"), (e) => /Không có quyền/.test(e.message) &&
    /no Cloudflare Access token/.test(e.message));
  const other = bridge(env, team, await team.token({ email: "someone@example.org" }));
  await assert.rejects(decide(other.fetch, "0".repeat(64), "approved"), (e) => /ADMIN_EMAILS/.test(e.message));
  const closed = bridge({ ...env, ACCESS_AUD: "" }, team, await team.token());
  await assert.rejects(loadRows(closed.fetch, "new"), (e) => /chưa được cấu hình/.test(e.message));
  const ok = bridge(env, team, await team.token());
  await assert.rejects(decide(ok.fetch, "0".repeat(64), "approved"), (e) => /Không tìm thấy/.test(e.message));
  const expired = async () => ({ type: "opaqueredirect", status: 0, ok: false, json: async () => { throw new Error("x"); } });
  await assert.rejects(loadRows(expired, "new"), (e) => /hết hạn/.test(e.message) && /tải lại trang/.test(e.message));
  const down = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(loadRows(down, "new"), (e) => /Không kết nối/.test(e.message));
  assert.match(errorText(500, { code: "server_error" }), /500/);
  assert.match(errorText(503, { code: "access_unavailable" }), /Cloudflare Access/);
});
