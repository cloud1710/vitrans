// Fitting text into a block's box for the overlay: greedy word wrap with a measure function (canvas measureText in
// the page; a word wider than the box is cut into pieces) and fitBox (the original box exactly, the size scaled
// both ways between a floor and the original size, tighter at the floor; see fitBox). No DOM, no network.

/** Lines of text wrapped to maxWidth at size (measure(text, size) -> width); "\n" is a hard break. */
export function wrapText(text, maxWidth, size, measure) {
  const out = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (measure(next, size) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = "";
      if (measure(word, size) <= maxWidth) {
        line = word;
        continue;
      }
      // a word wider than the box: as many characters per piece as fit (at least one)
      let piece = "";
      for (const ch of Array.from(word)) {
        if (piece && measure(piece + ch, size) > maxWidth) {
          out.push(piece);
          piece = ch;
        } else {
          piece += ch;
        }
      }
      line = piece;
    }
    if (line) out.push(line);
  }
  return out;
}

export const TIGHT_SPACING = -0.04;  // letter spacing at the floor, in em
export const TIGHT_LINE = 1.0;       // line height at the floor
const MIN_SCALE_X = 0.5;             // the narrowest letters (horizontal scale) before the size goes below the floor

/**
 * The overlay's fit into a block's own box (w x h, nothing outside it): the largest size from maxSize (the original
 * size) down to minSize (the floor) at which the greedy wrap fits the width and the lines fit the height -- a short
 * text grows back to the original size, a long one shrinks and wraps to as many lines as the height allows. When even
 * the floor does not fit: the floor with tighter letter spacing and line height (TIGHT_*), then narrower letters
 * (scaleX, wrapped at w / scaleX), and only then a smaller size; all of these are "squeezed".
 * opts: { measure(text, size) -> width, maxSize, minSize, lineHeight, extent (one line's ink height in em, default 1) }.
 * -> { size, lines, lineHeight, spacing (em), scaleX, squeezed }; height = (lines - 1) x size x lineHeight + size x
 * extent, width of a line = (measure + spacing x size x (characters - 1)) x scaleX.
 */
export function fitBox(text, w, h, opts) {
  const lh = opts.lineHeight || 1.2;
  const extent = opts.extent || 1;
  const maxSize = opts.maxSize;
  const minSize = Math.min(opts.minSize, maxSize);
  const t = String(text || "").trim();
  const result = (size, lines, lineHeight, spacing, scaleX, squeezed) => ({ size, lines, lineHeight, spacing, scaleX, squeezed });
  if (!t) return result(maxSize, [], lh, 0, 1, false);
  const tryFit = (size, lineHeight, spacing, scaleX) => {
    const m = (s, sz) => opts.measure(s, sz) + spacing * sz * Math.max(0, Array.from(s).length - 1);
    const lines = wrapText(t, w / scaleX, size, m);
    const ok = (lines.length - 1) * size * lineHeight + size * extent <= h && lines.every((l) => m(l, size) * scaleX <= w);
    return ok ? lines : null;
  };
  let lines = tryFit(maxSize, lh, 0, 1);
  if (lines) return result(maxSize, lines, lh, 0, 1, false);
  if (tryFit(minSize, lh, 0, 1)) {
    let lo = 0, hi = Math.ceil((maxSize - minSize) * 2);  // step k = maxSize - k / 2; step lo fails, step hi fits
    const sizeAt = (k) => Math.max(minSize, maxSize - k / 2);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tryFit(sizeAt(mid), lh, 0, 1)) hi = mid;
      else lo = mid;
    }
    return result(sizeAt(hi), tryFit(sizeAt(hi), lh, 0, 1), lh, 0, 1, false);
  }
  for (let size = minSize; size > 0.5; size = Math.max(0.5, size * 0.9)) {
    for (let k = 0; 1 - 0.05 * k >= MIN_SCALE_X - 1e-9; k++) {
      const sx = 1 - 0.05 * k;
      lines = tryFit(size, TIGHT_LINE, TIGHT_SPACING, sx);
      if (lines) return result(size, lines, TIGHT_LINE, TIGHT_SPACING, sx, true);
    }
    if (size === 0.5) break;
  }
  return result(0.5, wrapText(t, w, 0.5, opts.measure), TIGHT_LINE, TIGHT_SPACING, MIN_SCALE_X, true);
}
