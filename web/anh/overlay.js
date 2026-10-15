// The translated picture: the photo with the Vietnamese drawn over each translated block, in the text's own direction,
// inside the block's own box (its lines' rectangle in the text's frame plus a margin of 12 % of a line; what the
// recognizer did not read at a line's ends, such as a drawn bullet, is not part of it) -- never wider, never moved.
// Per block, from the original pixels:
// - background: the median of the pixels just outside the box; the box is painted back by smooth interpolation from
//   its border (a Coons patch of the four sides, each smoothed by a running median: gradients stay gradients) with
//   the border's grain added back as seeded noise (a photo's noise, a clean slide stays clean);
// - text colour: the most different pixels inside it (or black / white when they do not stand out);
// - size: the ink height of the lines (rows with text pixels) over the ink height of the English in the font: the
//   original font size; weight: the median width of the horizontal runs of text pixels (the strokes) over that size,
//   bold from 0.13 em;
// - alignment: from the lines' edges (several lines), else a sibling block with the same left / right edge, else the
//   container: the free run left and right of the line on its middle row up to an edge (a box, a pill, the picture).
// The Vietnamese is fitted (fit.js fitBox) between 60 % of the original size and the original size, wrapped to the
// lines the box holds; at the floor it gets tighter spacing / narrower letters and is reported "squeezed". Sizes of
// one style that differ by less than 15 % are made equal. All covers are painted before any text. Blocks that are not
// in items (kept, or translated into the same text) keep their pixels.
// planBlock / alignOf / inpaintCover / styleHeights / harmonise / turn are pure (tested in Node); drawOverlay needs a
// canvas.
import { medianColor, textColor } from "./image.js";
import { fitBox } from "./fit.js";
import { unturn } from "../ocr/order.js";

export const FONT = "'VT Noto Sans', Arial, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
const LINE_HEIGHT = 1.15;
const FLOOR = 0.6;          // the smallest size, as a part of the original size
const BOLD_STROKE = 0.13;   // stroke width (em) from which a line is bold (regular ~0.09-0.11, bold ~0.15)
const SNAP = 0.85;          // sizes of one style closer than this are made equal

/** A point of the text's frame in the image (turned by angle). */
export function turn([x, y], angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

function pixel(img, x, y) {
  const xi = Math.min(img.width - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(img.height - 1, Math.max(0, Math.round(y)));
  const o = (yi * img.width + xi) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2]];
}

const inside = (img, [x, y]) => x >= 0 && y >= 0 && x <= img.width - 1 && y <= img.height - 1;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (v) => {
  const s = v.slice().sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};
const padOf = (block) => Math.max(2, 0.12 * block.height);

/** { rect (the cover = the box, text frame), bg, fg, angle, inkTop, inkBottom, inkH (median ink height of the lines,
 * px), stroke (median stroke width, px) } of a block ({ rect, angle, height, lineRects }) on an image ({ data, width,
 * height } RGBA). */
