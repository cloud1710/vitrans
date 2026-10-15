// Skill packs: prompt text, glossary and term fixes as data (port of helper/vitranslate/packs.py). `_style` is shared
// by every job; domain packs are chosen by matching.js and the selected packs merge into one (mergePacks).
//
// Packs are read through a reader: async (file) -> text, or null when the file does not exist (pack.json,
// prompt.md, glossary.csv, rules.json, tests.jsonl); includes ("_shared/<name>") through readShared: async (file)
// -> text | null for "<name>.csv" / "<name>.rules.json". Registry packs carry their includes expanded, so the page
// never resolves any. Text is read as Python does: UTF-8, universal newlines for prompt.md / jsonl, Python's csv for
// glossary.csv (a leading BOM dropped).
import { compile } from "./pyre.js";
import { bounded } from "./qa.js";
import { suspicious } from "./vnsyllable.js";
import { pyStrip, pySplit, pySplitlines, pyCasefold, cpLen, cmpStr } from "./py.js";

export class TermFix {
  constructor(en, vi, wrong = []) {
    this.en = en;
    this.vi = vi;
    this.wrong = wrong;
  }
}

export class Pack {
  constructor(id, version, name, detect, prompt, glossary, termFixes, tests, mergedKey = "") {
    this.id = id;
    this.version = version;
    this.name = name;
    this.detect = detect;
    this.prompt = prompt;
    this.glossary = glossary; // [[en, vi, note], ...]
    this.termFixes = termFixes; // [TermFix, ...]
    this.tests = tests;
    this.mergedKey = mergedKey; // set by mergePacks: the keys of every merged pack
  }

  key() {
    return this.mergedKey || this.id + "@" + this.version;
  }
}

// No domain pack selected: translation runs with the style pack only.
export const EMPTY_PACK = new Pack("_none", "0", "Chung", [], "", [], [], []);

export const SHARED_RE = compile("^_shared/[a-z0-9_-]+$");

/** Bytes of a pack file as Python's read_text(encoding="utf-8") gives them: strict UTF-8, a BOM kept (pack sources
 * should decode with this; fetch's text() and TextDecoder's default drop a leading BOM). */
export function decodeText(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (err) {
    throw new PackError("not valid UTF-8: " + err.message);
  }
}

/** A pack file could not be read or parsed (Python: OSError / ValueError / KeyError ... while loading). */
export class PackError extends Error {
  constructor(message) {
    super(message);
    this.name = "PackError";
    this.code = "pack_invalid";
  }
}

/** Python's universal newlines (text mode): \r\n and \r become \n. */
function universal(text) {
  return text.replace(/\r\n?/g, "\n");
}

/** Rows of a CSV text as Python's csv.reader (excel dialect, strict=False) yields them from a file opened with
 * newline="": lines split after \r\n, \r or \n; quoted fields may span lines; a doubled quote is a quote. */
export function csvRows(text) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
  const rows = [];
  let fields = [];
  let field = "";
  let state = "start_record";
  const save = () => {
    fields.push(field);
    field = "";
  };
  const EOL = null;
  const step = (c) => {
    switch (state) {
      case "start_record":
        if (c === EOL) return;
        if (c === "\n" || c === "\r") {
          state = "eat_crnl";
          return;
        }
        state = "start_field";
      // falls through
      case "start_field":
        if (c === "\n" || c === "\r" || c === EOL) {
          save();
          state = c === EOL ? "start_record" : "eat_crnl";
        } else if (c === "\"") {
          state = "in_quoted";
        } else if (c === ",") {
          save();
        } else {
          field += c;
          state = "in_field";
        }
        return;
      case "in_field":
        if (c === "\n" || c === "\r" || c === EOL) {
          save();
          state = c === EOL ? "start_record" : "eat_crnl";
        } else if (c === ",") {
          save();
          state = "start_field";
        } else {
          field += c;
        }
        return;
      case "in_quoted":
        if (c === EOL) return;
        if (c === "\"") state = "quote_in_quoted";
        else field += c;
        return;
      case "quote_in_quoted":
        if (c === "\"") {
          field += "\"";
          state = "in_quoted";
        } else if (c === ",") {
          save();
          state = "start_field";
        } else if (c === "\n" || c === "\r" || c === EOL) {
          save();
          state = c === EOL ? "start_record" : "eat_crnl";
        } else {
          field += c;
          state = "in_field";
        }
        return;
      case "eat_crnl":
        if (c === "\n" || c === "\r") return;
        if (c === EOL) {
          state = "start_record";
          return;
        }
        throw new PackError("new-line character seen in unquoted field");
      default:
        throw new PackError("csv state " + state);
    }
  };
  for (const line of lines) {
    for (const c of line) step(c);
    step(EOL);
    if (state === "start_record") {
      rows.push(fields);
      fields = [];
    }
  }
  // end of input inside a quoted field: Python (strict=False) saves the field and returns the row
  if (state !== "start_record" && (field !== "" || state === "in_quoted")) {
    save();
    rows.push(fields);
  }
  return rows;
}

