// The live page's segmenter (web/live/segmenter.js): growing / revised caption text -> committed sentences.
// Synthetic caption streams only: Windows Live Captions style (a window of the last lines, old lines scroll out),
// Chrome / speech-recognizer style (final + interim text, the interim rewritten), no punctuation, long runs,
// fillers, resets. Run: node --test "web/live/tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSegmenter, cleanFillers, isBoundary, normWord } from "../segmenter.js";

const commits = (evs) => evs.filter((e) => e.type === "commit");

function run(snaps, opts = {}) {
  const seg = createSegmenter(opts);
  const out = [];
  for (const [t, text] of snaps) {
    out.push(...seg.tick(t));
    out.push(...seg.push(text, t));
  }
  return { seg, out };
}

test("a sentence with an end mark commits once it reads the same twice, or once words follow it", () => {
  const seg = createSegmenter();
  assert.deepEqual(commits(seg.push("Hello", 0)), []);
  assert.deepEqual(commits(seg.push("Hello every", 100)), []);
  assert.deepEqual(commits(seg.push("Hello everyone.", 200)), []);
  const c = commits(seg.push("Hello everyone.", 350));
  assert.equal(c.length, 1);
  assert.equal(c[0].en, "Hello everyone.");
  assert.equal(c[0].raw, "Hello everyone.");
  assert.equal(c[0].reason, "punct");
  assert.deepEqual(commits(seg.push("Hello everyone. Today", 500)), [], "never committed twice");
  const two = commits(seg.push("Hello everyone. Today we start. Then we go on", 600));
  assert.deepEqual(two.map((e) => e.en), ["Today we start."]);
  const drafts = seg.push("Hello everyone. Today we start. Then we go on and", 700).filter((e) => e.type === "draft");
  assert.deepEqual(drafts.map((d) => d.text), ["Then we go on and"]);
});

test("several finished sentences in one snapshot commit together, in order, with increasing ids", () => {
  const seg = createSegmenter();
  const c = commits(seg.push("First one. Second one? Third one! And the fourth", 0));
  assert.deepEqual(c.map((e) => e.en), ["First one.", "Second one?", "Third one!"]);
  assert.deepEqual(c.map((e) => e.id), [1, 2, 3]);
});

test("abbreviations, decimals and initials are not sentence ends", () => {
  assert.equal(isBoundary("Dr.", "Smith"), false);
  assert.equal(isBoundary("e.g.", "the"), false);
  assert.equal(isBoundary("J.", "Smith"), false);
  assert.equal(isBoundary("3.5", "mm"), false);
  assert.equal(isBoundary("mm.", "Next"), true);
  assert.equal(isBoundary("etc.", "The"), true);
  assert.equal(isBoundary("etc.", undefined), false);
  assert.equal(isBoundary("No.", "5"), false);
  assert.equal(isBoundary("No.", "We"), true);
  assert.equal(isBoundary("works?\"", "Yes"), true);
  const seg = createSegmenter();
  const c = commits(seg.push("Dr. J. Smith measured 3.5 mm. Then", 0));
  assert.deepEqual(c.map((e) => e.en), ["Dr. J. Smith measured 3.5 mm."]);
});

test("no punctuation: the tail commits after a pause of pauseMs without change", () => {
  const { seg, out } = run([[0, "so this is"], [300, "so this is the lesion"], [600, "so this is the lesion we saw"]],
    { pauseMs: 1200 });
  assert.deepEqual(commits(out), []);
  assert.deepEqual(commits(seg.tick(1700)), [], "1.1 s: not yet");
  const c = commits(seg.tick(1800));
  assert.equal(c.length, 1);
  assert.equal(c[0].en, "So this is the lesion we saw", "a sentence start gets its capital");
  assert.equal(c[0].reason, "pause");
  assert.deepEqual(commits(seg.push("so this is the lesion we saw", 2000)), [], "the same words are not committed again");
  const more = commits(seg.push("so this is the lesion we saw and here it is again.", 2200));
  assert.deepEqual(more, []);
  assert.deepEqual(commits(seg.push("so this is the lesion we saw and here it is again.", 2400)).map((e) => e.en),
    ["And here it is again."]);
});

test("a long run without an end mark is cut at a soft boundary (>= 8 words) once it is stable", () => {
  const a = Array.from({ length: 20 }, (_, i) => "alpha" + i).join(" ") + ",";
  const b = Array.from({ length: 20 }, (_, i) => "beta" + i).join(" ");
  const seg = createSegmenter({ maxWords: 32 });
  assert.deepEqual(commits(seg.push(a + " " + b, 0)), []);
  const c = commits(seg.push(a + " " + b, 200));
  assert.equal(c.length, 1);
  assert.equal(c[0].raw, a);
  assert.equal(c[0].reason, "long");
  const noSoft = Array.from({ length: 40 }, (_, i) => "w" + i).join(" ");
  const s2 = createSegmenter({ maxWords: 32 });
  s2.push(noSoft, 0);
  const c2 = commits(s2.push(noSoft, 200));
  assert.equal(c2[0].raw.split(" ").length, 32, "no soft boundary: cut at maxWords");
  const conj = Array.from({ length: 12 }, (_, i) => "x" + i).join(" ") + " because " +
    Array.from({ length: 25 }, (_, i) => "y" + i).join(" ");
  const s3 = createSegmenter({ maxWords: 32 });
  s3.push(conj, 0);
  assert.equal(commits(s3.push(conj, 200))[0].raw.split(" ").length, 12, "cut before because");
});

