// The Workers AI model adapter: model(messages, {temperature, maxTokens, think: false, signal}) -> {text, truncated}
// over env.AI.run, with thinking off (chat_template_kwargs.enable_thinking = false), the job id as x-session-affinity,
// token usage converted to neurons, retries on transient errors and errors that never quote the request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createModel, newUsage, ModelCallError } from "../../functions/_lib/model.js";
import { fakeAI, chatAnswer, MODEL } from "./helpers.mjs";

const RATES = { input: 9091, cached: 1000, output: 27273 };
const MSGS = [{ role: "system", content: "S" }, { role: "user", content: "Translate:\nTumour biopsy." }];
const noSleep = async () => {};

test("the request: messages, greedy, max tokens, thinking off, the job id as x-session-affinity", async () => {
  const ai = fakeAI(() => chatAnswer("Sinh thiết u."));
  const model = createModel(ai, { model: MODEL, rates: RATES, affinity: "job-42" });
  const out = await model(MSGS, { temperature: 0, maxTokens: 123, think: false });
  assert.deepEqual(out, { text: "Sinh thiết u.", truncated: false });
  const call = ai.calls[0];
  assert.equal(call.model, MODEL);
  assert.deepEqual(call.inputs, { messages: MSGS, temperature: 0, max_completion_tokens: 123,
    chat_template_kwargs: { enable_thinking: false } });
  assert.deepEqual(call.options, { extraHeaders: { "x-session-affinity": "job-42" } });
  const plain = createModel(fakeAI(() => chatAnswer("x")), { model: MODEL, rates: RATES });
  const ai2 = fakeAI(() => chatAnswer("x"));
  await createModel(ai2, { model: MODEL, rates: RATES })(MSGS, {});
  assert.equal(ai2.calls[0].options, undefined, "no affinity: no options");
  assert.equal(ai2.calls[0].inputs.temperature, 0, "temperature defaults to 0");
  assert.equal("max_completion_tokens" in ai2.calls[0].inputs, false);
  assert.ok(plain);
});

test("reasoning is never part of the answer: reasoning fields ignored, <think> blocks and thought channels cut", async () => {
  const answers = [
    chatAnswer("Sinh thiết u.", { reasoning: "The user wants SECRETREASONING" }),
    chatAnswer("<think>SECRETREASONING</think>\nSinh thiết u."),
    chatAnswer("<|channel>thought\nSECRETREASONING<channel|>Sinh thiết u."),
    chatAnswer(null, { reasoning: "SECRETREASONING only" }),
  ];
  const model = createModel(fakeAI((i, o, n) => answers[n - 1]), { model: MODEL, rates: RATES });
  assert.equal((await model(MSGS, {})).text, "Sinh thiết u.");
  assert.equal((await model(MSGS, {})).text, "Sinh thiết u.");
  assert.equal((await model(MSGS, {})).text, "Sinh thiết u.");
  assert.deepEqual(await model(MSGS, {}), { text: "", truncated: false }, "reasoning-only answer = empty answer");
});

