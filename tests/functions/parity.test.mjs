// Exact parity of the cloud API with the HELPER (Python): tests/functions/fixtures/helper_parity.json is exported by
// tests/functions/export_helper_parity.py from helper/vitranslate (pipeline pack choice, glossary hits, build_system,
// Translator with a scripted model) for synthetic documents -- plain-text paragraphs as the page's text mode sends
// them (no tags, essential [], prev / nxt = neighbouring paragraphs, where "Doan <n>") and a slide with tags.
// The same answers are replayed through /api/v1/session -> /classify (whole text) -> /translate (batches): every
// model call must carry the helper's system prompt and user prompt byte for byte, and every result must equal the
// helper's text, level, flags and fixes (the term fixes and the title-order fix written, {en, from, to}).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sessionApi, classifyApi, translateApi } from "../../functions/_lib/api.js";
import { makeEnv, makeCtx, readJson, fakeAI, chatAnswer, sourceOf, fakeSiteverify, TEST_PASS } from "./helpers.mjs";

const FIX = JSON.parse(readFileSync(new URL("./fixtures/helper_parity.json", import.meta.url), "utf8"));
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);

async function call(api, deps, opts) {
  const res = await api(makeCtx(opts), deps);
  return { status: res.status, body: await readJson(res) };
}

/** A Workers AI binding that replays the helper's scripted answers: per segment source, its replies in call order,
 * then its default answer. */
function replayAI(doc) {
  const bySource = new Map(doc.segments.map((s) => [s.tagged, { replies: s.replies, def: s.default, n: 0 }]));
  return fakeAI((inputs) => {
    const st = bySource.get(sourceOf(inputs));
    assert.ok(st, "a call for a source the helper never saw");
    const reply = st.n < st.replies.length ? st.replies[st.n] : st.def;
    st.n += 1;
    return chatAnswer(reply, { prompt: 1200, completion: 30 });
  });
}

for (const doc of FIX.documents) {
  test("helper parity (" + doc.name + "): classify, system prompt per batch, prompts and decisions", async () => {
    const env = makeEnv({ AI: replayAI(doc), ALLOW_TEST_TURNSTILE: "1" });
    const deps = { bundle: FIX.bundle, fetch: fakeSiteverify(TEST_PASS).fetch, now: () => NOW, sleep: async () => {} };
    const s = await call(sessionApi, deps, { path: "/api/v1/session", body: { turnstile: "t" }, env });
    const session = s.body.session;
    const c = await call(classifyApi, deps, { path: "/api/v1/classify", body: { session, text: doc.full_text }, env });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const { setup, setup_id: setupId, ...event } = c.body;
    assert.deepEqual({ ...event, packs: event.packs.map(({ version, ...p }) => p) }, doc.classify);
    assert.deepEqual(setup.hits, doc.hits.map((h) => h[0]));
    const segs = doc.segments.map((x) => ({ id: x.id, tagged: x.tagged, essential: x.essential, prev: x.prev,
      nxt: x.nxt, where: x.where }));
    const batches = segs.length > 4 ? [segs.slice(0, 4), segs.slice(4)] : [segs];
    const results = [];
    for (const batch of batches) {
      const r = await call(translateApi, deps, { path: "/api/v1/translate", env, body: { session, job_id: "parity",
        setup, setup_id: setupId, segments: batch } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      results.push(...r.body.results);
    }
    const calls = env.AI.calls;
    for (const k of calls) assert.equal(k.inputs.messages[0].content, doc.system, "the helper's system prompt");
    // the segments of a batch go at once (functions/_lib/engine.js): each segment's own calls in the helper's order
    const users = calls.map((k) => k.inputs.messages[1].content);
    assert.equal(users.length, doc.segments.reduce((n, x) => n + x.calls.length, 0), "as many calls as the helper");
    for (const x of doc.segments) {
      assert.deepEqual(calls.filter((k) => sourceOf(k.inputs) === x.tagged).map((k) => k.inputs.messages[1].content),
        x.calls.map((y) => y.user), "the helper's user prompts, in order: " + x.where);
    }
    for (const x of doc.segments) {
      const r = results.find((y) => y.id === x.id);
      assert.deepEqual({ text: r.text, level: r.level, flags: r.flags, fixes: r.fixes, reduced: r.reduced }, x.result,
        x.where);
    }
  });
}

test("the fixture covers the fixes the page lists: a real pack term fix, the title order, a house form", () => {
  const slide = FIX.documents.find((d) => d.name === "slide with tags");
  const fixes = FIX.documents.flatMap((d) => d.segments.flatMap((s) => s.result.fixes));
  assert.ok(fixes.some((f) => f.en === "title-order"), JSON.stringify(fixes));
  assert.ok(fixes.some((f) => f.en !== "title-order"), JSON.stringify(fixes));
  const house = slide.segments.find((s) => s.tagged.startsWith("Many lymphocytes"));
  assert.ok(house.result.text.includes("lymph\u00f4 b\u00e0o"), house.result.text);
  assert.ok(!house.result.flags.some((f) => f.startsWith("suspicious:")), JSON.stringify(house.result.flags));
});

test("the fixture covers the plain-text gates the page's text mode will meet", () => {
  const plain = FIX.documents.find((d) => d.name === "plain text");
  assert.ok(plain.segments.every((s) => !/<\/?[gx]\d/.test(s.tagged) && s.essential.length === 0));
  const flags = plain.segments.flatMap((s) => s.result.flags);
  for (const f of ["retried:english", "retried:empty", "retried:gate", "kept_code"]) assert.ok(flags.includes(f), f);
  assert.deepEqual(plain.segments.map((s) => s.result.level), [0, 2, 2, 2, 0, 2, 1]);
});
