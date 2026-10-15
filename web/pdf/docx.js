// The DOCX of a translated PDF (spec Amendment H, output 2: "a DOCX of the same blocks for editing"): headings,
// paragraphs, list items (their marker kept as text), captions, footnotes and simple tables in reading order, from
// a minimal template (the parts below), zipped by the M1 OOXML layer (engine/ooxml/zip.js). Pure: no DOM.
//   buildDocx({pageSize: {w, h} (points), serif, leading? (the body's baseline pitch / size: the line spacing),
//     items: [{kind: heading (level 1-3) | para | list | caption | footnote, text, runs?: [{text, bold, italic}],
//     align?} | {kind: "table", rows: [[text | {text, runs?} | null]]} | {kind: "pagebreak"}]}) -> Uint8Array
import { makeEntry, writeZip } from "../engine/ooxml/zip.js";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DECL = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n";
// eslint-disable-next-line no-control-regex
const NOT_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Text for an XML element: & < > escaped, characters XML 1.0 cannot hold dropped. */
export function xmlText(s) {
  return String(s == null ? "" : s).replace(NOT_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CONTENT_TYPES = DECL + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
  + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
  + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
  + "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>"
  + "<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>"
  + "<Override PartName=\"/word/settings.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml\"/>"
  + "<Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>"
  + "<Override PartName=\"/docProps/app.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\"/>"
  + "</Types>";

const ROOT_RELS = DECL + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
  + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>"
  + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>"
  + "<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties\" Target=\"docProps/app.xml\"/>"
  + "</Relationships>";

const DOC_RELS = DECL + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
  + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>"
  + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings\" Target=\"settings.xml\"/>"
  + "</Relationships>";

const SETTINGS = DECL + "<w:settings xmlns:w=\"" + W_NS + "\"><w:defaultTabStop w:val=\"720\"/>"
  + "<w:compat><w:compatSetting w:name=\"compatibilityMode\" w:uri=\"http://schemas.microsoft.com/office/word\" w:val=\"15\"/></w:compat>"
  + "</w:settings>";

const CORE = DECL + "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" "
  + "xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" "
  + "xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"><dc:creator>ViTranslate</dc:creator></cp:coreProperties>";

const APP = DECL + "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\">"
  + "<Application>ViTranslate</Application></Properties>";

function style(id, name, ppr, rpr, o = {}) {
  return "<w:style w:type=\"" + (o.type || "paragraph") + "\"" + (o.def ? " w:default=\"1\"" : "") + " w:styleId=\"" + id
    + "\"><w:name w:val=\"" + name + "\"/>" + (o.based ? "<w:basedOn w:val=\"" + o.based + "\"/>" : "")
    + (o.next ? "<w:next w:val=\"" + o.next + "\"/>" : "") + "<w:qFormat/>"
    + (ppr ? "<w:pPr>" + ppr + "</w:pPr>" : "") + (rpr ? "<w:rPr>" + rpr + "</w:rPr>" : "")
    + (o.tbl || "") + "</w:style>";
}

/** w:line (240ths of a line) for a leading (baseline pitch / size): Word's single line is about 1.15 x the size;
 * the template's 276 when the leading is unknown. */
export function lineOf(leading) {
  if (!(leading > 0)) return 276;
  return Math.max(240, Math.min(480, Math.round((240 * leading) / 1.15)));
}

function styles(serif, leading) {
  const font = serif ? "Times New Roman" : "Arial";
  const fonts = "<w:rFonts w:ascii=\"" + font + "\" w:hAnsi=\"" + font + "\" w:cs=\"" + font + "\" w:eastAsia=\"" + font + "\"/>";
  const border = (side) => "<w:" + side + " w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"808080\"/>";
  return DECL + "<w:styles xmlns:w=\"" + W_NS + "\"><w:docDefaults><w:rPrDefault><w:rPr>" + fonts
    + "<w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/><w:lang w:val=\"vi-VN\"/></w:rPr></w:rPrDefault>"
    + "<w:pPrDefault><w:pPr><w:spacing w:after=\"120\" w:line=\"" + lineOf(leading) + "\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault>"
    + "</w:docDefaults>"
    + style("Normal", "Normal", "", "", { def: true })
    + style("Heading1", "heading 1", "<w:keepNext/><w:spacing w:before=\"240\" w:after=\"120\"/><w:outlineLvl w:val=\"0\"/>",
      "<w:b/><w:bCs/><w:sz w:val=\"32\"/><w:szCs w:val=\"32\"/>", { based: "Normal", next: "Normal" })
    + style("Heading2", "heading 2", "<w:keepNext/><w:spacing w:before=\"200\" w:after=\"100\"/><w:outlineLvl w:val=\"1\"/>",
      "<w:b/><w:bCs/><w:sz w:val=\"28\"/><w:szCs w:val=\"28\"/>", { based: "Normal", next: "Normal" })
    + style("Heading3", "heading 3", "<w:keepNext/><w:spacing w:before=\"160\" w:after=\"80\"/><w:outlineLvl w:val=\"2\"/>",
      "<w:b/><w:bCs/><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/>", { based: "Normal", next: "Normal" })
    + style("ListParagraph", "List Paragraph", "<w:ind w:left=\"360\" w:hanging=\"360\"/>", "", { based: "Normal" })
    + style("Caption", "caption", "<w:spacing w:after=\"200\"/>", "<w:i/><w:iCs/><w:sz w:val=\"18\"/><w:szCs w:val=\"18\"/>",
      { based: "Normal", next: "Normal" })
    + style("FootnoteText", "footnote text", "<w:spacing w:after=\"0\"/>", "<w:sz w:val=\"18\"/><w:szCs w:val=\"18\"/>",
      { based: "Normal" })
    + style("TableGrid", "Table Grid", "<w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/>", "",
      { type: "table", tbl: "<w:tblPr><w:tblBorders>" + ["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")
        + "</w:tblBorders><w:tblCellMar><w:left w:w=\"108\" w:type=\"dxa\"/><w:right w:w=\"108\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr>" })
    + "</w:styles>";
}

const STYLE_OF = { list: "ListParagraph", caption: "Caption", footnote: "FootnoteText" };

function run(text, rpr) {
  return "<w:r>" + (rpr ? "<w:rPr>" + rpr + "</w:rPr>" : "") + "<w:t xml:space=\"preserve\">" + xmlText(text) + "</w:t></w:r>";
}

/** The runs of a paragraph or a cell: {text, runs?: [{text, bold, italic}]} (bold / italic true, false or null =
 * the style's); a run states "not bold" only in a heading (bold by its style), "not italic" only in a caption. */
function runs(it, kind) {
  if (!it.runs || !it.runs.length) return it.text ? run(it.text) : "";
  return it.runs.filter((r) => r.text).map((r) => {
    let rpr = "";
    if (r.bold === true) rpr += "<w:b/><w:bCs/>";
    else if (r.bold === false && kind === "heading") rpr += "<w:b w:val=\"0\"/><w:bCs w:val=\"0\"/>";
    if (r.italic === true) rpr += "<w:i/><w:iCs/>";
    else if (r.italic === false && kind === "caption") rpr += "<w:i w:val=\"0\"/><w:iCs w:val=\"0\"/>";
    return run(r.text, rpr);
  }).join("");
}

function paragraph(it) {
  const st = it.kind === "heading" ? "Heading" + Math.max(1, Math.min(3, it.level || 1)) : STYLE_OF[it.kind];
  const ppr = (st ? "<w:pStyle w:val=\"" + st + "\"/>" : "")
    + (it.align === "center" || it.align === "right" ? "<w:jc w:val=\"" + it.align + "\"/>" : "");
  return "<w:p>" + (ppr ? "<w:pPr>" + ppr + "</w:pPr>" : "") + runs(it, it.kind) + "</w:p>";
}

function table(rows, widthTw) {
  const ncols = Math.max(1, ...rows.map((r) => r.length));
  const colW = Math.floor(widthTw / ncols);
  const grid = "<w:tblGrid>" + Array.from({ length: ncols }, () => "<w:gridCol w:w=\"" + colW + "\"/>").join("") + "</w:tblGrid>";
  const body = rows.map((r) => "<w:tr>" + Array.from({ length: ncols }, (_, c) => {
    const t = r[c];
    const cell = typeof t === "string" ? { text: t } : t;
    return "<w:tc><w:tcPr><w:tcW w:w=\"" + colW + "\" w:type=\"dxa\"/></w:tcPr><w:p>" + (cell ? runs(cell, "cell") : "") + "</w:p></w:tc>";
  }).join("") + "</w:tr>").join("");
  return "<w:tbl><w:tblPr><w:tblStyle w:val=\"TableGrid\"/><w:tblW w:w=\"" + colW * ncols + "\" w:type=\"dxa\"/>"
    + "<w:tblLook w:val=\"04A0\" w:firstRow=\"1\" w:lastRow=\"0\" w:firstColumn=\"1\" w:lastColumn=\"0\" w:noHBand=\"0\" w:noVBand=\"1\"/>"
    + "</w:tblPr>" + grid + body + "</w:tbl><w:p/>";
}

export function buildDocx(model) {
  const w = Math.round((model.pageSize && model.pageSize.w ? model.pageSize.w : 595) * 20);
  const h = Math.round((model.pageSize && model.pageSize.h ? model.pageSize.h : 842) * 20);
  const landscape = w > h;
  const margin = landscape ? 720 : 1440;
  const body = (model.items || []).map((it) => {
    if (it.kind === "table") return table(it.rows || [], w - 2 * margin);
    if (it.kind === "pagebreak") return "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>";
    return paragraph(it);
  }).join("");
  const sect = "<w:sectPr><w:pgSz w:w=\"" + w + "\" w:h=\"" + h + "\"" + (landscape ? " w:orient=\"landscape\"" : "") + "/>"
    + "<w:pgMar w:top=\"" + margin + "\" w:right=\"" + margin + "\" w:bottom=\"" + margin + "\" w:left=\"" + margin
    + "\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/></w:sectPr>";
  const document = DECL + "<w:document xmlns:w=\"" + W_NS + "\" xmlns:r=\"" + R_NS + "\"><w:body>" + body
    + (body.endsWith("</w:p>") ? "" : "<w:p/>") + sect + "</w:body></w:document>";
  const utf8 = (s) => new TextEncoder().encode(s);
  return writeZip([
    makeEntry("[Content_Types].xml", utf8(CONTENT_TYPES)),
    makeEntry("_rels/.rels", utf8(ROOT_RELS)),
    makeEntry("word/document.xml", utf8(document)),
    makeEntry("word/_rels/document.xml.rels", utf8(DOC_RELS)),
    makeEntry("word/styles.xml", utf8(styles(!!model.serif, model.leading))),
    makeEntry("word/settings.xml", utf8(SETTINGS)),
    makeEntry("docProps/core.xml", utf8(CORE)),
    makeEntry("docProps/app.xml", utf8(APP)),
  ]);
}