export function planBlock(block, img) {
  const a = block.angle || 0;
  const pad = padOf(block);
  const [x0, y0, x1, y1] = block.rect;
  const rect = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  // the ring 2 px outside the cover, every ~3 px
  const [rx0, ry0, rx1, ry1] = [rect[0] - 2, rect[1] - 2, rect[2] + 2, rect[3] + 2];
  const nx = Math.max(2, Math.round((rx1 - rx0) / 3)), ny = Math.max(2, Math.round((ry1 - ry0) / 3));
  const ring = [];
  for (let i = 0; i <= nx; i++) {
    const x = rx0 + ((rx1 - rx0) * i) / nx;
    ring.push([x, ry0], [x, ry1]);
  }
  for (let j = 1; j < ny; j++) {
    const y = ry0 + ((ry1 - ry0) * j) / ny;
    ring.push([rx0, y], [rx1, y]);
  }
  const bg = medianColor(ring.map((q) => turn(q, a)).filter((p) => inside(img, p)).map(([x, y]) => pixel(img, x, y)));
  // inside the block itself: about 2,000 samples for the colour
  const w = x1 - x0, h = y1 - y0;
  const step = Math.max(1, Math.sqrt((w * h) / 2000));
  const inPx = [];
  for (let y = y0 + step / 2; y < y1; y += step) {
    for (let x = x0 + step / 2; x < x1; x += step) {
      const p = turn([x, y], a);
      if (inside(img, p)) inPx.push(pixel(img, p[0], p[1]));
    }
  }
  const fg = textColor(bg, inPx);
  // every pixel of each line (rows and runs of text pixels): ink height and stroke width; a pixel's coverage is its
  // distance from the background over the text colour's (anti-aliased edges count in part), a run's width the sum
  const span = Math.max(1, dist(fg, bg));
  const heights = [], runs = [];
  let inkTop = Infinity, inkBottom = -Infinity;
  for (const [lx0, ly0, lx1, ly1] of block.lineRects || [block.rect]) {
    let top = Infinity, bottom = -Infinity;
    for (let y = Math.floor(ly0); y <= Math.ceil(ly1); y++) {
      let n = 0, run = 0;
      for (let x = Math.floor(lx0); x <= Math.ceil(lx1) + 1; x++) {
        const p = turn([x, y], a);
        const cover = x <= Math.ceil(lx1) && inside(img, p) ? Math.min(1, dist(pixel(img, p[0], p[1]), bg) / span) : 0;
        if (cover > 0.5) n += 1;
        if (cover > 0.2) {
          run += cover;
        } else if (run) {
          runs.push(run);
          run = 0;
        }
      }
      if (n >= 2) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (bottom >= top) {
      heights.push(bottom - top + 1);
      inkTop = Math.min(inkTop, top);
      inkBottom = Math.max(inkBottom, bottom);
    }
  }
  return { rect, bg, fg, angle: a, inkTop: heights.length ? inkTop : null, inkBottom: heights.length ? inkBottom : null,
    inkH: heights.length ? median(heights) : null, stroke: runs.length ? median(runs) : null };
}

// the free run from x along row y (text frame) in direction dir up to an edge: a colour step of more than 40 from
// the last background pixel (it follows gradients), the picture's border; other blocks' boxes are stepped over
function freeRun(img, x, y, dir, angle, others, step) {
  let prev = null;
  let last = x;
  for (let k = 1; k < 10000; k++) {
    const xx = x + dir * k * step;
    const p = turn([xx, y], angle);
    if (!inside(img, p)) return last;
    if (others.some((r) => xx >= r[0] && xx <= r[2] && y >= r[1] && y <= r[3])) continue;
    const c = pixel(img, p[0], p[1]);
    if (prev && dist(c, prev) > 40) return last;
    prev = c;
    last = xx;
  }
  return last;
}

/** "left" | "center" | "right" for a block among the picture's blocks (see the module notes). */
export function alignOf(block, blocks, img) {
  const h = block.height;
  const lines = block.lineRects || [block.rect];
  const spread = (v) => Math.max(...v) - Math.min(...v);
  if (lines.length >= 2) {
    const tol = 0.35 * h;
    if (spread(lines.map((r) => r[0])) <= tol) return "left";
    if (spread(lines.map((r) => r[2])) <= tol) return "right";
    if (spread(lines.map((r) => (r[0] + r[2]) / 2)) <= tol) return "center";
    return "left";
  }
  const [x0, y0, x1, y1] = block.rect;
  const cx = (x0 + x1) / 2;
  const near = (blocks || []).filter((o) => o !== block && Math.abs((o.rect[1] + o.rect[3]) / 2 - (y0 + y1) / 2) <= 4 * h
    && Math.abs((o.rect[0] + o.rect[2]) / 2 - cx) > h);
  const tol = 0.3 * h;
  if (near.some((o) => Math.abs(o.rect[0] - x0) <= tol)) return "left";
  if (near.some((o) => Math.abs(o.rect[2] - x1) <= tol)) return "right";
  const pad = padOf(block);
  const others = (blocks || []).filter((o) => o !== block).map((o) => {
    const q = padOf(o);
    return [o.rect[0] - q, o.rect[1] - q, o.rect[2] + q, o.rect[3] + q];
  });
  const y = (y0 + y1) / 2, step = Math.max(1, h / 8);
  const xl = freeRun(img, x0 - pad, y, -1, block.angle || 0, others, step);
  const xr = freeRun(img, x1 + pad, y, 1, block.angle || 0, others, step);
  const L = x0 - xl, R = xr - x1;
  if (Math.abs(L - R) <= Math.max(0.5 * h, 0.03 * (xr - xl))) return "center";
  return R < L ? "right" : "left";
}

// a side of the border: colours every pixel, smoothed by a running median (window win)
function side(img, pts, win) {
  const raw = pts.map(([x, y]) => pixel(img, x, y));
  const half = Math.max(1, Math.floor(win / 2));
  return raw.map((_, i) => medianColor(raw.slice(Math.max(0, i - half), i + half + 1)));
}

/** Paint the cover (text frame rectangle, turned by angle) in out with the colours of img interpolated from just
 * outside its border (Coons patch); pixels outside the cover are not touched. */
export function inpaintCover(img, out, cover, angle) {
  const [x0, y0, x1, y1] = cover;
  const [rx0, ry0, rx1, ry1] = [x0 - 2, y0 - 2, x1 + 2, y1 + 2];  // the ring the colours come from
  const W = Math.max(1, Math.round(rx1 - rx0)), H = Math.max(1, Math.round(ry1 - ry0));
  const win = Math.max(5, Math.round(0.5 * (y1 - y0)));
  const at = (pts) => side(img, pts.map((q) => turn(q, angle)), win);
  const topPts = Array.from({ length: W + 1 }, (_, i) => [rx0 + (i * (rx1 - rx0)) / W, ry0]);
  const bottomPts = topPts.map(([x]) => [x, ry1]);
  const leftPts = Array.from({ length: H + 1 }, (_, j) => [rx0, ry0 + (j * (ry1 - ry0)) / H]);
  const rightPts = leftPts.map(([, y]) => [rx1, y]);
  const [top, bottom, left, right] = [topPts, bottomPts, leftPts, rightPts].map(at);
  const corners = [top[0], top[W], bottom[0], bottom[W]];
  // the background's grain: the robust spread (1.4826 x median absolute deviation) of the border pixels around their
  // running median, added back as seeded noise (a clean background has none; text crossing the border is an outlier)
  const res = [];
  for (const [pts, smooth] of [[topPts, top], [bottomPts, bottom], [leftPts, left], [rightPts, right]]) {
    pts.forEach((q, k) => {
      const p = turn(q, angle);
      const raw = pixel(img, p[0], p[1]);
      res.push(Math.abs((raw[0] + raw[1] + raw[2] - smooth[k][0] - smooth[k][1] - smooth[k][2]) / 3));
    });
  }
  const grain = 1.4826 * median(res);
  let seed = (Math.round(x0) * 73856093) ^ (Math.round(y0) * 19349663);
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  // the image pixels whose text-frame point is inside the cover
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map((q) => turn(q, angle));
  const bx0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])))), bx1 = Math.min(img.width - 1, Math.ceil(Math.max(...pts.map((p) => p[0]))));
  const by0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])))), by1 = Math.min(img.height - 1, Math.ceil(Math.max(...pts.map((p) => p[1]))));
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const [u, v] = unturn([x, y], angle);
      if (u < x0 || u > x1 || v < y0 || v > y1) continue;
      const s = (u - rx0) / (rx1 - rx0), t = (v - ry0) / (ry1 - ry0);
      const i = Math.round(s * W), j = Math.round(t * H);
      const o = (y * out.width + x) * 4;
      const n = grain ? (rnd() + rnd() + rnd() - 1.5) * 2 * grain : 0;  // about normal, standard deviation grain
      for (let c = 0; c < 3; c++) {
        const val = (1 - t) * top[i][c] + t * bottom[i][c] + (1 - s) * left[j][c] + s * right[j][c]
          - ((1 - s) * (1 - t) * corners[0][c] + s * (1 - t) * corners[1][c] + (1 - s) * t * corners[2][c] + s * t * corners[3][c]);
        out.data[o + c] = Math.max(0, Math.min(255, Math.round(val + n)));
      }
      out.data[o + 3] = 255;
    }
  }
}

