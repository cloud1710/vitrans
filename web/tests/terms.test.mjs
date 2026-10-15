// "Xem lại thuật ngữ" (spec Amendment G) without the page: the items sent to /api/v1/terms, the rows of the two lists
// ("Từ mới" from /terms, "Đã tự sửa" from the results' fixes), the user's change replaced in the segments whose source
// has the English term, the feedback payload (term pairs only) and the panel state. Pure functions, synthetic text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plainText, hasTerm, replaceTerms, termItems, fixRows, newRows, feedbackItems, feedbackBatch, mainPack,
  TermReview, termsErrorText, feedbackErrorText, TERMS_MAX_ITEMS, TERMS_MAX_CHARS, FEEDBACK_MAX_ITEMS, EN_MAX_CHARS,
  VI_MAX_CHARS } from "../terms.js";

test("a segment's plain text: tags dropped, placeholders read as spaces, spaces collapsed", () => {
  assert.equal(plainText("In <g1>NF2-altered</g1> meningiomas<g2>1</g2><x1/>criteria"),
    "In NF2-altered meningiomas1 criteria");
  assert.equal(plainText("  a  <x2/>b "), "a b");
  assert.equal(plainText(""), "");
  assert.equal(plainText(undefined), "");
});

test("an English term matches case-insensitively and as whole words only", () => {
  assert.equal(hasTerm("Spindle cells are seen.", "spindle cells"), true);
  assert.equal(hasTerm("The SPINDLE  cells", "spindle cells"), true);  // spaces collapsed
  assert.equal(hasTerm("spindle cellsx", "spindle cells"), false);
  assert.equal(hasTerm("Two meningiomas", "meningioma"), false);       // another word
  assert.equal(hasTerm("Meningioma grading", "grade"), false);
  assert.equal(hasTerm("Grade 3 tumours", "grade"), true);
  assert.equal(hasTerm("In NF2-altered tumours", "NF2"), true);       // a hyphen ends a word
  assert.equal(hasTerm("Ki-67 index", "ki-67"), true);
  assert.equal(hasTerm("x", ""), false);
  assert.equal(hasTerm("", "x"), false);
});

test("replaceTerms: the exact Vietnamese, every occurrence, whole words, outside the tags; a capital stays", () => {
  assert.deepEqual(replaceTerms("Khối u có tế bào hình thoi; tế bào hình thoi xếp bó.",
    [["tế bào hình thoi", "tế bào hình suốt"]]),
  { text: "Khối u có tế bào hình suốt; tế bào hình suốt xếp bó.", hits: [2] });
  // a sentence that starts with the term keeps its capital
  assert.equal(replaceTerms("Tế bào hình thoi xếp bó.", [["tế bào hình thoi", "tế bào hình suốt"]]).text,
    "Tế bào hình suốt xếp bó.");
  assert.equal(replaceTerms("U màng não lành tính.", [["u", "khối u"]]).text, "Khối u màng não lành tính.");
  // whole words: the "u" of "bướu" or "ung" is not the term "u"
  assert.deepEqual(replaceTerms("bướu u", [["u", "khối u"]]), { text: "bướu khối u", hits: [1] });
  assert.deepEqual(replaceTerms("ung thư", [["u", "x"]]), { text: "ung thư", hits: [0] });
  // exact: another case is another string
  assert.deepEqual(replaceTerms("TẾ BÀO", [["tế bào", "x"]]), { text: "TẾ BÀO", hits: [0] });
  // the tags are never touched; the text inside them is
  assert.deepEqual(replaceTerms("<g1>u màng não</g1> và <x1/>u màng não", [["u màng não", "u màng não (meningioma)"]]),
    { text: "<g1>u màng não (meningioma)</g1> và <x1/>u màng não (meningioma)", hits: [2] });
  assert.deepEqual(replaceTerms("<g1>x</g1>", [["g1", "zz"]]), { text: "<g1>x</g1>", hits: [0] });
  // decomposed Vietnamese (NFD) is found too
  assert.deepEqual(replaceTerms("tế bào".normalize("NFD"), [["tế bào", "x"]]), { text: "x", hits: [1] });
  // several terms at once: the longer one wins where they overlap, each is replaced once
  assert.deepEqual(replaceTerms("Carcinom ống tuyến vú là một carcinom.",
    [["carcinom", "ung thư biểu mô"], ["carcinom ống tuyến vú", "carcinom thể ống"]]),
  { text: "Carcinom thể ống là một ung thư biểu mô.", hits: [1, 1] });
  // nothing found: the very same string comes back
  const nfd = "không có gì".normalize("NFD");
  assert.equal(replaceTerms(nfd, [["tế bào", "x"]]).text, nfd);
  assert.deepEqual(replaceTerms("abc", [["", "x"], ["b", "b"]]), { text: "abc", hits: [0, 0] });
});

