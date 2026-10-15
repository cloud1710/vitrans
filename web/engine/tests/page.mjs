// Page-level Chrome runner (cloud engine, spec Amendment F): the deploy folder of tools/build_site.py (its web/; or
// any static site dir) served under its own _headers in the installed Chrome (playwright-core, channel "chrome"), the
// cloud API /api/v1/* answered by a MOCK in the browser's network layer (context.route, scripted answers), Cloudflare
// Turnstile's real script with the always-pass test site key, and the real page pipeline (engine/pipeline.js).
// 127.0.0.1:47831-47835 (the helper's ports) are recorded and, in the cloud scenarios, never answered: a request there
// hangs as it does while Chrome's Local Network Access prompt waits, so a page that looked for the helper in the cloud
// mode would never enable "Dịch" (the preview bug of 2026-10-14). The cloud mode must send none. The cloud view's
// visible text must not show the local mode's words or the server's names (his copy of 20:48).
// Scenarios (--only to pick some):
//   shell   the app shell (his 2026-10-15 tabs): "Văn bản" open at load, the image / live / subtitle / PDF modules not
//           loaded before their tab opens, clicks and the arrow keys (Home / End) switch tabs and the hash follows (Back
//           returns), the live tool's own consent with its tab, deep links (#phu-de, #tai-lieu) and the old /anh/ and
//           /live/?query addresses open their tab, the bottom tab bar and no horizontal scroll at 360 px on any tab
//   screens light and dark, 1280 x 900 and 390 x 844: a screenshot of every tab into <out>/screens (for a person)
//   sub     "Phụ đề": a synthetic SRT (BOM, CRLF, overlap, tags, two lines, {\an8}; 26 cues) through the cloud:
//           classify once (profile file), batches of 20 + 6 with the cue texts as tokens and the neighbouring cues as
//           context, the cues shown, bilingual SRT and Vietnamese-only VTT downloads, the term review (the corrected
//           file next to the job's own one), pasted VTT read
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
//   cancel  65 paragraphs, every answer 5 s late: the other modes' tabs locked meanwhile (not Ảnh / Dịch đuổi);
//           "Dừng dịch" while 3 batches are in flight aborts all three, no
//           other batch is sent, no error card, nothing shown
//   retry   the first two translate calls answer 502 model_error: the batch is sent again with backoff, the job ends
//   quota   translate answers 429 quota_exceeded: the error card says so in Vietnamese, no download
//   budget  translate answers 429 budget_exhausted, the same
//   local   a helper answers (mocked /api/health, no model yet): nothing goes to 127.0.0.1 until the menu's "Trên máy"
//           is chosen; then the helper is found and the local cards show on Tài liệu; remembered after a reload
//           (looked for at load then); "Dịch" waits for the helper's model; Máy chủ again: back to the cloud view
//   local-none  no helper: Trên máy -> the set-up card on Tài liệu, the "Mở ViTranslate" bar on the other tabs (the
//           button looks again every 2 s), "Dịch" off; Máy chủ again: the cloud view takes the file again
//   local-tools  (his 2026-10-15 design) a fake helper (fake_helper.mjs) and Trên máy remembered from the old switch's
//           key: text, subtitles, a PDF and a photo translated through 127.0.0.1 only -- not one request to /api/v1 of
//           the site, no consent, no browser check; each tool's calls on the helper (classify profiles "", file,
//           photo); the live tab shows the helper's speed; the Nhật ký lines name each tool and engine, no text
//   menu    the ⋮ menu: click / Enter open it (focus on the checked engine), Esc and a click outside close it (focus
//           back to the button; a click into a field keeps the field's focus), Tab out closes it; its sections in his
//           order; the moved controls gone from Tài liệu and the live stage; Song ngữ and the size reach the live
//           stage; Tối / Sáng / Theo máy on the root and after a reload; the old switch's "local" read as Trên máy;
//           Nhật ký after a text job (lines without text, Sao chép, Xóa, focus back); the bottom sheet at 390 px;
//           screenshots of the open menu (desktop light, phone dark) into --shots (default <out>/menu_shots)
//   terms   "Xem lại thuật ngữ" after a text job (spec Amendment G): the panel closed under the result, /terms only
//           when it is opened (a 401 renews the session once) with the job id and the paragraphs' plain text; "Từ
//           mới" and "Đã tự sửa" (the results' fixes); a change -> Áp dụng: the text changes only where the source has
//           the English term or /terms found it (the singular "spindle cell" reaches "spindle cells" through the
//           answer's ids), the question with the rows, "Gửi" -> /feedback term pairs, "Không" -> nothing; the
//           copy holds the corrected text, the original stays; the explicit button: pending changes, else new terms
//   terms-file  doc.docx and deck.pptx: the corrected file <stem>_vi.<ext> next to the original download, rewritten
//           where the source has the term (deck: also the plural "tumours" segment the core fixed), the original kept;
//           files in <out>/terms-file/{original,corrected} for the Office check; Xóa removes the panel
//   terms-error /terms answers 502 model_error three times, then 429: short Vietnamese lines in the panel, the
//           translation stays, no error card; the fixed list still works; /feedback 429 said in the panel
//   pdf     "Tệp" with PDFs (spec Amendment H; web/pdf/tests/fixtures): article.pdf (two columns, heading, figure,
//           caption, table, footnote, running header, References), slide.pdf (landscape) and scan.pdf (an image-only
//           page: the real on-device OCR of web/ocr) -> <stem>_vi.pdf and <stem>_vi.docx downloaded into <out>/pdf;
//           the PDFs re-read by pdf.js (same pages, the picture kept, Vietnamese in, the English of the translated
//           blocks out, the header and the References kept), the DOCX by the M1 reader; the term review on the
//           article: a fixed term changed -> the corrected PDF and DOCX; every output page rendered to
//           <out>/pdf/png/*.png for a look
// Every /api/v1 request must be JSON with the contract's fields only: segment text, never file bytes or images. Any
// CSP violation or page error fails the run. ASCII output; JSON summary in <out>/page_run.json; screenshots of the
// term panel in <out>/terms_*.png.
// Then: powershell -NoProfile -File tools/com_open_check.ps1 -Dir <out> (and -Dir <out>/terms-file/corrected,
// -Dir <out>/terms-file/original)
// Usage: node web/engine/tests/page.mjs --site <dir> --out <dir> [--headed] [--only text,text-quota,ok,...]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startSiteServer } from "./site_server.mjs";
import { mockApi, HEALTH, TERMS_VI } from "./mock_api.mjs";
import { fakeHelper } from "./fake_helper.mjs";
import { readZip, inflateEntry } from "../ooxml/zip.js";
import "./dom-node.mjs";  // the M1 reader in Node, for the PDF scenario's DOCX
import { OoxmlPackage } from "../ooxml/package.js";
import { nodeLibs, pdfjsText } from "../../pdf/tests/node_libs.mjs";
import { openPdfLib, analyzePage } from "../../pdf/pdfdoc.js";

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
const only = opt("--only",
  "shell,text,text-quota,ok,cancel,retry,quota,budget,local,local-none,local-tools,menu,terms,terms-file,terms-error,pdf,"
  + "sub,screens").split(",");
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
// helper answers /api/health), "fake" (fake_helper.mjs: a ready helper with the sentence routes). o.statusDelayMs /
// o.translateDelayMs: those answers that late. o.noGrants: no permission grants (CDP Browser.grantPermissions rejects
// every permission it does not list: with the clipboard granted, Local Network Access reads "denied"). o.local: the
// old "Dịch trên máy" switch's value "local" stored before the first load (no consent expected then).
async function newPage(scenario, helper, label, o = {}) {
  const context = await browser.newContext(Object.assign(o.noGrants ? { acceptDownloads: true }
    : { acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] }, o.ctx || {}));
  const api = mockApi(scenario, { statusDelayMs: o.statusDelayMs, translateDelayMs: o.translateDelayMs });
  const row = { scenario: label || scenario, files: [], problems: [], csp: [], pageErrors: [], api: api.st, local: [],
    abortedTranslate: 0, paths: [] };
  const fake = helper === "fake" ? fakeHelper() : null;
  if (fake) row.helperApi = fake.st;
  await context.route("**/api/v1/**", api.handler);
  await context.route(/^http:\/\/(127\.0\.0\.1|localhost):4783[1-5]\//, (r) => {
    const url = new URL(r.request().url());
    row.local.push(url.port + url.pathname);
    if (fake) return fake.handler(r);
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
  if (o.local) {
    await context.addInitScript(() => {
      if (sessionStorage.getItem("__seeded")) return;
      localStorage.setItem("vitranslate-engine-v1", "local");
      sessionStorage.setItem("__seeded", "1");
    });
  }
  const page = await context.newPage();
  page.on("pageerror", (err) => row.pageErrors.push(String(err)));
  page.on("request", (req) => { if (req.url().startsWith(server.origin)) row.paths.push(new URL(req.url()).pathname); });
  page.on("requestfailed", (req) => {  // the page aborted it (cancel, or a 429 of another batch)
    if (/\/api\/v1\/translate$/.test(new URL(req.url()).pathname)) row.abortedTranslate += 1;
  });
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) row.csp.push({ console: msg.text() });
  });
  await page.goto(server.origin + "/");
  if (o.local) {  // Trên máy sends nothing to the server: no consent at load
    if (await page.waitForSelector("#consent[open]", { timeout: 1500 }).then(() => true, () => false)) {
      row.problems.push("Tren may: the cloud consent opened at load");
    }
    return { context, page, row };
  }
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
  const choice = await page.evaluate(() => (document.querySelector('#menu input[name="engine"]:checked') || {}).value);
  if (choice !== "cloud") row.problems.push(when + ": the menu should say Máy chủ, says " + choice);
  if (await page.isVisible("#menu")) row.problems.push(when + ": the menu is open");
  await visibleWords(page, row, when);
}