test("rewrites of the last words before a commit: only the final wording is committed", () => {
  const { out } = run([[0, "We saw a large mask"], [200, "We saw a large mass"], [400, "We saw a large mass."],
    [600, "We saw a large mass."]]);
  assert.deepEqual(commits(out).map((e) => e.en), ["We saw a large mass."]);
});

test("a committed sentence rewritten within reviseMs is a revision (same id); later it is frozen", () => {
  const seg = createSegmenter({ reviseMs: 3000 });
  seg.push("Today we look at the colon.", 0);
  seg.push("Today we look at the colon.", 100);
  const c = commits(seg.push("Today we look at the colon. We saw a large mask. Then", 200));
  assert.deepEqual(c.map((e) => e.en), ["We saw a large mask."]);
  const id = c[0].id;
  const r = seg.push("Today we look at the colon. We saw a large mass. Then we", 600);
  const rev = r.filter((e) => e.type === "revise");
  assert.deepEqual(rev, [{ type: "revise", id, en: "We saw a large mass.", raw: "We saw a large mass." }]);
  assert.deepEqual(commits(r), [], "the revision is not a new sentence");
  assert.deepEqual(r.filter((e) => e.type === "draft").map((d) => d.text), ["Then we"]);
  const late = createSegmenter({ reviseMs: 3000 });
  late.push("Today we look at the colon.", 0);
  late.push("Today we look at the colon.", 100);
  late.push("Today we look at the colon. We saw a large mask. Then", 200);
  const r2 = late.push("Today we look at the colon. We saw a large mass. Then we", 5000);
  assert.deepEqual(r2.filter((e) => e.type === "revise" || e.type === "commit"), [], "frozen after 3 s");
  assert.deepEqual(r2.filter((e) => e.type === "draft").map((d) => d.text), ["Then we"]);
  const punct = createSegmenter();
  punct.push("Okay. We start now. Then", 0);
  const r3 = punct.push("Okay. We start now, Then we", 300);
  assert.deepEqual(r3.filter((e) => e.type === "revise" || e.type === "commit"), [], "punctuation only: no revision");
});

test("fillers that carry no meaning are dropped; a sentence of fillers only is not sent", () => {
  assert.equal(cleanFillers("Um, the the biopsy, uh, was taken."), "The biopsy was taken.");
  assert.equal(cleanFillers("So, uhm, we we we move on, er."), "So we move on.");
  assert.equal(cleanFillers("ER and PR are positive, er, in most cells."), "ER and PR are positive in most cells.");
  assert.equal(cleanFillers("Hmm."), "");
  assert.equal(cleanFillers("It is very very rare."), "It is very very rare.", "emphasis is meaning");
  assert.equal(cleanFillers("Ki-67 is 15 percent."), "Ki-67 is 15 percent.");
  const seg = createSegmenter();
  const c = commits(seg.push("Um. Uh, okay so the margin is clear. Next", 0));
  assert.deepEqual(c.map((e) => e.en), ["Okay so the margin is clear."], "the filler-only sentence is skipped");
});

test("normWord compares words without case and edge punctuation", () => {
  assert.equal(normWord("Mass."), "mass");
  assert.equal(normWord("\"Ki-67,\""), "ki-67");
  assert.equal(normWord("3.5"), "3.5");
});

test("a reset (the source cleared its text) starts afresh; an old sentence shown again is not committed again", () => {
  const seg = createSegmenter();
  seg.push("The first finding is a small nodule in the lung. And", 0);
  seg.push("", 2000);
  const c = commits(seg.push("A new part starts here. More", 2500));
  assert.deepEqual(c.map((e) => e.en), ["A new part starts here."]);
  const again = commits(seg.push("The first finding is a small nodule in the lung. Yes", 4000));
  assert.deepEqual(again.map((e) => e.en), ["More"], "a repeat of a recent long sentence after a reset is the old " +
    "text; the words pending before the reset are committed");
  const short = commits(seg.push("Next slide please. Thanks", 6000));
  assert.deepEqual(short.map((e) => e.en), ["Yes", "Next slide please."], "a reset first commits the words pending");
  const s2 = commits(seg.push("Next slide please. Again", 9000));
  assert.deepEqual(s2.map((e) => e.en), [], "anchor found: nothing new");
});

test("flush commits the words still pending (stop)", () => {
  const seg = createSegmenter();
  seg.push("and that is all for", 0);
  assert.deepEqual(commits(seg.flush(100)).map((e) => e.en), ["And that is all for"]);
  assert.deepEqual(seg.flush(200), []);
});

