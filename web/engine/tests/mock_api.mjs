// A scripted stand-in for the cloud API (/api/v1/*, spec Amendment F) for the page-level Chrome runners: installed
// with Playwright's context.route, it answers like the Pages Functions and records every call and every violation
// of the client contract (JSON bodies with the contract's fields only: text, never file bytes or images; one
// classify setup per job, sent unchanged with every batch). Translations are the source with "VI " in front (tags
// kept), so the plumbing is tested, not the quality. Test infrastructure only (web/engine/tests/ is never deployed).
export const MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";  // what Turnstile's always-pass test key hands out
const SEGMENT_FIELDS = new Set(["id", "tagged", "where", "prev", "nxt", "essential"]);
const BODY_FIELDS = { session: ["turnstile"], classify: ["session", "text", "domain"],
  translate: ["session", "job_id", "setup_id", "setup", "segments"] };
export const SETUP = { packs: [{ id: "pathology", version: "0.1.8" }], hits: ["tumour"] };

// A helper's /api/health answer (Ollama not running): what the local mode ("Dịch trên máy") finds on 127.0.0.1.
export const HEALTH = { app: "ViTranslate", version: "0.1.0", device: { kind: "gpu", name: "Test GPU", free_mb: 9000,
  num_gpu: 999 }, ollama: false, models: [], model_default: "gemma4:e4b", model_fast: "gemma4:e2b", model_ready: false,
model_fast_ready: false, packs_installed: [], registry_offline: false, recommendation: null };

/** { st (calls, violations, translateCalls, jobSetup, statusAnswered, translateInFlight, translateMaxInFlight),
 * handler (for context.route) } for a scenario: "ok" | "retry" (the first two translate calls answer 502
 * model_error) | "quota" | "budget" (429). o.statusDelayMs: GET /status answers that late (the page must not wait for
 * it); o.translateDelayMs: every translate answer that late (so that the batches the page sends together are seen in
 * flight together). */
export function mockApi(scenario, o = {}) {
  const st = { calls: [], violations: [], sessions: new Set(), setups: new Set(), jobSetup: {}, translateCalls: 0,
    statusAnswered: false, translateInFlight: 0, translateMaxInFlight: 0 };
  const bad = (what) => st.violations.push(what);
  const answer = (route, status, body) => route.fulfill({ status, contentType: "application/json",
    body: JSON.stringify(body) });
  const handler = async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api\/v1\//, "");
    const raw = req.postData();
    let body = null;
    if (req.method() === "POST") {
      if (!/application\/json/.test(req.headers()["content-type"] || "")) bad(path + ": not JSON content");
      try { body = JSON.parse(raw || ""); } catch (e) { bad(path + ": body is not JSON"); }
      if (body && typeof body === "object") {
        for (const k of Object.keys(body)) if (!(BODY_FIELDS[path] || []).includes(k)) bad(path + ": unexpected field " + k);
      }
      if (raw && /PK\u0003\u0004|data:image|base64,/.test(raw)) bad(path + ": binary or image data sent");
    }
    st.calls.push({ path, method: req.method(), body });
    if (path === "status") {
      if (o.statusDelayMs) await new Promise((r) => setTimeout(r, o.statusDelayMs));
      st.statusAnswered = true;
      return answer(route, 200, { ok: true, model: MODEL, budget_left_today: 0.9 }).catch(() => {});  // page gone
    }
    if (path === "session") {
      if (!body || body.turnstile !== DUMMY_TOKEN) return answer(route, 403, { code: "bad_turnstile" });
      const token = "mock-session-" + (st.sessions.size + 1);
      st.sessions.add(token);
      return answer(route, 200, { session: token, expires_s: 3600, quota: { segments_left_today: 1000 } });
    }
    if (!body || !st.sessions.has(body.session)) return answer(route, 401, { code: "session_expired" });
    if (path === "classify") {
      if (typeof body.text !== "string" || !body.text) bad("classify: no document text");
      const setupId = "setup-" + (st.setups.size + 1);
      st.setups.add(setupId);
      return answer(route, 200, { classify: { offline: false, unavailable: [], candidates: [{ id: "pathology-breast",
        name: "GPB vú", score: 0.02 }], packs: [{ id: "pathology", name: "Giải phẫu bệnh", score: 0.31,
        matched: ["tumour"], reason: "match", version: "0.1.8" }] }, setup: SETUP, setup_id: setupId });
    }
    if (path === "translate") {
      st.translateCalls += 1;
      const segs = body.segments;
      if (typeof body.job_id !== "string" || !body.job_id) bad("translate: no job_id");
      if (!st.setups.has(body.setup_id)) bad("translate: unknown setup_id " + body.setup_id);
      if (st.jobSetup[body.job_id] && st.jobSetup[body.job_id] !== body.setup_id) bad("translate: setup changed in a job");
      st.jobSetup[body.job_id] = body.setup_id;
      // functions/_lib/engine.js checkSetup: exactly {packs, hits}, as /classify returned it
      if (JSON.stringify(body.setup) !== JSON.stringify(SETUP)) bad("translate: setup is not {packs, hits} of classify");
      if (!Array.isArray(segs) || !segs.length || segs.length > 20) bad("translate: batch of " + (segs && segs.length));
      for (const s of segs || []) {
        for (const k of Object.keys(s)) if (!SEGMENT_FIELDS.has(k)) bad("translate: segment field " + k);
        if (typeof s.tagged !== "string") bad("translate: segment without text");
      }
      const call = st.translateCalls;
      st.translateInFlight += 1;
      st.translateMaxInFlight = Math.max(st.translateMaxInFlight, st.translateInFlight);
      try {
        if (o.translateDelayMs) await new Promise((r) => setTimeout(r, o.translateDelayMs));
        // .catch: the page may have aborted the request meanwhile (cancel, or a 429 of another batch)
        if (scenario === "quota") return await answer(route, 429, { code: "quota_exceeded" }).catch(() => {});
        if (scenario === "budget") return await answer(route, 429, { code: "budget_exhausted" }).catch(() => {});
        if (scenario === "retry" && call <= 2) return await answer(route, 502, { code: "model_error" }).catch(() => {});
        return await answer(route, 200, { results: segs.map((s) => ({ id: s.id, text: "VI " + s.tagged, level: 0,
          flags: [] })), usage: { neurons: 3 * segs.length } }).catch(() => {});
      } finally {
        st.translateInFlight -= 1;
      }
    }
    return answer(route, 404, { code: "not_found" });
  };
  return { st, handler };
}
