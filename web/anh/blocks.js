// OCR lines -> blocks for the image tool: a paragraph, a bullet, a title or a table cell becomes one block, which is
// one segment for the cloud core and one region for the Vietnamese drawn over the photo. Geometry is measured in the
// text's own direction (the boxes turned back by their median angle); a line's region is the part the recognizer
// read (an unread end of half a line height or more, such as a drawn bullet, is cut off: the OCR's span). Rules:
// 1. a bullet read as its own small box (only bullet glyphs, at most two line heights wide) becomes the bullet of the
//    line to its right on the same row;
// 2. pieces of one line (same row, similar height, a gap under 0.8 line heights) are joined;
// 3. a line joins an open block when it sits right under the block's last line (gap <= 0.6 line heights), the heights
//    differ by at most 1.4x, the two overlap horizontally by half the narrower one, it does not start a bullet or a
//    numbered item, and the last line does not end the block: a short line (under 5 line heights) followed by a line
//    that does not start in lower case (table cells, labels), or a sentence end on a line shorter than 70 % of the
//    block's widest line (a paragraph's last line);
// 4. block text: lines joined by spaces (a line ending in "-" joins without one), the bullet glyph kept aside;
// 5. kept as they are (not sent): blocks with no word of two letters ("symbols") and Vietnamese blocks ("vi").
// No DOM, no network.
import { medianAngle, quadAngle, turnedBounds } from "../ocr/order.js";

const BULLETS = "•●▪◦·○■□∙▶►➢✓✔‣⁃";
const BULLET_AT_START = new RegExp("^([" + BULLETS + "*\\-–—>])\\s+");
const ONLY_BULLETS = new RegExp("^[" + BULLETS + "*\\-–—>]+$");
const NUMBERED = /^(\d{1,2}|[a-zA-Z]|[ivxIVX]{1,4})[.)]\s+/;
const SENTENCE_END = /[.!?:;]["')\]]?$/;

// Vietnamese: letters English never has (the ones PaddleOCR's English dictionary lacks are the strongest), or common
// Vietnamese words as they read without their marks (none of them an English word)
const VI_LETTERS = /[ăđơưĩũẠ-ỹ]/i;
const VI_SOFT = /[àáâãèéêìíòóôõùúý]/i;
const VI_WORDS = new Set(("cua va cac duoc trong nhung khong nguoi mot voi cho nay theo tu den nhu hoac khi sau truoc "
  + "benh nhan nghien cuu ket qua phuong phap dieu tri chan doan giai phau hoc bao dang thuoc nhom muc tieu lieu ty "
  + "nam thang ngay viet tieng chung toi nhieu ve tai bang khac cung dong thi neu tren duoi giua lam xet nghiem hinh "
  + "anh doi tuong gia dinh thoi gian ung thu tre em phu nu sinh vien truong khoa vien quan ly nhung chuong muc luc "
  + "tong hop dac diem lam sang can lam sang ty le phan tram trung binh do lech chuan").split(" "));

/** True when the text is Vietnamese (with or without its marks). */
export function isVietnamese(text) {
  const t = String(text || "");
  if (VI_LETTERS.test(t)) return true;
  const words = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]+/g) || [];
  if (!words.length) return false;
  const vi = words.filter((w) => VI_WORDS.has(w)).length;
  if (vi >= 2 && vi / words.length >= 0.4) return true;
  const soft = (t.match(new RegExp(VI_SOFT.source, "gi")) || []).length;
  return soft >= 2 && soft / words.length >= 0.15;
}

const lettersOf = (s) => (String(s).match(/\p{L}/gu) || []).length;
const height = (q) => (Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) + Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])) / 2;
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const vOverlap = (a, b) => Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
const hOverlap = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]);

// The part of a line's rectangle that holds the read text: an end the recognizer did not read (span from the OCR,
// fractions of the box's length) is cut off when it is at least half a line height long (a drawn bullet, an icon).
function readRect(rect, span, h) {
  if (!span) return rect;
  const w = rect[2] - rect[0];
  const x0 = span[0] * w >= 0.5 * h ? rect[0] + span[0] * w : rect[0];
  const x1 = (1 - span[1]) * w >= 0.5 * h ? rect[0] + span[1] * w : rect[2];
  return x1 > x0 ? [x0, rect[1], x1, rect[3]] : rect;
}

function joinText(a, b) {
  if (!a) return b;
  return /-$/.test(a) && !/\s-$/.test(a) ? a + b : a + " " + b;
}

/**
 * Blocks of OCR lines ({ text, box, quad } in reading order):
 * [{ id, lines: line indices, text, bullet (glyph | null), bulletInText (the glyph is inside the line's box),
 *    box: [x0, y0, x1, y1] in the image, rect: the same in the text's frame, angle (radians), quads, lineRects,
 *    height (median line height), keep: null | "vi" | "symbols" }]
 */
