// The unit-level checks of tests/checks.mjs under Node / xmldom (tests/chrome.mjs runs them in real Chrome).
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runChecks } from "./checks.mjs";

const cases = JSON.parse(readFileSync(new URL("./lxml_cases.json", import.meta.url), "utf8"));
const docx = new Uint8Array(readFileSync(new URL("./fixtures/doc.docx", import.meta.url)));

for (const row of runChecks(cases, docx)) {
  test(row.name, () => {
    assert.ok(row.ok, row.detail);
  });
}
