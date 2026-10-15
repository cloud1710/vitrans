// The live captions tool (the shell's "Dịch đuổi" tab, opened through its old address /live/) end to end in the
// installed Chrome (playwright-core, channel "chrome"): the site
// served with its _headers (web/engine/tests/site_server.mjs, so the CSP applies), the cloud API /api/v1/* answered by
// a scripted mock here (translations are "VI " + the sentence; every /translate body checked against the live
// contract), Turnstile replaced by a stand-in that hands out the always-pass dummy token, the caption sources faked:
// a scripted SpeechRecognition (interim + final results, an end and a restart) and the helper's caption stream on
// 127.0.0.1:4783x (routed: the first port refuses, the second answers start / SSE stream / stop).
// Scenarios (--only):
//   mic     consent at the first visit; agreeing starts the session (one tap, no Bat dau); the fake recognizer speaks 6 synthetic sentences (fillers, no end mark,
//           a restart); the subtitle stage shows the newest 2 sentences (Vietnamese + English) and the sentence being
//           spoken faded; Vietnamese only by default, the bilingual switch (stage + transcript); the transcript list;
//           TXT / SRT / DOCX downloads; full screen; Stop -> the clearing time; the live contract of every request
//   helper  Windows-style rolling captions through the helper stream; the helper's start / stop calls (hide: true)
//   auto    helper source chosen + consent given: the tab starts by itself (no click); another tab stops it; back on
//           the tab it starts again
//   nohelper  auto-start with no helper yet: the message and the "Mo ViTranslate" button; the helper answers 3 s
//           later and the session starts by itself (found again every 2 s)
//   quota   /translate answers 429 live_time_exceeded: the Vietnamese message, English still shown
//   iphone1 first visit on an iPhone: one tap (agree + Tiep tuc) starts the microphone and the translation
//   ipad    iPadOS (a Mac user agent with touch points): no helper source
//   iphone  390 x 844 mobile emulation (Chromium; no WebKit here) with an iPhone user agent: no helper source, no
//           horizontal scroll, the stage visible, full screen falls back to the focus view (no element full screen)
//   check   (his report 2026-10-15) helper source, auto-start, the first Turnstile check fails (600010): no helper call
//           (Live Captions never launched), the code and "Thu lai" in the box, no retry by itself; one click -> one
//           reset -> the session -> the helper starts by itself; a reload reuses the session (no new check)
//   wait    microphone, Turnstile shows its checkbox for 3 s: the status asks for it, nothing is sent before the
//           session, the sentences said meanwhile are translated once it is there (none marked "chua dich")
//   repair  term repair (the host answers en_fixed / repairs): Song ngu shows the repaired English with the repaired
//           term underlined and the words heard in its title (stage and transcript list); Vietnamese only unchanged;
//           the TXT / SRT / DOCX exports carry the repaired English
//   local   the menu's "Tren may" (his 2026-10-15 design) against a fake helper (web/engine/tests/fake_helper.mjs): the
//           expected speed before Bat dau, every sentence to 127.0.0.1 (profile live, no session), not one call to the
//           site's /api/v1 nor a Turnstile check; Song ngu from the menu; the log names the tool and engine without
//           text; Máy chủ chosen while running stops the run; no helper: the code, "Mo ViTranslate", and the run starts
//           by itself once the helper answers
// Song ngữ and the text size live in the shell's menu (web/settings.js); the stage follows them.
// Any CSP violation, page error or contract violation fails the run. ASCII output; JSON + screenshots in <out>.
// Usage: node web/live/tests/page_live.mjs [--site <build_site dir>] [--out <dir>] [--headed] [--only mic,helper,...]
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../engine/node_modules/playwright-core/index.mjs";
import { startSiteServer } from "../../engine/tests/site_server.mjs";
import { fakeHelper } from "../../engine/tests/fake_helper.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const site = opt("--site");
const out = resolve(opt("--out", join(WEB, "..", "out", "live")));
const only = opt("--only", "mic,helper,auto,nohelper,quota,iphone1,ipad,iphone,check,wait,repair,local").split(",");
mkdirSync(out, { recursive: true });
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, "?");

let root = WEB;
if (site) root = existsSync(join(site, "web", "index.html")) ? join(site, "web") : site;
const server = await startSiteServer(root, {}, 0);
const browser = await chromium.launch({ channel: "chrome", headless: !args.includes("--headed") });
const summary = { origin: server.origin, site: site ? resolve(site) : "repo web/", scenarios: [] };

const SPEECH = [
  // [ms after the previous step, results of the current recognition: [text, isFinal]...], "end" = the recognizer ends
  [300, [["Good morning", false]]],
  [300, [["Good morning everyone.", true]]],
  [300, [["Good morning everyone.", true], [" Um, the the margin", false]]],
  [300, [["Good morning everyone.", true], [" Um, the the margin is clear.", true]]],
  [300, [["Good morning everyone.", true], [" Um, the the margin is clear.", true], [" Next we look", false]]],
  [300, [["Good morning everyone.", true], [" Um, the the margin is clear.", true], [" Next we look at the lymph node", true]]],
  [1800, "end"],
  [400, [["The deposit is small", false]]],
  [300, [["The deposit is small.", true]]],
  [300, [["The deposit is small.", true], [" Any questions", false]]],
  [300, [["The deposit is small.", true], [" Any questions?", true]]],
  [300, [["The deposit is small.", true], [" Any questions?", true], [" Thank you", false]]],
];
const SPOKEN = ["Good morning everyone.", "The margin is clear.", "Next we look at the lymph node",
  "The deposit is small.", "Any questions?"];

