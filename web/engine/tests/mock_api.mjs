// A scripted stand-in for the cloud API (/api/v1/*, spec Amendment F) for the page-level Chrome runners: installed
// with Playwright's context.route, it answers like the Pages Functions and records every call and every violation
// of the client contract (JSON bodies with the contract's fields only: text, never file bytes or images; one
// classify setup per job, sent unchanged with every batch). Translations are the source with "VI " in front (tags
// kept), so the plumbing is tested, not the quality. Test infrastructure only (web/engine/tests/ is never deployed).
export const MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";  // what Turnstile's always-pass test key hands out
const SEGMENT_FIELDS = new Set(["id", "tagged", "where", "prev", "nxt", "essential"]);
const BODY_FIELDS = { session: ["turnstile"], classify: ["session", "text", "domain", "profile"],
  translate: ["session", "job_id", "setup_id", "setup", "segments"],
  terms: ["session", "job_id", "setup_id", "setup", "items"], feedback: ["session", "items"] };
export const SETUP = { packs: [{ id: "pathology", version: "0.1.8" }], hits: ["tumour"] };

// The "terms" scenarios (spec Amendment G): Vietnamese for the synthetic sources (tags kept; anything else "VI " +
// source), the core's term fixes on some segments, and the terms /terms finds in the items: as the server's /terms,
// an item counts when its src has the English as whole words (a plural too) and its vi has the Vietnamese.
export const TERMS_VI = {
  "The tumour shows spindle cells.": "Khối u có tế bào hình thoi.",
  "Spindle cells are arranged in fascicles.": "Tế bào hình thoi xếp thành bó.",
  "Fusiform cells are also present.": "Cũng có tế bào hình thoi.",
  "No necrosis is seen.": "Không thấy hoại tử.",
  "Meningioma grading": "Phân độ u màng não",
  "In <g1>NF2-altered</g1> meningiomas<g2>1</g2><x1/>criteria":
    "Trong <g1>u màng não biến đổi NF2</g1><g2>1</g2><x1/>tiêu chí",
  "Negative staining": "Nhuộm âm tính",
  "Department of Pathology": "Khoa Giải phẫu bệnh",
  "Grade depends on mitoses": "Độ mô học phụ thuộc vào số nhân chia",
  "Survival by grade": "Sống còn theo độ mô học",
  "Grade 3 tumours recur early": "U độ mô học 3 tái phát sớm",
};
export const TERMS_FIXES = {
  "The tumour shows spindle cells.": [{ en: "tumour", from: "bướu", to: "khối u" }],
  "Grade 3 tumours recur early": [{ en: "tumour", from: "bướu", to: "u" }],
};
// "spindle cell" (singular): the server counts "spindle cells" too, the page's own whole-word rule does not -- the
// page must use the answer's ids
export const NEW_TERMS = [["spindle cell", "tế bào hình thoi"], ["fascicles", "bó"], ["meningioma", "u màng não"],
  ["grade", "độ mô học"]];
// The "pdf" scenario (spec Amendment H): Vietnamese with no English word left, about as long as the source (so the
// page test can tell the English is gone from the PDF); a segment about tumours carries the core's term fix.
const PDF_WORDS = "tế bào hình thoi xếp thành bó dài với nhân không điển hình nhẹ và hiếm nhân chia".split(" ");
export function pdfVi(s) {
  const n = Math.max(2, Math.round(s.tagged.split(/\s+/).length * 1.2));
  const words = Array.from({ length: n }, (_, k) => PDF_WORDS[k % PDF_WORDS.length]).join(" ");
  if (/tumour/i.test(s.tagged)) {
    return { text: "Bản dịch " + (s.id + 1) + ": khối u " + words, fixes: [{ en: "tumour", from: "bướu", to: "khối u" }],
      flags: ["term_fix:tumour"] };
  }
  return { text: "Bản dịch " + (s.id + 1) + ": " + words };
}
const TAG_RE = /<\/?g\d+>|<x\d+\/>/;
const TAGS_RE = /<\/?g\d+>|<x\d+\/>/g;
const wholeWord = (term) => new RegExp("(^|[^\\p{L}\\p{N}])" + term + "(s|es)?($|[^\\p{L}\\p{N}])", "iu");
const cpLen = (s) => Array.from(s).length;

// A helper's /api/health answer (Ollama not running): what the local mode ("Dịch trên máy") finds on 127.0.0.1.
export const HEALTH = { app: "ViTranslate", version: "0.1.0", device: { kind: "gpu", name: "Test GPU", free_mb: 9000,
  num_gpu: 999 }, ollama: false, models: [], model_default: "gemma4:e4b", model_fast: "gemma4:e2b", model_ready: false,
model_fast_ready: false, packs_installed: [], registry_offline: false, recommendation: null };

