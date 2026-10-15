// M4 acceptance harness for the cloud engine (spec Amendment F; the in-browser LiteRT version is paused). The page in
// the installed Chrome (playwright-core) runs every document of private/corpus.txt (or --files substrings) through its
// cloud flow against
//   --origin URL  a running site with the real API (e.g. `npx wrangler pages dev web` in a tools/build_site.py folder,
//                 with the Turnstile TEST secret so the page's localhost test key passes; or a deployment). The corpus
//                 then goes to Cloudflare, which needs his OK: --yes-send-corpus is required.
//   --mock        the scripted API of mock_api.mjs on a local copy of --site (plumbing smoke only: no model, the
//                 "translation" is the source; nothing leaves the machine).
// Every /api/v1/translate request and answer is recorded (the per-segment outcomes, as tools/e2e.py's
// RecordingTranslator records them); each output, its segments and a summary go to --out (outside the repo, or the
// git-ignored out/). A small Python step scores like tools/e2e.py: tag_exact_rate (levels 0-2) >= 0.95 per file,
// silent_english == 0 (tools/_common.py is_silent_english) and tags_broken_final == 0 (vitranslate.tags.check on the
// level 0-2 answers); time per file. --office opens the outputs with tools/com_open_check.ps1. ASCII output.
// Usage: node web/engine/tests/accept_cloud.mjs (--origin URL --yes-send-corpus | --mock --site DIR) --out DIR
//        [--files SUBSTR ...] [--corpus LIST] [--python EXE] [--office] [--headed]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, basename, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startSiteServer } from "./site_server.mjs";
import { mockApi } from "./mock_api.mjs";

