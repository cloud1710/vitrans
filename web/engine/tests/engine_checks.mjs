// Parity checks of the M2 translation logic against the helper's decisions (tools/export_engine_fixtures.py ->
// tests/fixtures/engine/*.json). Shared by the Node tests (tests/engine.test.mjs) and the Chrome runner
// (tests/browser.mjs), so platform-only defects show up in both. Every check returns rows {name, ok, detail}.
import { compile, PyReError } from "../pyre.js";
import * as py from "../py.js";
import * as tags from "../tags.js";
import * as qa from "../qa.js";
import * as vn from "../vnsyllable.js";
import * as tr from "../translate.js";
import * as matching from "../matching.js";
import * as repair from "../repair.js";
import { Pack, TermFix, PackError, loadPack, mergePacks, glossaryHits, readGlossary, allowedWords } from "../packs.js";
import { translateFile } from "../pipeline.js";
import { choosePacks, topCandidates, translateSegments, prepareTranslation, selectPacks, buildPackSet, packToData,
  packFromData } from "../core.js";
import { isEssentialSpan, essentialIds } from "../ooxml/essential.js";
import { OoxmlPackage } from "../ooxml/package.js";
import { buildReport } from "../report.js";
import { MemoryTM, tmKey } from "../tm.js";
import { encode } from "../ooxml/codec.js";
import { parseXml } from "../ooxml/xml.js";

const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
export const show = (v) => ascii(JSON.stringify(v)).slice(0, 600);

/** Deep equality for JSON values with object keys in any order. */
export function jsonEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && jsonEqual(a[k], b[k]));
}

/** UTF-16 index of the code point index cp of text (Python indices count code points). */
export function cpToUnit(text, cp) {
  let unit = 0;
  for (let k = 0; k < cp; k++) unit += text.codePointAt(unit) > 0xffff ? 2 : 1;
  return unit;
}

function unitToCp(text, unit) {
  let cp = 0;
  for (let u = 0; u < unit; u += text.codePointAt(u) > 0xffff ? 2 : 1) cp++;
  return cp;
}

function matchRecord(text, m) {
  return [unitToCp(text, m.start()), unitToCp(text, m.end()), ...m.groups()];
}

// ---------------------------------------------------------------- pyre

export function pyreChecks(data) {
  const rows = [];
  const texts = data.texts;
  for (const c of data.cases) {
    const name = "pyre " + c.name + " /" + ascii(c.pattern) + "/" + c.flags;
    let rx;
    try {
      rx = compile(c.pattern, c.flags);
    } catch (err) {
      rows.push({ name, ok: false, detail: "compile failed: " + String(err && err.message) });
      continue;
    }
    const problems = [];
    if (rx.groups !== c.groups) problems.push("groups " + rx.groups + " != " + c.groups);
    const hits = new Map(c.hits.map((h) => [h[0], h]));
    texts.forEach((t, k) => {
      const want = hits.get(k);
      const got = [...rx.finditer(t)].map((m) => matchRecord(t, m));
      if (!jsonEqual(got, want ? want[1] : [])) problems.push("text " + k + " matches " + show(got) + " != " + show(want ? want[1] : []));
      const sub = rx.sub("<\u00b7>", t);
      if (sub !== (want ? want[2] : t)) problems.push("text " + k + " sub " + show(sub));
      const split = rx.split(t);
      if (!jsonEqual(split, want ? want[3] : [t])) problems.push("text " + k + " split " + show(split));
      const full = rx.fullmatch(t) !== null;
      if (full !== c.fullmatch.includes(k)) problems.push("text " + k + " fullmatch " + full);
    });
    const m1 = new Map(c.match1.map((x) => [x[0], x[1]]));
    texts.forEach((t, k) => {
      const m = rx.match(t, cpToUnit(t, Math.min(1, [...t].length)));
      const got = m ? matchRecord(t, m) : null;
      const want = m1.has(k) ? m1.get(k) : null;
      if (t.length && !jsonEqual(got, want)) problems.push("text " + k + " match(pos 1) " + show(got) + " != " + show(want));
    });
    rows.push({ name, ok: problems.length === 0, detail: problems.slice(0, 4).join(" | ") });
  }
  for (const [pat, pyError] of data.errors) {
    let jsError = false;
    try {
      compile(pat, "");
    } catch (err) {
      jsError = err instanceof PyReError || err instanceof SyntaxError;
    }
    rows.push({ name: "pyre error /" + ascii(pat) + "/", ok: jsError === pyError, detail: "python error " + pyError + ", js " + jsError });
  }
  for (const [pat, flags, repl, text, want] of data.templates || []) {
    let got;
    try {
      got = compile(pat, flags).sub(repl, text);
    } catch (err) {
      got = { error: err instanceof PyReError ? "error" : String(err && err.name) };
    }
    const exp = want && typeof want === "object" ? { error: "error" } : want;
    rows.push({ name: "pyre template " + ascii(repl) + " on /" + ascii(pat) + "/", ok: jsonEqual(got, exp),
      detail: "js " + show(got) + " != py " + show(want) });
  }
  return rows;
}

// ---------------------------------------------------------------- units

