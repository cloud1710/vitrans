// translateFile behaviour that has no helper counterpart to compare with (the parity of events, report and output is
// tests/engine_checks.mjs e2eChecks): stopping, the one retry of a failed model call, error codes, the translation
// memory across runs, yielding to the page, truncated answers.
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translateFile, RETRY_DELAY } from "../pipeline.js";
import { defaultSleep } from "../core.js";
import { Translator } from "../translate.js";
import { MemoryTM } from "../tm.js";
import { decodeText } from "../packs.js";
import { encode } from "../ooxml/codec.js";
import { parseXml } from "../ooxml/xml.js";

const fixture = (name) => new Uint8Array(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
const e2e = JSON.parse(readFileSync(new URL("./fixtures/engine/e2e.json", import.meta.url), "utf8"));
const REPO = new URL("../../../packs/", import.meta.url);
const SYNTH = new URL("./fixtures/engine/packs/", import.meta.url);

const packs = {
  manifest: async () => e2e.manifests.three,
  readText: async (id, version, file) => {
    const where = e2e.where[id];
    if (!where) throw new Error("no pack " + id);
    try {
      return decodeText(readFileSync(new URL(id + "/" + file, where === "repo" ? REPO : SYNTH)));
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },
};

/** A fake model: every English word of the text after "Translate:" becomes "m\u00f4" (tags kept). */
function vietnamese(messages) {
  const user = messages[1].content;
  const text = user.includes("Translate:\n") ? user.split("Translate:\n")[1] : user.split("\n").pop();
  return text.replace(/(<\/?g\d+>|<x\d+\/>)|[A-Za-z]+/g, (m, tag) => tag || "m\u00f4");
}

function run(options = {}) {
  const calls = [];
  const model = options.model || (async (messages, opts) => {
    calls.push(messages[1].content);
    assert.equal(opts.think, false);
    return vietnamese(messages);
  });
  const promise = translateFile(options.bytes || fixture("deck3.pptx"), options.name || "deck3.pptx", {
    model, modelId: "test-model", device: { kind: "gpu", name: "Test GPU" }, packs, tm: options.tm || null,
    onProgress: options.onProgress || (() => {}), signal: options.signal || null, sleep: options.sleep || (async () => {}),
    yieldFn: options.yieldFn || (async () => {}), ...(options.engine || {}) });
  return { promise, calls };
}

test("the retry wait removes its abort listener after a normal wake-up and stops on abort", async () => {
  const added = [];
  const removed = [];
  const signal = { aborted: false, addEventListener: (type, fn) => added.push(fn),
    removeEventListener: (type, fn) => removed.push(fn) };
  await defaultSleep(0, signal);
  assert.equal(added.length, 1);
  assert.deepEqual(removed, added);
  const controller = new AbortController();
  const waiting = defaultSleep(60, controller.signal);
  controller.abort();
  await assert.rejects(waiting, (err) => err.code === "aborted");
  await assert.rejects(defaultSleep(60, controller.signal), (err) => err.code === "aborted");
});

/** A translateSegments stand-in that answers every segment with its own text (level 0, no flags). */
const echoResults = (segments) => segments.map((s) => ({ id: s.id, text: s.tagged, level: 0, flags: [], cached: false,
  reduced: false, spans: [] }));

test("translateFile refuses results that do not answer the batch's segments", async () => {
  const wrongIds = async (segments) => echoResults(segments).map((r) => ({ ...r, id: r.id + 100 }));
  await assert.rejects(run({ engine: { translateSegments: wrongIds } }).promise, /answered segment 100 for 0/);
  const short = async (segments) => echoResults(segments).slice(1);
  await assert.rejects(run({ engine: { translateSegments: short, batchSize: 3 } }).promise, /returned 2 results for 3 segments/);
  const none = async () => null;
  await assert.rejects(run({ engine: { translateSegments: none } }).promise, /returned object results/);
  const ok = await run({ engine: { translateSegments: async (segments) => echoResults(segments), batchSize: 20 } }).promise;
  assert.equal(ok.report.counts.segments, 4);
});

test("a finished job returns the output name, bytes and the helper-shaped report", async () => {
  const { promise, calls } = run();
  const res = await promise;
  assert.equal(res.name, "deck3_vi.pptx");
  assert.ok(res.bytes instanceof Uint8Array && res.bytes.length > 1000);
  assert.equal(res.report.counts.segments, 4);
  assert.equal(calls.length, 4);
  assert.deepEqual(res.report.polish, { enabled: false });
  assert.ok(["thorough", "careful", "moderate"].includes(res.report.review.level));
});

test("abort stops the job between segments with code aborted", async () => {
  const controller = new AbortController();
  const { promise, calls } = run({ signal: controller.signal, onProgress: (e) => {
    if (e.stage === "translate" && e.done === 1) controller.abort();
  } });
  await assert.rejects(promise, (err) => err.name === "AbortError" && err.code === "aborted");
  assert.equal(calls.length, 1);
});

test("a failed model call is retried once after RETRY_DELAY", async () => {
  let n = 0;
  const slept = [];
  const { promise } = run({ sleep: async (s) => slept.push(s), model: async (messages) => {
    n += 1;
    if (n === 2) throw new Error("GPU device lost");
    return vietnamese(messages);
  } });
  const res = await promise;
  assert.deepEqual(slept, [RETRY_DELAY]);
  assert.equal(res.report.counts.segments, 4);
});

test("a model that fails twice ends the job with code model_failed", async () => {
  const { promise } = run({ model: async () => {
    throw new Error("out of memory");
  } });
  await assert.rejects(promise, (err) => err.code === "model_failed" && /failed twice while translating Slide 1/.test(err.message) &&
    /out of memory/.test(err.message));
});

test("a file that is not the package its extension says is unsupported_file", async () => {
  await assert.rejects(run({ name: "deck3.docx" }).promise, (err) => err.code === "unsupported_file" &&
    /extension \.docx does not match its content \(a PPTX package\)/.test(err.message));
  await assert.rejects(run({ name: "deck3" }).promise, (err) => err.code === "unsupported_file" && /\(none\)/.test(err.message));
  await assert.rejects(run({ bytes: new TextEncoder().encode("not a zip"), name: "x.pptx" }).promise,
    (err) => err.code === "unsupported_file");
});

test("a second run with the same translation memory makes no model call", async () => {
  const tm = new MemoryTM();
  const first = run({ tm });
  await first.promise;
  const second = run({ tm });
  const res = await second.promise;
  assert.equal(second.calls.length, 0);
  assert.equal(res.report.counts.cached, 4);
});

test("the job yields to the page between parts and between segments", async () => {
  let yields = 0;
  await run({ yieldFn: async () => {
    yields += 1;
  } }).promise;
  assert.ok(yields >= 4 + 3, String(yields)); // 4 segments, 3 slide / notes parts at least
});

test("an answer cut off at maxTokens counts as an empty answer", async () => {
  const seg = encode(parseXml("<a:p xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><a:r><a:t>" +
    "The tumor of the lung is small</a:t></a:r></a:p>").documentElement);
  const answers = [{ text: "Kh\u1ed1i u", truncated: true }, "Kh\u1ed1i u \u1edf ph\u1ed5i nh\u1ecf"];
  const users = [];
  const t = new Translator({ model: async (messages) => {
    users.push(messages[1].content);
    return answers.shift();
  }, system: "SYS", modelKey: "m", packKey: "p@1" });
  const out = await t.translate(seg);
  assert.equal(out.level, 2);
  assert.deepEqual(out.flags, ["retried:empty"]);
  assert.ok(users[1].includes("You gave an empty answer"));
});
