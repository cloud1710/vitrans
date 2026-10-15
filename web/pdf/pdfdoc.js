// The pdf-lib side of the PDF path (spec Amendment H): open the original with pdf-lib 1.17.1 (vendored, MIT), give
// content.js what it needs to follow each page (font metrics from the font dictionaries, forms and images), write the
// edited content streams back, and draw the Vietnamese with an embedded Unicode font (Noto Sans / Noto Serif, OFL,
// subset at write time by pdf-lib + fontkit). The library object PL is passed in (web/pdf/libs.js loads it).
// Font metrics: simple fonts from /FirstChar + /Widths (Type3 scaled by /FontMatrix), the standard 14 fonts without
// /Widths from pdf-lib's own AFM metrics through the font's encoding (+ /Differences), Type0 fonts from /W + /DW of
// the descendant with Identity-H / -V or an embedded CMap (code space ranges, cid ranges). Anything else: widths
// unknown (content.js then makes a removed string invisible instead of moving the text after it).
import { analyze, rewrite } from "./content.js";

export class PdfError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PdfError";
    this.code = code;
  }
}

/** pdf-lib's document, or PdfError "encrypted" / "unsupported_pdf". */
export async function openPdfLib(PL, bytes) {
  try {
    return await PL.PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/encrypt/i.test(msg)) throw new PdfError("the PDF is encrypted", "encrypted");
    throw new PdfError("pdf-lib could not read the PDF (" + msg.slice(0, 200) + ")", "unsupported_pdf");
  }
}

// ---------------------------------------------------------------- pdf-lib object helpers

function helpers(PL, doc) {
  const ctx = doc.context;
  const look = (o) => (o instanceof PL.PDFRef ? ctx.lookup(o) : o);
  const get = (dict, key) => (dict instanceof PL.PDFDict ? look(dict.get(PL.PDFName.of(key))) : undefined);
  const nameOf = (v) => (v instanceof PL.PDFName
    ? v.asString().slice(1).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : undefined);
  const numOf = (v) => (v instanceof PL.PDFNumber ? v.asNumber() : undefined);
  const arrOf = (v) => (v instanceof PL.PDFArray ? v.asArray().map(look) : undefined);
  const streamBytes = (s) => {
    if (s instanceof PL.PDFRawStream) return PL.decodePDFRawStream(s).decode();
    if (s && typeof s.getUnencodedContents === "function") return s.getUnencodedContents();
    if (s && typeof s.getContents === "function") return s.getContents();
    return new Uint8Array(0);
  };
  return { ctx, look, get, nameOf, numOf, arrOf, streamBytes };
}

// ---------------------------------------------------------------- font metrics

const STANDARD = ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique", "Helvetica", "Helvetica-Bold",
  "Helvetica-Oblique", "Helvetica-BoldOblique", "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
  "Symbol", "ZapfDingbats"];

/** The standard 14 font a base font name stands for (Arial -> Helvetica ...), or null. */
export function standardName(base) {
  const n = String(base || "").replace(/^[A-Z]{6}\+/, "");
  if (STANDARD.includes(n)) return n;
  if (/symbol/i.test(n)) return "Symbol";
  if (/dingbat/i.test(n)) return "ZapfDingbats";
  const bold = /bold|black|heavy|semibold|demi/i.test(n);
  const ital = /italic|oblique/i.test(n);
  let fam = null;
  if (/courier/i.test(n)) fam = "Courier";
  else if (/times/i.test(n)) fam = "Times";
  else if (/arial|helvetica/i.test(n)) fam = "Helvetica";
  if (!fam) return null;
  if (fam === "Times") return "Times-" + (bold && ital ? "BoldItalic" : bold ? "Bold" : ital ? "Italic" : "Roman");
  return fam + (bold && ital ? "-BoldOblique" : bold ? "-Bold" : ital ? "-Oblique" : "");
}

