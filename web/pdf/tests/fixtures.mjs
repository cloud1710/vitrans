// Synthetic text items for the layout tests: what web/pdf/read.js hands to layout.js (viewport space at scale 1:
// origin top-left, y down; one item per run of text; widths from a fixed 0.5 em per character, so the geometry is
// exact). Synthetic text only.
export const CH = 0.5;  // width of one character in em

/** One item: str at x on the baseline `base`, font size `size`; x1 can be forced (a justified line). */
export function item(str, x, base, size = 10, o = {}) {
  const x1 = o.x1 !== undefined ? o.x1 : x + Array.from(str).length * size * CH;
  return { str, x0: x, x1, top: base - 0.75 * size, bottom: base + 0.25 * size, base, size,
    style: o.style || null };
}

/** Wrap words into lines of at most `chars` characters. */
export function wrap(text, chars) {
  const lines = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if (cur && (cur + " " + w).length > chars) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** A justified paragraph: one item per line, every line but the last stretched to x1; o.indent: first-line indent
 * (points); o.pitch: baseline distance; o.full: the last line stretched too (a paragraph cut by a column end);
 * o.ragged: no line stretched. -> { items, base: the baseline after the paragraph }. */
export function para(text, x0, x1, base, o = {}) {
  const size = o.size || 10;
  const pitch = o.pitch || 1.2 * size;
  const indent = o.indent || 0;
  const chars = Math.floor((x1 - x0 - indent) / (size * CH));
  const lines = wrap(text, chars);
  const items = lines.map((l, k) => item(l, x0 + (k === 0 ? indent : 0), base + k * pitch, size,
    { x1: (k < lines.length - 1 || o.full) && !o.ragged ? x1 : undefined, style: o.style }));
  return { items, base: base + lines.length * pitch };
}

/** A centered line in [x0, x1]. */
export function centered(str, x0, x1, base, size = 10, style) {
  const w = Array.from(str).length * size * CH;
  return item(str, (x0 + x1 - w) / 2, base, size, { style });
}

export function page(index, items, width = 595, height = 842) {
  return { index, width, height, items };
}

export const LOREM = [
  "Spindle cell tumours of soft tissue form a broad group of lesions with overlapping morphology and variable",
  "behaviour. The tumour cells are arranged in long fascicles and show mild nuclear atypia with rare mitoses.",
  "Immunohistochemistry is used to separate the main entities and molecular tests confirm the diagnosis.",
].join(" ");
export const LOREM2 = [
  "The specimens were fixed in buffered formalin and embedded in paraffin before sectioning at four microns.",
  "Sections were stained with haematoxylin and eosin and reviewed by two observers who did not know the outcome.",
].join(" ");
export const BOLD = { bold: true, italic: false, serif: false, color: [0, 0, 0], invisible: false };
