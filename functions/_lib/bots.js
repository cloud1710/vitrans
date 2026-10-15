// Which user agents the site turns away (functions/_middleware.js): AI crawlers and scraping tools that name
// themselves, and requests without a user agent. Search engines (Googlebot, bingbot), link previews (Facebook, Zalo,
// Telegram, Slack...) and browsers pass (his choice 2026-10-15: "chi chan bot AI va bot cao"). A bot that dresses
// as a browser passes too: this only stops the ones that say who they are; the API itself needs a Turnstile session.

// matched case-insensitively anywhere in the user agent
const AI_BOTS = ["gptbot", "chatgpt-user", "oai-searchbot", "claudebot", "claude-user", "claude-searchbot",
  "anthropic-ai", "ccbot", "bytespider", "perplexitybot", "perplexity-user", "amazonbot", "meta-externalagent",
  "meta-externalfetcher", "facebookbot", "applebot-extended", "google-extended", "cohere-ai", "cohere-training",
  "diffbot", "imagesiftbot", "omgilibot", "omgili", "youbot", "timpibot", "ai2bot", "petalbot", "mistralai-user",
  "duckassistbot", "novaact", "kangaroo bot", "img2dataset", "friendlycrawler", "iaskspider", "scrapy"];
// tools and libraries, matched at the start of the user agent
const TOOLS = /^(?:curl|wget|python-requests|python-urllib|python-httpx|aiohttp|httpx|go-http-client|java\/|okhttp|libwww-perl|lwp::|node-fetch|axios|undici|got |httpclient|apache-httpclient|ruby|php|scrapy|colly|wpscan|nikto|sqlmap|masscan|zgrab)/i;

export function isBlockedAgent(ua) {
  const s = String(ua || "").trim();
  if (!s) return true;
  if (TOOLS.test(s)) return true;
  const low = s.toLowerCase();
  return AI_BOTS.some((b) => low.includes(b));
}