const standardCache = new Map();
function standardWidths(PL, std, differences) {
  // code -> width from pdf-lib's metrics through the font's encoding (pdf-lib: WinAnsi; Symbol / ZapfDingbats: their
  // own); /Differences give glyph names for codes directly
  const emb = PL.StandardFontEmbedder.for(std);
  let byCode = standardCache.get(std);
  if (!byCode) {
    byCode = new Map();
    for (const [, v] of Object.entries(emb.encoding.unicodeMappings || {})) {
      if (Array.isArray(v) && !byCode.has(v[0])) byCode.set(v[0], v[1]);
    }
    standardCache.set(std, byCode);
  }
  return (code) => {
    const glyph = (differences && differences.get(code)) || byCode.get(code);
    if (!glyph) return null;
    const w = emb.font.getWidthOfGlyph(glyph);
    return typeof w === "number" ? w : null;
  };
}

function parseDifferences(h, enc) {
  const diffs = h.arrOf(h.get(enc, "Differences"));
  if (!diffs) return null;
  const map = new Map();
  let code = 0;
  for (const v of diffs) {
    const n = h.numOf(v);
    if (n !== undefined) code = n;
    else { const name = h.nameOf(v); if (name) map.set(code++, name); }
  }
  return map;
}

/** An embedded CMap's code space ranges and code -> CID mappings. */
function parseCMap(text) {
  const hexes = (s) => (s.match(/<([0-9a-fA-F]+)>/g) || []).map((x) => x.slice(1, -1));
  const ranges = [];
  for (const m of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    const h = hexes(m[1]);
    for (let i = 0; i + 1 < h.length; i += 2) {
      ranges.push({ len: h[i].length / 2, lo: parseInt(h[i], 16), hi: parseInt(h[i + 1], 16) });
    }
  }
  const cids = [];
  for (const m of text.matchAll(/begincidrange([\s\S]*?)endcidrange/g)) {
    for (const r of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\d+)/g)) {
      cids.push({ lo: parseInt(r[1], 16), hi: parseInt(r[2], 16), cid: parseInt(r[3], 10) });
    }
  }
  for (const m of text.matchAll(/begincidchar([\s\S]*?)endcidchar/g)) {
    for (const r of m[1].matchAll(/<([0-9a-fA-F]+)>\s*(\d+)/g)) {
      const c = parseInt(r[1], 16);
      cids.push({ lo: c, hi: c, cid: parseInt(r[2], 10) });
    }
  }
  return { ranges, cids };
}

function cidWidths(h, desc) {
  const map = new Map();
  const W = h.arrOf(h.get(desc, "W")) || [];
  for (let i = 0; i < W.length;) {
    const first = h.numOf(W[i]);
    const next = W[i + 1];
    if (first === undefined) { i += 1; continue; }
    const list = h.arrOf(next);
    if (list) {
      list.forEach((w, k) => { const n = h.numOf(w); if (n !== undefined) map.set(first + k, n); });
      i += 2;
    } else {
      const last = h.numOf(next);
      const w = h.numOf(W[i + 2]);
      if (last !== undefined && w !== undefined && last - first < 65536) for (let c = first; c <= last; c++) map.set(c, w);
      i += 3;
    }
  }
  const dw = h.numOf(h.get(desc, "DW"));
  return { map, dw: dw === undefined ? 1000 : dw };
}

