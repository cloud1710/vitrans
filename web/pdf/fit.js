// The Vietnamese of a block fitted into its box (spec Amendment H: "text fitted to the block"). Pure functions: the
// font metrics come in as measure(text, size, face) -> width in points. The text is a string, or styled runs
// [{text, face}] (bold / italic spans): a word may change face inside (an italic name before a regular colon) and
// is measured piece by piece.
//   wrapLines    greedy line breaking at spaces (a word wider than the box is cut between characters)
//   fitText      the largest size from the original down to the minimum (default 60 % of it, never under 4 pt) whose
//                lines fit the box; otherwise the minimum size and overflow = true (the report marks the block)
//   sizeNeeded   the size a block needs: its own box at a little smaller type, else its room down to the floor
//   sharedSizes  blocks that shared a size in the original share one: the smallest any of them needs, floored
//   placeAt      the text at a given size in the first box where it fits (own box, room, deep room)
//   roomFor      the box a block may use: its own box, grown down into free space (up to the next block or image that
//                overlaps it horizontally, at most its own height or two lines more; with deep, up to the obstacle)
//                and, for a one-line block, to the right (up to the next neighbour on its line or the page margin); a
//                table cell keeps to its cell
export const MIN_SHARE = 0.6;
export const MIN_PT = 4;
export const FLOOR_SHARE = 0.72;

/** Text or runs -> words, each a list of pieces {text, face} without white space. */
function wordsOf(text) {
  const runs = Array.isArray(text) ? text : [{ text: String(text || ""), face: undefined }];
  const words = [];
  let cur = null;
  for (const r of runs) {
    for (const ch of Array.from(String(r.text || ""))) {
      if (/\s/.test(ch)) { cur = null; continue; }
      if (!cur) { cur = []; words.push(cur); }
      const last = cur[cur.length - 1];
      if (last && last.face === r.face) last.text += ch; else cur.push({ text: ch, face: r.face });
    }
  }
  return words;
}

/** The runs of a line of words: one space between words (in the face before it), pieces of one face merged. */
function lineRuns(words) {
  const out = [];
  const push = (text, face) => {
    const last = out[out.length - 1];
    if (last && last.face === face) last.text += text; else out.push({ text, face });
  };
  words.forEach((w, k) => {
    if (k) push(" ", out[out.length - 1].face);
    for (const p of w) push(p.text, p.face);
  });
  return out;
}

const runsWidth = (runs, measure) => runs.reduce((a, r) => a + measure(r.text, r.face), 0);
const joined = (runs) => runs.map((r) => r.text).join("");

