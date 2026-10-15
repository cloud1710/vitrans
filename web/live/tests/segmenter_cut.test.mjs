// The microphone's early cuts in the live segmenter (web/live/segmenter.js, his report 2026-10-15: the iPhone hears a
// long sentence and the translation comes late): stable-prefix commits at a clause boundary, the lower cap, the
// pause that waits longer after a function word, the options per source, and the alignment that keeps a commit
// rewritten by the recognizer a revision instead of a duplicate. Synthetic text only.
// Run: node --test "web/live/tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createSegmenter, segmenterOptions, goodCut, weakCut, normWord } from "../segmenter.js";
import { packTerms } from "./replay.mjs";

const commits = (evs) => evs.filter((e) => e.type === "commit");
const MIC = { pauseMs: 800, maxWords: 32, stableMs: 700, minWords: 6, capWords: 18 };

// the words of `text` one by one every `step` ms (an interim text that only grows), with ticks in between
function speak(seg, text, step = 400, t0 = 0, prefix = "") {
  const words = text.split(" ");
  const out = [];
  let t = t0;
  for (let i = 1; i <= words.length; i++) {
    out.push(...seg.tick(t - step / 2));
    out.push(...seg.push((prefix ? prefix + " " : "") + words.slice(0, i).join(" "), t).map((e) => ({ ...e, at: t })));
    t += step;
  }
  return { out, t };
}

test("options per source: the microphone cuts early, the helper keeps today's rules", () => {
  const mic = segmenterOptions("mic");
  assert.ok(mic.stableMs > 0 && mic.minWords >= 6 && mic.capWords <= 20 && mic.pauseMs < 1200, JSON.stringify(mic));
  const helper = segmenterOptions("helper");
  assert.equal(helper.stableMs, undefined, "no stable-prefix cuts: Live Captions punctuates");
  assert.equal(helper.pauseMs, undefined, "today's pause");
  assert.ok(helper.pauseWeakMs > 1200, "a pause after a function word waits longer");
  segmenterOptions("mic").stableMs = 1;
  assert.equal(segmenterOptions("mic").stableMs, mic.stableMs, "a copy each time");
});

test("leadMs: the words after the cut need not be stable as long as the committed ones", () => {
  const seg = createSegmenter({ ...MIC, leadMs: 0 });
  const { out } = speak(seg, "we looked at the slides of the case and we saw many glands in the stroma today");
  const c = commits(out);
  assert.equal(c[0].raw, "we looked at the slides of the case");
  // "case" at 2800 ms reads the same for 700 ms at 3500; "and we" are there at 3600: the push at 3600 commits
  assert.equal(c[0].at, 3600);
});

test("a stable prefix of >= minWords is committed at the last good boundary inside it", () => {
  const seg = createSegmenter(MIC);
  const { out } = speak(seg, "we looked at the slides of the case and we saw many glands in the stroma today");
  const c = commits(out);
  assert.equal(c[0].raw, "we looked at the slides of the case");
  assert.equal(c[0].en, "We looked at the slides of the case");
  assert.equal(c[0].reason, "stable");
  // "and" at 3200 ms, "we" at 3600 ms: both read the same for 700 ms at 4300 ms; the push at 4400 ms commits
  assert.equal(c[0].at, 4400);
});