/** {codeBytes, split?, width(code), bold, italic, serif, name, vertical} of a font dictionary. */
export function fontInfo(PL, doc, dict) {
  const h = helpers(PL, doc);
  const sub = h.nameOf(h.get(dict, "Subtype")) || "";
  const base = (h.nameOf(h.get(dict, "BaseFont")) || "").replace(/^[A-Z]{6}\+/, "");
  const info = { codeBytes: 1, width: () => null, name: base, vertical: false };
  let desc = h.get(dict, "FontDescriptor");
  if (sub === "Type0") {
    const d0 = (h.arrOf(h.get(dict, "DescendantFonts")) || [])[0];
    desc = h.get(d0, "FontDescriptor");
    const { map, dw } = cidWidths(h, d0);
    const width = (cid) => (map.has(cid) ? map.get(cid) : dw);
    const enc = h.get(dict, "Encoding");
    const encName = h.nameOf(enc);
    if (encName) {
      info.vertical = /-V$/.test(encName);
      if (/^Identity-[HV]$/.test(encName)) { info.codeBytes = 2; info.width = width; }
      else if (/UCS2|UTF16/.test(encName)) info.codeBytes = 2;  // code -> CID unknown: widths unknown
      else info.split = (bytes) => Array.from(bytes, (c) => ({ code: c, bytes: 1 }));
    } else if (enc) {
      let text = "";
      try { text = Array.from(h.streamBytes(enc), (c) => String.fromCharCode(c)).join(""); } catch (e) { text = ""; }
      const cm = parseCMap(text);
      info.vertical = /\/WMode\s+1/.test(text);
      const lens = [...new Set(cm.ranges.map((r) => r.len))];
      if (lens.length === 1) info.codeBytes = lens[0] === 2 ? 2 : 1;
      if (lens.length > 1 || (lens[0] && lens[0] > 2)) {
        info.split = (bytes) => {
          const out = [];
          for (let i = 0; i < bytes.length;) {
            let len = 1;
            for (const r of cm.ranges.sort((a, b) => a.len - b.len)) {
              if (i + r.len > bytes.length) continue;
              let v = 0;
              for (let k = 0; k < r.len; k++) v = v * 256 + bytes[i + k];
              if (v >= r.lo && v <= r.hi) { len = r.len; break; }
            }
            let v = 0;
            for (let k = 0; k < len; k++) v = v * 256 + bytes[i + k];
            out.push({ code: v, bytes: len });
            i += len;
          }
          return out;
        };
      }
      if (cm.cids.length) {
        info.width = (code) => {
          const r = cm.cids.find((x) => code >= x.lo && code <= x.hi);
          return r ? width(r.cid + (code - r.lo)) : null;
        };
      }
    }
  } else {
    const first = h.numOf(h.get(dict, "FirstChar"));
    const widths = h.arrOf(h.get(dict, "Widths"));
    const missing = h.numOf(h.get(desc, "MissingWidth"));
    let scale = 1;
    if (sub === "Type3") {
      const fm = h.arrOf(h.get(dict, "FontMatrix"));
      scale = fm && h.numOf(fm[0]) !== undefined ? h.numOf(fm[0]) * 1000 : 1;
    }
    if (widths && first !== undefined) {
      const ws = widths.map((w) => h.numOf(w));
      info.width = (code) => {
        const w = ws[code - first];
        if (w !== undefined && w !== null) return w * scale;
        return missing !== undefined ? missing * scale : null;
      };
    } else {
      const std = standardName(base);
      if (std) {
        const enc = h.get(dict, "Encoding");
        info.width = standardWidths(PL, std, enc instanceof PL.PDFDict ? parseDifferences(h, enc) : null);
      }
    }
  }
  const flags = h.numOf(h.get(desc, "Flags")) || 0;
  const weight = h.numOf(h.get(desc, "FontWeight")) || 0;
  const angle = h.numOf(h.get(desc, "ItalicAngle")) || 0;
  info.bold = /bold|black|heavy|semibold|demi|extrabold|ultra/i.test(base) || (flags & 0x40000) !== 0 || weight >= 600;
  info.italic = /italic|oblique|slanted/i.test(base) || (flags & 0x40) !== 0 || angle !== 0;
  info.serif = sub !== "Type3" && !/sans|arial|helvetica|calibri|verdana|tahoma|segoe|roboto|gothic|grotesk/i.test(base)
    && ((flags & 2) !== 0 || /times|serif|roman|georgia|garamond|cambria|minion|palatino|book|century|baskerville|caslon|charter|utopia|constantia|sabon|janson|perpetua|didot|bodoni|plantin|stix|cmr|lmroman|nimbusrom/i.test(base));
  return info;
}

