// Photo helpers of the image tool: the EXIF orientation and stored size of a JPEG (browsers turn photos on decode;
// when one did not, the page turns it), the working size (long side <= 2048, never enlarged), and the overlay's
// colours (the median of the pixels around a block = its background; the most different pixels inside it = the
// text colour, or black / white when that does not stand out). No DOM, no network.

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

// the JPEG's segments up to the image data: fn(marker, start of the segment's body, end) -> a value ends the walk
function walkJpeg(b, fn) {
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return undefined;
    while (i + 1 < b.length && b[i + 1] === 0xff) i += 1;  // fill bytes
    const m = b[i + 1];
    if (m === 0xd9 || m === 0xda || i + 4 > b.length) return undefined;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return undefined;
    const v = fn(m, i + 4, i + 2 + len);
    if (v !== undefined) return v;
    i += 2 + len;
  }
  return undefined;
}

/** The EXIF orientation (1-8) of a JPEG's bytes; 1 when there is none. */
export function exifOrientation(bytes) {
  const v = walkJpeg(bytes, (m, s, end) => {
    const b = bytes;
    if (m !== 0xe1 || end - s < 14 || b[s] !== 0x45 || b[s + 1] !== 0x78 || b[s + 2] !== 0x69 || b[s + 3] !== 0x66
      || b[s + 4] !== 0 || b[s + 5] !== 0) return undefined;
    const t = s + 6;
    const le = b[t] === 0x49;
    const r16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
    const r32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
      : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
    if (t + 8 > end || r16(t + 2) !== 42) return 1;
    const ifd = t + r32(t + 4);
    if (ifd + 2 > end) return 1;
    const n = r16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (e + 12 > end) break;
      if (r16(e) === 0x0112) {
        const o = r16(e + 8);
        return o >= 1 && o <= 8 ? o : 1;
      }
    }
    return 1;
  });
  return v || 1;
}

/** The stored size { w, h } of a JPEG (its frame header), or null. */
export function jpegSize(bytes) {
  const v = walkJpeg(bytes, (m, s, end) => (SOF.has(m) && end - s >= 5
    ? { w: (bytes[s + 3] << 8) | bytes[s + 4], h: (bytes[s + 1] << 8) | bytes[s + 2] } : undefined));
  return v || null;
}

/** True when a photo with orientation 5-8 was decoded at its stored (unturned) size: the browser did not turn it. */
export function browserMissedTurn(orientation, decodedW, decodedH, stored) {
  if (!stored || orientation < 5 || stored.w === stored.h) return false;
  return decodedW === stored.w && decodedH === stored.h;
}

/** The working size: the long side at most maxSide, never enlarged. */
export function scaledSize(w, h, maxSide) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** The per-channel median of [r, g, b] samples. */
export function medianColor(samples) {
  if (!samples.length) return [255, 255, 255];
  return [0, 1, 2].map((c) => {
    const v = samples.map((s) => s[c]).sort((a, b) => a - b);
    return v[v.length >> 1];
  });
}

function luminance([r, g, b]) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio of two colours (1-21). */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The text colour for a block: the median of the 15 % of its pixels farthest from the background, unless that
 * contrasts less than 3:1 with it (then black or white, whichever contrasts more). */
export function textColor(bg, inside) {
  const d = (p) => (p[0] - bg[0]) ** 2 + (p[1] - bg[1]) ** 2 + (p[2] - bg[2]) ** 2;
  const far = inside.slice().sort((a, b) => d(b) - d(a)).slice(0, Math.max(1, Math.round(inside.length * 0.15)));
  const c = medianColor(far);
  if (inside.length && contrastRatio(c, bg) >= 3) return c;
  return contrastRatio([0, 0, 0], bg) >= contrastRatio([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255];
}
