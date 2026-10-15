// The subtitle tool (web/sub/subtitles.js): .srt / .vtt parsed into cues (timings, multi-line text, styling tags kept),
// the cue texts turned into core segments (tags as the core's <gN> / <xN/> tokens, the neighbouring cues as context),
// the Vietnamese put back with its tags, and SRT / VTT written bilingual or Vietnamese only. Synthetic cues only; pure
// functions (no DOM, no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSubs, subSegments, subResults, writeSubs, subName, decodeSubs, toTagged, fromTagged, wrapLines,
  formatTime, shownText, SUB_MAX_BYTES } from "../subtitles.js";

const BOM = "﻿";
const SRT = BOM + [
  "1", "00:00:01,000 --> 00:00:03,500", "The tumour is <i>well circumscribed</i>.", "",
  "2", "00:00:03,000 --> 00:00:06,000", "{\\an8}Mitoses are rare,", "about two per field.", "",
  "3", "00:00:06,200 --> 00:00:07,000", "", "",
  "4", "01:02:03,004 --> 01:02:05,000", "<font color=\"#ffff00\">No necrosis.</font>", "",
].join("\r\n");

const VTT = [
  "WEBVTT - Synthetic lecture", "Kind: captions", "", "STYLE", "::cue { color: yellow; }", "",
  "NOTE This line and", "the next one are a note.", "",
  "intro", "00:01.000 --> 00:03.000 align:start position:10%", "<v Dr A>Good morning.", "",
  "00:00:02.500 --> 00:00:05.000", "<c.yellow>Spindle cells</c> are seen.", "", "NOTE second note", "",
  "00:05.000 --> 00:07.000", "Karyorrhexis <00:00:06.000>is present.", "",
].join("\n");

test("SRT: BOM and CRLF read, cues with timings, multi-line text and tags kept, empty cues kept", () => {
  const doc = parseSubs(SRT);
  assert.equal(doc.format, "srt");
  assert.equal(doc.cues.length, 4);
  const [a, b, c, d] = doc.cues;
  assert.deepEqual([a.start, a.end], [1000, 3500]);
  assert.deepEqual(a.lines, ["The tumour is <i>well circumscribed</i>."]);
  assert.deepEqual(b.lines, ["{\\an8}Mitoses are rare,", "about two per field."]);
  assert.deepEqual([b.start, b.end], [3000, 6000]);  // overlaps the first cue: kept as it is
  assert.deepEqual(c.lines, []);
  assert.deepEqual([d.start, d.end], [3723004, 3725000]);
  assert.equal(d.lines[0], "<font color=\"#ffff00\">No necrosis.</font>");
});

test("SRT: a missing index, extra blank lines, dot milliseconds and short hours are read leniently", () => {
  const doc = parseSubs("\n\n00:00:01.5 --> 00:00:02,25\nFirst.\n\n\n\n7\n0:00:03,000 --> 0:00:04,000\nSecond.\n");
  assert.deepEqual(doc.cues.map((c) => [c.start, c.end, c.lines.join("|")]),
    [[1500, 2250, "First."], [3000, 4000, "Second."]]);
});

test("VTT: header, STYLE / NOTE blocks, cue ids, settings, short timestamps and inner tags", () => {
  const doc = parseSubs(VTT);
  assert.equal(doc.format, "vtt");
  assert.deepEqual(doc.header, ["WEBVTT - Synthetic lecture", "Kind: captions"]);
  assert.deepEqual(doc.blocks.map((b) => b.kind), ["style", "note", "cue", "cue", "note", "cue"]);
  assert.deepEqual(doc.blocks[1].lines, ["NOTE This line and", "the next one are a note."]);
  const [a, b, c] = doc.cues;
  assert.deepEqual([a.id, a.start, a.end, a.settings], ["intro", 1000, 3000, "align:start position:10%"]);
  assert.deepEqual(a.lines, ["<v Dr A>Good morning."]);
  assert.deepEqual([b.id, b.start, b.end, b.settings], ["", 2500, 5000, ""]);
  assert.equal(c.lines[0], "Karyorrhexis <00:00:06.000>is present.");
});

test("text that is no subtitle file gives no cues", () => {
  assert.equal(parseSubs("Just some text.\nAnother line.").cues.length, 0);
  assert.equal(parseSubs("").cues.length, 0);
  assert.equal(parseSubs("WEBVTT\n\n").cues.length, 0);
});

