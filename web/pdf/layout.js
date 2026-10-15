// Text items of a PDF -> blocks in reading order (spec Amendment H, "PDF"): the units the core translates and the
// boxes the Vietnamese is drawn into. Pure functions (no DOM, no pdf.js): web/pdf/read.js hands over the items of
// every page in viewport space at scale 1 (origin top-left, y down, the page's /Rotate applied), each
// {str, x0, x1, base (baseline y), size (font size), style: {bold, italic, serif, color, invisible} | null}.
//   1. fragments: the items of one baseline (raised citation marks included) joined left to right, cut at gaps wider
//      than about one em (columns, table cells);
//   2. reading order: a recursive cut of the page -- a vertical gutter that runs through the whole region splits it
//      into columns (left first), else the region is cut into horizontal bands, consecutive bands that share a
//      gutter staying together (so that two columns with aligned baselines are still read column by column); a
//      region whose columns line up row by row in short cells is a table, read row by row, one block per cell;
//   3. paragraphs: consecutive lines of the same column merge unless the line pitch, the size or the weight changes,
//      a list marker or a caption starts, a first-line indent opens a paragraph, or a short line ends a sentence;
//   4. kinds: heading (larger or bold), list, caption, footnote, cell, para; running headers / footers (the same text
//      in the top or bottom band of two or more pages) and page numbers stay on the page, untranslated; the
//      References section is not translated (document.js isStopHeading, closed by the next heading of its level or
//      by a back-matter title such as an Appendix, isBackMatterHeading, as the DOCX path does); a paragraph cut by a column or page break (no sentence end, the next one starts in lower
//      case) is translated as one segment and split back over its boxes.
import { isStopHeading, isBackMatterHeading } from "../engine/ooxml/document.js";
import { nonLatin } from "../engine/py.js";

const GAP_SPLIT = 1.0;      // em: a wider gap between two items of a row starts a new fragment
const SPACE_GAP = 0.12;     // em: a wider gap between two items is a word space
const ASC = 0.75;           // normalized line box: baseline - 0.75 em .. baseline + 0.25 em
const DESC = 0.25;
const MAX_PITCH = 1.6;      // em: a larger baseline distance ends the paragraph
const BAND = 0.09;          // top / bottom share of the page where running headers and footers live
const HAS_WORD = /[A-Za-z]{2,}/;
const MARKER = /^(?:[•‣⁃⁌⁍∙▪▫●○◦■□–—·‧➢➔➜►▸✓✔*-]\s*|(?:\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|\(?(?:i{1,3}|iv|v|vi{1,3}|ix|x)[.)])\s+)/;
const CAPTION = /^(?:supplementary\s+)?(?:fig(?:ure)?\.?|table|tab\.|chart|graph|scheme|box|hình|bảng)\s*[A-Z]?\d+[A-Za-z]?\b/i;
const SENTENCE_END = /[.!?:;…]["'”’)\]]*$/;
const PAGE_NUMBER = /^(?:(?:page|p\.|trang)\s*)?\d{1,4}(?:\s*(?:of|\/|-|–)\s*\d{1,4})?$|^[ivxlcdm]{1,7}$|^-\s*\d{1,4}\s*-$/i;

const MARKER_TAB = 4;       // em: the widest tab between a list marker and its text
/** Is s a list marker and nothing else ("1.", "a)", a bullet)? A lone dash or star is not (a table's empty cell). */
const loneMarker = (s) => {
  const t = s.trim();
  const m = t && t.length <= 5 && !/^[-*\u2013\u2014]$/.test(t) ? MARKER.exec(t + " x") : null;
  return !!m && m[0].trimEnd() === t;
};

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const center = (o) => (o.x0 + o.x1) / 2;
const squash = (s) => String(s).replace(/\s+/g, " ").trim();
const startsLower = (s) => /^[\p{Ll}]/u.test(s);
const startsUpper = (s) => /^[\p{Lu}\p{N}]/u.test(s);

/** The majority style of runs [{style, weight}] (null when no run knows its style). */
function majorityStyle(runs) {
  const known = runs.filter((r) => r.style);
  if (!known.length) return null;
  const tally = new Map();
  for (const r of known) {
    const s = r.style;
    const key = [s.bold ? 1 : 0, s.italic ? 1 : 0, s.serif ? 1 : 0, s.invisible ? 1 : 0, (s.color || [0, 0, 0]).join(",")].join("|");
    const t = tally.get(key) || { style: s, weight: 0 };
    t.weight += r.weight;
    tally.set(key, t);
  }
  return [...tally.values()].sort((a, b) => b.weight - a.weight)[0].style;
}

/** Join two pieces of text: a line-end hyphen after a letter before a lower-case word is dropped; else a space. */
export function joinText(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (/\p{L}-$/u.test(a) && startsLower(b)) return a.slice(0, -1) + b;
  return a + " " + b;
}

// ---------------------------------------------------------------- inline runs
// A run {text, style} is a piece of a line or a block in one style; the runs of a fragment, a line or a block join
// to exactly its text. Only bold and italic tell runs apart (the faces the Vietnamese is drawn with).

const runKey = (s) => (s ? (s.bold ? "b" : "-") + (s.italic ? "i" : "-") : "?");
export const runsText = (runs) => runs.map((r) => r.text).join("");

function pushRun(out, text, style) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && runKey(last.style) === runKey(style)) last.text += text;
  else out.push({ text, style });
}