function fakeSpeechScript(speech) {
  return `(() => {
    const STEPS = ${JSON.stringify(speech)};
    class FakeRec {
      constructor() { this.n = 0; window.__recs = (window.__recs || 0) + 1; }
      start() {
        window.__starts = (window.__starts || 0) + 1;
        if (window.__step === undefined) window.__step = 0;
        const run = () => {
          if (window.__stopped || window.__step >= STEPS.length) return;
          const [ms, what] = STEPS[window.__step];
          this.timer = setTimeout(() => {
            window.__step += 1;
            if (what === "end") { if (this.onend) this.onend(); return; }
            const results = what.map(([t, f]) => Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal: f }));
            if (this.onresult) this.onresult({ resultIndex: 0, results });
            run();
          }, ms);
        };
        run();
      }
      stop() { window.__stopped = true; clearTimeout(this.timer); if (this.onend) this.onend(); }
      abort() { this.stop(); }
    }
    window.webkitSpeechRecognition = FakeRec;
    window.SpeechRecognition = FakeRec;
  })();`;
}

// window.__tsPlan (set by a scenario's init script): { fail: [error codes of the first checks], interactiveMs: the
// checkbox shown that long (before-interactive) before the token }; window.__ts counts renders / resets
const TURNSTILE_FAKE = "window.__ts = { renders: 0, resets: 0 }; window.turnstile = { _o: null, " +
  "_go() { const o = this._o; const plan = window.__tsPlan || {}; const n = window.__ts.renders + window.__ts.resets; " +
  "const fail = (plan.fail || [])[n - 1]; if (fail) { setTimeout(() => o['error-callback'](fail), 50); return; } " +
  "if (plan.interactiveMs) { setTimeout(() => o['before-interactive-callback'](), 20); setTimeout(() => { " +
  "o['after-interactive-callback'](); o.callback('XXXX.DUMMY.TOKEN.XXXX'); }, plan.interactiveMs); return; } " +
  "setTimeout(() => o.callback('XXXX.DUMMY.TOKEN.XXXX'), 50); }, " +
  "render(box, o) { this._o = o; window.__ts.renders += 1; window.__ts.options = Object.keys(o).join(','); " +
  "window.__ts.retry = o.retry; this._go(); return 'w1'; }, " +
  "reset() { window.__ts.resets += 1; this._go(); }, remove() {} };";

// The API mock: the live contract of /translate checked on every call.
function mockLive(state, opts = {}) {
  return async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/api/v1/", "");
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const reply = (status, obj) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(obj) });
    state.calls.push({ path, body });
    if (path === "status") return reply(200, { ok: true, model: "m", budget_left_today: 1, month_spent_usd: 0 });
    if (path === "session") {
      if (!body || body.turnstile !== "XXXX.DUMMY.TOKEN.XXXX") state.violations.push("session without the token");
      return reply(200, { session: "S1", expires_s: 3600, quota: { segments_left_today: 1500 } });
    }
    if (path === "classify") {
      if (body.session !== "S1" || typeof body.text !== "string") state.violations.push("classify body");
      return reply(200, { packs: [{ id: "pathology", name: "Giai phau benh", version: "0.2.0", score: 0.3 }],
        setup: { packs: [{ id: "pathology", version: "0.2.0" }], hits: ["margin"] }, setup_id: "x".repeat(64) });
    }
    if (path === "translate") {
      const keys = Object.keys(body).sort().join(",");
      if (keys !== "job_id,profile,segments,session,setup") state.violations.push("translate fields: " + keys);
      if (body.profile !== "live") state.violations.push("profile " + body.profile);
      if (!/^live-[A-Za-z0-9_-]{22}$/.test(body.job_id)) state.violations.push("job_id " + body.job_id);
      if (state.job && state.job !== body.job_id) state.violations.push("job_id changed");
      state.job = body.job_id;
      if (!Array.isArray(body.setup.hits) || body.setup.hits.length) state.violations.push("setup hits sent");
      if (!Array.isArray(body.segments) || body.segments.length < 1 || body.segments.length > 3) {
        state.violations.push("segments " + (body.segments || []).length);
      }
      for (const s of body.segments) {
        const k = Object.keys(s).filter((x) => !["id", "tagged", "prev"].includes(x));
        if (k.length) state.violations.push("segment fields " + k.join(","));
        state.sent.push(s);
      }
      if (opts.translateStatus) return reply(opts.translateStatus, { code: opts.code, message: "x" });
      const fixOf = (s) => (opts.repairs || {})[s.tagged] || { en_fixed: s.tagged, repairs: [] };
      return reply(200, { results: body.segments.map((s) => ({ id: s.id, text: "VI " + fixOf(s).en_fixed, level: 0,
        flags: [], ms: 400, ...fixOf(s) })), usage: { calls: 1 }, quota: { segments_left_today: 1400 },
      live: { minutes_left_today: 239 } });
    }
    return reply(404, { code: "not_found" });
  };
}

async function newPage(scenario, ctxOpts = {}, extraInit = "") {
  const context = await browser.newContext({ acceptDownloads: true, ...ctxOpts });
  const state = { calls: [], violations: [], sent: [], errors: [], csp: [], helper: [], job: null };
  await context.addInitScript(fakeSpeechScript(scenario.speech || SPEECH));
  if (extraInit) await context.addInitScript(extraInit);
  await context.addInitScript(`document.addEventListener("securitypolicyviolation", (e) =>
    (window.__csp = window.__csp || []).push(e.violatedDirective + " " + e.blockedURI));`);
  await context.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ status: 200,
    contentType: "application/javascript", body: TURNSTILE_FAKE }));
  await context.route(server.origin + "/api/v1/**", mockLive(state, scenario.api || {}));
  const page = await context.newPage();
  page.on("pageerror", (e) => state.errors.push(String(e && e.message)));
  page.on("console", (m) => { if (m.type() === "error") state.errors.push("console: " + m.text()); });
  return { context, page, state };
}

