// Bot filter of the whole site (functions/_middleware.js): AI crawlers and scraping tools that name themselves get a
// 403; search engines, link previews and browsers pass (his choice 2026-10-15: "chi chan bot AI va bot cao").
import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedAgent } from "../../functions/_lib/bots.js";
import { onRequest } from "../../functions/_middleware.js";
import { ORIGIN } from "./helpers.mjs";

const BLOCKED = [
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)",
  "CCBot/2.0 (https://commoncrawl.org/faq/)",
  "Mozilla/5.0 (compatible; Bytespider)",
  "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
  "python-requests/2.32.3",
  "curl/8.9.1",
  "Wget/1.24.5",
  "Scrapy/2.11.2 (+https://scrapy.org)",
  "Go-http-client/2.0",
  "",
];
const ALLOWED = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 "
    + "Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "TelegramBot (like TwitterBot)",
  "Zalo/1.0 (link preview)",
];

test("AI crawlers and scraping tools are blocked", () => {
  for (const ua of BLOCKED) assert.equal(isBlockedAgent(ua), true, ua);
  assert.equal(isBlockedAgent(undefined), true, "no user agent at all");
});

test("browsers, search engines and link previews pass", () => {
  for (const ua of ALLOWED) assert.equal(isBlockedAgent(ua), false, ua);
});

test("the middleware answers 403 to a blocked agent and passes the rest on", async () => {
  let passed = 0;
  const ctx = (ua) => ({
    request: new Request(ORIGIN + "/", { headers: ua === null ? {} : { "user-agent": ua } }),
    next: async () => { passed += 1; return new Response("page"); },
  });
  const res = await onRequest(ctx(BLOCKED[0]));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.equal(passed, 0);
  const ok = await onRequest(ctx(ALLOWED[0]));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "page");
  assert.equal(passed, 1);
});

test("robots.txt is always served, even to a blocked agent", async () => {
  let passed = 0;
  const res = await onRequest({
    request: new Request(ORIGIN + "/robots.txt", { headers: { "user-agent": BLOCKED[0] } }),
    next: async () => { passed += 1; return new Response("User-agent: *"); },
  });
  assert.equal(res.status, 200);
  assert.equal(passed, 1);
});