test("an answer cut at max tokens is truncated (the core treats it as empty); content parts and {response} work", async () => {
  const answers = [
    chatAnswer("Sinh thiết", { finish: "length" }),
    { choices: [{ index: 0, message: { role: "assistant", content: [{ type: "text", text: "Sinh " },
      { type: "text", text: "thiết." }] }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } },
    { response: "Sinh thiết u.", usage: { prompt_tokens: 5, completion_tokens: 3 } },
  ];
  const model = createModel(fakeAI((i, o, n) => answers[n - 1]), { model: MODEL, rates: RATES });
  assert.deepEqual(await model(MSGS, {}), { text: "", truncated: true });
  assert.equal((await model(MSGS, {})).text, "Sinh thiết.");
  assert.equal((await model(MSGS, {})).text, "Sinh thiết u.");
});

test("usage: tokens summed over calls, cached tokens at their own rate, neurons = tokens x rate / 1e6", async () => {
  const usage = newUsage();
  const answers = [chatAnswer("a", { prompt: 1000, completion: 50, cached: 0 }),
    chatAnswer("b", { prompt: 1200, completion: 30, cached: 1024 })];
  const model = createModel(fakeAI((i, o, n) => answers[n - 1]), { model: MODEL, rates: RATES, usage });
  await model(MSGS, {});
  await model(MSGS, {});
  assert.equal(usage.calls, 2);
  assert.equal(usage.prompt_tokens, 2200);
  assert.equal(usage.cached_tokens, 1024);
  assert.equal(usage.completion_tokens, 80);
  const expected = ((2200 - 1024) * 9091 + 1024 * 1000 + 80 * 27273) / 1e6;
  assert.ok(Math.abs(usage.neurons - expected) < 1e-9, usage.neurons + " vs " + expected);
});

test("the neurons Workers AI reports in usage are taken as they are (they would carry any cached-token discount)", async () => {
  const usage = newUsage();
  const answer = chatAnswer("a", { prompt: 38, completion: 8, cached: 0 });
  answer.usage.neurons = 0.5636363625526428; // as measured on the account: (38 x 9091 + 8 x 27273) / 1e6
  const discounted = chatAnswer("b", { prompt: 1000, completion: 10, cached: 900 });
  discounted.usage.neurons = 2.5;
  const answers = [answer, discounted];
  const model = createModel(fakeAI((i, o, n) => answers[n - 1]), { model: MODEL, rates: RATES, usage });
  await model(MSGS, {});
  await model(MSGS, {});
  assert.ok(Math.abs(usage.neurons - (0.5636363625526428 + 2.5)) < 1e-12, String(usage.neurons));
  assert.deepEqual([usage.prompt_tokens, usage.cached_tokens, usage.completion_tokens], [1038, 900, 18]);
});

test("an answer without usage is counted from its length (never free)", async () => {
  const usage = newUsage();
  const model = createModel(fakeAI(() => ({ response: "Sinh thiết u." })), { model: MODEL, rates: RATES, usage });
  await model(MSGS, {});
  assert.ok(usage.prompt_tokens > 0 && usage.completion_tokens > 0 && usage.neurons > 0, JSON.stringify(usage));
});

test("transient errors (capacity, timeout, network) are retried with backoff", async () => {
  const slept = [];
  let n = 0;
  const ai = fakeAI(() => {
    n += 1;
    if (n === 1) throw new Error("AiError: 3040: Capacity temporarily exceeded, please try again.");
    if (n === 2) throw new Error("Network connection lost.");
    return chatAnswer("ok");
  });
  const model = createModel(ai, { model: MODEL, rates: RATES, sleep: async (ms) => { slept.push(ms); } });
  assert.equal((await model(MSGS, {})).text, "ok");
  assert.equal(ai.calls.length, 3);
  assert.deepEqual(slept, [500, 1500]);
  const always = createModel(fakeAI(() => { throw new Error("3007: Request timeout"); }),
    { model: MODEL, rates: RATES, sleep: noSleep });
  await assert.rejects(always(MSGS, {}), (e) => e instanceof ModelCallError && e.kind === "transient" &&
    e.aiCode === "3007");
});

test("account and input errors are not retried; 3036 (daily allocation used up) is a budget error", async () => {
  for (const [msg, kind, code] of [["5035: This model requires a Workers Paid plan.", "fatal", "5035"],
    ["AiError: 3036: You have used up your daily free allocation of 10,000 neurons.", "budget", "3036"],
    ["5007: No such model", "fatal", "5007"], ["3006: Request is too large", "fatal", "3006"]]) {
    const ai = fakeAI(() => { throw new Error(msg + " SECRETINPUT"); });
    const model = createModel(ai, { model: MODEL, rates: RATES, sleep: noSleep });
    await assert.rejects(model(MSGS, {}), (e) => e instanceof ModelCallError && e.kind === kind && e.aiCode === code &&
      !e.message.includes("SECRET"));
    assert.equal(ai.calls.length, 1, msg);
  }
});

test("a malformed answer is a transient bad_response; abort stops before a call and during the backoff", async () => {
  const bad = createModel(fakeAI(() => ({ nothing: true })), { model: MODEL, rates: RATES, sleep: noSleep });
  await assert.rejects(bad(MSGS, {}), (e) => e instanceof ModelCallError && e.kind === "transient");
  const ctrl = new AbortController();
  ctrl.abort();
  const ai = fakeAI(() => chatAnswer("x"));
  await assert.rejects(createModel(ai, { model: MODEL, rates: RATES })(MSGS, { signal: ctrl.signal }),
    (e) => e.name === "AbortError");
  assert.equal(ai.calls.length, 0);
  const c2 = new AbortController();
  const flaky = fakeAI(() => { throw new Error("3040: Capacity temporarily exceeded"); });
  const sleep = async () => { c2.abort(); };
  await assert.rejects(createModel(flaky, { model: MODEL, rates: RATES, sleep })(MSGS, { signal: c2.signal }),
    (e) => e.name === "AbortError");
  assert.equal(flaky.calls.length, 1);
});