/** [[en, vi, note]] of a glossary CSV text (header en,vi,note; rows without en or vi skipped); [] for null. */
export function readGlossary(text) {
  if (text === null || text === undefined) return [];
  if (text.startsWith("\ufeff")) text = text.slice(1);
  const rows = csvRows(text);
  if (!rows.length) return [];
  const header = rows[0]; // csv.DictReader: the first row, even an empty one
  const out = [];
  for (const row of rows.slice(1)) {
    if (row.length === 0) continue; // csv.DictReader skips empty rows
    const get = (name) => {
      const i = header.lastIndexOf(name);
      return i >= 0 && i < row.length ? row[i] : null;
    };
    const en = get("en");
    const vi = get("vi");
    if (en && vi) out.push([pyStrip(en), pyStrip(vi), pyStrip(get("note") || "")]);
  }
  return out;
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new PackError(what + " is not valid JSON: " + err.message);
  }
}

const pyRepr = (v) => (typeof v === "string" ? "'" + v.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'" : String(v));

/** [[name, glossary rows, term-fix objects]] for pack.json "include": ["_shared/<name>", ...]. */
export async function resolveIncludes(meta, readShared) {
  const out = [];
  for (const name of meta.include || []) {
    if (typeof name !== "string" || !SHARED_RE.fullmatch(name)) {
      throw new PackError("pack " + meta.id + ": include " + pyRepr(name) + " must be _shared/<name> (a-z, 0-9, _ or -)");
    }
    const base = name.slice("_shared/".length);
    const csv = readShared ? await readShared(base + ".csv") : null;
    if (csv === null || csv === undefined) throw new PackError("pack " + meta.id + ": include " + name + ": " + base + ".csv not found");
    const rulesText = await readShared(base + ".rules.json");
    const rules = rulesText === null || rulesText === undefined ? {} : parseJson(rulesText, name + ".rules.json");
    out.push([name, readGlossary(csv), [...(rules.term_fixes || [])]]);
  }
  return out;
}

/** [glossary rows, term-fix objects]: the pack's own first, then each include's in order, skipping an English key
 * (lower case) already present. */
export function expandIncludes(glossary, fixes, includes) {
  glossary = [...glossary];
  fixes = [...fixes];
  const keys = new Set(glossary.map((r) => r[0].toLowerCase()));
  const fixed = new Set(fixes.map((f) => f.en.toLowerCase()));
  for (const [, rows, more] of includes) {
    for (const row of rows) {
      if (!keys.has(row[0].toLowerCase())) {
        keys.add(row[0].toLowerCase());
        glossary.push(row);
      }
    }
    for (const fx of more) {
      if (!fixed.has(fx.en.toLowerCase())) {
        fixed.add(fx.en.toLowerCase());
        fixes.push(fx);
      }
    }
  }
  return [glossary, fixes];
}

/** load_pack: read a pack through `read` (and its includes through `readShared`). */
export async function loadPack(read, readShared = null) {
  const metaText = await read("pack.json");
  if (metaText === null || metaText === undefined) throw new PackError("pack.json not found");
  const meta = parseJson(metaText, "pack.json");
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) throw new PackError("pack.json is not an object");
  if (!("id" in meta) || !("version" in meta)) throw new PackError("pack.json needs id and version");
  const promptText = await read("prompt.md");
  const prompt = promptText === null || promptText === undefined ? "" : pyStrip(universal(promptText));
  const rulesText = await read("rules.json");
  const rules = rulesText === null || rulesText === undefined ? {} : parseJson(rulesText, "rules.json");
  const [glossary, fixDicts] = expandIncludes(readGlossary(await read("glossary.csv")), rules.term_fixes || [],
    await resolveIncludes(meta, readShared));
  const fixes = fixDicts.map((f) => new TermFix(f.en, f.vi, [...(f.wrong || [])]));
  for (const fx of fixes) {
    for (const pat of fx.wrong) {
      try {
        compile(pat);
      } catch (err) {
        throw new PackError("pack " + meta.id + ": invalid wrong pattern " + pyRepr(pat) + " for " + pyRepr(fx.en) + ": " +
          err.message);
      }
    }
  }
  const testsText = await read("tests.jsonl");
  const tests = testsText === null || testsText === undefined ? [] :
    pySplitlines(universal(testsText)).filter((line) => pyStrip(line)).map((line) => parseJson(line, "tests.jsonl"));
  return new Pack(meta.id, meta.version, "name" in meta ? meta.name : meta.id, "detect" in meta ? meta.detect : [],
    prompt, glossary, fixes, tests);
}