test("good boundaries: a soft mark, a subordinator or subject pronoun, and / so / but only before a clause", () => {
  const w = (s) => s.split(" ");
  const n = (s) => s.split(" ").map((x) => x.toLowerCase().replace(/[^a-z0-9'-]/g, ""));
  const at = (s, i) => goodCut(w(s), n(s), i, w(s).length);
  assert.equal(at("the tumour was large, and it was firm", 3), true, "after a comma");
  assert.equal(at("the cells were small because the stroma was dense", 3), true, "before because");
  assert.equal(at("the cells were small we saw them", 3), true, "before we");
  assert.equal(at("positive for desmin and smooth muscle actin", 2), false, "and + a content word: a list");
  assert.equal(at("positive for desmin and the cells were small", 2), true, "and + a determiner: a clause");
  assert.equal(at("we saw so many mitoses here", 1), false, "so + many");
  assert.equal(at("the lesion is because of the tumour", 2), false, "never after a function word");
  assert.equal(at("the lesion was firm and we", 3), true);
  assert.equal(goodCut(w("the lesion was firm and we"), n("the lesion was firm and we"), 3, 5), false,
    "and + we: the word after and must be stable too");
  assert.equal(at("this is grade I tumour", 2), false, "grade I is a numeral, not the pronoun");
  assert.equal(at("according to the current WHO classification", 3), false, "WHO is not who");
  assert.equal(at("the cells that we saw were small", 2), false, "that + we: a relative clause, never after that");
  assert.equal(weakCut(n("positive for desmin in the stroma"), 2, 6), true, "before a preposition");
  assert.equal(weakCut(n("this is a ductal carcinoma in situ today"), 4, 7), false, "never inside carcinoma in situ");
  assert.equal(weakCut(n("this is a carcinoma with medullary pattern"), 3, 7), false, "never before with");
});

test("no good boundary: nothing before capWords, then a cut before a preposition; never after a function word", () => {
  const seg = createSegmenter(MIC);
  const text = "tumour cells strongly express desmin smooth muscle actin caldesmon calponin vimentin " +
    "focally within the deeper fibrous stroma near large thick walled vessels";
  const { out } = speak(seg, text);
  const c = commits(out);
  assert.equal(c.length, 1, JSON.stringify(c.map((e) => e.raw)));
  assert.equal(c[0].raw, "tumour cells strongly express desmin smooth muscle actin caldesmon calponin vimentin focally");
  assert.equal(c[0].reason, "long");
});

test("a pause commits the tail after pauseMs, but waits pauseWeakMs when the tail ends on a function word", () => {
  const seg = createSegmenter({ ...MIC, pauseWeakMs: 1600 });
  seg.push("the margins are clear and the", 0);
  assert.deepEqual(commits(seg.tick(1000)), [], "after the: wait");
  assert.equal(commits(seg.tick(1600))[0].raw, "the margins are clear and the");
  const s2 = createSegmenter({ ...MIC, pauseWeakMs: 1600 });
  s2.push("the margins are clear", 0);
  assert.equal(commits(s2.tick(800))[0].raw, "the margins are clear");
});

test("an early commit rewritten by the recognizer within reviseMs is a revision, not a second commit", () => {
  const seg = createSegmenter(MIC);
  const said = "we looked at the slides of the cash and we saw many glands";
  const { out, t } = speak(seg, said);
  const c = commits(out);
  assert.equal(c[0].raw, "we looked at the slides of the cash");
  const r = seg.push("we looked at the slides of the case and we saw many glands", t);
  assert.deepEqual(r.filter((e) => e.type === "revise").map((e) => [e.id, e.raw]),
    [[c[0].id, "we looked at the slides of the case"]]);
  assert.deepEqual(commits(r), []);
});

test("after a recognizer restart, a pause commit whose last word is then corrected is revised, not committed again", () => {
  const seg = createSegmenter(MIC);
  seg.push("the first part ends here.", 0);
  seg.push("the first part ends here.", 100);
  seg.push("", 200);  // the recognition ended
  seg.push("microscopically the cells are arranged in nests wits", 1000);
  const p = commits(seg.tick(2000));
  assert.equal(p[0].raw, "microscopically the cells are arranged in nests wits");
  const r = seg.push("microscopically the cells are arranged in nests with a salt and pepper", 2400);
  assert.deepEqual(commits(r), [], "no duplicate");
  assert.deepEqual(r.filter((e) => e.type === "revise").map((e) => e.raw),
    ["microscopically the cells are arranged in nests with"]);
  assert.deepEqual(r.filter((e) => e.type === "draft").map((e) => e.text), ["a salt and pepper"]);
});

test("a committed word corrected later in an older sentence: the stream is found again, nothing repeated", () => {
  const seg = createSegmenter(MIC);
  seg.push("the tumour extended into the subserosal tisue", 0);
  assert.equal(commits(seg.tick(900)).length, 1);
  seg.push("the tumour extended into the subserosal tisue there was invasion", 1500);
  assert.equal(commits(seg.tick(2400)).length, 1);
  // the recognizer fixes both: an older sentence and the last one
  const r = seg.push("the tumour extended into the subserosal tissue there was invasions and eight nodes", 2800);
  assert.deepEqual(commits(r), []);
  assert.deepEqual(r.filter((e) => e.type === "revise").map((e) => e.raw), ["there was invasions"]);
  assert.deepEqual(r.filter((e) => e.type === "draft").map((e) => e.text), ["and eight nodes"]);
  // the final text of the recognition, punctuated, with the words fixed: nothing new, nothing repeated
  const f = seg.push("The tumour extended into the subserosal tissue. There was invasions and eight nodes.", 3500);
  assert.deepEqual(commits(f), []);
  const all = [...f, ...seg.push("", 3600)];
  assert.deepEqual(commits(all).map((e) => e.en), [], "the words pending went into the last sentence's revision");
});

test("a short commit whose words are all rewritten later: no reset, the recognition is not committed again", () => {
  const seg = createSegmenter(MIC);
  seg.push("we will look at a few breast cores at the end so", 0);
  assert.equal(commits(seg.tick(900)).length, 1);
  seg.push("we will look at a few breast cores at the end so ths firss", 1500);
  assert.equal(commits(seg.tick(2400)).map((e) => e.raw).join(), "ths firss");
  const r = seg.push("we will look at a few breast cores at the end so the first casex is", 2800);
  assert.deepEqual(commits(r), [], "the words of the recognition are not taken for new text");
  assert.deepEqual(r.filter((e) => e.type === "draft").map((e) => e.text), ["casex is"]);
});

test("past 400 committed words (the stream is trimmed) a rewritten last sentence is still a revision", () => {
  const seg = createSegmenter();
  const sentence = (k, last) => "abcdefgh".split("").map((c) => c + k).join(" ") + " " + last + ".";
  let text = "";
  let n = 0;
  for (let k = 0; k < 50; k++) {
    text = (k ? text + " " : "") + sentence(k, "it");
    n += commits(seg.push(text.split(" ").slice(-60).join(" "), k * 1000)).length;
    n += commits(seg.push(text.split(" ").slice(-60).join(" "), k * 1000 + 100)).length;
  }
  assert.equal(n, 50);
  const fixed = text.replace(/ it\.$/, " them.");
  const r = seg.push(fixed.split(" ").slice(-60).join(" "), 49 * 1000 + 500);
  assert.deepEqual(commits(r), []);
  assert.deepEqual(r.filter((e) => e.type === "revise").map((e) => e.en), ["A49 b49 c49 d49 e49 f49 g49 h49 them."]);
});

test("no good or weak cut ever falls inside a multiword term of the pathology packs", async () => {
  const terms = await packTerms(fileURLToPath(new URL("../../../packs/", import.meta.url)));
  assert.ok(terms.length > 500, "terms read: " + terms.length);
  const bad = [];
  for (const ws of terms) {
    const ns = ws.map(normWord);
    for (let i = 0; i < ws.length - 1; i++) {
      if (/,$/.test(ws[i])) continue;  // the key's own comma (WHO names: "..., nasal type") is a pause in speech too
      if (goodCut(ws, ns, i, ws.length) || weakCut(ns, i, ws.length)) bad.push(ws.join(" ") + " @" + i);
    }
  }
  assert.deepEqual(bad, []);
});
