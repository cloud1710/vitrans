// Which spans of an encoded paragraph are essential (kept at ladder level 3): bold, italic, superscript / subscript,
// links (port of helper/vitranslate/translate.py is_essential, which reads the run properties). Client only: the
// translation core gets the result as plain data (TaggedSegment / translateSegments "essential" ids).
import { W } from "./ns.js";
import { children, local, getAttr, isElement } from "./lx.js";

/** is_essential(span) of the helper, on an OOXML codec Span (run properties as DOM). */
export function isEssentialSpan(span) {
  if (span.container !== null && span.container !== undefined) return true;
  const rpr = span.rpr;
  if (!rpr) return false;
  const b = getAttr(rpr, "", "b");
  const i = getAttr(rpr, "", "i");
  const baseline = getAttr(rpr, "", "baseline");
  if (b === "1" || b === "true" || i === "1" || i === "true" || (baseline !== null && baseline !== "0")) return true;
  for (const ch of children(rpr)) {
    if (!isElement(ch)) continue;
    const name = local(ch);
    if (name === "hlinkClick") return true;
    const val = getAttr(ch, W, "val");
    if ((name === "b" || name === "i") && (val === null || val === "1" || val === "true" || val === "on")) return true;
    if (name === "vertAlign" && (val === "superscript" || val === "subscript")) return true;
  }
  return false;
}

/** Sorted ids of the essential spans of a codec Segment (what a client sends with the tagged text). */
export function essentialIds(segment) {
  return [...segment.spans].filter(([, span]) => isEssentialSpan(span)).map(([n]) => n).sort((a, b) => a - b);
}
