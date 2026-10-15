// Local static server for the page-level runners (page.mjs, accept_browser.mjs): serves a built site
// (tools/build_site.py) on 127.0.0.1 with the headers of the site's _headers file, applied as Cloudflare Pages does
// (every matching rule in order; "! Name" detaches a header an earlier rule set; a header set twice is joined with a
// comma), so the page runs under its real CSP. `overrides` maps a URL path to a local file served instead.
// Test infrastructure only (web/engine/tests/ is never deployed).
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".md": "text/markdown; charset=utf-8", ".zip": "application/zip", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8" };

/** [{ pattern, set: [[name, value]], unset: [lower name] }] of a _headers file. */
export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      cur = { pattern: line, set: [], unset: [] };
      rules.push(cur);
    } else if (cur && line.startsWith("!")) {
      cur.unset.push(line.slice(1).trim().toLowerCase());
    } else if (cur) {
      const i = line.indexOf(":");
      if (i > 0) cur.set.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** Map(lower-case name -> value) of the headers for a URL path. */
export function headersFor(rules, path) {
  const out = new Map();
  for (const r of rules) {
    const rx = new RegExp("^" + r.pattern.split("*").map(escapeRe).join(".*") + "$");
    if (!rx.test(path)) continue;
    for (const name of r.unset) out.delete(name);
    for (const [name, value] of r.set) {
      const k = name.toLowerCase();
      out.set(k, out.has(k) ? out.get(k) + ", " + value : value);
    }
  }
  return out;
}

/** Serve `root` on 127.0.0.1 (port 0 = random): { port, origin, close() }. */
export async function startSiteServer(root, overrides, port) {
  const base = normalize(root) + sep;
  let rules = [];
  try { rules = parseHeaders(readFileSync(join(root, "_headers"), "utf8")); } catch (e) { rules = []; }
  const over = new Map(Object.entries(overrides || {}));
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const headers = { "Cache-Control": "no-store" };
    for (const [k, v] of headersFor(rules, path)) headers[k] = v;
    const send = (status, body, type) => {
      res.writeHead(status, Object.assign(headers, { "Content-Type": type || "application/octet-stream" }));
      res.end(body);
    };
    let file = over.has(path) ? over.get(path) : normalize(join(root, path.endsWith("/") ? path + "index.html" : path));
    if (!over.has(path) && !(file + sep).startsWith(base) && file + sep !== base) return send(403, "forbidden", "text/plain");
    try {
      if (statSync(file).isDirectory()) file = join(file, "index.html");
      return send(200, readFileSync(file), TYPES[extname(file).toLowerCase()]);
    } catch (e) {
      return send(404, "not found", "text/plain");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port || 0, "127.0.0.1", resolve);
  });
  const bound = server.address().port;
  return { port: bound, origin: "http://127.0.0.1:" + bound, close: () => new Promise((r) => server.close(r)) };
}
