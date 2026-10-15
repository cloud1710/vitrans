// PDF content streams (web/pdf/content.js): the tokenizer / operator parser, the text-position interpreter (where
// every string of a Tj / TJ / ' / " lands in user space, with its font, size, colour and render mode; forms and
// images) and the rewriter that takes chosen strings out of the stream while every other glyph keeps its place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContent, analyze, rewrite, formatNumber } from "../content.js";

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("latin1").decode(b);
// a font whose glyphs are all 500 / 1000 em wide, one byte per code
const FONT = { codeBytes: 1, width: () => 500, bold: false, italic: false, serif: true, name: "Synthetic-Roman" };
const BOLD = { ...FONT, bold: true, serif: false, name: "Synthetic-Bold" };
const ctxOf = (o = {}) => ({ font: (n) => (n === "F1" ? FONT : n === "F2" ? BOLD : null), xobject: o.xobject || (() => null) });
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("operators and their operands, with strings, hex, names, arrays, comments and inline images", () => {
  const src = "% a comment\nq 1 0 0 1 .5 -3 cm /F1 12 Tf (a\\(b\\)c \\101\\\n(x)) Tj <48 65 6c6>Tj [(A) -250 (B)] TJ\n"
    + "/Na#20me BMC EMC BI /W 2 /H 1 /BPC 8 /CS /G ID \u0000EI\u0001 EI Q 4. Tz";
  const { ops } = parseContent(enc(src));
  assert.deepEqual(ops.map((o) => o.op), ["q", "cm", "Tf", "Tj", "Tj", "TJ", "BMC", "EMC", "BI", "Q", "Tz"]);
  assert.deepEqual(ops[1].args, [1, 0, 0, 1, 0.5, -3]);
  assert.deepEqual(ops[2].args, ["F1", 12]);
  assert.equal(dec(ops[3].args[0].bytes), "a(b)c A(x)");
  assert.equal(dec(ops[4].args[0].bytes), "Hel`");
  assert.equal(ops[5].args[0].length, 3);
  assert.equal(ops[5].args[0][1], -250);
  assert.equal(ops[6].args[0], "Na me");
  assert.equal(ops[10].args[0], 4);
  // every operator keeps its source span
  assert.equal(src.slice(ops[3].start, ops[3].end), "(a\\(b\\)c \\101\\\n(x)) Tj");
  assert.equal(src.slice(ops[8].start, ops[8].end), "BI /W 2 /H 1 /BPC 8 /CS /G ID \u0000EI\u0001 EI");
});

test("each string of a text operator gets its place in user space", () => {
  const src = "BT /F1 10 Tf 1 0 0 1 100 700 Tm (Hello) Tj 0 -20 Td (ab) Tj 14 TL (x) ' ET";
  const r = analyze(enc(src), ctxOf());
  assert.equal(r.shows.length, 3);
  const [a, b, c] = r.shows;
  assert.deepEqual(a.elements.map((e) => e.box.map((v) => Math.round(v * 100) / 100)), [[100, 697.5, 125, 707.5]]);
  assert.ok(close(b.elements[0].box[0], 100) && close(b.elements[0].box[1], 677.5) && close(b.elements[0].box[2], 110));
  assert.ok(close(c.elements[0].box[0], 100) && close(c.elements[0].box[1], 663.5));
  assert.equal(a.size, 10);
  assert.equal(a.font.name, "Synthetic-Roman");
  assert.deepEqual(a.style, { bold: false, italic: false, serif: true, color: [0, 0, 0], invisible: false });
});

test("TJ numbers, character and word spacing, horizontal scaling, rise and the CTM move the glyphs", () => {
  const src = "2 0 0 2 10 20 cm BT /F1 10 Tf 2 Tc 3 Tw 50 Tz 5 Ts [(a b) -1000 (c)] TJ ET";
  const r = analyze(enc(src), ctxOf());
  const [e0, e1, e2] = r.shows[0].elements;
  // "a b": (5 + 2) * 0.5 * 3 glyphs + 3 (word space) * 0.5 = 12; the number moves 10 * 0.5 = 5 back to the right
  assert.equal(e1.kind, "num");
  assert.ok(close(e0.adv, 12), "adv " + e0.adv);
  assert.ok(close(e0.box[0], 10) && close(e0.box[2], 10 + 2 * 12), "x " + e0.box);
  assert.ok(close(e0.box[1], 20 + 2 * (5 - 2.5)) && close(e0.box[3], 20 + 2 * (5 + 7.5)), "y " + e0.box);
  assert.ok(close(e2.box[0], 10 + 2 * (12 + 5)), "c at " + e2.box[0]);
  assert.equal(r.shows[0].size, 20);
});