/** Pieces {text, style} -> runs whose text is squash(the joined text): white space folded to one space (it keeps
 * the style of the piece it starts in), none at the ends. */
export function squashRuns(pieces) {
  const out = [];
  let pending;  // the style of a pending space (undefined: none)
  for (const p of pieces) {
    for (const ch of String(p.text || "")) {
      if (/\s/.test(ch)) {
        if (out.length && pending === undefined) pending = p.style || null;
        continue;
      }
      if (pending !== undefined) { pushRun(out, " ", pending); pending = undefined; }
      pushRun(out, ch, p.style || null);
    }
  }
  return out;
}

/** The runs of joinText(a, b). */
export function joinRuns(a, b) {
  const ta = runsText(a);
  const tb = runsText(b);
  if (!ta) return b.map((r) => ({ ...r }));
  const out = a.map((r) => ({ ...r }));
  if (!tb) return out;
  const last = out[out.length - 1];
  if (/\p{L}-$/u.test(ta) && startsLower(tb)) {
    last.text = last.text.slice(0, -1);
    if (!last.text) out.pop();
  } else last.text += " ";
  for (const r of b) pushRun(out, r.text, r.style);
  return out;
}

/** Runs -> {tagged, spans}: the runs in the dominant style as plain text, the others (bold / italic differ) wrapped
 * in <gN>..</gN> (the DOCX path's inline tags), white space at a span's edges left outside it; spans {N: {bold,
 * italic}}. Runs of unknown style count as dominant; a white-space run between two runs of one style joins them. */
export function taggedOf(runs, dominant) {
  const dk = runKey(dominant || { bold: false, italic: false });
  const items = runs.map((r) => ({ text: r.text, key: r.style ? runKey(r.style) : dk }));
  items.forEach((it, i) => {
    if (it.text.trim()) return;
    const prev = items[i - 1];
    const next = items[i + 1];
    it.key = prev && next && prev.key === next.key ? prev.key : dk;
  });
  const merged = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (last && last.key === it.key) last.text += it.text; else merged.push({ ...it });
  }
  let tagged = "";
  const spans = {};
  let n = 0;
  for (const it of merged) {
    if (it.key === dk) { tagged += it.text; continue; }
    const lead = /^\s*/.exec(it.text)[0];
    const trail = /\s*$/.exec(it.text.slice(lead.length))[0];
    n += 1;
    spans[n] = { bold: it.key[0] === "b", italic: it.key[1] === "i" };
    tagged += lead + "<g" + n + ">" + it.text.slice(lead.length, it.text.length - trail.length) + "</g" + n + ">" + trail;
  }
  return { tagged, spans };
}

/** A translation with inline tags -> runs {text, style {bold, italic} | null}: text inside <gN> takes span N's
 * style, the rest (and text in unknown tags) the dominant one (null when that is unknown); placeholders <xN/>
 * become spaces; white space squashed. */
