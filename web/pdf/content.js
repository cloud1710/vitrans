// PDF content streams (ISO 32000-1, 7.8 / 8 / 9): read the operators, follow the text state to find where every
// string of a text-showing operator lands in user space, and rewrite a stream without chosen strings while every
// other glyph keeps its place. Pure functions over bytes; fonts and XObjects come from the caller (ctx):
//   ctx.font(resourceName) -> {codeBytes (1 | 2), split?(bytes) -> codes, width(code) -> glyph width in 1/1000 em
//     or null, bold, italic, serif, name, vertical?} | null
//   ctx.xobject(resourceName) -> {kind: "form", key, bytes (decoded), matrix, ctx (the form's own)} | {kind: "image"}
//     | null
// A removed string becomes a TJ move of exactly its width (text space units), so the strings after it on the same
// line stay where they were; when the widths are not known the operator is made invisible instead (render mode 3).
const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const ASC = 0.75;   // the glyph box used for positions: baseline - 0.25 em .. baseline + 0.75 em
const DESC = 0.25;
const MAX_DEPTH = 12;
const latin1 = (b) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return s; };

/** Short decimal form of a number for a content stream. */
export function formatNumber(x) {
  const r = Math.round(x * 10000) / 10000;
  if (Object.is(r, -0) || r === 0) return "0";
  return String(r);
}

// ---------------------------------------------------------------- tokenizer and operator parser

function literalString(b, i) {
  // b[i] === '('; -> { bytes, end }
  const out = [];
  let depth = 1;
  i += 1;
  while (i < b.length) {
    const c = b[i];
    if (c === 0x5c) {  // backslash
      const n = b[i + 1];
      if (n === undefined) { i += 1; break; }
      const map = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c };
      if (map[n] !== undefined) { out.push(map[n]); i += 2; continue; }
      if (n >= 0x30 && n <= 0x37) {
        let v = 0;
        let k = 0;
        while (k < 3 && b[i + 1 + k] >= 0x30 && b[i + 1 + k] <= 0x37) { v = v * 8 + (b[i + 1 + k] - 0x30); k++; }
        out.push(v & 0xff);
        i += 1 + k;
        continue;
      }
      if (n === 0x0d) { i += b[i + 2] === 0x0a ? 3 : 2; continue; }  // line continuation
      if (n === 0x0a) { i += 2; continue; }
      out.push(n);
      i += 2;
      continue;
    }
    if (c === 0x28) depth += 1;
    else if (c === 0x29) {
      depth -= 1;
      if (depth === 0) return { bytes: Uint8Array.from(out), end: i + 1 };
    }
    out.push(c);
    i += 1;
  }
  return { bytes: Uint8Array.from(out), end: i };
}

function hexString(b, i) {
  // b[i] === '<'
  const digits = [];
  i += 1;
  while (i < b.length && b[i] !== 0x3e) {
    const c = b[i];
    if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66)) digits.push(c);
    i += 1;
  }
  if (digits.length % 2) digits.push(0x30);
  const out = new Uint8Array(digits.length / 2);
  for (let k = 0; k < out.length; k++) out[k] = parseInt(String.fromCharCode(digits[2 * k], digits[2 * k + 1]), 16);
  return { bytes: out, end: Math.min(b.length, i + 1) };
}

function regularRun(b, i) {
  let j = i;
  while (j < b.length && !WS.has(b[j]) && !DELIM.has(b[j])) j++;
  return j;
}

