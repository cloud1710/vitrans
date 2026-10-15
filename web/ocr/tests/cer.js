// Character error rate for the OCR accuracy runner (browser and Node). Test infrastructure only.
const BULLET = /^[•●▪◦·○■□∙]\s*/;

/** Edit distance (insert / delete / substitute, cost 1 each) over code points. */
export function levenshtein(a, b) {
  const s = Array.from(a), t = Array.from(b);
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

/** Lines joined by single spaces (whitespace collapsed); ocr = true drops a bullet glyph at each line start. */
export function joinLines(lines, ocr) {
  return lines.map((l) => (ocr ? String(l).trim().replace(BULLET, "") : String(l)))
    .join(" ").replace(/\s+/g, " ").trim();
}

/** Character error rate of OCR lines against reference lines. */
export function cer(truth, ocrLines) {
  const ref = joinLines(truth, false);
  return ref.length ? levenshtein(ref, joinLines(ocrLines, true)) / Array.from(ref).length : 0;
}