/** Greedy wrap of words into lines (lists of words) no wider than width (measure: (text, face) -> width). */
function wrapWords(words, width, measure) {
  const lines = [];
  let cur = [];
  const fits = (ws) => runsWidth(lineRuns(ws), measure) <= width;
  for (const w of words) {
    const next = cur.concat([w]);
    if (fits(next)) { cur = next; continue; }
    if (cur.length) lines.push(cur);
    if (fits([w])) { cur = [w]; continue; }
    // a word wider than the line: cut it between characters
    let piece = [];
    for (const p of w) {
      for (const ch of Array.from(p.text)) {
        const more = lineRuns([piece.concat([{ text: ch, face: p.face }])]);
        if (piece.length && runsWidth(more, measure) > width) {
          lines.push([lineRuns([piece])]);
          piece = [{ text: ch, face: p.face }];
        } else piece.push({ text: ch, face: p.face });
      }
    }
    cur = [lineRuns([piece])];
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** Greedy wrap of text (a string or runs) into lines no wider than width (measure: (string, face) -> width). */
export function wrapLines(text, width, measure) {
  return wrapWords(wordsOf(text), width, (t, f) => measure(t, f)).map((l) => joined(lineRuns(l)));
}

/** -> {size, lines, runs (per line: [{text, face}]), pitch, overflow, height}. box {w, h}; o {size, minSize?,
 * lineRatio (pitch / size), measure (text, size, face) -> width, step?, oneLine?}. */
export function fitText(text, box, o) {
  const start = o.size;
  const min = Math.min(start, Math.max(MIN_PT, o.minSize !== undefined ? o.minSize : start * MIN_SHARE));
  const ratio = o.lineRatio || 1.2;
  const step = o.step || Math.max(0.25, start * 0.03);
  const words = wordsOf(text);
  const tryAt = (s) => {
    const m = (t, f) => o.measure(t, s, f);
    const runs = wrapWords(words, box.w, m).map(lineRuns);
    const height = runs.length ? (runs.length - 1) * s * ratio + s : 0;
    const fits = height <= box.h + 0.25 * s && runs.every((l) => runsWidth(l, m) <= box.w + 0.01);
    return { size: s, lines: runs.map(joined), runs, pitch: s * ratio, height, fits };
  };
  if (o.oneLine) {
    // a heading or a cell: smaller on one line before a second line
    const flat = lineRuns(words);
    for (let s = start; s >= min - 1e-9; s = Math.round((s - step) * 100) / 100) {
      if (runsWidth(flat, (t, f) => o.measure(t, s, f)) <= box.w + 0.01 && s <= box.h + 0.25 * s) {
        return { size: s, lines: flat.length ? [joined(flat)] : [], runs: flat.length ? [flat] : [], pitch: s * ratio,
          height: s, overflow: false };
      }
    }
  }
  for (let s = start; s > min + 1e-9; s = Math.round((s - step) * 100) / 100) {
    const r = tryAt(s);
    if (r.fits) return { size: r.size, lines: r.lines, runs: r.runs, pitch: r.pitch, height: r.height, overflow: false };
  }
  const r = tryAt(min);
  return { size: r.size, lines: r.lines, runs: r.runs, pitch: r.pitch, height: r.height, overflow: !r.fits };
}

const dims = (b) => ({ w: Math.max(1, b.x1 - b.x0), h: Math.max(1, b.bottom - b.top) });

/** The block's own box first, down to TIGHT_SHARE of the size (a coloured card or a cell the page cannot see must
 * not be left); then the room it may grow into (roomFor) down to the minimum. -> fitText's answer plus .room (the
 * box used). box / room: {x0, x1, top, bottom}. */
export const TIGHT_SHARE = 0.85;
export function fitBlock(text, box, room, o) {
  const tight = fitText(text, dims(box), { ...o, minSize: o.size * TIGHT_SHARE });
  if (!tight.overflow) return { ...tight, room: box };
  return { ...fitText(text, dims(room), o), room };
}

/** The largest size at which a block fits (fitBlock with the floor as the minimum: o.floor, a share of the size,
 * FLOOR_SHARE by default), or null when it does not fit its room even at the floor. */
export function sizeNeeded(text, box, room, o) {
  const r = fitBlock(text, box, room, { ...o, minSize: o.size * (o.floor || FLOOR_SHARE) });
  return r.overflow ? null : r.size;
}

/** entries [{key (blocks that shared a size), size (the original), need (sizeNeeded), floor?}] -> Map(key -> the
 * size they all take): the smallest need of the group, a need of null counting as the floor (floor or FLOOR_SHARE
 * of the size). */
export function sharedSizes(entries) {
  const out = new Map();
  for (const e of entries) {
    const need = e.need === null || e.need === undefined ? Math.max(MIN_PT, e.size * (e.floor || FLOOR_SHARE)) : e.need;
    out.set(e.key, out.has(e.key) ? Math.min(out.get(e.key), need) : need);
  }
  return out;
}

/** The text at exactly `size` in the first of boxes (own box, room, deep room) where it fits; else in the last one
 * with overflow = true. -> fitText's answer plus .room. */
export function placeAt(text, boxes, size, o) {
  let r = null;
  for (const b of boxes) {
    r = { ...fitText(text, dims(b), { ...o, size, minSize: size }), room: b };
    if (!r.overflow) return r;
  }
  return r;
}

const overlaps = (a0, a1, b0, b1) => a0 < b1 && a1 > b0;

/** The box a block may write into. block {box {x0, x1, top, bottom}, lines, size, kind?, cellBox?}; obstacles:
 * boxes {x0, x1, top, bottom} of everything else on the page (other blocks, images); page {margin {x0, x1, top,
 * bottom}}; opts.deep: no cap below (down to the next obstacle or the margin). */
export function roomFor(block, obstacles, page, opts = {}) {
  const b = block.box;
  if (block.kind === "cell" && block.cellBox) {
    return { x0: b.x0, x1: Math.max(b.x1, block.cellBox.x1), top: b.top, bottom: Math.max(b.bottom, block.cellBox.bottom) };
  }
  const size = block.size || 10;
  const m = page.margin || { x0: 0, x1: page.width, top: 0, bottom: page.height };
  let x1 = b.x1;
  if (block.lines.length === 1) {
    x1 = Math.max(b.x1, m.x1);
    for (const o of obstacles) {
      if (o.x0 >= b.x1 - 0.5 && overlaps(o.top, o.bottom, b.top, b.bottom)) x1 = Math.min(x1, o.x0 - 0.5 * size);
    }
    x1 = Math.max(x1, b.x1);
  }
  let x0 = b.x0;
  if (block.align === "right" && block.lines.length === 1) {
    // a right-aligned line grows to the left (up to its left neighbour on the line or the page margin)
    x0 = Math.min(b.x0, m.x0);
    for (const o of obstacles) {
      if (o.x1 <= b.x0 + 0.5 && overlaps(o.top, o.bottom, b.top, b.bottom)) x0 = Math.max(x0, o.x1 + 0.5 * size);
    }
    x0 = Math.min(x0, b.x0);
  }
  if (block.align === "center" && block.lines.length === 1) {
    // a centred line grows on both sides alike
    const c = (b.x0 + b.x1) / 2;
    const half = Math.max((b.x1 - b.x0) / 2, Math.min(c - Math.min(m.x0, b.x0), x1 - c));
    x0 = c - half;
    x1 = c + half;
  }
  let limit = Math.max(m.bottom, b.bottom);
  for (const o of obstacles) {
    if (o.top >= b.bottom - 0.5 && overlaps(o.x0, o.x1, x0, x1)) limit = Math.min(limit, o.top - 0.2 * size);
  }
  const cap = opts.deep ? Infinity : b.bottom + Math.max(b.bottom - b.top, 2 * 1.2 * size);
  return { x0, x1, top: b.top, bottom: Math.max(b.bottom, Math.min(limit, cap)) };
}