// the shell menu's Song ngữ (web/settings.js): open, tick or untick, close
async function bilingualSwitch(page, on) {
  await page.click("#menu-btn");
  if (on) await page.check("#menu-bilingual"); else await page.uncheck("#menu-bilingual");
  await page.keyboard.press("Escape");
}

async function consent(page) {
  await page.waitForSelector("#live-consent[open]", { timeout: 5000 });
  await page.check("#live-agree");
  await page.click("#live-consent-ok");
  await page.waitForFunction(() => !document.getElementById("live-consent").open);
}

// the old address: the shell on the "Dịch đuổi" tab, its module loaded (its first render replaced the empty line)
async function openLive(page) {
  await page.goto(server.origin + "/live/");
  await page.waitForFunction(() => location.hash === "#dich-duoi" && !document.getElementById("live-stage-empty"), null,
    { timeout: 10000 });
  return page.evaluate(() => ({ tab: document.getElementById("tab-live").getAttribute("aria-selected"),
    mainConsent: document.getElementById("consent").open }));
}

const stageText = (page) => page.evaluate(() => [...document.querySelectorAll("#live-lines .line")].map((l) => ({
  vi: l.querySelector(".vi").textContent, en: l.querySelector(".en").textContent, cls: l.className,
  viPx: parseFloat(getComputedStyle(l.querySelector(".vi")).fontSize),
  enPx: parseFloat(getComputedStyle(l.querySelector(".en")).fontSize),
  enShown: getComputedStyle(l.querySelector(".en")).display !== "none" })));

const transcriptEnShown = (page) => page.evaluate(() => [...document.querySelectorAll("#live-transcript li .en")]
  .some((e) => getComputedStyle(e).display !== "none"));

async function readDownload(page, button) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(button)]);
  const p = join(out, dl.suggestedFilename());
  await dl.saveAs(p);
  return { name: dl.suggestedFilename(), bytes: readFileSync(p) };
}

function check(r, cond, what) {
  r.checks.push((cond ? "ok   " : "FAIL ") + what);
  if (!cond) r.ok = false;
}

async function scenarioMic() {
  const r = { name: "mic", ok: true, checks: [] };
  const { context, page, state } = await newPage({});
  const opened = await openLive(page);
  check(r, opened.tab === "true" && !opened.mainConsent, "/live/ opens the tab, without the main page's consent");
  await consent(page);
  check(r, await page.isVisible("#live-stop") && await page.evaluate(() => window.__starts >= 1),
    "agreeing started the session at once (no second tap)");
  check(r, await page.isVisible("#live-src-helper") === true, "Windows: the helper source is offered");
  await page.waitForFunction(() => document.querySelector("#live-lines .draft"), null, { timeout: 8000 });
  const draft = await page.$eval("#live-lines .draft", (d) => ({ text: d.textContent, color: getComputedStyle(d).color }));
  check(r, draft.text.length > 0, "the sentence being spoken shows faded: " + ascii(draft.text));
  await page.waitForFunction(() => [...document.querySelectorAll("#live-transcript li .vi")].filter((v) =>
    v.textContent.startsWith("VI ")).length >= 5, null, { timeout: 20000 });
  const lines = await stageText(page);
  check(r, lines.length === 2, "the stage shows 2 sentences: " + lines.length);
  check(r, lines.every((l) => l.vi.startsWith("VI ") && !l.enShown), "Vietnamese only on the stage by default");
  check(r, !(await page.isChecked("#menu-bilingual")) && !(await page.$("#live-show-en")),
    "Song ngu is in the menu, off (no switch on the stage any more)");
  check(r, !(await transcriptEnShown(page)), "the transcript list: Vietnamese only too");
  await bilingualSwitch(page, true);
  const both = await stageText(page);
  check(r, both.every((l) => l.vi.startsWith("VI ") && l.enShown), "Song ngu: Vietnamese + English on the stage");
  check(r, await transcriptEnShown(page), "Song ngu: English in the transcript list");
  check(r, both.every((l) => l.viPx >= 1.6 * l.enPx), "Vietnamese large, English small: " +
    both.map((l) => l.viPx + "/" + l.enPx).join(" "));
  check(r, await page.evaluate(() => localStorage.getItem("vitranslate-live-en-v1")) === "on", "the choice is kept");
  check(r, lines[0].cls.includes("prev") && !lines[1].cls.includes("prev"), "the older line is dimmed");
  const sentTexts = state.sent.map((s) => s.tagged);
  check(r, JSON.stringify(sentTexts.slice(0, 5)) === JSON.stringify(SPOKEN), "committed sentences: " +
    ascii(JSON.stringify(sentTexts)));
  check(r, state.sent.slice(1).every((s) => typeof s.prev === "string" && s.prev.length > 0), "prev context sent");
  check(r, state.sent[0].prev === undefined, "no prev for the first sentence");
  const starts = await page.evaluate(() => window.__starts);
  check(r, starts >= 2, "the recognizer was started again after it ended: " + starts);
  await bilingualSwitch(page, false);
  check(r, (await stageText(page)).every((l) => !l.enShown), "the switch hides the English again");
  await page.screenshot({ path: join(out, "mic.png"), fullPage: true });
  await page.click("#live-fullscreen");
  await page.waitForTimeout(400);
  const fs = await page.evaluate(() => (document.fullscreenElement && document.fullscreenElement.id) ||
    (document.getElementById("live-stage").classList.contains("focus") ? "focus" : ""));
  check(r, fs === "live-stage" || fs === "focus", "full screen: " + fs);
  await page.screenshot({ path: join(out, "mic_fullscreen.png") });
  if (fs === "live-stage") await page.evaluate(() => document.exitFullscreen());
  else await page.click("#live-fullscreen");
  await page.waitForTimeout(300);
  r.pip_button = await page.isVisible("#live-pip");
  await page.click("#live-stop");
  const clearAt = await page.textContent("#live-clear-at");
  check(r, /Sẽ tự xóa lúc \d\d:\d\d/.test(clearAt), "stop: the clearing time is shown");
  const items = await page.$$eval("#live-transcript li", (lis) => lis.length);
  check(r, items >= 6, "the transcript lists every sentence: " + items);
  const txt = await readDownload(page, "#live-dl-txt");
  const t = txt.bytes.toString("utf8");
  check(r, /\.txt$/.test(txt.name) && t.includes("VI The margin is clear.") && t.includes("EN: The margin is clear."),
    "TXT export");
  const srt = await readDownload(page, "#live-dl-srt");
  check(r, /\.srt$/.test(srt.name) && /00:00:\d\d,\d{3} --> /.test(srt.bytes.toString("utf8")), "SRT export");
  const docx = await readDownload(page, "#live-dl-docx");
  check(r, /\.docx$/.test(docx.name) && docx.bytes[0] === 0x50 && docx.bytes[1] === 0x4b && docx.bytes.length > 1000,
    "DOCX export (" + docx.bytes.length + " bytes)");
  await page.click("#live-clear");
  check(r, (await page.$$eval("#live-transcript li", (lis) => lis.length)) === 0, "Xoa ban ghi empties the list");
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors;
  r.requests = state.calls.map((c) => c.path).reduce((m, p) => ((m[p] = (m[p] || 0) + 1), m), {});
  await context.close();
  return r;
}

