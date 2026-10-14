// The local static server of the page-level runners applies the site's _headers file as Cloudflare Pages does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHeaders, headersFor } from "./site_server.mjs";

const HEADERS = readFileSync(new URL("../../_headers", import.meta.url), "utf8");

test("the page gets the /* rules; /lab/ replaces the CSP (! detaches it) and keeps the other /* headers", () => {
  const rules = parseHeaders(HEADERS);
  const page = headersFor(rules, "/");
  assert.match(page.get("content-security-policy"), /^default-src 'self'; script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
  assert.equal(page.get("x-content-type-options"), "nosniff");
  assert.equal(page.get("x-robots-tag"), undefined);
  const lab = headersFor(rules, "/lab/index.html");
  assert.match(lab.get("content-security-policy"), /worker-src 'none'/);
  assert.doesNotMatch(lab.get("content-security-policy"), /127\.0\.0\.1/);  // not joined with the page's CSP
  assert.equal(lab.get("x-robots-tag"), "noindex");
  assert.equal(lab.get("x-content-type-options"), "nosniff");
  assert.equal(headersFor(rules, "/registry/manifest.json").get("referrer-policy"), "no-referrer");
});

test("a header set by two matching rules is joined with a comma; comments and blank lines are ignored", () => {
  const rules = parseHeaders("# c\n/*\n  X-A: 1\n\n/a/*\n  X-A: 2\n  X-B: 3\n");
  assert.equal(headersFor(rules, "/a/b").get("x-a"), "1, 2");
  assert.equal(headersFor(rules, "/c").get("x-b"), undefined);
});
