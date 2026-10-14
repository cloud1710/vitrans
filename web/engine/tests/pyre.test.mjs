// pyre.js behaviour that has no Python counterpart to compare with (the parity is tests/fixtures/engine/pyre.json):
// a re.I class range wider than 0x400 characters is refused rather than matched approximately.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, PyReError } from "../pyre.js";

test("a wide class range under re.I is refused, a narrow one works", () => {
  assert.throws(() => compile("[\u0100-\u2000]", "i"), PyReError);
  assert.throws(() => compile("(?i:[a-\u2000])"), PyReError);
  assert.equal(compile("[a-z\u00e0-\u00ff]+", "i").search("XY\u00c0").group(0), "XY\u00c0");
  assert.equal(compile("[\u0100-\u2000]").search("a\u0101").group(0), "\u0101"); // no re.I: any width
});
