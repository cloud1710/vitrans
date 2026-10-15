// The image tool (the shell's "Ảnh" tab, opened through its old address /anh/) end to end in the installed Chrome (playwright-core, channel "chrome"): the site served
// with its _headers (web/engine/tests/site_server.mjs), the cloud API /api/v1/* answered by the scripted mock of the
// page runner (web/engine/tests/mock_api.mjs: translations are "VI " + source; every body checked: contract fields
// only, no image data), Cloudflare Turnstile's real script with the always-pass test key, the real on-device OCR.
// Pictures are synthetic (tests/make_images.js, drawn in Chrome): an English slide, a Vietnamese slide, a picture
// without text, a camera-like 2048 x 1536 JPEG and the slide stored turned with EXIF orientation 6.
// Scenarios (--only):
//   ok     consent at the first visit; the five pictures chosen at once and processed one after another: the English
//          ones read (CER against the drawn text), sent as blocks {id, tagged, essential [], prev, nxt, "Ảnh, dòng n"}
//          (one session, one classify per photo, one job id each), English / Vietnamese pairs shown, the copy button,
//          the translated picture drawn (changed where the text was, unchanged elsewhere), PNG and JPEG downloads of
//          the picture's size; the Vietnamese slide -> "already Vietnamese", the blank one -> "no text", neither sent;
//          the turned JPEG is read upright; the OCR time of the 2048 px photo
//   poster the ALL-CAPS conference poster through the real server engine (functions/_lib/engine.js, the deploy pack
//          bundle) with a scripted model: classify with profile photo picks the pathology pack, every line translated
//          (caps restored, the date with an en dash), the model never gets ALL-CAPS, SINGAPORE kept with its pixels,
//          no pixel changed outside the drawn boxes, the title gold / bold / centred, the date left, the pill centred
//   quota  translate answers 429 quota_exceeded: the card says so in Vietnamese, nothing drawn
// Any CSP violation, page error or contract violation fails the run. ASCII output; JSON + screenshots in <out>.
// Usage: node web/anh/tests/page_anh.mjs [--site <build_site dir>] [--out <dir>] [--headed] [--only ok,vi,poster,quota]
//        [--ocr wasm] (the page with ?ocr=wasm: the WebAssembly reader where Chrome has WebGPU)
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../engine/node_modules/playwright-core/index.mjs";
import { startSiteServer } from "../../engine/tests/site_server.mjs";
import { mockApi } from "../../engine/tests/mock_api.mjs";
import { cer } from "../../ocr/tests/cer.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const site = opt("--site");
const out = resolve(opt("--out", join(WEB, "..", "out", "anh")));
const only = opt("--only", "ok,vi,poster,quota").split(",");
mkdirSync(out, { recursive: true });
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, "?");
const MSG_VI = "Ảnh đã là tiếng Việt, không cần dịch.";
const MSG_EMPTY = "Không thấy chữ trong ảnh.";
const MSG_QUOTA = "Đã hết lượt dịch hôm nay. Hãy thử lại vào ngày mai.";  // no "Dịch trên máy": /anh/ has no such mode
const NOT_IN_VIEW = ["Cloudflare", "Workers AI", "neuron", "A4B", "ONNX", "PaddleOCR", "WASM", "GPU"];

let root = WEB;
const overrides = {};
if (site) {
  root = existsSync(join(site, "web", "index.html")) ? join(site, "web") : site;
  for (const f of readdirSync(HERE)) overrides["/anh/tests/" + f] = join(HERE, f);
  for (const f of readdirSync(join(WEB, "ocr", "tests"))) overrides["/ocr/tests/" + f] = join(WEB, "ocr", "tests", f);
}
const server = await startSiteServer(root, overrides, 0);
const browser = await chromium.launch({ channel: "chrome", headless: !args.includes("--headed") });
const summary = { origin: server.origin, site: site ? resolve(site) : "repo web/", scenarios: [] };

// a JPEG with an EXIF APP1 (orientation) right after its SOI
function withOrientation(jpeg, orientation) {
  const tiff = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const seg = Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]);
  return Buffer.concat([jpeg.subarray(0, 2), seg, jpeg.subarray(2)]);
}

