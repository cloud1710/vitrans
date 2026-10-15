// DB post-processing of the PP-OCRv5 detection output (a text probability map), following PaddleOCR's DBPostProcess
// (thresh 0.3, box_thresh 0.6, unclip_ratio 1.5, max_candidates 1000, min_size 3; box_score_fast; no dilation) and
// the OCR pipeline's box filter (clockwise order, clip, drop boxes of <= 3 px). OpenCV is replaced by small exact
// equivalents: 8-connected regions instead of cv2.findContours (outer boundaries only), a convex hull + rotating
// calipers instead of cv2.minAreaRect, and the rectangle grown by area * ratio / perimeter on every side instead of
// pyclipper's round offset followed by minAreaRect (the same rectangle for a rectangle). No DOM, no network.

export const DB_DEFAULTS = { thresh: 0.3, boxThresh: 0.6, unclipRatio: 1.5, maxCandidates: 1000, minSize: 3 };

/** Convex hull (Andrew's monotone chain), counter-clockwise in y-up terms, collinear points dropped. */
export function convexHull(points) {
  const pts = points.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** The minimum-area enclosing rectangle: { points: 4 corners, w, h } (w along the chosen hull edge). */
export function minAreaRect(points) {
  const hull = convexHull(points);
  if (!hull.length) return { points: [[0, 0], [0, 0], [0, 0], [0, 0]], w: 0, h: 0 };
  if (hull.length === 1) return { points: [hull[0], hull[0], hull[0], hull[0]], w: 0, h: 0 };
  let best = null;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len === 0) continue;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy, v = -x * uy + y * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area - 1e-9) best = { area, ux, uy, minU, maxU, minV, maxV };
  }
  const { ux, uy, minU, maxU, minV, maxV } = best;
  const at = (u, v) => [u * ux - v * uy, u * uy + v * ux];
  return { points: [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)], w: maxU - minU, h: maxV - minV };
}

/** PaddleOCR's get_mini_boxes: the minimum-area rectangle's corners as top-left, top-right, bottom-right,
 * bottom-left (sorted by x; of the two left ones the upper is top-left, of the right ones the upper is top-right),
 * sside = its shorter side. */
export function miniBox(points) {
  const r = minAreaRect(points);
  const p = r.points.slice().sort((a, b) => a[0] - b[0]);
  const [i1, i4] = p[1][1] > p[0][1] ? [0, 1] : [1, 0];
  const [i2, i3] = p[3][1] > p[2][1] ? [2, 3] : [3, 2];
  return { points: [p[i1], p[i2], p[i3], p[i4]], sside: Math.min(r.w, r.h) };
}

function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** The box grown outward by d = area * ratio / perimeter (mitred corners: for a rectangle, the rectangle that
 * pyclipper's round offset + minAreaRect gives). */
export function unclip(box, ratio) {
  const signed = polyArea(box);
  let perim = 0;
  for (let i = 0; i < box.length; i++) {
    const [x1, y1] = box[i];
    const [x2, y2] = box[(i + 1) % box.length];
    perim += Math.hypot(x2 - x1, y2 - y1);
  }
  if (!perim) return box.map((p) => [p[0], p[1]]);
  const d = (Math.abs(signed) * ratio) / perim;
  const sign = signed >= 0 ? 1 : -1;
  const normal = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [(sign * dy) / len, (-sign * dx) / len];
  };
  const n = box.length;
  return box.map((p, i) => {
    const n1 = normal(box[(i - 1 + n) % n], p);
    const n2 = normal(p, box[(i + 1) % n]);
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    return k < 1e-9 ? [p[0] + d * n1[0], p[1] + d * n1[1]] : [p[0] + (d * (n1[0] + n2[0])) / k, p[1] + (d * (n1[1] + n2[1])) / k];
  });
}

/** The 8-connected regions of pred > thresh: per region, each row's leftmost and rightmost pixel ([x, y]), which is
 * all the convex hull needs. At most maxCandidates regions, in scan order. */
