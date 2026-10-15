// Every vendored file of the PDF path is the one web/pdf/vendor/README.md names (sha256), and its licence ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { PDF_DIR } from "./node_libs.mjs";

const readme = readFileSync(join(PDF_DIR, "vendor", "README.md"), "utf8");

test("each vendored file and font matches the sha256 in the README", () => {
  const rows = [...readme.matchAll(/^\| ([\w.\-/]+\.(?:js|ttf)) \|(?:.*\|)? ([0-9a-f]{64}) \|$/gm)];
  assert.equal(rows.length, 14);
  for (const [, file, sha] of rows) {
    const path = file.endsWith(".ttf") ? join(PDF_DIR, "fonts", file) : join(PDF_DIR, "vendor", file);
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), sha, file);
  }
});

test("the licences ship with the files", () => {
  for (const f of ["vendor/pdfjs-6.3.289/LICENSE", "vendor/pdfjs-6.3.289/wasm/LICENSE_JBIG2",
    "vendor/pdfjs-6.3.289/wasm/LICENSE_OPENJPEG", "vendor/pdf-lib-1.17.1/LICENSE.md", "fonts/OFL.txt"]) {
    assert.ok(existsSync(join(PDF_DIR, f)), f);
  }
});