export function runsOfTagged(text, spans, dominant) {
  const base = dominant ? { bold: !!dominant.bold, italic: !!dominant.italic } : null;
  const sp = spans || {};
  const stack = [];
  const cur = () => {
    for (let k = stack.length - 1; k >= 0; k--) if (sp[stack[k]]) return sp[stack[k]];
    return base;
  };
  const pieces = [];
  const re = /<(\/?)g(\d+)>|<x\d+\/>/g;
  const s = String(text || "");
  let pos = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > pos) pieces.push({ text: s.slice(pos, m.index), style: cur() });
    if (m[0][1] === "x") pieces.push({ text: " ", style: cur() });
    else if (m[1]) {
      const at = stack.lastIndexOf(m[2]);
      if (at >= 0) stack.splice(at, 1);
    } else stack.push(m[2]);
    pos = m.index + m[0].length;
  }
  if (pos < s.length) pieces.push({ text: s.slice(pos), style: cur() });
  return squashRuns(pieces);
}

/** Items -> fragments: rows of items on one baseline (smaller raised / lowered items join the row they sit in),
 * cut at gaps wider than GAP_SPLIT em. Each fragment {text, x0, x1, top, bottom, base, size, style, items}. */
export function buildFragments(items) {
  const usable = items.filter((it) => it && typeof it.str === "string" && it.str.trim() && it.size > 0
    && it.x1 >= it.x0);
  const sorted = [...usable].sort((a, b) => b.size - a.size || a.base - b.base || a.x0 - b.x0);
  const rows = [];
  for (const it of sorted) {
    let row = null;
    for (const r of rows) {
      if (Math.abs(r.base - it.base) <= 0.3 * Math.max(r.size, it.size)) { row = r; break; }
      // a smaller item inside the row's line box: superscript / subscript
      if (it.size < 0.85 * r.size && it.base - ASC * it.size >= r.base - 1.05 * r.size
        && it.base <= r.base + 0.45 * r.size) { row = r; break; }
    }
    if (!row) {
      row = { base: it.base, size: it.size, items: [] };
      rows.push(row);
    }
    row.items.push(it);
  }
  const frags = [];
  for (const row of rows) {
    const its = row.items.sort((a, b) => a.x0 - b.x0);
    let cur = null;
    for (const it of its) {
      if (cur) {
        const last = cur.items[cur.items.length - 1];
        // the same text drawn twice (fake bold): skip the copy
        if (it.str === last.str && Math.abs(it.x0 - last.x0) < 0.5 * row.size) continue;
        // a wide gap starts a new fragment, except after a lone list marker set off by a tab ("1.", a bullet)
        const gap = it.x0 - cur.x1;
        if (gap > GAP_SPLIT * row.size && !(gap <= MARKER_TAB * row.size && loneMarker(cur.items.map((x) => x.str).join("")))) {
          cur = null;
        }
      }
      if (!cur) {
        cur = { items: [], x0: it.x0, x1: it.x1 };
        frags.push(Object.assign(cur, { row }));
      }
      cur.items.push(it);
      cur.x1 = Math.max(cur.x1, it.x1);
    }
  }
  for (const f of frags) {
    let text = "";
    let prev = null;
    let last = null;
    const pieces = [];
    for (const it of f.items) {
      if (prev && text && !/\s$/.test(text) && !/^\s/.test(it.str)
        && it.x0 - prev.x1 > SPACE_GAP * Math.max(prev.size, it.size)) {
        text += " ";
        pieces.push({ text: " ", style: last.style || null });
      }
      text += it.str;
      pieces.push({ text: it.str, style: it.style || null });
      last = it;
      prev = prev && prev.x1 > it.x1 ? prev : it;
    }
    f.runs = squashRuns(pieces);
    // the row's normal-size items; a fragment of raised marks only (cut off by a gap) stands on its own items
    const big = f.items.filter((it) => it.size >= 0.85 * f.row.size);
    const main = big.length ? big : f.items;
    f.text = squash(text);
    f.size = Math.max(...main.map((it) => it.size));
    f.base = median(main.map((it) => it.base));
    f.top = f.base - ASC * f.size;
    f.bottom = f.base + DESC * f.size;
    f.style = majorityStyle(f.items.map((it) => ({ style: it.style, weight: Array.from(it.str).length })));
    delete f.row;
  }
  return frags.filter((f) => f.text).sort((a, b) => a.top - b.top || a.x0 - b.x0);
}

const extent = (frags) => ({ x0: Math.min(...frags.map((f) => f.x0)), x1: Math.max(...frags.map((f) => f.x1)) });

