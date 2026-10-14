// The model of the translation core on Workers AI: createModel(env.AI, {...}) returns the core's model function
//   model(messages, {temperature, maxTokens, think, signal}) -> {text, truncated}
// - thinking is always off unless asked: chat_template_kwargs.enable_thinking = false (the Workers AI schema default
//   for Gemma 4 is true; with it on, Gemma spends the token budget on reasoning and answers empty);
// - x-session-affinity = the job id (env.AI.run's extraHeaders), so a job's calls reach the instance holding its
//   prompt prefix (prefix caching);
// - reasoning never reaches the answer: reasoning fields are ignored, <think> blocks and thought channels are cut;
// - finish_reason "length" -> {text: "", truncated: true} (the core treats it as an empty answer, as the helper does);
// - usage: tokens and neurons summed into `usage` (cached input tokens at their own rate);
// - transient failures (capacity, timeout, network, a malformed answer) are retried with backoff; account or input
//   errors are not; errors carry the Workers AI code only, never the request or the answer.

export class ModelCallError extends Error {
  constructor(kind, aiCode = null) {
    super("Workers AI call failed (" + (aiCode || kind) + ")");
    this.name = "ModelCallError";
    this.kind = kind; // transient | budget | fatal
    this.aiCode = aiCode;
  }
}

const TRANSIENT = new Set(["3040", "3007", "3043", "3044", "3046"]); // capacity, timeout, internal errors
const BUDGET = new Set(["3036"]); // the account's daily free allocation is used up

export function newUsage() {
  return { calls: 0, prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0, neurons: 0 };
}

function aiCodeOf(err) {
  const m = /\b([35]\d{3})\b/.exec(String((err && err.message) || ""));
  return m ? m[1] : null;
}

function classify(err) {
  const code = aiCodeOf(err);
  if (code && BUDGET.has(code)) return new ModelCallError("budget", code);
  if (code && TRANSIENT.has(code)) return new ModelCallError("transient", code);
  if (code) return new ModelCallError("fatal", code);
  return new ModelCallError("transient", null);
}

function abortError() {
  return new DOMException("The translation was stopped.", "AbortError");
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
  return "";
}

/** The answer text without any reasoning: after the last </think> or thought channel, unterminated thinking cut. */
export function stripReasoning(text) {
  let t = text;
  let cut = false;
  const think = t.lastIndexOf("</think>");
  if (think >= 0) {
    t = t.slice(think + "</think>".length);
    cut = true;
  }
  if (t.includes("<think>")) {
    t = t.slice(0, t.indexOf("<think>"));
    cut = true;
  }
  const end = t.lastIndexOf("<channel|>");
  if (end >= 0 && t.lastIndexOf("<|channel>", end) >= 0) {
    t = t.slice(end + "<channel|>".length);
    cut = true;
  }
  return cut ? t.trim() : t;
}

/** {text, truncated, usage} of a Workers AI answer (OpenAI-compatible choices, or the older {response}). */
function parseAnswer(res) {
  if (res && Array.isArray(res.choices) && res.choices.length) {
    const c = res.choices[0] || {};
    if (c.finish_reason === "length") return { text: "", truncated: true, usage: res.usage };
    return { text: stripReasoning(textOf(c.message && c.message.content)), truncated: false, usage: res.usage };
  }
  if (res && typeof res.response === "string") return { text: stripReasoning(res.response), truncated: false,
    usage: res.usage };
  return null;
}

const count = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
const estimate = (chars) => Math.max(1, Math.ceil(chars / 3));

function addUsage(usage, rates, u, messages, text) {
  let prompt = u ? count(u.prompt_tokens) : 0;
  let completion = u ? count(u.completion_tokens) : 0;
  if (!u || !Number.isFinite(u.prompt_tokens)) { // no usage reported: count from the lengths, never as free
    prompt = estimate(messages.reduce((n, m) => n + textOf(m.content).length, 0));
    completion = estimate(text.length);
  }
  const cached = Math.min(prompt, u && u.prompt_tokens_details ? count(u.prompt_tokens_details.cached_tokens) : 0);
  usage.calls += 1;
  usage.prompt_tokens += prompt;
  usage.cached_tokens += cached;
  usage.completion_tokens += completion;
  // Workers AI reports the call's neurons in usage (measured: the price-list formula exactly); take them when given
  usage.neurons += u && Number.isFinite(u.neurons) && u.neurons >= 0 ? u.neurons
    : ((prompt - cached) * rates.input + cached * rates.cached + completion * rates.output) / 1e6;
}

export function createModel(ai, { model, rates, affinity = null, usage = newUsage(), retries = 2,
  backoffMs = [500, 1500], sleep = defaultSleep } = {}) {
  const options = affinity ? { extraHeaders: { "x-session-affinity": affinity } } : undefined;
  return async function run(messages, { temperature = 0, maxTokens = undefined, think = false, signal = null } = {}) {
    const inputs = { messages, temperature };
    if (Number.isFinite(maxTokens)) inputs.max_completion_tokens = maxTokens;
    inputs.chat_template_kwargs = { enable_thinking: Boolean(think) };
    for (let attempt = 0; ; attempt++) {
      if (signal && signal.aborted) throw abortError();
      let failure;
      try {
        const answer = parseAnswer(await ai.run(model, inputs, options));
        if (answer) {
          addUsage(usage, rates, answer.usage, messages, answer.text);
          return { text: answer.text, truncated: answer.truncated };
        }
        failure = new ModelCallError("transient", null); // a malformed answer
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        failure = classify(err);
      }
      if (failure.kind !== "transient" || attempt >= retries) throw failure;
      await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)], signal);
    }
  };
}
