// The tests run on a fresh checkout: no test module may need a package from node_modules (`npm ci` has not run in a
// new clone or worktree). Root cause of the "flaky first run" (2026-10-15): contract.test.mjs and terms_file.test.mjs
// import web/engine/tests/dom-node.mjs, which imported @xmldom/xmldom from web/engine/node_modules -- missing until
// `npm ci`, so the first run of a fresh worktree failed 1-2 files and every later run passed. The XML parser for Node
// is vendored (web/engine/tests/vendor/xmldom-0.9.12). Allowed: relative paths and node: built-ins. The scripts that
// drive Chrome (playwright-core: chrome.mjs, page.mjs, accept_cloud.mjs) are not test modules and keep needing it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIRS = ["web/tests", "web/lab/tests", "web/engine/tests", "tests/functions"];

/** Module specifiers of a source: import / export ... from, side-effect imports, import(), require(); line comments
 * (after a space or at the start of a line) are not read. */
function specifiers(text) {
  const src = text.replace(/(^|\s)\/\/.*$/gm, "$1");
  const out = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*(["'])([^"']+)\1/gm)) out.push(m[2]);
  for (const m of src.matchAll(/^\s*import\s*(["'])([^"']+)\1/gm)) out.push(m[2]);
  for (const m of src.matchAll(/\bimport\s*\(\s*(["'`])([^"'`]+)\1/g)) out.push(m[2]);
  for (const m of src.matchAll(/\brequire\s*\(\s*(["'])([^"']+)\1\s*\)/g)) out.push(m[2]);
  return out;
}

function resolveFile(from, spec) {
  const p = resolve(dirname(from), spec);
  for (const c of [p, p + ".js", p + ".mjs", join(p, "index.js")]) if (existsSync(c) && !c.endsWith("/")) return c;
  return p;
}

test("the specifier scan sees import, export-from, dynamic import and require", () => {
  const src = ["import { a } from \"./a.js\";", "export * from '../b.js';", "import \"pkg-a\";",
    "const c = await import(\"pkg-b\");", "var d = require('./d');", "import {", "  x,", "} from \"pkg-c\";",
    "f(); // import(\"not-a-module\")"].join("\n");
  assert.deepEqual(specifiers(src).sort(), ["../b.js", "./a.js", "./d", "pkg-a", "pkg-b", "pkg-c"]);
});

test("every test module's imports reach only relative files and node: built-ins (no npm ci needed)", () => {
  const roots = [];
  for (const d of DIRS) {
    for (const f of readdirSync(join(REPO, d))) if (f.endsWith(".test.mjs")) roots.push(join(REPO, d, f));
  }
  assert.ok(roots.length >= 40, String(roots.length));
  const seen = new Set();
  const bare = [];
  const stack = [...roots];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(m?js|cjs)$/.test(file) || !existsSync(file)) continue;
    for (const s of specifiers(readFileSync(file, "utf8"))) {
      if (s.startsWith("node:")) continue;
      if (s.startsWith("./") || s.startsWith("../")) stack.push(resolveFile(file, s));
      else bare.push(file.slice(REPO.length + 1).replace(/\\/g, "/") + " imports " + s);
    }
  }
  assert.deepEqual(bare, []);
});
