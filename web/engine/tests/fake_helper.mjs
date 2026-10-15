// A fake ViTranslate helper on 127.0.0.1:47831 for the page runners' "Trên máy" scenarios (page.mjs local-tools,
// web/live/tests/page_live.mjs local): installed with Playwright's context.route, it answers /api/health (Ollama and
// the model ready), /api/hardware (a measured GPU), /api/setup, and the sentence routes /api/v1/classify and
// /api/v1/translate with the cloud's JSON minus the session (helper/vitranslate/sentence_api.py): translations are
// "VI " + the source (tags kept). Every call is recorded with its body's fields; a body that carries a session or a
// field the helper refuses is a violation. CORS as the helper's (the page's origin allowed, Private Network Access
// preflights answered). Test infrastructure only (web/engine/tests/ is never deployed).
export const HELPER_HEALTH = { app: "ViTranslate", version: "0.1.0", device: { kind: "gpu", name: "Test GPU", free_mb: 9000,
  num_gpu: 999 }, ollama: true, models: ["gemma4:e4b", "gemma4:e2b"], model_default: "gemma4:e4b", model_fast: "gemma4:e2b",
model_ready: true, model_fast_ready: true, packs_installed: [], registry_offline: false, recommendation: null,
setup: { state: "off" } };
export const HELPER_HARDWARE = { ready: true,
  profile: { os: { system: "Windows", release: "11", build: "10.0.26300", machine: "AMD64" },
    cpu: { model: "Test CPU", cores: 8, threads: 16 }, ram: { total_mb: 32768, free_mb: 20000 },
    gpus: [{ vendor: "NVIDIA", name: "Test GPU", vram_total_mb: 12000, vram_free_mb: 9000, vram_used_mb: 3000, util_pct: 0,
      backend: "CUDA" }],
    gpu_now: { present: true, name: "Test GPU", total_mb: 12000, free_mb: 9000, foreign_mb: 0, util_pct: 0, usable: true,
      busy: false },
    ollama: { reachable: true, version: "0.40.4", models: ["gemma4:e4b", "gemma4:e2b"], model_gpu: true, model_cpu: false,
      model_fast: true, vram_mb: 0 }, disk: { free_mb: 100000 } },
  calibration: { state: "done", device: "gpu", results: { gpu: { overhead_s: 0.08, word_s: 0.012, start_s: 6,
    model: "gemma4:e4b" } } },
  recommendation: { engine: "helper-gpu", device: "gpu", model: "gemma4:e4b", polish_default: true, fast_default: false,
    needs_download: false, reasons: [{ code: "gpu_ok", name: "Test GPU", free_mb: 9000 }],
    estimates: { seconds_per_a4_page: 10.9, seconds_per_slide: 1.4, polish: true, basis: "measured" } },
  pull: { model: null, state: "idle", error: null } };
const FIELDS = { classify: ["text", "domain", "profile"], translate: ["job_id", "setup", "setup_id", "segments", "profile"] };
const TAG_IDS = /<g(\d+)>/g;

/** -> { st: { calls: [{path, keys, profile, segments, texts}], violations }, handler (for context.route) }.
 * o.sentence: what the translations hold besides the source ("VI "). */
export function fakeHelper(o = {}) {
  const st = { calls: [], violations: [] };
  const handler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const origin = req.headers().origin || "*";
    const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, DELETE",
      "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Private-Network": "true", Vary: "Origin" };
    const reply = (status, obj) => route.fulfill({ status, contentType: "application/json", headers: cors,
      body: JSON.stringify(obj) });
    if (url.port !== "47831") return route.abort();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const path = url.pathname;
    if (path === "/api/health") return reply(200, HELPER_HEALTH);
    if (path === "/api/hardware") return reply(200, HELPER_HARDWARE);
    if (path === "/api/setup") return reply(200, { state: "off" });
    const m = /^\/api\/v1\/(classify|translate)$/.exec(path);
    if (!m || req.method() !== "POST") return reply(404, { detail: "Not Found" });
    let body = null;
    try { body = JSON.parse(req.postData() || ""); } catch (e) { body = null; }
    if (!body || typeof body !== "object") { st.violations.push(path + ": not JSON"); return reply(400, { code: "bad_request" }); }
    const keys = Object.keys(body).sort();
    const extra = keys.filter((k) => !FIELDS[m[1]].includes(k));
    if (extra.length) st.violations.push(path + ": fields " + extra.join(","));
    const call = { path: m[1], keys, profile: body.profile || "", segments: Array.isArray(body.segments) ? body.segments.length : 0,
      texts: m[1] === "classify" ? [body.text] : (body.segments || []).map((s) => s.tagged) };
    st.calls.push(call);
    if (m[1] === "classify") {
      return reply(200, { stage: "classify", offline: false, unavailable: [], candidates: [],
        packs: [{ id: "pathology", name: "Giải phẫu bệnh", version: "0.2.0", score: 0.4, matched: ["tumour"], reason: "cosine" }],
        setup: { packs: [{ id: "pathology", version: "0.2.0" }], hits: [] }, setup_id: "f".repeat(64) });
    }
    return reply(200, { results: body.segments.map((s) => ({ id: s.id, text: (o.sentence || "VI ") + s.tagged, level: 0,
      flags: [], fixes: [], cached: false, reduced: false,
      spans: [...new Set([...String(s.tagged).matchAll(TAG_IDS)].map((x) => Number(x[1])))] })) });
  };
  return { st, handler };
}