async function makePictures() {
  const page = await browser.newPage();
  await page.goto(server.origin + "/anh/tests/make_images.html");
  await page.waitForFunction(() => typeof window.__make === "function");
  const made = await page.evaluate(() => window.__make());
  await page.close();
  const dir = join(out, "pictures");
  mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [name, { dataUrl, truth }] of Object.entries(made)) {
    let bytes = Buffer.from(dataUrl.split(",")[1], "base64");
    if (name === "turned.jpg") bytes = withOrientation(bytes, 6);
    writeFileSync(join(dir, name), bytes);
    files[name] = { path: join(dir, name), truth };
  }
  return files;
}

function pngSize(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Vietnamese for the slide (the "vi" scenario: what the picture looks like with real, longer Vietnamese)
// The poster scenario's model: the real server engine (functions/_lib/engine.js with the deploy bundle
// functions/_generated/packs.json: pack choice, the core's keep / translate decisions and checks) and a scripted
// model that answers as the real one does (sentence case whatever the source's case); keys are the source in lower
// case. Expected: what the picture and the list show (ALL-CAPS restored; SINGAPORE comes back as it was: kept).
const POSTER_VI = {
  "i am attending asdp 2026": "Tôi tham dự ASDP 2026",
  "singapore": "Singapore",
  "3rd annual congress of asian society of digital pathology":
    "Đại hội thường niên lần thứ 3 của Asian Society of Digital Pathology",
  "intelligence in every pixel: powering next generation pathology":
    "Trí tuệ trong từng pixel: Thúc đẩy giải phẫu bệnh thế hệ mới",
  "1-3 november 2026": "1-3 tháng 11 năm 2026",
  "academia, singapore general hospital": "Academia, Bệnh viện Đa khoa Singapore",
};
const POSTER_EXPECTED = {
  "I AM ATTENDING ASDP 2026": "TÔI THAM DỰ ASDP 2026",
  "SINGAPORE": null,
  "3RD ANNUAL CONGRESS OF ASIAN SOCIETY OF DIGITAL PATHOLOGY": "ĐẠI HỘI THƯỜNG NIÊN LẦN THỨ 3 CỦA ASIAN SOCIETY OF DIGITAL PATHOLOGY",
  "INTELLIGENCE IN EVERY PIXEL: POWERING NEXT GENERATION PATHOLOGY": "TRÍ TUỆ TRONG TỪNG PIXEL: THÚC ĐẨY GIẢI PHẪU BỆNH THẾ HỆ MỚI",
  "1-3 NOVEMBER 2026": "1–3 THÁNG 11 NĂM 2026",
  "ACADEMIA, SINGAPORE GENERAL HOSPITAL": "ACADEMIA, BỆNH VIỆN ĐA KHOA SINGAPORE",
};

async function posterEngine() {
  const bundleFile = join(WEB, "..", "functions", "_generated", "packs.json");
  if (!existsSync(bundleFile)) return null;
  const engine = await import(new URL("../../../functions/_lib/engine.js", import.meta.url).href);
  const set = await engine.packSetOf(JSON.parse(readFileSync(bundleFile, "utf8")));
  const sent = { classify: [], translate: [], model: [] };
  const model = async (messages) => {
    const user = messages[messages.length - 1].content;
    const src = user.slice(user.lastIndexOf("Translate:\n") + "Translate:\n".length);
    sent.model.push(src);
    return POSTER_VI[src.toLowerCase().replace(/\s+/g, " ").trim()] || "VI " + src;
  };
  return {
    sent,
    async classify(body) {
      sent.classify.push(body);
      const r = await engine.classifyDocument(set, body.text, body.domain || [], { photo: body.profile === "photo" });
      return { ...r.event, setup: r.setup, setup_id: r.setupId };
    },
    async translate(body) {
      sent.translate.push(body);
      const setup = await engine.checkSetup(set, body.setup, body.setup_id);
      const results = await engine.translate(set, setup, body.segments, { model, modelKey: "scripted", intervalMs: 0 });
      return { results: results.map((r) => ({ id: r.id, text: r.text, level: r.level, flags: r.flags, cached: false,
        reduced: r.reduced, spans: r.spans })), usage: {} };
    },
  };
}

const SLIDE_VI = {
  "Quarterly Results of the Field Study": "Kết quả hằng quý của nghiên cứu thực địa",
  "Samples were collected from 42 sites in 2024": "Mẫu được thu thập tại 42 địa điểm trong năm 2024",
  "Mean processing time fell by 18% after training": "Thời gian xử lý trung bình giảm 18% sau khi đào tạo",
  "Two reviewers checked every report independently": "Hai người đánh giá kiểm tra độc lập từng báo cáo",
  "Agreement between reviewers reached 0.87 (kappa)": "Mức đồng thuận giữa hai người đánh giá đạt 0,87 (kappa)",
  "Next steps: expand the panel and repeat at 6 months": "Bước tiếp theo: mở rộng nhóm và lặp lại sau 6 tháng",
};

async function newPage(scenario, engine) {
  const context = await browser.newContext({ acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const api = mockApi(scenario === "vi" || scenario === "poster" ? "ok" : scenario);
  await context.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (engine && /\/(classify|translate)$/.test(path)) {
      const body = JSON.parse(req.postData());
      const answer = /classify$/.test(path) ? await engine.classify(body) : await engine.translate(body);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
    }
    if (scenario !== "vi" || !/\/translate$/.test(new URL(req.url()).pathname)) return api.handler(route);
    const body = JSON.parse(req.postData());
    const results = body.segments.map((s) => ({ id: s.id, text: SLIDE_VI[s.tagged] || "VI " + s.tagged, level: 0, flags: [] }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results, usage: {} }) });
  });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile });
    });
  });
  const page = await context.newPage();
  const row = { scenario, problems: [], pageErrors: [], api: api.st };
  page.on("pageerror", (e) => row.pageErrors.push(String(e)));
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) row.problems.push("CSP console: " + m.text()); });
  await page.goto(server.origin + "/anh/" + (opt("--ocr") ? "?ocr=" + opt("--ocr") : ""));
  await page.waitForFunction(() => location.hash === "#anh" && !!document.getElementById("view-anh"), null, { timeout: 10000 })
    .catch(() => null);
  row.consentAtLoad = await page.waitForSelector("#consent[open]", { timeout: 5000 }).then(() => true, () => false);
  if (!row.consentAtLoad) row.problems.push("no consent at the first visit");
  else {
    if (await page.isEnabled("#consent-ok")) row.problems.push("the consent button works without the tick");
    await page.check("#agree");
    await page.click("#consent-ok");
  }
  // the old address opens the shell on the "Ảnh" tab (the query kept)
  const tab = await page.evaluate(() => ({ hash: location.hash, search: location.search,
    selected: document.getElementById("tab-anh").getAttribute("aria-selected"), shown: !document.getElementById("view-anh").hidden }));
  if (tab.hash !== "#anh" || tab.selected !== "true" || !tab.shown) row.problems.push("/anh/ did not open the tab: " + JSON.stringify(tab));
  if (opt("--ocr") && tab.search !== "?ocr=" + opt("--ocr")) row.problems.push("the query was lost: " + tab.search);
  return { context, page, row };
}

