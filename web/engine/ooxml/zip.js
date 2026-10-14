// Minimal ZIP container for OOXML packages, following Python's zipfile where the helper relies on it: the end record
// is searched in the last 64 KiB, leading data before the archive is allowed (offsets corrected by the difference),
// names are UTF-8 when flag 0x800 is set and cp437 otherwise, zip64 sizes are read, an encrypted or patched entry or a
// method other than stored / deflated is refused, and the CRC of every entry is checked.
// Writing reuses the compressed bytes of untouched entries as they are (with their method, CRC, date and attributes),
// so only changed parts are deflated again (fflate 0.8.2 does the DEFLATE, vendored under web/engine/vendor/).
import { deflateSync, inflateSync } from "../vendor/fflate-0.8.2/browser.js";

export class ZipError extends Error {}

const CP437 = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7, 0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5,
  0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9, 0x00ff, 0x00d6, 0x00dc, 0x00a2, 0x00a3, 0x00a5, 0x20a7, 0x0192,
  0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba, 0x00bf, 0x2310, 0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb,
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510,
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f, 0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567,
  0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b, 0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580,
  0x03b1, 0x00df, 0x0393, 0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4, 0x03a6, 0x0398, 0x03a9, 0x03b4, 0x221e, 0x03c6, 0x03b5, 0x2229,
  0x2261, 0x00b1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00f7, 0x2248, 0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2, 0x25a0, 0x00a0,
];

let CRC_TABLE = null;

export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeName(bytes, flags) {
  if (flags & 0x800) return new TextDecoder("utf-8").decode(bytes);
  let s = "";
  for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : String.fromCharCode(CP437[b - 0x80]);
  return s;
}

function u64(view, pos) {
  const lo = view.getUint32(pos, true);
  const hi = view.getUint32(pos + 4, true);
  return hi * 0x100000000 + lo;
}

function findEnd(bytes, view) {
  const n = bytes.length;
  if (n >= 22 && view.getUint32(n - 22, true) === 0x06054b50 && view.getUint16(n - 2, true) === 0) return n - 22;
  const min = Math.max(n - 65536 - 22, 0);
  for (let pos = n - 22; pos >= min; pos--) {
    if (bytes[pos] === 0x50 && view.getUint32(pos, true) === 0x06054b50) return pos;
  }
  return -1;
}

/** Parse the central directory: {entries: [...]} with each entry's compressed bytes as a view on `bytes`. */
export function readZip(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(bytes, view);
  if (end < 0) throw new ZipError("File is not a zip file");
  let sizeCd = view.getUint32(end + 12, true);
  let offsetCd = view.getUint32(end + 16, true);
  let location = end; // where the central directory ends (Python: the end record, minus the zip64 records)
  if (end >= 20 && view.getUint32(end - 20, true) === 0x07064b50) { // zip64 end of central directory locator
    const rec = end - 20 - 56;
    if (rec >= 0 && view.getUint32(rec, true) === 0x06064b50) {
      sizeCd = u64(view, rec + 40);
      offsetCd = u64(view, rec + 48);
      location = rec;
    }
  }
  const concat = location - sizeCd - offsetCd;
  let pos = offsetCd + concat;
  const stop = pos + sizeCd;
  if (pos < 0 || stop > bytes.length) throw new ZipError("Bad offset for central directory");
  const entries = [];
  while (pos < stop) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) throw new ZipError("Bad magic number for central directory");
    const flags = view.getUint16(pos + 8, true);
    const nlen = view.getUint16(pos + 28, true);
    const xlen = view.getUint16(pos + 30, true);
    const clen = view.getUint16(pos + 32, true);
    const nameBytes = bytes.slice(pos + 46, pos + 46 + nlen);
    const e = {
      name: decodeName(nameBytes, flags), nameBytes, madeBy: view.getUint16(pos + 4, true),
      versionNeeded: view.getUint16(pos + 6, true), flags, method: view.getUint16(pos + 10, true),
      time: view.getUint16(pos + 12, true), date: view.getUint16(pos + 14, true), crc: view.getUint32(pos + 16, true),
      csize: view.getUint32(pos + 20, true), usize: view.getUint32(pos + 24, true),
      extAttr: view.getUint32(pos + 38, true), offset: view.getUint32(pos + 42, true),
    };
    // zip64 extra field: values that are 0xFFFFFFFF in the record, in this order
    let x = pos + 46 + nlen;
    const xend = x + xlen;
    while (x + 4 <= xend) {
      const id = view.getUint16(x, true);
      const size = view.getUint16(x + 2, true);
      if (id === 0x0001) {
        let k = x + 4;
        if (e.usize === 0xffffffff) { e.usize = u64(view, k); k += 8; }
        if (e.csize === 0xffffffff) { e.csize = u64(view, k); k += 8; }
        if (e.offset === 0xffffffff) { e.offset = u64(view, k); k += 8; }
      }
      x += 4 + size;
    }
    e.offset += concat;
    entries.push(e);
    pos += 46 + nlen + xlen + clen;
  }
  for (const e of entries) {
    const h = e.offset;
    if (h < 0 || h + 30 > bytes.length || view.getUint32(h, true) !== 0x04034b50) {
      e.error = "Bad magic number for file header";
      e.raw = new Uint8Array(0);
      continue;
    }
    const lnlen = view.getUint16(h + 26, true);
    const lxlen = view.getUint16(h + 28, true);
    const lname = decodeName(bytes.subarray(h + 30, h + 30 + lnlen), e.flags);
    if (lname !== e.name) e.error = "File name in directory and header differ";
    e.dataOffset = h + 30 + lnlen + lxlen;
    if (e.dataOffset + e.csize > bytes.length) e.error = "Truncated file";
    e.raw = bytes.subarray(e.dataOffset, Math.min(e.dataOffset + e.csize, bytes.length));
  }
  return { entries };
}