function noLocalRequests(row) {
  if (row.local.length) row.problems.push("the cloud mode sent " + row.local.length + " request(s) to 127.0.0.1: " + row.local[0]);
}

// the ⋮ menu's "Dịch bằng" (web/settings.js): open, pick, close
async function pickEngine(page, value) {
  await page.click("#menu-btn");
  await page.check('#menu input[name="engine"][value="' + value + '"]');
  await page.keyboard.press("Escape");
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
  if ((await page.getAttribute("#tab-text", "aria-selected")) !== "true") await page.click("#tab-text");
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
  if ((await page.getAttribute("#tab-file", "aria-selected")) !== "true") await page.click("#tab-file");
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
  if (row.helperApi && row.helperApi.violations.length) {
    row.problems.push(...row.helperApi.violations.map((v) => "helper contract: " + v));
  }
  if (row.helperApi) row.helperApi = { calls: row.helperApi.calls.map(({ texts, ...c }) => c) };
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
  delete row.paths;
}

const fx = (name) => join(HERE, "fixtures", name);
// 65 synthetic paragraphs (4 batches: 20, 20, 20, 5) with a blank line after the third (the copy keeps it)
const PARAS = Array.from({ length: 65 }, (_, k) => "Paragraph " + (k + 1) + ": the tumour shows spindle cells.");
const TEXT = PARAS.slice(0, 3).join("\n") + "\n\n" + PARAS.slice(3).join("\n");
const BATCHES = [20, 20, 20, 5];

// "Phụ đề": 26 synthetic cues (BOM, CRLF; an overlap, an italic cue, a two-line cue, a position override, then
// fillers: batches of 20 and 6); tagged: what the core gets; plain: the context text
const SUB_CUES = [
  { s: 1000, e: 3000, lines: ["The tumour shows spindle cells."], tagged: "The tumour shows spindle cells." },
  { s: 2500, e: 5000, lines: ["<i>Spindle cells are arranged in fascicles.</i>"],
    tagged: "<g1>Spindle cells are arranged in fascicles.</g1>", plain: "Spindle cells are arranged in fascicles." },
  { s: 5000, e: 7000, lines: ["Fusiform cells are", "also present."], tagged: "Fusiform cells are also present." },
  { s: 7000, e: 9000, lines: ["{\\an8}No necrosis is seen."], tagged: "<x1/>No necrosis is seen.", plain: "No necrosis is seen." },
].concat(Array.from({ length: 22 }, (_, k) => ({ s: 10000 + 2000 * k, e: 11500 + 2000 * k,
  lines: ["Line " + (k + 5) + " of the synthetic lecture."], tagged: "Line " + (k + 5) + " of the synthetic lecture." })))
  .map((c) => Object.assign({ plain: c.tagged }, c));
const srtTime = (ms) => new Date(ms).toISOString().slice(11, 23).replace(".", ",");
const SUB_SRT = "\uFEFF" + SUB_CUES.map((c, k) => [String(k + 1), srtTime(c.s) + " --> " + srtTime(c.e)].concat(c.lines)
  .join("\r\n")).join("\r\n\r\n") + "\r\n";

// cond() true within ms (checked every 50 ms)
async function waitFor(page, cond, ms) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await page.waitForTimeout(50)) if (cond()) return true;
  return cond();
}

// ---- "Xem lại thuật ngữ" (spec Amendment G) ----

const TERM_PARAS = ["The tumour shows spindle cells.", "Spindle cells are arranged in fascicles.",
  "Fusiform cells are also present.", "No necrosis is seen."];
const QUESTION = "Gửi các thuật ngữ này cho tác giả để cập nhật dữ liệu? Chỉ gửi cặp thuật ngữ, không gửi câu nào "
  + "của tài liệu.";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const textOut = (page) => page.$$eval("#text-out li .vi", (ps) => ps.map((p) => p.textContent));

// the panel opened (it asks /terms then): until the new-term list or its line (none / error) shows
async function openTerms(page) {
  await page.click("#terms-box > summary");
  return page.waitForFunction(() => {
    const note = document.getElementById("terms-new-note");
    return !document.getElementById("terms-new").hidden || (!note.hidden && !/Đang tìm/.test(note.textContent));
  }, null, { timeout: 30000 }).then(() => true, () => false);
}

const termRows = (page) => page.$$eval("#terms-new tbody tr", (trs) => trs.map((tr) => [tr.cells[0].textContent,
  tr.querySelector("input").value, tr.cells[2].textContent]));
const fixedRows = (page) => page.$$eval("#terms-fixed tbody tr", (trs) => trs.map((tr) => [tr.cells[0].textContent,
  tr.cells[1].textContent, tr.querySelector("input").value, tr.cells[3].textContent]));

// types value into the Vietnamese of the row whose English is en
async function setTerm(page, table, en, value) {
  const rows = page.locator("#" + table + " tbody tr");
  for (let k = 0, n = await rows.count(); k < n; k++) {
    if ((await rows.nth(k).locator("td").first().textContent()) === en) {
      await rows.nth(k).locator("input").fill(value);
      return true;
    }
  }
  return false;
}

// the feedback question: its text and rows, then "Gửi" (send) or "Không"
async function answerFeedback(page, send) {
  const open = await page.waitForSelector("#feedback[open]", { timeout: 10000 }).then(() => true, () => false);
  if (!open) return null;
  const text = await page.textContent("#feedback p");
  const rows = await page.$$eval("#feedback-rows li", (lis) => lis.map((li) => li.textContent));
  await page.click(send ? "#feedback-send" : "#feedback-no");
  await page.waitForSelector("#feedback:not([open])", { timeout: 5000 }).catch(() => null);
  return { text, rows };
}

async function clipboard(page) {
  return (await page.evaluate(() => navigator.clipboard.readText()).catch((e) => "clipboard error " + e))
    .replace(/\r\n/g, "\n");
}

// ---- PDF (spec Amendment H) ----

const pdfFx = (name) => join(HERE, "..", "..", "pdf", "tests", "fixtures", name);

// every page of a PDF rendered by the site's own pdf.js in the page -> PNG data URLs
async function renderPdf(page, bytes) {
  return page.evaluate(async (b64) => {
    const pdfjs = await import("/pdf/vendor/pdfjs-6.3.289/pdf.min.js");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/vendor/pdfjs-6.3.289/pdf.worker.min.js";
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data, useWasm: false }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale: 1.5 });
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      out.push(c.toDataURL("image/png"));
    }
    await doc.loadingTask.destroy();
    return out;
  }, Buffer.from(bytes).toString("base64"));
}

function zipText(file, part) {
  if (!existsSync(file)) return "";
  const e = readZip(new Uint8Array(readFileSync(file))).entries.find((x) => x.name === part);
  return e ? new TextDecoder().decode(inflateEntry(e)) : "";
}