/** x-intervals of the region with no fragment, at least `min` wide, strictly inside the region's extent. */
function gutters(frags, min) {
  const iv = frags.map((f) => [f.x0, f.x1]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let reach = iv[0][1];
  for (const [a, b] of iv.slice(1)) {
    if (a - reach >= min) out.push({ x0: reach, x1: a, mid: (reach + a) / 2, w: a - reach });
    reach = Math.max(reach, b);
  }
  return out;
}

/** Fragments sorted by top -> bands separated by vertical gaps. */
function bands(frags) {
  const s = [...frags].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const out = [];
  let cur = null;
  for (const f of s) {
    if (cur && f.top < cur.bottom - 0.01) {
      cur.frags.push(f);
      cur.bottom = Math.max(cur.bottom, f.bottom);
    } else {
      cur = { frags: [f], bottom: f.bottom };
      out.push(cur);
    }
  }
  return out;
}

/** Rows of fragments by baseline (within 0.3 em). */
function baseRows(frags) {
  const s = [...frags].sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const rows = [];
  for (const f of s) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(f.base - r.base) <= 0.3 * Math.max(f.size, r.size)) r.frags.push(f);
    else rows.push({ base: f.base, size: f.size, frags: [f] });
  }
  return rows;
}

/** A table when the columns between the gutters line up row by row and are not running text (every column filled
 * across its width over many rows): {cols: [{x0, x1}], rows: [[[frag...] per column]...]} or null. */
function tableOf(frags, gut) {
  const cuts = gut.map((g) => g.mid).sort((a, b) => a - b);
  const colOf = (f) => cuts.filter((c) => center(f) > c).length;
  const k = cuts.length + 1;
  const rows = baseRows(frags);
  const aligned = rows.filter((r) => new Set(r.frags.map(colOf)).size >= 2);
  if (aligned.length < 2 || aligned.length < 0.5 * rows.length) return null;
  const cols = Array.from({ length: k }, (_, c) => {
    const fs = frags.filter((f) => colOf(f) === c);
    return fs.length ? extent(fs) : null;
  });
  if (cols.some((c) => !c)) return null;
  const fill = cols.map((c, j) => median(frags.filter((f) => colOf(f) === j).map((f) => (f.x1 - f.x0) / Math.max(1, c.x1 - c.x0))));
  if (rows.length >= 4 && fill.every((x) => x >= 0.75)) return null;  // columns of running text
  // rows with a single filled column before the first aligned row or after the last one are not part of the table
  // (the end of a paragraph above it, a note under it)
  const one = (r) => new Set(r.frags.map(colOf)).size === 1;
  let first = 0;
  let last = rows.length - 1;
  while (first <= last && one(rows[first])) first++;
  while (last >= first && one(rows[last])) last--;
  // ... except the wrapped lines of the last row's cell: right under it, in a column other than the first
  while (last >= first && last + 1 < rows.length && one(rows[last + 1]) && colOf(rows[last + 1].frags[0]) > 0
    && rows[last + 1].base - rows[last].base <= MAX_PITCH * rows[last + 1].size) last++;
  const before = rows.slice(0, first).flatMap((r) => r.frags);
  const after = rows.slice(last + 1).flatMap((r) => r.frags);
  // a row with a single filled column right under a row (small pitch) continues that row's cell
  const merged = [];
  for (const r of rows.slice(first, last + 1)) {
    const prev = merged[merged.length - 1];
    if (prev && one(r) && r.base - prev.lastBase <= MAX_PITCH * r.size) {
      prev.frags.push(...r.frags);
      prev.lastBase = r.base;
    } else {
      merged.push({ frags: [...r.frags], lastBase: r.base });
    }
  }
  if (merged.length < 2) return null;
  return { cols, before, after, rows: merged.map((r) => cols.map((_, c) => r.frags.filter((f) => colOf(f) === c)
    .sort((a, b) => a.base - b.base || a.x0 - b.x0))) };
}

/** Do these fragments stand in columns: at least two on each side of their widest gutter? */
function columnar(frags, minGutter) {
  const gut = gutters(frags, minGutter);
  if (!gut.length) return false;
  const g = gut.reduce((a, b) => (b.w > a.w ? b : a));
  const left = frags.filter((f) => center(f) < g.mid).length;
  return left >= 2 && frags.length - left >= 2;
}

