// OCR accuracy, time and memory in the installed Chrome (playwright-core, channel "chrome", headless): the real
// engine (web/ocr/ocr.js: PP-OCRv5 mobile det + en rec on onnxruntime-web WASM) on synthetic images
// (tests/synthetic.js: slide, page of body text, table, rotated +3 / -5 degrees, low contrast, a camera-like 2048 x
// 1536 photo), served with the site's _headers (its CSP) by web/engine/tests/site_server.mjs.
//   accuracy: character error rate per case (tests/cer.js) at each detection size; the target is CER <= 5 % on the
//             clean renders (slide, paragraph, table)
//   memory:   per backend, the camera-like 2048 px photo twice as the pages run it: time, the page's
//             longest stall, the renderer process's memory as Windows counts it (private bytes, working set, peak
//             working set) before loading, after loading and after the photos; then the time on the page's thread
// Any CSP violation, page error or failed request fails the run. ASCII output; JSON in <out>/ocr_accuracy.json.
// Both backends by default (--backends auto,wasm: auto = WebGPU where Chrome has it, after the engine's self-test).
// Usage: node web/ocr/tests/accuracy.mjs [--site <build_site dir or static dir>] [--out <dir>] [--sides 960,1280]
//        [--headed] [--only accuracy,memory] [--backends auto,wasm]
// (without --site the repo's web/ is served as it is; with --site the test files are served from here)
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "../../engine/node_modules/playwright-core/index.mjs";
import { startSiteServer } from "../../engine/tests/site_server.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const site = opt("--site");
const out = resolve(opt("--out", join(HERE, "..", "..", "..", "out", "ocr")));
const sides = opt("--sides", "960,1280,1600");
const only = opt("--only", "accuracy,memory").split(",");
const backends = opt("--backends", "auto,wasm").split(",");
const CLEAN_TARGET = 0.05;
mkdirSync(out, { recursive: true });

let root = WEB;
const overrides = {};
if (site) {
  root = existsSync(join(site, "web", "index.html")) ? join(site, "web") : site;
  for (const f of readdirSync(HERE)) overrides["/ocr/tests/" + f] = join(HERE, f);
}
const server = await startSiteServer(root, overrides, 0);
const browser = await chromium.launch({ channel: "chrome", headless: !args.includes("--headed") });
const summary = { origin: server.origin, site: site ? resolve(site) : "repo web/", problems: [] };
const pct = (x) => (100 * x).toFixed(2) + " %";
const mb = (b) => (b / 1048576).toFixed(1) + " MB";

// Windows' view of processes: [{ Id, WorkingSet64, PeakWorkingSet64, PrivateMemorySize64 }] (null elsewhere)
function processMemory(pids) {
  if (process.platform !== "win32" || !pids.length) return null;
  const cmd = "Get-Process -Id " + pids.join(",") + " | Select-Object Id,WorkingSet64,PeakWorkingSet64,"
    + "PrivateMemorySize64 | ConvertTo-Json -Compress";
  const out = JSON.parse(execFileSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" }));
  return Array.isArray(out) ? out : [out];
}

async function open(query) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile });
    });
  });
  const page = await context.newPage();
  const row = { pageErrors: [], failed: [], console: [] };
  page.on("pageerror", (e) => row.pageErrors.push(String(e)));
  page.on("requestfailed", (r) => row.failed.push(r.url() + " " + (r.failure() || {}).errorText));
  page.on("console", (m) => {
    if (args.includes("--verbose")) console.log("  [page] " + m.type() + " " + m.text().replace(/[^\x20-\x7e]/g, "?").slice(0, 300));
    if (m.type() === "error" || /Content Security Policy|Refused to/i.test(m.text())) row.console.push(m.text());
  });
  page.on("crash", () => row.pageErrors.push("the page crashed"));
  if (args.includes("--verbose")) {
    const t0 = Date.now();
    page.on("request", (r) => console.log("  [net] " + (Date.now() - t0) + " start " + r.url()));
    page.on("requestfinished", (r) => console.log("  [net] " + (Date.now() - t0) + " done " + r.url()));
    page.on("requestfailed", (r) => console.log("  [net] " + (Date.now() - t0) + " FAILED " + r.url()));
  }
  await page.goto(server.origin + "/ocr/tests/accuracy.html" + query);
  return { context, page, row };
}

async function finish(name, p) {
  const csp = await p.page.evaluate(() => window.__csp).catch(() => []);
  for (const v of csp) summary.problems.push(name + ": CSP " + v.directive + " blocked " + v.blocked);
  for (const e of p.row.pageErrors) summary.problems.push(name + ": page error " + e);
  // Chrome sometimes reports a streamed fetch as net::ERR_ABORTED although the page read all of it (the engine checks
  // every file's sha256 and fails loudly otherwise): such lines are kept as notes; anything else fails the run
  for (const f of p.row.failed) {
    if (/net::ERR_ABORTED$/.test(f)) (summary.notes = summary.notes || []).push(name + ": reported aborted " + f);
    else summary.problems.push(name + ": request failed " + f);
  }
  for (const c of p.row.console) summary.problems.push(name + ": console " + c);
  await p.context.close();
}