const SNAPS = ["Welcome", "Welcome to the", "Welcome to the slide seminar.", "Welcome to the slide seminar. Today",
  "Welcome to the slide seminar. Today we discuss liver biopsies.",
  "to the slide seminar. Today we discuss liver biopsies. The first",
  "Today we discuss liver biopsies. The first one shows steatosis."];

// the helper on 127.0.0.1: 47831 refuses, 47832 answers (every port refuses while gate.down)
async function routeHelper(context, state, gate = { down: false }) {
  for (const port of [47831, 47832, 47833, 47834, 47835]) {
    await context.route("http://127.0.0.1:" + port + "/api/live/**", async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      state.helper.push(port + " " + req.method() + " " + path + " " + (req.postData() || ""));
      if (port === 47831 || gate.down) return route.abort("connectionrefused");
      const cors = { "Access-Control-Allow-Origin": server.origin };
      if (path === "/api/live/stream") {
        const body = "retry: 600000\n\n" + SNAPS.map((text, i) => "data: " + JSON.stringify({ t: i * 300,
          source: "windows", text, seq: i + 1 }) + "\n\n").join("") + SNAPS.slice(-1).map((text) => "data: " +
          JSON.stringify({ t: 9000, source: "windows", text: text + " ", seq: 99 }) + "\n\n").join("");
        return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "text/event-stream" }, body });
      }
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{\"ok\":true}" });
    });
  }
}

const PRESET_HELPER = `localStorage.setItem("vitranslate-live-consent-v1", "yes");
  localStorage.setItem("vitranslate-live-source-v1", "helper");`;

async function scenarioHelper() {
  const r = { name: "helper", ok: true, checks: [] };
  const { context, page, state } = await newPage({}, {}, `localStorage.setItem("vitranslate-live-consent-v1", "yes");`);
  await routeHelper(context, state);
  await openLive(page);
  check(r, !state.helper.length, "the microphone source: nothing starts by itself");
  await page.click("#live-src-helper");
  check(r, await page.isVisible("#live-helper-box"), "the helper source shows its options");
  await page.click("#live-start");
  await page.waitForFunction(() => [...document.querySelectorAll("#live-transcript li .vi")].filter((v) =>
    v.textContent.startsWith("VI ")).length >= 3, null, { timeout: 15000 });
  const sent = state.sent.map((s) => s.tagged);
  check(r, JSON.stringify(sent) === JSON.stringify(["Welcome to the slide seminar.", "Today we discuss liver biopsies.",
    "The first one shows steatosis."]), "rolling captions -> 3 sentences: " + ascii(JSON.stringify(sent)));
  check(r, state.helper[0] === "47831 POST /api/live/start {\"source\":\"auto\",\"hide\":true}" &&
    state.helper.some((h) => h.startsWith("47832 POST /api/live/start")) &&
    state.helper.some((h) => h.startsWith("47832 GET /api/live/stream")), "start on the first port that answers");
  await page.click("#live-stop");
  await page.waitForTimeout(300);
  check(r, state.helper.some((h) => h.startsWith("47832 POST /api/live/stop")), "stop tells the helper");
  await page.screenshot({ path: join(out, "helper.png"), fullPage: true });
  r.helper = state.helper.map(ascii);
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));  // the first port refuses, on purpose
  await context.close();
  return r;
}

