// The browser engine's pack source over /registry/ (web/engine/registry.js): the manifest of tools/build_registry.py
// checked like helper/vitranslate/registry.py, pack zips verified with sha256 BEFORE anything is unpacked, unpacked
// with the engine's zip reader, cached by sha256 in Cache Storage; the bundled style pack under registry/_style/.
// Fake fetch and Cache Storage; real Web Crypto and real zips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeEntry, writeZip } from "../ooxml/zip.js";
import { createRegistry, parseManifest, PackUnavailable, PACK_CACHE, MAX_MANIFEST_BYTES } from "../registry.js";

const BASE = "https://vitrans.test/registry/";
const enc = (s) => new TextEncoder().encode(s);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function packZip(files) {
  return writeZip(Object.keys(files).sort().map((name) => makeEntry(name, enc(files[name]))));
}

const PATHO_FILES = {
  "pack.json": JSON.stringify({ id: "pathology", version: "0.1.8", name: "Giải phẫu bệnh" }),
  "prompt.md": "Chuyên ngành: Giải phẫu bệnh.\n",
  "glossary.csv": "en,vi,note\nbiopsy,sinh thiết,\n",
};

function entry(over, zip) {
  return Object.assign({ id: "pathology", name: "Giải phẫu bệnh", version: "0.1.8", parent: null,
    file: "pathology-0.1.8.zip", sha256: sha(zip), size: zip.length, detect: ["biopsy"],
    profile: { biopsy: 2.0 } }, over);
}

function site(files) {
  // files: { path under BASE: Uint8Array | string | {status} }
  const calls = [];
  const fetch = async (url, init) => {
    calls.push(String(url));
    const key = String(url).startsWith(BASE) ? String(url).slice(BASE.length) : String(url);
    const hit = files[key];
    if (hit === undefined) return new Response("not found", { status: 404 });
    if (hit && hit.status) return new Response("x", { status: hit.status });
    if (hit instanceof Error) throw hit;
    const body = typeof hit === "string" ? enc(hit) : hit;
    return new Response(body, { headers: { "content-length": String(body.byteLength) } });
  };
  fetch.calls = calls;
  return fetch;
}

function fakeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) {
        const m = new Map();
        stores.set(name, { raw: m,
          async match(url) { return m.has(url) ? new Response(m.get(url)) : undefined; },
          async put(url, resp) { m.set(url, new Uint8Array(await resp.arrayBuffer())); },
          async delete(url) { return m.delete(url); } });
      }
      return stores.get(name);
    },
  };
}

function setup(over) {
  const zip = packZip(PATHO_FILES);
  const manifest = { format: 1, packs: [entry({}, zip)], idf: { biopsy: 1.4 } };
  const files = Object.assign({ "manifest.json": JSON.stringify(manifest), "pathology-0.1.8.zip": zip,
    "_style/pack.json": JSON.stringify({ id: "_style", version: "0.1.2" }), "_style/prompt.md": "Quy tắc hành văn\n" },
  over || {});
  const fetch = site(files);
  const caches = fakeCaches();
  return { zip, manifest, files, fetch, caches, reg: createRegistry({ base: BASE, fetch, caches }) };
}

test("parseManifest keeps the valid entries (first of a duplicate id) and the finite idf values", () => {
  const good = { id: "a", name: "A", version: "1.0.0", file: "a-1.0.0.zip", sha256: "0".repeat(64), size: 10,
    profile: { x: 1 }, detect: ["x"], parent: null };
  const m = parseManifest(JSON.stringify({ format: 1, idf: { x: 1.5, y: "no", z: null }, packs: [
    good, Object.assign({}, good, { name: "A again" }),
    Object.assign({}, good, { id: "b", sha256: "xyz" }),
    Object.assign({}, good, { id: "c", file: "../evil.zip" }),
    Object.assign({}, good, { id: "d", version: "1.0" }),
    Object.assign({}, good, { id: "e", size: -1 }),
    Object.assign({}, good, { id: "f", profile: { x: "1" } }),
    Object.assign({}, good, { id: "g", parent: "Bad Parent" }),
    Object.assign({}, good, { id: "h", detect: "x" }),
    Object.assign({}, good, { id: "Upper" }),
    Object.assign({}, good, { id: "ok2", parent: "a" }),
  ] }));
  assert.deepEqual(m.packs.map((p) => p.id), ["a", "ok2"]);
  assert.equal(m.packs[0].name, "A");
  assert.deepEqual(m.idf, { x: 1.5 });
  assert.equal(m.format, 1);
  assert.throws(() => parseManifest("[]"));
  assert.throws(() => parseManifest("{\"packs\": 3}"));
  assert.throws(() => parseManifest("not json"));
});

test("the manifest comes from <base>manifest.json; unreachable or invalid it throws (the pipeline: offline)", async () => {
  const { reg, manifest } = setup();
  assert.equal(reg.offline, null);
  const m = await reg.manifest();
  assert.equal(reg.offline, false);
  assert.deepEqual(m.packs.map((p) => p.id), ["pathology"]);
  assert.deepEqual(m.idf, manifest.idf);
  // the engine contract: a manifest() that throws means offline, the job runs without domain packs
  for (const bad of [{ status: 503 }, "{broken", new TypeError("Failed to fetch")]) {
    const r = setup({ "manifest.json": bad }).reg;
    await assert.rejects(r.manifest(), (e) => e instanceof PackUnavailable);
    assert.equal(r.offline, true);
  }
  // a manifest larger than the cap is not read
  const big = setup({ "manifest.json": "x".repeat(MAX_MANIFEST_BYTES + 1) }).reg;
  await assert.rejects(big.manifest(), (e) => e instanceof PackUnavailable);
  assert.equal(big.offline, true);
});

