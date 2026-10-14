// Text mode of the page: pasted English -> paragraphs (one per non-empty line), each a segment of the core's shape
// {id, tagged, essential, prev, nxt, where} (untagged text, so no spans kept at ladder L3: essential = []; the
// neighbouring paragraphs as context; "Đoạn <n>" as the location), and the Vietnamese back in the same line layout.
// Pure functions (no DOM, no network).
export const TEXT_LIMIT = 20000;  // characters (code points, as the server counts them)

export function charCount(text) {
  return Array.from(String(text || "")).length;
}

const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** The counter under the text box: { count, over (above TEXT_LIMIT), text }. */
export function countText(text) {
  const count = charCount(text);
  const over = count > TEXT_LIMIT;
  return { count, over, text: thousands(count) + " / " + thousands(TEXT_LIMIT) + " ký tự" + (over ? " (quá giới hạn)" : "") };
}

/** { lines (trimmed, empty ones kept), segments, fullText (what translateFile hands to prepare: the paragraphs joined
 * by newlines), lineOf (segment id -> line index) }. */
export function textSegments(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim());
  const lineOf = [];
  lines.forEach((l, i) => { if (l) lineOf.push(i); });
  const paras = lineOf.map((i) => lines[i]);
  const segments = paras.map((p, k) => ({ id: k, tagged: p, essential: [], prev: k > 0 ? paras[k - 1] : "",
    nxt: k + 1 < paras.length ? paras[k + 1] : "", where: "Đoạn " + (k + 1) }));
  return { lines, segments, fullText: paras.join("\n"), lineOf };
}

/** The Vietnamese text in the source's line layout (empty lines kept; a paragraph without a result stays empty). */
export function textOutput(t, results) {
  const out = t.lines.map(() => "");
  for (const r of results || []) {
    const line = t.lineOf[r.id];
    if (line !== undefined) out[line] = r.text || "";
  }
  return out.join("\n");
}
