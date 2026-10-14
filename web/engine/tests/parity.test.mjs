// Parity with the Python helper on the committed synthetic fixtures (tools/export_ooxml_fixtures.py fixtures):
// identical item lists (location, skip reason, tagged text, spans, fixed elements, locked text) and, for the
// identity / fake / messy write-backs, identical fixes, fit changes and changed-part XML (canonical form; the bytes
// are expected to match too).
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runParity, summary } from "./parity.mjs";

const dir = new URL("./fixtures/", import.meta.url);
const dumps = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").sort();

test("there are fixtures", () => {
  assert.ok(dumps.length >= 20, String(dumps.length));
});

for (const name of dumps) {
  test("parity: " + name.replace(/\.json$/, ""), async () => {
    const dump = JSON.parse(readFileSync(new URL(name, dir), "utf8"));
    const src = new Uint8Array(readFileSync(new URL(dump.file, dir)));
    const r = await runParity(dump, src);
    const detail = JSON.stringify({ items: r.items.diffs.slice(0, 2), parts: r.parts.diffs.slice(0, 2), other: r.other.slice(0, 5) },
      null, 1);
    assert.equal(r.items.same, r.items.total, summary(r) + "\n" + detail);
    assert.equal(r.parts.same, r.parts.total, summary(r) + "\n" + detail);
    assert.deepEqual(r.other, [], summary(r) + "\n" + detail);
    assert.equal(r.parts.bytesSame, r.parts.total, summary(r) + " (canonical XML equal, bytes differ)");
  });
}