// the job's segments (source) and results (Vietnamese), as the page keeps them after a job
const SEGS = [
  { id: 0, tagged: "The tumour shows spindle cells." },
  { id: 1, tagged: "Spindle cells are arranged in <g1>fascicles</g1>." },
  { id: 2, tagged: "Fusiform cells are also present." },
  { id: 3, tagged: "No necrosis." },
];
const RES = [
  { id: 0, text: "Khối u có tế bào hình thoi.", level: 0, flags: ["term_fix:tumour"],
    fixes: [{ en: "tumour", from: "bướu", to: "khối u" }] },
  { id: 1, text: "Tế bào hình thoi xếp thành <g1>bó</g1>.", level: 0, flags: [] },
  { id: 2, text: "Cũng có tế bào hình thoi.", level: 0, flags: [] },
  { id: 3, text: "Không thấy hoại tử.", level: 0, flags: [] },
];
const TERMS = { terms: [{ en: "spindle cells", vi: "tế bào hình thoi", count: 2, ids: [0, 1] },
  { en: "fascicles", vi: "bó", count: 1, ids: [1] }] };

test("items for /terms: each segment's plain English and Vietnamese, nothing else", () => {
  assert.deepEqual(termItems(SEGS, RES), [
    { id: 0, src: "The tumour shows spindle cells.", vi: "Khối u có tế bào hình thoi." },
    { id: 1, src: "Spindle cells are arranged in fascicles.", vi: "Tế bào hình thoi xếp thành bó." },
    { id: 2, src: "Fusiform cells are also present.", vi: "Cũng có tế bào hình thoi." },
    { id: 3, src: "No necrosis.", vi: "Không thấy hoại tử." },
  ]);
  // a segment without a translation (or without text) is not sent
  assert.deepEqual(termItems([{ id: 0, tagged: "A." }, { id: 1, tagged: "<x1/>" }], [{ id: 0, text: "" }, { id: 1, text: "B." }]), []);
});

