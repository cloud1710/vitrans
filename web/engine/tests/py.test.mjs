// Python string semantics the port depends on (str.isspace / strip / split / isalpha, len in code points, int(),
// float(), round()), so JavaScript decisions match the helper's character for character.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSpace, pyStrip, pyRstrip, pySplit, hasAlpha, isAlpha, cpLen, pyInt, pyFloat, pyRound, pyRoundN,
  pyLower, nonLatin } from "../py.js";

test("isSpace follows str.isspace, not String.prototype.trim", () => {
  for (const c of [" ", "\t", "\n", "\x0b", "\x0c", "\r", "\x1c", "\x1f", "\x85", "\xa0", "\u{2003}", "\u{2028}",
    "\u{3000}"]) assert.equal(isSpace(c), true, c.codePointAt(0).toString(16));
  for (const c of ["\u{feff}", "\u{200b}", "a", "", "\u{180e}"]) assert.equal(isSpace(c), false);
});

test("strip / split use Python whitespace", () => {
  assert.equal(pyStrip("\u{feff} a \x85"), "\u{feff} a");
  assert.equal(pyStrip("\x1c x \x1f"), "x");
  assert.equal(pyStrip("  "), "");
  assert.equal(pyStrip("::a::", ":"), "a");
  assert.equal(pyRstrip("References::", ":"), "References");
  assert.deepEqual(pySplit(" a\u{a0}b \x85c "), ["a", "b", "c"]);
  assert.deepEqual(pySplit("   "), []);
});

test("isalpha is any letter category, per code point", () => {
  assert.equal(hasAlpha("12 3"), false);
  assert.equal(hasAlpha("4\u{2b9}"), true); // modifier letter prime is Lm: still isalpha
  assert.equal(isAlpha("\u{1d6fc}"), true);
  assert.equal(isAlpha("1"), false);
});

test("cpLen counts code points like len()", () => {
  assert.equal(cpLen("a\u{1d6fc}b"), 3);
  assert.equal(cpLen("\u{d800}x"), 2);
  assert.equal(cpLen(""), 0);
});

test("int() accepts Unicode decimal digits, signs, underscores and surrounding whitespace", () => {
  assert.equal(pyInt("90000"), 90000);
  assert.equal(pyInt(" -12 "), -12);
  assert.equal(pyInt("\u{663}\u{660}"), 30); // Arabic-Indic digits
  assert.equal(pyInt("1_000"), 1000);
  for (const bad of ["", "1.5", "1__0", "_1", "abc", "1e3", "62.5%"]) assert.throws(() => pyInt(bad), /ValueError/);
});

test("float() accepts what Python accepts", () => {
  assert.equal(pyFloat("62.5"), 62.5);
  assert.equal(pyFloat(" 1e2 "), 100);
  assert.equal(pyFloat(".5"), 0.5);
  assert.equal(pyFloat("5."), 5);
  assert.equal(pyFloat("1_0.5"), 10.5);
  assert.equal(pyFloat("-inf"), -Infinity);
  assert.ok(Number.isNaN(pyFloat("nan")));
  for (const bad of ["", ".", "1..2", "abc", "0x10", "1e"]) assert.throws(() => pyFloat(bad), /ValueError/);
});

test("round() is half to even on the exact binary value", () => {
  assert.equal(pyRound(2.5), 2);
  assert.equal(pyRound(3.5), 4);
  assert.equal(pyRound(72500.5), 72500);
  assert.equal(pyRound(0.49999999999999994), 0);
  assert.equal(pyRoundN(0.125, 2), 0.12);
  assert.equal(pyRoundN(0.375, 2), 0.38);
  assert.equal(pyRoundN(1.005, 2), 1);
  assert.equal(pyRoundN(0.7302967433402214, 2), 0.73);
});

test("lower() and the non-Latin letter test", () => {
  assert.equal(pyLower("T\u{c0}I LI\u{1ec6}U"), "t\u{e0}i li\u{1ec7}u");
  assert.equal(nonLatin("Chinese \u{8fd9}"), true);
  assert.equal(nonLatin("34\u{3b2}E12"), false); // Greek is notation
  assert.equal(nonLatin("5 \u{b5}m"), false); // micro sign folds to Greek mu
  assert.equal(nonLatin("3\u{2b9}"), false); // modifier letter
  assert.equal(nonLatin("\u{ff21}\u{ff22}"), false); // fullwidth Latin folds to ASCII
  assert.equal(nonLatin("\u{2132}"), true); // TURNED CAPITAL F: Latin script, but not named LATIN
  assert.equal(nonLatin("\u{2183}"), true);
});
