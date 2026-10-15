// The local static server of the page-level runners applies the site's _headers file as Cloudflare Pages does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHeaders, headersFor } from "./site_server.mjs";

const HEADERS = readFileSync(new URL("../../_headers", import.meta.url), "utf8");
// the main page: Turnstile, the helper on 127.0.0.1, wasm for the on-device OCR (no eval), blob: images for the image
// tool's photo decode (the tool is a tab of this page now)
const PAGE_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com; "
  + "frame-src https://challenges.cloudflare.com; connect-src 'self' http://127.0.0.1:*; img-src 'self' data: blob:; "
  + "frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
// the image tool: no helper (no 127.0.0.1), blob: images for the photo decode, no form posts
const ANH_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com; "
  + "frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data: blob:; "
  + "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'none'";

test("the page gets the /* rules; /anh/ and /lab/ replace the CSP (! detaches it) and keep the other /* headers", () => {
  const rules = parseHeaders(HEADERS);
  const page = headersFor(rules, "/");
  assert.equal(page.get("content-security-policy"), PAGE_CSP);
  assert.equal(page.get("x-content-type-options"), "nosniff");
  assert.equal(page.get("x-robots-tag"), undefined);
  for (const path of ["/anh/", "/anh/index.html", "/anh/anh.js"]) {  // its own CSP, not joined with the page's
    const anh = headersFor(rules, path);
    assert.equal(anh.get("content-security-policy"), ANH_CSP, path);
    assert.equal(anh.get("x-content-type-options"), "nosniff");
    assert.equal(anh.get("referrer-policy"), "no-referrer");
  }
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
