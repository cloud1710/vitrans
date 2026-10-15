// The live page's transcript (web/live/transcript.js): EN + VI pairs in memory only, revisions in place, TXT / SRT /
// DOCX exports (the DOCX through the M1 zip layer, web/pdf/docx.js), cleared 10 minutes after stop. Synthetic text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranscript, toTxt, toSrt, toDocx, srtTime, englishOf, enParts, CLEAR_AFTER_MS } from "../transcript.js";
import { readZip, inflateEntry } from "../../engine/ooxml/zip.js";

const T0 = Date.UTC(2026, 9, 15, 1, 0, 0);

function sample() {
  const tr = createTranscript();
  tr.start(T0);
  tr.add({ id: 1, en: "Good morning.", t: T0 + 2000 });
  tr.add({ id: 2, en: "Today we review a biopsy.", t: T0 + 5500 });
  tr.add({ id: 3, en: "Thank you.", t: T0 + 3723000 });
  tr.setVi(1, "Chào buổi sáng.", []);
  tr.setVi(2, "Hôm nay chúng ta xem lại một mẫu sinh thiết.", ["numbers_changed"]);
  return tr;
}

test("pairs keep their order; a revision changes the English in place and clears the old Vietnamese", () => {
  const tr = sample();
  assert.deepEqual(tr.list().map((e) => [e.id, e.en, e.vi]), [[1, "Good morning.", "Chào buổi sáng."],
    [2, "Today we review a biopsy.", "Hôm nay chúng ta xem lại một mẫu sinh thiết."], [3, "Thank you.", ""]]);
  tr.revise(2, "Today we review the biopsy.");
  assert.deepEqual([tr.get(2).en, tr.get(2).vi, tr.get(2).revised], ["Today we review the biopsy.", "", true]);
  tr.setVi(2, "Hôm nay chúng ta xem lại mẫu sinh thiết.", []);
  assert.equal(tr.list().length, 3);
  tr.setVi(99, "x", []);
  assert.equal(tr.list().length, 3, "an unknown id is ignored");
});

test("SRT: numbered cues, hh:mm:ss,mmm from the start, Vietnamese over English, a cue ends at the next one", () => {
  assert.equal(srtTime(3723004), "01:02:03,004");
  const srt = toSrt(sample().list(), T0);
  const cues = srt.trim().split(/\r?\n\r?\n/);
  assert.equal(cues.length, 3);
  assert.deepEqual(cues[0].split(/\r?\n/), ["1", "00:00:02,000 --> 00:00:05,499", "Chào buổi sáng.", "Good morning."]);
  assert.match(cues[1].split(/\r?\n/)[1], /^00:00:05,500 --> 00:00:\d\d,\d{3}$/);
  assert.deepEqual(cues[2].split(/\r?\n/).slice(2), ["Thank you."], "no Vietnamese yet: the English alone");
  assert.match(cues[2].split(/\r?\n/)[1], /^01:02:03,000 --> 01:02:0\d,\d{3}$/);
});

test("TXT: a header, then time, Vietnamese and English per sentence", () => {
  const txt = toTxt(sample().list(), T0);
  assert.match(txt, /^ViTranslate/);
  assert.ok(txt.includes("[00:00:02] Chào buổi sáng.\n  EN: Good morning.\n"));
  assert.ok(txt.includes("Bản dịch máy"));
});

test("DOCX: a valid package whose document holds every pair", () => {
  const bytes = toDocx(sample().list(), T0);
  assert.ok(bytes instanceof Uint8Array && bytes.length > 500);
  const entry = readZip(bytes).entries.find((e) => e.name === "word/document.xml");
  const doc = new TextDecoder().decode(inflateEntry(entry));
  for (const s of ["Chào buổi sáng.", "Good morning.", "Hôm nay chúng ta xem lại một mẫu sinh thiết.", "Thank you."]) {
    assert.ok(doc.includes(s), s);
  }
});

test("cleared CLEAR_AFTER_MS after stop; a new start cancels the clearing; clear() empties at once", () => {
  assert.equal(CLEAR_AFTER_MS, 10 * 60 * 1000);
  const timers = [];
  const fake = { setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; },
    clearTimeout: (h) => { if (timers[h]) timers[h].live = false; } };
  const tr = createTranscript({ timers: fake });
  tr.start(T0);
  tr.add({ id: 1, en: "One.", t: T0 });
  const cleared = [];
  tr.onClear(() => cleared.push(1));
  const at = tr.stopped(T0 + 1000);
  assert.equal(at, T0 + 1000 + CLEAR_AFTER_MS);
  assert.equal(timers[0].ms, CLEAR_AFTER_MS);
  tr.start(T0 + 2000);
  assert.equal(timers[0].live, false, "started again: kept");
  tr.stopped(T0 + 3000);
  timers[1].fn();
  assert.deepEqual([tr.list().length, cleared.length], [0, 1]);
  tr.add({ id: 2, en: "Two.", t: T0 });
  tr.clear();
  assert.equal(tr.list().length, 0);
});

test("term repair: en_fixed is the English shown and exported, repaired words carry the heard words", () => {
  const tr = createTranscript();
  tr.start(T0);
  tr.add({ id: 1, en: "The puppy thyroid carcinoma and the sell block.", t: T0 + 1000 });
  tr.add({ id: 2, en: "Thank you.", t: T0 + 4000 });
  tr.setVi(1, "Carcinom.", [], null, { en_fixed: "The papillary thyroid carcinoma and the cell block.",
    repairs: [{ from: "puppy thyroid carcinoma", to: "papillary thyroid carcinoma" }, { from: "sell block", to: "cell block" }] });
  tr.setVi(2, "Cảm ơn.", [], null, { en_fixed: "Thank you.", repairs: [] });
  const [e1, e2] = tr.list();
  assert.equal(englishOf(e1), "The papillary thyroid carcinoma and the cell block.");
  assert.equal(englishOf(e2), "Thank you.");
  assert.deepEqual(enParts(e1), [{ text: "The " }, { text: "papillary thyroid carcinoma", heard: "puppy thyroid carcinoma" },
    { text: " and the " }, { text: "cell block", heard: "sell block" }, { text: "." }]);
  assert.deepEqual(enParts(e2), [{ text: "Thank you." }]);
  assert.ok(toTxt(tr.list(), T0).includes("EN: The papillary thyroid carcinoma and the cell block.\n"));
  assert.ok(toSrt(tr.list(), T0).includes("Carcinom.\r\nThe papillary thyroid carcinoma and the cell block.\r\n"));
  const entry = readZip(toDocx(tr.list(), T0)).entries.find((x) => x.name === "word/document.xml");
  assert.ok(new TextDecoder().decode(inflateEntry(entry)).includes("The papillary thyroid carcinoma and the cell block."));
  tr.revise(1, "The puppy thyroid carcinoma.");
  assert.deepEqual([englishOf(tr.get(1)), enParts(tr.get(1))], ["The puppy thyroid carcinoma.",
    [{ text: "The puppy thyroid carcinoma." }]], "a revision drops the old repair");
  tr.setVi(2, "Cảm ơn.", []);
  assert.equal(englishOf(tr.get(2)), "Thank you.", "no repair given: the heard English");
});
