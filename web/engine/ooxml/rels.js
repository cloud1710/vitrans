// Relationship (.rels) reading: resolve targets and derive the pptx slide structure
// (port of helper/vitranslate/ooxml/rels.py).
import { parseXml } from "./xml.js";
import { iterElements, getAttr } from "./lx.js";
import { P, R, PKG_REL } from "./ns.js";

/** posixpath.normpath */
export function normpath(path) {
  if (path === "") return ".";
  let initial = path.startsWith("/") ? 1 : 0;
  if (initial && path.startsWith("//") && !path.startsWith("///")) initial = 2;
  const out = [];
  for (const comp of path.split("/")) {
    if (comp === "" || comp === ".") continue;
    if (comp !== ".." || (!initial && out.length === 0) || (out.length && out[out.length - 1] === "..")) out.push(comp);
    else if (out.length) out.pop();
  }
  const joined = "/".repeat(initial) + out.join("/");
  return joined || ".";
}

/** posixpath.split */
function split(p) {
  const i = p.lastIndexOf("/") + 1;
  let head = p.slice(0, i);
  const tail = p.slice(i);
  if (head && head !== "/".repeat(head.length)) head = head.replace(/\/+$/, "");
  return [head, tail];
}

/** posixpath.join for two parts */
function join(a, b) {
  if (b.startsWith("/")) return b;
  if (!a || a.endsWith("/")) return a + b;
  return a + "/" + b;
}

/** rId -> resolved target part name for the internal relationships of `part` (a Map, in document order). */
export function relsTargets(pkg, part) {
  const [folder, base] = split(part);
  const raw = pkg.bytes(join(join(folder, "_rels"), base + ".rels"));
  const out = new Map();
  if (raw === undefined) return out;
  for (const rel of iterElements(parseXml(raw).documentElement, PKG_REL, "Relationship")) {
    if (getAttr(rel, "", "TargetMode") === "External") continue;
    const target = getAttr(rel, "", "Target") || "";
    const resolved = target.startsWith("/") ? normpath(target.replace(/^\/+/, "")) : normpath(join(folder, target));
    out.set(getAttr(rel, "", "Id"), resolved);
  }
  return out;
}

/** slideNo / notesNo (Maps part -> number) and usedLayouts / usedMasters (Sets) of a pptx package. */
export function pptxStructure(pkg) {
  const pres = "ppt/presentation.xml";
  const slideNo = new Map();
  if (pkg.has(pres)) {
    const targets = relsTargets(pkg, pres);
    const root = parseXml(pkg.bytes(pres)).documentElement;
    let n = 0;
    for (const sld of iterElements(root, P, "sldId")) {
      const target = targets.get(getAttr(sld, R, "id"));
      if (target && pkg.has(target)) {
        n += 1;
        slideNo.set(target, n);
      }
    }
  }
  const notesNo = new Map();
  const usedLayouts = new Set();
  for (const [slide, no] of slideNo) {
    for (const target of relsTargets(pkg, slide).values()) {
      if (target.startsWith("ppt/notesSlides/")) {
        if (!notesNo.has(target)) notesNo.set(target, no);
      } else if (target.startsWith("ppt/slideLayouts/")) {
        usedLayouts.add(target);
      }
    }
  }
  const usedMasters = new Set();
  for (const layout of usedLayouts) {
    for (const target of relsTargets(pkg, layout).values()) {
      if (target.startsWith("ppt/slideMasters/")) usedMasters.add(target);
    }
  }
  return { slideNo, notesNo, usedLayouts, usedMasters };
}
