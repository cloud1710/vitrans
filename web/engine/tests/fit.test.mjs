// Port of helper/tests/test_fit.py: shrink shape text that grew in Vietnamese (normAutofit fontScale).
import "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitPptx } from "../fit.js";
import { encode } from "../ooxml/codec.js";
import { parseXml } from "../ooxml/xml.js";
import { iterElements, children, local, findChild, getAttr } from "../ooxml/lx.js";
import { A } from "../ooxml/ns.js";

const SP = `<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:txBody><a:bodyPr><a:prstTxWarp prst="textNoShape"/><a:normAutofit fontScale="90000"/><a:extLst/></a:bodyPr>
  <a:p><a:r><a:rPr lang="en-US"/><a:t>Short English line</a:t></a:r></a:p></p:txBody></p:sp>`;

const TBL = `<a:tbl xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:tr><a:tc><a:txBody><a:bodyPr/>
  <a:p><a:r><a:t>Marker</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl>`;

const NOWRAP = SP.replace("<a:bodyPr>", "<a:bodyPr wrap=\"none\">").replace("<a:normAutofit fontScale=\"90000\"/>", "<a:spAutoFit/>");

function pair(root, vi) {
  const p = iterElements(root, A, "p")[0];
  return [{ element: p, segment: encode(p), location: "Slide 1" }, { text: vi }];
}
const bodyPr = (root) => iterElements(root, A, "bodyPr")[0];
const scaleOf = (root) => Number(getAttr(findChild(bodyPr(root), A, "normAutofit"), "", "fontScale")) / 100000;

test("scales longer Vietnamese and keeps schema order", () => {
  const sp = parseXml(SP).documentElement;
  const changes = fitPptx([pair(sp, "M\u{1ed9}t d\u{f2}ng ti\u{1ebf}ng Vi\u{1ec7}t d\u{e0}i h\u{1a1}n nhi\u{1ec1}u so v\u{1edb}i g\u{1ed1}c")]);
  assert.deepEqual(children(bodyPr(sp)).map(local), ["prstTxWarp", "normAutofit", "extLst"]);
  const scale = scaleOf(sp);
  assert.ok(scale >= 0.5 && scale < 0.9, String(scale));
  assert.equal(getAttr(bodyPr(sp), "", "wrap"), "square");
  assert.ok(changes.length && changes[0].where === "Slide 1");
});

test("no change when not longer", () => {
  const sp = parseXml(SP).documentElement;
  assert.deepEqual(fitPptx([pair(sp, "Ng\u{1eaf}n")]), []);
  assert.equal(getAttr(findChild(bodyPr(sp), A, "normAutofit"), "", "fontScale"), "90000");
});

test("table cells are reported, not scaled", () => {
  const tbl = parseXml(TBL).documentElement;
  const changes = fitPptx([pair(tbl, "D\u{1ea5}u \u{1ea5}n mi\u{1ec5}n d\u{1ecb}ch h\u{1ecd}c")]);
  assert.deepEqual(changes, [{ where: "Slide 1", table_cell_longer: true }]);
  assert.equal(findChild(bodyPr(tbl), A, "normAutofit"), null);
});

test("a wrap=none label is scaled linearly and stays on one line", () => {
  const sp = parseXml(NOWRAP).documentElement;
  const changes = fitPptx([pair(sp, "x".repeat(30))]);
  assert.equal(getAttr(bodyPr(sp), "", "wrap"), "none");
  assert.ok(Math.abs(scaleOf(sp) - 18 / 30) < 0.01);
  assert.equal(changes[0].scale, 0.6);
});

test("a percent font scale is parsed", () => {
  const sp = parseXml(SP.replace("fontScale=\"90000\"", "fontScale=\"62.5%\"")).documentElement;
  fitPptx([pair(sp, "x".repeat(40))]);
  const scale = scaleOf(sp);
  assert.ok(scale >= 0.5 && scale < 0.625, String(scale));
});

test("a larger line spacing reduction is kept", () => {
  const sp = parseXml(SP.replace("fontScale=\"90000\"", "fontScale=\"90000\" lnSpcReduction=\"20000\"")).documentElement;
  fitPptx([pair(sp, "x".repeat(60))]);
  assert.equal(getAttr(findChild(bodyPr(sp), A, "normAutofit"), "", "lnSpcReduction"), "20000");
});

test("lengths count code points, as Python's len()", () => {
  // 18 source characters; 18 astral characters are 36 UTF-16 units but only 18 code points: not longer
  const sp = parseXml(SP).documentElement;
  assert.deepEqual(fitPptx([pair(sp, "\u{1d6fc}".repeat(18))]), []);
});
