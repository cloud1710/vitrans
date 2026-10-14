// Page-level Chrome runner (cloud engine, spec Amendment F): the deploy folder of tools/build_site.py (its web/; or
// any static site dir) served under its own _headers in the installed Chrome (playwright-core, channel "chrome"), the
// cloud API /api/v1/* answered by a MOCK in the browser's network layer (context.route, scripted answers), Cloudflare
// Turnstile's real script with the always-pass test site key, and the real page pipeline (engine/pipeline.js).
// 127.0.0.1:47831-47835 (the helper's ports) are recorded and, in the cloud scenarios, never answered: a request there
// hangs as it does while Chrome's Local Network Access prompt waits, so a page that looked for the helper in the cloud
// mode would never enable "Dịch" (the preview bug of 2026-10-14). The cloud mode must send none. The cloud view's
// visible text must not show the local mode's words or the server's names (his copy of 20:48).
// Scenarios (--only to pick some):
//   text    "Văn bản", the default view: the one consent at load, no helper card, no 127.0.0.1 request, "Sẵn sàng";
//           "Dịch" on as soon as text is there while /status is still slow; 65 pasted paragraphs (and a blank line):
//           Turnstile -> session, classify once with the paragraphs, 4 batches (20, 20, 20, 5) of {tagged =
//           paragraph, essential [], prev / nxt, "Đoạn n"} with the setup, 3 of them in flight at once (every answer
//           300 ms late); the Vietnamese shown paragraph by paragraph in order, the pack line, the copy button (the
//           clipboard holds the same line layout); the 20,000-character counter blocks a longer text
//   text-quota  the text mode with translate answering 429 quota_exceeded: the Vietnamese error, nothing shown, no
//           batch after the first three
//   ok      "Tệp": tests/fixtures doc.docx, deck.pptx and codec_cases.docx (23 segments: two batches, sent together)
//           translated end to end: Turnstile -> session, classify once per file, translate in batches of <= 20 with
//           one job id per file; every result downloaded as <stem>_vi.<ext> into --out
//   cancel  65 paragraphs, every answer 5 s late: "Dừng dịch" while 3 batches are in flight aborts all three, no
//           other batch is sent, no error card, nothing shown
//   retry   the first two translate calls answer 502 model_error: the batch is sent again with backoff, the job ends
//   quota   translate answers 429 quota_exceeded: the error card says so in Vietnamese, no download
//   budget  translate answers 429 budget_exhausted, the same
//   local   a helper answers (mocked /api/health): nothing goes to 127.0.0.1 until the small "Dịch trên máy" switch is
//           ticked; then the helper is found and the local cards show; remembered after a reload (looked for at load
//           then); the text mode says text goes to the cloud only; unticked: back to the cloud view
//   local-none  no helper: ticked -> the set-up card (install, Ollama, 127.0.0.1) and "Dịch" off for a file;
//           unticked: the cloud view takes the file again
// Every /api/v1 request must be JSON with the contract's fields only: segment text, never file bytes or images. Any
// CSP violation or page error fails the run. ASCII output; JSON summary in <out>/page_run.json.
// Then: powershell -NoProfile -File tools/com_open_check.ps1 -Dir <out>
// Usage: node web/engine/tests/page.mjs --site <dir> --out <dir> [--headed] [--only text,text-quota,ok,...]
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startSiteServer } from "./site_server.mjs";
import { mockApi, HEALTH } from "./mock_api.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, "?");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const site = opt("--site");
const out = opt("--out") ? resolve(opt("--out")) : "";
if (!site || !out) {
  console.log("usage: node web/engine/tests/page.mjs --site <built site dir> --out <dir> [--headed] [--only a,b]");
  process.exit(2);
}
const only = opt("--only", "text,text-quota,ok,cancel,retry,quota,budget,local,local-none").split(",");
mkdirSync(out, { recursive: true });
// what the cloud view must not show: the local mode's words, the server's names, billing units
const NOT_IN_CLOUD_VIEW = ["Ollama", "GB", "127.0.0.1", "Gemma 4 E", "Qwen", "GPU", "CPU", "Gợi ý cho máy này",
  "Cloudflare", "Workers AI", "Thiết bị", "neuron", "A4B"];