/** The recursive cut of a page region: entries {frag, bounds} and {table, bounds} in reading order. Full-width bands
 * keep their parent's bounds object (lines of one paragraph merge across bands); columns get their own. */
function cut(frags, bounds, out, minGutter) {
  if (!frags.length) return;
  if (frags.length === 1) { out.push({ frag: frags[0], bounds }); return; }
  const gut = gutters(frags, minGutter);
  if (gut.length) {
    const table = tableOf(frags, gut);
    if (table) {
      const inTable = frags.filter((f) => !table.before.includes(f) && !table.after.includes(f));
      for (const f of table.before) out.push({ frag: f, bounds });
      out.push({ table, bounds: extent(inTable) });
      for (const f of table.after) out.push({ frag: f, bounds });
      return;
    }
    const g = gut.reduce((a, b) => (b.w > a.w ? b : a));
    const left = frags.filter((f) => center(f) < g.mid);
    const right = frags.filter((f) => center(f) >= g.mid);
    cut(left, extent(left), out, minGutter);
    cut(right, extent(right), out, minGutter);
    return;
  }
  const bs = bands(frags);
  if (bs.length === 1) {
    for (const f of [...frags].sort((a, b) => a.top - b.top || a.x0 - b.x0)) out.push({ frag: f, bounds });
    return;
  }
  const groups = [];
  let cur = null;
  let bottom = -Infinity;
  const near = 3 * median(frags.map((f) => f.size));  // bands further apart than this never share columns
  for (const b of bs) {
    const top = Math.min(...b.frags.map((f) => f.top));
    if (cur && top - bottom <= near && gutters(cur.frags.concat(b.frags), minGutter).length) {
      cur.frags.push(...b.frags);
      cur.bands.push(b);
    } else {
      cur = { frags: [...b.frags], bands: [b] };
      groups.push(cur);
    }
    bottom = Math.max(...cur.frags.map((f) => f.bottom));
  }
  for (const g of groups) {
    // bands that only seemed to share a gutter (a short line next to a centred one): one by one
    if (g.bands.length > 1 && !columnar(g.frags, minGutter)) for (const b of g.bands) cut(b.frags, bounds, out, minGutter);
    else cut(g.frags, bounds, out, minGutter);
  }
}

function lineOf(f) {
  return { text: f.text, x0: f.x0, x1: f.x1, top: f.top, bottom: f.bottom, base: f.base, size: f.size, style: f.style,
    runs: f.runs || [{ text: f.text, style: f.style }] };
}

function boxOf(lines) {
  return { x0: Math.min(...lines.map((l) => l.x0)), x1: Math.max(...lines.map((l) => l.x1)), top: lines[0].top,
    bottom: lines[lines.length - 1].bottom };
}

const lineWeight = (l) => Array.from(l.text).length;

/** May line L (a fragment entry) continue block B? */
function canMerge(B, e) {
  if (B.bounds !== e.bounds) return false;
  const L = e.frag;
  const last = B.lines[B.lines.length - 1];
  const size = Math.max(L.size, last.size);
  const pitch = L.base - last.base;
  if (pitch <= 0.5 * size || pitch > MAX_PITCH * size) return false;
  if (Math.abs(L.size - B.size) > 0.15 * B.size) return false;
  if (L.style && B.style && (!!L.style.bold !== !!B.style.bold || !!L.style.invisible !== !!B.style.invisible)) return false;
  if (MARKER.test(L.text)) return false;
  const width = Math.max(1, e.bounds.x1 - e.bounds.x0);
  const prevFull = last.x1 >= e.bounds.x1 - 1.5 * size;
  // the line above runs on mid-sentence: it is full, or (ragged text) L's first word would not have fit after it
  const firstWord = Array.from(L.text.split(" ")[0]).length * (L.x1 - L.x0) / Math.max(1, Array.from(L.text).length);
  const runsOn = (prevFull || last.x1 + 0.3 * size + firstWord >= e.bounds.x1) && !SENTENCE_END.test(last.text);
  // "Figure 2" at the start of a line opens a caption, unless the line above runs on ("... (see")
  if (CAPTION.test(L.text) && !runsOn) return false;
  const short = last.x1 - last.x0 < 0.8 * width;
  const centred = (l) => Math.abs(center(l) - center(e.bounds)) < 0.6 * size && l.x0 > e.bounds.x0 + 1.5 * size;
  if (centred(last) && centred(L)) return true;
  const list = MARKER.test(B.lines[0].text);
  const leftRef = B.lines.length > 1 ? Math.min(...B.lines.slice(1).map((l) => l.x0)) : B.lines[0].x0;
  if (!list && L.x0 > leftRef + 0.8 * size && L.x0 - leftRef < 0.35 * width) return false;  // first-line indent
  // back at the marker's edge in upper case: a new item without a marker, unless the line above runs on
  if (list && L.x0 < B.lines[0].x0 + 0.3 * size && startsUpper(L.text) && !runsOn) return false;
  if (!prevFull && short && SENTENCE_END.test(last.text)) return false;
  if (!prevFull && last.x1 - last.x0 < 0.6 * width && startsUpper(L.text)) return false;
  return true;
}

