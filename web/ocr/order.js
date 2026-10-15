// Reading order of detected text lines: rows from top to bottom, boxes left to right within a row, measured in the
// text's own direction (the boxes turned back by the median angle of their top edges, so a photo taken a few degrees
// off keeps its lines in order). A box joins the current row when its vertical span overlaps the row's first box by
// at least half the smaller height (PaddleOCR's sorted_boxes uses a fixed 10 px; this follows the text size).
// No DOM, no network.

/** [x0, y0, x1, y1] of a quad. */
export function quadBounds(quad) {
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The angle (radians) of a quad's top edge (top-left -> top-right). */
export function quadAngle(quad) {
  return Math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]);
}

/** The median top-edge angle of quads (0 for none). */
export function medianAngle(quads) {
  if (!quads.length) return 0;
  const a = quads.map(quadAngle).sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** A point turned by -angle (into the text's frame). */
export function unturn([x, y], angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * c + y * s, -x * s + y * c];
}

/** [x0, y0, x1, y1] of a quad in the text's frame (turned by -angle). */
export function turnedBounds(quad, angle) {
  return quadBounds(quad.map((p) => unturn(p, angle)));
}

/** Indices of quads in reading order. */
export function readingOrder(quads) {
  const angle = medianAngle(quads);
  const b = quads.map((q) => turnedBounds(q, angle));
  const idx = quads.map((q, i) => i).sort((i, j) => b[i][1] - b[j][1] || b[i][0] - b[j][0]);
  const rows = [];
  for (const i of idx) {
    const row = rows[rows.length - 1];
    if (row) {
      const a = b[row[0]];
      const overlap = Math.min(a[3], b[i][3]) - Math.max(a[1], b[i][1]);
      const hMin = Math.min(a[3] - a[1], b[i][3] - b[i][1]);
      if (hMin > 0 && overlap >= 0.5 * hMin) {
        row.push(i);
        continue;
      }
    }
    rows.push([i]);
  }
  return rows.flatMap((row) => row.sort((i, j) => b[i][0] - b[j][0]));
}
