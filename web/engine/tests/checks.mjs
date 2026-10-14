// Unit-level checks shared by Node (tests/checks.test.mjs, xmldom) and real Chrome (tests/browser.html via
// tests/chrome.mjs, native DOMParser), so platform-only defects show up in both:
// - XML parts parsed + written back exactly as lxml does, and ill-formed parts refused with XmlParseError
//   (lxml_cases.json "xml", made by tools/export_ooxml_fixtures.py);
// - split-hyperlink clones with namespaces out of scope (lxml_cases.json "clone");
// - a damaged document.xml (one </w:p> removed from the doc.docx fixture) stops collectItems with XmlParseError.
import { parseXml, serializeXml, serializeFragment, XmlParseError } from "../ooxml/xml.js";
import { encode, apply } from "../ooxml/codec.js";
import { findChildren, is, makeElement } from "../ooxml/lx.js";
import { W } from "../ooxml/ns.js";
import { OoxmlPackage } from "../ooxml/package.js";
import { collectItems } from "../ooxml/document.js";
import { readZip, inflateEntry, makeEntry, writeZip } from "../ooxml/zip.js";

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ascii = (s) => s.replace(/[^\x20-\x7e]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function xmlChecks(cases) {
  const rows = [];
  for (const [name, c] of Object.entries(cases)) {
    let got;
    try {
      got = serializeXml(parseXml(b64(c.in)));
    } catch (err) {
      const ok = Boolean(c.error) && err instanceof XmlParseError;
      rows.push({ name: "xml " + name, ok, detail: ok ? "" : "JS threw " + (err && err.name) + ": " + String(err && err.message).slice(0, 120) });
      continue;
    }
    if (c.error) {
      rows.push({ name: "xml " + name, ok: false, detail: "lxml refuses it, JS wrote " + ascii(new TextDecoder().decode(got)).slice(0, 160) });
      continue;
    }
    const want = b64(c.out);
    const ok = got.length === want.length && got.every((b, i) => b === want[i]);
    rows.push({ name: "xml " + name, ok, detail: ok ? "" : "lxml " + ascii(new TextDecoder().decode(want)).slice(0, 200) +
      " | js " + ascii(new TextDecoder().decode(got)).slice(0, 200) });
  }
  return rows;
}

function cloneChecks(cases) {
  const rows = [];
  for (const [name, c] of Object.entries(cases)) {
    try {
      const root = parseXml(c.xml).documentElement;
      const paras = is(root, W, "p") ? [root] : findChildren(root, W, "p");
      const tagged = [];
      const fixes = [];
      paras.forEach((p, i) => {
        const seg = encode(p);
        tagged.push(seg.tagged);
        fixes.push(apply(p, seg, c.texts[i]));
      });
      const js = serializeFragment(root);
      let wellFormed = true;
      try {
        parseXml(js);
      } catch {
        wellFormed = false;
      }
      const ok = same(tagged, c.tagged) && same(fixes, c.fixes) && js === c.py && wellFormed;
      let detail = "";
      if (!ok) {
        const i = Array.from(js).findIndex((ch, k) => ch !== c.py[k]);
        detail = "well-formed " + wellFormed + "; lxml ..." + ascii(c.py.slice(Math.max(0, i - 40), i + 120)) +
          " | js ..." + ascii(js.slice(Math.max(0, i - 40), i + 120));
      }
      rows.push({ name: "clone " + name, ok, detail });
    } catch (err) {
      rows.push({ name: "clone " + name, ok: false, detail: String(err && err.stack || err).slice(0, 300) });
    }
  }
  return rows;
}

/** doc.docx with the middle </w:p> of document.xml removed (what the review used). */
export function damagedDocx(src) {
  const entries = readZip(src).entries.map((e) => {
    if (e.name !== "word/document.xml") return e;
    const xml = new TextDecoder().decode(inflateEntry(e));
    const closes = [];
    for (let i = xml.indexOf("</w:p>"); i >= 0; i = xml.indexOf("</w:p>", i + 1)) closes.push(i);
    const cut = closes[Math.floor(closes.length / 2)];
    const broken = xml.slice(0, cut) + xml.slice(cut + "</w:p>".length);
    return makeEntry(e.name, new TextEncoder().encode(broken), { time: e.time, date: e.date });
  });
  return writeZip(entries);
}

function damagedCheck(docx) {
  const pkg = new OoxmlPackage(damagedDocx(docx));
  try {
    const items = collectItems(pkg);
    return { name: "damaged document.xml is refused", ok: false, detail: "collected " + items.length + " items" };
  } catch (err) {
    const ok = err instanceof XmlParseError;
    return { name: "damaged document.xml is refused", ok, detail: ok ? "" : String(err && err.name) };
  }
}

/** makeElement with the Document itself as context (lxml: etree.Element("{urn:x}p") -> ns0:p): the per-document
 * prefix counter must key on the Document (its ownerDocument is null in browsers). */
function documentContextCheck() {
  const name = "makeElement with a Document as context";
  try {
    const doc = parseXml("<root/>");
    const el = makeElement(doc, "urn:x-test", "p");
    doc.documentElement.appendChild(el);
    const xml = serializeFragment(el);
    const ok = xml === "<ns0:p xmlns:ns0=\"urn:x-test\"/>";
    return { name, ok, detail: ok ? "" : xml };
  } catch (err) {
    return { name, ok: false, detail: String((err && err.message) || err) };
  }
}

/** All checks: cases = parsed lxml_cases.json, docx = bytes of the doc.docx fixture. Rows {name, ok, detail}. */
export function runChecks(cases, docx) {
  return [...xmlChecks(cases.xml), ...cloneChecks(cases.clone), damagedCheck(docx), documentContextCheck()];
}