const translated = (page, n) => page.waitForFunction((k) => [...document.querySelectorAll("#live-transcript li .vi")]
  .filter((v) => v.textContent.startsWith("VI ")).length >= k, n, { timeout: 15000 });

async function scenarioAuto() {
  const r = { name: "auto", ok: true, checks: [] };
  const { context, page, state } = await newPage({}, {}, PRESET_HELPER);
  await routeHelper(context, state);
  await openLive(page);
  await translated(page, 3);
  check(r, state.helper.some((h) => h === "47832 POST /api/live/start {\"source\":\"auto\",\"hide\":true}"),
    "started by itself, hide: true");
  check(r, await page.isVisible("#live-stop") && !(await page.isVisible("#live-start")), "running: Dung shown");
  check(r, (await stageText(page)).every((l) => !l.enShown), "Vietnamese only");
  await page.click("#tab-text");
  await page.waitForTimeout(400);
  check(r, state.helper.some((h) => h.startsWith("47832 POST /api/live/stop")), "another tab stops the session");
  const starts = state.helper.filter((h) => h.includes("/api/live/start")).length;
  await page.click("#tab-live");
  await page.waitForFunction(() => !document.getElementById("live-stop").hidden, null, { timeout: 8000 });
  check(r, state.helper.filter((h) => h.includes("/api/live/start")).length > starts, "back on the tab: started again");
  await page.screenshot({ path: join(out, "auto.png"), fullPage: true });
  r.helper = state.helper.map(ascii);
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  await context.close();
  return r;
}

async function scenarioNoHelper() {
  const r = { name: "nohelper", ok: true, checks: [] };
  const { context, page, state } = await newPage({}, {}, PRESET_HELPER);
  const gate = { down: true };
  await routeHelper(context, state, gate);
  await openLive(page);
  await page.waitForFunction(() => !document.getElementById("live-open-helper").hidden, null, { timeout: 8000 });
  const msg = await page.textContent("#live-status");
  check(r, /ViTranslate/.test(msg) && (await page.textContent("#live-open-helper")) === "Mở ViTranslate",
    "no helper: the message and the Mo ViTranslate button: " + ascii(msg));
  check(r, await page.isVisible("#live-stop"), "still trying (Dung shown)");
  await page.screenshot({ path: join(out, "nohelper.png"), fullPage: true });
  await page.waitForTimeout(3000);
  const tries = state.helper.filter((h) => h.startsWith("47832 POST /api/live/start")).length;
  check(r, tries >= 2, "asked again every 2 s: " + tries);
  gate.down = false;
  await translated(page, 3);
  check(r, await page.isHidden("#live-open-helper"), "found: the button goes away");
  await page.click("#live-stop");
  r.helper = state.helper.length;
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  await context.close();
  return r;
}

async function scenarioQuota() {
  const r = { name: "quota", ok: true, checks: [] };
  const { context, page, state } = await newPage({ api: { translateStatus: 429, code: "live_time_exceeded" } }, {},
    `localStorage.setItem("vitranslate-live-consent-v1", "yes");`);
  await openLive(page);
  await page.click("#live-start");
  await page.waitForFunction(() => /4 giờ/.test(document.getElementById("live-status").textContent), null, { timeout: 15000 });
  const lines = await stageText(page);
  check(r, lines.length >= 1 && lines.every((l) => l.en.length > 0), "the English is still shown");
  check(r, lines.some((l) => l.vi === "(chưa dịch)"), "the sentence is marked untranslated");
  const nTranslate = state.calls.filter((c) => c.path === "translate").length;
  await page.waitForTimeout(1500);
  check(r, state.calls.filter((c) => c.path === "translate").length === nTranslate, "no more requests after the stop code");
  await page.screenshot({ path: join(out, "quota.png"), fullPage: true });
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors.filter((e) => !/429/.test(e));
  await context.close();
  return r;
}

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) " +
  "Version/26.0 Mobile/15E148 Safari/604.1";
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: IPHONE_UA };

async function scenarioIphone1() {
  const r = { name: "iphone1", ok: true, checks: [] };
  const { context, page, state } = await newPage({}, PHONE, "delete window.documentPictureInPicture;");
  await openLive(page);
  check(r, !(await page.isVisible("#live-src-helper")), "no helper source on iPhone");
  await consent(page);  // the one tap: agree + Tiep tuc
  check(r, await page.evaluate(() => window.__starts) === 1, "the recognizer started inside the agree tap");
  await page.waitForFunction(() => [...document.querySelectorAll("#live-lines .line .vi")].filter((v) =>
    v.textContent.startsWith("VI ")).length >= 2, null, { timeout: 20000 });
  check(r, true, "the translation runs by itself");
  await page.screenshot({ path: join(out, "iphone1.png"), fullPage: true });
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors;
  await context.close();
  return r;
}

async function scenarioIpad() {
  const r = { name: "ipad", ok: true, checks: [] };
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 " +
    "Safari/605.1.15";
  const { context, page, state } = await newPage({}, { viewport: { width: 820, height: 1180 }, hasTouch: true,
    userAgent: ua }, `Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
    localStorage.setItem("vitranslate-live-consent-v1", "yes"); localStorage.setItem("vitranslate-live-source-v1", "helper");`);
  await openLive(page);
  check(r, await page.evaluate(() => navigator.maxTouchPoints) === 5, "touch points 5 (iPadOS)");
  check(r, !(await page.isVisible("#live-src-helper")), "no helper source on iPadOS");
  check(r, await page.getAttribute("#live-src-mic", "aria-pressed") === "true", "the microphone is the source");
  check(r, await page.isVisible("#live-start"), "nothing started by itself (the microphone needs a tap)");
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors;
  await context.close();
  return r;
}