const fixOf = (f) => new TermFix(f[0], f[1], f[2]);
const sortedEntries = (obj) => Object.entries(obj).sort((a, b) => py.cmpStr(a[0], b[0]));

/** JS implementations of the pair functions (same argument order as the Python lambdas of the exporter). */
function pairFns(data) {
  const hits = data.hits;
  const terms = data.terms;
  return {
    "tags.check": (s, o) => tags.check(s, o),
    "tags.repair": (s, o) => tags.repair(s, o),
    "tags.restore_spaces": (s, o) => tags.restoreSpaces(s, o),
    "tags.normalize_tokens": (s, o) => tags.normalizeTokens(o, s),
    "tags.stray_markup": (s, o) => tags.strayMarkup(s, o),
    "tr._drop_blank_invented": (s, o) => tr.dropBlankInvented(s, o),
    "tr._strip_emphasis": (s, o) => tr.stripEmphasis(s, o),
    "qa.strip_leaks.tags": (s, o) => qa.stripLeaks(s, o),
    "qa.source_case.tags": (s, o) => qa.sourceCase(tr.plain(s), o),
    "qa.fix_latex.tags": (s, o) => qa.fixLatex(tr.plain(s), o),
    "qa.english_left": (s, o) => qa.englishLeft(s, o),
    "qa.copied_english": (s, o) => qa.copiedEnglish(s, o),
    "qa.single_english": (s, o) => qa.singleEnglish(s, o),
    "qa.single_english.terms": (s, o) => qa.singleEnglish(s, o, terms),
    "qa.english_copies.terms": (s, o) => qa.englishCopies(s, o, terms),
    "qa.numbers_changed": (s, o) => qa.numbersChanged(s, o),
    "qa.missing_tokens": (s, o) => qa.missingTokens(s, o),
    "qa.omitted_clauses": (s, o) => qa.omittedClauses(s, o),
    "qa.new_latex": (s, o) => qa.newLatex(s, o),
    "qa.fix_latex": (s, o) => qa.fixLatex(s, o),
    "qa.source_case": (s, o) => qa.sourceCase(s, o),
    "qa.suspicious_tokens": (s, o) => qa.suspiciousTokens(o, s),
    "qa.suspicious_tokens.allowed": (s, o) => qa.suspiciousTokens(o, s, data.suspicious_allowed),
    "qa.glossary_misses": (s, o) => qa.glossaryMisses(s, o, hits),
    "qa.strip_leaks": (s, o) => qa.stripLeaks(s, o),
    "tr._suspect": (s, o) => tr.suspect(s, o),
    "tr._suspect.context": (s, o) => tr.suspect(s, o, true),
    "tr._same": (s, o) => tr.same(s, o),
  };
}

function singleFns(data) {
  return {
    "tags.ids": (t) => tags.ids(t),
    "tags.strip_tags": (t) => tags.stripTags(t),
    "tags.strip_tags.keep_x": (t) => tags.stripTags(t, true),
    "tr._plain": (t) => tr.plain(t),
    "tr._reminder": (t) => tr.reminder(t),
    "qa.protected_tokens": (t) => qa.protectedTokens(t),
    "qa.latex_markup": (t) => qa.latexMarkup(t),
    "qa._vietnamese": (t) => qa.vietnamese(t),
    "qa._first_alnum": (t) => {
      const i = qa.firstAlnum(t);
      return i < 0 ? i : py.cpLen(t.slice(0, i));
    },
    "vn.suspicious": (t) => vn.suspicious(t),
    "match.tokens": (t) => matching.tokens(t),
    "tr._code_only": (t) => tr.codeOnly(t),
    "tr._citation_only": (t) => tr.citationOnly(t),
    "tr._caps_prose": (t) => tr.capsProse(t, data.caps_hits),
    "qa._word_forms": (w) => qa.wordForms(w),
    "match._variants": (w) => matching.variants(py.pyLower(w)),
    "qa._bounded": (t) => qa.bounded(t),
    "vn.is_valid": (w) => vn.isValid(w),
    "vn._needs_check": (w) => vn.needsCheck(w),
    "qa.fix_title_order": (t) => {
      const log = [];
      const [text, applied] = qa.fixTitleOrder(t, log);
      return [text, applied, log];
    },
  };
}

function poolOf(data, name) {
  const p = data.pools;
  if (name === "tag") return p.tag_src.concat(p.tag_out);
  if (name === "every") return p.tag_src.concat(p.tag_out, p.qa_src, p.qa_out);
  return p[name];
}

function compareList(name, inputs, wants, fn, rows, marker) {
  const problems = [];
  let same = 0;
  inputs.forEach((args, k) => {
    let got;
    try {
      got = fn(...args);
    } catch (err) {
      got = "THROWS " + String(err && err.stack || err).slice(0, 300);
    }
    const want = marker !== null && marker !== undefined && wants[k] === true ? args[marker] : wants[k];
    if (jsonEqual(got, want)) same++;
    else problems.push("args " + show(args) + " -> js " + show(got) + " != py " + show(want));
  });
  rows.push({ name: name + " (" + same + "/" + inputs.length + ")", ok: problems.length === 0, same, total: inputs.length,
    detail: problems.slice(0, 3).join(" || ") });
}