try {
  for (const backend of only.includes("accuracy") ? backends : []) {
    const p = await open("?sides=" + sides + "&backend=" + backend);
    await p.page.waitForFunction(() => window.__result || window.__error, null, { timeout: 900000 });
    const err = await p.page.evaluate(() => window.__error);
    if (err) summary.problems.push("accuracy: " + err);
    const r = await p.page.evaluate(() => window.__result);
    await finish("accuracy " + backend, p);
    if (r) {
      (summary.accuracy = summary.accuracy || {})[backend] = r;
      console.log("asked " + backend + ": engine " + r.load.backend + (r.load.fallback ? " (fell back: " + r.load.fallback + ")" : "")
        + ", proxy " + r.proxy + ", loaded in " + Math.round(r.load.ms) + " ms (" + r.load.stages.join(" > ") + ")");
      console.log("side  case                 size        ms   stall  lines  CER");
      for (const x of r.results) {
        console.log(String(x.side).padEnd(6) + x.name.padEnd(21) + (x.w + "x" + x.h).padEnd(10)
          + String(x.ms).padStart(6) + String(x.maxGapMs).padStart(7) + (x.lines + "/" + x.truthLines).padStart(7)
          + "  " + pct(x.cer));
      }
      summary.cleanCer = summary.cleanCer || {};
      for (const side of [...new Set(r.results.map((x) => x.side))]) {
        const clean = r.results.filter((x) => x.side === side && x.clean);
        const all = r.results.filter((x) => x.side === side);
        const mean = (xs) => xs.reduce((s, x) => s + x.cer, 0) / xs.length;
        summary.cleanCer[backend + " " + side] = mean(clean);
        console.log(backend + " side " + side + ": clean CER " + pct(mean(clean)) + " (max " + pct(Math.max(...clean.map((x) => x.cer)))
          + "), all CER " + pct(mean(all)));
      }
      const target = r.results.filter((x) => x.clean && x.side === 960);
      for (const x of target) if (x.cer > CLEAN_TARGET) summary.problems.push(backend + ": clean CER above 5 %: " + x.name + " " + pct(x.cer));
    }
  }
  if (only.includes("memory")) {
    // per backend, as the pages run it (WASM: inference in the runtime's worker, inside the page's renderer process;
    // WebGPU: the page's thread + the GPU process): time of the 2048 px photo twice, the page's longest stall, and
    // memory as Windows counts it (private bytes, working set, peak working set) of the renderer and GPU processes
    const bcdp = await browser.newBrowserCDPSession();
    const procs = async () => (await bcdp.send("SystemInfo.getProcessInfo")).processInfo
      .filter((x) => x.type === "renderer" || x.type === "GPU").map((x) => ({ id: x.id, type: x.type }));
    summary.memory = {};
    for (const backend of backends) {
      const w = await open("?mode=memory&backend=" + backend);
      await w.page.waitForFunction(() => document.getElementById("state").textContent === "ready");
      const list = await procs();
      const pids = list.map((x) => x.id);
      const before = processMemory(pids);
      const load = await w.page.evaluate(() => window.__load());
      const loaded = processMemory(pids);
      const run1 = await w.page.evaluate(() => window.__run());
      const run2 = await w.page.evaluate(() => window.__run());
      const ran = processMemory(pids);
      await finish("memory " + backend, w);
      summary.memory[backend] = { procs: list, before, loaded, ran, load, run1, run2 };
      console.log("asked " + backend + ": engine " + load.backend + "; 2048 x 1536 photo (default detection size): "
        + Math.round(run1.ms) + " / " + Math.round(run2.ms) + " ms (first / second), longest page stall "
        + Math.round(Math.max(run1.maxGapMs, run2.maxGapMs)) + " ms, lines " + run2.lines + ", CER " + pct(run2.cer)
        + ", engine load " + Math.round(load.ms) + " ms");
      if (ran) {
        for (const kind of ["renderer", "GPU"]) {
          const ids = list.filter((x) => x.type === kind).map((x) => x.id);
          const pick = (m) => m.filter((x) => ids.includes(x.Id)).reduce((a, b) => (!a || b.PrivateMemorySize64 > a.PrivateMemorySize64 ? b : a), null);
          const r0 = pick(before), r1 = pick(loaded), r2 = pick(ran);
          if (!r0 || !r1 || !r2) continue;
          console.log("  " + kind + " process: private " + mb(r0.PrivateMemorySize64) + " before, " + mb(r1.PrivateMemorySize64)
            + " engine loaded, " + mb(r2.PrivateMemorySize64) + " after the photos; working set " + mb(r2.WorkingSet64)
            + ", peak working set " + mb(r2.PeakWorkingSet64));
        }
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
summary.ok = summary.problems.length === 0;
writeFileSync(join(out, "ocr_accuracy.json"), JSON.stringify(summary, null, 1));
for (const p of summary.problems) console.log("PROBLEM " + String(p).replace(/[^\x20-\x7e]/g, "?").slice(0, 300));
console.log(summary.ok ? "OK" : "FAILED (" + summary.problems.length + " problem(s))");
process.exit(summary.ok ? 0 : 1);