// ---------------------------------------------------------------- content analysis of a page

function makeCtx(PL, doc, resources, caches) {
  const h = helpers(PL, doc);
  return {
    font(name) {
      const fonts = h.get(resources, "Font");
      if (!(fonts instanceof PL.PDFDict)) return null;
      const raw = fonts.get(PL.PDFName.of(name));
      const dict = h.look(raw);
      if (!(dict instanceof PL.PDFDict)) return null;
      const key = raw instanceof PL.PDFRef ? raw.toString() : dict;
      if (!caches.fonts.has(key)) {
        let info = null;
        try { info = fontInfo(PL, doc, dict); } catch (e) { info = null; }
        caches.fonts.set(key, info);
      }
      return caches.fonts.get(key);
    },
    xobject(name) {
      const xos = h.get(resources, "XObject");
      if (!(xos instanceof PL.PDFDict)) return null;
      const raw = xos.get(PL.PDFName.of(name));
      const stream = h.look(raw);
      if (!stream || !stream.dict) return null;
      const sub = h.nameOf(h.get(stream.dict, "Subtype"));
      if (sub === "Image") return { kind: "image" };
      if (sub !== "Form" || !(raw instanceof PL.PDFRef)) return null;
      const key = "form:" + raw.toString();
      if (!caches.forms.has(key)) {
        let bytes;
        try { bytes = h.streamBytes(stream); } catch (e) { return null; }
        const m = (h.arrOf(h.get(stream.dict, "Matrix")) || []).map((v) => h.numOf(v));
        const own = h.get(stream.dict, "Resources");
        caches.forms.set(key, { kind: "form", key, ref: raw, bytes,
          matrix: m.length === 6 && m.every((v) => typeof v === "number") ? m : [1, 0, 0, 1, 0, 0],
          ctx: makeCtx(PL, doc, own instanceof PL.PDFDict ? own : resources, caches) });
      }
      return caches.forms.get(key);
    },
  };
}

/** The content analysis of a page (content.js analyze over its joined content streams, key "page:<index>"), plus
 * {forms: Map(key -> {ref})}. Shared caches (fonts, forms) may be passed for the whole document. */
export function analyzePage(PL, doc, page, index, caches) {
  const h = helpers(PL, doc);
  const c = caches || { fonts: new Map(), forms: new Map() };
  const contents = h.look(page.node.get(PL.PDFName.of("Contents")));
  const parts = contents instanceof PL.PDFArray ? contents.asArray().map(h.look) : contents ? [contents] : [];
  const chunks = parts.map((s) => h.streamBytes(s));
  const total = chunks.reduce((a, b) => a + b.length + 1, 0);
  const bytes = new Uint8Array(total);
  let p = 0;
  for (const ch of chunks) { bytes.set(ch, p); p += ch.length; bytes[p++] = 0x0a; }
  const resources = page.node.Resources();
  const r = analyze(bytes, makeCtx(PL, doc, resources, c), { key: "page:" + index });
  r.forms = c.forms;
  return r;
}

/** Write the edited streams back: a page's new content as one Flate stream, a form's in place (same dictionary,
 * new data). analyses: per page, in page order (each carries the streams it followed). */
export function applyEdits(PL, doc, analyses, edits) {
  const pages = doc.getPages();
  for (const [key, ops] of edits) {
    if (!ops.size) continue;
    const a = analyses.find((x) => x && x.streams[key]);
    if (!a) continue;
    const s = a.streams[key];
    const out = rewrite(s.bytes, s.ops, ops, s.info);
    if (key.startsWith("page:")) {
      const page = pages[Number(key.slice(5))];
      const ref = doc.context.register(doc.context.flateStream(out));
      page.node.set(PL.PDFName.of("Contents"), ref);
      continue;
    }
    const form = a.forms && a.forms.get(key);
    if (!form) continue;
    const old = doc.context.lookup(form.ref);
    const entries = {};
    for (const [k, v] of old.dict.entries()) {
      const name = k.asString().slice(1);
      if (!["Length", "Filter", "DecodeParms", "DL"].includes(name)) entries[name] = v;
    }
    doc.context.assign(form.ref, doc.context.flateStream(out, entries));
  }
}

