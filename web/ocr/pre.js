// Inputs of the PP-OCRv5 models from RGBA pixels, as PaddleOCR / PaddleX prepare them (no OpenCV, no canvas: the
// same numbers in every browser and in Node).
// Detection (DetResizeForTest limit_type "min", limit_side_len 64, plus a maximum side): resized so the short side is
// at least 64 and the long side at most maxSide, each side rounded to a multiple of 32 (at least 32); pixels in BGR
// order, (v / 255 - mean) / std with ImageNet's mean [0.485, 0.456, 0.406] and std [0.229, 0.224, 0.225] taken in
// that order (PaddleOCR applies them to BGR); CHW float32.
// Recognition (get_rotate_crop_image + OCRReisizeNormImg, rec_image_shape [3, 48, 320], batches of 6 sorted by width
// ratio): each box cut out along its rectangle (width = int(longer of the two horizontal edges), height likewise; a
// crop with h / w >= 1.5 is turned 90 degrees counter-clockwise), resized to height 48 with width ceil(48 * w / h)
// (bilinear, half-pixel centres, border replicated), (v / 255 - 0.5) / 0.5 in BGR order, zero-padded to the batch
// width int(48 * max(320 / 48, the batch's widest ratio)). No DOM, no network.

export const REC_H = 48;
export const REC_MIN_RATIO = 320 / 48;
export const REC_BATCH = 6;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** The detection input size for a w x h image: { w, h }. */
export function detSize(w, h, maxSide) {
  let ratio = 1;
  if (Math.min(w, h) < 64) ratio = 64 / Math.min(w, h);
  if (Math.max(w, h) * ratio > maxSide) ratio = maxSide / Math.max(w, h);
  const r32 = (v) => Math.max(roundHalfEven((v * ratio) / 32) * 32, 32);
  return { w: r32(w), h: r32(h) };
}

// Python's round(): a half goes to the even neighbour
function roundHalfEven(v) {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Bilinear resize of RGBA pixels (half-pixel centres, edges replicated) -> Uint8ClampedArray nw x nh x 4. */
export function resizeBilinear(src, w, h, nw, nh) {
  const out = new Uint8ClampedArray(nw * nh * 4);
  const sx = w / nw, sy = h / nh;
  const x0s = new Int32Array(nw), x1s = new Int32Array(nw), fxs = new Float32Array(nw);
  for (let x = 0; x < nw; x++) {
    let fx = (x + 0.5) * sx - 0.5;
    if (fx < 0) fx = 0;
    const x0 = Math.min(Math.floor(fx), w - 1);
    x0s[x] = x0;
    x1s[x] = Math.min(x0 + 1, w - 1);
    fxs[x] = fx - x0;
  }
  for (let y = 0; y < nh; y++) {
    let fy = (y + 0.5) * sy - 0.5;
    if (fy < 0) fy = 0;
    const y0 = Math.min(Math.floor(fy), h - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const wy = fy - y0;
    const r0 = y0 * w * 4, r1 = y1 * w * 4;
    let o = y * nw * 4;
    for (let x = 0; x < nw; x++) {
      const a = r0 + x0s[x] * 4, b = r0 + x1s[x] * 4, c = r1 + x0s[x] * 4, d = r1 + x1s[x] * 4;
      const wx = fxs[x];
      for (let k = 0; k < 4; k++) {
        const top = src[a + k] + (src[b + k] - src[a + k]) * wx;
        const bot = src[c + k] + (src[d + k] - src[c + k]) * wx;
        out[o++] = top + (bot - top) * wy + 0.5;
      }
    }
  }
  return out;
}

/** The detection tensor (Float32Array 3 x h x w, BGR, normalized) of RGBA pixels already at the input size. */
export function detTensor(rgba, w, h) {
  const n = w * h;
  const out = new Float32Array(3 * n);
  const k = [1 / (255 * STD[0]), 1 / (255 * STD[1]), 1 / (255 * STD[2])];
  const m = [MEAN[0] / STD[0], MEAN[1] / STD[1], MEAN[2] / STD[2]];
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = rgba[p + 2] * k[0] - m[0];          // B
    out[n + i] = rgba[p + 1] * k[1] - m[1];      // G
    out[2 * n + i] = rgba[p] * k[2] - m[2];      // R
  }
  return out;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The crop of a quad (clockwise from the top-left): { cw, ch, rotate } as get_rotate_crop_image sizes it. */
export function cropSize(quad) {
  const cw = Math.trunc(Math.max(dist(quad[0], quad[1]), dist(quad[2], quad[3])));
  const ch = Math.trunc(Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2])));
  return { cw, ch, rotate: cw > 0 && ch / cw >= 1.5 };
}

