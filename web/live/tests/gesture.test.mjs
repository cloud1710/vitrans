// live.js: the paths that start the microphone keep the recognizer's start() inside the user's click (iOS Safari
// starts speech recognition only from a gesture): nothing is awaited in start() before startInOrder (which starts the
// microphone synchronously, sources.test.mjs), and the consent dialog's button starts the session itself. Reads the
// module's text (it needs a DOM to run).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../live.js", import.meta.url), "utf8");

function body(name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i >= 0, name);
  const j = src.indexOf("\n}\n", i);
  return src.slice(i, j);
}

test("start(): nothing is awaited before startInOrder (the microphone starts inside it, in the tap)", () => {
  const b = body("start");
  const call = b.indexOf("await startInOrder(");
  assert.ok(call > 0);
  assert.ok(!b.slice(0, call).includes("await "), "an await before the source starts leaves the gesture");
});

test("the consent button starts the session in its click (agreeAndStart -> start)", () => {
  assert.match(src, /\$\("consent-ok"\)\.addEventListener\("click"/);
  assert.match(src, /agreeAndStart\(\{[^}]*begin: start/);
});