// ---------------------------------------------------------------- drawing the Vietnamese

// characters the Noto subsets lack: the standard Symbol font has them (not embedded: every viewer has it)
const ASCII_FALLBACK = { "≤": "<=", "≥": ">=", "→": "->", "←": "<-", "≈": "~", "≠": "!=",
  "∞": "inf", "√": "sqrt", "∑": "sum", "∆": "delta",
  // list bullets the Noto subsets lack: the bullet they have
  "\u25cf": "\u2022", "\u25aa": "\u2022", "\u25a0": "\u2022", "\u25e6": "\u2022", "\u25cb": "\u2022" };

/** Embedded faces of one document: prepare(faces) embeds them (subset), then measure / runs work synchronously. */
export class FontSet {
  constructor(PL, doc, loadFace) {
    this.PL = PL;
    this.doc = doc;
    this.loadFace = loadFace;
    this.faces = new Map();
    this.sets = new Map();
    this.symbol = null;
  }

  async prepare(faces) {
    for (const f of faces) {
      if (this.faces.has(f)) continue;
      const font = await this.doc.embedFont(await this.loadFace(f), { subset: true });
      this.faces.set(f, font);
      this.sets.set(f, new Set(font.getCharacterSet()));
    }
    if (!this.symbol) {
      this.symbol = await this.doc.embedFont(this.PL.StandardFonts.Symbol);
      this.symbolSet = new Set(this.symbol.getCharacterSet());
    }
  }

  /** text -> [{text, font}] runs: the face where it has the glyph, else the Symbol font, else an ASCII stand-in. */
  runs(text, face) {
    const font = this.faces.get(face) || this.faces.values().next().value;
    const set = this.sets.get(face) || this.sets.values().next().value;
    const out = [];
    const push = (t, f) => {
      const last = out[out.length - 1];
      if (last && last.font === f) last.text += t; else out.push({ text: t, font: f });
    };
    for (const ch of String(text).normalize("NFC")) {
      const cp = ch.codePointAt(0);
      if (set.has(cp)) push(ch, font);
      else if (this.symbolSet.has(cp)) push(ch, this.symbol);
      else if (ASCII_FALLBACK[ch]) push(ASCII_FALLBACK[ch], font);
      else if (/\s/.test(ch)) push(" ", font);
      else push("?", font);
    }
    return out;
  }

  measure(text, size, face) {
    return this.runs(text, face).reduce((a, r) => a + r.font.widthOfTextAtSize(r.text, size), 0);
  }
}

/** One line of text with its baseline origin (x, y) in user space, rotated by `rotate` degrees. */
export function drawLine(PL, page, fonts, line) {
  const rad = (line.rotate || 0) * Math.PI / 180;
  let x = line.x;
  let y = line.y;
  const color = PL.rgb(...(line.color || [0, 0, 0]));
  for (const r of fonts.runs(line.text, line.face)) {
    page.drawText(r.text, { x, y, size: line.size, font: r.font, color, rotate: PL.degrees(line.rotate || 0) });
    const w = r.font.widthOfTextAtSize(r.text, line.size);
    x += w * Math.cos(rad);
    y += w * Math.sin(rad);
  }
}

/** A filled rectangle [x0, y0, x1, y1] (user space) in the colour rgb. */
export function drawCover(PL, page, box, rgb) {
  page.drawRectangle({ x: box[0], y: box[1], width: box[2] - box[0], height: box[3] - box[1], color: PL.rgb(...rgb),
    borderWidth: 0 });
}