/** Uncompressed bytes of an entry; throws ZipError (encrypted, unsupported method, damaged data, bad CRC). */
export function inflateEntry(e) {
  if (e.error) throw new ZipError(e.error);
  if (e.flags & 0x40) throw new ZipError("strong encryption (flag bit 6)");
  if (e.flags & 0x20) throw new ZipError("compressed patched data (flag bit 5) is not supported");
  if (e.flags & 0x1) throw new ZipError("File is encrypted, password required for extraction");
  let data;
  if (e.method === 0) {
    data = e.raw.subarray(0, Math.min(e.raw.length, e.usize));
  } else if (e.method === 8) {
    try {
      data = inflateSync(e.raw, { out: new Uint8Array(e.usize) });
    } catch (err) {
      throw new ZipError("Error -3 while decompressing data: " + (err && err.message));
    }
  } else {
    throw new ZipError("That compression method is not supported");
  }
  if (data.length !== e.usize || crc32(data) !== e.crc) throw new ZipError("Bad CRC-32 for file " + JSON.stringify(e.name));
  return data;
}

function dosDefault() {
  return { time: 0, date: (0 << 9) | (1 << 5) | 1 }; // 1980-01-01 00:00:00, as Python's ZipInfo default
}

/** A new entry for `data` (deflated unless method 0). */
export function makeEntry(name, data, opts = {}) {
  const method = opts.method === undefined ? 8 : opts.method;
  const d = dosDefault();
  const raw = method === 8 ? deflateSync(data, { level: 6 }) : data;
  return {
    name, nameBytes: null, madeBy: opts.madeBy === undefined ? 20 : opts.madeBy, versionNeeded: 20,
    flags: 0, method, time: opts.time === undefined ? d.time : opts.time,
    date: opts.date === undefined ? d.date : opts.date, crc: crc32(data), csize: raw.length, usize: data.length,
    extAttr: opts.extAttr || 0, raw,
  };
}

function nameField(e) {
  if (e.nameBytes) return { bytes: e.nameBytes, flags: e.flags };
  const ascii = /^[\x00-\x7f]*$/.test(e.name);
  return { bytes: new TextEncoder().encode(e.name), flags: ascii ? e.flags & ~0x800 : e.flags | 0x800 };
}

export const ZIP64_NEEDED = "zip64 output is not supported (65,535 or more entries, or 4 GB)";

/** Write entries (in order) as a new zip: local headers + data, central directory, end record. No zip64: 65,535 or
 * more entries (Python switches to zip64 there) or 4 GB throw ZipError(ZIP64_NEEDED). */
export function writeZip(entries) {
  if (entries.length >= 0xffff) throw new ZipError(ZIP64_NEEDED);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    if (e.raw.length > 0xfffffffe || e.usize > 0xfffffffe || offset > 0xfffffffe) throw new ZipError(ZIP64_NEEDED);
    const { bytes: nb, flags: f } = nameField(e);
    const flags = f & ~0x8; // sizes are in the header: no data descriptor
    const local = new Uint8Array(30 + nb.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed: deflate (no zip64 records are written), as Python writes
    lv.setUint16(6, flags, true);
    lv.setUint16(8, e.method, true);
    lv.setUint16(10, e.time, true);
    lv.setUint16(12, e.date, true);
    lv.setUint32(14, e.crc, true);
    lv.setUint32(18, e.raw.length, true);
    lv.setUint32(22, e.usize, true);
    lv.setUint16(26, nb.length, true);
    lv.setUint16(28, 0, true);
    local.set(nb, 30);
    const cd = new Uint8Array(46 + nb.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, e.madeBy === undefined ? 20 : e.madeBy, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, e.method, true);
    cv.setUint16(12, e.time, true);
    cv.setUint16(14, e.date, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.raw.length, true);
    cv.setUint32(24, e.usize, true);
    cv.setUint16(28, nb.length, true);
    cv.setUint32(38, e.extAttr >>> 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nb, 46);
    parts.push(local, e.raw);
    central.push(cd);
    offset += local.length + e.raw.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const endRec = new Uint8Array(22);
  const ev = new DataView(endRec.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const chunk of parts) { out.set(chunk, p); p += chunk.length; }
  for (const chunk of central) { out.set(chunk, p); p += chunk.length; }
  out.set(endRec, p);
  return out;
}
