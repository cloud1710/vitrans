// Interim PPTX fit (phase 1): shrink shape text that grew in Vietnamese (port of helper/vitranslate/fit.py).
import { A } from "./ooxml/ns.js";
import { local, parentElement, findChild, getAttr, setAttr, remove, subElement, addnext, insertAt } from "./ooxml/lx.js";
import { stripTags } from "./tags.js";
import { cpLen, pyFloat, pyInt, pyRound, pyRoundN, pyStrip } from "./py.js";

export const FLOOR = 0.5;

function textBody(p) {
  for (let el = parentElement(p); el !== null; el = parentElement(el)) if (local(el) === "txBody") return el;
  return null;
}

/** fontScale is thousandths of a percent (90000) or, in newer files, a percent string ("62.5%"). */
function parseScale(value) {
  try {
    const v = pyStrip(value);
    return v.endsWith("%") ? pyFloat(v.slice(0, -1)) / 100.0 : pyInt(v) / 100000.0;
  } catch (err) {
    if (err && err.name === "ValueError") return 1.0;
    throw err;
  }
}

function currentScale(bodyPr) {
  const na = findChild(bodyPr, A, "normAutofit");
  const fs = na !== null ? getAttr(na, "", "fontScale") : null;
  return fs ? parseScale(fs) : 1.0;
}

/** wrap="none" labels stay on one line (forcing a wrap would run a second line off the slide). */
function setScale(bodyPr, scale) {
  if (getAttr(bodyPr, "", "wrap") !== "none") setAttr(bodyPr, "", "wrap", "square");
  let reduction = 0;
  const old = findChild(bodyPr, A, "normAutofit");
  if (old !== null && getAttr(old, "", "lnSpcReduction")) reduction = parseScale(getAttr(old, "", "lnSpcReduction"));
  for (const name of ["spAutoFit", "noAutofit", "normAutofit"]) {
    const o = findChild(bodyPr, A, name);
    if (o !== null) remove(o);
  }
  const na = subElement(bodyPr, A, "normAutofit");
  setAttr(na, "", "fontScale", String(pyRound(scale * 100000)));
  reduction = Math.max(reduction, scale < 0.85 ? 0.1 : 0.0);
  if (reduction > 0) setAttr(na, "", "lnSpcReduction", String(pyRound(reduction * 100000)));
  const warp = findChild(bodyPr, A, "prstTxWarp");
  if (warp !== null) addnext(warp, na);
  else insertAt(bodyPr, 0, na);
}

/** pairs: [item, outcome] for slide paragraphs (item.element / segment / location, outcome.text). Returns change
 * records for the report. */
export function fitPptx(pairs) {
  const bodies = new Map();
  for (const [item, outcome] of pairs) {
    const body = textBody(item.element);
    if (body === null) continue;
    if (!bodies.has(body)) bodies.set(body, [body, 0, 0, item.location]);
    const rec = bodies.get(body);
    rec[1] += cpLen(item.segment.plain);
    rec[2] += cpLen(stripTags(outcome.text));
  }
  const changes = [];
  for (const [body, en, vi, where] of bodies.values()) {
    if (en === 0 || vi <= en * 1.05) continue;
    const parent = parentElement(body);
    if (parent !== null && local(parent) === "tc") {
      if (vi > en * 1.3) changes.push({ where, table_cell_longer: true });
      continue;
    }
    const bodyPr = findChild(body, A, "bodyPr");
    if (bodyPr === null) continue;
    const cur = currentScale(bodyPr);
    const ratio = en / vi;
    const next = Math.max(FLOOR, Math.min(1.0, cur * (getAttr(bodyPr, "", "wrap") === "none" ? ratio : Math.sqrt(ratio))));
    if (next < cur - 0.005) {
      setScale(bodyPr, next);
      changes.push({ where, scale: pyRoundN(next, 2) });
    }
  }
  return changes;
}