function nameValue(raw) {
  return raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** The end of an inline image's data: the first "EI" between white space that is followed by plain operators. */
function inlineImageEnd(b, from) {
  for (let i = from; i < b.length - 1; i++) {
    if (b[i] !== 0x45 || b[i + 1] !== 0x49) continue;
    if (i > from && !WS.has(b[i - 1])) continue;
    if (i + 2 < b.length && !WS.has(b[i + 2])) continue;
    let ok = true;
    for (let k = i + 2; k < Math.min(b.length, i + 34); k++) {
      const c = b[k];
      if (!(WS.has(c) || (c >= 0x20 && c < 0x7f))) { ok = false; break; }
    }
    if (ok) return i + 2;
  }
  return b.length;
}

/** bytes -> {ops: [{op, args, start, end}]}: operands are numbers, names (strings), strings ({bytes, raw: [start,
 * end], hex}), arrays (with .raw), dicts (plain objects), booleans and null. BI ... ID data EI is one operator BI
 * whose argument is the image dictionary. */
export function parseContent(bytes) {
  const b = bytes;
  const ops = [];
  let operands = [];
  let firstStart = -1;
  const stack = [];  // open arrays / dicts
  const push = (v, start) => {
    if (stack.length) { stack[stack.length - 1].items.push(v); return; }
    if (firstStart < 0) firstStart = start;
    operands.push(v);
  };
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 0x25) { while (i < b.length && b[i] !== 0x0a && b[i] !== 0x0d) i++; continue; }
    const start = i;
    if (c === 0x28) {
      const s = literalString(b, i);
      push({ bytes: s.bytes, raw: [start, s.end], hex: false }, start);
      i = s.end;
      continue;
    }
    if (c === 0x3c) {
      if (b[i + 1] === 0x3c) { stack.push({ kind: "dict", items: [], start }); i += 2; continue; }
      const s = hexString(b, i);
      push({ bytes: s.bytes, raw: [start, s.end], hex: true }, start);
      i = s.end;
      continue;
    }
    if (c === 0x3e) {
      if (b[i + 1] === 0x3e) {
        i += 2;
        const top = stack.pop();
        if (top && top.kind === "dict") {
          const d = {};
          for (let k = 0; k + 1 < top.items.length; k += 2) d[String(top.items[k])] = top.items[k + 1];
          push(d, top.start);
        }
        continue;
      }
      i++;
      continue;
    }
    if (c === 0x5b) { stack.push({ kind: "array", items: [], start }); i++; continue; }
    if (c === 0x5d) {
      i++;
      const top = stack.pop();
      if (top && top.kind === "array") {
        const arr = top.items;
        arr.raw = [top.start, i];
        push(arr, top.start);
      }
      continue;
    }
    if (c === 0x7b || c === 0x7d) { i++; continue; }
    if (c === 0x2f) {
      const j = regularRun(b, i + 1);
      push(nameValue(latin1(b.subarray(i + 1, j))), start);
      i = j;
      continue;
    }
    const j = regularRun(b, i);
    if (j === i) { i++; continue; }
    const word = latin1(b.subarray(i, j));
    i = j;
    if (NUM.test(word)) { push(parseFloat(word), start); continue; }
    if (word === "true" || word === "false") { push(word === "true", start); continue; }
    if (word === "null") { push(null, start); continue; }
    if (stack.length) { stack.length = 0; }  // an operator inside an unclosed array: drop the broken operands
    if (word === "BI") {
      // key / value pairs up to ID, then the data up to EI
      const dict = {};
      const items = [];
      let k = i;
      for (;;) {
        while (k < b.length && WS.has(b[k])) k++;
        if (k >= b.length) break;
        if (b[k] === 0x2f) {
          const e = regularRun(b, k + 1);
          items.push(nameValue(latin1(b.subarray(k + 1, e))));
          k = e;
          continue;
        }
        const e = regularRun(b, k);
        if (e === k) { k++; continue; }
        const w = latin1(b.subarray(k, e));
        k = e;
        if (w === "ID") break;
        items.push(NUM.test(w) ? parseFloat(w) : w);
      }
      for (let n = 0; n + 1 < items.length; n += 2) dict[String(items[n])] = items[n + 1];
      const end = inlineImageEnd(b, k + 1);
      ops.push({ op: "BI", args: [dict], start: firstStart >= 0 ? firstStart : start, end });
      i = end;
      operands = [];
      firstStart = -1;
      continue;
    }
    ops.push({ op: word, args: operands, start: firstStart >= 0 ? firstStart : start, end: j });
    operands = [];
    firstStart = -1;
  }
  return { ops };
}

// ---------------------------------------------------------------- the text-position interpreter

const IDENTITY = [1, 0, 0, 1, 0, 0];

export function multiply(m1, m2) {
  return [m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3], m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3], m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5]];
}

