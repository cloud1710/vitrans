// Between reading and writing a PDF (spec Amendment H): pure geometry and decisions.
//   toViewport / invert   boxes between PDF user space and the viewport (pdf.js PageViewport at scale 1: origin top
//                         left, y down, /Rotate applied); transforms are [a, b, c, d, e, f], applied to row vectors
//   attachStyles          each text item takes the style (bold / italic / serif / colour / invisible) of the content
//                         string drawn under it (content.js analysis)
//   planRemoval           which strings leave the content streams: a string goes when every place it is drawn lies in
//                         a translated block (a form drawn twice counts both uses) and it is not clipping text; the
//                         blocks whose English cannot go that way are covered with the background instead (invisible
//                         OCR text over a picture, a string shared with text that stays, clipping text, nothing
//                         found in the streams, a page read by OCR)
import { applyPoint } from "./content.js";

/** The box [x0, y0, x1, y1] of a box mapped by m. */
export function toViewport(m, box) {
  const pts = [applyPoint(m, box[0], box[1]), applyPoint(m, box[2], box[1]), applyPoint(m, box[0], box[3]),
    applyPoint(m, box[2], box[3])];
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return [r(Math.min(...pts.map((p) => p[0]))), r(Math.min(...pts.map((p) => p[1]))),
    r(Math.max(...pts.map((p) => p[0]))), r(Math.max(...pts.map((p) => p[1])))];
}

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [1, 0, 0, 1, 0, 0];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(m[4] * a + m[5] * c), -(m[4] * b + m[5] * d)];
}

/** Is the text direction of a show horizontal, left to right, in the viewport? */
function horizontal(show, V) {
  const m = show.matrix || [1, 0, 0, 1, 0, 0];
  const dx = m[0] * V[0] + m[1] * V[2];
  const dy = m[0] * V[1] + m[1] * V[3];
  return dx > 0 && Math.abs(dy) <= 0.05 * dx;
}

/** The string elements of the shows with their viewport boxes. */
function elementsOf(shows, V) {
  const out = [];
  for (const s of shows) {
    if (!horizontal(s, V)) continue;
    s.elements.forEach((e, k) => {
      if (e.kind !== "str") return;
      const b = toViewport(V, e.box);
      out.push({ show: s, k, x0: b[0], top: b[1], x1: b[2], bottom: b[3] });
    });
  }
  return out;
}

/** items (viewport) get .style from the string under them (the largest overlap), null where none is. */
export function attachStyles(items, shows, V) {
  const els = elementsOf(shows, V).sort((a, b) => a.top - b.top);
  for (const it of items) {
    const top = it.top !== undefined ? it.top : it.base - 0.75 * it.size;
    const bottom = it.bottom !== undefined ? it.bottom : it.base + 0.25 * it.size;
    let best = null;
    let bestArea = 0;
    for (const e of els) {
      if (e.top > bottom) break;
      if (e.bottom < top) continue;
      const w = Math.min(it.x1, e.x1) - Math.max(it.x0, e.x0);
      const h = Math.min(bottom, e.bottom) - Math.max(top, e.top);
      if (w <= 0 || h <= 0) continue;
      if (w * h > bestArea) { bestArea = w * h; best = e; }
    }
    it.style = best ? best.show.style : null;
  }
  return items;
}

const inside = (b, x, y) => {
  const s = b.size || 10;
  return x >= b.box.x0 - 0.3 * s && x <= b.box.x1 + 0.3 * s && y >= b.box.top - 0.35 * s && y <= b.box.bottom + 0.35 * s;
};

/**
 * pages [{index, transform (user -> viewport), ocr?}], analyses [{shows, images}] (per page, same order), blocks
 * (layout blocks: id, page, box, size), translated: Set of block ids that get Vietnamese.
 * -> {edits: Map(stream key -> Map(op index -> {remove: Set(element indexes)})), cover: Set(block ids), removed,
 *     invisible (strings taken out with unknown widths: made invisible)}
 */
export function planRemoval(pages, analyses, blocks, translated) {
  const votes = new Map();  // "stream|op|elem" -> {stream, index, k, inn, out, blocks: Set, tr, known, invisible}
  const seen = new Map();   // block id -> {visible, invisible}
  const cover = new Set();
  pages.forEach((p, n) => {
    const mine = blocks.filter((b) => b.page === p.index && translated.has(b.id));
    if (p.ocr) { for (const b of mine) cover.add(b.id); return; }
    const a = analyses[n] || { shows: [] };
    for (const e of elementsOf(a.shows, p.transform)) {
      const cx = (e.x0 + e.x1) / 2;
      const cy = (e.top + e.bottom) / 2;
      const b = mine.find((x) => inside(x, cx, cy));
      const key = e.show.stream + "|" + e.show.index + "|" + e.k;
      let v = votes.get(key);
      if (!v) {
        v = { stream: e.show.stream, index: e.show.index, k: e.k, inn: 0, out: 0, blocks: new Set(), tr: e.show.tr,
          known: e.show.widthsKnown };
        votes.set(key, v);
      }
      if (!b) { v.out += 1; continue; }
      v.inn += 1;
      v.blocks.add(b.id);
      const s = seen.get(b.id) || { visible: 0, invisible: 0 };
      if (e.show.tr === 3 || e.show.tr === 7 || (e.show.style && e.show.style.invisible)) s.invisible += 1;
      else s.visible += 1;
      seen.set(b.id, s);
    }
  });
  const edits = new Map();
  let removed = 0;
  let invisible = 0;
  for (const v of votes.values()) {
    if (!v.inn) continue;
    if (v.out > 0 || v.tr >= 4) {
      if (v.tr !== 3) for (const id of v.blocks) cover.add(id);
      continue;
    }
    if (!edits.has(v.stream)) edits.set(v.stream, new Map());
    const ops = edits.get(v.stream);
    if (!ops.has(v.index)) ops.set(v.index, { remove: new Set() });
    ops.get(v.index).remove.add(v.k);
    removed += 1;
    if (!v.known) invisible += 1;
  }
  for (const id of translated) {
    const s = seen.get(id);
    if (!s || !s.visible) cover.add(id);
  }
  // a picture about the size of a block lying on it is most likely the text again (a shadow or glow drawn as an
  // image): the block is covered too; background pictures (much larger than the block) are not
  pages.forEach((p, n) => {
    const imgs = ((analyses[n] || {}).images || []).map((b) => toViewport(p.transform, b));
    for (const b of blocks) {
      if (b.page !== p.index || !translated.has(b.id) || cover.has(b.id)) continue;
      const area = Math.max(1, (b.box.x1 - b.box.x0) * (b.box.bottom - b.box.top));
      for (const [x0, y0, x1, y1] of imgs) {
        const ia = Math.max(1, (x1 - x0) * (y1 - y0));
        const ov = Math.max(0, Math.min(x1, b.box.x1) - Math.max(x0, b.box.x0))
          * Math.max(0, Math.min(y1, b.box.bottom) - Math.max(y0, b.box.top));
        if (ia <= 4 * area && ov >= 0.5 * Math.min(ia, area)) { cover.add(b.id); break; }
      }
    }
  });
  return { edits, cover, removed, invisible };
}