export function regions(pred, w, h, thresh, maxCandidates) {
  const limit = maxCandidates || Infinity;
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const rowMin = new Int32Array(h).fill(w);
  const rowMax = new Int32Array(h).fill(-1);
  const out = [];
  for (let start = 0; start < n && out.length < limit; start++) {
    if (seen[start] || !(pred[start] > thresh)) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let yMin = h, yMax = -1;
    while (sp) {
      const i = stack[--sp];
      const y = (i / w) | 0;
      const x = i - y * w;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (!seen[j] && pred[j] > thresh) {
            seen[j] = 1;
            stack[sp++] = j;
          }
        }
      }
    }
    const pts = [];
    for (let y = yMin; y <= yMax; y++) {
      if (rowMax[y] >= 0) pts.push([rowMin[y], y], [rowMax[y], y]);
      rowMin[y] = w;
      rowMax[y] = -1;
    }
    out.push(pts);
  }
  return out;
}

// numpy's astype(int32) of a float32 corner: truncation; corners that are integers up to float noise stay integers
const trunc = (v) => Math.trunc(Math.round(v * 1e4) / 1e4);
const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** PaddleOCR's box_score_fast: the mean probability over the box polygon (filled, boundary included) inside its
 * bounding rectangle. */
export function boxScore(pred, w, h, box) {
  const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
  const xmin = clip(Math.floor(Math.min(...xs)), 0, w - 1), xmax = clip(Math.ceil(Math.max(...xs)), 0, w - 1);
  const ymin = clip(Math.floor(Math.min(...ys)), 0, h - 1), ymax = clip(Math.ceil(Math.max(...ys)), 0, h - 1);
  const poly = box.map(([x, y]) => [trunc(x), trunc(y)]);
  const orient = polyArea(poly) >= 0 ? 1 : -1;
  let sum = 0, count = 0;
  for (let y = ymin; y <= ymax; y++) {
    for (let x = xmin; x <= xmax; x++) {
      let inside = true;
      for (let i = 0; i < 4 && inside; i++) {
        const [ax, ay] = poly[i];
        const [bx, by] = poly[(i + 1) % 4];
        if (orient * ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) < -1e-9) inside = false;
      }
      if (inside) {
        sum += pred[y * w + x];
        count += 1;
      }
    }
  }
  return count ? sum / count : 0;
}

/** The pipeline's clockwise order: the corner with the smallest x + y first, the largest x + y third; of the other
 * two the smaller y - x second (top-right), the larger fourth (bottom-left). */
export function orderClockwise(pts) {
  const s = pts.map((p) => p[0] + p[1]);
  const i0 = s.indexOf(Math.min(...s));
  const i2 = s.indexOf(Math.max(...s));
  const rest = pts.filter((p, i) => i !== i0 && i !== i2);
  if (rest.length !== 2) return [pts[0], pts[1], pts[2], pts[3]];
  const d = rest.map((p) => p[1] - p[0]);
  const [tr, bl] = d[0] <= d[1] ? [rest[0], rest[1]] : [rest[1], rest[0]];
  return [pts[i0], tr, pts[i2], bl];
}

/** Text boxes from a probability map pred (w x h, the detection input's size) in the coordinates of an image of
 * destW x destH: [{ quad: [[x, y] x 4] clockwise from the top-left, integers, score }]. opts: DB_DEFAULTS' names,
 * destW, destH. */
export function dbBoxes(pred, w, h, opts) {
  const o = Object.assign({}, DB_DEFAULTS, opts);
  const destW = o.destW || w, destH = o.destH || h;
  const out = [];
  for (const pts of regions(pred, w, h, o.thresh, o.maxCandidates)) {
    const small = miniBox(pts);
    if (small.sside < o.minSize) continue;
    const score = boxScore(pred, w, h, small.points);
    if (o.boxThresh > score) continue;
    const big = miniBox(unclip(small.points, o.unclipRatio));
    if (big.sside < o.minSize + 2) continue;
    const scaled = big.points.map(([x, y]) => [clip(Math.round((x / w) * destW), 0, destW),
      clip(Math.round((y / h) * destH), 0, destH)]);
    const quad = orderClockwise(scaled).map(([x, y]) => [clip(x, 0, destW - 1), clip(y, 0, destH - 1)]);
    const rw = Math.trunc(Math.hypot(quad[0][0] - quad[1][0], quad[0][1] - quad[1][1]));
    const rh = Math.trunc(Math.hypot(quad[0][0] - quad[3][0], quad[0][1] - quad[3][1]));
    if (rw <= 3 || rh <= 3) continue;
    out.push({ quad, score });
  }
  return out;
}