function newBlock(page, e) {
  return { page, bounds: e.bounds, lines: [lineOf(e.frag)], size: e.frag.size, style: e.frag.style };
}

function addLine(B, f) {
  B.lines.push(lineOf(f));
  B.size = median(B.lines.map((l) => l.size));
  B.style = majorityStyle(B.lines.map((l) => ({ style: l.style, weight: lineWeight(l) })));
}

function alignOf(B) {
  const ls = B.lines;
  const b = B.bounds;
  const s = B.size;
  const centred = ls.every((l) => Math.abs(center(l) - center(b)) < 0.6 * s) && ls.some((l) => l.x0 > b.x0 + 1.5 * s);
  if (centred) return "center";
  // one line set against the right edge of its column, starting right of the centre (a chapter title)
  if (ls.length === 1 && Math.abs(ls[0].x1 - b.x1) < 1 && ls[0].x0 > center(b)) return "right";
  // right aligned: the right edges agree and the left edges differ below the first line (a justified paragraph
  // with a first-line indent has its left edge set by its other lines)
  const rest = ls.slice(1);
  if (ls.length > 1 && ls.every((l) => Math.abs(l.x1 - ls[0].x1) < 1)
    && (ls.length === 2 ? ls[0].x0 < ls[1].x0 - 2 : rest.some((l) => Math.abs(l.x0 - rest[0].x0) > 2))) {
    return "right";
  }
  return "left";
}

/** One page -> raw blocks (lines merged, not classified) and tables, in reading order. */
function pageBlocks(page) {
  const frags = buildFragments(page.items || []);
  if (!frags.length) return { blocks: [], tables: [] };
  const sizes = frags.map((f) => f.size);
  const minGutter = Math.max(4, 0.8 * median(sizes));
  const entries = [];
  cut(frags, extent(frags), entries, minGutter);
  const blocks = [];
  const tables = [];
  let B = null;
  for (const e of entries) {
    if (e.table) {
      B = null;
      const t = { page: page.index, rows: e.table.rows.length, cols: e.table.cols.length, colBox: e.table.cols, cells: [] };
      tables.push(t);
      e.table.rows.forEach((row, r) => row.forEach((frs, c) => {
        if (!frs.length) return;
        const cell = { page: page.index, bounds: e.table.cols[c], lines: [], size: frs[0].size, style: frs[0].style,
          kind: "cell", table: { t, row: r, col: c } };
        for (const f of frs) {
          if (!cell.lines.length) cell.lines.push(lineOf(f)); else addLine(cell, f);
        }
        blocks.push(cell);
        t.cells.push(cell);
      }));
      continue;
    }
    if (B && canMerge(B, e)) addLine(B, e.frag);
    else {
      B = newBlock(page.index, e);
      blocks.push(B);
    }
  }
  for (const b of blocks) {
    b.text = b.lines.reduce((acc, l) => joinText(acc, l.text), "");
    b.runs = b.lines.reduce((acc, l) => joinRuns(acc, l.runs), []);
    b.box = boxOf(b.lines);
    b.align = b.kind === "cell" ? "left" : alignOf(b);
  }
  return { blocks, tables };
}

