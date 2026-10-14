// Browser check (test page only): the OOXML parity fixtures, the unit checks (tests/checks.mjs) and the M2 engine
// parity (tests/engine_checks.mjs) through the engine with the native DOMParser, the vendored fflate, Web Crypto and
// IndexedDB. Publishes window.__parity = {done, ok, dom, rows, checks, engine, error}. Query: ?fixtures=<url of a
// folder with index.json> (default ./fixtures/), ?checks=0 to skip the unit checks, ?engine=0 to skip the engine.
import { runParity } from "./parity.mjs";
import { runChecks } from "./checks.mjs";
import { engineChecks } from "./engine_checks.mjs";
import { decodeText } from "../packs.js";
import { IndexedDbTM } from "../tm.js";

const status = document.getElementById("status");
const rows = document.getElementById("rows");
const failed = document.getElementById("failed");

function cell(tr, text, bad) {
  const td = document.createElement("td");
  td.textContent = text;
  if (bad) td.className = "bad";
  tr.appendChild(td);
}

async function bytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("GET " + url + ": " + res.status);
  return new Uint8Array(await res.arrayBuffer());
}

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("GET " + url + ": " + res.status);
  return res.json();
}

// Packs as the page will read them: fetched files, decoded like Python's read_text (strict UTF-8, BOM kept); the
// committed packs come from the repository's packs/ (served by tests/chrome.mjs under /repo-packs/).
const packSource = {
  async read(where, pid, file) {
    const url = (where === "repo" ? "/repo-packs/" : "./fixtures/engine/packs/") + pid + "/" + file;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("GET " + url + ": " + res.status);
    return decodeText(new Uint8Array(await res.arrayBuffer()));
  },
};

// A fresh IndexedDB database per test case, dropped afterwards.
let dbCount = 0;
function dropDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
const tmOptions = {
  makeTm: () => IndexedDbTM.open("vitranslate-tm-test-" + Date.now() + "-" + dbCount++),
  disposeTm: async (tm) => {
    const name = tm.db.name;
    tm.close();
    await dropDb(name);
  },
  reopen: async (tm) => {
    const name = tm.db.name;
    tm.close();
    return IndexedDbTM.open(name);
  },
};

async function main() {
  const query = new URLSearchParams(location.search);
  const result = { done: false, ok: false, dom: String(globalThis.DOMParser && globalThis.DOMParser.name), rows: [],
    checks: [], engine: [] };
  window.__parity = result;
  try {
    if (query.get("checks") !== "0") {
      result.checks = runChecks(await json("./lxml_cases.json"), await bytes("./fixtures/doc.docx"));
      for (const c of result.checks.filter((x) => !x.ok)) {
        const li = document.createElement("li");
        li.textContent = c.name + ": " + c.detail;
        failed.appendChild(li);
      }
    }
    const base = query.get("fixtures") || "./fixtures/";
    for (const name of await json(base + "index.json")) {
      const dump = await json(base + name);
      const src = await bytes(base + dump.file);
      const started = performance.now();
      const r = await runParity(dump, src);
      result.rows.push({ file: dump.file, items: [r.items.same, r.items.total], parts: [r.parts.same, r.parts.total],
        bytes: [r.parts.bytesSame, r.parts.total], other: r.other.length, ms: Math.round(performance.now() - started),
        partDiffs: r.parts.diffs.slice(0, 2).map((d) => ({ scenario: d.scenario, part: d.part, problem: d.problem,
          line: d.first && d.first.line })) });
      const tr = document.createElement("tr");
      cell(tr, dump.file);
      cell(tr, r.items.same + "/" + r.items.total, r.items.same !== r.items.total);
      cell(tr, r.parts.same + "/" + r.parts.total, r.parts.same !== r.parts.total);
      cell(tr, r.parts.bytesSame + "/" + r.parts.total, r.parts.bytesSame !== r.parts.total);
      cell(tr, String(r.other.length), r.other.length > 0);
      rows.appendChild(tr);
    }
    if (query.get("engine") !== "0") {
      status.textContent = "running the engine checks...";
      result.engine = (await engineChecks({ load: (name) => json("./fixtures/engine/" + name), source: packSource,
        readFixture: (name) => bytes("./fixtures/" + name), ...tmOptions }))
        .map((r) => ({ area: r.area, name: r.name, ok: r.ok, detail: r.ok ? "" : String(r.detail) }));
      for (const c of result.engine.filter((x) => !x.ok)) {
        const li = document.createElement("li");
        li.textContent = "engine " + c.name + ": " + c.detail;
        failed.appendChild(li);
      }
    }
    result.ok = result.checks.every((c) => c.ok) && result.engine.every((c) => c.ok) &&
      result.rows.every((x) => x.items[0] === x.items[1] && x.parts[0] === x.parts[1] && x.bytes[0] === x.bytes[1] &&
        x.other === 0);
    status.textContent = (result.ok ? "DONE: all identical" : "DONE: differences") + " (" + result.rows.length +
      " files, " + result.checks.filter((c) => c.ok).length + "/" + result.checks.length + " checks, " +
      result.engine.filter((c) => c.ok).length + "/" + result.engine.length + " engine rows)";
  } catch (err) {
    result.error = String((err && err.stack) || err);
    status.textContent = "DONE: error " + result.error;
    status.className = "bad";
  }
  result.done = true;
}

main();
