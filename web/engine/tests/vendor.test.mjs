// The page has a strict CSP (default-src 'self'): engine modules may only import relative paths, and fflate is the
// vendored, checksummed ESM build (identical to npm / cdn.jsdelivr.net fflate@0.8.2 esm/browser.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const ENGINE = new URL("../", import.meta.url);
const FFLATE_SHA256 = "8cc1f687e0159e977addb6b85e274dbd11e622cf151f4fcb7b85d49622ea43e7";

/** Module specifiers of a source: static import / export ... from, side-effect imports and dynamic import(). */
function specifiers(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*(["'])([^"']+)\1/gm)) out.push(m[2]);
  for (const m of src.matchAll(/^\s*import\s*(["'])([^"']+)\1/gm)) out.push(m[2]); // import "x";
  for (const m of src.matchAll(/\bimport\s*\(\s*(["'`])([^"'`]+)\1/g)) out.push(m[2]); // import("x")
  return out;
}

test("vendored fflate 0.8.2 matches the published build and ships its licence", () => {
  const code = readFileSync(new URL("vendor/fflate-0.8.2/browser.js", ENGINE));
  assert.equal(createHash("sha256").update(code).digest("hex"), FFLATE_SHA256);
  const licence = readFileSync(new URL("vendor/fflate-0.8.2/LICENSE", ENGINE), "utf8");
  assert.match(licence, /^MIT License/);
  const readme = readFileSync(new URL("vendor/fflate-0.8.2/README.md", ENGINE), "utf8");
  assert.ok(readme.includes(FFLATE_SHA256), "the README records the sha256");
});

test("the specifier scan sees every import form", () => {
  const src = [
    "import { a } from \"./a.js\";",
    "import * as b from '../b.js';",
    "export { c } from \"./c.js\";",
    "export * from \"./d.js\";",
    "import \"fflate\";",
    "  import 'side-effect';",
    "const m = await import(\"dyn\");",
    "const n = import( './dyn2.js' );",
    "import {",
    "  x,",
    "} from \"multi\";",
  ].join("\n");
  assert.deepEqual(specifiers(src).sort(), ["../b.js", "./a.js", "./c.js", "./d.js", "./dyn2.js", "dyn", "fflate", "multi",
    "side-effect"]);
});

test("engine modules import relative paths only (no bare specifiers, no import map)", () => {
  const files = [];
  for (const dir of ["", "ooxml/"]) {
    for (const f of readdirSync(new URL(dir, ENGINE))) if (f.endsWith(".js")) files.push(dir + f);
  }
  assert.ok(files.length >= 10, String(files.length));
  for (const f of files) {
    for (const s of specifiers(readFileSync(new URL(f, ENGINE), "utf8"))) {
      assert.ok(s.startsWith("./") || s.startsWith("../"), f + " imports " + s);
    }
  }
});
