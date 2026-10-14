// Parity runner: repeat in JavaScript what tools/export_ooxml_fixtures.py recorded from the Python helper for one
// file (item list, then the identity / fake / messy write-backs with fit), and compare. Shared by the Node test, the
// browser check page and the local corpus runner.
import { OoxmlPackage } from "../ooxml/package.js";
import { collectItems } from "../ooxml/document.js";
import { selectParts, partLabels } from "../ooxml/parts.js";
import { apply } from "../ooxml/codec.js";
import { readZip } from "../ooxml/zip.js";
import { fitPptx } from "../fit.js";
import { canonXml, itemSummary } from "./canon.mjs";

async function sha256(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Deep equality for JSON values with object keys in any order. */
export function jsonEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && jsonEqual(a[k], b[k]));
}

function firstDiff(a, b) {
  const x = a.split("\n");
  const y = b.split("\n");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return { line: i + 1, python: x[i] === undefined ? null : x[i], js: y[i] === undefined ? null : y[i] };
  }
  return null;
}

/**
 * Compare the JS engine with a Python dump for the same source bytes.
 * Returns {file, items: {same, total, diffs}, parts: {same, bytesSame, total, diffs}, other: [...], outputs: {scenario:
 * Uint8Array}}; `other` lists differences in names / parts / labels / fixes / fit / untouched entries.
 */
export async function runParity(dump, src, { keepOutputs = false, maxDiffs = 20 } = {}) {
  const opts = dump.options || {};
  const report = { file: dump.file, items: { same: 0, total: 0, diffs: [] },
    parts: { same: 0, bytesSame: 0, total: 0, diffs: [] }, other: [], outputs: {} };
  const pkg = new OoxmlPackage(src);
  if (!same(pkg.names(), dump.names)) report.other.push("names differ");
  const parts = selectParts(pkg, opts);
  if (!same(parts, dump.parts)) report.other.push("selected parts differ: " + JSON.stringify(parts));
  const labels = partLabels(pkg);
  for (const p of dump.parts) {
    if (labels.get(p) !== dump.labels[p]) report.other.push("label of " + p + ": " + labels.get(p) + " != " + dump.labels[p]);
  }
  const got = collectItems(pkg, opts).map(itemSummary);
  report.items.total = Math.max(got.length, dump.items.length);
  for (let i = 0; i < report.items.total; i++) {
    if (jsonEqual(got[i], dump.items[i])) report.items.same += 1;
    else if (report.items.diffs.length < maxDiffs) report.items.diffs.push({ index: i, python: dump.items[i], js: got[i] });
  }
  const srcEntries = readZip(src).entries;
  for (const [name, sc] of Object.entries(dump.scenarios)) {
    const work = new OoxmlPackage(src);
    const items = collectItems(work, opts).filter((i) => i.segment);
    if (items.length !== sc.texts.length) {
      report.other.push(name + ": " + items.length + " segments, Python " + sc.texts.length);
      continue;
    }
    const fixes = [];
    const pairs = [];
    items.forEach((item, n) => {
      fixes.push(apply(item.element, item.segment, sc.texts[n]));
      work.markDirty(item.part);
      pairs.push([item, { text: sc.texts[n] }]);
    });
    const fit = work.kind === "pptx" ? fitPptx(pairs.filter(([i]) => i.part.includes("/slides/"))) : [];
    fixes.forEach((f, n) => {
      if (!same(f, sc.fixes[n])) report.other.push(name + " fixes of segment " + n + ": " + JSON.stringify(f) + " != " + JSON.stringify(sc.fixes[n]));
    });
    if (!jsonEqual(fit, sc.fit)) report.other.push(name + " fit: " + JSON.stringify(fit) + " != " + JSON.stringify(sc.fit));
    const out = work.save();
    if (keepOutputs) report.outputs[name] = out;
    const outPkg = new OoxmlPackage(out);
    const outEntries = readZip(out).entries;
    if (!same(outEntries.map((e) => e.name), srcEntries.map((e) => e.name))) report.other.push(name + ": output entry names differ");
    outEntries.forEach((e, k) => {
      if (work.dirty.has(e.name)) return;
      const s = srcEntries[k];
      if (!s || e.raw.length !== s.raw.length || e.crc !== s.crc || !e.raw.every((b, j) => b === s.raw[j])) {
        report.other.push(name + ": untouched entry changed: " + e.name);
      }
    });
    const names = new Set([...Object.keys(sc.changed), ...work.dirty]);
    for (const part of names) {
      report.parts.total += 1;
      const want = sc.changed[part];
      if (!want || !work.dirty.has(part)) {
        report.parts.diffs.push({ scenario: name, part, problem: want ? "not changed by JS" : "changed only by JS" });
        continue;
      }
      const data = outPkg.bytes(part);
      const canon = canonXml(data);
      if ((await sha256(data)) === want.sha256) report.parts.bytesSame += 1;
      if (canon === want.canon) report.parts.same += 1;
      else if (report.parts.diffs.length < maxDiffs) report.parts.diffs.push({ scenario: name, part, first: firstDiff(want.canon, canon) });
    }
  }
  return report;
}

/** One-line summary of a report. */
export function summary(r) {
  return r.file + ": items " + r.items.same + "/" + r.items.total + ", parts " + r.parts.same + "/" + r.parts.total +
    " (bytes " + r.parts.bytesSame + "/" + r.parts.total + "), other " + r.other.length;
}
