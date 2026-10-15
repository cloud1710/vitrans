// The subtitle tool ("Phụ đề"): .srt / .vtt text -> cues (timings, multi-line text, styling tags kept) -> core segments
// {id, tagged, essential, prev, nxt, where} (a cue's lines joined by a space; its tags as the core's tokens: a pair
// such as <i>..</i> or <font ...>..</font> is <gN>..</gN> (kept: essential), a lone tag such as {\an8}, <v Name> or a
// VTT timestamp is <xN/>; the neighbouring cues' plain text as context; "Câu thoại n" as the location) -> the
// Vietnamese back in its cues (tags restored, a cue of two lines or more split again at the space nearest the middle)
// -> SRT (CRLF, cues numbered again) or VTT (header, STYLE / NOTE / REGION blocks, cue ids and settings kept),
// bilingual (Vietnamese over the English) or Vietnamese only. Pure functions: no DOM, no network.
export const SUB_MAX_BYTES = 2 * 1024 * 1024;
export const LINE_CHARS = 42;  // a translated cue longer than this keeps the source's line count (at most 2)

const TIME = String.raw`(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})`;
const TIMING_RE = new RegExp("^\\s*" + TIME + "\\s*-->\\s*" + TIME + "(.*)$");
const toMs = (h, m, s, f) => ((Number(h || 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number((f + "00").slice(0, 3));

function timing(line) {
  const m = TIMING_RE.exec(line);
  if (!m) return null;
  return { start: toMs(m[1], m[2], m[3], m[4]), end: toMs(m[5], m[6], m[7], m[8]), settings: m[9].trim() };
}

const pad = (n, w) => String(n).padStart(w || 2, "0");

/** ms -> "hh:mm:ss,mmm" (srt) or "hh:mm:ss.mmm" (vtt). */
export function formatTime(ms, format) {
  const v = Math.max(0, Math.round(ms));
  return pad(Math.floor(v / 3600000)) + ":" + pad(Math.floor(v / 60000) % 60) + ":" + pad(Math.floor(v / 1000) % 60) +
    (format === "srt" ? "," : ".") + pad(v % 1000, 3);
}

/** The file's bytes as text: UTF-8 (its BOM dropped), Windows-1252 when the bytes are no UTF-8. */
export function decodeSubs(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

// blocks of non-blank lines (a line of spaces is blank)
function blocksOf(text) {
  const out = [];
  let cur = [];
  for (const line of String(text || "").replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    if (/^\s*$/.test(line)) {
      if (cur.length) out.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

// a cue from a block: an optional id line, the timing line, the text lines; null when the block has no timing
function cueOf(lines) {
  const at = lines.findIndex((l) => timing(l) !== null);
  if (at < 0 || at > 1) return null;
  const t = timing(lines[at]);
  return { kind: "cue", id: at === 1 ? lines[0].trim() : "", start: t.start, end: t.end, settings: t.settings,
    lines: lines.slice(at + 1) };
}

/**
 * -> { format: "srt" | "vtt", header: the WEBVTT block's lines (vtt) | null, blocks: [cue | {kind: "note" | "style" |
 * "region", lines}] in file order, cues: the cues [{kind, id, start, end (ms), settings, lines}] }. Blocks that are
 * neither are left out.
 */
export function parseSubs(text) {
  const blocks = blocksOf(text);
  const vtt = blocks.length > 0 && /^WEBVTT(?:[ \t].*)?$/.test(blocks[0][0]);
  const doc = { format: vtt ? "vtt" : "srt", header: vtt ? blocks[0].slice() : null, blocks: [], cues: [] };
  for (const lines of vtt ? blocks.slice(1) : blocks) {
    const kind = vtt ? (/^(NOTE|STYLE|REGION)(?:[ \t].*)?$/.exec(lines[0]) || [])[1] : null;
    if (kind && !lines.some((l) => timing(l) !== null)) {
      doc.blocks.push({ kind: kind.toLowerCase(), lines: lines.slice() });
      continue;
    }
    const cue = cueOf(lines);
    if (!cue) continue;
    if (!vtt) cue.id = "";
    doc.blocks.push(cue);
    doc.cues.push(cue);
  }
  return doc;
}

// ---- tags <-> the core's tokens ----

// a styling tag: <name ...> / </name> (b, i, u, font, c.class, v Name, lang, ruby ...), a VTT timestamp <00:01.000>,
// an ASS / SSA override {\...}
const TAG_RE = /<\/?[A-Za-z][^<>]*>|<(?:\d+:)?\d{2}:\d{2}\.\d{3}>|\{\\[^{}]*\}/g;
const tagName = (t) => (/^<\/?([A-Za-z][A-Za-z0-9]*)/.exec(t) || [])[1];

/**
 * A cue text -> { tagged, essential (the pairs' ids), spans: Map(id -> {open, close} | {raw}) }. Ids follow the order
 * of the tags' openings; a pair is an opening tag and the next closing tag of its name; anything else is a lone tag.
 */
export function toTagged(text) {
  const src = String(text || "");
  const found = [];
  for (const m of src.matchAll(TAG_RE)) found.push({ at: m.index, end: m.index + m[0].length, text: m[0] });
  const open = [];
  for (const t of found) {
    const name = tagName(t.text);
    if (!name || t.text.startsWith("<\\") || /^<(?:\d+:)?\d{2}:/.test(t.text)) continue;
    if (t.text.startsWith("</")) {
      const k = open.map((o) => o.name).lastIndexOf(name.toLowerCase());
      if (k >= 0) { open[k].tag.pair = t; t.closes = open[k].tag; open.splice(k, 1); }
    } else {
      open.push({ name: name.toLowerCase(), tag: t });
    }
  }
  const spans = new Map();
  const essential = [];
  let id = 0;
  for (const t of found) {
    if (t.closes) continue;
    id += 1;
    t.id = id;
    if (t.pair) { spans.set(id, { open: t.text, close: t.pair.text }); essential.push(id); }
    else spans.set(id, { raw: t.text });
  }
  let tagged = "";
  let pos = 0;
  for (const t of found) {
    tagged += src.slice(pos, t.at);
    tagged += t.closes ? "</g" + t.closes.id + ">" : t.pair ? "<g" + t.id + ">" : "<x" + t.id + "/>";
    pos = t.end;
  }
  return { tagged: tagged + src.slice(pos), essential, spans };
}

const TOKEN_RE = /<(\/?)g(\d+)>|<x(\d+)\/>/g;

/**
 * A translated tagged text -> the cue text with its tags back. Unknown tokens and a pair's lone half are dropped;
 * when source (the segment's tagged text) is wrapped in pairs or starts with lone tags that the translation lost, they
 * are put back around it.
 */
export function fromTagged(text, spans, source) {
  // lone tags that lead the source (a position override) lead the result again, wherever the translation put them
  const lead = source ? /^((?:<x\d+\/>|<g\d+>)*)/.exec(source)[1] : "";
  const leadX = [...lead.matchAll(/<x(\d+)\/>/g)].map((m) => Number(m[1])).filter((n) => spans.has(n));
  let t = String(text || "");
  for (const n of leadX) t = t.split("<x" + n + "/>").join("");
  const opens = new Map();
  const closes = new Map();
  for (const m of t.matchAll(TOKEN_RE)) {
    if (m[2] === undefined) continue;
    (m[1] ? closes : opens).set(Number(m[2]), (m[1] ? closes : opens).get(Number(m[2])) || m.index);
  }
  const paired = (n) => opens.has(n) && closes.has(n) && opens.get(n) < closes.get(n) && spans.has(n) && spans.get(n).open;
  let out = t.replace(TOKEN_RE, (all, slash, g, x) => {
    if (x !== undefined) { const s = spans.get(Number(x)); return s && s.raw !== undefined ? s.raw : ""; }
    const n = Number(g);
    if (!paired(n)) return "";
    return slash ? spans.get(n).close : spans.get(n).open;
  });
  if (lead) {
    // a pair that wraps the whole source and that the translation lost wraps it again
    const tail = (/((?:<\/g\d+>)+)$/.exec(source) || ["", ""])[1];
    let pre = "";
    let post = "";
    for (const m of lead.matchAll(/<x(\d+)\/>|<g(\d+)>/g)) {
      const n = Number(m[1] || m[2]);
      const s = spans.get(n);
      if (!s) continue;
      if (m[1] !== undefined) pre += s.raw;
      else if (tail.includes("</g" + n + ">") && !opens.has(n) && !closes.has(n)) {
        pre += s.open;
        post = s.close + post;
      }
    }
    out = pre + out.trim() + post;
  }
  return out.replace(/\s+/g, " ").trim();
}

// the plain text of a tagged text: tokens dropped (a lone tag read as a space), spaces collapsed
const plain = (tagged) => String(tagged).replace(/<x\d+\/>/g, " ").replace(/<\/?g\d+>/g, "").replace(/\s+/g, " ").trim();

/**
 * Segments for the core from the cues that have text: { segments, fullText (the plain cue texts joined by newlines,
 * what classify reads), refs: per segment {cue (index in doc.cues), spans, tagged} }. prev / nxt: the plain text of
 * the segments before and after.
 */
export function subSegments(doc) {
  const refs = [];
  doc.cues.forEach((c, i) => {
    const t = toTagged(c.lines.map((l) => l.trim()).join(" "));
    const p = plain(t.tagged);
    if (/[\p{L}\p{N}]/u.test(p)) refs.push({ cue: i, spans: t.spans, tagged: t.tagged, essential: t.essential, plain: p });
  });
  const segments = refs.map((r, k) => ({ id: k, tagged: r.tagged, essential: r.essential,
    prev: k > 0 ? refs[k - 1].plain : "", nxt: k + 1 < refs.length ? refs[k + 1].plain : "",
    where: "Câu thoại " + (r.cue + 1) }));
  return { segments, fullText: refs.map((r) => r.plain).join("\n"),
    refs: refs.map((r) => ({ cue: r.cue, spans: r.spans, tagged: r.tagged })) };
}

const visibleLength = (s) => Array.from(s.replace(TAG_RE, "")).length;

/** A cue's lines as the page shows them: one line, the styling tags dropped (the written file keeps them). */
export function shownText(lines) {
  return (lines || []).join(" ").replace(TAG_RE, "").replace(/\s+/g, " ").trim();
}

/** One cue text -> its lines: kept on one line unless n >= 2 and it is longer than LINE_CHARS; then two lines split
 * at the space (outside any tag) nearest the middle of the visible text. */
export function wrapLines(text, n) {
  const s = String(text || "").trim();
  const total = visibleLength(s);
  if (n < 2 || total <= LINE_CHARS) return [s];
  const cuts = [];
  let seen = 0;
  let inTag = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inTag) { if (ch === inTag) inTag = null; continue; }
    const rest = s.slice(i);
    const m = /^(?:<\/?[A-Za-z][^<>]*>|<(?:\d+:)?\d{2}:\d{2}\.\d{3}>|\{\\[^{}]*\})/.exec(rest);
    if (m) { i += m[0].length - 1; continue; }
    if (ch === " ") cuts.push({ i, at: seen });
    if (!(ch >= "\udc00" && ch <= "\udfff")) seen += 1;
  }
  if (!cuts.length) return [s];
  const best = cuts.reduce((a, b) => (Math.abs(b.at - total / 2) < Math.abs(a.at - total / 2) ? b : a));
  return [s.slice(0, best.i).trim(), s.slice(best.i + 1).trim()];
}

/** The Vietnamese per cue (index in doc.cues): its lines, or null for a cue that was not sent or has no result. */
export function subResults(doc, sub, results) {
  const out = doc.cues.map(() => null);
  const byId = new Map((results || []).map((r) => [String(r.id), r]));
  sub.refs.forEach((ref, k) => {
    const r = byId.get(String(k));
    if (!r || typeof r.text !== "string" || !r.text.trim()) return;
    const text = fromTagged(r.text, ref.spans, ref.tagged);
    out[ref.cue] = wrapLines(text, Math.min(2, doc.cues[ref.cue].lines.length));
  });
  return out;
}

// cue text lines that cannot end the cue early: no blank line, no "-->"
const safe = (lines) => lines.map((l) => String(l).replace(/-->/g, "\u2192")).filter((l) => /\S/.test(l));

/** The subtitle file: opts { format: "srt" | "vtt", bilingual }. vi: per cue its Vietnamese lines or null (the
 * English stays). SRT: CRLF, cues numbered 1..n, no notes or settings; VTT: LF, the source's header and blocks. */
export function writeSubs(doc, vi, opts) {
  const o = opts || {};
  const fmt = o.format === "vtt" ? "vtt" : "srt";
  const parts = [];
  let n = 0;
  for (const b of doc.blocks) {
    if (b.kind !== "cue") {
      if (fmt === "vtt") parts.push(b.lines.join("\n"));
      continue;
    }
    const k = doc.cues.indexOf(b);
    const v = vi && vi[k];
    // bilingual: the English under the Vietnamese without its {\...} overrides (the Vietnamese carries them once)
    const en = b.lines.map((l) => l.replace(/\{\\[^{}]*\}/g, ""));
    const text = safe(v ? (o.bilingual ? v.concat(en) : v) : b.lines);
    n += 1;
    const time = formatTime(b.start, fmt) + " --> " + formatTime(b.end, fmt);
    if (fmt === "srt") parts.push([String(n), time].concat(text).join("\r\n"));
    else parts.push((b.id ? [b.id] : []).concat([time + (b.settings ? " " + b.settings : "")], text).join("\n"));
  }
  if (fmt === "srt") return parts.length ? parts.join("\r\n\r\n") + "\r\n" : "";
  return [(doc.header || ["WEBVTT"]).join("\n")].concat(parts).join("\n\n") + "\n";
}

/** "<stem>_vi.<srt|vtt>" (a pasted text: "phu-de_vi.<ext>"). */
export function subName(name, format) {
  const base = String(name || "").replace(/^.*[\\/]/, "");
  const stem = base.replace(/\.(srt|vtt|txt)$/i, "") || "phu-de";
  return stem + "_vi." + (format === "vtt" ? "vtt" : "srt");
}