test("items for /terms: at most 200 items and 60,000 characters, the ones with the most text, in document order", () => {
  assert.equal(TERMS_MAX_ITEMS, 200);
  assert.equal(TERMS_MAX_CHARS, 60000);
  // 250 segments, segment k with k + 1 characters on each side: the 200 longest are 50..249
  const segs = Array.from({ length: 250 }, (_, k) => ({ id: k, tagged: "e".repeat(k + 1) }));
  const res = segs.map((s, k) => ({ id: k, text: "v".repeat(k + 1) }));
  const many = termItems(segs.slice(0, 250).map((s, k) => ({ id: k, tagged: "e".repeat(Math.min(k + 1, 100)) })),
    res.map((r, k) => ({ id: k, text: "v".repeat(Math.min(k + 1, 100)) })));
  assert.equal(many.length, 200);
  assert.deepEqual(many.map((i) => i.id), Array.from({ length: 200 }, (_, k) => k + 50));
  // 100 segments of 1,000 characters (500 + 500): 60 of them fill the 60,000 characters
  const big = termItems(Array.from({ length: 100 }, (_, k) => ({ id: k, tagged: "e".repeat(500) })),
    Array.from({ length: 100 }, (_, k) => ({ id: k, text: "v".repeat(500) })));
  assert.equal(big.length, 60);
  assert.deepEqual(big.map((i) => i.id), Array.from({ length: 60 }, (_, k) => k));
  // the largest that fit, smaller ones fill the rest; one longer than the whole budget is left out
  const mixed = termItems(segs.slice(0, 3).concat([{ id: 9, tagged: "e".repeat(60000) }]),
    res.slice(0, 3).concat([{ id: 9, text: "v" }]));
  assert.deepEqual(mixed.map((i) => i.id), [0, 1, 2]);
  const total = (items) => items.reduce((n, i) => n + Array.from(i.src).length + Array.from(i.vi).length, 0);
  assert.ok(total(termItems(segs, res)) <= TERMS_MAX_CHARS);
  assert.ok(termItems(segs, res).every((i) => Object.keys(i).join() === "id,src,vi"));
});

test("Đã tự sửa: one row per English term and Vietnamese from the results' fixes, segments counted", () => {
  const rows = fixRows([
    { id: 0, text: "a", fixes: [{ en: "tumour", from: "bướu", to: "khối u" }] },
    { id: 1, text: "b", fixes: [{ en: "Tumour", from: "u bướu", to: "khối u" }, { en: "frozen section", from: "cắt lạnh",
      to: "sinh thiết tức thì" }] },
    { id: 2, text: "c", fixes: [{ en: "tumour", from: "bướu", to: "khối u" }, { en: "tumour", from: "bướu", to: "khối u" }] },
    { id: 3, text: "d" },
    { id: 4, text: "e", fixes: "not a list" },
    { id: 5, text: "f", fixes: [{ en: "", from: "x", to: "y" }, { en: "x" }, null] },
  ]);
  assert.deepEqual(rows.map((r) => [r.kind, r.en, r.from, r.used, r.value, r.count]), [
    ["fixed", "tumour", "bướu, u bướu", "khối u", "khối u", 3],
    ["fixed", "frozen section", "cắt lạnh", "sinh thiết tức thì", "sinh thiết tức thì", 1],
  ]);
  assert.deepEqual(fixRows([{ id: 0, text: "x" }]), []);  // results without fixes (before the core sends them)
  // the core's title-order fix (academic titles before a name) is no term: never a row, never sent
  assert.deepEqual(fixRows([{ id: 0, text: "TS BS Nguyễn A", fixes: [{ en: "title-order", from: "BS TS", to: "TS BS" }] }]),
    []);
});

test("Từ mới: rows from /terms (English, the Vietnamese used, the count); malformed entries are left out", () => {
  const rows = newRows({ terms: [{ en: "spindle cells", vi: "tế bào hình thoi", count: 3, ids: [0, 2] },
    { en: "", vi: "x" }, { en: "a" }, { en: "Spindle cells", vi: "dup" }, { en: "fascicles", vi: "bó", ids: [1, 4] }] });
  assert.deepEqual(rows.map((r) => [r.kind, r.en, r.used, r.value, r.count]),
    [["new", "spindle cells", "tế bào hình thoi", "tế bào hình thoi", 3], ["new", "fascicles", "bó", "bó", 2]]);
  assert.deepEqual(rows.map((r) => [...r.ids]), [["0", "2"], ["1", "4"]]);  // the segments /terms found it in
  assert.deepEqual(newRows({}), []);
  assert.deepEqual(newRows(null), []);
});

const keyOf = (review, en) => review.rows.find((r) => r.en === en).key;