async function scenarioIphone() {
  const r = { name: "iphone", ok: true, checks: [] };
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) " +
    "Version/26.0 Mobile/15E148 Safari/604.1";
  const noFs = `delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;
    for (const k of ["fullscreenEnabled", "webkitFullscreenEnabled"]) Object.defineProperty(Document.prototype, k,
      { get: () => false, configurable: true });
    delete window.documentPictureInPicture; // Safari has none
    localStorage.setItem("vitranslate-live-consent-v1", "yes");`;
  const { context, page, state } = await newPage({}, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, userAgent: ua }, noFs);
  await openLive(page);
  check(r, !(await page.isVisible("#live-src-helper")), "no helper source on iPhone");
  check(r, !(await page.isVisible("#live-pip")), "no floating window on iPhone");
  await page.click("#live-start");
  await page.waitForFunction(() => [...document.querySelectorAll("#live-lines .line .vi")].filter((v) =>
    v.textContent.startsWith("VI ")).length >= 2, null, { timeout: 20000 });
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth,
    stage: document.getElementById("live-stage").getBoundingClientRect().toJSON() }));
  check(r, m.sw <= m.w, "no horizontal scroll: " + m.sw + " <= " + m.w);
  check(r, m.stage.width <= 390 && m.stage.height >= 300, "the stage fits and is tall: " + Math.round(m.stage.width) +
    " x " + Math.round(m.stage.height));
  await page.screenshot({ path: join(out, "iphone.png"), fullPage: true });
  await page.click("#live-fullscreen");
  const focus = await page.evaluate(() => ({ cls: document.getElementById("live-stage").classList.contains("focus"),
    rect: document.getElementById("live-stage").getBoundingClientRect().toJSON() }));
  check(r, focus.cls && Math.round(focus.rect.width) === 390 && Math.round(focus.rect.height) === 844,
    "full screen falls back to the focus view filling the screen");
  await page.screenshot({ path: join(out, "iphone_focus.png") });
  await page.click("#live-fullscreen");
  check(r, !(await page.evaluate(() => document.getElementById("live-stage").classList.contains("focus"))), "and back");
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors;
  await context.close();
  return r;
}

const sessions = (state) => state.calls.filter((c) => c.path === "session").length;

async function scenarioCheck() {
  const r = { name: "check", ok: true, checks: [] };
  const { context, page, state } = await newPage({}, {}, PRESET_HELPER + `window.__tsPlan = { fail: ["600010"] };`);
  await routeHelper(context, state);
  await openLive(page);
  await page.waitForSelector("#live-turnstile-box .turnstile-note button", { timeout: 8000 });
  await page.waitForTimeout(2500);
  const ts = await page.evaluate(() => window.__ts);
  check(r, ts.retry === "never" && /refresh-expired/.test(ts.options) && /before-interactive-callback/.test(ts.options),
    "rendered with retry never, refresh-expired, before-interactive: " + ascii(ts.options));
  check(r, ts.renders === 1 && ts.resets === 0, "no retry by itself: " + JSON.stringify(ts));
  check(r, !state.helper.some((h) => h.includes("/api/live/start")), "the helper never started (no Live Captions)");
  check(r, sessions(state) === 0, "no session");
  const note = await page.textContent("#live-turnstile-box .turnstile-note");
  check(r, /600010/.test(note) && /Thử lại/.test(note), "the code and Thu lai in the box: " + ascii(note));
  check(r, /Turnstile/.test(await page.textContent("#live-status")), "the status says why: " +
    ascii(await page.textContent("#live-status")));
  await page.screenshot({ path: join(out, "check_failed.png"), fullPage: true });
  await page.click("#live-turnstile-box .turnstile-note button");
  await translated(page, 3);
  const ts2 = await page.evaluate(() => window.__ts);
  check(r, ts2.resets === 1 && sessions(state) === 1, "one click: one reset, one session: " + JSON.stringify(ts2));
  check(r, state.helper.some((h) => h.includes("/api/live/start")), "then the helper started by itself");
  check(r, !(await page.isVisible("#live-turnstile-box .turnstile-note")), "the note is gone");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("vitranslate-session-v1") || "null"));
  check(r, stored && stored.token === "S1" && stored.expiresAt > Date.now(), "the session is kept in localStorage");
  state.job = null;  // a new page load is a new live job (its own id)
  await page.reload();
  await page.waitForFunction(() => location.hash === "#dich-duoi" && !document.getElementById("live-stop").hidden, null,
    { timeout: 10000 });
  await translated(page, 3);
  const ts3 = await page.evaluate(() => window.__ts || { renders: 0 });  // no check: the script is not even loaded
  check(r, sessions(state) === 1 && ts3.renders === 0, "a reload reuses the session: no new check, " + sessions(state) +
    " session call(s)");
  await page.click("#live-stop");
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  await context.close();
  return r;
}