test("readText downloads the zip once, checks its sha256, unpacks it and returns the file's text", async () => {
  const { reg, fetch, caches, zip } = setup();
  assert.equal(await reg.readText("pathology", "0.1.8", "prompt.md"), PATHO_FILES["prompt.md"]);
  assert.equal(await reg.readText("pathology", "0.1.8", "glossary.csv"), PATHO_FILES["glossary.csv"]);
  assert.equal(await reg.readText("pathology", "0.1.8", "rules.json"), null);  // not in this pack
  assert.equal(fetch.calls.filter((u) => u.endsWith(".zip")).length, 1);
  assert.equal(reg.lastSource("pathology"), "downloaded");
  // kept by sha256 in Cache Storage
  const stored = [...(await caches.open(PACK_CACHE)).raw.entries()];
  assert.equal(stored.length, 1);
  assert.ok(stored[0][0].includes(sha(zip)));
  assert.equal(sha(stored[0][1]), sha(zip));
});

test("a later page (new registry, same Cache Storage) reads the verified copy without downloading", async () => {
  const first = setup();
  await first.reg.readText("pathology", "0.1.8", "prompt.md");
  const fetch = site(first.files);
  const again = createRegistry({ base: BASE, fetch, caches: first.caches });
  assert.equal(await again.readText("pathology", "0.1.8", "prompt.md"), PATHO_FILES["prompt.md"]);
  assert.equal(fetch.calls.filter((u) => u.endsWith(".zip")).length, 0);
  assert.equal(again.lastSource("pathology"), "cache");
  // a damaged cached copy is not trusted: downloaded again
  const store = await first.caches.open(PACK_CACHE);
  for (const k of store.raw.keys()) store.raw.set(k, enc("damaged"));
  const fetch3 = site(first.files);
  const third = createRegistry({ base: BASE, fetch: fetch3, caches: first.caches });
  assert.equal(await third.readText("pathology", "0.1.8", "prompt.md"), PATHO_FILES["prompt.md"]);
  assert.equal(fetch3.calls.filter((u) => u.endsWith(".zip")).length, 1);
  assert.equal(third.lastSource("pathology"), "downloaded");
  assert.equal(third.lastSource("other"), null);
});

test("a zip that does not match the manifest's sha256 is refused before unpacking and never cached", async () => {
  const other = packZip(Object.assign({}, PATHO_FILES, { "prompt.md": "tampered" }));
  const { reg, caches } = setup({ "pathology-0.1.8.zip": other });
  await assert.rejects(reg.readText("pathology", "0.1.8", "prompt.md"),
    (e) => e instanceof PackUnavailable && /sha256/.test(e.message));
  assert.equal((await caches.open(PACK_CACHE)).raw.size, 0);
});

test("unexpected zip contents and a pack.json naming another pack are refused", async () => {
  for (const files of [
    Object.assign({}, PATHO_FILES, { "evil.js": "alert(1)" }),
    Object.assign({}, PATHO_FILES, { "pack.json": JSON.stringify({ id: "other", version: "0.1.8" }) }),
    Object.assign({}, PATHO_FILES, { "pack.json": JSON.stringify({ id: "pathology", version: "9.9.9" }) }),
    { "prompt.md": "no pack.json" },
  ]) {
    const zip = packZip(files);
    const manifest = { format: 1, packs: [entry({}, zip)], idf: {} };
    const reg = createRegistry({ base: BASE, caches: fakeCaches(),
      fetch: site({ "manifest.json": JSON.stringify(manifest), "pathology-0.1.8.zip": zip }) });
    await assert.rejects(reg.readText("pathology", "0.1.8", "prompt.md"), (e) => e instanceof PackUnavailable,
      Object.keys(files).join(","));
  }
  // not a zip at all
  const junk = enc("not a zip");
  const reg = createRegistry({ base: BASE, caches: fakeCaches(), fetch: site({
    "manifest.json": JSON.stringify({ format: 1, packs: [entry({}, junk)], idf: {} }), "pathology-0.1.8.zip": junk }) });
  await assert.rejects(reg.readText("pathology", "0.1.8", "prompt.md"), (e) => e instanceof PackUnavailable);
});

test("unknown packs, versions or file names fail clearly; a missing zip is unavailable", async () => {
  const { reg } = setup();
  await assert.rejects(reg.readText("breast", "1.0.0", "prompt.md"), (e) => e instanceof PackUnavailable);
  await assert.rejects(reg.readText("pathology", "0.1.7", "prompt.md"), (e) => e instanceof PackUnavailable);
  await assert.rejects(reg.readText("pathology", "0.1.8", "../manifest.json"), TypeError);
  const gone = setup({ "pathology-0.1.8.zip": { status: 404 } }).reg;
  await assert.rejects(gone.readText("pathology", "0.1.8", "prompt.md"),
    (e) => e instanceof PackUnavailable && /404/.test(e.message));
});

test("the bundled style pack is read from <base>_style/ without the manifest", async () => {
  const { reg, fetch } = setup();
  assert.equal(await reg.readText("_style", null, "prompt.md"), "Quy tắc hành văn\n");
  assert.equal(JSON.parse(await reg.readText("_style", "0.1.2", "pack.json")).version, "0.1.2");
  assert.equal(await reg.readText("_style", null, "glossary.csv"), null);
  assert.ok(!fetch.calls.some((u) => u.endsWith("manifest.json")));
});

test("without Cache Storage (private mode) packs still load, only nothing is kept", async () => {
  const { files } = setup();
  const reg = createRegistry({ base: BASE, fetch: site(files), caches: null });
  assert.equal(await reg.readText("pathology", "0.1.8", "prompt.md"), PATHO_FILES["prompt.md"]);
});
