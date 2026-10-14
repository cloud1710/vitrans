// Package -> ordered list of paragraph items, each with a Segment or a skip reason
// (port of helper/vitranslate/ooxml/document.py).
import { Skip, encode } from "./codec.js";
import { A, P, W } from "./ns.js";
import { iterElements, findChild, getAttr, textOf, is, parentElement } from "./lx.js";
import { keepParagraph, location, paragraphKind, partLabels, selectParts, findPath } from "./parts.js";
import { PY_WS, pySplit, pyStrip, pyRstrip, pyLower, pyInt, hasAlpha, hasNonSpace, nonLatin } from "../py.js";

export const STOP_HEADINGS = new Set(["references", "reference", "reference list", "key references",
  "selected references", "bibliography", "literature cited", "works cited", "further reading", "suggested reading",
  "tai lieu tham khao", "t\u{e0}i li\u{1ec7}u tham kh\u{1ea3}o"]);
const NUMBERING = new RegExp("^\\p{Nd}+(?:\\.\\p{Nd}+)*[.)][" + PY_WS + "]*", "u"); // "19. ", "3) ", "4.2. "
const HAS_WORD = /[A-Za-z]{2,}/;
const TITLE_TYPES = new Set(["title", "ctrTitle"]);
const HEADING_N = new RegExp("heading[" + PY_WS + "]*(\\p{Nd}+)", "u"); // style id "Heading2" / "heading 2"
const ALL_DIGITS = /^\p{Nd}+$/u;
const UNKNOWN = -1; // heading-like style id without a level
const DEEPEST = 8; // last heading outline level (w:outlineLvl 9 means body text)

/** Own text of p: text of a nested paragraph (a text box inside a w:p) belongs to that paragraph. */
function ownText(p, kind) {
  const ns = kind === "w" ? W : A;
  const out = [];
  for (const t of iterElements(p, ns, "t")) {
    let anc = parentElement(t);
    while (anc !== p && !is(anc, ns, "p")) anc = parentElement(anc);
    if (anc === p) out.push(textOf(t) || "");
  }
  return out.join("");
}

export function isStopHeading(text) {
  let t = pySplit(pyLower(text.normalize("NFC"))).join(" ");
  t = t.replace(NUMBERING, "");
  return STOP_HEADINGS.has(pyStrip(pyRstrip(t, ":")));
}

function ancestor(el, ns, name) {
  let a = parentElement(el);
  while (a !== null && !is(a, ns, name)) a = parentElement(a);
  return a;
}

function isTitle(p) {
  const sp = ancestor(p, P, "sp");
  const ph = sp !== null ? findPath(sp, [[P, "nvSpPr"], [P, "nvPr"], [P, "ph"]]) : null;
  return ph !== null && TITLE_TYPES.has(getAttr(ph, "", "type"));
}

/** A titled slide (title / ctrTitle placeholder with text) stops only on its title: a "References:" footnote may come
 * first in shape order. An untitled slide stops on its first line of text (numbers such as a slide number are passed
 * over), unless that line is a table cell ("Reference" is a common column header). */
function referencesSlide(paras, texts) {
  const titles = texts.filter((t, i) => hasNonSpace(t) && isTitle(paras[i]));
  if (titles.length) return titles.some(isStopHeading);
  const first = texts.findIndex((t) => hasAlpha(t));
  return first >= 0 && isStopHeading(texts[first]) && ancestor(paras[first], A, "tbl") === null;
}

/** Outline level of a heading paragraph (0 = Title / Heading 1 ... 8), UNKNOWN for a heading-like style id without a
 * number, null for body text. A direct w:outlineLvl wins over the style, as in Word (9 = body text). */
function headingLevel(p) {
  const ppr = findChild(p, W, "pPr");
  if (ppr === null) return null;
  const outline = findChild(ppr, W, "outlineLvl");
  if (outline !== null && ALL_DIGITS.test(getAttr(outline, W, "val") || "")) {
    const level = pyInt(getAttr(outline, W, "val"));
    return level <= DEEPEST ? level : null;
  }
  const style = findChild(ppr, W, "pStyle");
  const name = style !== null ? pyLower(getAttr(style, W, "val") || "") : "";
  if (name === "title") return 0;
  const m = HEADING_N.exec(name);
  if (m) return Math.max(pyInt(m[1]) - 1, 0);
  return name.includes("heading") || name.includes("title") ? UNKNOWN : null;
}

/** Items {part, index, location, element, segment, skip, text} in reading order. */
export function collectItems(pkg, options = {}) {
  const items = [];
  for (const partItems of collectParts(pkg, options)) items.push(...partItems);
  return items;
}

/** collectItems one part at a time: yields the item list of each selected part, so a caller on the main thread can
 * give the event loop a turn between parts (the work of a part happens when it is asked for). */
export function* collectParts(pkg, { notes = true, comments = false } = {}) {
  const labels = partLabels(pkg); // real slide / notes numbers from p:sldIdLst + rels
  for (const part of selectParts(pkg, { notes, comments })) {
    const items = [];
    const kind = paragraphKind(pkg.kind, part);
    const root = pkg.root(part);
    const paras = iterElements(root, kind === "w" ? W : A, "p").filter((p) => keepParagraph(part, p));
    const texts = paras.map((p) => ownText(p, kind));
    const refsSlide = pkg.kind === "pptx" && part.startsWith("ppt/slides/") && referencesSlide(paras, texts);
    // DOCX: only body-level paragraphs open or close the references region. A heading stop heading closes at the next
    // heading of the same or a higher level (sub-headings of the list stay inside); a heading-like style without a
    // level counts as the stop heading's level, and a stop heading without a level closes at any heading. A plain
    // paragraph stop heading runs to the end of the body.
    const body = pkg.kind === "docx" && part === "word/document.xml" ? findChild(root, W, "body") : null;
    let inRefs = false;
    let closeAt = null; // level that closes the region, null = never
    paras.forEach((p, i) => {
      const text = texts[i];
      const item = { part, index: i, location: labels.get(part) || location(part), element: p, segment: null,
        skip: "", text };
      if (body !== null && p.parentNode === body) {
        const level = headingLevel(p);
        if (inRefs && closeAt !== null && level !== null) inRefs = !(level === UNKNOWN || level <= closeAt);
        if (!inRefs && isStopHeading(text)) {
          inRefs = true;
          closeAt = level === null ? null : (level === UNKNOWN ? DEEPEST : level);
        }
      }
      if (refsSlide || inRefs) {
        item.skip = "references";
      } else if (!HAS_WORD.test(text)) {
        item.skip = nonLatin(text) ? "non_latin" : "no_text";
      } else {
        try {
          item.segment = encode(p);
          if (item.segment === null) item.skip = "no_text";
        } catch (err) {
          if (!(err instanceof Skip)) throw err;
          item.skip = err.message;
        }
      }
      items.push(item);
    });
    yield items;
  }
}