async function scenarioWait() {
  const r = { name: "wait", ok: true, checks: [] };
  const { context, page, state } = await newPage({}, {}, `localStorage.setItem("vitranslate-live-consent-v1", "yes");
    window.__tsPlan = { interactiveMs: 3000 };`);
  await openLive(page);
  await page.click("#live-start");
  await page.waitForFunction(() => /ô xác minh/.test(document.getElementById("live-status").textContent), null,
    { timeout: 3000 });
  check(r, await page.evaluate(() => window.__starts >= 1), "the microphone started in the tap, before the session");
  r.prompt = ascii(await page.textContent("#live-status"));  // the status asked for the checkbox (waited for above)
  await page.waitForTimeout(1500);
  check(r, !state.calls.some((c) => c.path === "translate") && sessions(state) === 0,
    "nothing sent before the session (sentences said: " + await page.evaluate(() =>
      document.querySelectorAll("#live-transcript li").length) + ")");
  await translated(page, 4);
  const first = state.calls.findIndex((c) => c.path === "translate");
  check(r, state.calls.findIndex((c) => c.path === "session") < first, "the session before the first translation");
  const vi = await page.evaluate(() => [...document.querySelectorAll("#live-transcript li .vi")].map((v) => v.textContent));
  check(r, !vi.some((t) => /chưa dịch/.test(t)), "no sentence marked chua dich: " + ascii(JSON.stringify(vi)));
  check(r, !/ô xác minh/.test(await page.textContent("#live-status")), "the line goes once the check is done");
  await page.click("#live-stop");
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors;
  await context.close();
  return r;
}

// a mis-heard term (synthetic): the host's term repair answers en_fixed and repairs for it
const REPAIR_SPEECH = [
  [300, [["The puppy thyroid carcinoma was small.", true]]],
  [300, [["The puppy thyroid carcinoma was small.", true], [" Any questions?", true]]],
  [300, [["The puppy thyroid carcinoma was small.", true], [" Any questions?", true], [" Thank", false]]],
];
const MISHEARD = "The puppy thyroid carcinoma was small.";
const REPAIRED = "The papillary thyroid carcinoma was small.";

async function scenarioRepair() {
  const r = { name: "repair", ok: true, checks: [] };
  const api = { repairs: { [MISHEARD]: { en_fixed: REPAIRED, repairs: [{ from: "puppy thyroid carcinoma",
    to: "papillary thyroid carcinoma" }] } } };
  const { context, page, state } = await newPage({ speech: REPAIR_SPEECH, api }, {},
    `localStorage.setItem("vitranslate-live-consent-v1", "yes");`);
  await openLive(page);
  await page.click("#live-start");
  await page.waitForFunction(() => [...document.querySelectorAll("#live-transcript li .vi")].filter((v) =>
    v.textContent.startsWith("VI ")).length >= 2, null, { timeout: 15000 });
  check(r, state.sent[0] && state.sent[0].tagged === MISHEARD, "the heard English is what is sent");
  const viOnly = await stageText(page);
  check(r, viOnly.every((l) => !l.enShown) && viOnly[0].vi === "VI " + REPAIRED, "Vietnamese only: unchanged");
  await bilingualSwitch(page, true);
  const fixedOf = (sel) => page.$$eval(sel, (els) => els.map((s) => ({ text: s.textContent, title: s.title,
    line: getComputedStyle(s).textDecorationLine, en: s.closest(".en").textContent })));
  const stage = await fixedOf("#live-lines .en .fixed");
  check(r, stage.length === 1 && stage[0].text === "papillary thyroid carcinoma" && stage[0].en === REPAIRED,
    "Song ngu: the stage shows the repaired English: " + ascii(JSON.stringify(stage)));
  check(r, stage[0] && stage[0].title === "Nghe được: puppy thyroid carcinoma" && /underline/.test(stage[0].line),
    "the repaired term is underlined, the words heard in its title");
  const list = await fixedOf("#live-transcript li .en .fixed");
  check(r, list.length === 1 && list[0].en === REPAIRED, "the transcript list shows the repaired English too");
  const plainEn = await page.$$eval("#live-transcript li .en", (els) => els.map((e) => e.textContent));
  check(r, plainEn.includes("Any questions?") && !plainEn.some((t) => t.includes("puppy")),
    "other sentences unchanged, the heard words only in the title: " + ascii(JSON.stringify(plainEn)));
  await page.screenshot({ path: join(out, "repair.png"), fullPage: true });
  await page.click("#live-stop");
  const txt = (await readDownload(page, "#live-dl-txt")).bytes.toString("utf8");
  check(r, txt.includes("EN: " + REPAIRED) && !txt.includes("puppy"), "TXT export: the repaired English");
  const srt = (await readDownload(page, "#live-dl-srt")).bytes.toString("utf8");
  check(r, srt.includes(REPAIRED) && !srt.includes("puppy"), "SRT export: the repaired English");
  const docx = await readDownload(page, "#live-dl-docx");
  check(r, docx.bytes[0] === 0x50 && docx.bytes.length > 1000, "DOCX export (" + docx.bytes.length + " bytes)");
  await bilingualSwitch(page, false);
  r.csp = await page.evaluate(() => window.__csp || []);
  r.violations = state.violations;
  r.errors = state.errors;
  await context.close();
  return r;
}