/** The weighted most common value of xs (by weights), values rounded to 0.5. */
function mode(xs, ws) {
  const t = new Map();
  xs.forEach((x, i) => { const k = Math.round(x * 2) / 2; t.set(k, (t.get(k) || 0) + ws[i]); });
  return [...t.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function classify(blocks, pages) {
  const lines = blocks.flatMap((b) => b.lines);
  const body = mode(lines.map((l) => l.size), lines.map(lineWeight));
  const bodyLines = lines.filter((l) => Math.abs(l.size - body) < 0.5);
  const weight = (ls) => ls.reduce((a, l) => a + lineWeight(l), 0);
  const bodyBold = weight(bodyLines.filter((l) => l.style && l.style.bold)) > 0.5 * weight(bodyLines);
  const heightOf = new Map(pages.map((p) => [p.index, p.height]));
  for (const b of blocks) {
    if (b.kind === "cell") continue;
    const text = b.text;
    const bold = !!(b.style && b.style.bold);
    if (CAPTION.test(text)) b.kind = "caption";
    else if (MARKER.test(text) && !(b.lines.length === 1 && PAGE_NUMBER.test(text))) b.kind = "list";
    else if (b.size <= 0.85 * body && b.box.top >= 0.75 * (heightOf.get(b.page) || Infinity)) b.kind = "footnote";
    else if (b.lines.length <= 3 && Array.from(text).length <= 200 && !/[.,;]$/.test(text)
      && (b.size >= 1.15 * body || (bold && !bodyBold))) b.kind = "heading";
    else b.kind = "para";
  }
  const hs = [...new Set(blocks.filter((b) => b.kind === "heading").map((b) => Math.round(b.size * 2) / 2))]
    .sort((a, b) => b - a);
  for (const b of blocks) {
    if (b.kind === "heading") b.level = Math.min(3, hs.indexOf(Math.round(b.size * 2) / 2) + 1);
  }
  return body;
}

function markHeadersFooters(blocks, pages) {
  const heightOf = new Map(pages.map((p) => [p.index, p.height]));
  const inBand = (b) => {
    const h = heightOf.get(b.page);
    return b.box.bottom <= BAND * h || b.box.top >= (1 - BAND) * h;
  };
  const key = (t) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const seen = new Map();
  for (const b of blocks) {
    if (b.kind === "cell" || !inBand(b)) continue;
    if (PAGE_NUMBER.test(b.text.trim())) { b.skip = "page_number"; continue; }
    const k = key(b.text);
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k).add(b.page);
  }
  for (const b of blocks) {
    if (b.skip || b.kind === "cell" || !inBand(b)) continue;
    if (seen.get(key(b.text)).size >= 2) b.skip = "header_footer";
  }
}

function markReferences(blocks) {
  let inRefs = false;
  let refSize = 0;
  for (const b of blocks) {
    if (b.skip === "page_number" || b.skip === "header_footer") continue;
    if (inRefs) {
      // closed by the next heading of its level, or by a back-matter title whatever its size or weight
      if ((b.kind === "heading" && b.size >= refSize - 0.5 && !isStopHeading(b.text)) || isBackMatterHeading(b.text)) {
        inRefs = false;
      }
      else { b.skip = "references"; continue; }
    }
    if ((b.kind === "heading" || (b.lines.length === 1 && Array.from(b.text).length <= 40)) && isStopHeading(b.text)) {
      inRefs = true;
      refSize = b.size;
      b.skip = "references";
    }
  }
}

function markText(blocks) {
  for (const b of blocks) {
    if (b.skip) continue;
    if (!HAS_WORD.test(b.text)) b.skip = nonLatin(b.text) ? "non_latin" : "no_text";
  }
}

function markContinuations(blocks) {
  const live = blocks.filter((b) => !b.skip);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    if (a.kind !== "para") continue;
    let j = i + 1;
    while (j < live.length && (live[j].kind === "caption" || live[j].kind === "footnote") && live[j].bounds !== a.bounds) j++;
    const n = live[j];
    if (!n || n.kind !== "para" || n.bounds === a.bounds) continue;
    const last = a.lines[a.lines.length - 1];
    const full = last.x1 >= a.bounds.x1 - 1.5 * last.size || last.x1 - last.x0 >= 0.5 * (a.bounds.x1 - a.bounds.x0);
    if (full && !SENTENCE_END.test(a.text) && startsLower(n.text) && Math.abs(n.size - a.size) <= 0.15 * a.size) {
      n.cont = a.id;
    }
  }
}