// a deploy folder of tools/build_site.py holds the static output in web/
const root = existsSync(join(site, "web", "index.html")) ? join(site, "web") : site;
const server = await startSiteServer(root, {}, Number(opt("--port", "0")));
const browser = await chromium.launch({ channel: "chrome", headless: !args.includes("--headed") });
const summary = { site: resolve(site), origin: server.origin, scenarios: [], ok: false };

// helper: "hang" (127.0.0.1 never answers: the permission prompt waiting), "none" (refused: no helper), "health" (a
// helper answers /api/health). o.statusDelayMs / o.translateDelayMs: those answers that late. o.noGrants: no
// permission grants (CDP Browser.grantPermissions rejects every permission it does not list: with the clipboard
// granted, Local Network Access reads "denied").
async function newPage(scenario, helper, label, o = {}) {
  const context = await browser.newContext(o.noGrants ? { acceptDownloads: true }
    : { acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const api = mockApi(scenario, { statusDelayMs: o.statusDelayMs, translateDelayMs: o.translateDelayMs });
  const row = { scenario: label || scenario, files: [], problems: [], csp: [], pageErrors: [], api: api.st, local: [],
    abortedTranslate: 0 };
  await context.route("**/api/v1/**", api.handler);
  await context.route(/^http:\/\/(127\.0\.0\.1|localhost):4783[1-5]\//, (r) => {
    const url = new URL(r.request().url());
    row.local.push(url.port + url.pathname);
    if (helper === "health" && url.port === "47831" && url.pathname === "/api/health") {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HEALTH),
        headers: { "Access-Control-Allow-Origin": "*" } });
    }
    if (helper !== "hang") return r.abort();
    return undefined;  // "hang": never answered
  });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber });
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => row.pageErrors.push(String(err)));
  page.on("requestfailed", (req) => {  // the page aborted it (cancel, or a 429 of another batch)
    if (/\/api\/v1\/translate$/.test(new URL(req.url()).pathname)) row.abortedTranslate += 1;
  });
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) row.csp.push({ console: msg.text() });
  });
  await page.goto(server.origin + "/");
  // the one first-use consent, at load: three bullets, a checkbox, one button
  row.consentAtLoad = await page.waitForSelector("#consent[open]", { timeout: 5000 }).then(() => true, () => false);
  if (!row.consentAtLoad) row.problems.push("no consent at the first visit");
  else {
    if (await page.isEnabled("#consent-ok")) row.problems.push("the consent button works without the tick");
    await page.check("#agree");
    await page.click("#consent-ok");
  }
  return { context, page, row };
}

const statusText = (page) => page.textContent("#status");

async function waitEngine(page, re) {
  await page.waitForFunction((src) => new RegExp(src).test(document.getElementById("status").textContent), re.source,
    { timeout: 30000 });
}

async function visibleWords(page, row, when) {
  const text = await page.evaluate(() => document.body.innerText);
  const hits = NOT_IN_CLOUD_VIEW.filter((w) => text.includes(w));
  if (hits.length) row.problems.push(when + ": the cloud view shows " + hits.join(", "));
}

// the cloud view: no helper card, no set-up card, the small local switch unticked, nothing of the local mode in sight
async function checkCloudView(page, row, when) {
  for (const id of ["advice", "setup"]) if (await page.isVisible("#" + id)) row.problems.push(when + ": #" + id + " shows");
  if (!(await page.isVisible("#engine-local-wrap"))) row.problems.push(when + ": the local switch is missing");
  if (await page.isChecked("#engine-local")) row.problems.push(when + ": the cloud must be the default");
  await visibleWords(page, row, when);
}