test("Áp dụng: the new Vietnamese replaces the old in every segment whose source has the English term, nowhere else", () => {
  const review = new TermReview({ segments: SEGS, results: RES, pack: "pathology" });
  review.setNew(TERMS);
  assert.deepEqual(review.rows.map((r) => [r.kind, r.en]), [["new", "spindle cells"], ["new", "fascicles"],
    ["fixed", "tumour"]]);
  const r = review.apply(new Map([[keyOf(review, "spindle cells"), "tế bào hình suốt"]]));
  assert.equal(r.segments, 2);
  assert.deepEqual(r.rows.map((x) => x.en), ["spindle cells"]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(review.current.map((x) => x.text), ["Khối u có tế bào hình suốt.", "Tế bào hình suốt xếp thành <g1>bó</g1>.",
    "Cũng có tế bào hình thoi.", "Không thấy hoại tử."]);  // segment 2 has no "spindle cells" in its source
  // every other field of a result is kept; the job's own results are not touched (the original stays)
  assert.deepEqual(review.current[0].fixes, RES[0].fixes);
  assert.equal(review.current[1].level, 0);
  assert.equal(RES[0].text, "Khối u có tế bào hình thoi.");
  assert.deepEqual(review.original.map((x) => x.text), RES.map((x) => x.text));
  const row = review.rows.find((x) => x.en === "spindle cells");
  assert.equal(row.used, "tế bào hình thoi");
  assert.equal(row.value, "tế bào hình suốt");
  // a second change starts from what is in the text now
  const again = review.apply(new Map([[row.key, "tế bào thoi"]]));
  assert.equal(again.segments, 2);
  assert.equal(review.current[1].text, "Tế bào thoi xếp thành <g1>bó</g1>.");
  assert.equal(row.used, "tế bào hình thoi");
});

test("Áp dụng: several rows at once, a fixed row, a Vietnamese not in the text, unchanged and empty values", () => {
  const review = new TermReview({ segments: SEGS, results: RES, pack: "pathology" });
  review.setNew(TERMS);
  const r = review.apply(new Map([[keyOf(review, "tumour"), "u"], [keyOf(review, "fascicles"), "bó sợi"],
    [keyOf(review, "spindle cells"), "tế bào hình thoi"]]));  // unchanged: not a change
  assert.deepEqual(r.rows.map((x) => x.en).sort(), ["fascicles", "tumour"]);
  assert.equal(r.segments, 2);
  assert.deepEqual(review.current.map((x) => x.text), ["U có tế bào hình thoi.", "Tế bào hình thoi xếp thành <g1>bó sợi</g1>.",
    "Cũng có tế bào hình thoi.", "Không thấy hoại tử."]);
  // the model wrote another Vietnamese than the row's: nothing to replace, said so; empty values change nothing
  const review2 = new TermReview({ segments: SEGS, results: RES, pack: "pathology" });
  review2.setNew({ terms: [{ en: "necrosis", vi: "sự hoại tử", count: 1, ids: [3] }] });
  const miss = review2.apply(new Map([[keyOf(review2, "necrosis"), "hoại tử"], [keyOf(review2, "tumour"), "  "]]));
  assert.equal(miss.segments, 0);
  assert.deepEqual(miss.missing, ["necrosis"]);
  assert.deepEqual(miss.rows.map((x) => x.en), ["necrosis"]);
  assert.deepEqual(review2.current.map((x) => x.text), RES.map((x) => x.text));
  assert.deepEqual(review2.apply(new Map()), { rows: [], segments: 0, missing: [] });
});

test("Áp dụng on a new term also reaches the segments /terms named (plurals, US / UK spellings), no others", () => {
  const segs = [{ id: 0, tagged: "Two meningiomas were seen." }, { id: 1, tagged: "Meningioma, grade 1." },
    { id: 2, tagged: "A meningothelial lesion." }];
  const res = [{ id: 0, text: "Thấy hai u màng não." }, { id: 1, text: "U màng não, độ 1." },
    { id: 2, text: "Tổn thương dạng u màng não." }];
  const review = new TermReview({ segments: segs, results: res, pack: "pathology" });
  review.setNew({ terms: [{ en: "meningioma", vi: "u màng não", count: 2, ids: [0, 1] }] });
  const r = review.apply(new Map([[keyOf(review, "meningioma"), "u màng não (meningioma)"]]));
  assert.equal(r.segments, 2);
  assert.deepEqual(review.current.map((x) => x.text), ["Thấy hai u màng não (meningioma).", "U màng não (meningioma), độ 1.",
    "Tổn thương dạng u màng não."]);
});

test("Áp dụng on a fixed row also reaches the segments the core fixed (its matcher knows plurals), no others", () => {
  const segs = [{ id: 0, tagged: "Two tumours were seen." }, { id: 1, tagged: "Tumours vary." },
    { id: 2, tagged: "The tumour is small." }];
  const res = [{ id: 0, text: "Thấy hai khối u.", fixes: [{ en: "tumour", from: "bướu", to: "khối u" }] },
    { id: 1, text: "Các khối u khác nhau." }, { id: 2, text: "Khối u nhỏ." }];
  const review = new TermReview({ segments: segs, results: res, pack: "pathology" });
  const r = review.apply(new Map([[keyOf(review, "tumour"), "u"]]));
  assert.equal(r.segments, 2);
  assert.deepEqual(review.current.map((x) => x.text), ["Thấy hai u.", "Các khối u khác nhau.", "U nhỏ."]);
});

test("feedback: term pairs only (en, vi_used, vi_user, pack, kind), never a sentence, at most 50", () => {
  const review = new TermReview({ segments: SEGS, results: RES, pack: "pathology" });
  review.setNew(TERMS);
  review.apply(new Map([[keyOf(review, "spindle cells"), "tế bào hình suốt"], [keyOf(review, "tumour"), "u"]]));
  const items = feedbackItems(review.pending(), mainPack({ setup_id: "s", setup: { packs: [{ id: "pathology",
    version: "0.2.0" }, { id: "pathology-breast", version: "0.1.0" }], hits: [] } }));
  assert.deepEqual(items, [
    { en: "spindle cells", vi_used: "tế bào hình thoi", vi_user: "tế bào hình suốt", pack: "pathology", kind: "new" },
    { en: "tumour", vi_used: "khối u", vi_user: "u", pack: "pathology", kind: "fixed" },
  ]);
  const wire = JSON.stringify(items);
  for (const s of SEGS) assert.ok(!wire.includes(plainText(s.tagged)), "no source sentence");
  for (const r of review.current) assert.ok(!wire.includes(r.text), "no translated sentence");
  // limits (the server's: English <= 80, Vietnamese <= 120 characters), 50 items; a "term" that is a sentence (too
  // long, more than 8 English words, several lines) is never sent
  assert.equal(FEEDBACK_MAX_ITEMS, 50);
  assert.equal(EN_MAX_CHARS, 80);
  assert.equal(VI_MAX_CHARS, 120);
  const row = (en, used, value, kind) => ({ en, used, value, kind: kind || "new" });
  const rows = Array.from({ length: 60 }, (_, k) => row("term " + k, "a", "b"));
  assert.equal(feedbackItems(rows, "pathology").length, 50);
  const sentence = "The tumour is composed of spindle cells in fascicles";  // 9 words, 52 characters
  assert.deepEqual(feedbackItems([row(sentence, "a", "b"), row("e".repeat(81), "a", "b"), row("x", "a\nb", "c"),
    row("y", "a", "b".repeat(121)), row("z", "a", "")], "pathology"), []);
  assert.equal(feedbackItems([row("e".repeat(80), "v".repeat(120), "w ".repeat(60).trim())], "pathology").length, 1);
  assert.equal(mainPack({ setup: { packs: [], hits: [] } }), "_none");
  assert.equal(mainPack(null), "_none");
});

test("panel state: changed rows wait to be sent; the explicit button offers them, else the new terms not sent yet", () => {
  const review = new TermReview({ segments: SEGS, results: RES, pack: "pathology" });
  assert.deepEqual(review.toSend(), []);  // nothing to offer before /terms answered and nothing changed
  review.setNew(TERMS);
  assert.deepEqual(review.pending(), []);
  assert.deepEqual(review.toSend().map((r) => r.en), ["spindle cells", "fascicles"]);  // fixed rows: the pack has them
  review.apply(new Map([[keyOf(review, "tumour"), "u"]]));
  assert.deepEqual(review.pending().map((r) => r.en), ["tumour"]);
  assert.deepEqual(review.toSend().map((r) => r.en), ["tumour"]);
  review.markSent(review.toSend());
  assert.deepEqual(review.pending(), []);
  assert.deepEqual(review.toSend().map((r) => r.en), ["spindle cells", "fascicles"]);
  review.markSent(review.toSend());
  assert.deepEqual(review.toSend(), []);
  // changed again after it was sent: waiting again
  review.apply(new Map([[keyOf(review, "tumour"), "khối u lành"]]));
  assert.deepEqual(review.pending().map((r) => r.en), ["tumour"]);
  // a change back to what the model used is no proposal
  review.apply(new Map([[keyOf(review, "tumour"), "khối u"]]));
  assert.deepEqual(review.pending(), []);
});

test("panel state: the rows a draft would change (Áp dụng is on only then); a feedback batch names its rows", () => {
  const review = new TermReview({ segments: SEGS, results: RES, pack: "pathology" });
  review.setNew(TERMS);
  const sc = keyOf(review, "spindle cells");
  assert.deepEqual(review.changes(new Map([[sc, " tế bào hình thoi "], [keyOf(review, "tumour"), ""]])), []);
  assert.deepEqual(review.changes(new Map([[sc, "tế  bào hình suốt"], ["zz", "x"]])).map((r) => r.en), ["spindle cells"]);
  assert.deepEqual(review.current.map((x) => x.text), RES.map((x) => x.text), "changes() changes nothing");
  // the batch: the rows behind the items, in the same order, sentence-like rows and rows past 50 left out
  const rows = [{ en: "a", used: "x", value: "y", kind: "new" }, { en: "b", used: "x\ny", value: "z", kind: "new" },
    { en: "c", used: "x", value: "w", kind: "fixed" }];
  const batch = feedbackBatch(rows, "pathology");
  assert.deepEqual(batch.rows, [rows[0], rows[2]]);
  assert.deepEqual(batch.items, feedbackItems(rows, "pathology"));
  assert.deepEqual(batch.items.map((i) => i.en), ["a", "c"]);
  assert.equal(feedbackBatch(Array.from({ length: 70 }, (_, k) => ({ en: "t" + k, used: "a", value: "b" })), "p").rows.length, 50);
});

test("panel messages are short Vietnamese; the translation stays valid", () => {
  assert.match(termsErrorText("quota_exceeded"), /hết lượt hôm nay/);
  assert.match(termsErrorText("budget_exhausted"), /hết ngân sách hôm nay/);
  assert.match(termsErrorText("model_error"), /mô hình chưa trả lời/);
  assert.match(termsErrorText("network"), /mất kết nối/);
  assert.match(termsErrorText("whatever"), /máy chủ lỗi/);
  for (const c of ["quota_exceeded", "model_error", "x"]) assert.match(termsErrorText(c), /Bản dịch vẫn dùng được\.$/);
  assert.match(feedbackErrorText("network"), /^Chưa gửi được \(mất kết nối\)\.$/);
  assert.match(feedbackErrorText("quota_exceeded"), /hết lượt hôm nay/);
  assert.equal(feedbackErrorText("bad_request"), "Chưa gửi được (máy chủ từ chối).");  // a 400 is a refusal
});
