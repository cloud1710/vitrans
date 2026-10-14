// Command-line parity run (Node): node tests/run_parity.mjs <dump.json | folder of dumps> [--out <folder>]
// Each dump names its source file ("file": a path, or a name next to the dump). Prints one ASCII line per file and
// the totals; --out writes the JS output of the "fake" write-back per file (for the Office open check).
// Corpus dumps hold private text: keep them and any --out folder outside the repository.
import "./dom-node.mjs";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, isAbsolute, basename } from "node:path";
import { runParity, summary } from "./parity.mjs";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : null;
const target = args.find((a, i) => !a.startsWith("--") && (outAt < 0 || i !== outAt + 1));
if (!target) {
  console.log("usage: node tests/run_parity.mjs <dump.json | folder> [--out <folder>]");
  process.exit(2);
}
const files = statSync(target).isDirectory()
  ? readdirSync(target).filter((f) => f.endsWith(".json") && f !== "index.json").sort().map((f) => join(target, f)) : [target];
const total = { items: 0, itemsSame: 0, parts: 0, partsSame: 0, bytesSame: 0, other: 0 };
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, "?");
if (out) mkdirSync(out, { recursive: true });
let n = 0;
for (const f of files) {
  n += 1;
  const dump = JSON.parse(readFileSync(f, "utf8"));
  const src = isAbsolute(dump.file) ? dump.file : join(dirname(f), dump.file);
  const started = Date.now();
  const r = await runParity(dump, new Uint8Array(readFileSync(src)), { keepOutputs: Boolean(out) });
  const label = "file " + n + " (" + basename(f) + ")";
  console.log(ascii(summary({ ...r, file: label })) + ", " + ((Date.now() - started) / 1000).toFixed(1) + " s");
  for (const d of r.parts.diffs.slice(0, 3)) console.log("  part diff: " + ascii(JSON.stringify(d)).slice(0, 400));
  for (const d of r.items.diffs.slice(0, 3)) console.log("  item diff at " + d.index + " (" + ascii(d.python && d.python.location) + ")");
  for (const o of r.other.slice(0, 5)) console.log("  other: " + ascii(o).slice(0, 300));
  total.items += r.items.total;
  total.itemsSame += r.items.same;
  total.parts += r.parts.total;
  total.partsSame += r.parts.same;
  total.bytesSame += r.parts.bytesSame;
  total.other += r.other.length;
  if (out && r.outputs.fake) {
    const ext = dump.kind === "docx" ? ".docx" : ".pptx";
    // a corpus dump names its source by an absolute (private) path: number those outputs instead of naming them
    const name = isAbsolute(dump.file) ? "file" + n + "_js" + ext : basename(dump.file).replace(/\.[^.]+$/, "") + "_js" + ext;
    writeFileSync(join(out, name), r.outputs.fake);
  }
}
console.log("TOTAL items " + total.itemsSame + "/" + total.items + ", parts " + total.partsSame + "/" + total.parts +
  " (bytes " + total.bytesSame + "/" + total.parts + "), other " + total.other);
process.exit(total.itemsSame === total.items && total.partsSame === total.parts && total.other === 0 ? 0 : 1);