export function groupBlocks(ocrLines) {
  const angle = medianAngle(ocrLines.map((l) => l.quad));
  let lines = ocrLines.map((l, i) => {
    const m = String(l.text).trim().match(BULLET_AT_START);
    return { idx: [i], text: m ? String(l.text).trim().slice(m[0].length) : String(l.text).trim(),
      bullet: m ? m[1] : null, bulletInText: !!m, rect: readRect(turnedBounds(l.quad, angle), l.span, height(l.quad)),
      quads: [l.quad], box: l.box, h: height(l.quad), list: NUMBERED.test(String(l.text).trim()) };
  });
  // 1. lone bullet glyphs -> the bullet of the line to their right
  const markers = new Set();
  lines.forEach((m, i) => {
    if (!ONLY_BULLETS.test(m.text) && !(m.bullet && !m.text)) return;
    if (m.rect[2] - m.rect[0] > 2 * m.h) return;
    const glyph = m.bullet || m.text[0];
    const target = lines.find((l, j) => j !== i && !markers.has(j) && l.text && !ONLY_BULLETS.test(l.text)
      && vOverlap(l.rect, m.rect) >= 0.5 * Math.min(l.rect[3] - l.rect[1], m.rect[3] - m.rect[1])
      && l.rect[0] >= m.rect[0] && l.rect[0] - m.rect[2] <= 3 * Math.max(m.h, l.h));
    if (!target) return;
    target.bullet = glyph;
    markers.add(i);
  });
  lines = lines.filter((l, i) => !markers.has(i) && l.text);
  // 2. pieces of one line
  const joined = [];
  for (const l of lines) {
    const p = joined[joined.length - 1];
    if (p && !l.bullet && !l.list) {
      const hMin = Math.min(p.h, l.h), hMax = Math.max(p.h, l.h);
      const gap = l.rect[0] - p.rect[2];
      if (vOverlap(p.rect, l.rect) >= 0.6 * hMin && hMax / hMin <= 1.3 && gap >= -0.5 * hMin && gap <= 0.8 * hMin) {
        Object.assign(p, { idx: p.idx.concat(l.idx), text: joinText(p.text, l.text), rect: union(p.rect, l.rect),
          quads: p.quads.concat(l.quads), box: union(p.box, l.box), h: hMax });
        continue;
      }
    }
    joined.push(Object.assign({}, l));
  }
  // 3. lines -> blocks
  const blocks = [];
  for (const l of joined) {
    let target = null;
    if (!l.bullet && !l.list) {
      for (let k = blocks.length - 1; k >= 0 && !target; k--) {
        const b = blocks[k];
        const p = b.members[b.members.length - 1];
        const hMin = Math.min(p.h, l.h), hMax = Math.max(p.h, l.h);
        const gap = l.rect[1] - p.rect[3];
        if (l.rect[1] < p.rect[1] + 0.5 * p.h || gap > 0.6 * hMin || hMax / hMin > 1.4) continue;
        if (hOverlap(p.rect, l.rect) < 0.5 * Math.min(p.rect[2] - p.rect[0], l.rect[2] - l.rect[0])) continue;
        const pw = p.rect[2] - p.rect[0];
        const widest = Math.max(...b.members.map((m) => m.rect[2] - m.rect[0]));
        if (pw < 5 * p.h && !/^\p{Ll}/u.test(l.text)) continue;
        if (SENTENCE_END.test(p.text) && pw < 0.7 * widest) continue;
        target = b;
      }
    }
    if (target) target.members.push(l);
    else blocks.push({ members: [l] });
  }
  return blocks.map((b, id) => {
    const first = b.members[0];
    const text = b.members.reduce((s, m) => joinText(s, m.text), "");
    const quads = b.members.flatMap((m) => m.quads);
    const hs = b.members.map((m) => m.h).sort((x, y) => x - y);
    const keep = !/\p{L}{2,}/u.test(text) ? "symbols" : isVietnamese(text) ? "vi" : null;
    return { id, lines: b.members.flatMap((m) => m.idx), text, bullet: first.bullet, bulletInText: first.bulletInText,
      box: b.members.map((m) => m.box).reduce(union), rect: b.members.map((m) => m.rect).reduce(union), angle,
      quads, lineRects: b.members.map((m) => m.rect), height: hs[hs.length >> 1], keep,
      lineAngles: quads.map(quadAngle) };
  });
}

/** The blocks to translate as segments of the core ({id, tagged, essential: [], prev, nxt, where: "Ảnh, dòng n"},
 * neighbours = the segments around) and the text /classify gets (their text joined by newlines). */
export function blockSegments(blocks) {
  const sent = blocks.filter((b) => !b.keep);
  const segments = sent.map((b, k) => ({ id: b.id, tagged: b.text, essential: [], prev: k > 0 ? sent[k - 1].text : "",
    nxt: k + 1 < sent.length ? sent[k + 1].text : "", where: "Ảnh, dòng " + (b.id + 1) }));
  return { segments, fullText: sent.map((b) => b.text).join("\n") };
}

/** "empty" (no words), "vi" (Vietnamese blocks hold at least 60 % of the letters) or "translate". */
export function photoVerdict(blocks) {
  const worded = blocks.filter((b) => b.keep !== "symbols");
  if (!worded.length) return "empty";
  const all = worded.reduce((s, b) => s + lettersOf(b.text), 0);
  const vi = worded.filter((b) => b.keep === "vi").reduce((s, b) => s + lettersOf(b.text), 0);
  return vi >= 0.6 * all ? "vi" : "translate";
}
