// CTC greedy decoding of the PP-OCRv5 recognition output, as PaddleOCR's CTCLabelDecode does it: per time step the
// most probable class; a run of the same class counts once (its first step); the blank (class 0) is dropped; the
// line's score is the mean probability of the kept steps (0 when nothing is kept). The model's output is already
// softmax probabilities, shape [batch, steps, classes]. No DOM, no network.

/** The model's classes: "blank", the dictionary's entries (one per line), then " " (use_space_char). */
export function charList(dictText) {
  const lines = String(dictText).split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return ["blank"].concat(lines, [" "]);
}

/** Decode row `row` of probs (Float32Array [batch, steps, classes]) -> { text, score, steps: kept time steps }. */
export function ctcDecode(probs, steps, classes, chars, row) {
  const base = (row || 0) * steps * classes;
  let text = "";
  let sum = 0;
  const kept = [];
  let prev = -1;
  for (let t = 0; t < steps; t++) {
    const o = base + t * classes;
    let best = 0;
    let p = probs[o];
    for (let c = 1; c < classes; c++) {
      if (probs[o + c] > p) { p = probs[o + c]; best = c; }
    }
    if (best !== 0 && best !== prev) {
      text += chars[best] === undefined ? "" : chars[best];
      sum += p;
      kept.push(t);
    }
    prev = best;
  }
  return { text, score: kept.length ? sum / kept.length : 0, steps: kept };
}
