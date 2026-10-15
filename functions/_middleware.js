// Every request of the site passes here first: AI crawlers and scraping tools that name themselves get a short 403
// (functions/_lib/bots.js); robots.txt is served to everyone so well-behaved bots can read what they may not do.
import { isBlockedAgent } from "./_lib/bots.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.pathname !== "/robots.txt" && isBlockedAgent(ctx.request.headers.get("user-agent"))) {
    return new Response("Forbidden\n", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  }
  return ctx.next();
}