test("styling tags become the core's tokens and come back", () => {
  const t = toTagged("{\\an8}The <i>tumour</i> is <b>small</b>.");
  assert.equal(t.tagged, "<x1/>The <g2>tumour</g2> is <g3>small</g3>.");
  assert.deepEqual(t.essential, [2, 3]);
  assert.equal(fromTagged("<x1/>Khối <g2>u</g2> <g3>nhỏ</g3>.", t.spans), "{\\an8}Khối <i>u</i> <b>nhỏ</b>.");
  // an opening tag that is never closed (VTT voice) and a timestamp tag: kept in place as fixed elements
  const v = toTagged("<v Dr A>Good <00:00:06.000>morning.");
  assert.equal(v.tagged, "<x1/>Good <x2/>morning.");
  assert.equal(fromTagged("<x1/>Chào <x2/>buổi sáng.", v.spans), "<v Dr A>Chào <00:00:06.000>buổi sáng.");
  // tokens the translation lost: a cue wrapped in one tag is wrapped again; a lone half of a pair is dropped
  const w = toTagged("<i>Well circumscribed.</i>");
  assert.equal(fromTagged("Giới hạn rõ.", w.spans, w.tagged), "<i>Giới hạn rõ.</i>");
  // a lone tag that leads the cue (a position override) leads it again wherever the translation put it
  const lead = toTagged("{\\an8}The tumour is small.");
  assert.equal(fromTagged("Khối u <x1/>nhỏ.", lead.spans, lead.tagged), "{\\an8}Khối u nhỏ.");
  assert.equal(fromTagged("VI <x1/>No necrosis.", lead.spans, lead.tagged), "{\\an8}VI No necrosis.");
  const p = toTagged("A <i>b</i> c");
  assert.equal(fromTagged("A <g1>b c", p.spans, p.tagged), "A b c");
  assert.equal(fromTagged("A <g9>b</g9> c", p.spans, p.tagged), "A b c");  // unknown tokens dropped
  assert.equal(toTagged("Plain text.").tagged, "Plain text.");
  assert.deepEqual(toTagged("Plain text.").essential, []);
  // a bare "<" that is no tag stays text
  assert.equal(toTagged("Ki-67 < 2 %").tagged, "Ki-67 < 2 %");
});

test("cue texts become segments with the neighbouring cues as context; empty cues are not sent", () => {
  const doc = parseSubs(SRT);
  const s = subSegments(doc);
  assert.deepEqual(s.segments, [
    { id: 0, tagged: "The tumour is <g1>well circumscribed</g1>.", essential: [1], prev: "",
      nxt: "Mitoses are rare, about two per field.", where: "Câu thoại 1" },
    { id: 1, tagged: "<x1/>Mitoses are rare, about two per field.", essential: [],
      prev: "The tumour is well circumscribed.", nxt: "No necrosis.", where: "Câu thoại 2" },
    { id: 2, tagged: "<g1>No necrosis.</g1>", essential: [1], prev: "Mitoses are rare, about two per field.", nxt: "",
      where: "Câu thoại 4" },
  ]);
  assert.equal(s.fullText, "The tumour is well circumscribed.\nMitoses are rare, about two per field.\nNo necrosis.");
  assert.deepEqual(s.refs.map((r) => r.cue), [0, 1, 3]);
});

test("the Vietnamese goes back to its cues with its tags; a two-line cue stays on two lines", () => {
  const doc = parseSubs(SRT);
  const s = subSegments(doc);
  const vi = subResults(doc, s, [
    { id: 0, text: "Khối u <g1>giới hạn rõ</g1>." },
    { id: 1, text: "<x1/>Hiếm gặp nhân chia, khoảng hai nhân chia trên mỗi vi trường." },
    { id: 2, text: "Không có hoại tử." },  // the model dropped the tag: the wrapper comes back
  ]);
  assert.deepEqual(vi[0], ["Khối u <i>giới hạn rõ</i>."]);
  assert.deepEqual(vi[1], ["{\\an8}Hiếm gặp nhân chia, khoảng hai", "nhân chia trên mỗi vi trường."]);
  assert.equal(vi[2], null);  // the empty cue: nothing to translate
  assert.deepEqual(vi[3], ["<font color=\"#ffff00\">Không có hoại tử.</font>"]);
});

test("long lines are split at the space nearest the middle, never inside a tag", () => {
  assert.deepEqual(wrapLines("Một hai ba bốn năm sáu bảy tám chín mười mười một mười hai", 2),
    ["Một hai ba bốn năm sáu bảy tám", "chín mười mười một mười hai"]);
  assert.deepEqual(wrapLines("Ngắn gọn.", 2), ["Ngắn gọn."]);
  assert.deepEqual(wrapLines("Một hai ba bốn năm sáu bảy tám chín mười mười một mười hai", 1),
    ["Một hai ba bốn năm sáu bảy tám chín mười mười một mười hai"]);
  const tagged = wrapLines("<font color=\"#ffff00\">Một hai ba bốn năm sáu bảy tám chín mười mười một</font>", 2);
  assert.equal(tagged.length, 2);
  assert.ok(tagged.every((l) => !/<[^>]*$/.test(l) && !/^[^<]*>/.test(l)), JSON.stringify(tagged));
});