const REPO = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const ACCEPT = 0.95;
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, "?");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const listOpt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return [];
  const out = [];
  for (let k = i + 1; k < args.length && !args[k].startsWith("--"); k++) out.push(args[k]);
  return out;
};
const mock = args.includes("--mock");
const origin = opt("--origin", "");
const out = opt("--out") ? resolve(opt("--out")) : "";
if (!out || (!mock && !origin) || (mock && !opt("--site"))) {
  console.log("usage: node web/engine/tests/accept_cloud.mjs (--origin URL --yes-send-corpus | --mock --site DIR) --out DIR"
    + " [--files SUBSTR ...] [--corpus LIST] [--python EXE] [--office] [--headed]");
  process.exit(2);
}
if (origin && !args.includes("--yes-send-corpus")) {
  console.log("REFUSED: --origin sends the corpus to the cloud API; add --yes-send-corpus once he has agreed");
  process.exit(2);
}
if ((out + sep).startsWith(REPO + sep) && !(out + sep).startsWith(join(REPO, "out") + sep)) {
  console.log("REFUSED: --out must be outside the repo or under its git-ignored out/");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

// the documents: private/corpus.txt (or --corpus), .docx / .pptx, optionally only names containing --files substrings
const listing = opt("--corpus", join(REPO, "private", "corpus.txt"));
const subs = listOpt("--files").map((s) => s.toLowerCase());
const docs = readFileSync(listing, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  .filter((p) => /\.(docx|pptx)$/i.test(p))
  .filter((p) => !subs.length || subs.some((s) => basename(p).toLowerCase().includes(s)));
if (!docs.length) {
  console.log("no corpus file matches");
  process.exit(2);
}

// tools/e2e.py's acceptance numbers for one file, through the helper's own Python code
const PY_SCORE = [
  "import json, sys",
  "sys.path.insert(0, sys.argv[1])",
  "import _common as c",
  "from vitranslate.tags import check",
  "rows = json.load(open(sys.argv[2], encoding='utf-8'))",
  "silent = sum(1 for r in rows if c.is_silent_english(r['src_tagged'], r['final_tagged'], r['flags']))",
  "broken = sum(1 for r in rows if r['level'] <= 2 and check(r['src_tagged'], r['final_tagged']))",
  "print(json.dumps({'silent_english': silent, 'tags_broken_final': broken}))",
].join("\n");
const python = opt("--python", process.env.VITRANSLATE_PY || "python");

function score(rowsPath) {
  const r = spawnSync(python, ["-c", PY_SCORE, join(REPO, "tools"), rowsPath], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("python scoring failed: " + ascii(r.stderr).slice(-600));
  return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
}

let server = null;
let base = origin.replace(/\/$/, "");
let api = null;
if (mock) {
  const site = opt("--site");
  server = await startSiteServer(existsSync(join(site, "web", "index.html")) ? join(site, "web") : site, {}, 0);
  base = server.origin;
}
const browser = await chromium.launch({ channel: "chrome", headless: !args.includes("--headed") });
const context = await browser.newContext({ acceptDownloads: true });
const summary = { mode: mock ? "mock" : "origin", origin: base, files: [], ok: false };
const calls = [];  // every translate request with its answer
try {
  if (mock) {
    api = mockApi("ok");
    await context.route("**/api/v1/**", api.handler);
  }
  await context.route(/^http:\/\/(127\.0\.0\.1|localhost):4783[1-5]\//, (r) => r.abort());  // no helper: the cloud
  const page = await context.newPage();
  page.on("response", async (resp) => {
    if (!/\/api\/v1\/translate$/.test(new URL(resp.url()).pathname) || !resp.ok()) return;
    try {
      calls.push({ request: JSON.parse(resp.request().postData() || "{}"), answer: await resp.json() });
    } catch (e) { /* not JSON: the page reports it */ }
  });
  await page.goto(base + "/");
  // the one first-use consent comes at load; the cloud view says just "Sẵn sàng"
  if (await page.waitForSelector("#consent[open]", { timeout: 5000 }).catch(() => null)) {
    await page.check("#agree");
    await page.click("#consent-ok");
  }
  await page.waitForFunction(() => document.getElementById("status").textContent === "Sẵn sàng", null, { timeout: 60000 });
  console.log("engine: " + ascii(await page.textContent("#status")));
  await page.click("#tab-file");  // the text tab comes first
  for (const doc of docs) {
    const name = basename(doc);
    const seen = new Set(calls.map((c) => c.request.job_id));
    const t0 = Date.now();
    await page.setInputFiles("#file", doc);
    await page.click("#go");
    const outcome = await Promise.race([
      page.waitForSelector("#result:not([hidden]) #download:not([hidden])", { timeout: 4 * 3600000 }).then(() => "done"),
      page.waitForSelector("#error:not([hidden])", { timeout: 4 * 3600000 }).then(() => "error"),
    ]);
    const row = { file: name, outcome, seconds: Math.round((Date.now() - t0) / 100) / 10 };
    if (outcome === "error") {
      row.error = await page.textContent("#error-text");
    } else {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
      row.output = dl.suggestedFilename();
      await dl.saveAs(join(out, row.output));
      row.summary = await page.textContent("#summary");
      await page.click("#delete");
    }
    const mine = calls.filter((c) => !seen.has(c.request.job_id));
    const rows = [];
    for (const c of mine) {
      const byId = new Map((c.answer.results || []).map((r) => [String(r.id), r]));
      for (const s of c.request.segments || []) {
        const r = byId.get(String(s.id)) || {};
        rows.push({ id: s.id, where: s.where, src_tagged: s.tagged, final_tagged: r.text || "", level: r.level,
          flags: r.flags || [] });
      }
    }
    rows.sort((a, b) => a.id - b.id);
    const rowsPath = join(out, name.replace(/(\.[^.]+)$/, "_vi_segments.json"));
    writeFileSync(rowsPath, JSON.stringify(rows, null, 1), "utf8");
    const levels = {};
    for (const r of rows) levels[String(r.level)] = (levels[String(r.level)] || 0) + 1;
    Object.assign(row, { segments: rows.length, levels, translate_calls: mine.length,
      neurons: mine.reduce((a, c) => a + (((c.answer.usage || {}).neurons) || 0), 0),
      tag_exact_rate: rows.length ? Math.round(10000 * rows.filter((r) => r.level <= 2).length / rows.length) / 10000 : 0 },
    rows.length ? score(rowsPath) : { silent_english: 0, tags_broken_final: 0 });
    summary.files.push(row);
    console.log(JSON.stringify(Object.assign({}, row, { file: ascii(row.file), output: row.output && ascii(row.output),
      summary: undefined, error: row.error && ascii(row.error) })));
  }
} catch (err) {
  summary.error = String((err && err.stack) || err);
  console.log("ERROR " + ascii(summary.error).slice(0, 800));
} finally {
  await browser.close();
  if (server) await server.close();
}
if (api) summary.contract_violations = api.st.violations;
if (args.includes("--office") && summary.files.some((f) => f.output)) {
  const r = spawnSync("powershell", ["-NoProfile", "-File", join(REPO, "tools", "com_open_check.ps1"), "-Dir", out],
    { encoding: "utf8" });
  summary.office_failures = Number((/failures: (\d+)/.exec(r.stdout || "") || [])[1] ?? -1);
  console.log("office: " + ascii((r.stdout || "").trim().split(/\r?\n/).slice(-2).join(" | ")));
}
const files = summary.files;
const silent = files.reduce((a, f) => a + (f.silent_english || 0), 0);
const broken = files.reduce((a, f) => a + (f.tags_broken_final || 0), 0);
summary.ok = !summary.error && files.length === docs.length && files.every((f) => f.outcome === "done"
  && f.tag_exact_rate >= ACCEPT) && silent === 0 && broken === 0 && !(summary.office_failures > 0)
  && !(summary.contract_violations || []).length;
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 1), "utf8");
console.log("TOTAL files=" + files.length + " segments=" + files.reduce((a, f) => a + (f.segments || 0), 0)
  + " silent_english=" + silent + " tags_broken_final=" + broken);
console.log("ACCEPT tag_exact>=" + ACCEPT + " per file, silent_english==0, tags_broken_final==0: " + summary.ok
  + (mock ? " (mock API: plumbing only, the numbers say nothing about quality)" : ""));
process.exit(summary.ok ? 0 : 1);
