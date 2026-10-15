// Runs the translation core in a bare JavaScript realm, the way a Cloudflare Pages Function (workerd) would: ES
// modules, fetch-era globals (TextEncoder / TextDecoder, crypto.subtle, URL, AbortController, timers) and nothing
// else -- no DOM, no DOMParser, no IndexedDB, no Buffer, no process. Every module of the core graph is loaded with
// node:vm (needs --experimental-vm-modules; tests/bare.test.mjs starts it) and only relative imports resolve.
// Then every session of tests/fixtures/engine/translate.json goes through core.translateSegments with the helper's
// recorded model answers. Prints one JSON line: {globals, modules, total, same, problems}.
import vm from "node:vm";
import { readFileSync } from "node:fs";

const ENGINE = new URL("../", import.meta.url);
const data = JSON.parse(readFileSync(new URL("./fixtures/engine/translate.json", import.meta.url), "utf8"));

const context = vm.createContext({
  TextEncoder, TextDecoder, crypto: globalThis.crypto, URL, console, setTimeout, clearTimeout, queueMicrotask,
  AbortController, AbortSignal, structuredClone,
});
const modules = new Map();

function load(url) {
  if (!modules.has(url.href)) {
    modules.set(url.href, new vm.SourceTextModule(readFileSync(url, "utf8"), { identifier: url.href, context }));
  }
  return modules.get(url.href);
}

async function link(specifier, referencing) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    throw new Error("non-relative import " + specifier + " in " + referencing.identifier);
  }
  return load(new URL(specifier, referencing.identifier));
}

const root = load(new URL("core.js", ENGINE));
await root.link(link);
await root.evaluate();
const core = root.namespace;
const globals = vm.runInContext("[typeof DOMParser, typeof document, typeof indexedDB, typeof Buffer, typeof process, " +
  "typeof window].join(',')", context);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => JSON.stringify(v).replace(/[^\x20-\x7e]/g, "?").slice(0, 300);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

let total = 0;
let ok = 0;
const problems = [];
for (const c of data.cases) {
  total += 1;
  const bad = [];
  const tm = c.tm === false ? null : new core.MemoryTM();
  for (const [k, st] of c.steps.entries()) {
    const want = c.results[k];
    const cfg = { ...data.default_cfg, ...(c.cfg || {}), ...(st.cfg || {}) };
    const setup = { system: cfg.system, scope: cfg.pack_key, hits: cfg.hits,
      fixes: cfg.fixes.map(([en, vi, wrong]) => ({ en, vi, wrong })), allowed: cfg.allowed };
    const seg = new core.TaggedSegment(want.tagged, want.essential);
    const keyer = new core.Translator({ model: async () => "", system: setup.system, modelKey: cfg.model,
      packKey: setup.scope, fixes: setup.fixes, hits: setup.hits, tm, allowed: setup.allowed });
    if (st.put) {
      const key = await keyer.key(seg);
      if (key !== want.key) bad.push(k + ": key");
      await tm.put(key, st.out, st.level);
      continue;
    }
    if (st.recheck) {
      if (!same(keyer.recheck(seg, st.text), want.flags)) bad.push(k + ": recheck " + show(keyer.recheck(seg, st.text)));
      continue;
    }
    let call = 0;
    const model = async (messages, options) => {
      const w = want.calls[call];
      if (!w) throw new Error("extra model call");
      if (messages[0].content !== w[0] || messages[1].content !== w[1] || options.maxTokens !== w[3] ||
        options.temperature !== 0 || options.think !== false) bad.push(k + ": prompt / options of call " + call);
      call += 1;
      return w[2];
    };
    let r;
    try {
      [r] = await core.translateSegments([{ id: "s" + k, tagged: want.tagged, essential: want.essential,
        prev: st.prev || "", nxt: st.nxt || "", where: c.name }], { model, setup, modelKey: cfg.model, tm });
    } catch (err) {
      bad.push(k + ": threw " + String(err && err.message));
      continue;
    }
    if (call !== want.calls.length) bad.push(k + ": " + call + " calls for " + want.calls.length);
    const work = r.reduced ? seg.reduced(core.isEssential) : seg;
    const got = { id: r.id, text: r.text, level: r.level, flags: r.flags, fixes: r.fixes, cached: r.cached,
      work_tagged: work.tagged, work_spans: [...r.spans].sort((a, b) => a - b) };
    const exp = { id: "s" + k, text: want.text, level: want.level, flags: want.flags, fixes: want.fixes,
      cached: want.cached, work_tagged: want.work_tagged, work_spans: want.work_spans };
    if (!same(got, exp)) bad.push(k + ": js " + show(got) + " py " + show(exp));
    if ((await keyer.key(seg)) !== want.key) bad.push(k + ": key");
    if (tm) {
      const rows = [...tm.rows].map(([key, v]) => [key, v.out, v.level]).sort((a, b) => cmp(a[0], b[0]));
      if (!same(rows, want.tm)) bad.push(k + ": tm rows");
    }
  }
  if (bad.length) problems.push(c.name + ": " + bad.slice(0, 2).join(" | "));
  else ok += 1;
}
// The Function's own path: a parsed pack set bundled as JSON (built here in Node from the repository's committed
// packs and the synthetic ones), prepareTranslation in the bare realm = in Node, for every matching text.
const e2e = JSON.parse(readFileSync(new URL("./fixtures/engine/e2e.json", import.meta.url), "utf8"));
const matchingTexts = JSON.parse(readFileSync(new URL("./fixtures/engine/matching.json", import.meta.url), "utf8")).texts;
const nodeCore = await import("../core.js");
const where = { repo: new URL("../../../packs/", import.meta.url), synthetic: new URL("./fixtures/engine/packs/", import.meta.url) };
const source = {
  manifest: async () => e2e.manifests.three,
  readText: async (id, version, file) => {
    if (!e2e.where[id]) throw new Error("no pack " + id);
    try {
      return nodeCore.decodeText(readFileSync(new URL(id + "/" + file, where[e2e.where[id]])));
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },
};
const setJson = JSON.stringify(await nodeCore.buildPackSet(source));
let setSame = 0;
let setTotal = 0;
for (const text of Object.values(matchingTexts)) {
  setTotal += 1;
  const bare = JSON.stringify(await core.prepareTranslation(text, { packs: JSON.parse(setJson) }));
  const node = JSON.stringify(await nodeCore.prepareTranslation(text, { packs: source }));
  if (bare === node) setSame += 1;
  else problems.push("pack set: " + show(text.slice(0, 40)));
}
console.log(JSON.stringify({ globals, modules: modules.size, total, same: ok, setTotal, setSame,
  problems: problems.slice(0, 5) }));