test("SRT written bilingual (Vietnamese over English) or Vietnamese only, CRLF, numbered again", () => {
  const doc = parseSubs(SRT);
  const vi = [["Khối u <i>giới hạn rõ</i>."], ["{\\an8}Hiếm gặp nhân chia."], null, ["Không hoại tử."]];
  assert.equal(writeSubs(doc, vi, { format: "srt", bilingual: false }), [
    "1", "00:00:01,000 --> 00:00:03,500", "Khối u <i>giới hạn rõ</i>.", "",
    "2", "00:00:03,000 --> 00:00:06,000", "{\\an8}Hiếm gặp nhân chia.", "",
    "3", "00:00:06,200 --> 00:00:07,000", "",
    "4", "01:02:03,004 --> 01:02:05,000", "Không hoại tử.", "",
  ].join("\r\n"));
  const bi = writeSubs(doc, vi, { format: "srt", bilingual: true });
  assert.ok(bi.startsWith("1\r\n00:00:01,000 --> 00:00:03,500\r\nKhối u <i>giới hạn rõ</i>.\r\n"
    + "The tumour is <i>well circumscribed</i>.\r\n\r\n2\r\n"));
  assert.ok(bi.includes("\r\n{\\an8}Hiếm gặp nhân chia.\r\nMitoses are rare,\r\nabout two per field.\r\n\r\n"));
  // a cue without Vietnamese keeps its English in both forms
  const partial = writeSubs(doc, [null, null, null, null], { format: "srt", bilingual: false });
  assert.ok(partial.includes("The tumour is <i>well circumscribed</i>."));
});

test("VTT written with its header, STYLE / NOTE blocks, ids and settings; SRT to VTT and back", () => {
  const doc = parseSubs(VTT);
  const vi = [["<v Dr A>Chào buổi sáng."], ["<c.yellow>Tế bào hình thoi</c> được thấy."], ["Có vỡ nhân."]];
  const out = writeSubs(doc, vi, { format: "vtt", bilingual: false });
  assert.equal(out, [
    "WEBVTT - Synthetic lecture", "Kind: captions", "", "STYLE", "::cue { color: yellow; }", "",
    "NOTE This line and", "the next one are a note.", "",
    "intro", "00:00:01.000 --> 00:00:03.000 align:start position:10%", "<v Dr A>Chào buổi sáng.", "",
    "00:00:02.500 --> 00:00:05.000", "<c.yellow>Tế bào hình thoi</c> được thấy.", "", "NOTE second note", "",
    "00:00:05.000 --> 00:00:07.000", "Có vỡ nhân.", "",
  ].join("\n"));
  // VTT -> SRT: notes, styles, ids and settings go; cues numbered
  const srt = writeSubs(doc, vi, { format: "srt", bilingual: false });
  assert.ok(srt.startsWith("1\r\n00:00:01,000 --> 00:00:03,000\r\n<v Dr A>Chào buổi sáng.\r\n\r\n2\r\n"));
  assert.ok(!/NOTE|STYLE|align:start|intro/.test(srt));
  // SRT -> VTT: a WEBVTT header, the cues in order; read back the same
  const fromSrt = writeSubs(parseSubs(SRT), [null, null, null, null], { format: "vtt", bilingual: false });
  assert.ok(fromSrt.startsWith("WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nThe tumour is"));
  const again = parseSubs(fromSrt);
  assert.deepEqual(again.cues.map((c) => [c.start, c.end, c.lines]), parseSubs(SRT).cues.map((c) => [c.start, c.end, c.lines]));
});

test("a written cue never holds a blank line or an arrow line that would end it early", () => {
  const doc = parseSubs("1\n00:00:01,000 --> 00:00:02,000\nA.\n");
  const out = writeSubs(doc, [["Một.", "", "  ", "Hai --> ba."]], { format: "vtt", bilingual: false });
  assert.equal(out, "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nMột.\nHai → ba.\n");
});

test("the on-screen text of a cue has no markup (the file keeps it)", () => {
  assert.equal(shownText(["{\\an8}<i>Khối u</i> <font color=\"#ff0\">nhỏ</font>,", "<v Dr A>rõ <00:00:06.000>ràng."]),
    "Khối u nhỏ, rõ ràng.");
  assert.equal(shownText(["Ki-67 < 2 %"]), "Ki-67 < 2 %");
  assert.equal(shownText([]), "");
});

test("times, names, decoding", () => {
  assert.equal(formatTime(3723004, "srt"), "01:02:03,004");
  assert.equal(formatTime(5, "vtt"), "00:00:00.005");
  assert.equal(subName("lecture.en.srt", "srt"), "lecture.en_vi.srt");
  assert.equal(subName("talk.vtt", "srt"), "talk_vi.srt");
  assert.equal(subName("", "vtt"), "phu-de_vi.vtt");
  const utf8 = new TextEncoder().encode(BOM + "1\n00:00:01,000 --> 00:00:02,000\nCafé\n");
  assert.equal(decodeSubs(utf8), "1\n00:00:01,000 --> 00:00:02,000\nCafé\n");
  const latin1 = Uint8Array.from([0x43, 0x61, 0x66, 0xe9]);  // "Café" in Windows-1252
  assert.equal(decodeSubs(latin1), "Café");
  assert.ok(SUB_MAX_BYTES >= 1024 * 1024);
});