export function unitChecks(data) {
  const rows = [];
  const pfns = pairFns(data);
  for (const [name, [a, b, marker, wants]] of Object.entries(data.pairs)) {
    const fn = pfns[name];
    if (!fn) {
      rows.push({ name: "units " + name, ok: false, detail: "no JS function" });
      continue;
    }
    const inputs = [];
    for (const x of data.pools[a]) for (const y of data.pools[b]) inputs.push([x, y]);
    compareList("units " + name, inputs, wants, fn, rows, marker);
  }
  const sfns = singleFns(data);
  for (const [name, [pool, wants]] of Object.entries(data.single)) {
    const fn = sfns[name];
    if (!fn) {
      rows.push({ name: "units " + name, ok: false, detail: "no JS function" });
      continue;
    }
    compareList("units " + name, poolOf(data, name === "qa._bounded" ? "terms_bounded" : pool).map((t) => [t]), wants, fn,
      rows, null);
  }
  // Python str predicates
  const chars = Array.from(data.py.chars);
  const charFns = { isdigit: py.isDigit, isalnum: py.isAlnum, isupper: py.isUpperCh, islower: py.isLowerCh,
    isalpha: py.isAlpha, isspace: py.isSpace, nameok: (c) => py.isAlpha(c) && py.latinGreekName(c) };
  for (const [k, fn] of Object.entries(charFns)) compareList("py char " + k, chars.map((c) => [c]), data.py[k], fn, rows, null);
  const every = poolOf(data, "every");
  const strFns = { isupper: py.pyIsUpper, islower: py.pyIsLower, isalpha: py.pyIsAlpha, isascii: py.pyIsAscii,
    casefold: py.pyCasefold, lower: (s) => s.toLowerCase(), upper: (s) => s.toUpperCase(), split: py.pySplit,
    splitlines: py.pySplitlines };
  for (const [k, fn] of Object.entries(strFns)) compareList("py str " + k, every.map((t) => [t]), data.py.strings[k], fn, rows, null);
  // explicit cases
  const c = data.cases;
  const fixes = c.term_fix.fixes.map(fixOf);
  compareList("units qa.apply_term_fixes (+ log)", c.term_fix.rows.map((r) => [r[0], r[1]]),
    c.term_fix.rows.map((r) => [r[2], r[3], r[4]]), (src, out) => {
      const log = [];
      return [...qa.applyTermFixes(out, src, fixes, log), log];
    }, rows, null);
  compareList("units tr._gate_note + _retried", c.gate.map((r) => [r[0], r[1], r[2]]), c.gate.map((r) => [r[3], r[4]]),
    (issues, ans, src) => [tr.gateNote(issues, ans, src), tr.retried(issues)], rows, null);
  compareList("units tr._cacheable", c.cache.map((r) => [r[0], r[1]]), c.cache.map((r) => r[2]), tr.cacheable, rows, null);
  compareList("units tr._find_free", c.find_free.map((r) => r.slice(0, 4)), c.find_free.map((r) => r[4]),
    (text, target, sl, sr) => {
      const m = tr.findFree(text, target, sl, sr);
      return m === null ? null : [text.slice(0, m.start()), m.group(0)];
    }, rows, null);
  compareList("units tr._source_splits + _span_text", c.splits.map((r) => [r[0], r[1]]), c.splits.map((r) => [r[2], r[3]]),
    (tagged, n) => [tr.sourceSplits(tagged, n), tr.spanText(tagged, n)], rows, null);
  compareList("units tr.build_system", c.system.map((r) => r.slice(0, 4)), c.system.map((r) => r[4]),
    (style, prompt, name, hits) => tr.buildSystem(style, new Pack("p", "1", name, [], prompt, [], [], []), hits), rows, null);
  compareList("units tr.build_user", c.user.map((r) => r.slice(0, 4)), c.user.map((r) => r[4]), tr.buildUser, rows, null);
  compareList("units matching.count_terms", c.count_terms.map((r) => [r[0], r[1]]), c.count_terms.map((r) => r[2]),
    (text, terms) => sortedEntries(Object.fromEntries(matching.countTerms(text, terms))), rows, null);
  return rows;
}

// ---------------------------------------------------------------- packs