// width / height of the crop as the recognizer sees it (after the turn)
function cropRatio(quad) {
  const { cw, ch, rotate } = cropSize(quad);
  const w = rotate ? ch : cw, h = rotate ? cw : ch;
  return h > 0 ? w / h : 0;
}

/** Lines in recognition batches: [{ items: quad indices sorted by width ratio, ratio: max(320 / 48, widest) }]. */
export function recBatches(quads, size) {
  const n = size || REC_BATCH;
  const ratios = quads.map(cropRatio);
  const order = quads.map((q, i) => i).sort((a, b) => ratios[a] - ratios[b] || a - b);
  const out = [];
  for (let i = 0; i < order.length; i += n) {
    const items = order.slice(i, i + n);
    out.push({ items, ratio: Math.max(REC_MIN_RATIO, ...items.map((k) => ratios[k])) });
  }
  return out;
}

/** The recognition tensor of quads cut from RGBA pixels (W x H): { data: Float32Array n x 3 x 48 x width, n, width,
 * widths: each line's content width before the padding } with width = int(48 * maxRatio). */
export function recTensor(rgba, W, H, quads, maxRatio) {
  const width = Math.trunc(REC_H * maxRatio);
  const plane = REC_H * width;
  const data = new Float32Array(quads.length * 3 * plane);
  const widths = quads.map(() => 0);
  quads.forEach((quad, q) => {
    const { cw, ch, rotate } = cropSize(quad);
    if (cw <= 0 || ch <= 0) return;
    const rw = rotate ? ch : cw, rh = rotate ? cw : ch;  // the crop as the recognizer sees it
    const outW = Math.min(width, Math.ceil(REC_H * (rw / rh)));
    widths[q] = outW;
    const [p0, p1, , p3] = quad;
    const ux = (p1[0] - p0[0]) / cw, uy = (p1[1] - p0[1]) / cw;  // source step per crop column
    const vx = (p3[0] - p0[0]) / ch, vy = (p3[1] - p0[1]) / ch;  // source step per crop row
    const base = q * 3 * plane;
    for (let v = 0; v < REC_H; v++) {
      const ty = ((v + 0.5) * rh) / REC_H - 0.5;  // row in the turned crop
      for (let u = 0; u < outW; u++) {
        const tx = ((u + 0.5) * rw) / outW - 0.5;
        // the turned crop's (tx, ty) -> the crop's (cx, cy): np.rot90 puts crop column cw - 1 - ty, row tx there
        const cx = rotate ? cw - 1 - ty : tx;
        const cy = rotate ? tx : ty;
        let sx = p0[0] + cx * ux + cy * vx;
        let sy = p0[1] + cx * uy + cy * vy;
        if (sx < 0) sx = 0; else if (sx > W - 1) sx = W - 1;
        if (sy < 0) sy = 0; else if (sy > H - 1) sy = H - 1;
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
        const fx = sx - x0, fy = sy - y0;
        const a = (y0 * W + x0) * 4, b = (y0 * W + x1) * 4, c = (y1 * W + x0) * 4, d = (y1 * W + x1) * 4;
        const o = base + v * width + u;
        for (let k = 0; k < 3; k++) {
          const ch4 = 2 - k;  // tensor channel k = B, G, R
          const top = rgba[a + ch4] + (rgba[b + ch4] - rgba[a + ch4]) * fx;
          const bot = rgba[c + ch4] + (rgba[d + ch4] - rgba[c + ch4]) * fx;
          data[o + k * plane] = (top + (bot - top) * fy) / 127.5 - 1;
        }
      }
    }
  });
  return { data, n: quads.length, width, widths };
}
