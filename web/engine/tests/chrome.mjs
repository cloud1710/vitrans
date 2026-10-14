// Headless real-Chrome run of the browser check page (tests/browser.html): the OOXML parity fixtures, the unit
// checks and the M2 engine parity (tests/engine_checks.mjs, with the IndexedDB translation memory) with Chrome's own
// DOMParser, so platform-only defects (such as ill-formed XML that Chrome does not throw on) fail here even when the
// Node / xmldom tests pass. `npm run test:chrome` (playwright-core drives the installed Chrome: channel "chrome", no
// browser download). Serves web/engine on 127.0.0.1 (random port) and the committed packs the engine fixtures use
// (packs/_style, packs/pathology) under /repo-packs/; prints ASCII lines, exit 0 only when everything is identical.
// A page that cannot run (a module that does not load, a script error, a failed request) stops the run at once with
// the cause printed, instead of waiting for the page's result.
// --corpus <folder of corpus_N.json dumps> (LOCAL ONLY): runs the private corpus dumps instead of the fixtures; their
// source files are read where the dumps say and served under neutral names; nothing is written.
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = normalize(fileURLToPath(new URL("../", import.meta.url)));
const REPO_PACKS = normalize(fileURLToPath(new URL("../../../packs/", import.meta.url)));
const SERVED_PACKS = new Set(["_style", "pathology"]); // committed, non-draft packs only
const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".md": "text/plain" };
const WAIT_MS = 900000;
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, "?");

const args = process.argv.slice(2);
const corpusAt = args.indexOf("--corpus");
const corpus = new Map(); // served name -> bytes or file path
if (corpusAt >= 0) {
  const dir = args[corpusAt + 1];
  const names = [];
  for (const f of readdirSync(dir).filter((x) => /^corpus_\d+\.json$/.test(x)).sort()) {
    const dump = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const neutral = f.replace(/\.json$/, dump.kind === "docx" ? ".docx" : ".pptx");
    corpus.set(neutral, dump.file);
    dump.file = neutral;
    corpus.set(f, Buffer.from(JSON.stringify(dump)));
    names.push(f);
  }
  corpus.set("index.json", Buffer.from(JSON.stringify(names)));
}

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}

function sendFile(res, file, base) {
  if (!file.startsWith(base) || file.includes(sep + "node_modules" + sep)) return send(res, 403, "forbidden");
  try {
    if (!statSync(file).isFile()) return send(res, 404, "not found");
  } catch {
    return send(res, 404, "not found");
  }
  return send(res, 200, readFileSync(file), TYPES[extname(file)]);
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/favicon.ico") return send(res, 204, "");
  if (path.startsWith("/corpus/")) {
    const hit = corpus.get(path.slice("/corpus/".length));
    if (hit === undefined) return send(res, 404, "not found");
    return send(res, 200, typeof hit === "string" ? readFileSync(hit) : hit, path.endsWith(".json") ? TYPES[".json"] : null);
  }
  if (path.startsWith("/repo-packs/")) {
    const rest = path.slice("/repo-packs/".length);
    if (!SERVED_PACKS.has(rest.split("/")[0])) return send(res, 403, "forbidden");
    return sendFile(res, normalize(join(REPO_PACKS, rest)), REPO_PACKS);
  }
  return sendFile(res, normalize(join(ROOT, path)), ROOT);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ channel: "chrome", headless: true });
let ok = false;
try {
  const page = await browser.newPage();
  const errors = [];
  let stop;
  const broken = new Promise((resolve) => {
    stop = resolve;
  });
  const fatal = (text) => {
    errors.push(text);
    stop(text);
  };
  page.on("pageerror", (err) => fatal("page error: " + String((err && err.stack) || err)));
  // a 404 of a pack file is the pack reader's normal "no such file" answer (rules.json, tests.jsonl are optional)
  const packProbe = (msg) => msg.text().startsWith("Failed to load resource") &&
    /\/(repo-packs|fixtures\/engine\/packs)\//.test((msg.location() || {}).url || "");
  page.on("console", (msg) => {
    if (msg.type() === "error" && !packProbe(msg)) {
      fatal("console error: " + msg.text() + " (" + JSON.stringify(msg.location()) + ")");
    }
  });
  page.on("requestfailed", (r) => fatal("request failed: " + r.url() + " " + ((r.failure() || {}).errorText || "")));
  const query = corpus.size ? "?fixtures=/corpus/&checks=0&engine=0" : "";
  await page.goto("http://127.0.0.1:" + port + "/tests/browser.html" + query);
  const first = await Promise.race([
    page.waitForFunction(() => window.__parity && window.__parity.done, null, { timeout: WAIT_MS }).then(() => null),
    broken,
  ]);
  if (first !== null) {
    console.log("STOPPED: the check page cannot run");
    for (const e of errors) console.log("  " + ascii(e).slice(0, 800));
  } else {
    const r = await page.evaluate(() => window.__parity);
    console.log("Chrome " + (await browser.version()) + ", DOMParser: " + r.dom);
    const total = { items: [0, 0], parts: [0, 0], bytes: [0, 0], other: 0 };
    for (const row of r.rows) {
      console.log(ascii(row.file) + ": items " + row.items.join("/") + ", parts " + row.parts.join("/") + " (bytes " +
        row.bytes.join("/") + "), other " + row.other + ", " + row.ms + " ms");
      for (const d of row.partDiffs) console.log("  part diff: " + ascii(JSON.stringify(d)));
      for (const k of ["items", "parts", "bytes"]) {
        total[k][0] += row[k][0];
        total[k][1] += row[k][1];
      }
      total.other += row.other;
    }
    const failedChecks = r.checks.filter((c) => !c.ok);
    for (const c of failedChecks) console.log("CHECK FAILED " + ascii(c.name) + ": " + ascii(c.detail).slice(0, 400));
    const engine = r.engine || [];
    const failedEngine = engine.filter((c) => !c.ok);
    for (const area of [...new Set(engine.map((c) => c.area))]) {
      const rows = engine.filter((c) => c.area === area);
      console.log("engine " + area + ": " + rows.filter((c) => c.ok).length + "/" + rows.length + " rows identical");
    }
    for (const c of failedEngine.slice(0, 30)) console.log("ENGINE FAILED " + ascii(c.name) + ": " + ascii(c.detail).slice(0, 400));
    for (const e of errors) console.log("PAGE ERROR " + ascii(e).slice(0, 400));
    if (r.error) console.log("ERROR " + ascii(r.error).slice(0, 600));
    console.log("TOTAL files " + r.rows.length + ", items " + total.items.join("/") + ", parts " + total.parts.join("/") +
      " (bytes " + total.bytes.join("/") + "), other " + total.other + ", checks " + (r.checks.length - failedChecks.length) +
      "/" + r.checks.length + ", engine rows " + (engine.length - failedEngine.length) + "/" + engine.length);
    ok = Boolean(r.ok) && errors.length === 0 && !r.error;
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(ok ? 0 : 1);
