// Port of helper/tests/test_package.py plus the zip layer: read the package, refuse non-OOXML / damaged / bomb
// files, write back with untouched entries byte for byte (here even their compressed bytes, dates and attributes).
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OoxmlPackage, UnsupportedFile } from "../ooxml/package.js";
import { readZip, writeZip, makeEntry, inflateEntry, crc32 } from "../ooxml/zip.js";
import { iterElements } from "../ooxml/lx.js";
import { collectItems } from "../ooxml/document.js";
import { zip64Of } from "./zip64.mjs";
import { W } from "../ooxml/ns.js";

const fixture = (name) => new Uint8Array(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

function rezip(src, change) {
  const entries = readZip(src).entries.map((e) => change(e) || e);
  return writeZip(entries);
}

test("crc32 of a known string", () => {
  assert.equal(crc32(enc("The quick brown fox jumps over the lazy dog")), 0x414fa339);
});

test("kind and byte-identical save", () => {
  const src = fixture("doc.docx");
  const pkg = new OoxmlPackage(src);
  assert.equal(pkg.kind, "docx");
  const root = pkg.root("word/document.xml");
  assert.equal(pkg.root("word/document.xml"), root); // parsed once
  const out = pkg.save();
  const a = readZip(src).entries;
  const b = readZip(out).entries;
  assert.deepEqual(b.map((e) => e.name), a.map((e) => e.name));
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(inflateEntry(b[i]), inflateEntry(a[i]), a[i].name); // nothing dirty -> identical content
    assert.deepEqual(b[i].raw, a[i].raw, a[i].name); // even the compressed bytes are reused
    for (const k of ["method", "crc", "time", "date", "extAttr"]) assert.equal(b[i][k], a[i][k], a[i].name + " " + k);
  }
  assert.equal(new OoxmlPackage(out).kind, "docx");
});

test("dirty part is reserialized", () => {
  const pkg = new OoxmlPackage(fixture("doc.docx"));
  const root = pkg.root("word/document.xml");
  for (const t of iterElements(root, W, "t")) t.textContent = "Xin chao";
  pkg.markDirty("word/document.xml");
  const again = new OoxmlPackage(pkg.save());
  const texts = iterElements(again.root("word/document.xml"), W, "t").map((t) => t.textContent);
  assert.ok(texts.length > 5 && texts.every((t) => t === "Xin chao"));
  assert.ok(dec(again.bytes("word/document.xml")).startsWith("<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n"));
});

test("unsupported inputs", () => {
  assert.throws(() => new OoxmlPackage(enc("not a zip")), UnsupportedFile);
  assert.throws(() => new OoxmlPackage(new Uint8Array(0)), UnsupportedFile);
  const plain = writeZip([makeEntry("readme.txt", enc("hello"))]);
  assert.throws(() => new OoxmlPackage(plain), /neither DOCX nor PPTX/);
});

test("word-style bytes of a parsed but clean part stay as they were, stored entries stay stored", () => {
  const word = enc("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n" +
    "<w:document xmlns:w=\"" + W + "\"><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>");
  const src = rezip(fixture("doc.docx"), (e) => {
    if (e.name === "word/document.xml") return makeEntry(e.name, word, { method: 8, time: e.time, date: e.date });
    if (e.name === "[Content_Types].xml") return makeEntry(e.name, inflateEntry(e), { method: 0, time: e.time, date: e.date });
    return null;
  });
  const pkg = new OoxmlPackage(src);
  pkg.root("word/document.xml");
  const out = readZip(pkg.save()).entries;
  const before = readZip(src).entries;
  for (let i = 0; i < before.length; i++) {
    assert.deepEqual(inflateEntry(out[i]), inflateEntry(before[i]), before[i].name);
    assert.equal(out[i].method, before[i].method, before[i].name);
  }
  assert.equal(out.find((e) => e.name === "[Content_Types].xml").method, 0);
});

test("markDirty requires a parsed root", () => {
  const pkg = new OoxmlPackage(fixture("doc.docx"));
  assert.throws(() => pkg.markDirty("word/document.xml"), /never parsed/);
});

test("a failed save returns nothing and leaves the package usable", () => {
  const pkg = new OoxmlPackage(fixture("doc.docx"));
  const root = pkg.root("word/document.xml");
  pkg.markDirty("word/document.xml");
  const bad = root.ownerDocument.createElementNS("urn:x", "bad");
  bad.setAttributeNS("urn:y", "k", "v"); // namespaced attribute without a prefix: the serializer refuses it
  root.appendChild(bad);
  assert.throws(() => pkg.save());
  root.removeChild(bad);
  assert.ok(pkg.save().length > 1000);
});

