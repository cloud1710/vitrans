// Test helper: re-pack a zip as zip64 (sizes and offsets only in zip64 extra fields, zip64 end record + locator).
import { readZip } from "../ooxml/zip.js";

const enc = (s) => new TextEncoder().encode(s);

/** The entries of `src` as a zip64 archive: every central record keeps its sizes and offset in a zip64 extra field
 * (0xFFFFFFFF in the record), then a zip64 end record + locator and a classic end record full of 0xFFFF. */
export function zip64Of(src) {
  const entries = readZip(src).entries;
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc(e.name);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 45, true);
    lv.setUint16(8, e.method, true);
    lv.setUint16(10, e.time, true);
    lv.setUint16(12, e.date, true);
    lv.setUint32(14, e.crc, true);
    lv.setUint32(18, e.raw.length, true);
    lv.setUint32(22, e.usize, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length + 28);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 45, true);
    cv.setUint16(6, 45, true);
    cv.setUint16(10, e.method, true);
    cv.setUint16(12, e.time, true);
    cv.setUint16(14, e.date, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, 0xffffffff, true);
    cv.setUint32(24, 0xffffffff, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 28, true);
    cv.setUint32(42, 0xffffffff, true);
    cd.set(name, 46);
    const x = 46 + name.length;
    cv.setUint16(x, 0x0001, true);
    cv.setUint16(x + 2, 24, true);
    cv.setBigUint64(x + 4, BigInt(e.usize), true);
    cv.setBigUint64(x + 12, BigInt(e.raw.length), true);
    cv.setBigUint64(x + 20, BigInt(offset), true);
    chunks.push(local, e.raw);
    central.push(cd);
    offset += local.length + e.raw.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const tail = new Uint8Array(56 + 20 + 22);
  const tv = new DataView(tail.buffer);
  tv.setUint32(0, 0x06064b50, true);
  tv.setBigUint64(4, 44n, true);
  tv.setUint16(12, 45, true);
  tv.setUint16(14, 45, true);
  tv.setBigUint64(24, BigInt(entries.length), true);
  tv.setBigUint64(32, BigInt(entries.length), true);
  tv.setBigUint64(40, BigInt(cdSize), true);
  tv.setBigUint64(48, BigInt(offset), true);
  tv.setUint32(56, 0x07064b50, true);
  tv.setBigUint64(64, BigInt(offset + cdSize), true);
  tv.setUint32(72, 1, true);
  tv.setUint32(76, 0x06054b50, true);
  tv.setUint16(84, 0xffff, true);
  tv.setUint16(86, 0xffff, true);
  tv.setUint32(88, 0xffffffff, true);
  tv.setUint32(92, 0xffffffff, true);
  const out = new Uint8Array(offset + cdSize + tail.length);
  let p = 0;
  for (const c of [...chunks, ...central, tail]) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
