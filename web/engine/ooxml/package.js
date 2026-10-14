// Read an OOXML zip, parse parts lazily, write back with untouched entries byte-identical
// (port of helper/vitranslate/ooxml/package.py). Input: the file's bytes; output of save(): a new Uint8Array, built
// completely before it is returned (nothing partial on failure).
import { deflateSync } from "../vendor/fflate-0.8.2/browser.js";
import { crc32, readZip, inflateEntry, writeZip, ZipError } from "./zip.js";
import { parseXml, serializeXml } from "./xml.js";

export const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

/** The input is not a DOCX / PPTX package (or it is encrypted). */
export class UnsupportedFile extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedFile";
    this.code = "unsupported_file"; // the helper's job error code for the page
  }
}

const DAMAGED = "not an Office Open XML package (encrypted or damaged file?)";

function keepsBytes(name) {
  return name.endsWith(".xml") || name.endsWith(".rels");
}

export class OoxmlPackage {
  constructor(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let zip;
    try {
      zip = readZip(bytes);
    } catch (err) {
      if (err instanceof ZipError || err instanceof RangeError) throw new UnsupportedFile(DAMAGED);
      throw err;
    }
    this.entries = zip.entries;
    // declared sizes are checked before anything is inflated (zip bomb guard)
    const total = this.entries.reduce((s, e) => s + e.usize, 0);
    if (this.entries.some((e) => e.usize > MAX_ENTRY_BYTES) || total > MAX_TOTAL_BYTES) {
      throw new UnsupportedFile("file too large or a zip bomb");
    }
    this._byName = new Map();
    this._bytes = new Map();
    for (const e of this.entries) {
      let data;
      try {
        data = inflateEntry(e); // every entry is checked (CRC), as zipfile reads them all
      } catch (err) {
        if (err instanceof ZipError) throw new UnsupportedFile(DAMAGED);
        throw err;
      }
      this._byName.set(e.name, e);
      if (keepsBytes(e.name)) this._bytes.set(e.name, data);
      else this._bytes.delete(e.name);
    }
    if (this._byName.has("word/document.xml")) this.kind = "docx";
    else if (this._byName.has("ppt/presentation.xml")) this.kind = "pptx";
    else throw new UnsupportedFile("package is neither DOCX nor PPTX");
    this._docs = new Map();
    this.dirty = new Set();
  }

  names() {
    return this.entries.map((e) => e.name);
  }

  has(name) {
    return this._byName.has(name);
  }

  /** Uncompressed bytes of a part (pkg.raw[name]); undefined when there is no such part. */
  bytes(name) {
    if (this._bytes.has(name)) return this._bytes.get(name);
    const e = this._byName.get(name);
    return e ? inflateEntry(e) : undefined;
  }

  /** Root element of an XML part, parsed once. */
  root(name) {
    if (!this._docs.has(name)) {
      const data = this.bytes(name);
      if (data === undefined) throw new Error("no such part: " + name);
      this._docs.set(name, parseXml(data));
    }
    return this._docs.get(name).documentElement;
  }

  markDirty(name) {
    if (!this._docs.has(name)) throw new Error("part was never parsed with root(): " + name);
    this.dirty.add(name);
  }

  /** The package as a new zip (Uint8Array): dirty parts serialized, everything else copied byte for byte. */
  save() {
    const out = this.entries.map((e) => {
      if (!this.dirty.has(e.name)) return e;
      const data = serializeXml(this._docs.get(e.name));
      const raw = e.method === 0 ? data : deflateSync(data, { level: 6 });
      return { ...e, crc: crc32(data), csize: raw.length, usize: data.length, raw, method: e.method === 0 ? 0 : 8 };
    });
    try {
      return writeZip(out);
    } catch (err) {
      if (err instanceof ZipError) {
        throw new UnsupportedFile("the translated file cannot be written: more than 65,534 parts or 4 GB needs " +
          "zip64, which is not supported");
      }
      throw err;
    }
  }
}
