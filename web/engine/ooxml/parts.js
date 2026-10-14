// Which package parts carry translatable text, in reading order, and how to label them
// (port of helper/vitranslate/ooxml/parts.py). Python's \d is any Unicode decimal digit and "." any character but LF.
import { pyInt, pyStrip, cmpStr } from "../py.js";
import { pptxStructure } from "./rels.js";
import { P } from "./ns.js";

const re = (src) => new RegExp("^(?:" + src + ")$", "u");
const D = "\\p{Nd}";
const SLIDES = re("ppt/slides/slide(" + D + "+)\\.xml");
const NOTES = re("ppt/notesSlides/notesSlide(" + D + "+)\\.xml");
const LAYOUTS = re("ppt/slideLayouts/slideLayout(" + D + "+)\\.xml");
const MASTERS = re("ppt/slideMasters/slideMaster(" + D + "+)\\.xml");
const DOCX = [re("word/document\\.xml"), re("word/header(" + D + "*)\\.xml"), re("word/footer(" + D + "*)\\.xml"),
  re("word/footnotes\\.xml"), re("word/endnotes\\.xml"), re("word/diagrams/data(" + D + "*)\\.xml"),
  re("word/diagrams/drawing(" + D + "*)\\.xml"), re("word/charts/chart(" + D + "*)\\.xml")];
const DOCX_COMMENTS = re("word/comments\\.xml");
const PPTX = [SLIDES, re("ppt/diagrams/data(" + D + "*)\\.xml"), re("ppt/diagrams/drawing(" + D + "*)\\.xml"),
  re("ppt/charts/chart(" + D + "*)\\.xml"), LAYOUTS, MASTERS];

const LABELS = [
  [SLIDES, "Slide {}"], [NOTES, "Notes {}"], [LAYOUTS, "Layout {}"], [MASTERS, "Master {}"],
  [re("[^\\n]*/diagrams/(?:data|drawing)(" + D + "*)\\.xml"), "SmartArt {}"],
  [re("[^\\n]*/charts/chart(" + D + "*)\\.xml"), "Chart {}"],
  [re("word/document\\.xml"), "Body"], [re("word/header(" + D + "*)\\.xml"), "Header {}"],
  [re("word/footer(" + D + "*)\\.xml"), "Footer {}"], [re("word/footnotes\\.xml"), "Footnotes"],
  [re("word/endnotes\\.xml"), "Endnotes"], [re("word/comments\\.xml"), "Comments"],
];

function isRealPackage(pkg) {
  return typeof pkg.bytes === "function";
}

export function selectParts(pkg, { notes = true, comments = false } = {}) {
  let patterns;
  if (pkg.kind === "docx") {
    patterns = comments ? [...DOCX, DOCX_COMMENTS] : [...DOCX];
  } else {
    patterns = [...PPTX];
    if (notes) patterns.splice(1, 0, NOTES);
  }
  const names = pkg.names();
  const struct = pkg.kind === "pptx" && isRealPackage(pkg) ? pptxStructure(pkg) : null;
  const out = [];
  for (const pat of patterns) {
    const hits = [];
    for (const name of names) {
      const m = pat.exec(name);
      if (!m) continue;
      let num = m.length > 1 && m[1] ? pyInt(m[1]) : 0;
      if (struct !== null) {
        if (pat === SLIDES) {
          if (!struct.slideNo.has(name)) continue;
          num = struct.slideNo.get(name);
        } else if (pat === NOTES) {
          if (!struct.notesNo.has(name)) continue;
          num = struct.notesNo.get(name);
        } else if (pat === LAYOUTS && !struct.usedLayouts.has(name)) {
          continue;
        } else if (pat === MASTERS && !struct.usedMasters.has(name)) {
          continue;
        }
      }
      hits.push([num, name]);
    }
    hits.sort((a, b) => (a[0] - b[0]) || cmpStr(a[1], b[1]));
    for (const [, name] of hits) out.push(name);
  }
  return out;
}

export function location(part) {
  for (const [pat, label] of LABELS) {
    const m = pat.exec(part);
    if (m) {
      const num = m.length > 1 ? (m[1] || "") : "";
      return pyStrip(label.replace("{}", num || "1"));
    }
  }
  return part;
}

/** Map part name -> display label (real slide / notes numbers for pptx). */
export function partLabels(pkg) {
  const labels = new Map();
  for (const name of pkg.names()) labels.set(name, location(name));
  if (pkg.kind === "pptx" && isRealPackage(pkg)) {
    const struct = pptxStructure(pkg);
    for (const [name, no] of struct.slideNo) labels.set(name, "Slide " + no);
    for (const [name, no] of struct.notesNo) labels.set(name, "Notes " + no);
  }
  return labels;
}

/** "w" for WordprocessingML paragraphs, "a" for DrawingML paragraphs. */
export function paragraphKind(kind, part) {
  if (kind === "docx" && !part.includes("/diagrams/") && !part.includes("/charts/")) return "w";
  return "a";
}

/** First element along a child path (ElementPath find("a/b/c")). */
export function findPath(el, steps) {
  if (!steps.length) return el;
  const [ns, name] = steps[0];
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.localName === name && (c.namespaceURI || "") === ns) {
      const hit = findPath(c, steps.slice(1));
      if (hit) return hit;
    }
  }
  return null;
}

/** Layouts / masters: skip paragraphs of placeholder shapes (prompt text never shows in a slideshow). */
export function keepParagraph(part, p) {
  if (!part.includes("slideLayout") && !part.includes("slideMaster")) return true;
  for (let el = p.parentNode; el && el.nodeType === 1; el = el.parentNode) {
    if (el.localName === "sp" && el.namespaceURI === P) {
      return findPath(el, [[P, "nvSpPr"], [P, "nvPr"], [P, "ph"]]) === null;
    }
  }
  return true;
}