const TRAILING_ABBR_RE = compile(String.raw`\s*\([^()]*\)\s*$`);

function viKey(vi) {
  return pyCasefold(pySplit(vi).join(" "));
}

/** A term fix steers to the glossary value: equal ignoring case and spacing, also when the glossary value carries a
 * trailing abbreviation. */
function sameValue(glossaryVi, fixVi) {
  const k = viKey(fixVi);
  return k === viKey(glossaryVi) || k === viKey(TRAILING_ABBR_RE.sub("", glossaryVi));
}

/** One pack from several, in merge order: the earlier pack wins every conflict; a later fix is kept when it agrees
 * with the earlier value of its term. null for no packs (the caller falls back to EMPTY_PACK). */
export function mergePacks(packs) {
  packs = [...packs];
  if (!packs.length) return null;
  if (packs.length === 1) return packs[0];
  const glossary = [];
  const seen = new Set();
  for (const p of packs) {
    for (const row of p.glossary) {
      if (!seen.has(row[0].toLowerCase())) {
        seen.add(row[0].toLowerCase());
        glossary.push(row);
      }
    }
  }
  const fixes = [];
  const fixed = new Map();
  const owned = new Map();
  for (const p of packs) {
    for (const fx of p.termFixes) {
      const key = fx.en.toLowerCase();
      if (fixed.has(key)) { // an earlier fix of the term: same value -> one fix with both wrong lists
        const i = fixed.get(key);
        const extra = fx.wrong.filter((w) => !fixes[i].wrong.includes(w));
        if (extra.length && viKey(fixes[i].vi) === viKey(fx.vi)) {
          fixes[i] = new TermFix(fixes[i].en, fixes[i].vi, fixes[i].wrong.concat(extra));
        }
      } else if (!owned.has(key) || sameValue(owned.get(key), fx.vi)) {
        fixed.set(key, fixes.length);
        fixes.push(fx);
      }
    }
    for (const row of p.glossary) { // later packs may only re-fix these terms towards the same value
      if (!owned.has(row[0].toLowerCase())) owned.set(row[0].toLowerCase(), row[1]);
    }
  }
  const detect = [];
  // packs.py: detect += [w for w in p.detect if w not in detect] -- filtered against the earlier packs only, so a
  // pack's own repeated keyword stays repeated
  for (const p of packs) detect.push(...p.detect.filter((w) => !detect.includes(w)));
  return new Pack(packs.map((p) => p.id).join("+"), packs.map((p) => p.version).join("+"),
    packs.map((p) => p.name).join(", "), detect, packs.map((p) => p.prompt).filter((x) => x).join("\n\n"), glossary,
    fixes, packs.flatMap((p) => p.tests), packs.map((p) => p.key()).join("+"));
}

/** The words of a pack's Vietnamese values (glossary and term-fix values; never a note or a wrong form) that are no
 * regular Vietnamese syllable (vnsyllable.suspicious), in lower case, sorted (code points): the house forms the pack's
 * author chose, which the suspicious-word check accepts in a job that uses the pack (qa.suspiciousTokens). */
export function allowedWords(pack) {
  const words = new Set();
  for (const vi of pack.glossary.map((row) => row[1]).concat(pack.termFixes.map((fx) => fx.vi))) {
    for (const t of suspicious(vi)) words.add(t.toLowerCase());
  }
  return [...words].sort(cmpStr);
}

/** Glossary entries present in text, most frequent (then longest) first, as [en, vi]. */
export function glossaryHits(text, glossary, limit = 80) {
  const low = text.toLowerCase();
  const hits = [];
  const seen = new Set();
  for (const [en, vi] of glossary) {
    if (seen.has(en.toLowerCase())) continue;
    const n = compile(bounded(en)).findall(low).length;
    if (n) {
      seen.add(en.toLowerCase());
      hits.push([n, cpLen(en), en, vi]);
    }
  }
  hits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  return hits.slice(0, limit).map(([, , en, vi]) => [en, vi]);
}