async function waitCards(page, n, timeout) {
  await page.waitForFunction((k) => {
    const cards = [...document.querySelectorAll("#view-anh .result")];
    return cards.length >= k && cards.every((c) => c.dataset.state === "done" || c.dataset.state === "error");
  }, n, { timeout });
}

async function finish(p) {
  const csp = await p.page.evaluate(() => window.__csp).catch(() => []);
  for (const v of csp) p.row.problems.push("CSP " + v.directive + " blocked " + v.blocked + " (" + v.source + ")");
  for (const e of p.row.pageErrors) p.row.problems.push("page error " + e);
  for (const v of p.row.api.violations) p.row.problems.push("API contract: " + v);
  const text = await p.page.evaluate(() => document.body.innerText).catch(() => "");
  const words = NOT_IN_VIEW.filter((w) => text.includes(w));
  if (words.length) p.row.problems.push("the page shows " + words.join(", "));
  await p.context.close();
  const { api, ...rest } = p.row;
  summary.scenarios.push(Object.assign(rest, { calls: api.calls.map((c) => c.path) }));
}

try {
  const pictures = await makePictures();
  if (only.includes("ok")) {
    const p = await newPage("ok");
    const { page, row } = p;
    const names = ["slide.png", "vi.png", "blank.png", "photo.jpg", "turned.jpg"];
    await page.setInputFiles("#anh-files", names.map((n) => pictures[n].path));
    await waitCards(page, names.length, 600000);
    const cards = await page.evaluate(() => [...document.querySelectorAll("#view-anh .result")].map((c) => ({
      title: c.querySelector(".result-title").textContent, state: c.dataset.state, verdict: c.dataset.verdict,
      code: c.dataset.code, note: c.querySelector(".result-note").hidden ? "" : c.querySelector(".result-note").textContent,
      ocrMs: Number(c.dataset.ocrMs || 0), totalMs: Number(c.dataset.totalMs || 0), lines: Number(c.dataset.lines || 0),
      backend: c.dataset.backend || "",
      en: [...c.querySelectorAll(".pairs .en")].map((x) => x.textContent),
      vi: [...c.querySelectorAll(".pairs .vi")].map((x) => x.textContent),
      canvas: (() => { const k = c.querySelector("canvas.shot"); return k && !c.querySelector(".result-image").hidden ? [k.width, k.height] : null; })(),
    })));
    row.cards = cards;
    const byName = Object.fromEntries(names.map((n, i) => [n, cards[i]]));
    for (const n of ["slide.png", "photo.jpg", "turned.jpg"]) {
      const c = byName[n];
      if (!c || c.state !== "done" || c.verdict !== "translate") { row.problems.push(n + ": not translated " + JSON.stringify(c)); continue; }
      c.cer = cer(pictures[n].truth, c.en.map((t) => t.replace(/^\S\s/, "")));
      if (c.cer > 0.05) row.problems.push(n + ": CER " + (100 * c.cer).toFixed(1) + " %");
      if (!c.vi.length || !c.vi.every((t) => /^VI /.test(t))) row.problems.push(n + ": Vietnamese pairs missing");
      if (!c.canvas) row.problems.push(n + ": no translated picture");
    }
    if (byName["slide.png"].canvas && byName["slide.png"].canvas.join() !== "1600,900") row.problems.push("slide canvas " + byName["slide.png"].canvas);
    if (byName["turned.jpg"].canvas && byName["turned.jpg"].canvas.join() !== "1600,900") {
      row.problems.push("turned.jpg not upright: " + byName["turned.jpg"].canvas);
    }
    if (byName["vi.png"].note !== MSG_VI) row.problems.push("vi.png: " + JSON.stringify(byName["vi.png"]));
    if (byName["blank.png"].note !== MSG_EMPTY) row.problems.push("blank.png: " + JSON.stringify(byName["blank.png"]));
    // what was sent: one session, a classify per translated photo, blocks with the image's location labels
    const st = row.api;
    const classify = st.calls.filter((c) => c.path === "classify");
    const translate = st.calls.filter((c) => c.path === "translate");
    if (st.sessions.size !== 1) row.problems.push(st.sessions.size + " sessions");
    if (classify.length !== 3) row.problems.push(classify.length + " classify calls (3 photos to translate)");
    const jobs = new Set(translate.map((c) => c.body.job_id));
    if (jobs.size !== 3) row.problems.push(jobs.size + " job ids");
    for (const c of translate) {
      for (const s of c.body.segments) {
        if (!/^Ảnh, dòng \d+$/.test(s.where)) row.problems.push("where " + s.where);
        if (!Array.isArray(s.essential) || s.essential.length) row.problems.push("essential " + JSON.stringify(s.essential));
      }
    }
    const sent = translate.flatMap((c) => c.body.segments.map((s) => s.tagged)).join("\n");
    if (/Kết quả|Ket qua/.test(sent)) row.problems.push("the Vietnamese slide was sent");
    row.sentSegments = translate.reduce((s, c) => s + c.body.segments.length, 0);
    try {
    // copy: the Vietnamese of the first photo in its block order
    const first = page.locator("#view-anh .result").nth(0);
    await first.locator("button.copy").click({ timeout: 5000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    if (!clip.includes("VI " + "Quarterly Results of the Field Study")) row.problems.push("clipboard: " + ascii(clip).slice(0, 120));
    // the drawn picture: changed in the title's region, unchanged in an empty corner
    row.overlay = await page.evaluate(async () => {
      const card = document.querySelector("#view-anh .result");
      const shot = card.querySelector("canvas.shot").getContext("2d").getImageData(0, 0, 1600, 900).data;
      const corner = [shot[(880 * 1600 + 1580) * 4], shot[(880 * 1600 + 1580) * 4 + 1], shot[(880 * 1600 + 1580) * 4 + 2]];
      // the title region: dark pixels of the original title (x 90..1100, y 100..160) vs now
      let dark = 0;
      for (let y = 100; y < 160; y += 2) for (let x = 90; x < 1100; x += 2) if (shot[(y * 1600 + x) * 4] < 100) dark += 1;
      return { corner, titleDark: dark };
    });
    if (row.overlay.corner.join() !== "255,255,255") row.problems.push("overlay changed an empty corner " + row.overlay.corner);
    // downloads: PNG and JPEG of the picture's size
    for (const [btn, ext] of [["button.save-png", "png"], ["button.save-jpg", "jpg"]]) {
      const [dl] = await Promise.all([page.waitForEvent("download"), first.locator(btn).click()]);
      const file = join(out, "slide_vi." + ext);
      await dl.saveAs(file);
      const b = readFileSync(file);
      row["download_" + ext] = { name: dl.suggestedFilename(), bytes: b.length };
      if (dl.suggestedFilename() !== "slide_vi." + ext) row.problems.push("download name " + dl.suggestedFilename());
      if (ext === "png") {
        const s = pngSize(b);
        if (!s || s.w !== 1600 || s.h !== 900) row.problems.push("PNG size " + JSON.stringify(s));
      } else if (b[0] !== 0xff || b[1] !== 0xd8) row.problems.push("JPEG download is not a JPEG");
    }
    await first.screenshot({ path: join(out, "anh_slide_card.png") });
    await page.locator("#view-anh .result").nth(3).locator("canvas.shot").screenshot({ path: join(out, "anh_photo_overlay.png") });
    } catch (e) {
      row.problems.push("interaction: " + String(e).split("\n")[0]);
    }
    row.photoOcrMs = byName["photo.jpg"].ocrMs;
    await finish(p);
  }
  if (only.includes("vi")) {
    // real Vietnamese on the slide and on the photo: pictures for a look (no pixel rule beyond "drawn, no overflow")
    const p = await newPage("vi");
    await p.page.setInputFiles("#anh-files", [pictures["slide.png"].path, pictures["photo.jpg"].path]);
    await waitCards(p.page, 2, 300000);
    const cards = await p.page.evaluate(() => [...document.querySelectorAll("#view-anh .result")].map((c) => ({
      state: c.dataset.state, vi: [...c.querySelectorAll(".pairs .vi")].map((x) => x.textContent),
      overflow: !c.querySelector(".overflow").hidden, sizes: (c.querySelector("canvas.shot").dataset.sizes || "").split(",").map(Number) })));
    console.log("  vi font sizes: " + cards.map((c) => c.sizes.map((x) => x.toFixed(1)).join(" ")).join(" | "));
    // the five bullets were drawn at one size: their Vietnamese shares one size too (within 10 %)
    for (const c of cards) {
      const b = c.sizes.slice(1);
      if (b.length !== 5 || Math.max(...b) > 1.1 * Math.min(...b)) p.row.problems.push("bullet sizes " + c.sizes.join(" "));
    }
    p.row.cards = cards.map((c, i) => Object.assign(c, { title: "vi " + (i + 1) }));
    for (const c of cards) {
      if (c.state !== "done" || !c.vi.some((t) => /Kết quả hằng quý/.test(t))) p.row.problems.push("vi card " + JSON.stringify(c));
      if (c.overflow) p.row.problems.push("vi card overflows");
    }
    await p.page.locator("#view-anh .result").nth(0).locator("canvas.shot").screenshot({ path: join(out, "anh_vi_slide.png") });
    await p.page.locator("#view-anh .result").nth(1).locator("canvas.shot").screenshot({ path: join(out, "anh_vi_photo.png") });
    await finish(p);
  }
  if (only.includes("poster")) {
    // the conference poster: ALL-CAPS lines translated (caps restored), the pack its words name, the original pixels
    // where the text is kept, the drawn blocks in the original's colour, weight and alignment inside their own boxes
    const engine = await posterEngine();
    const p = await newPage("poster", engine);
    const { page, row } = p;
    if (!engine) row.problems.push("no pack bundle: run python tools/bundle_packs.py first (functions/_generated/packs.json)");
    else {
      await page.setInputFiles("#anh-files", [pictures["poster.png"].path]);
      await waitCards(page, 1, 300000);
      const card = await page.evaluate(() => {
        const c = document.querySelector("#view-anh .result");
        const k = c.querySelector("canvas.shot");
        return { state: c.dataset.state, verdict: c.dataset.verdict, code: c.dataset.code || "",
          packs: c.querySelector(".result-packs").textContent,
          pairs: [...c.querySelectorAll(".pairs li")].map((li) => ({ en: li.querySelector(".en").textContent,
            vi: (li.querySelector(".vi") || li.querySelector(".kept")).textContent, kept: !!li.querySelector(".kept"),
            note: li.querySelector(".flags") ? li.querySelector(".flags").textContent : "" })),
          blocks: k.dataset.blocks ? JSON.parse(k.dataset.blocks) : null };
      });
      row.card = card;
      if (card.state !== "done") row.problems.push("poster card " + JSON.stringify(card));
      if (!/Giải phẫu bệnh/.test(card.packs)) row.problems.push("pack line: " + ascii(card.packs));
      if (!engine.sent.classify.length || engine.sent.classify[0].profile !== "photo") row.problems.push("classify without profile photo");
      const near = (a, b) => cer([a], [b]) <= 0.1;
      for (const [en, vi] of Object.entries(POSTER_EXPECTED)) {
        const pair = card.pairs.find((x) => near(en, x.en));
        if (!pair) { row.problems.push("line not read: " + en); continue; }
        if (vi === null ? !pair.kept && !near(pair.vi.toUpperCase(), en) : pair.vi !== vi) {
          row.problems.push("line " + en + " -> " + ascii(pair.vi) + (pair.kept ? " (kept)" : ""));
        }
      }
      row.modelInputs = engine.sent.model;
      if (engine.sent.model.some((s) => /^[^a-z]*[A-Z]{4,}[^a-z]*$/.test(s) && /\s/.test(s))) row.problems.push("ALL-CAPS text sent to the model");
      // the saved PNG, and the pixels: kept blocks and the rest of the picture byte-identical; drawn blocks styled
      const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#view-anh .result").nth(0).locator("button.save-png").click()]);
      await dl.saveAs(join(out, "poster_vi.png"));
      const srcUrl = "data:image/png;base64," + readFileSync(pictures["poster.png"].path).toString("base64");
      row.pixels = await page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const a = ctx.getImageData(0, 0, c.width, c.height).data;
        const shot = document.querySelector("canvas.shot");
        const b = shot.getContext("2d").getImageData(0, 0, shot.width, shot.height).data;
        const blocks = shot.dataset.blocks ? JSON.parse(shot.dataset.blocks) : [];
        const drawn = blocks.filter((x) => x.drawn);
        const inBox = (x, y, bx) => x >= bx[0] && x <= bx[2] && y >= bx[1] && y <= bx[3];
        let outside = 0, keptDiff = 0, changed = 0;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const o = (y * c.width + x) * 4;
            if (a[o] === b[o] && a[o + 1] === b[o + 1] && a[o + 2] === b[o + 2]) continue;
            changed += 1;
            if (!drawn.some((d) => inBox(x, y, d.cover))) outside += 1;
            if (blocks.some((d) => !d.drawn && inBox(x, y, d.box))) keptDiff += 1;
          }
        }
        return { changed, outside, keptDiff, size: [c.width, c.height, shot.width, shot.height] };
      }, srcUrl);
      if (!row.pixels.changed) row.problems.push("nothing drawn");
      if (row.pixels.outside) row.problems.push(row.pixels.outside + " pixels changed outside the drawn boxes");
      if (row.pixels.keptDiff) row.problems.push(row.pixels.keptDiff + " pixels changed in kept blocks");
      const blocks = card.blocks || [];
      if (!card.blocks) row.problems.push("no block styles on the canvas");
      const style = (en) => blocks.find((b) => near(en, b.en)) || {};
      const gold = [0xf5, 0xc5, 0x42];
      const title = style("I AM ATTENDING ASDP 2026");
      const dist = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
      if (!title.bold || title.align !== "center" || !title.fg || dist(title.fg, gold) > 60) row.problems.push("title style " + JSON.stringify(title));
      if (style("SINGAPORE").drawn !== false) row.problems.push("SINGAPORE redrawn " + JSON.stringify(style("SINGAPORE")));
      if (style("1-3 NOVEMBER 2026").align !== "left") row.problems.push("date align " + JSON.stringify(style("1-3 NOVEMBER 2026")));
      const pill = style("ACADEMIA, SINGAPORE GENERAL HOSPITAL");
      if (pill.align !== "center" || !pill.bold) row.problems.push("pill style " + JSON.stringify(pill));
      const sub = style("INTELLIGENCE IN EVERY PIXEL: POWERING NEXT GENERATION PATHOLOGY");
      if (sub.bold || sub.align !== "center") row.problems.push("subtitle style " + JSON.stringify(sub));
      for (const b of blocks.filter((x) => x.drawn)) {
        if (b.size < 0.6 * b.original - 0.01 && !b.squeezed) row.problems.push("tiny text " + JSON.stringify(b));
      }
      console.log("  poster blocks: " + blocks.map((b) => ascii(b.en).slice(0, 14) + (b.drawn ? " " + b.align + (b.bold ? " bold" : "")
        + " " + Number(b.size).toFixed(1) + "/" + Number(b.original).toFixed(1) + " stroke " + (b.stroke / b.original).toFixed(3)
        + (b.squeezed ? " squeezed" : "") : " kept")).join(" | "));
    }
    await finish(p);
  }
  if (only.includes("quota")) {
    const p = await newPage("quota");
    await p.page.setInputFiles("#anh-files", [pictures["slide.png"].path]);
    await waitCards(p.page, 1, 300000);
    const c = await p.page.evaluate(() => {
      const card = document.querySelector("#view-anh .result");
      return { state: card.dataset.state, code: card.dataset.code, note: card.querySelector(".result-note").textContent,
        drawn: !card.querySelector(".result-image").hidden };
    });
    p.row.card = c;
    if (c.state !== "error" || c.code !== "quota_exceeded" || c.note !== MSG_QUOTA || c.drawn) {
      p.row.problems.push("quota card " + JSON.stringify(c));
    }
    await finish(p);
  }
} finally {
  await browser.close();
  await server.close();
}
summary.ok = summary.scenarios.every((s) => !s.problems.length);
writeFileSync(join(out, "page_anh.json"), JSON.stringify(summary, null, 1));
for (const s of summary.scenarios) {
  console.log("scenario " + s.scenario + ": " + (s.problems.length ? "FAILED" : "ok"));
  for (const c of s.cards || []) {
    console.log("  " + ascii(c.title).padEnd(26) + " " + String(c.verdict || c.code || c.state).padEnd(10) + " " + String(c.backend || "").padEnd(7) + " lines "
      + String(c.lines).padStart(3) + "  OCR " + String(c.ocrMs).padStart(5) + " ms  total " + String(c.totalMs).padStart(6)
      + " ms" + (c.cer !== undefined ? "  CER " + (100 * c.cer).toFixed(2) + " %" : "") + (c.note ? "  note: " + ascii(c.note) : ""));
  }
  if (s.sentSegments !== undefined) console.log("  sent " + s.sentSegments + " segments; calls: " + s.calls.join(" "));
  for (const pr of s.problems) console.log("  PROBLEM " + ascii(pr).slice(0, 300));
}
console.log(summary.ok ? "OK" : "FAILED");
process.exit(summary.ok ? 0 : 1);