// Trên máy (the menu): the sentences go to the helper on 127.0.0.1 only; no helper -> "Mở ViTranslate", then the run
// starts by itself once it answers
async function scenarioLocal() {
  const r = { name: "local", ok: true, checks: [] };
  const seed = `localStorage.setItem("vitranslate-engine-v1", "local"); localStorage.setItem("vitranslate-live-consent-v1", "yes");`;
  const fake = fakeHelper();
  const { context, page, state } = await newPage({}, {}, seed);
  const local = [];
  await context.route(/^http:\/\/(127\.0\.0\.1|localhost):4783[1-5]\//, (route) => {
    local.push(new URL(route.request().url()).pathname);
    return fake.handler(route);
  });
  await openLive(page);
  const speed = await page.waitForFunction(() => {
    const el = document.getElementById("live-speed");
    return el && !el.hidden ? el.textContent : "";
  }, null, { timeout: 10000 }).then((h) => h.jsonValue(), () => "");
  check(r, speed === "Trên máy (GPU): khoảng dưới 1 giây mỗi câu.", "the helper's speed before Bat dau: " + ascii(speed));
  await page.click("#live-start");
  await page.waitForFunction(() => [...document.querySelectorAll("#live-transcript li .vi")].filter((v) =>
    v.textContent.startsWith("VI ")).length >= 5, null, { timeout: 20000 }).catch(() => null);
  const vi = await page.$$eval("#live-transcript li .vi", (els) => els.map((e) => e.textContent));
  check(r, vi.filter((t) => t.startsWith("VI ")).length >= 5, "the sentences translated on the machine: " + vi.length);
  const tr = fake.st.calls.filter((c) => c.path === "translate");
  check(r, tr.length >= 3 && tr.every((c) => c.profile === "live" && !c.keys.includes("session")),
    "every sentence to the helper, profile live, no session: " + tr.length + " call(s)");
  check(r, state.calls.length === 0, "not one call to the site's /api/v1: " + state.calls.map((c) => c.path).join(","));
  check(r, await page.evaluate(() => !window.__ts || window.__ts.renders === 0), "no Turnstile check on Tren may");
  await bilingualSwitch(page, true);
  check(r, (await stageText(page)).every((l) => l.enShown), "Song ngu from the menu reaches the stage");
  await bilingualSwitch(page, false);
  const log = await page.evaluate(() => localStorage.getItem("vitranslate-log-v1") || "");
  check(r, log.includes("Dịch đuổi · trên máy · translate"), "the log names the tool and the engine");
  check(r, !SPOKEN.some((w) => log.includes(w.replace(/[.?]$/, ""))) && !/margin|deposit/i.test(log), "the log holds no caption text");
  // Máy chủ chosen while running: the run stops (its engine was chosen at Bắt đầu)
  await page.click("#menu-btn");
  await page.check('#menu input[name="engine"][value="cloud"]');
  await page.keyboard.press("Escape");
  check(r, await page.isVisible("#live-start") && !(await page.isVisible("#live-speed")), "another engine stops the run");
  r.violations = state.violations.concat(fake.st.violations);
  r.errors = state.errors;
  r.csp = await page.evaluate(() => window.__csp || []);
  await context.close();

  // no helper yet: the code and "Mở ViTranslate"; the helper answers later and the run starts by itself
  const late = fakeHelper();
  let up = false;
  const b = await newPage({}, {}, seed);
  await b.context.route(/^http:\/\/(127\.0\.0\.1|localhost):4783[1-5]\//, (route) => (up ? late.handler(route) : route.abort()));
  await openLive(b.page);
  await b.page.click("#live-start");
  await b.page.waitForFunction(() => !document.getElementById("live-open-helper").hidden, null, { timeout: 10000 })
    .catch(() => null);
  const status = await b.page.textContent("#live-status");
  check(r, /Chưa thấy ViTranslate/.test(status) && await b.page.isVisible("#live-open-helper"),
    "no helper: the message and Mo ViTranslate: " + ascii(status));
  check(r, b.state.calls.length === 0, "no helper: nothing to the cloud instead");
  await b.page.evaluate(() => { window.__stopped = false; window.__step = 0; });  // the fake recognizer speaks again
  await b.page.click("#live-open-helper");
  up = true;
  const started = await b.page.waitForFunction(() => !document.getElementById("live-stop").hidden, null,
    { timeout: 8000 }).then(() => true, () => false);
  check(r, started, "the helper answered: the run started by itself");
  await b.page.waitForFunction(() => [...document.querySelectorAll("#live-transcript li .vi")].some((v) =>
    v.textContent.startsWith("VI ")), null, { timeout: 15000 }).catch(() => null);
  check(r, late.st.calls.some((c) => c.path === "translate"), "then the sentences went to the helper");
  r.violations = r.violations.concat(b.state.violations, late.st.violations);
  // the refused 127.0.0.1 requests (no helper yet) and the unregistered vitranslate:// are expected here
  r.errors = r.errors.concat(b.state.errors.filter((e) => !/Failed to load resource|vitranslate:\/\/start/.test(e)));
  await b.context.close();
  return r;
}


const RUN = { mic: scenarioMic, helper: scenarioHelper, auto: scenarioAuto, nohelper: scenarioNoHelper,
  quota: scenarioQuota, iphone1: scenarioIphone1, ipad: scenarioIpad, iphone: scenarioIphone, check: scenarioCheck,
  wait: scenarioWait, repair: scenarioRepair, local: scenarioLocal };
let failed = false;
for (const name of only) {
  let r;
  try {
    r = await RUN[name]();
  } catch (e) {
    r = { name, ok: false, checks: ["FAIL " + ascii(e && e.message ? e.message.split("\n")[0] : e)] };
  }
  if ((r.csp && r.csp.length) || (r.violations && r.violations.length) || (r.errors && r.errors.length)) r.ok = false;
  summary.scenarios.push(r);
  console.log((r.ok ? "PASS " : "FAIL ") + name);
  for (const c of r.checks) console.log("  " + ascii(c));
  for (const k of ["csp", "violations", "errors"]) if (r[k] && r[k].length) console.log("  " + k + ": " + ascii(JSON.stringify(r[k])));
  if (!r.ok) failed = true;
}
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 1), "utf8");
await browser.close();
await server.close();
console.log(failed ? "FAILED" : "ALL PASS");
process.exit(failed ? 1 : 0);
