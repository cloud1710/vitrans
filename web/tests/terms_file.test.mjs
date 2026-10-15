// "Áp dụng" in the file mode (spec Amendment G): the user's term replaced in the segments whose source has the English
// term, then the output written again by the M1 layer exactly as the job wrote it (translateFile on the job's input
// with its setup and the corrected results: same parts, same apply / fit / save). Synthetic fixtures only.
import "../engine/tests/dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translateFile } from "../engine/pipeline.js";
import { readZip, inflateEntry } from "../engine/ooxml/zip.js";
import { TermReview, rewriteFile } from "../terms.js";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const DEVICE = { kind: "cloud", name: "Cloudflare Workers AI" };
const PACK = { id: "pathology", name: "Giải phẫu bệnh", score: 0.3, matched: [], reason: "match", version: "0.2.0" };
// the pipeline setup a cloud job hands to translateFile (web/cloud.js setupFrom)
const SETUP = { classify: { stage: "classify", offline: false, unavailable: [], candidates: [], packs: [PACK] },
  pack: { id: "pathology", name: "Giải phẫu bệnh", key: "pathology@0.2.0" },
  packRows: [{ id: "pathology", name: "Giải phẫu bệnh", version: "0.2.0", score: 0.3, matched: [], reason: "match",
    source: null }], unavailable: [], unavailableNames: [], offline: false };
const noYield = async () => {};

const fixture = (name) => new Uint8Array(readFileSync(new URL("../engine/tests/fixtures/" + name, import.meta.url)));

// One job as the page runs it: the engine's segments and results kept, the output written by the M1 layer. vi: tagged
// source -> tagged Vietnamese (anything else: "VI " + source, tags kept).
async function runJob(name, vi) {
  const input = fixture(name);
  const kept = { segments: [], results: [] };
  const res = await translateFile(input, name, { prepare: async () => SETUP,
    translateSegments: async (segments) => {
      const r = segments.map((s) => ({ id: s.id, text: vi[s.tagged] || "VI " + s.tagged, level: 0, flags: [],
        cached: false }));
      kept.segments.push(...segments);
      kept.results.push(...r);
      return r;
    }, batchSize: 60, modelId: MODEL, device: DEVICE, notes: true, yieldFn: noYield });
  return { res, kept, job: { input, name, setup: SETUP, notes: true, modelId: MODEL, device: DEVICE } };
}

const entries = (bytes) => new Map(readZip(bytes).entries.map((e) => [e.name, e]));
const xml = (e) => new TextDecoder().decode(inflateEntry(e));
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// the names of the entries whose stored bytes differ between two packages (same entry list required)
function changedEntries(a, b) {
  const ea = entries(a), eb = entries(b);
  assert.deepEqual([...ea.keys()], [...eb.keys()]);
  return [...ea.keys()].filter((n) => !sameBytes(ea.get(n).raw, eb.get(n).raw));
}

const DOC_VI = {
  "Meningioma grading": "Phân độ u màng não",
  "In <g1>NF2-altered</g1> meningiomas<g2>1</g2><x1/>criteria": "Trong <g1>u màng não biến đổi NF2</g1><g2>1</g2><x1/>tiêu chí",
  "Negative staining": "Nhuộm âm tính",
  "Department of Pathology": "Khoa Giải phẫu bệnh",
};

test("docx: the corrected file differs from the job's only where the term was replaced", async () => {
  const { res, kept, job } = await runJob("doc.docx", DOC_VI);
  // written again with the job's own results: byte for byte the job's output
  const replay = await rewriteFile(translateFile, job, kept.results, { yieldFn: noYield });
  assert.ok(sameBytes(replay.bytes, res.bytes), "the rewrite is the job's write");
  const review = new TermReview({ segments: kept.segments, results: kept.results, pack: "pathology" });
  review.setNew({ terms: [{ en: "meningioma", vi: "u màng não", count: 1, ids: [0] }] });
  const key = review.rows.find((r) => r.en === "meningioma").key;
  assert.equal(review.apply(new Map([[key, "u màng não (meningioma)"]])).segments, 1);  // "meningiomas" is another word
  const out = await rewriteFile(translateFile, job, review.current, { yieldFn: noYield });
  assert.equal(out.name, "doc_vi.docx");
  assert.deepEqual(changedEntries(res.bytes, out.bytes), ["word/document.xml"]);
  const body = xml(entries(out.bytes).get("word/document.xml"));
  assert.ok(body.includes("Phân độ u màng não (meningioma)"));
  assert.ok(body.includes("u màng não biến đổi NF2"));
  assert.equal(body.split("(meningioma)").length - 1, 1);
  assert.ok(xml(entries(out.bytes).get("word/header1.xml")).includes("Khoa Giải phẫu bệnh"));
  // the job's own output is still the original
  const before = xml(entries(res.bytes).get("word/document.xml"));
  assert.ok(before.includes("Phân độ u màng não<") && !before.includes("(meningioma)"));
  assert.equal(out.report.counts.segments, res.report.counts.segments);
});

const DECK_VI = {
  "Meningioma grading": "Phân độ mô học u màng não",
  "Grade depends on mitoses": "Độ mô học phụ thuộc vào số nhân chia",
  "Survival by grade": "Sống còn theo độ mô học",
  "Grade 3 tumours recur early": "U độ mô học 3 tái phát sớm",
  "Speaker note about grading": "Ghi chú về phân độ mô học",
};

test("pptx: the corrected deck changes the slides whose source has the term, sentence case kept", async () => {
  const { res, kept, job } = await runJob("deck.pptx", DECK_VI);
  const replay = await rewriteFile(translateFile, job, kept.results, { yieldFn: noYield });
  assert.ok(sameBytes(replay.bytes, res.bytes), "the rewrite is the job's write");
  const review = new TermReview({ segments: kept.segments, results: kept.results, pack: "pathology" });
  review.setNew({ terms: [{ en: "grade", vi: "độ mô học", count: 3, ids: [] }] });
  const key = review.rows.find((r) => r.en === "grade").key;
  // three segments say "grade"; "grading" (slide 1 title, notes) is another word
  assert.equal(review.apply(new Map([[key, "độ ác tính"]])).segments, 3);
  const out = await rewriteFile(translateFile, job, review.current, { yieldFn: noYield });
  assert.equal(out.name, "deck_vi.pptx");
  assert.deepEqual(changedEntries(res.bytes, out.bytes), ["ppt/slides/slide1.xml", "ppt/slides/slide3.xml"]);
  const e = entries(out.bytes);
  const s1 = xml(e.get("ppt/slides/slide1.xml"));
  assert.ok(s1.includes("Độ ác tính phụ thuộc vào số nhân chia"));
  assert.ok(s1.includes("Phân độ mô học u màng não"));
  const s3 = xml(e.get("ppt/slides/slide3.xml"));
  assert.ok(s3.includes("Sống còn theo độ ác tính") && s3.includes("U độ ác tính 3 tái phát sớm"));
  assert.ok(xml(e.get("ppt/notesSlides/notesSlide1.xml")).includes("Ghi chú về phân độ mô học"));
});