/** { st (calls, violations, translateCalls, jobSetup, statusAnswered, translateInFlight, translateMaxInFlight,
 * feedback: the item lists received), handler (for context.route) } for a scenario: "ok" | "retry" (the first two
 * translate calls answer 502 model_error) | "quota" | "budget" (429) | "terms" (TERMS_VI / TERMS_FIXES translations;
 * the first /terms call answers 401 session_expired, then the NEW_TERMS found in the items) | "terms-error" (the same
 * translations; /terms answers 502 model_error three times, then 429 quota_exceeded; /feedback 429).
 * o.statusDelayMs: GET /status answers that late (the page must not wait for it); o.translateDelayMs: every translate
 * answer that late (so that the batches the page sends together are seen in flight together).
 * /terms is checked against the job (its id, setup and setup_id from translate) and carries [{id, src, vi}] plain
 * text only (<= 200 items, <= 60,000 characters); /feedback carries [{en, vi_used, vi_user, pack, kind}] term pairs
 * only (<= 50; one line, <= 100 characters and 12 words each; never a sentence the page sent or got back). */
export function mockApi(scenario, o = {}) {
  const st = { calls: [], violations: [], sessions: new Set(), setups: new Set(), jobSetup: {}, translateCalls: 0,
    statusAnswered: false, translateInFlight: 0, translateMaxInFlight: 0, termsCalls: 0, feedback: [],
    sentences: new Set() };
  const terms = scenario === "terms" || scenario === "terms-error";
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
      if (raw && /PK\u0003\u0004|%PDF-|data:image|base64,/.test(raw)) bad(path + ": binary or image data sent");
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
        const results = segs.map((s) => {
          const r = { id: s.id, text: (terms && TERMS_VI[s.tagged]) || "VI " + s.tagged, level: 0, flags: [] };
          if (scenario === "pdf") Object.assign(r, pdfVi(s));
          if (terms && TERMS_FIXES[s.tagged]) {
            r.fixes = TERMS_FIXES[s.tagged];
            r.flags = r.fixes.map((f) => "term_fix:" + f.en);
          }
          st.sentences.add(s.tagged.replace(TAGS_RE, ""));
          st.sentences.add(r.text.replace(TAGS_RE, ""));
          return r;
        });
        return await answer(route, 200, { results, usage: { neurons: 3 * segs.length } }).catch(() => {});
      } finally {
        st.translateInFlight -= 1;
      }
    }
    if (path === "terms") {
      st.termsCalls += 1;
      if (!st.jobSetup[body.job_id]) bad("terms: job_id of no translated job");
      else if (body.setup_id !== st.jobSetup[body.job_id]) bad("terms: not the job's setup_id");
      if (JSON.stringify(body.setup) !== JSON.stringify(SETUP)) bad("terms: setup is not {packs, hits} of classify");
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length || items.length > 200) bad("terms: " + items.length + " items");
      let chars = 0;
      for (const it of items) {
        if (!it || Object.keys(it).join() !== "id,src,vi") bad("terms: item fields " + Object.keys(it || {}).join());
        else if (typeof it.src !== "string" || typeof it.vi !== "string") bad("terms: item without text");
        else {
          if (TAG_RE.test(it.src) || TAG_RE.test(it.vi)) bad("terms: tags in an item (plain text expected)");
          chars += cpLen(it.src) + cpLen(it.vi);
        }
      }
      if (chars > 60000) bad("terms: " + chars + " characters");
      if (scenario === "terms" && st.termsCalls === 1) return answer(route, 401, { code: "session_expired" });
      if (scenario === "terms-error") {
        return answer(route, st.termsCalls <= 3 ? 502 : 429, { code: st.termsCalls <= 3 ? "model_error" : "quota_exceeded" });
      }
      const found = [];
      for (const [en, vi] of NEW_TERMS) {
        const ids = items.filter((it) => wholeWord(en).test(it.src) && it.vi.normalize("NFC").toLowerCase().includes(vi))
          .map((it) => it.id);
        if (ids.length) found.push({ en, vi, count: ids.length, ids });
      }
      return answer(route, 200, { terms: found });
    }
    if (path === "feedback") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length || items.length > 50) bad("feedback: " + items.length + " items");
      for (const it of items) {
        if (!it || Object.keys(it).join() !== "en,vi_used,vi_user,pack,kind") {
          bad("feedback: item fields " + Object.keys(it || {}).join());
          continue;
        }
        if (!["new", "fixed"].includes(it.kind)) bad("feedback: kind " + it.kind);
        if (typeof it.pack !== "string" || !/^[a-z0-9_-]+$/.test(it.pack)) bad("feedback: pack " + it.pack);
        for (const k of ["en", "vi_used", "vi_user"]) {
          const v = it[k];
          if (typeof v !== "string" || !v.trim() || /[\r\n]/.test(v) || cpLen(v) > 100 || v.trim().split(/\s+/).length > 12) {
            bad("feedback: " + k + " is not a term");
          } else if ([...st.sentences].some((s) => cpLen(s) > 30 && v.includes(s))) {
            bad("feedback: " + k + " holds a sentence of the document");
          }
        }
      }
      st.feedback.push(items);
      if (scenario === "terms-error") return answer(route, 429, { code: "quota_exceeded" });
      return answer(route, 200, { ok: true });
    }
    return answer(route, 404, { code: "not_found" });
  };
  return { st, handler };
}
