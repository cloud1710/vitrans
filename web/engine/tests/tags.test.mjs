// The part of tags.py the codec needs (M1): the token pattern, ids() and strip_tags(). The rest is M2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokens, ids, stripTags } from "../tags.js";

test("ids lists g ids in opening order and x ids in order", () => {
  assert.deepEqual(ids("a <g2>b</g2> <x3/><g1>c</g1><x1/>"), [[2, 1], [3, 1]]);
  assert.deepEqual(ids("plain"), [[], []]);
});

test("token numbers are Python ints: leading zeros and Unicode digits", () => {
  assert.deepEqual(ids("<g01>a</g01><x\u{663}/>"), [[1], [3]]);
});

test("strip_tags removes tokens, keep_x keeps placeholders", () => {
  assert.equal(stripTags("In <g1>NF2</g1> x<x1/>y"), "In NF2 xy");
  assert.equal(stripTags("In <g1>NF2</g1> x<x1/>y", true), "In NF2 x<x1/>y");
  assert.equal(stripTags("<G1>a</ g1>"), "<G1>a</ g1>"); // loose variants are not tokens
});

test("tokens() yields the match parts like TOKEN_RE.finditer", () => {
  const got = [...tokens("a<g1>b</g1><x2/>")].map((m) => [m.index, m.close, m.g, m.x, m.text]);
  assert.deepEqual(got, [[1, false, 1, null, "<g1>"], [6, true, 1, null, "</g1>"], [11, false, null, 2, "<x2/>"]]);
});