test("q / Q restore the font, the CTM and the render mode; colours and invisible text are reported", () => {
  const src = "q 0 0 1 rg BT /F2 8 Tf 3 Tr 1 0 0 1 10 10 Tm (in) Tj ET Q BT 0.5 g /F1 9 Tf 1 0 0 1 10 30 Tm (out) Tj ET "
    + "BT 0 0 0 1 k /F1 9 Tf (k) Tj ET";
  const r = analyze(enc(src), ctxOf());
  assert.deepEqual(r.shows[0].style, { bold: true, italic: false, serif: false, color: [0, 0, 1], invisible: true });
  assert.equal(r.shows[0].tr, 3);
  assert.deepEqual(r.shows[1].style.color, [0.5, 0.5, 0.5]);
  assert.equal(r.shows[1].style.invisible, false);
  assert.equal(r.shows[1].tr, 0);
  assert.deepEqual(r.shows[2].style.color, [0, 0, 0]);
});

test("forms are followed with their matrix; images report their box", () => {
  const form = { kind: "form", key: "form:7", bytes: enc("BT /F1 10 Tf 1 0 0 1 0 0 Tm (f) Tj ET"), matrix: [1, 0, 0, 1, 5, 5],
    ctx: null };
  form.ctx = ctxOf();
  const ctx = ctxOf({ xobject: (n) => (n === "Fm1" ? form : n === "Im1" ? { kind: "image" } : null) });
  const r = analyze(enc("q 1 0 0 1 100 200 cm /Fm1 Do Q q 50 0 0 40 10 10 cm /Im1 Do Q BI /W 1 /H 1 ID x EI"), ctx);
  assert.equal(r.shows.length, 1);
  assert.equal(r.shows[0].stream, "form:7");
  assert.ok(close(r.shows[0].elements[0].box[0], 105) && close(r.shows[0].elements[0].box[1], 202.5));
  assert.deepEqual(r.images, [[10, 10, 60, 50], [0, 0, 1, 1]]);
  assert.deepEqual(Object.keys(r.streams).sort(), ["form:7", "page"]);
});

test("removed strings become TJ moves of the same width, so the kept glyphs stay in place", () => {
  const src = "BT /F1 10 Tf 2 Tc 1 0 0 1 100 700 Tm [(Hello) -120 (World)] TJ (Next) Tj 0 -12 Td (keep) ' 1 2 (q) \" ET";
  const bytes = enc(src);
  const before = analyze(bytes, ctxOf());
  const sh = before.shows;
  const edits = new Map([[sh[0].index, { remove: new Set([0]) }], [sh[1].index, { remove: new Set([0]) }],
    [sh[3].index, { remove: new Set([0]) }]]);
  const out = rewrite(bytes, before.streams.page.ops, edits, before.streams.page.info);
  const text = dec(out);
  assert.ok(!text.includes("(Hello)") && text.includes("(World)") && !text.includes("(Next)") && !text.includes("(q)"));
  assert.ok(text.includes("(keep) '"));
  const after = analyze(out, ctxOf());
  const kept = (r) => r.shows.flatMap((s) => s.elements.filter((e) => e.kind === "str").map((e) => [dec(e.bytes),
    e.box.map((v) => Math.round(v * 1000) / 1000)]));
  const want = kept(before).filter(([t]) => t === "World" || t === "keep");
  assert.deepEqual(kept(after), want);
  // the rest of the stream is byte for byte the same
  assert.ok(text.startsWith("BT /F1 10 Tf 2 Tc 1 0 0 1 100 700 Tm "));
});

test("without glyph widths a removed operator is made invisible instead", () => {
  const src = "BT /F9 10 Tf 1 0 0 1 100 700 Tm (Hidden) Tj (After) Tj ET";
  const ctx = { font: () => ({ codeBytes: 1, width: () => null, name: "Unknown" }), xobject: () => null };
  const bytes = enc(src);
  const r = analyze(bytes, ctx);
  assert.equal(r.shows[0].widthsKnown, false);
  const out = dec(rewrite(bytes, r.streams.page.ops, new Map([[r.shows[0].index, { remove: new Set([0]) }]]),
    r.streams.page.info));
  assert.ok(out.includes("3 Tr (Hidden) Tj 0 Tr"), out);
});

test("numbers are written short and exact enough", () => {
  assert.equal(formatNumber(-1250), "-1250");
  assert.equal(formatNumber(12.3456789), "12.3457");
  assert.equal(formatNumber(-0.00001), "0");
});

test("bytes above 0x7f in kept strings and elsewhere survive a rewrite", () => {
  const bytesOf = (...parts) => Uint8Array.from(parts.flatMap((p) => (typeof p === "number" ? [p]
    : Array.from(p, (c) => c.charCodeAt(0)))));
  const src = bytesOf("BT /F1 10 Tf 1 0 0 1 10 10 Tm [(drop) -5 (k", 0xe9, ") ] TJ (", 0xff, 0x80, ") Tj ET");
  const r = analyze(src, ctxOf());
  const out = rewrite(src, r.streams.page.ops, new Map([[r.shows[0].index, { remove: new Set([0]) }]]), r.streams.page.info);
  assert.ok(out.includes(0xe9) && out.includes(0xff) && out.includes(0x80));
  assert.ok(!dec(out).includes("(drop)"));
  const after = analyze(out, ctxOf());
  assert.deepEqual(Array.from(after.shows[0].elements.find((e) => e.kind === "str").bytes), [0x6b, 0xe9]);
});