/**
 * pages: [{index, width, height, items}] -> {blocks, tables, bodySize}. Block: {id, page, kind (heading | para |
 * list | caption | footnote | cell), level (headings), text, lines [{text, x0, x1, top, bottom, base, size, style}],
 * box {x0, x1, top, bottom}, bounds {x0, x1} (its column), size, align (left | center | right), style, skip ("" or
 * header_footer | page_number | references | no_text | non_latin), table ({id, row, col} for cells), cont (id of
 * the block it continues, or null)}. Table: {id, page, rows, cols, colBox: [{x0, x1}], cells: [block ids]}.
 */
export function layoutDocument(pages) {
  const blocks = [];
  const tables = [];
  for (const p of pages) {
    const r = pageBlocks(p);
    blocks.push(...r.blocks);
    tables.push(...r.tables);
  }
  blocks.forEach((b, i) => { b.id = i; b.skip = ""; b.cont = null; });
  const bodySize = blocks.length ? classify(blocks, pages) : 0;
  markHeadersFooters(blocks, pages);
  markReferences(blocks);
  markText(blocks);
  markContinuations(blocks);
  const outTables = tables.map((t, i) => ({ id: i, page: t.page, rows: t.rows, cols: t.cols, colBox: t.colBox,
    cells: t.cells.map((c) => c.id) }));
  for (const b of blocks) {
    if (b.table) b.table = { id: tables.indexOf(b.table.t), row: b.table.row, col: b.table.col };
    else b.table = null;
    b.bounds = { x0: b.bounds.x0, x1: b.bounds.x1 };
  }
  return { blocks, tables: outTables, bodySize };
}

/** Translation units: one per translatable block, a block that continues another joining its segment.
 * -> [{id, text, tagged (text with the bold / italic spans that differ from the first block's style as <gN> tags),
 * spans ({N: {bold, italic}}), blocks: [block ids], where: "Trang n", kind}]. */
export function segmentsOf(layout) {
  const segs = [];
  const segOf = new Map();
  // a run of unknown style takes its block's
  const own = (b) => (b.runs || [{ text: b.text, style: b.style }]).map((r) => ({ text: r.text, style: r.style || b.style }));
  for (const b of layout.blocks) {
    if (b.skip) continue;
    if (b.cont !== null && segOf.has(b.cont)) {
      const s = segOf.get(b.cont);
      s.text = joinText(s.text, b.text);
      s.runs = joinRuns(s.runs, own(b));
      s.blocks.push(b.id);
      segOf.set(b.id, s);
      continue;
    }
    const s = { id: segs.length, text: b.text, blocks: [b.id], where: "Trang " + (b.page + 1), kind: b.kind,
      style: b.style, runs: own(b) };
    segs.push(s);
    segOf.set(b.id, s);
  }
  return segs.map(({ runs, style, ...s }) => ({ ...s, ...taggedOf(runs, style) }));
}

/** [from, to) ranges of t (squashed) for a translation over several blocks: cut at the spaces nearest to the
 * English shares (weights). */
function cutRanges(t, weights) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const len = t.length;
  const spaces = [];
  for (let i = 0; i < len; i++) if (t[i] === " ") spaces.push(i);
  const out = [];
  let from = 0;
  let acc = 0;
  for (let k = 0; k < weights.length - 1; k++) {
    acc += weights[k];
    const target = (len * acc) / total;
    const cands = spaces.filter((i) => i >= from);
    if (!cands.length) { out.push([from, len]); from = len; continue; }
    const at = cands.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    out.push([from, at]);
    from = at + 1;
  }
  out.push([from, len]);
  return out;
}

/** A translation over several blocks: cut at the spaces nearest to the English shares (weights). */
export function splitTranslation(text, weights) {
  const t = squash(text);
  if (weights.length <= 1) return [t];
  return cutRanges(t, weights).map(([a, b]) => t.slice(a, b).trim());
}

/** The same cut for styled runs (runsOfTagged): -> one list of runs per block. */
export function splitRuns(runs, weights) {
  if (weights.length <= 1) return [runs];
  const t = runsText(runs);
  return cutRanges(t, weights).map(([a, b]) => {
    const pieces = [];
    let pos = 0;
    for (const r of runs) {
      const lo = Math.max(a, pos);
      const hi = Math.min(b, pos + r.text.length);
      if (hi > lo) pieces.push({ text: r.text.slice(lo - pos, hi - pos), style: r.style });
      pos += r.text.length;
    }
    return squashRuns(pieces);
  });
}