function noLocalRequests(row) {
  if (row.local.length) row.problems.push("the cloud mode sent " + row.local.length + " request(s) to 127.0.0.1: " + row.local[0]);
}

// "Dịch" may need a moment; a button that stays off is a finding, not a crash
async function clickGo(page) {
  const on = await page.waitForFunction(() => !document.getElementById("go").disabled, null, { timeout: 5000 })
    .then(() => true, () => false);
  if (on) await page.click("#go");
  return on;
}

// One pasted text through the cloud engine ("Văn bản"); a consent at "Dịch" is a finding (it comes at load).
async function translateText(page, text) {
  const t0 = Date.now();
  if ((await page.getAttribute("#mode-text", "aria-pressed")) !== "true") await page.click("#mode-text");
  const doneBefore = await page.$$eval("#log li", (lis) => lis.filter((li) => /Xong sau/.test(li.textContent)).length);
  await page.fill("#src-text", text);
  if (!(await clickGo(page))) return { file: "(text)", outcome: "Dich stays off", seconds: 0, items: [], packs: "", log: [] };
  const consent = await page.waitForSelector("#consent[open]", { timeout: 1500 }).then(() => true, () => false);
  const outcome = await Promise.race([
    page.waitForFunction((n) => Array.from(document.querySelectorAll("#log li"))
      .filter((li) => /Xong sau/.test(li.textContent)).length > n, doneBefore, { timeout: 120000 }).then(() => "done"),
    page.waitForSelector("#error:not([hidden])", { timeout: 120000 }).then(() => "error"),
  ]);
  const r = { file: "(text)", outcome, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  if (consent) r.problem = "a second consent at Dich";
  if (outcome === "error") r.error = await page.textContent("#error-text");
  r.items = await page.$$eval("#text-out li", (lis) => lis.map((li) => ({ vi: li.querySelector(".vi").textContent,
    flags: li.querySelector(".flags") ? li.querySelector(".flags").textContent : "" })));
  r.packs = await page.textContent("#text-packs");
  r.summary = r.items.length + " paragraph(s) shown; " + r.packs;
  r.log = await page.$$eval("#log li", (lis) => lis.map((li) => li.textContent));
  return r;
}

// One file through the cloud engine ("Tệp"). -> { outcome, ... }; check(page) runs on the result before it is deleted
async function translate(page, file, check) {
  const t0 = Date.now();
  if ((await page.getAttribute("#mode-file", "aria-pressed")) !== "true") await page.click("#mode-file");
  await page.setInputFiles("#file", file);
  if (!(await clickGo(page))) return { file: basename(file), outcome: "Dich stays off", seconds: 0, log: [] };
  const consent = await page.waitForSelector("#consent[open]", { timeout: 1500 }).then(() => true, () => false);
  const outcome = await Promise.race([
    page.waitForSelector("#result:not([hidden]) #download:not([hidden])", { timeout: 120000 }).then(() => "done"),
    page.waitForSelector("#error:not([hidden])", { timeout: 120000 }).then(() => "error"),
  ]);
  const r = { file: basename(file), outcome, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  if (consent) r.problem = "a second consent at Dich";
  if (outcome === "error") r.error = await page.textContent("#error-text");
  else {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
    r.output = dl.suggestedFilename();
    await dl.saveAs(join(out, r.output));
    const want = basename(file).replace(/(\.[^.]+)$/, "_vi$1");
    if (r.output !== want) r.problem = "download named " + r.output + ", want " + want;
    r.summary = await page.textContent("#summary");
    if (check) await check(page);
    await page.click("#delete");
  }
  r.log = await page.$$eval("#log li", (lis) => lis.map((li) => li.textContent));
  return r;
}

async function finish(context, page, row) {
  row.csp.push(...await page.evaluate(() => window.__csp));
  await context.close();
  if (row.api.violations.length) row.problems.push(...row.api.violations.map((v) => "API contract: " + v));
  if (row.csp.length) row.problems.push(row.csp.length + " CSP violation(s)");
  if (row.pageErrors.length) row.problems.push(row.pageErrors.length + " page error(s)");
  row.ok = row.problems.length === 0;
  summary.scenarios.push(row);
  console.log("[" + row.scenario + "] " + (row.ok ? "OK" : "FAILED"));
  for (const f of row.files) {
    console.log("  " + ascii(f.file) + ": " + f.outcome + " in " + f.seconds + " s" + (f.output ? " -> " + ascii(f.output) : "")
      + (f.error ? " | " + ascii(f.error) : "") + (f.summary ? " | " + ascii(f.summary).slice(0, 160) : ""));
  }
  for (const p of row.problems) console.log("  PROBLEM " + ascii(p).slice(0, 300));
  delete row.api.sessions;
  delete row.api.setups;
}

const fx = (name) => join(HERE, "fixtures", name);
// 65 synthetic paragraphs (4 batches: 20, 20, 20, 5) with a blank line after the third (the copy keeps it)
const PARAS = Array.from({ length: 65 }, (_, k) => "Paragraph " + (k + 1) + ": the tumour shows spindle cells.");
const TEXT = PARAS.slice(0, 3).join("\n") + "\n\n" + PARAS.slice(3).join("\n");
const BATCHES = [20, 20, 20, 5];

// cond() true within ms (checked every 50 ms)
async function waitFor(page, cond, ms) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await page.waitForTimeout(50)) if (cond()) return true;
  return cond();
}