/** sha256 hex of text with CR LF / CR as LF (the exporter's text_sha). */
async function textSha(text) {
  const norm = text.replace(/\r\n?/g, "\n");
  const d = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function packSummary(p) {
  return { id: p.id, version: p.version, name: p.name, detect: [...p.detect], prompt: p.prompt,
    glossary: p.glossary.map((r) => [...r]), term_fixes: p.termFixes.map((f) => [f.en, f.vi, [...f.wrong]]),
    tests: p.tests, key: p.key(), allowed: allowedWords(p) };
}

const packOf = (s) => new Pack(s.id, s.version, s.name, s.detect, s.prompt, s.glossary, s.term_fixes.map(fixOf), s.tests);

/** source.read(where, packId, file) -> Promise<text | null>; where = "repo" (the repository's packs/) or
 * "synthetic" (fixtures/engine/packs). */
export function packLoader(source, where, pid) {
  return loadPack((f) => source.read(where, pid, f), (f) => source.read(where, "_shared", f));
}

export async function packChecks(data, source) {
  const rows = [];
  // the committed packs the fixtures were made from must be the ones in the working tree
  for (const [pid, files] of Object.entries(data.repo_files)) {
    const problems = [];
    for (const [file, sha] of Object.entries(files)) {
      const text = await source.read("repo", pid, file);
      if (text === null) problems.push(file + " missing");
      else if ((await textSha(text)) !== sha) problems.push(file + " changed since the export (re-run tools/export_engine_fixtures.py)");
    }
    rows.push({ name: "packs source packs/" + pid + " = fixture", ok: !problems.length, detail: problems.join("; ") });
  }
  const loaded = {};
  for (const [pid, want] of Object.entries(data.loaded)) {
    let got;
    try {
      loaded[pid] = await packLoader(source, want.where, pid);
      got = packSummary(loaded[pid]);
    } catch (err) {
      got = "THROWS " + String(err && err.message);
    }
    const { where, files, ...expected } = want; // eslint-disable-line no-unused-vars
    rows.push({ name: "packs load " + pid, ok: jsonEqual(got, expected), detail: jsonEqual(got, expected) ? "" :
      Object.keys(expected).filter((k) => !jsonEqual(got && got[k], expected[k])).map((k) => k + ": js " +
        show(got && got[k]) + " != py " + show(expected[k])).join(" || ") || show(got) });
  }
  for (const [pid, want] of Object.entries(data.errors)) {
    let ok = false;
    let detail = "loaded without error";
    try {
      await packLoader(source, want.where, pid);
    } catch (err) {
      ok = err instanceof PackError;
      detail = String(err && err.message);
    }
    rows.push({ name: "packs refuse " + pid, ok, detail: ok ? "" : detail + " (python: " + want.error + ")" });
  }
  for (const [name, inputs] of Object.entries(data.merge_inputs)) {
    const m = mergePacks(inputs.map(packOf));
    const got = m === null ? null : packSummary(m);
    rows.push({ name: "packs merge " + name, ok: jsonEqual(got, data.merges[name]), detail: show(got) });
  }
  const real = { real_kid_breast_path: ["breast-kid", "breast", "pathology"], real_breast_path: ["breast", "pathology"],
    real_alpha_path: ["alpha", "pathology"] };
  for (const [name, ids] of Object.entries(real)) {
    const m = ids.every((id) => loaded[id]) ? mergePacks(ids.map((id) => loaded[id])) : null;
    const got = m === null ? null : packSummary(m);
    rows.push({ name: "packs merge " + name, ok: jsonEqual(got, data.merges[name]), detail: show(got) });
  }
  const path = loaded.pathology;
  if (path) {
    const merged = mergePacks(["breast-kid", "breast", "pathology"].map((id) => loaded[id]));
    compareList("packs glossary_hits (pathology + merged, limit 5)", data.hits.map((h) => [h[0]]),
      data.hits.map((h) => [h[1], h[2]]), (text) => [glossaryHits(text, path.glossary), glossaryHits(text, merged.glossary, 5)],
      rows, null);
    compareList("packs real term fixes", data.term_fixes.map((r) => [r[0], r[1]]), data.term_fixes.map((r) => r[2]),
      (text, en) => qa.applyTermFixes(text, en, path.termFixes), rows, null);
  }
  compareList("packs read_glossary (csv)", data.csv.map((c) => [c[0]]), data.csv.map((c) => c[1]), readGlossary, rows, null);
  return rows;
}

// ---------------------------------------------------------------- matching

const PARAM_NAMES = { threshold: "threshold", min_terms: "minTerms", max_packs: "maxPacks", min_detect: "minDetect",
  max_families: "maxFamilies" };

function jsParams(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) out[PARAM_NAMES[k]] = v;
  return out;
}

const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

export function matchingChecks(data) {
  const rows = [];
  let scoredSame = 0;
  let selectSame = 0;
  let maxDiff = 0;
  const problems = [];
  for (const r of data.rows) {
    const manifest = data.manifests[r.manifest];
    const text = data.texts[r.text];
    const scored = matching.scorePacks(text, manifest);
    const ok = scored.length === r.scored.length && scored.every((m, k) => {
      const w = r.scored[k];
      maxDiff = Math.max(maxDiff, Math.abs(m.score - w.score));
      return m.entry.id === w.id && close(m.score, w.score) && jsonEqual(m.matched, w.matched) && m.terms === w.terms &&
        m.detectHits === w.detect_hits && m.reason === w.reason;
    });
    if (ok) scoredSame++;
    else problems.push("scored " + r.manifest + "/" + r.text + ": js " + show(scored.map((m) => [m.entry.id, m.score,
      m.matched, m.terms, m.detectHits])) + " != py " + show(r.scored));
    const sel = data.params.map((p) => matching.selectPacks(text, manifest, jsParams(p)).map((m) => [m.entry.id, m.reason]));
    if (jsonEqual(sel, r.select)) selectSame++;
    else problems.push("select " + r.manifest + "/" + r.text + ": js " + show(sel) + " != py " + show(r.select));
  }
  rows.push({ name: "matching score_packs (" + scoredSame + "/" + data.rows.length + ", max score diff " + maxDiff + ")",
    ok: scoredSame === data.rows.length, detail: problems.filter((p) => p.startsWith("scored")).slice(0, 3).join(" || ") });
  rows.push({ name: "matching select_packs x " + data.params.length + " parameter sets (" + selectSame + "/" +
    data.rows.length + ")", ok: selectSame === data.rows.length,
  detail: problems.filter((p) => p.startsWith("select")).slice(0, 3).join(" || ") });
  let chooseSame = 0;
  const chooseProblems = [];
  for (const c of data.choose) {
    const manifest = data.manifests[c.manifest];
    const text = data.texts[c.text];
    const [matches, unknown] = choosePacks(text, c.domain, manifest);
    const top = topCandidates(text, manifest, new Set(matches.map((m) => m.entry.id)));
    const ok = matches.length === c.matches.length && matches.every((m, k) => m.entry.id === c.matches[k][0] &&
      m.reason === c.matches[k][1] && close(m.score, c.matches[k][2])) && jsonEqual(unknown, c.unknown) && jsonEqual(top, c.top);
    if (ok) chooseSame++;
    else chooseProblems.push(c.manifest + "/" + c.text + "/" + c.domain + ": js " + show([matches.map((m) => [m.entry.id,
      m.reason, m.score]), unknown, top]) + " != py " + show([c.matches, c.unknown, c.top]));
  }
  rows.push({ name: "matching choose_packs + top_candidates (" + chooseSame + "/" + data.choose.length + ")",
    ok: chooseSame === data.choose.length, detail: chooseProblems.slice(0, 3).join(" || ") });
  return rows;
}