/** Per block height, the height of its style: the median of the heights within 25 % of it (lines of one size get
 * slightly different boxes from their ascenders and descenders; they keep one font size). */
export function styleHeights(heights) {
  return heights.map((h) => {
    const near = heights.filter((x) => Math.abs(x - h) <= 0.25 * h).sort((a, b) => a - b);
    return near[near.length >> 1];
  });
}

/** The drawn sizes of [{ size, original }]: within a style (originals within 25 %), a size becomes the smallest size
 * of its style that is at least SNAP of it (bullets of one slide keep one size; a much longer one keeps its own). */
export function harmonise(fits) {
  const styles = styleHeights(fits.map((f) => f.original));
  return fits.map((f, k) => {
    const peers = fits.filter((g, j) => styles[j] === styles[k] && g.size >= SNAP * f.size && g.size <= f.size);
    return Math.min(f.size, ...peers.map((g) => g.size));
  });
}

const css = ([r, g, b]) => "rgb(" + r + "," + g + "," + b + ")";

/**
 * Draw the translated picture on canvas (the source's size): the source, the covers, then the texts.
 * items: [{ block, text (Vietnamese) }] to draw; blocks: every block of the picture (siblings for the alignment).
 * Returns per item { id, size, original, squeezed, bold, align, fg, cover (bounding box in the picture, px) }.
 */