// ---------------------------------------------------------------- simulated sources

const SCRIPT = [
  "Good morning, today we review three cases.", "The first is a core biopsy of the breast.",
  "um the tumour cells form small glands in a fibrous stroma", "Mitoses are rare.", "Next slide please.",
  "Estrogen receptor is positive in ninety percent of the cells and HER2 is negative with a score of one plus which " +
    "places the tumour in the luminal group according to the usual surrogate definitions we use",
  "Any questions?", "The second case is a colon resection from Dr. Smith's list, about 3.5 cm.",
  "There is invasion into the submucosa.", "The margins are clear.", "Thank you.",
];
const SCRIPT_WORDS = SCRIPT.join(" ").split(/\s+/);

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Windows Live Captions: one word every 220 ms, a window of the last `keep` words (older ones scroll out), now and
// then the last word first shown wrong; a pause of 1.5 s after each script sentence.
function windowsStream(seed, keep = 45) {
  const rnd = seeded(seed);
  const snaps = [];
  let t = 0;
  const shown = [];
  for (const sentence of SCRIPT) {
    for (const w of sentence.split(/\s+/)) {
      if (rnd() < 0.2) {
        snaps.push([t, [...shown, w.slice(0, Math.max(1, w.length - 2)) + "x"].slice(-keep).join(" ")]);
        t += 120;
      }
      shown.push(w);
      snaps.push([t, shown.slice(-keep).join(" ")]);
      t += 220;
    }
    t += 1500;
    snaps.push([t, shown.slice(-keep).join(" ")]);
  }
  return snaps;
}

// Chrome / the speech recognizer: final text + an interim tail that is rewritten as a whole; the final part is cut
// to its last `keep` words; the box is cleared after a silence now and then.
function chromeStream(seed, keep = 60) {
  const rnd = seeded(seed);
  const snaps = [];
  let t = 0;
  let finals = [];
  for (const sentence of SCRIPT) {
    const words = sentence.split(/\s+/);
    for (let i = 1; i <= words.length; i++) {
      const interim = words.slice(0, i).map((w, k) => (k === i - 1 && rnd() < 0.3 ? w.toUpperCase() + "q" : w));
      snaps.push([t, [...finals, ...interim].slice(-keep).join(" ")]);
      t += 180;
    }
    finals = [...finals, ...words];
    snaps.push([t, finals.slice(-keep).join(" ")]);
    t += 1400;
    snaps.push([t, finals.slice(-keep).join(" ")]);
    if (rnd() < 0.3) {
      t += 600;
      snaps.push([t, ""]);
      finals = [];
    }
  }
  return snaps;
}

function replay(snaps, opts = {}) {
  const seg = createSegmenter(opts);
  const sentences = new Map();
  let revisions = 0;
  const lags = [];
  for (const [t, text] of snaps) {
    for (const t2 of [t - 100, t]) {
      for (const e of [...seg.tick(t2), ...(t2 === t ? seg.push(text, t) : [])]) {
        if (e.type === "commit") sentences.set(e.id, e.raw);
        if (e.type === "revise") { sentences.set(e.id, e.raw); revisions++; }
      }
    }
  }
  for (const e of seg.flush(snaps[snaps.length - 1][0] + 5000)) if (e.type === "commit") sentences.set(e.id, e.raw);
  return { words: [...sentences.values()].join(" ").split(/\s+/).filter(Boolean), revisions, count: sentences.size };
}

test("replay: Windows-style rolling window -- every script word is committed exactly once (5 seeds)", () => {
  for (let seed = 1; seed <= 5; seed++) {
    const r = replay(windowsStream(seed));
    assert.deepEqual(r.words, SCRIPT_WORDS, "seed " + seed);
    assert.ok(r.revisions <= 2, "seed " + seed + ": " + r.revisions + " revisions");
  }
});

test("replay: Chrome-style final + rewritten interim, with clears -- full coverage, no duplicates (5 seeds)", () => {
  for (let seed = 1; seed <= 5; seed++) {
    const r = replay(chromeStream(seed));
    assert.deepEqual(r.words, SCRIPT_WORDS, "seed " + seed);
  }
});

test("replay fixtures (JSONL {t, text}) give the expected sentences", () => {
  for (const name of ["windows_rolling", "chrome_flicker"]) {
    const lines = readFileSync(new URL("./fixtures/" + name + ".jsonl", import.meta.url), "utf8").trim().split("\n");
    const snaps = lines.map((l) => JSON.parse(l)).map((o) => [o.t, o.text]);
    const expected = JSON.parse(readFileSync(new URL("./fixtures/" + name + ".expected.json", import.meta.url), "utf8"));
    const seg = createSegmenter();
    const got = [];
    for (const [t, text] of snaps) {
      for (const e of [...seg.tick(t), ...seg.push(text, t)]) if (e.type === "commit") got.push(e.en);
    }
    for (const e of seg.flush(snaps[snaps.length - 1][0] + 5000)) if (e.type === "commit") got.push(e.en);
    assert.deepEqual(got, expected, name);
  }
});