// ---------------------------------------------------------------- translate sessions (scripted model)

/** A model that replays the helper's calls in order and records how the JS prompts differ from them. */
export function scriptedModel(calls, problems) {
  let k = 0;
  const model = async (messages, options) => {
    const want = calls[k];
    if (!want) {
      problems.push("extra model call " + k + ": " + show(messages[1] && messages[1].content));
      throw new Error("no canned answer for call " + k);
    }
    if (messages.length !== 2 || messages[0].role !== "system" || messages[1].role !== "user") {
      problems.push("call " + k + " message shape " + show(messages.map((m) => m.role)));
    }
    if (messages[0].content !== want[0]) problems.push("call " + k + " system prompt: js " + show(messages[0].content) + " != py " + show(want[0]));
    if (messages[1].content !== want[1]) problems.push("call " + k + " user prompt: js " + show(messages[1].content) + " != py " + show(want[1]));
    if (options.maxTokens !== want[3] || options.temperature !== 0 || options.think !== false) {
      problems.push("call " + k + " options " + show(options) + " (num_predict " + want[3] + ")");
    }
    k++;
    return want[2];
  };
  model.count = () => k;
  return model;
}

export function segmentOf(xml) {
  return encode(parseXml(xml).documentElement);
}

/** The paragraph as the core gets it: tagged text + essential span ids decided from the run properties. */
function taggedOf(xml) {
  const seg = segmentOf(xml);
  return [seg, new tr.TaggedSegment(seg.tagged, essentialIds(seg))];
}

function translatorFor(cfg, model, tm) {
  return new tr.Translator({ model, system: cfg.system, modelKey: cfg.model, packKey: cfg.pack_key,
    fixes: cfg.fixes.map(fixOf), hits: cfg.hits, tm, allowed: cfg.allowed });
}

const setupOf = (cfg) => ({ system: cfg.system, scope: cfg.pack_key, hits: cfg.hits,
  fixes: cfg.fixes.map(([en, vi, wrong]) => ({ en, vi, wrong })), allowed: cfg.allowed });

async function tmRows(tm) {
  if (tm instanceof MemoryTM) return [...tm.rows].map(([k, v]) => [k, v.out, v.level]).sort((a, b) => py.cmpStr(a[0], b[0]));
  return (await tm.entries()).sort((a, b) => py.cmpStr(a[0], b[0]));
}

/** Replays every case of translate.json; makeTm() gives a fresh empty TM (MemoryTM in Node, IndexedDbTM in Chrome),
 * disposeTm(tm) closes it (and drops the test database). */
