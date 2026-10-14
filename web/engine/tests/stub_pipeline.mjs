// Stand-in for engine/pipeline.js (served by page.mjs --stub-pipeline at /engine/pipeline.js) while the M2 pipeline is
// being built: the engine contract's translateFile with M1's OOXML layer only. Every segment goes to the model as
// "Translate:\n<tagged>" (system prompt = the registry's _style prompt); an answer with the source's tags is written
// back, anything else keeps the source. Events and report have the helper's shapes. Test infrastructure only; the
// imports are relative to where it is served (/engine/pipeline.js), not to this folder.
import { OoxmlPackage } from "./ooxml/package.js";
import { collectItems } from "./ooxml/document.js";
import { apply } from "./ooxml/codec.js";
import { ids } from "./tags.js";

const sameTags = (a, b) => JSON.stringify(ids(a)) === JSON.stringify(ids(b));
const shown = (t) => t.replace(/<\/?g\d+>/g, "").replace(/<x\d+\/>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);

export async function translateFile(bytes, name, opts) {
  const o = opts || {};
  const t0 = Date.now();
  const progress = o.onProgress || (() => {});
  progress({ stage: "extract" });
  const pkg = new OoxmlPackage(bytes);
  const items = collectItems(pkg, { notes: o.notes !== false });
  const work = items.filter((i) => i.segment);
  const skipped = items.filter((i) => !i.segment).map((i) => ({ where: i.location, reason: i.skip, text: i.text.slice(0, 200) }));
  const words = work.reduce((s, i) => s + i.segment.plain.split(/\s+/).filter(Boolean).length, 0);
  progress({ stage: "extract", segments: work.length, words, skipped: skipped.length });
  const manifest = await o.packs.manifest();
  const style = (await o.packs.readText("_style", null, "prompt.md")) || "";
  progress({ stage: "classify", offline: o.packs.offline, unavailable: [], packs: [],
    candidates: manifest.packs.slice(0, 3).map((e) => ({ id: e.id, name: e.name, score: 0 })) });
  progress({ stage: "device", device: o.device.kind, device_name: o.device.name, model: o.modelId, polish: false });
  const t1 = Date.now();
  const rows = [];
  for (let n = 0; n < work.length; n++) {
    if (o.signal && o.signal.aborted) throw new DOMException("aborted", "AbortError");
    const item = work[n];
    const user = "Translate:\n" + item.segment.tagged;
    const answer = await o.model([{ role: "system", content: style }, { role: "user", content: user }],
      { temperature: 0, maxTokens: Math.min(4096, 64 + 2 * user.length), think: false, signal: o.signal });
    const ok = answer && sameTags(item.segment.tagged, answer);
    const text = ok ? answer : item.segment.tagged;
    apply(item.element, item.segment, text);
    pkg.markDirty(item.part);
    rows.push({ where: item.location, src: shown(item.segment.tagged), out: shown(text), level: ok ? 0 : 5,
      flags: ok ? [] : ["tags_broken"] });
    progress({ stage: "translate", done: n + 1, total: work.length, where: item.location });
    await new Promise((r) => setTimeout(r, 0));
  }
  const t2 = Date.now();
  progress({ stage: "write" });
  const out = pkg.save();
  const flagged = rows.filter((r) => r.level >= 3 || r.flags.length);
  const levels = {};
  for (const r of rows) levels[String(r.level)] = (levels[String(r.level)] || 0) + 1;
  const report = { file: name, output: name.replace(/(\.[^.]+)$/, "_vi$1"), kind: pkg.kind, packs: [],
    packs_unavailable: [], packs_unavailable_names: [], registry_offline: o.packs.offline, device: o.device.kind,
    device_name: o.device.name, model: o.modelId, fast: false, polish: { enabled: false },
    seconds: { prepare: (t1 - t0) / 1000, translate: (t2 - t1) / 1000, polish: 0, write: (Date.now() - t2) / 1000 },
    counts: { segments: rows.length, cached: 0, flagged: flagged.length,
      tag_exact_after_ladder: rows.filter((r) => r.level <= 2).length },
    levels, info: {}, skipped: {}, skipped_items: skipped.filter((s) => s.reason !== "no_text"), flagged, fit: [],
    fonts: [], review: { level: "careful", reasons: ["no_pack", "polish_off"], flagged: flagged.length,
      segments: rows.length }, stub: true };
  for (const s of skipped) report.skipped[s.reason] = (report.skipped[s.reason] || 0) + 1;
  progress({ stage: "done", flagged: flagged.length });
  return { bytes: out, name: report.output, report };
}