try {
  if (only.includes("text")) {
    // /status answers after 6 s: "Dịch" must not wait for it (nor for the helper: 127.0.0.1 would hang); every
    // translate answer 300 ms late, so that the batches sent together are seen in flight together
    const { context, page, row } = await newPage("ok", "hang", "text", { statusDelayMs: 6000, translateDelayMs: 300 });
    if ((await page.getAttribute("#mode-text", "aria-pressed")) !== "true" || !(await page.isVisible("#src-text"))) {
      row.problems.push("the text mode must come first");
    }
    if ((await statusText(page)) !== "Sẵn sàng") row.problems.push("the pill should say just Sẵn sàng: " + ascii(await statusText(page)));
    await checkCloudView(page, row, "at load");
    if (await page.isVisible("#log-card")) row.problems.push("an empty log card in the default view");
    await page.fill("#src-text", PARAS[0]);
    const on = await page.waitForFunction(() => !document.getElementById("go").disabled, null, { timeout: 1500 })
      .then(() => true, () => false);
    if (!on) row.problems.push("Dich stays off with text ready (waiting for something)");
    else if (row.api.statusAnswered) row.problems.push("the slow /status answered before the check: the test proves nothing");
    await page.fill("#src-text", "x".repeat(20001));
    if (!(await page.isDisabled("#go")) || !/quá giới hạn/.test(await page.textContent("#text-count"))) {
      row.problems.push("a text over 20,000 characters must not be sent");
    }
    const r = await translateText(page, TEXT);
    row.files.push(r);
    if (r.outcome !== "done" || r.problem) row.problems.push("text: " + (r.problem || r.error || r.outcome));
    if (r.items.length !== PARAS.length || r.items.some((it, k) => it.vi !== "VI " + PARAS[k])) {
      row.problems.push("want the " + PARAS.length + " paragraphs in order, got " + r.items.length);
    }
    if (!/Gói thuật ngữ: Giải phẫu bệnh/.test(r.packs)) row.problems.push("no pack line: " + r.packs);
    if (!r.log.some((l) => /Mô hình: Gemma 4 26B$/.test(l))) row.problems.push("no short model line in the log");
    await page.click("#text-copy");
    await page.waitForFunction(() => /Đã sao chép/.test(document.getElementById("text-copied").textContent), null,
      { timeout: 5000 }).catch(() => null);
    // the Windows clipboard stores CR LF line ends: compare the lines
    const copied = (await page.evaluate(() => navigator.clipboard.readText()).catch((e) => "clipboard error " + e))
      .replace(/\r\n/g, "\n");
    const want = TEXT.split("\n").map((l) => (l ? "VI " + l : "")).join("\n");
    if (copied !== want) row.problems.push("the copied text differs from the paragraphs' layout: " + JSON.stringify(String(copied).slice(0, 160)) + " vs " + JSON.stringify(want.slice(0, 160)));
    const calls = row.api.calls;
    const cl = calls.filter((c) => c.path === "classify");
    const tr = calls.filter((c) => c.path === "translate");
    if (cl.length !== 1 || cl[0].body.text !== PARAS.join("\n")) row.problems.push("classify once with the paragraphs");
    if (JSON.stringify(tr.map((c) => c.body.segments.length)) !== JSON.stringify(BATCHES)) {
      row.problems.push("translate batches " + BATCHES.join(", ") + " expected, got " + tr.map((c) => c.body.segments.length).join(", "));
    }
    if (row.api.translateMaxInFlight !== 3) row.problems.push("3 batches in flight at once expected, saw " + row.api.translateMaxInFlight);
    const segs = tr.flatMap((c) => c.body.segments);
    const bad = segs.filter((s, k) => s.tagged !== PARAS[k] || s.where !== "Đoạn " + (k + 1) || JSON.stringify(s.essential) !== "[]"
      || s.prev !== (k ? PARAS[k - 1] : "") || s.nxt !== (k + 1 < PARAS.length ? PARAS[k + 1] : ""));
    if (bad.length) row.problems.push(bad.length + " segment(s) not {tagged: paragraph, essential: [], prev, nxt, Đoạn n}");
    if (new Set(tr.map((c) => c.body.job_id)).size !== 1) row.problems.push("one job id for the text");
    await visibleWords(page, row, "after the text");
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("text-quota")) {
    const { context, page, row } = await newPage("quota", "hang", "text-quota");
    await waitEngine(page, /^Sẵn sàng$/);
    const r = await translateText(page, TEXT);
    row.files.push(r);
    if (r.problem) row.problems.push(r.problem);
    if (r.outcome !== "error" || !/hết lượt dịch hôm nay/.test(r.error || "")) {
      row.problems.push("want the Vietnamese quota error, got " + r.outcome + " " + (r.error || ""));
    }
    if (r.items.length) row.problems.push("nothing should be shown after a refused first batch");
    if (row.api.translateCalls !== 3) row.problems.push("the first 3 batches only, got " + row.api.translateCalls + " calls");
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("ok")) {
    const { context, page, row } = await newPage("ok", "hang", "ok", { translateDelayMs: 300 });
    await waitEngine(page, /^Sẵn sàng$/);
    await checkCloudView(page, row, "ready");
    const files = [fx("doc.docx"), fx("deck.pptx"), fx("codec_cases.docx")];
    for (const f of files) {
      const r = await translate(page, f, (p) => visibleWords(p, row, "result of " + basename(f)));
      row.files.push(r);
      if (r.outcome !== "done" || r.problem) row.problems.push(r.file + ": " + (r.problem || r.error || r.outcome));
    }
    const lg = row.files[0].log || [];
    if (!lg.some((l) => /^\d\d:\d\d:\d\dMô hình: Gemma 4 26B$/.test(l))) row.problems.push("no short model line in the log");
    if (lg.filter((l) => /Mức kiểm tra khuyến nghị/.test(l)).length !== 1) row.problems.push("the review in one log line");
    const calls = row.api.calls;
    const tr = calls.filter((c) => c.path === "translate");
    const jobs = [...new Set(tr.map((c) => c.body.job_id))];
    if (calls.filter((c) => c.path === "session").length !== 1) row.problems.push("one session expected for the page");
    if (calls.filter((c) => c.path === "classify").length !== files.length) row.problems.push("one classify per file expected");
    if (jobs.length !== files.length) row.problems.push("one job id per file expected, got " + jobs.length);
    if (tr.length !== 4) row.problems.push("4 translate batches expected (12, 20, 20 + 3), got " + tr.length);
    // codec_cases' two batches go out together: the page hands the pipeline's batches to cloud.js 3 at a time
    if (row.api.translateMaxInFlight !== 2) row.problems.push("codec_cases' 2 batches in flight together expected, saw "
      + row.api.translateMaxInFlight);
    if (!tr.every((c) => c.body.setup.packs.length === 1 && c.body.setup.packs[0].id === "pathology")) {
      row.problems.push("translate must carry the packs classify chose");
    }
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("cancel")) {
    // every answer 5 s late: "Dừng dịch" while 3 batches are in flight
    const { context, page, row } = await newPage("ok", "hang", "cancel", { translateDelayMs: 5000 });
    await waitEngine(page, /^Sẵn sàng$/);
    await page.fill("#src-text", TEXT);
    if (!(await clickGo(page))) row.problems.push("Dich stays off");
    if (!(await waitFor(page, () => row.api.translateInFlight === 3, 15000))) {
      row.problems.push("3 batches in flight expected before the cancel, saw " + row.api.translateMaxInFlight);
    }
    await page.click("#cancel");
    const stopped = await page.waitForFunction(() => /Đã dừng dịch/.test(document.getElementById("progress-note").textContent),
      null, { timeout: 10000 }).then(() => true, () => false);
    if (!stopped) row.problems.push("no stop note after the cancel");
    if (!(await waitFor(page, () => row.abortedTranslate === 3, 3000))) {
      row.problems.push("the 3 batches in flight should be aborted, " + row.abortedTranslate + " were");
    }
    if (row.api.translateCalls !== 3) row.problems.push("no batch after the cancel, got " + row.api.translateCalls + " calls");
    if (await page.isVisible("#error")) row.problems.push("a cancel is not an error");
    if (await page.locator("#text-out li").count()) row.problems.push("nothing translated should show");
    if (await page.isDisabled("#go")) row.problems.push("Dich should be back after the cancel");
    row.files.push({ file: "(text)", outcome: "cancelled, " + row.abortedTranslate + " batches aborted", seconds: 0 });
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("retry")) {
    const { context, page, row } = await newPage("retry", "hang");
    await waitEngine(page, /^Sẵn sàng$/);
    const r = await translate(page, fx("doc.docx"));
    row.files.push(r);
    if (r.outcome !== "done") row.problems.push("the job should end after two retries: " + (r.error || r.outcome));
    if (row.api.translateCalls !== 3) row.problems.push("3 translate calls expected, got " + row.api.translateCalls);
    if (!r.log.some((l) => /lần 2/.test(l))) row.problems.push("the retries are not in the log");
    noLocalRequests(row);
    await finish(context, page, row);
  }
  for (const [scenario, text] of [["quota", /hết lượt dịch hôm nay/], ["budget", /hết ngân sách hôm nay/]]) {
    if (!only.includes(scenario)) continue;
    const { context, page, row } = await newPage(scenario, "hang");
    await waitEngine(page, /^Sẵn sàng$/);
    const r = await translate(page, fx("doc.docx"));
    row.files.push(r);
    if (r.outcome !== "error" || !text.test(r.error || "")) row.problems.push("want the Vietnamese " + scenario + " error, got "
      + r.outcome + " " + (r.error || ""));
    if (row.api.translateCalls !== 1) row.problems.push("no retry expected on 429, got " + row.api.translateCalls + " calls");
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("local")) {
    const { context, page, row } = await newPage("local", "health");
    await waitEngine(page, /^Sẵn sàng$/);
    await checkCloudView(page, row, "at load");
    if (row.local.length) row.problems.push("127.0.0.1 asked before the switch was ticked: " + row.local[0]);
    await page.check("#engine-local");
    await waitEngine(page, /Ollama chưa chạy/);
    if (!row.local.length) row.problems.push("the local mode did not look for the helper");
    for (const id of ["advice", "setup"]) {
      if (!(await page.isVisible("#" + id))) row.problems.push("#" + id + " should show in the local mode");
    }
    if (await page.isVisible("#setup-missing")) row.problems.push("a helper answered: no install note");
    const pref = await page.evaluate(() => localStorage.getItem("vitranslate-engine-v1"));
    if (pref !== "local") row.problems.push("the choice is not remembered: " + pref);
    // the text mode is cloud only: with "Dịch trên máy" picked it says so and sends nothing
    await page.fill("#src-text", "The tumour shows spindle cells.");
    if (!(await page.isDisabled("#go")) || !/chỉ chạy trên máy chủ/.test(await page.textContent("#text-note"))
      || !(await page.isVisible("#text-note"))) {
      row.problems.push("the text mode must say that text goes to the cloud only and not send it");
    }
    const before = row.local.length;
    await page.reload();
    await waitEngine(page, /Ollama chưa chạy/);
    if (!(await page.isChecked("#engine-local"))) row.problems.push("the remembered choice is not applied after a reload");
    if (row.local.length === before) row.problems.push("the remembered local mode should look for the helper at load");
    if (await page.isVisible("#consent")) row.problems.push("the consent came back after a reload");
    await page.uncheck("#engine-local");
    await waitEngine(page, /^Sẵn sàng$/);
    await checkCloudView(page, row, "unticked");
    if (row.api.calls.some((c) => c.method === "POST")) row.problems.push("something was sent to the cloud API");
    row.files.push({ file: "-", outcome: ascii(await statusText(page)), seconds: 0 });
    await finish(context, page, row);
  }
  if (only.includes("local-none")) {
    const { context, page, row } = await newPage("ok", "none", "local-none", { noGrants: true });
    await waitEngine(page, /^Sẵn sàng$/);
    await page.check("#engine-local");
    await waitEngine(page, /Chưa thấy bộ dịch trên máy/);
    if (!(await page.isVisible("#setup-missing"))) row.problems.push("the install note should show when no helper answers");
    else if (!/Ollama/.test(await page.textContent("#setup"))) row.problems.push("the set-up card should say what it needs");
    if (await page.isVisible("#advice")) row.problems.push("no helper: no recommendation card");
    if (await page.isVisible("#lna-denied")) row.problems.push("the permission is not denied: no unblock steps");
    // the permission refused (a grant of anything else rejects it): "Thử kết nối lại" says how to unblock
    await context.grantPermissions(["clipboard-read"]);
    await page.click("#retry");
    await waitEngine(page, /đang chặn kết nối tới bộ dịch trên máy/);
    if (!(await page.isVisible("#lna-denied"))) row.problems.push("denied: the unblock steps should show");
    await page.click("#mode-file");
    await page.setInputFiles("#file", fx("doc.docx"));
    if (!(await page.isDisabled("#go"))) row.problems.push("no helper: Dich must stay off in the local mode");
    await page.uncheck("#engine-local");
    await waitEngine(page, /^Sẵn sàng$/);
    await checkCloudView(page, row, "unticked");
    if (await page.isDisabled("#go")) row.problems.push("back in the cloud view, Dich should take the file");
    row.files.push({ file: "-", outcome: ascii(await statusText(page)), seconds: 0 });
    await finish(context, page, row);
  }
} catch (err) {
  summary.error = String((err && err.stack) || err);
  console.log("ERROR " + ascii(summary.error).slice(0, 800));
} finally {
  await browser.close();
  await server.close();
}
summary.ok = !summary.error && summary.scenarios.length === only.length && summary.scenarios.every((s) => s.ok);
writeFileSync(join(out, "page_run.json"), JSON.stringify(summary, null, 1), "utf8");
console.log("RESULT " + (summary.ok ? "OK" : "FAILED") + ": " + summary.scenarios.length + " scenario(s) -> "
  + ascii(join(out, "page_run.json")));
process.exit(summary.ok ? 0 : 1);