test("a comment before the root is kept", () => {
  const xml = enc("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<!-- keep -->\n" +
    "<w:document xmlns:w=\"" + W + "\"/>");
  const src = rezip(fixture("doc.docx"), (e) => (e.name === "word/document.xml" ?
    makeEntry(e.name, xml, { method: 8 }) : null));
  const pkg = new OoxmlPackage(src);
  pkg.root("word/document.xml");
  pkg.markDirty("word/document.xml");
  const out = new OoxmlPackage(pkg.save());
  assert.match(dec(out.bytes("word/document.xml")), /<!-- keep -->/);
});

test("corrupt deflate data is unsupported", () => {
  const src = fixture("doc.docx");
  const entry = readZip(src).entries.find((e) => e.name === "word/document.xml");
  assert.equal(entry.method, 8);
  const data = src.slice();
  const start = entry.dataOffset;
  for (let k = start; k < start + 8; k++) data[k] ^= 0xff;
  assert.throws(() => new OoxmlPackage(data), UnsupportedFile);
});

test("a wrong CRC is unsupported", () => {
  const src = rezip(fixture("doc.docx"), (e) => (e.name === "word/styles.xml" ? { ...e, crc: (e.crc ^ 1) >>> 0 } : null));
  assert.throws(() => new OoxmlPackage(src), UnsupportedFile);
});

function declareSize(bytes, name, size) {
  const data = bytes.slice();
  const view = new DataView(data.buffer);
  const want = enc(name);
  for (let pos = 0; pos + 46 < data.length; pos++) {
    if (view.getUint32(pos, true) !== 0x02014b50) continue;
    const nlen = view.getUint16(pos + 28, true);
    const got = data.subarray(pos + 46, pos + 46 + nlen);
    if (got.length === want.length && got.every((b, i) => b === want[i])) {
      view.setUint32(pos + 24, size, true);
      return data;
    }
  }
  throw new Error("entry not found");
}

test("an entry declared over 512 MB is refused", () => {
  const src = declareSize(fixture("doc.docx"), "word/document.xml", 600 * 1024 * 1024);
  assert.throws(() => new OoxmlPackage(src), /too large/);
});

test("a total over 2 GB is refused", () => {
  let src = fixture("doc.docx");
  for (const e of readZip(src).entries.slice(0, 5)) src = declareSize(src, e.name, 500 * 1024 * 1024);
  assert.throws(() => new OoxmlPackage(src), /too large/);
});

test("a zip64 package (sizes, offsets and end record in zip64 fields) reads like the original", () => {
  const src = fixture("doc.docx");
  const z = zip64Of(src);
  const pkg = new OoxmlPackage(z);
  const orig = new OoxmlPackage(src);
  assert.deepEqual(pkg.names(), orig.names());
  for (const e of readZip(z).entries) assert.deepEqual(inflateEntry(e), inflateEntry(readZip(src).entries.find((s) => s.name === e.name)));
  assert.deepEqual(readZip(z).entries.map((e) => [e.usize, e.csize]), readZip(src).entries.map((e) => [e.usize, e.raw.length]));
  assert.equal(collectItems(pkg).length, collectItems(orig).length);
  const out = readZip(pkg.save()).entries; // written back as a classic zip
  assert.deepEqual(out.map((e) => e.name), orig.names());
});

test("saving 65,535 or more parts (zip64 output) is refused with a clear UnsupportedFile", () => {
  const pkg = new OoxmlPackage(fixture("doc.docx"));
  const extra = makeEntry("customXml/pad.bin", new Uint8Array(0));
  while (pkg.entries.length < 0xffff) pkg.entries.push({ ...extra, name: "pad/" + pkg.entries.length + ".bin" });
  assert.throws(() => pkg.save(), (err) => err instanceof UnsupportedFile && /65,534 parts/.test(err.message));
  pkg.entries.length = 0xfffe;
  assert.ok(pkg.save().length > 0); // 65,534 entries still fit a classic zip
});

test("an encrypted entry is unsupported", () => {
  const src = rezip(fixture("doc.docx"), (e) => (e.name === "word/styles.xml" ? { ...e, flags: e.flags | 1 } : null));
  assert.throws(() => new OoxmlPackage(src), UnsupportedFile);
});

test("zip with leading data (self-extractor style) still reads", () => {
  const src = fixture("deck.pptx");
  const joined = new Uint8Array(src.length + 7);
  joined.set(enc("PREFIX!"), 0);
  joined.set(src, 7);
  const pkg = new OoxmlPackage(joined);
  assert.equal(pkg.kind, "pptx");
  assert.ok(pkg.root("ppt/presentation.xml"));
});

test("names keep the zip order and a non-UTF-8 name decodes as cp437", () => {
  const e = makeEntry("ppt/media/x.bin", enc("x"));
  e.nameBytes = Uint8Array.of(0x61, 0x82, 0x2e, 0x62, 0x69, 0x6e); // "a\u{e9}.bin" in cp437, no UTF-8 flag
  e.flags = 0;
  const z = readZip(writeZip([e]));
  assert.equal(z.entries[0].name, "a\u{e9}.bin");
});