export async function translateChecks(data, makeTm = async () => new MemoryTM(), disposeTm = async (tm) => tm.close()) {
  const rows = [];
  for (const c of data.cases) {
    const problems = [];
    const tm = c.tm === false ? null : await makeTm();
    try {
      for (const [k, st] of c.steps.entries()) {
        const want = c.results[k];
        const cfg = { ...data.default_cfg, ...(c.cfg || {}), ...(st.cfg || {}) };
        const at = "step " + k + ": ";
        const [codecSeg, tseg] = taggedOf(st.put || st.recheck || st.para);
        if (codecSeg.tagged !== want.tagged) problems.push(at + "tagged js " + show(codecSeg.tagged) + " != py " + show(want.tagged));
        if (!jsonEqual([...essentialIds(codecSeg)], want.essential)) {
          problems.push(at + "essential spans js " + show(essentialIds(codecSeg)) + " != py " + show(want.essential));
        }
        if (st.put) {
          const t = translatorFor(cfg, scriptedModel([], problems), tm);
          const key = await t.key(tseg);
          if (key !== want.key) problems.push(at + "TM key " + key + " != " + want.key);
          await tm.put(key, st.out, st.level);
          if (!jsonEqual(await tmRows(tm), want.tm)) problems.push(at + "TM rows " + show(await tmRows(tm)));
          continue;
        }
        if (st.recheck) {
          const t = translatorFor(cfg, scriptedModel([], problems), tm);
          const flags = t.recheck(tseg, st.text);
          if (!jsonEqual(flags, want.flags)) problems.push(at + "recheck flags js " + show(flags) + " != py " + show(want.flags));
          continue;
        }
        // the production entry: plain segment data through core.translateSegments
        const model = scriptedModel(want.calls, problems);
        let r;
        try {
          [r] = await translateSegments([{ id: "s" + k, tagged: codecSeg.tagged, essential: essentialIds(codecSeg),
            prev: st.prev || "", nxt: st.nxt || "", where: c.name }], { model, setup: setupOf(cfg), modelKey: cfg.model, tm,
            sleep: async () => {} });
        } catch (err) {
          problems.push(at + "threw " + String(err && err.stack || err).slice(0, 300));
          continue;
        }
        if (model.count() !== want.calls.length) problems.push(at + model.count() + " model calls, python made " + want.calls.length);
        const work = r.reduced ? tseg.reduced(tr.isEssential) : tseg;
        const clientWork = r.reduced ? codecSeg.reduced(isEssentialSpan) : codecSeg; // what the client writes back
        if (clientWork.tagged !== work.tagged) problems.push(at + "client reduction " + show(clientWork.tagged));
        const got = { text: r.text, level: r.level, flags: r.flags, fixes: r.fixes, cached: r.cached,
          work_tagged: work.tagged, work_spans: [...r.spans].sort((a, b) => a - b) };
        for (const f of Object.keys(got)) {
          if (!jsonEqual(got[f], want[f])) problems.push(at + f + " js " + show(got[f]) + " != py " + show(want[f]));
        }
        const key = await translatorFor(cfg, scriptedModel([], problems), tm).key(tseg);
        if (key !== want.key) problems.push(at + "TM key " + key + " != " + want.key);
        if (tm !== null && !jsonEqual(await tmRows(tm), want.tm)) problems.push(at + "TM rows js " + show(await tmRows(tm)) + " != py " + show(want.tm));
      }
    } finally {
      if (tm) await disposeTm(tm);
    }
    rows.push({ name: "translate " + c.name, ok: problems.length === 0, detail: problems.slice(0, 4).join(" || ") });
  }
  return rows;
}

// ---------------------------------------------------------------- translation memory

/** TM keys against the helper's TM.key, and the store's behaviour (empty results never stored, overwrite; with
 * reopen(tm): the entries outlive a close). */
export async function tmChecks(keys, makeTm, reopen = null, disposeTm = async (tm) => tm.close()) {
  const rows = [];
  const bad = [];
  for (const [model, pack, tagged, key] of keys) {
    const got = await tmKey(model, pack, tagged);
    if (got !== key) bad.push(show([model, pack, tagged]) + ": " + got + " != " + key);
  }
  rows.push({ name: "tm key = TM.key (" + (keys.length - bad.length) + "/" + keys.length + ")", ok: !bad.length,
    detail: bad.slice(0, 2).join(" || ") });
  const problems = [];
  let tm = await makeTm();
  try {
    if ((await tm.get("missing")) !== null) problems.push("a missing key is not null");
    await tm.put("k1", "Trong <g1>x</g1> \u1edf ph\u1ed5i", 1);
    if (!jsonEqual(await tm.get("k1"), ["Trong <g1>x</g1> \u1edf ph\u1ed5i", 1])) problems.push("roundtrip " + show(await tm.get("k1")));
    for (const [k, blank] of [["k2", ""], ["k3", "   "], ["k4", "\u3000\x85\t"]]) {
      await tm.put(k, blank, 1);
      if ((await tm.get(k)) !== null) problems.push("blank result stored: " + show(blank));
    }
    await tm.put("k1", "B", 2);
    if (!jsonEqual(await tm.get("k1"), ["B", 2])) problems.push("overwrite " + show(await tm.get("k1")));
    if (reopen) {
      tm = await reopen(tm);
      if (!jsonEqual(await tm.get("k1"), ["B", 2])) problems.push("lost after reopen " + show(await tm.get("k1")));
    }
  } finally {
    await disposeTm(tm);
  }
  rows.push({ name: "tm store behaviour" + (reopen ? " (with reopen)" : ""), ok: !problems.length, detail: problems.join(" || ") });
  return rows;
}

// ---------------------------------------------------------------- e2e: translateFile vs the helper's run_job

