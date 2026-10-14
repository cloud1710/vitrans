// M2 parity with the Python helper under Node (tests/chrome.mjs runs the same checks in real Chrome, with the
// IndexedDB translation memory): the rows of tests/engine_checks.mjs, one test each, over the fixtures of
// tools/export_engine_fixtures.py.
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { engineChecks } from "./engine_checks.mjs";
import { decodeText } from "../packs.js";
import { MemoryTM } from "../tm.js";

const load = async (name) => JSON.parse(readFileSync(new URL("./fixtures/engine/" + name, import.meta.url), "utf8"));

// Packs: the committed, non-draft packs of the repository and the synthetic ones of the fixtures.
const REPO_PACKS = new URL("../../../packs/", import.meta.url);
const SYNTH = new URL("./fixtures/engine/packs/", import.meta.url);
const ALLOWED = new Set(["_style", "pathology"]);
export const nodeSource = {
  async read(where, pid, file) {
    if (where === "repo" && !ALLOWED.has(pid)) throw new Error("the tests read only the committed packs " + [...ALLOWED]);
    try {
      return decodeText(readFileSync(new URL(pid + "/" + file, where === "repo" ? REPO_PACKS : SYNTH)));
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },
};

const readFixture = async (name) => new Uint8Array(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
const rows = await engineChecks({ load, source: nodeSource, makeTm: async () => new MemoryTM(),
  disposeTm: async (tm) => tm.close(), readFixture });

for (const area of [...new Set(rows.map((r) => r.area))]) {
  test(area + ": there are cases", () => assert.ok(rows.some((r) => r.area === area)));
}
for (const row of rows) {
  test(row.area + " | " + row.name, () => assert.ok(row.ok, row.detail));
}