export function drawOverlay(canvas, source, items, blocks) {
  const w = source.width, h = source.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const all = blocks || items.map((it) => it.block);
  const font = (bold, size) => (bold ? "bold " : "") + size + "px " + FONT;
  const ink = (text, bold) => {  // ascent and descent of the text's ink, in em
    ctx.font = font(bold, 100);
    const m = ctx.measureText(text);
    return [m.actualBoundingBoxAscent / 100, m.actualBoundingBoxDescent / 100];
  };
  const plans = items.map((it) => {
    const { block, text } = it;
    const p = planBlock(block, img);
    const shown = block.bullet && block.bulletInText ? block.bullet + " " + text : text;
    // the original size from the ink height of the English (regular and bold have the same height)
    const [ea, ed] = ink(block.text, false);
    let original = p.inkH && ea + ed > 0 ? p.inkH / (ea + ed) : 0.8 * block.height;
    original = Math.min(1.6 * block.height, Math.max(0.5 * block.height, original));
    const bold = p.stroke !== null && p.stroke / original >= BOLD_STROKE;
    const align = alignOf(block, all, img);
    const [va, vd] = ink(shown, bold);
    const pad = padOf(block);
    const boxW = block.rect[2] - block.rect[0] + pad, boxH = p.rect[3] - p.rect[1];
    const measure = (t, size) => {
      ctx.font = font(bold, size);
      return ctx.measureText(t).width;
    };
    const fit = fitBox(shown, boxW, boxH, { measure, maxSize: original, minSize: FLOOR * original, lineHeight: LINE_HEIGHT,
      extent: Math.max(0.5, va + vd) });
    return Object.assign(p, { block, shown, original, bold, align, fit, asc: va, desc: vd, pad });
  });
  const sizes = harmonise(plans.map((p) => ({ size: p.fit.size, original: p.original })));
  plans.forEach((p, k) => {
    if (sizes[k] < p.fit.size) {
      const measure = (t, size) => {
        ctx.font = font(p.bold, size);
        return ctx.measureText(t).width;
      };
      p.fit = fitBox(p.shown, p.block.rect[2] - p.block.rect[0] + p.pad, p.rect[3] - p.rect[1], { measure, maxSize: sizes[k],
        minSize: Math.min(sizes[k], FLOOR * p.original), lineHeight: LINE_HEIGHT, extent: Math.max(0.5, p.asc + p.desc) });
    }
  });
  const out = ctx.createImageData(w, h);
  out.data.set(img.data);
  for (const p of plans) inpaintCover(img, out, p.rect, p.angle);
  ctx.putImageData(out, 0, 0);
  const drawn = [];
  for (const p of plans) {
    const { fit, block } = p;
    const n = fit.lines.length;
    const lh = fit.size * fit.lineHeight;
    const inkH = (n - 1) * lh + fit.size * (p.asc + p.desc);
    // the new ink centred where the old ink was (else in the box), kept inside the box
    const mid = p.inkTop !== null ? (p.inkTop + p.inkBottom + 1) / 2 : (p.rect[1] + p.rect[3]) / 2;
    const top = Math.max(p.rect[1], Math.min(p.rect[3] - inkH, mid - inkH / 2));
    const x = p.align === "left" ? block.rect[0] : p.align === "right" ? block.rect[2]
      : (block.rect[0] + block.rect[2]) / 2;
    ctx.save();
    ctx.rotate(p.angle);
    ctx.font = font(p.bold, fit.size);
    ctx.fillStyle = css(p.fg);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = p.align;
    if ("letterSpacing" in ctx) ctx.letterSpacing = fit.spacing ? fit.spacing * fit.size + "px" : "0px";
    fit.lines.forEach((line, i) => {
      ctx.save();
      ctx.translate(x, top + p.asc * fit.size + i * lh);
      ctx.scale(fit.scaleX, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    ctx.restore();
    const corners = [[p.rect[0], p.rect[1]], [p.rect[2], p.rect[1]], [p.rect[0], p.rect[3]], [p.rect[2], p.rect[3]]]
      .map((q) => turn(q, p.angle));
    const cover = [Math.floor(Math.min(...corners.map((c) => c[0]))) - 2, Math.floor(Math.min(...corners.map((c) => c[1]))) - 2,
      Math.ceil(Math.max(...corners.map((c) => c[0]))) + 2, Math.ceil(Math.max(...corners.map((c) => c[1]))) + 2];
    drawn.push({ id: block.id, size: fit.size, original: p.original, squeezed: fit.squeezed, bold: p.bold, stroke: p.stroke, align: p.align,
      fg: p.fg, cover });
  }
  return drawn;
}
