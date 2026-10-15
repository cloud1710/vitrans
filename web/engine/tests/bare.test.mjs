// The translation core is runtime-agnostic: it must run inside a Cloudflare Pages Function (workerd: ES modules,
// fetch, crypto.subtle, TextEncoder -- no DOM, no DOMParser, no IndexedDB, no Node built-ins). Two checks:
// - a source scan of the core modules (no node: imports, require, Buffer, process, DOM globals, no OOXML layer);
// - tests/bare_run.mjs loads the core graph into a vm realm that has only workerd-like globals and replays every
//   Translator session of translate.json through core.translateSegments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = new URL("../", import.meta.url);
export const CORE = ["core.js", "translate.js", "qa.js", "tags.js", "vnsyllable.js", "matching.js", "repair.js",
  "packs.js", "tm.js", "report.js", "pyre.js", "py.js", "unitables.js"];
const FORBIDDEN = [
  [/\bfrom\s+["']node:/, "a node: import"], [/\brequire\s*\(/, "require()"], [/\bBuffer\b/, "Buffer"],
  [/\bprocess\./, "process"], [/\bDOMParser\b/, "DOMParser"], [/\bXMLSerializer\b/, "XMLSerializer"],
  [/\bdocument\./, "document"], [/\bwindow\./, "window"], [/\bfrom\s+["']\.\/ooxml\//, "the OOXML layer (client only)"],
  [/\bfrom\s+["']\.\/(?:fit|pipeline)\.js["']/, "a client module"],
];

/** Source without its comments (block comments, then line comments that start a line or follow code). */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/(^|[;{},)\s])\/\/.*$/, "$1")).join("\n");
}

test("core modules use no Node built-ins, DOM globals or client modules", () => {
  for (const f of CORE) {
    const src = code(readFileSync(new URL(f, ENGINE), "utf8"));
    for (const [rx, what] of FORBIDDEN) assert.ok(!rx.test(src), f + " uses " + what);
  }
});

test("the core runs in a bare realm and replays every Translator session through translateSegments", () => {
  const out = execFileSync(process.execPath, ["--experimental-vm-modules", "--no-warnings",
    fileURLToPath(new URL("./bare_run.mjs", import.meta.url))], { encoding: "utf8", timeout: 120000 });
  const r = JSON.parse(out.trim().split("\n").pop());
  assert.equal(r.globals, "undefined,undefined,undefined,undefined,undefined,undefined");
  assert.ok(r.modules >= 10, String(r.modules));
  assert.ok(r.total >= 100, String(r.total));
  assert.equal(r.same, r.total, JSON.stringify(r.problems));
  assert.ok(r.setTotal >= 20, String(r.setTotal));
  assert.equal(r.setSame, r.setTotal, JSON.stringify(r.problems));
});