export function applyPoint(m, x, y) {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

function boxOf(m, x0, y0, x1, y1) {
  const pts = [applyPoint(m, x0, y0), applyPoint(m, x1, y0), applyPoint(m, x0, y1), applyPoint(m, x1, y1)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function rgbOf(fill) {
  const c = fill.comps;
  const clamp = (x) => Math.max(0, Math.min(1, num(x)));
  if (fill.space === "gray" || (fill.space === "n" && c.length === 1)) return [clamp(c[0]), clamp(c[0]), clamp(c[0])];
  if (fill.space === "rgb" || (fill.space === "n" && c.length === 3)) return [clamp(c[0]), clamp(c[1]), clamp(c[2])];
  if (fill.space === "cmyk" || (fill.space === "n" && c.length === 4)) {
    const k = clamp(c[3]);
    return [(1 - clamp(c[0])) * (1 - k), (1 - clamp(c[1])) * (1 - k), (1 - clamp(c[2])) * (1 - k)];
  }
  return [0, 0, 0];
}

function spaceOf(name) {
  if (name === "DeviceGray" || name === "CalGray" || name === "G") return { space: "gray", comps: [0] };
  if (name === "DeviceRGB" || name === "CalRGB" || name === "RGB") return { space: "rgb", comps: [0, 0, 0] };
  if (name === "DeviceCMYK" || name === "CMYK") return { space: "cmyk", comps: [0, 0, 0, 1] };
  if (name === "Pattern") return { space: "pattern", comps: [] };
  return { space: "n", comps: [] };
}

function codesOf(font, bytes) {
  if (font && typeof font.split === "function") return font.split(bytes);
  const n = font && font.codeBytes === 2 ? 2 : 1;
  const out = [];
  for (let i = 0; i + n <= bytes.length; i += n) out.push(n === 2 ? (bytes[i] << 8) | bytes[i + 1] : bytes[i]);
  return out.map((c) => ({ code: c, bytes: n }));
}

function initialState() {
  return { ctm: IDENTITY, Tc: 0, Tw: 0, Th: 1, TL: 0, font: null, Tfs: 0, Tr: 0, Ts: 0,
    fill: { space: "gray", comps: [0] } };
}

/**
 * Follow a content stream (the page's, or the joined page streams) and the forms it draws. -> {shows, images,
 * streams}: shows [{stream (key: "page" or the form's key), index (operator index in that stream), op, elements
 * [{kind: "str", bytes, adv (text space), box [x0, y0, x1, y1] (user space), approx} | {kind: "num", value}], size
 * (font size in user space), font (the ctx answer), style {bold, italic, serif, color [r, g, b], invisible}, tr,
 * widthsKnown, box, matrix (the text rendering matrix at the start: its first row is the text direction)}]; images [[x0, y0, x1, y1]]; streams {key: {bytes, ops, info: Map(op index -> {Tfs, Th, tr, advs,
 * widthsKnown, conflict})}} (what rewrite() needs).
 */
export function analyze(bytes, ctx, opts = {}) {
  const shows = [];
  const images = [];
  const streams = {};

  function run(key, data, c, startState, depth, path) {
    if (!streams[key]) streams[key] = { bytes: data, ops: parseContent(data).ops, info: new Map() };
    const s = streams[key];
    let st = { ...startState };
    const stack = [];
    let Tm = IDENTITY;
    let Tlm = IDENTITY;
    const nextLine = (tx, ty) => { Tlm = multiply([1, 0, 0, 1, tx, ty], Tlm); Tm = Tlm; };
    const show = (index, op, parts) => {
      const font = st.font ? c.font(st.font) : null;
      const m = multiply(Tm, st.ctm);
      const trm = multiply(m, IDENTITY);
      const elements = [];
      let known = !!font && !font.vertical;
      const advs = [];
      for (const p of parts) {
        if (typeof p === "number") {
          const tx = (-p / 1000) * st.Tfs * st.Th;
          elements.push({ kind: "num", value: p });
          advs.push(tx);
          Tm = multiply([1, 0, 0, 1, tx, 0], Tm);
          continue;
        }
        if (!p || !p.bytes) { advs.push(0); elements.push({ kind: "num", value: 0 }); continue; }
        const codes = codesOf(font, p.bytes);
        let adv = 0;
        let approx = false;
        for (const cd of codes) {
          let w = font ? font.width(cd.code) : null;
          if (w === null || w === undefined || !Number.isFinite(w)) { w = 500; approx = true; }
          adv += ((w / 1000) * st.Tfs + st.Tc + (cd.bytes === 1 && cd.code === 32 ? st.Tw : 0)) * st.Th;
        }
        if (approx) known = false;
        const mm = multiply(Tm, st.ctm);
        const y0 = -DESC * st.Tfs + st.Ts;
        const y1 = ASC * st.Tfs + st.Ts;
        elements.push({ kind: "str", bytes: p.bytes, raw: p.raw, adv, approx, box: boxOf(mm, 0, y0, adv, y1) });
        advs.push(adv);
        Tm = multiply([1, 0, 0, 1, adv, 0], Tm);
      }
      const size = Math.abs(st.Tfs) * Math.hypot(trm[2], trm[3]);
      const strs = elements.filter((e) => e.kind === "str");
      const box = strs.length ? [Math.min(...strs.map((e) => e.box[0])), Math.min(...strs.map((e) => e.box[1])),
        Math.max(...strs.map((e) => e.box[2])), Math.max(...strs.map((e) => e.box[3]))] : null;
      const style = { bold: !!(font && font.bold) || st.Tr === 2, italic: !!(font && font.italic),
        serif: !!(font && font.serif), color: rgbOf(st.fill), invisible: st.Tr === 3 || st.Tr === 7 };
      shows.push({ stream: key, index, op, elements, size, font, style, tr: st.Tr, widthsKnown: known, box,
        matrix: [st.Tfs * st.Th * trm[0], st.Tfs * st.Th * trm[1], st.Tfs * trm[2], st.Tfs * trm[3], trm[4], trm[5]],
        path });
      const info = { Tfs: st.Tfs, Th: st.Th, tr: st.Tr, advs, widthsKnown: known, conflict: false };
      const prev = s.info.get(index);
      if (!prev) s.info.set(index, info);
      else if (prev.Tfs !== info.Tfs || prev.Th !== info.Th || prev.tr !== info.tr
        || prev.advs.some((a, k) => Math.abs(a - advs[k]) > 1e-6)) prev.conflict = true;
    };
    s.ops.forEach((o, index) => {
      const a = o.args;
      switch (o.op) {
        case "q": stack.push(st); st = { ...st }; break;
        case "Q": if (stack.length) st = stack.pop(); break;
        case "cm": if (a.length >= 6) st.ctm = multiply(a.slice(-6).map((v) => num(v)), st.ctm); break;
        case "BT": Tm = IDENTITY; Tlm = IDENTITY; break;
        case "ET": break;
        case "Tc": st.Tc = num(a[0]); break;
        case "Tw": st.Tw = num(a[0]); break;
        case "Tz": st.Th = num(a[0], 100) / 100; break;
        case "TL": st.TL = num(a[0]); break;
        case "Ts": st.Ts = num(a[0]); break;
        case "Tr": st.Tr = num(a[0]); break;
        case "Tf": st.font = typeof a[0] === "string" ? a[0] : null; st.Tfs = num(a[1]); break;
        case "Td": nextLine(num(a[0]), num(a[1])); break;
        case "TD": st.TL = -num(a[1]); nextLine(num(a[0]), num(a[1])); break;
        case "Tm": if (a.length >= 6) { Tlm = a.slice(-6).map((v) => num(v)); Tm = Tlm; } break;
        case "T*": nextLine(0, -st.TL); break;
        case "Tj": show(index, "Tj", [a[0]]); break;
        case "TJ": show(index, "TJ", Array.isArray(a[0]) ? a[0] : []); break;
        case "'": nextLine(0, -st.TL); show(index, "'", [a[0]]); break;
        case "\"": st.Tw = num(a[0]); st.Tc = num(a[1]); nextLine(0, -st.TL); show(index, "\"", [a[2]]); break;
        case "g": st.fill = { space: "gray", comps: [num(a[0])] }; break;
        case "rg": st.fill = { space: "rgb", comps: a.slice(0, 3).map((v) => num(v)) }; break;
        case "k": st.fill = { space: "cmyk", comps: a.slice(0, 4).map((v) => num(v)) }; break;
        case "cs": st.fill = spaceOf(a[0]); break;
        case "sc": case "scn":
          if (st.fill.space === "pattern" || typeof a[a.length - 1] === "string") st.fill = { space: "pattern", comps: [] };
          else st.fill = { space: st.fill.space, comps: a.map((v) => num(v)) };
          break;
        case "BI": images.push(boxOf(st.ctm, 0, 0, 1, 1)); break;
        case "Do": {
          const x = typeof a[0] === "string" && c.xobject ? c.xobject(a[0]) : null;
          if (!x) break;
          if (x.kind === "image") { images.push(boxOf(st.ctm, 0, 0, 1, 1)); break; }
          if (x.kind === "form" && depth < MAX_DEPTH && !path.includes(x.key)) {
            const inner = { ...st, ctm: multiply(x.matrix || IDENTITY, st.ctm) };
            run(x.key, x.bytes, x.ctx || c, inner, depth + 1, path.concat([x.key]));
          }
          break;
        }
        default: break;
      }
    });
  }
  run(opts.key || "page", bytes, ctx, initialState(), 0, [opts.key || "page"]);
  return { shows, images, streams };
}

// ---------------------------------------------------------------- the rewriter

// back to bytes, one byte per character (the text holds latin1 slices of the source)
const enc = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);

function concat(chunks) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(n);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/** The TJ array of an operator with the strings in `remove` replaced by moves of their width. */
function tjArray(bytes, parts, info, remove) {
  const out = [];
  let pending = null;  // a number being summed
  const scale = info.Tfs * info.Th;
  const flush = () => { if (pending !== null) { out.push(formatNumber(pending)); pending = null; } };
  parts.forEach((p, k) => {
    if (typeof p === "number") { pending = (pending || 0) + p; return; }
    if (remove.has(k)) { pending = (pending || 0) - (info.advs[k] / scale) * 1000; return; }
    flush();
    out.push(latin1(bytes.subarray(p.raw[0], p.raw[1])));
  });
  flush();
  return "[" + out.join(" ") + "] TJ";
}

/**
 * The stream with the given strings taken out. edits: Map(op index -> {remove: Set(element indexes)}); info: the
 * analysis' Map(op index -> {Tfs, Th, tr, advs, widthsKnown, conflict}). Operators not edited keep their bytes.
 */
export function rewrite(bytes, ops, edits, info) {
  const chunks = [];
  let pos = 0;
  ops.forEach((o, index) => {
    const e = edits.get(index);
    if (!e || !e.remove || !e.remove.size) return;
    const inf = info.get(index);
    const original = latin1(bytes.subarray(o.start, o.end));
    let text;
    if (!inf || !inf.widthsKnown || inf.conflict || !(inf.Tfs * inf.Th)) {
      if (inf && (inf.tr === 3 || inf.tr === 7)) return;  // already invisible
      text = "3 Tr " + original + " " + formatNumber(inf ? inf.tr : 0) + " Tr";
    } else if (o.op === "TJ") {
      text = tjArray(bytes, Array.isArray(o.args[0]) ? o.args[0] : [], inf, e.remove);
    } else if (o.op === "Tj") {
      text = tjArray(bytes, [o.args[0]], inf, e.remove);
    } else if (o.op === "'") {
      text = "T* " + tjArray(bytes, [o.args[0]], inf, e.remove);
    } else if (o.op === "\"") {
      text = formatNumber(num(o.args[0])) + " Tw " + formatNumber(num(o.args[1])) + " Tc T* "
        + tjArray(bytes, [o.args[2]], inf, e.remove);
    } else {
      return;
    }
    chunks.push(bytes.subarray(pos, o.start), enc(text));
    pos = o.end;
  });
  chunks.push(bytes.subarray(pos));
  return concat(chunks);
}
