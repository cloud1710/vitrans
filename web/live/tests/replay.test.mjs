// The replay harness (replay.mjs) as a test: a synthetic pathology lecture (fixtures/lecture_synthetic.txt, ~750
// words, 5 seeds) spoken at ~150 words / min through an iPhone Safari-like recognizer and a Windows Live Captions-like
// helper; the segmenter with the options live.js passes must keep the thresholds below (measured 2026-10-15:
// safari 2.7 / 5.3 s, 9 words per commit, bad cuts 3.8 %; the options before: 6.8 / 11.3 s, 19 words, 9.2 %).
// Run: node --test "web/live/tests/*.test.mjs"; the numbers: node tools/live_cut_replay.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { segmenterOptions } from "../segmenter.js";
import { runSource, packTerms, speechWords, safariSnapshots, replay, measure } from "./replay.mjs";

const TEXT = readFileSync(new URL("./fixtures/lecture_synthetic.txt", import.meta.url), "utf8");
const SEEDS = [1, 2, 3, 4, 5];
const BEFORE = { pauseMs: 1200, maxWords: 32 };
const terms = await packTerms(fileURLToPath(new URL("../../../packs/", import.meta.url)));

test("speech timing: about 150 words per minute, the words in order", () => {
  const words = speechWords(TEXT, 1);
  const minutes = words[words.length - 1].end / 60000;
  assert.ok(Math.abs(words.length / minutes - 150) < 10, (words.length / minutes).toFixed(1) + " words / min");
  for (let i = 1; i < words.length; i++) assert.ok(words[i].start >= words[i - 1].end);
});

test("safari-like: no punctuation in the interim text, rewrites, restarts with an empty snapshot", () => {
  const snaps = safariSnapshots(speechWords(TEXT, 1), 1);
  const interim = snaps.filter(([, s], i) => s && snaps[i + 1] && snaps[i + 1][1] !== "");
  assert.ok(interim.every(([, s]) => !/[.,?!;:]/.test(s)));
  assert.ok(snaps.filter(([, s]) => s === "").length >= 4, "restarts");
  for (let i = 1; i < snaps.length; i++) assert.ok(snaps[i][0] >= snaps[i - 1][0], "time goes on");
});

test("safari-like with the microphone options: fast, not shredded, no more bad cuts, nothing repeated", () => {
  const now = runSource(TEXT, "safari", segmenterOptions("mic"), SEEDS, terms).summary;
  const before = runSource(TEXT, "safari", BEFORE, SEEDS, terms).summary;
  const msg = JSON.stringify({ now, before });
  assert.ok(now.latMedian < 3, msg);
  assert.ok(now.latP90 < 5.6, msg);
  assert.ok(now.wpcMedian >= 6, msg);
  assert.ok(now.badShare <= before.badShare && now.badShare <= 0.05, msg);
  assert.ok(now.extra <= 0.005 * now.words, "a duplicate commit shows as extra words: " + msg);
  assert.ok(now.missed <= 0.005 * now.words, msg);
});

test("lc-like with the helper options: sentences as before, a pause after a function word no longer cuts", () => {
  const now = runSource(TEXT, "lc", segmenterOptions("helper"), SEEDS, terms).summary;
  const before = runSource(TEXT, "lc", BEFORE, SEEDS, terms).summary;
  const msg = JSON.stringify({ now, before });
  assert.equal(now.extra, 0, msg);
  assert.equal(now.missed, 0, msg);
  assert.ok(now.badShare <= 0.03 && now.badShare < before.badShare, msg);
  assert.ok(now.latMedian <= before.latMedian + 0.5, msg);
  assert.ok(now.wpcMedian >= 10, msg);
});

test("measure: a duplicate commit counts as extra words, a function word at the end as a bad cut", () => {
  const words = speechWords("The margins are clear.\nThe tumour is small.", 1);
  const run = { revisions: 0, sentences: [
    { raw: "The margins are", t: 2000, reason: "pause" }, { raw: "clear.", t: 2500, reason: "punct" },
    { raw: "The tumour is small.", t: 4000, reason: "punct" }, { raw: "The tumour is small.", t: 4100, reason: "flush" }] };
  const m = measure(words, run, [["tumour", "is"]]);
  assert.equal(m.extra, 4);
  assert.equal(m.missed, 0);
  assert.equal(m.badEnd, 1);
  assert.deepEqual(m.sizes, [3, 1, 4, 4]);
  const r = replay([[0, "the margins are clear."], [100, "the margins are clear."]], {});
  assert.deepEqual(r.sentences.map((s) => s.raw), ["the margins are clear."]);
});
