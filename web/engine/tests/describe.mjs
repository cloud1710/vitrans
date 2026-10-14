// Port of helper/tests/describe.py: the visible structure of a paragraph, used to prove that encode + apply(identity)
// changes nothing visible.
import { aSig, wSig } from "../ooxml/codec.js";
import { A, W } from "../ooxml/ns.js";
import { children, local, nsOf, findChild, findChildren, textOf } from "../ooxml/lx.js";
import { pySplit, isSpace } from "../py.js";

const W_INVISIBLE = new Set(["pPr", "proofErr", "bookmarkStart", "bookmarkEnd", "commentRangeStart", "commentRangeEnd",
  "permStart", "permEnd"]);

function clark(a) {
  return a.namespaceURI ? "{" + a.namespaceURI + "}" + a.localName : a.localName;
}

function containerKey(el) {
  if (!el) return "";
  const attrs = Array.from(el.attributes).filter((a) => a.namespaceURI !== "http://www.w3.org/2000/xmlns/")
    .map((a) => [clark(a), a.localName, a.value]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return local(el) + ":" + attrs.map((a) => a[1] + "=" + a[2]).join(",");
}

const blank = (t) => Array.from(t).every(isSpace);

export function describe(p) {
  const entries = [];
  const fixed = [];
  const text = [];
  const add = (key, t) => {
    text.push(t);
    if (blank(t)) return;
    if (entries.length && entries[entries.length - 1][0] === key) entries[entries.length - 1][1] += t;
    else entries.push([key, t]);
  };
  const mark = (name) => {
    fixed.push(name);
    text.push("{" + name + "}");
  };
  if (nsOf(p) === A) {
    for (const ch of children(p)) {
      const n = local(ch);
      if (n === "pPr" || n === "endParaRPr") continue;
      if (n === "r") {
        const runText = findChildren(ch, A, "t").map((t) => textOf(t) || "").join("");
        add(aSig(findChild(ch, A, "rPr"), runText), runText);
      } else {
        mark(n);
      }
    }
  } else {
    const walk = (kids, container) => {
      for (const ch of kids) {
        const n = local(ch);
        if (W_INVISIBLE.has(n)) continue;
        if (n === "smartTag" || n === "customXml") {
          walk(children(ch).filter((k) => local(k) !== "smartTagPr" && local(k) !== "customXmlPr"), container);
        } else if (n === "hyperlink") {
          walk(children(ch), ch);
        } else if (n === "r") {
          const sig = wSig(findChild(ch, W, "rPr")) + "|" + containerKey(container);
          for (const k of children(ch)) {
            const kn = local(k);
            if (kn === "t") add(sig, textOf(k) || "");
            else if (kn !== "rPr" && kn !== "lastRenderedPageBreak") mark(container ? containerKey(container) + "/" + kn : kn);
          }
        } else {
          mark(n);
        }
      }
    };
    walk(children(p), null);
  }
  return [text.join(""), entries.map(([k, t]) => [k, pySplit(t).join("")]), fixed];
}