try {
  if (only.includes("text")) {
    // /status answers after 6 s: "Dịch" must not wait for it (nor for the helper: 127.0.0.1 would hang); every
    // translate answer 300 ms late, so that the batches sent together are seen in flight together
    const { context, page, row } = await newPage("ok", "hang", "text", { statusDelayMs: 6000, translateDelayMs: 300 });
    if ((await page.getAttribute("#tab-text", "aria-selected")) !== "true" || !(await page.isVisible("#src-text"))) {
      row.problems.push("the text tab must come first and be open");
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
    const locks = await page.evaluate(() => ["text", "file", "anh", "sub", "live"].map((t) =>
      document.getElementById("tab-" + t).getAttribute("aria-disabled") === "true"));
    if (JSON.stringify(locks) !== "[false,true,false,true,false]") row.problems.push("tab locks while running: " + locks);
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
    if (row.local.length) row.problems.push("127.0.0.1 asked before Tren may was chosen: " + row.local[0]);
    await pickEngine(page, "local");
    await waitEngine(page, /Ollama chưa chạy/);
    if (!row.local.length) row.problems.push("the local mode did not look for the helper");
    for (const id of ["advice", "setup"]) {
      if (await page.isVisible("#" + id)) row.problems.push("#" + id + ": the helper's cards belong to the Tai lieu tab");
    }
    await page.click("#tab-file");
    for (const id of ["advice", "setup"]) {
      if (!(await page.isVisible("#" + id))) row.problems.push("#" + id + " should show in the local mode");
    }
    if (await page.isVisible("#setup-missing")) row.problems.push("a helper answered: no install note");
    if (await page.isVisible("#terms")) row.problems.push("no term review in the local mode");
    const pref = await page.evaluate(() => localStorage.getItem("vitranslate-engine-v1"));
    if (pref !== "local") row.problems.push("the choice is not remembered: " + pref);
    // Trên máy takes text and subtitles too (the helper's sentence routes): no "server only" note; "Dịch" waits for
    // the helper's model, which this helper does not have yet
    await page.click("#tab-text");
    await page.fill("#src-text", "The tumour shows spindle cells.");
    if (!(await page.isDisabled("#go"))) row.problems.push("no model on the helper yet: Dich must wait");
    if (await page.isVisible("#text-note")) row.problems.push("no 'server only' note on Tren may any more");
    if (await page.isVisible("#helper-bar")) row.problems.push("a helper answered: no Mo ViTranslate bar");
    const before = row.local.length;
    await page.reload();
    await waitEngine(page, /Ollama chưa chạy/);
    const kept = await page.evaluate(() => (document.querySelector('#menu input[name="engine"]:checked') || {}).value);
    if (kept !== "local") row.problems.push("the remembered choice is not applied after a reload: " + kept);
    if (row.local.length === before) row.problems.push("the remembered local mode should look for the helper at load");
    if (await page.isVisible("#consent")) row.problems.push("the consent came back after a reload");
    await pickEngine(page, "cloud");
    await waitEngine(page, /^Sẵn sàng$/);
    await checkCloudView(page, row, "back on May chu");
    if (row.api.calls.some((c) => c.method === "POST")) row.problems.push("something was sent to the cloud API");
    row.files.push({ file: "-", outcome: ascii(await statusText(page)), seconds: 0 });
    await finish(context, page, row);
  }
  if (only.includes("local-none")) {
    const { context, page, row } = await newPage("ok", "none", "local-none", { noGrants: true });
    await waitEngine(page, /^Sẵn sàng$/);
    await pickEngine(page, "local");
    await waitEngine(page, /Chưa thấy bộ dịch trên máy/);
    // the other tabs: one short bar with "Mở ViTranslate"; the Tài liệu tab: its set-up card
    for (const t of ["text", "anh", "sub"]) {
      await page.click("#tab-" + t);
      if (!(await page.isVisible("#helper-bar"))) row.problems.push(t + ": no Mo ViTranslate bar without a helper");
    }
    await page.click("#tab-file");
    if (await page.isVisible("#helper-bar")) row.problems.push("Tai lieu: the set-up card says it, no bar");
    if (!(await page.isVisible("#setup-missing"))) row.problems.push("the install note should show when no helper answers");
    else if (!/Ollama/.test(await page.textContent("#setup"))) row.problems.push("the set-up card should say what it needs");
    if (await page.isVisible("#advice")) row.problems.push("no helper: no recommendation card");
    if (await page.isVisible("#lna-denied")) row.problems.push("the permission is not denied: no unblock steps");
    // the permission refused (a grant of anything else rejects it): "Thử kết nối lại" says how to unblock
    await context.grantPermissions(["clipboard-read"]);
    await page.click("#retry");
    await waitEngine(page, /đang chặn kết nối tới bộ dịch trên máy/);
    if (!(await page.isVisible("#lna-denied"))) row.problems.push("denied: the unblock steps should show");
    await page.setInputFiles("#file", fx("doc.docx"));
    if (!(await page.isDisabled("#go"))) row.problems.push("no helper: Dich must stay off in the local mode");
    // "Mở ViTranslate" (vitranslate://start), then the page looks for the helper again every 2 s
    await page.click("#tab-text");
    const looked = row.local.length;
    await page.click("#helper-open");
    await page.waitForTimeout(4500);
    if (row.local.length < looked + 2 * 5) row.problems.push("Mo ViTranslate: not looked for again (" + (row.local.length - looked) + " probes)");
    if (!/\/$/.test(new URL(page.url()).pathname)) row.problems.push("the page navigated away: " + page.url());
    await pickEngine(page, "cloud");
    await waitEngine(page, /^Sẵn sàng$/);
    await checkCloudView(page, row, "back on May chu");
    if (await page.isVisible("#helper-bar")) row.problems.push("May chu: no Mo ViTranslate bar");
    await page.click("#tab-file");
    if (await page.isDisabled("#go")) row.problems.push("back in the cloud view, Dich should take the file");
    row.files.push({ file: "-", outcome: ascii(await statusText(page)), seconds: 0 });
    await finish(context, page, row);
  }
  if (only.includes("local-tools")) {
    // Trên máy for every tool against a fake helper: nothing may reach the site's /api/v1
    const { context, page, row } = await newPage("ok", "fake", "local-tools", { local: true });
    await waitEngine(page, /^Sẵn sàng$/);
    const kept = await page.evaluate(() => (document.querySelector('#menu input[name="engine"]:checked') || {}).value);
    if (kept !== "local") row.problems.push("the old switch's 'local' should read as Tren may, menu says " + kept);
    const LOCAL_TEXT = "Paragraph one: the tumour shows spindle cells.\nParagraph two: the margin is clear.";
    const doneLines = () => page.$$eval("#log li", (lis) => lis.filter((li) => /Xong sau/.test(li.textContent)).length);
    // Văn bản
    const t = await translateText(page, LOCAL_TEXT);
    row.files.push(Object.assign(t, { file: "(text)" }));
    if (t.outcome !== "done" || t.items.length !== 2 || !t.items.every((i) => /^VI /.test(i.vi))) {
      row.problems.push("text on Tren may: " + t.outcome + " " + JSON.stringify(t.items).slice(0, 200));
    }
    // Phụ đề
    await page.click("#tab-sub");
    await page.fill("#sub-src", SUB_SRT.slice(SUB_SRT.charCodeAt(0) === 0xfeff ? 1 : 0));
    const subBefore = await doneLines();
    if (!(await clickGo(page))) row.problems.push("subtitles on Tren may: Dich stays off");
    const subOutcome = await Promise.race([
      page.waitForFunction((n) => [...document.querySelectorAll("#log li")].filter((li) => /Xong sau/.test(li.textContent))
        .length > n, subBefore, { timeout: 60000 }).then(() => "done"),
      page.waitForSelector("#error:not([hidden])", { timeout: 60000 }).then(() => "error"),
    ]);
    const cues = await page.$$eval("#sub-out li .vi", (ps) => ps.map((p) => p.textContent));
    row.files.push({ file: "(subtitles)", outcome: subOutcome, seconds: 0, summary: cues.length + " cue(s)" });
    if (subOutcome !== "done" || cues.length !== SUB_CUES.length) row.problems.push("subtitles on Tren may: " + subOutcome + ", " + cues.length + " cues");
    // Tài liệu: a PDF through the page pipeline and the helper's routes
    const r = await translate(page, pdfFx("slide.pdf"));
    row.files.push(r);
    if (r.outcome !== "done") row.problems.push("PDF on Tren may: " + r.outcome + " " + (r.error || ""));
    // Ảnh: the photo read on the device, its lines translated by the helper
    await page.click("#tab-anh");
    // the tool's module loads with its tab: pick the photo once it listens
    if (!(await waitFor(page, () => row.paths.includes("/anh/anh.js"), 10000))) row.problems.push("anh.js not loaded");
    await page.waitForTimeout(800);
    await page.setInputFiles("#anh-files", pdfFx("scan.png"));
    const card = await page.waitForSelector("#anh-results section[data-state]", { timeout: 180000 }).catch(() => null);
    const state = card ? await card.getAttribute("data-state") : "none";
    const code = card ? await card.getAttribute("data-code") : null;
    row.files.push({ file: "scan.png", outcome: state + (code ? " " + code : ""), seconds: 0 });
    if (state !== "done") row.problems.push("photo on Tren may: " + state + " " + (code || ""));
    // Dịch đuổi: the helper's speed before Bắt đầu (the fake's measured GPU)
    await page.click("#tab-live");
    if (await page.waitForSelector("#live-consent[open]", { timeout: 3000 }).then(() => true, () => false)) {
      await page.check("#live-agree");
      await page.click("#live-consent-ok");
      await page.evaluate(() => { const b = document.getElementById("live-stop"); if (!b.hidden) b.click(); });
    }
    const speed = await page.waitForFunction(() => {
      const el = document.getElementById("live-speed");
      return el && !el.hidden && /Trên máy \(GPU\)/.test(el.textContent) ? el.textContent : "";
    }, null, { timeout: 10000 }).then((h) => h.jsonValue(), () => "");
    row.speedLine = ascii(speed);
    if (!speed) row.problems.push("the live tab should show the helper's speed on Tren may");
    // not one request to the site's API; the helper got every tool's calls, without a session
    const cloudPaths = row.paths.filter((x) => x.startsWith("/api/v1/"));
    if (cloudPaths.length) row.problems.push("Tren may sent " + cloudPaths.length + " request(s) to the cloud: " + cloudPaths[0]);
    if (row.api.calls.length) row.problems.push("the cloud API mock was called " + row.api.calls.length + " time(s)");
    const calls = row.helperApi.calls;
    const profiles = [...new Set(calls.filter((c) => c.path === "classify").map((c) => c.profile))].sort();
    if (JSON.stringify(profiles) !== JSON.stringify(["", "file", "photo"])) {
      row.problems.push("classify profiles on the helper: " + JSON.stringify(profiles));
    }
    if (calls.filter((c) => c.path === "translate").length < 5) row.problems.push("too few translate calls on the helper");
    if (calls.some((c) => c.keys.includes("session"))) row.problems.push("a session token went to the helper");
    // Nhật ký: each tool's lines, engine trên máy, no text
    const log = await page.evaluate(() => localStorage.getItem("vitranslate-log-v1") || "");
    for (const want of ["Văn bản · trên máy · translate", "Phụ đề · trên máy · translate", "Tài liệu · trên máy · translate",
      "Ảnh · trên máy · translate", "ViTranslate · state · found:47831"]) {
      if (!log.includes(want)) row.problems.push("log: no line '" + ascii(want) + "'");
    }
    for (const word of ["tumour", "spindle", "margin", "Paragraph", "slide"]) {
      if (log.toLowerCase().includes(word.toLowerCase())) row.problems.push("log holds text: " + word);
    }
    row.logLines = JSON.parse(log || "[]").length;
    await finish(context, page, row);
  }
  if (only.includes("terms")) {
    const { context, page, row } = await newPage("terms", "hang", "terms");
    await waitEngine(page, /^Sẵn sàng$/);
    const r = await translateText(page, TERM_PARAS.join("\n"));
    row.files.push(r);
    if (r.outcome !== "done" || r.problem) row.problems.push("text: " + (r.problem || r.error || r.outcome));
    if (!(await page.isVisible("#terms"))) row.problems.push("no term review after the text job");
    if (await page.evaluate(() => document.getElementById("terms-box").open)) row.problems.push("the review must start closed");
    if (!(await page.evaluate(() => (document.getElementById("text-result").nextElementSibling || {}).id === "terms"))) {
      row.problems.push("the review should sit under the text result");
    }
    if (row.api.termsCalls) row.problems.push("/terms asked before the panel was opened");
    if (!(await openTerms(page))) row.problems.push("the new-term list never showed");
    // the first /terms answer is 401: one renewed session (Turnstile again), the request once more
    const tr = row.api.calls.filter((c) => c.path === "terms");
    if (tr.length !== 2 || row.api.calls.filter((c) => c.path === "session").length !== 2) {
      row.problems.push("/terms: a 401, a renewed session and the request again expected; " + tr.length + " request(s)");
    }
    const jobId = row.api.calls.find((c) => c.path === "translate").body.job_id;
    const items = TERM_PARAS.map((p, k) => ({ id: k, src: p, vi: TERMS_VI[p] }));
    if (!tr.length || !same(tr.at(-1).body.items, items) || tr.at(-1).body.job_id !== jobId) {
      row.problems.push("/terms must carry the job id and the paragraphs' plain English and Vietnamese");
    }
    const news = await termRows(page);
    if (!same(news, [["spindle cell", "tế bào hình thoi", "2"], ["fascicles", "bó", "1"]])) {
      row.problems.push("new terms shown: " + JSON.stringify(news));
    }
    const fixed = await fixedRows(page);
    if (!same(fixed, [["tumour", "bướu", "khối u", "1"]])) row.problems.push("fixed terms shown: " + JSON.stringify(fixed));
    if (!(await page.isDisabled("#terms-apply"))) row.problems.push("Ap dung should be off before a change");
    await setTerm(page, "terms-new", "spindle cell", "tế bào hình suốt");
    if (await page.isDisabled("#terms-apply")) row.problems.push("Ap dung should be on after a change");
    await page.click("#terms-apply");
    const q1 = await answerFeedback(page, true);
    if (!q1 || q1.text !== QUESTION || !same(q1.rows, ["spindle cell: tế bào hình thoi → tế bào hình suốt"])) {
      row.problems.push("the question after Ap dung: " + JSON.stringify(q1));
    }
    await waitFor(page, () => row.api.feedback.length === 1, 10000);
    const thanks = await page.waitForFunction(() => /^Đã gửi, cảm ơn\.$/.test(document.getElementById("terms-sent")
      .textContent), null, { timeout: 10000 }).then(() => true, () => false);
    if (!thanks) row.problems.push("no thanks after Gui");
    if (!same(row.api.feedback[0], [{ en: "spindle cell", vi_used: "tế bào hình thoi", vi_user: "tế bào hình suốt",
      pack: "pathology", kind: "new" }])) row.problems.push("feedback sent: " + JSON.stringify(row.api.feedback[0]));
    const corrected = ["Khối u có tế bào hình suốt.", "Tế bào hình suốt xếp thành bó.", "Cũng có tế bào hình thoi.",
      "Không thấy hoại tử."];
    const shown = await textOut(page);
    if (!same(shown, corrected)) row.problems.push("the text after Ap dung: " + JSON.stringify(shown));
    if (!/^Đã sửa 2 đoạn\.$/.test(await page.textContent("#terms-status"))) {
      row.problems.push("status: " + (await page.textContent("#terms-status")));
    }
    await page.click("#text-copy");
    await page.waitForTimeout(300);
    if ((await clipboard(page)) !== corrected.join("\n")) row.problems.push("the copy should hold the corrected text");
    await page.click("#terms-copy-original");
    await page.waitForTimeout(300);
    if ((await clipboard(page)) !== TERM_PARAS.map((p) => TERMS_VI[p]).join("\n")) {
      row.problems.push("the original text should stay available");
    }
    // a fixed term changed; "Không": nothing sent
    await setTerm(page, "terms-fixed", "tumour", "u");
    await page.click("#terms-apply");
    const q2 = await answerFeedback(page, false);
    if (!q2 || !same(q2.rows, ["tumour: khối u → u"])) row.problems.push("the question, fixed term: " + JSON.stringify(q2));
    await page.waitForTimeout(300);
    if (row.api.feedback.length !== 1) row.problems.push("Khong must send nothing");
    if ((await textOut(page))[0] !== "U có tế bào hình suốt.") row.problems.push("fixed term in the text: " + (await textOut(page))[0]);
    // the explicit button: the change still waiting, then the new term not sent yet
    await page.click("#terms-send");
    const q3 = await answerFeedback(page, true);
    if (!q3 || !same(q3.rows, ["tumour: khối u → u"])) row.problems.push("explicit button: " + JSON.stringify(q3));
    await waitFor(page, () => row.api.feedback.length === 2, 10000);
    if (!same(row.api.feedback[1], [{ en: "tumour", vi_used: "khối u", vi_user: "u", pack: "pathology", kind: "fixed" }])) {
      row.problems.push("feedback sent: " + JSON.stringify(row.api.feedback[1]));
    }
    await page.waitForFunction(() => !document.getElementById("terms-send").disabled, null, { timeout: 5000 }).catch(() => null);
    await page.click("#terms-send");
    const q4 = await answerFeedback(page, false);
    if (!q4 || !same(q4.rows, ["fascicles: bó"])) row.problems.push("then the new term not sent: " + JSON.stringify(q4));
    await page.locator("#terms").screenshot({ path: join(out, "terms_text.png") });
    await visibleWords(page, row, "term review");
    if (await page.isVisible("#error")) row.problems.push("an error card after the term review");
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("terms-file")) {
    const { context, page, row } = await newPage("terms", "hang", "terms-file");
    await waitEngine(page, /^Sẵn sàng$/);
    const dirs = { original: join(out, "terms-file", "original"), corrected: join(out, "terms-file", "corrected") };
    for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
    const cases = [
      { file: "doc.docx", news: [["meningioma", "u màng não", "1"]], en: "meningioma", vi: "u màng não",
        to: "u màng não (meningioma)" },
      { file: "deck.pptx", news: [["meningioma", "u màng não", "1"], ["grade", "độ mô học", "3"]], en: "grade",
        vi: "độ mô học", to: "độ ác tính" },
    ];
    for (const c of cases) {
      const want = c.file.replace(/(\.[^.]+)$/, "_vi$1");
      const r = await translate(page, fx(c.file), async (p) => {
        if (!(await p.evaluate(() => (document.getElementById("result").nextElementSibling || {}).id === "terms"))) {
          row.problems.push(c.file + ": the review should sit under the result");
        }
        if (!(await openTerms(p))) { row.problems.push(c.file + ": the new-term list never showed"); return; }
        const news = await termRows(p);
        if (!same(news, c.news)) row.problems.push(c.file + ": new terms " + JSON.stringify(news));
        await setTerm(p, "terms-new", c.en, c.to);
        await p.click("#terms-apply");
        const q = await answerFeedback(p, false);
        if (!q || !same(q.rows, [c.en + ": " + c.vi + " → " + c.to])) row.problems.push(c.file + ": question " + JSON.stringify(q));
        const sent = row.api.feedback.length;
        if (c.file === "deck.pptx") {
          // the fixed term of a plural source ("tumours"): the segment the core fixed changes too
          const fixed = await fixedRows(p);
          if (!same(fixed, [["tumour", "bướu", "u", "1"]])) row.problems.push("deck: fixed terms " + JSON.stringify(fixed));
          await setTerm(p, "terms-fixed", "tumour", "khối u");
          await p.click("#terms-apply");
          const q2 = await answerFeedback(p, true);
          if (!q2 || !same(q2.rows, ["tumour: u → khối u"])) row.problems.push("deck: question " + JSON.stringify(q2));
        } else {
          // the explicit button sends the change answered "Không" before
          await p.click("#terms-send");
          const q2 = await answerFeedback(p, true);
          if (!q2 || !same(q2.rows, [c.en + ": " + c.vi + " → " + c.to])) row.problems.push(c.file + ": explicit " + JSON.stringify(q2));
        }
        if (!(await waitFor(p, () => row.api.feedback.length === sent + 1, 10000))) row.problems.push(c.file + ": nothing sent");
        const ready = await p.waitForSelector("#terms-download:not([hidden])", { timeout: 15000 }).then(() => true, () => false);
        if (!ready) { row.problems.push(c.file + ": no corrected download"); return; }
        const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#terms-download")]);
        if (dl.suggestedFilename() !== want) row.problems.push(c.file + ": corrected download named " + dl.suggestedFilename());
        await dl.saveAs(join(dirs.corrected, want));
        const [d0] = await Promise.all([p.waitForEvent("download"), p.click("#download")]);
        await d0.saveAs(join(dirs.original, want));
        await p.locator("#terms").screenshot({ path: join(out, "terms_" + c.file.replace(".", "_") + ".png") });
        await visibleWords(p, row, c.file + " term review");
      });
      row.files.push(r);
      if (r.outcome !== "done" || r.problem) row.problems.push(r.file + ": " + (r.problem || r.error || r.outcome));
    }
    // the corrected files changed where the source has the term (doc: not "meningiomas1", a footnote mark glued to
    // the word: no term for /terms either); the originals did not
    const docC = zipText(join(dirs.corrected, "doc_vi.docx"), "word/document.xml");
    const docO = zipText(join(dirs.original, "doc_vi.docx"), "word/document.xml");
    if (!docC.includes("Phân độ u màng não (meningioma)") || !docC.includes("u màng não biến đổi NF2")
      || docC.split("(meningioma)").length !== 2) row.problems.push("doc_vi.docx (corrected): the term is not where it should be");
    if (docO.includes("(meningioma)") || !docO.includes("Phân độ u màng não")) row.problems.push("doc_vi.docx (original) changed");
    const s1 = zipText(join(dirs.corrected, "deck_vi.pptx"), "ppt/slides/slide1.xml");
    const s3 = zipText(join(dirs.corrected, "deck_vi.pptx"), "ppt/slides/slide3.xml");
    if (!s1.includes("Độ ác tính phụ thuộc vào số nhân chia") || !s1.includes("Phân độ u màng não")) {
      row.problems.push("deck_vi.pptx (corrected): slide 1");
    }
    if (!s3.includes("Sống còn theo độ ác tính") || !s3.includes("Khối u độ ác tính 3 tái phát sớm")) {
      row.problems.push("deck_vi.pptx (corrected): slide 3");
    }
    if (!zipText(join(dirs.original, "deck_vi.pptx"), "ppt/slides/slide3.xml").includes("U độ mô học 3 tái phát sớm")) {
      row.problems.push("deck_vi.pptx (original) changed");
    }
    if (!same(row.api.feedback, [[{ en: "meningioma", vi_used: "u màng não", vi_user: "u màng não (meningioma)",
      pack: "pathology", kind: "new" }], [{ en: "tumour", vi_used: "u", vi_user: "khối u", pack: "pathology", kind: "fixed" }]])) {
      row.problems.push("feedback: " + JSON.stringify(row.api.feedback));
    }
    if (await page.isVisible("#terms")) row.problems.push("the review should go with Xoa");
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("terms-error")) {
    const { context, page, row } = await newPage("terms-error", "hang", "terms-error");
    await waitEngine(page, /^Sẵn sàng$/);
    const r = await translateText(page, TERM_PARAS.join("\n"));
    row.files.push(r);
    if (r.outcome !== "done" || r.problem) row.problems.push("text: " + (r.problem || r.error || r.outcome));
    await openTerms(page);  // 3 tries: 2 s and 6 s apart
    const note = await page.textContent("#terms-new-note");
    if (note !== "Chưa xem được từ mới (mô hình chưa trả lời). Bản dịch vẫn dùng được.") row.problems.push("model error line: " + note);
    if (row.api.termsCalls !== 3) row.problems.push("a model error is tried 3 times, saw " + row.api.termsCalls);
    if (await page.isVisible("#error")) row.problems.push("a failed term review is no job error");
    if ((await textOut(page)).length !== TERM_PARAS.length) row.problems.push("the translation must stay");
    if (!(await page.isVisible("#terms-retry"))) row.problems.push("a model error offers Thu lai");
    else {
      await page.click("#terms-retry");
      const quota = await page.waitForFunction(() => /hết lượt hôm nay/.test(document.getElementById("terms-new-note").textContent),
        null, { timeout: 15000 }).then(() => true, () => false);
      if (!quota) row.problems.push("quota line: " + (await page.textContent("#terms-new-note")));
      if (await page.isVisible("#terms-retry")) row.problems.push("no Thu lai when today's quota is used up");
    }
    // the fixed list works without /terms; /feedback refused (429): said in the panel
    await setTerm(page, "terms-fixed", "tumour", "u");
    await page.click("#terms-apply");
    await answerFeedback(page, true);
    const said = await page.waitForFunction(() => /^Chưa gửi được \(hết lượt hôm nay\)\.$/.test(document
      .getElementById("terms-sent").textContent), null, { timeout: 10000 }).then(() => true, () => false);
    if (!said) row.problems.push("feedback refused: " + (await page.textContent("#terms-sent")));
    if ((await textOut(page))[0] !== "U có tế bào hình thoi.") row.problems.push("the fixed term in the text");
    if (await page.isVisible("#error")) row.problems.push("a refused feedback is no job error");
    await page.locator("#terms").screenshot({ path: join(out, "terms_error.png") });
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("pdf")) {
    const { context, page, row } = await newPage("pdf", "hang", "pdf", { translateDelayMs: 100 });
    await waitEngine(page, /^Sẵn sàng$/);
    const dir = join(out, "pdf");
    const fixed = join(dir, "corrected");
    mkdirSync(join(dir, "png"), { recursive: true });
    mkdirSync(fixed, { recursive: true });
    const outputs = {};
    for (const f of ["article.pdf", "slide.pdf", "scan.pdf"]) {
      const r = await translate(page, pdfFx(f), async (p) => {
        const stem = f.replace(/\.pdf$/, "");
        if ((await p.textContent("#download")) !== "Tải PDF") row.problems.push(f + ": the main link should be the PDF");
        const [d] = await Promise.all([p.waitForEvent("download"), p.click("#download-docx")]);
        if (d.suggestedFilename() !== stem + "_vi.docx") row.problems.push(f + ": DOCX named " + d.suggestedFilename());
        await d.saveAs(join(dir, stem + "_vi.docx"));
        if (f === "article.pdf") {
          // the term review on a PDF: the fixed term changed -> both files again
          if (!(await openTerms(p))) row.problems.push("article: the term review did not open");
          const rows = await fixedRows(p);
          if (!rows.some((x) => x[0] === "tumour" && x[2] === "khối u")) row.problems.push("article: fixed rows " + JSON.stringify(rows));
          await setTerm(p, "terms-fixed", "tumour", "u");
          await p.click("#terms-apply");
          await answerFeedback(p, false);
          const ok = await p.waitForSelector("#terms-download-docx:not([hidden])", { timeout: 60000 }).then(() => true, () => false);
          if (!ok) { row.problems.push("article: no corrected downloads"); return; }
          for (const id of ["#terms-download", "#terms-download-docx"]) {
            const [c] = await Promise.all([p.waitForEvent("download"), p.click(id)]);
            await c.saveAs(join(fixed, c.suggestedFilename()));
          }
          await p.locator("#terms").screenshot({ path: join(dir, "terms_pdf.png") });
        }
        await visibleWords(p, row, f + " result");
      });
      row.files.push(r);
      if (r.outcome !== "done" || r.problem) { row.problems.push(f + ": " + (r.problem || r.error || r.outcome)); continue; }
      outputs[f] = new Uint8Array(readFileSync(join(out, r.output)));
      writeFileSync(join(dir, r.output), outputs[f]);
      for (const [k, png] of (await renderPdf(page, outputs[f])).entries()) {
        writeFileSync(join(dir, "png", r.output.replace(/\.pdf$/, "") + "_p" + (k + 1) + ".png"), Buffer.from(png.split(",")[1], "base64"));
      }
    }
    // what the PDFs and DOCX files hold
    const words = (s) => s.replace(/\s+/g, " ");
    if (outputs["article.pdf"]) {
      const pages = (await pdfjsText(outputs["article.pdf"])).map((items) => words(items.map((i) => i.str).join(" ")));
      if (pages.length !== 2) row.problems.push("article_vi.pdf: " + pages.length + " pages");
      if (!pages[0].includes("Bản dịch 1:")) row.problems.push("article_vi.pdf: no Vietnamese");
      for (const en of ["Spindle cell lesions in a synthetic series", "Spindle cell tumours", "Figure 1.", "Marker",
        "Corresponding author", "Abstract"]) {
        if (pages[0].includes(en)) row.problems.push("article_vi.pdf: English left: " + en);
      }
      if (!pages[0].includes("Synthetic Journal of Soft Tissue Pathology") || !pages[1].includes("J Synth Path. 2020")) {
        row.problems.push("article_vi.pdf: the running header or the References are gone");
      }
      const { PL } = await nodeLibs();
      const doc = await openPdfLib(PL, outputs["article.pdf"]);
      const images = doc.getPages().reduce((n, pg, i) => n + analyzePage(PL, doc, pg, i).images.length, 0);
      if (images !== 1) row.problems.push("article_vi.pdf: " + images + " pictures, want 1");
      const cor = (await pdfjsText(readFileSync(join(fixed, "article_vi.pdf")))).map((items) => words(items.map((i) => i.str).join(" "))).join(" ");
      if (cor.includes("khối u") || !/: u tế bào/.test(cor)) row.problems.push("corrected article_vi.pdf: the term is not changed");
    }
    for (const f of ["article", "slide", "scan"]) {
      const file = join(dir, f + "_vi.docx");
      try {
        const pkg = new OoxmlPackage(new Uint8Array(readFileSync(file)));
        const xml = new TextDecoder().decode(pkg.bytes("word/document.xml"));
        if (!xml.includes("Bản dịch 1:")) row.problems.push(f + "_vi.docx: no Vietnamese");
      } catch (e) { row.problems.push(f + "_vi.docx: " + e.message); }
    }
    if (outputs["slide.pdf"]) {
      const { PL } = await nodeLibs();
      const pg = (await openPdfLib(PL, outputs["slide.pdf"])).getPages()[0];
      if (pg.getWidth() !== 960 || pg.getHeight() !== 540) row.problems.push("slide_vi.pdf: the page size changed");
    }
    if (outputs["scan.pdf"]) {
      const t = (await pdfjsText(outputs["scan.pdf"]))[0].map((i) => i.str).join(" ");
      if (!t.includes("Bản dịch")) row.problems.push("scan_vi.pdf: no Vietnamese over the scan");
      const cl = row.api.calls.filter((c) => c.path === "classify").map((c) => c.body.text).find((x) => /lesion/i.test(x)) || "";
      row.scanOcrText = cl.slice(0, 300);
      if (!/spindle/i.test(cl)) row.problems.push("scan: the OCR text was not sent: " + JSON.stringify(cl.slice(0, 120)));
    }
    noLocalRequests(row);
    await finish(context, page, row);
  }
  if (only.includes("shell")) {
    // the app shell: "Văn bản" open at load, the tool modules not loaded until their tab opens, clicks and the arrow
    // keys switch tabs, the hash follows (Back returns), deep links and the old /anh/ and /live/ addresses open their
    // tab, no horizontal scroll at 360 px on any tab, the bottom bar on a phone
    const { context, page, row } = await newPage("ok", "hang", "shell");
    await waitEngine(page, /^Sẵn sàng$/);
    const state = () => page.evaluate(() => ({
      selected: [...document.querySelectorAll("#tools [role=tab]")].filter((t) => t.getAttribute("aria-selected") === "true")
        .map((t) => t.dataset.tool),
      focused: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tool || "" : "",
      views: ["view-app", "view-anh", "view-live"].filter((v) => !document.getElementById(v).hidden),
      panels: ["text-panel", "file-panel", "sub-panel"].filter((v) => !document.getElementById(v).hidden),
      hash: location.hash, path: location.pathname + location.search, title: document.title,
      pill: document.getElementById("status").textContent }));
    const expect = async (what, want) => {
      const s = await state();
      for (const [k, v] of Object.entries(want)) {
        if (JSON.stringify(s[k]) !== JSON.stringify(v)) row.problems.push(what + ": " + k + " " + JSON.stringify(s[k]) + ", want " + JSON.stringify(v));
      }
    };
    await expect("at load", { selected: ["text"], views: ["view-app"], panels: ["text-panel"], title: "ViTranslate" });
    const lazy = ["/anh/anh.js", "/live/live.js", "/sub/subtitles.js", "/pdf/job.js"];
    const early = lazy.filter((p) => row.paths.includes(p));
    if (early.length) row.problems.push("loaded before their tab opened: " + early.join(", "));
    await page.click("#tab-file");
    await expect("Tai lieu", { selected: ["file"], views: ["view-app"], panels: ["file-panel"], hash: "#tai-lieu" });
    // the arrow keys: Tài liệu -> Ảnh (its module loads now), End -> Dịch đuổi, Home -> Văn bản
    await page.focus("#tab-file");
    await page.keyboard.press("ArrowRight");
    await expect("ArrowRight", { selected: ["anh"], focused: "anh", views: ["view-anh"], hash: "#anh", title: "ViTranslate · Ảnh",
      pill: "Sẵn sàng" });
    if (!(await waitFor(page, () => row.paths.includes("/anh/anh.js"), 5000))) row.problems.push("anh.js not loaded on its tab");
    await page.keyboard.press("End");
    await expect("End", { selected: ["live"], focused: "live", views: ["view-live"], hash: "#dich-duoi" });
    if (!(await waitFor(page, () => row.paths.includes("/live/live.js"), 5000))) row.problems.push("live.js not loaded on its tab");
    // the live tool's own consent, the first time its tab opens
    if (await page.waitForSelector("#live-consent[open]", { timeout: 5000 }).then(() => true, () => false)) {
      await page.check("#live-agree");
      await page.click("#live-consent-ok");
    } else row.problems.push("the live tool's consent did not open with its tab");
    await page.focus("#tab-live");
    await page.keyboard.press("Home");
    await expect("Home", { selected: ["text"], focused: "text", hash: "#van-ban", panels: ["text-panel"] });
    await page.goBack();
    await expect("Back", { selected: ["live"], hash: "#dich-duoi" });
    // deep links: a hash change on the page, then fresh loads, then the old addresses
    await page.goto(server.origin + "/#phu-de");
    await expect("link #phu-de", { selected: ["sub"], panels: ["sub-panel"] });
    if (!(await page.isVisible("text=Chép lời từ tệp ghi âm: sắp có"))) row.problems.push("the coming-soon line is missing");
    if (!(await waitFor(page, () => row.paths.includes("/sub/subtitles.js"), 5000))) row.problems.push("subtitles.js not loaded on its tab");
    await page.goto("about:blank");
    await page.goto(server.origin + "/#tai-lieu");
    await expect("load #tai-lieu", { selected: ["file"], panels: ["file-panel"] });
    await page.goto(server.origin + "/anh/");
    await page.waitForFunction(() => location.hash === "#anh", null, { timeout: 5000 }).catch(() => null);
    await expect("old /anh/", { selected: ["anh"], views: ["view-anh"], path: "/" });
    await page.goto(server.origin + "/live/?ocr=wasm");
    await page.waitForFunction(() => location.hash === "#dich-duoi", null, { timeout: 5000 }).catch(() => null);
    await expect("old /live/", { selected: ["live"], views: ["view-live"], path: "/?ocr=wasm" });
    // phones: the tabs at the bottom, no horizontal scroll on any tab at 360 px
    await page.setViewportSize({ width: 360, height: 740 });
    for (const t of ["text", "file", "anh", "sub", "live"]) {
      await page.click("#tab-" + t);
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth,
        bar: document.getElementById("tools").getBoundingClientRect().bottom, h: window.innerHeight }));
      if (m.sw > m.w) row.problems.push(t + ": horizontal scroll at 360 px (" + m.sw + " > " + m.w + ")");
      if (Math.abs(m.bar - m.h) > 2) row.problems.push(t + ": the tab bar is not at the bottom (" + m.bar + " / " + m.h + ")");
    }
    row.files.push({ file: "-", outcome: "tabs, links, keys, 360 px", seconds: 0 });
    delete row.paths;
    await finish(context, page, row);
  }
  if (only.includes("menu")) {
    // the ⋮ menu (web/shell.js createMenu, web/settings.js): open / close by mouse and keyboard, its sections, the moved
    // controls, the choices remembered, Nhật ký, the bottom sheet on a phone, screenshots for a person
    const shots = resolve(opt("--shots", join(out, "menu_shots")));
    mkdirSync(shots, { recursive: true });
    const { context, page, row } = await newPage("ok", "hang", "menu");
    await waitEngine(page, /^Sẵn sàng$/);
    const state = () => page.evaluate(() => {
      const a = document.activeElement;
      return { open: !document.getElementById("menu").hidden,
        expanded: document.getElementById("menu-btn").getAttribute("aria-expanded"),
        focus: !a ? "" : a.id || (a.name ? a.name + "=" + a.value : a.tagName.toLowerCase()) };
    });
    const want = async (what, w) => {
      const s = await state();
      for (const [k, v] of Object.entries(w)) if (s[k] !== v) row.problems.push(what + ": " + k + " " + s[k] + ", want " + v);
    };
    await want("at load", { open: false, expanded: "false" });
    await page.click("#menu-btn");
    await want("click", { open: true, expanded: "true", focus: "engine=cloud" });
    await page.keyboard.press("Escape");
    await want("Esc", { open: false, expanded: "false", focus: "menu-btn" });
    await page.keyboard.press("Enter");  // the focused button, from the keyboard
    await want("Enter", { open: true, focus: "engine=cloud" });
    await page.click("footer");  // outside, not a control
    await page.waitForTimeout(100);
    await want("click outside", { open: false, focus: "menu-btn" });
    await page.click("#menu-btn");
    await page.click("#src-text");  // a field keeps the focus the click gives it
    await want("click into a field", { open: false, focus: "src-text" });
    await page.click("#menu-btn");
    for (let k = 0; k < 20 && (await state()).open; k++) await page.keyboard.press("Tab");
    if ((await state()).open) row.problems.push("Tab out of the panel should close it");
    // his order: Dịch bằng, Phụ đề, Trên máy (with Trên máy only), Giao diện, Nhật ký
    const sections = await page.$$eval("#menu > *", (els) => els.map((el) => {
      const l = el.querySelector("legend");
      return { name: l ? l.textContent : el.textContent.trim(), hidden: el.hidden };
    }));
    const names = sections.map((x) => x.name).join(" / ");
    if (names !== "Dịch bằng / Phụ đề / Trên máy / Giao diện / Nhật ký") row.problems.push("sections: " + ascii(names));
    if (!sections[2].hidden) row.problems.push("the Tren may section shows with May chu");
    // the moved controls are gone from Tài liệu and the live stage
    for (const id of ["engine-local", "engine-local-wrap", "live-show-en", "live-smaller", "live-bigger"]) {
      if (await page.$("#" + id)) row.problems.push("#" + id + " should have moved into the menu");
    }
    if (await page.$("#file-panel #opt-polish, #file-panel #opt-fast")) row.problems.push("the local options are still on Tai lieu");
    // Trên máy shows its section (the read-back pass and the fast draft); Máy chủ hides it again
    await page.click("#menu-btn");
    await page.check('#menu input[name="engine"][value="local"]');
    if (!(await page.isVisible("#local-options"))) row.problems.push("Tren may: its section should show");
    await page.check('#menu input[name="engine"][value="cloud"]');
    if (await page.isVisible("#local-options")) row.problems.push("May chu: the Tren may section should hide");
    // Phụ đề: Song ngữ and a bigger size reach the live stage
    await page.check("#menu-bilingual");
    await page.click("#menu-bigger");
    await page.keyboard.press("Escape");
    await page.click("#tab-live");
    if (await page.waitForSelector("#live-consent[open]", { timeout: 3000 }).then(() => true, () => false)) {
      await page.check("#live-agree");
      await page.click("#live-consent-ok");
      await page.evaluate(() => { const b = document.getElementById("live-stop"); if (!b.hidden) b.click(); });
    }
    const stage = await page.evaluate(() => ({ noEn: document.getElementById("live-stage").classList.contains("no-en"),
      size: document.getElementById("live-stage").style.getPropertyValue("--sub-size"),
      en: localStorage.getItem("vitranslate-live-en-v1"), step: localStorage.getItem("vitranslate-live-size-v1") }));
    if (stage.noEn || stage.size !== "2.3rem" || stage.en !== "on" || stage.step !== "4") {
      row.problems.push("Phu de settings on the stage: " + JSON.stringify(stage));
    }
    await page.click("#menu-btn");
    await page.uncheck("#menu-bilingual");
    if (!(await page.evaluate(() => document.getElementById("live-stage").classList.contains("no-en")))) {
      row.problems.push("Song ngu off: the stage should be Vietnamese only");
    }
    await page.keyboard.press("Escape");
    // Giao diện: Tối on the root, kept over a reload (theme.js before the module); Theo máy removes it
    await page.click("#menu-btn");
    await page.check('#menu input[name="theme"][value="dark"]');
    if ((await page.getAttribute("html", "data-theme")) !== "dark") row.problems.push("Toi: no data-theme dark");
    await page.reload();
    await waitEngine(page, /^Sẵn sàng$/);
    if ((await page.getAttribute("html", "data-theme")) !== "dark") row.problems.push("Toi not kept after a reload");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (bg !== "rgb(14, 18, 24)") row.problems.push("Toi: the page background is " + bg);
    await page.click("#menu-btn");
    if (!(await page.isChecked('#menu input[name="theme"][value="dark"]'))) row.problems.push("the menu should say Toi");
    await page.check('#menu input[name="theme"][value="auto"]');
    if ((await page.getAttribute("html", "data-theme")) !== null) row.problems.push("Theo may: data-theme should go");
    await page.keyboard.press("Escape");
    // Nhật ký after a text job on Máy chủ: one line per call, no text; Sao chép; Xóa; focus back to the button
    const job = await translateText(page, "The tumour shows spindle cells.");
    if (job.outcome !== "done") row.problems.push("text job for the log: " + job.outcome);
    await page.click("#menu-btn");
    await page.click("#menu-log");
    await page.waitForSelector("#log-view[open]", { timeout: 3000 });
    const lines = await page.$$eval("#log-lines li", (lis) => lis.map((li) => li.textContent));
    row.logLines = lines.map(ascii);
    if (!lines.some((l) => /Văn bản · máy chủ · translate · 1 đoạn · \d+\.\d s · ok$/.test(l))) {
      row.problems.push("log: no translate line of the text job");
    }
    if (lines.some((l) => /tumour|spindle/i.test(l))) row.problems.push("log: a line holds the text");
    await page.click("#log-copy");
    const copied = await clipboard(page);
    if (copied !== lines.join("\n")) row.problems.push("Sao chep: the clipboard is not the log");
    await page.screenshot({ path: join(shots, "log_desktop_light.png") });
    await page.click("#log-clear");
    if (!(await page.isVisible("#log-empty")) || (await page.$$("#log-lines li")).length) row.problems.push("Xoa: the log is not empty");
    if (await page.evaluate(() => localStorage.getItem("vitranslate-log-v1"))) row.problems.push("Xoa: the stored lines stay");
    await page.click("#log-close");
    await want("log closed", { focus: "menu-btn" });
    // the old switch's value "local" reads as Trên máy (the migration), then Máy chủ again
    await page.evaluate(() => localStorage.setItem("vitranslate-engine-v1", "local"));
    await page.reload();
    await page.click("#menu-btn");
    if (!(await page.isChecked('#menu input[name="engine"][value="local"]'))) row.problems.push("the old 'local' is not Tren may");
    await page.check('#menu input[name="engine"][value="cloud"]');
    await page.keyboard.press("Escape");
    await waitEngine(page, /^Sẵn sàng$/);
    // a phone: the bottom sheet over a scrim; a tap on the scrim closes it
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click("#menu-btn");
    const sheet = await page.evaluate(() => {
      const r = document.getElementById("menu").getBoundingClientRect();
      const scrim = getComputedStyle(document.querySelector(".menu-scrim")).display;
      return { left: r.left, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight, scrim,
        sw: document.documentElement.scrollWidth };
    });
    if (Math.abs(sheet.bottom - sheet.h) > 1 || sheet.left !== 0 || Math.abs(sheet.right - sheet.w) > 1) {
      row.problems.push("phone: not a bottom sheet " + JSON.stringify(sheet));
    }
    if (sheet.scrim !== "block") row.problems.push("phone: no scrim behind the sheet");
    if (sheet.sw > sheet.w) row.problems.push("phone: horizontal scroll with the menu open");
    await page.mouse.click(195, 60);
    await want("tap on the scrim", { open: false });
    row.files.push({ file: "-", outcome: "menu: mouse, keys, sections, prefs, log, sheet", seconds: 0 });
    await finish(context, page, row);
    // screenshots for a person: the open menu, desktop light and phone dark
    for (const [name, ctx] of [["menu_desktop_light", { colorScheme: "light", viewport: { width: 1280, height: 900 } }],
      ["menu_phone_dark", { colorScheme: "dark", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true }]]) {
      const s = await newPage("ok", "hang", "menu-shot-" + name, { ctx });
      await waitEngine(s.page, /^Sẵn sàng$/);
      await s.page.evaluate(() => document.fonts.ready);
      await s.page.click("#menu-btn");
      await s.page.waitForTimeout(250);
      await s.page.screenshot({ path: join(shots, name + ".png") });
      s.row.files.push({ file: name + ".png", outcome: "screenshot", seconds: 0 });
      await finish(s.context, s.page, s.row);
    }
  }
  if (only.includes("screens")) {
    // the shell in light and dark, desktop and phone: one PNG per tab (looked at by a person, not compared)
    const dir = join(out, "screens");
    mkdirSync(dir, { recursive: true });
    for (const scheme of ["light", "dark"]) {
      for (const [size, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
        const label = "screens-" + scheme + "-" + size;
        const { context, page, row } = await newPage("ok", "hang", label, { ctx: { colorScheme: scheme, viewport,
          deviceScaleFactor: size === "mobile" ? 2 : 1, isMobile: size === "mobile", hasTouch: size === "mobile" } });
        await waitEngine(page, /^Sẵn sàng$/);
        await page.fill("#src-text", TERM_PARAS.join("\n"));
        for (const t of ["text", "file", "anh", "sub", "live"]) {
          await page.click("#tab-" + t);
          if (t === "sub") await page.fill("#sub-src", SUB_SRT.replace(/^﻿/, ""));
          if (t === "live" && await page.waitForSelector("#live-consent[open]", { timeout: 3000 }).then(() => true, () => false)) {
            await page.check("#live-agree");
            await page.click("#live-consent-ok");
          }
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(250);
          await page.screenshot({ path: join(dir, scheme + "_" + size + "_" + t + ".png"), fullPage: size === "desktop" });
          const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
          if (m.sw > m.w) row.problems.push(t + ": horizontal scroll (" + m.sw + " > " + m.w + ")");
        }
        // the font is the self-hosted Noto Sans, with Vietnamese
        const font = await page.evaluate(() => document.fonts.check("16px \"VT Sans\"", "Tiếng Việt"));
        if (!font) row.problems.push("the self-hosted font did not load");
        row.files.push({ file: label, outcome: "5 screenshots", seconds: 0 });
        await finish(context, page, row);
      }
    }
  }
  if (only.includes("sub")) {
    // "Phụ đề": an SRT (BOM, CRLF, an overlap, tags, a two-line cue, a position override, 26 cues: batches of 20 and 6)
    // through the cloud: classify once (profile file, the cue texts), segments with the neighbouring cues, the
    // Vietnamese per cue; bilingual SRT and Vietnamese-only VTT downloads; pasted VTT read; the term review on the cues
    const { context, page, row } = await newPage("terms", "hang", "sub", { translateDelayMs: 100 });
    await waitEngine(page, /^Sẵn sàng$/);
    const dir = join(out, "sub");
    mkdirSync(dir, { recursive: true });
    const srtFile = join(dir, "lecture.srt");
    writeFileSync(srtFile, SUB_SRT, "utf8");
    await page.click("#tab-sub");
    await page.setInputFiles("#sub-file", srtFile);
    const count = await page.waitForFunction(() => /câu thoại · SRT/.test(document.getElementById("sub-count").textContent),
      null, { timeout: 5000 }).then(() => page.textContent("#sub-count"), () => page.textContent("#sub-count"));
    if (count !== SUB_CUES.length + " câu thoại · SRT") row.problems.push("cue count: " + count);
    if ((await page.textContent("#sub-filename")) !== "lecture.srt") row.problems.push("no file name shown");
    if (!(await clickGo(page))) row.problems.push("Dich stays off with subtitles ready");
    const outcome = await Promise.race([
      page.waitForFunction(() => [...document.querySelectorAll("#log li")].some((li) => /Xong sau/.test(li.textContent)),
        null, { timeout: 60000 }).then(() => "done"),
      page.waitForSelector("#error:not([hidden])", { timeout: 60000 }).then(() => "error"),
    ]);
    const r = { file: "lecture.srt", outcome, seconds: 0 };
    row.files.push(r);
    if (outcome !== "done") row.problems.push("subtitles: " + outcome + " " + (await page.textContent("#error-text")));
    const calls = row.api.calls;
    const cl = calls.filter((c) => c.path === "classify");
    const tr = calls.filter((c) => c.path === "translate");
    const plain = SUB_CUES.map((c) => c.plain);
    if (cl.length !== 1 || cl[0].body.text !== plain.join("\n") || cl[0].body.profile !== "file") {
      row.problems.push("classify once with the cue texts and profile file: " + JSON.stringify(cl.map((c) => c.body.profile)));
    }
    if (JSON.stringify(tr.map((c) => c.body.segments.length)) !== "[20,6]") {
      row.problems.push("batches " + tr.map((c) => c.body.segments.length).join(", ") + ", want 20, 6");
    }
    const segs = tr.flatMap((c) => c.body.segments);
    const bad = segs.filter((s, k) => s.tagged !== SUB_CUES[k].tagged || s.where !== "Câu thoại " + (k + 1)
      || s.prev !== (k ? plain[k - 1] : "") || s.nxt !== (k + 1 < plain.length ? plain[k + 1] : ""));
    if (bad.length) row.problems.push(bad.length + " segment(s) not {tagged, prev, nxt, Câu thoại n}: " + JSON.stringify(bad[0]));
    const shown = await page.$$eval("#sub-out li", (lis) => lis.map((li) => ({ t: li.querySelector(".t").textContent,
      vi: li.querySelector(".vi").textContent, en: li.querySelector(".en").textContent })));
    if (shown.length !== SUB_CUES.length) row.problems.push(shown.length + " cues shown");
    if (!shown.length || shown[0].vi !== "Khối u có tế bào hình thoi." || shown[0].t !== "00:00:01") {
      row.problems.push("first cue shown: " + JSON.stringify(shown[0]));
    }
    if (shown.length > 3 && (shown[1].vi !== "VI Spindle cells are arranged in fascicles."
      || shown[3].vi !== "VI No necrosis is seen." || shown[3].en !== "No necrosis is seen.")) {
      row.problems.push("the cues on screen should have no markup: " + JSON.stringify(shown.slice(1, 4)));
    }
    if (!(await page.isVisible("#terms"))) row.problems.push("no term review after the subtitle job");
    // downloads: bilingual SRT (the default), then Vietnamese-only VTT
    const take = async (name) => {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#sub-download")]);
      await dl.saveAs(join(dir, name));
      return { name: dl.suggestedFilename(), text: readFileSync(join(dir, name), "utf8") };
    };
    const bi = await take("bilingual.srt");
    if (bi.name !== "lecture_vi.srt") row.problems.push("SRT named " + bi.name);
    const wantBi = ["﻿1", "00:00:01,000 --> 00:00:03,000", "Khối u có tế bào hình thoi.", "The tumour shows spindle cells.", "",
      "2", "00:00:02,500 --> 00:00:05,000", "VI <i>Spindle cells are arranged in fascicles.</i>",
      "<i>Spindle cells are arranged in fascicles.</i>", "", "3", "00:00:05,000 --> 00:00:07,000", "Cũng có tế bào hình thoi.",
      "Fusiform cells are", "also present.", "", "4", "00:00:07,000 --> 00:00:09,000", "{\\an8}VI No necrosis is seen.",
      "No necrosis is seen.", ""].join("\r\n");
    if (!bi.text.startsWith(wantBi)) row.problems.push("bilingual SRT: " + JSON.stringify(bi.text.slice(0, 400)));
    await page.check('input[name="sub-kind"][value="vi"]');
    await page.check('input[name="sub-format"][value="vtt"]');
    if ((await page.textContent("#sub-name")) !== "lecture_vi.vtt") row.problems.push("name line: " + (await page.textContent("#sub-name")));
    const vtt = await take("vi.vtt");
    if (vtt.name !== "lecture_vi.vtt") row.problems.push("VTT named " + vtt.name);
    if (!vtt.text.startsWith("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nKhối u có tế bào hình thoi.\n\n")
      || /The tumour shows/.test(vtt.text) || !vtt.text.includes("\n{\\an8}VI No necrosis is seen.\n")) {
      row.problems.push("Vietnamese-only VTT: " + JSON.stringify(vtt.text.slice(0, 300)));
    }
    // the term review on the cues: a fixed term changed -> the cues and the corrected file; the job's file unchanged
    if (!(await openTerms(page))) row.problems.push("the new-term list never showed");
    const fixed = await fixedRows(page);
    if (!fixed.some((x) => x[0] === "tumour" && x[2] === "khối u")) row.problems.push("fixed rows " + JSON.stringify(fixed));
    await setTerm(page, "terms-fixed", "tumour", "u");
    await page.click("#terms-apply");
    await answerFeedback(page, false);
    const ok = await page.waitForSelector("#terms-download:not([hidden])", { timeout: 10000 }).then(() => true, () => false);
    if (!ok) row.problems.push("no corrected subtitle download");
    else {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#terms-download")]);
      await dl.saveAs(join(dir, "corrected.vtt"));
      const text = readFileSync(join(dir, "corrected.vtt"), "utf8");
      if (dl.suggestedFilename() !== "lecture_vi.vtt" || !text.includes("\nU có tế bào hình thoi.\n")) {
        row.problems.push("corrected file " + dl.suggestedFilename() + ": " + JSON.stringify(text.slice(0, 200)));
      }
    }
    if ((await page.$$eval("#sub-out li .vi", (ps) => ps.map((p) => p.textContent)))[0] !== "U có tế bào hình thoi.") {
      row.problems.push("the cues should show the corrected Vietnamese");
    }
    if (!(await take("again.vtt")).text.includes("\nKhối u có tế bào hình thoi.\n")) row.problems.push("the job's own file changed");
    await page.locator("#sub-result").screenshot({ path: join(dir, "sub_result.png") });
    // pasted VTT: read at once, the format follows it; local mode: subtitles go to the cloud only
    await page.fill("#sub-src", "WEBVTT\n\nNOTE synthetic\n\n00:01.000 --> 00:02.000 align:start\n<v Dr A>Hello.\n");
    if ((await page.textContent("#sub-count")) !== "1 câu thoại · VTT") row.problems.push("pasted VTT: " + (await page.textContent("#sub-count")));
    await page.fill("#sub-src", "not a subtitle file");
    if (!(await page.isDisabled("#go"))) row.problems.push("Dich must stay off without cues");
    // the other tabs were locked while the job ran: back to normal after it
    if (await page.getAttribute("#tab-text", "aria-disabled") === "true") row.problems.push("tabs still locked after the job");
    await visibleWords(page, row, "subtitles");
    noLocalRequests(row);
    await finish(context, page, row);
  }
} catch (err) {
  summary.error = String((err && err.stack) || err);
  console.log("ERROR " + ascii(summary.error).slice(0, 800));
} finally {
  await browser.close();
  await server.close();
}
// every scenario asked for ran ("screens" runs as four rows: screens-<scheme>-<size>) and every row is clean
const ran = (n) => summary.scenarios.filter((s) => s.scenario === n || (n === "screens" && /^screens-/.test(s.scenario)));
summary.ok = !summary.error && only.every((n) => ran(n).length === (n === "screens" ? 4 : 1))
  && summary.scenarios.every((s) => s.ok);
writeFileSync(join(out, "page_run.json"), JSON.stringify(summary, null, 1), "utf8");
console.log("RESULT " + (summary.ok ? "OK" : "FAILED") + ": " + summary.scenarios.length + " scenario(s) -> "
  + ascii(join(out, "page_run.json")));
process.exit(summary.ok ? 0 : 1);