async function sha256Bytes(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const withoutSeconds = (report) => Object.fromEntries(Object.entries(report).filter(([k]) => k !== "seconds"));

/** A remote engine as the page would use one: setup and segment batches cross a JSON boundary (as a request to the
 * Cloudflare Function would) and the core runs on the other side. */
function remoteEngine(model, modelKey, packs) {
  const wire = (v) => JSON.parse(JSON.stringify(v));
  return {
    prepare: async (text, opts) => wire(await prepareTranslation(text, { packs, domain: opts.domain })),
    translateSegments: async (segments, { setup, tm, signal }) => {
      const request = wire({ segments, setup });
      return wire(await translateSegments(request.segments, { model, modelKey, setup: request.setup, tm, signal,
        sleep: async () => {} }));
    },
  };
}

/** The same synthetic files through pipeline.translateFile with the helper's recorded model answers: the same
 * progress events, report (timings aside), output name and output parts (changed ones byte-identical to the
 * helper's, every other entry identical to the input) -- with the local core, and with a remote engine fed in
 * batches of 20 segments. readFixture(name) -> bytes of tests/fixtures/<name>. */
export async function e2eChecks(data, source, readFixture, makeTm, disposeTm) {
  const rows = [];
  for (const mode of ["local", "remote"]) for (const c of data.cases) {
    const problems = [];
    const input = await readFixture(c.file);
    const model = scriptedModel(c.calls, problems);
    const events = [];
    const manifest = c.registry === "offline" ? null : data.manifests[c.registry];
    const packs = {
      manifest: async () => {
        if (!manifest) throw new Error("the registry is offline");
        return manifest;
      },
      readText: async (id, version, file) => {
        if (!data.where[id]) throw new Error("pack " + id + " is not available");
        return source.read(data.where[id], id, file);
      },
    };
    const tm = await makeTm();
    let res = null;
    try {
      const engine = mode === "remote" ? { ...remoteEngine(model, data.model, packs), batchSize: 20 } : {};
      res = await translateFile(input, c.file, { model, modelId: data.model, device: data.device, packs,
        domain: c.options.domain || "", tm, onProgress: (e) => events.push(e), notes: c.options.notes !== false,
        comments: Boolean(c.options.comments), now: () => 0, yieldFn: async () => {}, sleep: async () => {},
        ...engine });
      // the translation memory as the helper's run_job left it: keys carry model, pack keys (#sha256), style,
      // app version, translator version and system prompt hash
      if (c.tm && !jsonEqual(await tmRows(tm), c.tm)) {
        problems.push("TM rows js " + show((await tmRows(tm)).slice(0, 2)) + " != py " + show(c.tm.slice(0, 2)) + " (" +
          (await tmRows(tm)).length + " / " + c.tm.length + ")");
      }
    } catch (err) {
      problems.push("threw " + String((err && err.stack) || err).slice(0, 400));
    } finally {
      await disposeTm(tm);
    }
    if (res) {
      if (model.count() !== c.calls.length) problems.push(model.count() + " model calls, python made " + c.calls.length);
      if (!jsonEqual(events, c.events)) {
        const k = events.findIndex((e, i) => !jsonEqual(e, c.events[i]));
        problems.push("events differ at " + k + ": js " + show(events[k]) + " != py " + show(c.events[k]) + " (" +
          events.length + " / " + c.events.length + ")");
      }
      const report = withoutSeconds(res.report);
      if (!jsonEqual(report, c.report)) {
        const keys = [...new Set([...Object.keys(report), ...Object.keys(c.report)])].filter((k) => !jsonEqual(report[k], c.report[k]));
        problems.push("report differs in " + keys.map((k) => k + ": js " + show(report[k]) + " != py " + show(c.report[k])).join("; "));
      }
      if (res.name !== c.output) problems.push("output name " + res.name + " != " + c.output);
      const out = new OoxmlPackage(res.bytes);
      const src = new OoxmlPackage(input);
      if (!jsonEqual(out.names(), src.names())) problems.push("entry list changed");
      for (const name of out.names()) {
        const got = out.bytes(name);
        if (c.parts[name]) {
          if ((await sha256Bytes(got)) !== c.parts[name].sha256) problems.push("part " + name + " differs from the helper's");
        } else if (!sameBytes(got, src.bytes(name))) {
          problems.push("entry " + name + " changed, the helper kept it");
        }
      }
    }
    rows.push({ name: "e2e " + mode + " " + c.file + " (" + c.registry + (c.options.domain ? ", domain " + c.options.domain : "") + ")",
      ok: problems.length === 0, detail: problems.slice(0, 4).join(" || ") });
  }
  return rows;
}

// ---------------------------------------------------------------- core API: pack sources vs parsed pack sets

/** The pack source of the e2e fixtures (repo packs + synthetic ones) for a manifest. */
export function e2eSource(e2e, source, manifest) {
  return {
    manifest: async () => manifest,
    readText: async (id, version, file) => {
      if (!e2e.where[id]) throw new Error("pack " + id + " is not available");
      return source.read(e2e.where[id], id, file);
    },
  };
}

/** prepareTranslation / selectPacks give the same JSON with a pack source and with the parsed pack set built from it
 * (after a JSON round trip, as a bundle would be); packToData / packFromData round-trip every pack. */
export async function coreApiChecks(e2e, matchingData, source) {
  const rows = [];
  const manifest = e2e.manifests.three;
  const packSource = e2eSource(e2e, source, manifest);
  const set = JSON.parse(JSON.stringify(await buildPackSet(packSource)));
  rows.push({ name: "core buildPackSet reads the style and every manifest pack", ok: Boolean(set.style) &&
    jsonEqual(Object.keys(set.packs).sort(), manifest.packs.map((e) => e.id).sort()), detail: show(Object.keys(set.packs)) });
  let roundTrip = 0;
  for (const data of [set.style, ...Object.values(set.packs)]) if (jsonEqual(packToData(packFromData(data)), data)) roundTrip++;
  rows.push({ name: "core packToData / packFromData round trip (" + roundTrip + "/" + (1 + Object.keys(set.packs).length) + ")",
    ok: roundTrip === 1 + Object.keys(set.packs).length, detail: "" });
  let same = 0;
  let total = 0;
  const problems = [];
  for (const [tname, text] of Object.entries(matchingData.texts)) {
    for (const domain of ["", "breast", "finance, ghost"]) {
      total++;
      const a = await prepareTranslation(text, { packs: packSource, domain });
      const b = await prepareTranslation(text, { packs: set, domain });
      const ev = await selectPacks(text, manifest, { packs: set, domain });
      if (jsonEqual(a, b) && jsonEqual(ev, a.classify) && jsonEqual(JSON.parse(JSON.stringify(a)), a)) same++;
      else problems.push(tname + "/" + domain + ": " + show([a.classify, b.classify, ev]));
    }
  }
  rows.push({ name: "core prepareTranslation / selectPacks: source = parsed set (" + same + "/" + total + ")",
    ok: same === total, detail: problems.slice(0, 2).join(" || ") });
  return rows;
}

// ---------------------------------------------------------------- report: buildReport vs report.py

export function reportChecks(data) {
  return data.cases.map((c) => {
    const got = buildReport(c.meta, c.rows, c.skipped, c.fit, c.fonts);
    const keys = [...new Set([...Object.keys(got), ...Object.keys(c.report)])].filter((k) => !jsonEqual(got[k], c.report[k]));
    return { name: "report " + c.name, ok: keys.length === 0,
      detail: keys.map((k) => k + ": js " + show(got[k]) + " != py " + show(c.report[k])).join("; ") };
  });
}

// ---------------------------------------------------------------- repair: term repair candidates vs repair.py

export async function repairChecks(data, source, load) {
  const rows = [];
  const keys = (await packLoader(source, "repo", data.pack)).glossary.map((r) => r[0]).concat(data.extra_keys);
  rows.push({ name: "repair keys of " + data.pack + " + " + data.extra_keys.length + " synthetic (" + keys.length + ")",
    ok: keys.length === data.key_count, detail: keys.length + " != " + data.key_count });
  const lex = await load("../../../medical_words.json");
  const index = repair.termIndex(keys, lex.terms.concat(lex.corpus));
  const sounds = Object.entries(data.sounds).filter(([w, code]) => repair.soundKey(w) !== code);
  rows.push({ name: "repair sound keys (" + (Object.keys(data.sounds).length - sounds.length) + "/" +
    Object.keys(data.sounds).length + ")", ok: sounds.length === 0,
  detail: sounds.slice(0, 5).map(([w, code]) => w + ": js " + repair.soundKey(w) + " != py " + code).join("; ") });
  for (const [name, get, want] of [
    ["words", (t) => repair.words(t).map((w) => w[2]), (c) => c.words],
    ["candidates", (t) => repair.findCandidates(t, index), (c) => c.candidates],
    ["candidates gate off", (t) => repair.findCandidates(t, index, { gate: "off" }), (c) => c.off],
    ["candidates gate any", (t) => repair.findCandidates(t, index, { gate: "any" }), (c) => c.any],
    ["candidates limit 3, min score 700", (t) => repair.findCandidates(t, index, { limit: 3, minScore: 700 }),
      (c) => c.small]]) {
    const bad = data.cases.filter((c) => !jsonEqual(get(c.text), want(c)));
    rows.push({ name: "repair " + name + " (" + (data.cases.length - bad.length) + "/" + data.cases.length + ")",
      ok: bad.length === 0, detail: bad.slice(0, 3).map((c) => show(c.text) + ": js " + show(get(c.text)) + " != py " +
        show(want(c))).join("; ") });
  }
  return rows;
}

// ---------------------------------------------------------------- every area

/** All M2 parity rows ({area, name, ok, detail}), the same in Node and Chrome. load(name) -> parsed fixture of
 * tests/fixtures/engine; source: the pack source of packChecks; makeTm / disposeTm / reopen: the TM under test;
 * readFixture(name) -> bytes of an OOXML fixture of tests/fixtures. */
export async function engineChecks({ load, source, makeTm, disposeTm, reopen = null, readFixture, onArea = () => {} }) {
  const out = [];
  const add = (area, rows) => {
    out.push(...rows.map((r) => ({ area, ...r })));
    onArea(area, rows);
  };
  add("pyre", pyreChecks(await load("pyre.json")));
  const units = await load("units.json");
  add("units", unitChecks(units));
  add("tm", await tmChecks(units.tm_keys, makeTm, reopen, disposeTm));
  add("packs", await packChecks(await load("packs.json"), source));
  const matchingData = await load("matching.json");
  add("matching", matchingChecks(matchingData));
  add("repair", await repairChecks(await load("repair.json"), source, load));
  add("translate", await translateChecks(await load("translate.json"), makeTm, disposeTm));
  add("report", reportChecks(await load("report.json")));
  const e2e = await load("e2e.json");
  add("e2e", await e2eChecks(e2e, source, readFixture, makeTm, disposeTm));
  add("core", await coreApiChecks(e2e, matchingData, source));
  return out;
}
