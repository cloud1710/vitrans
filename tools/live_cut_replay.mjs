// Measure how the live segmenter (web/live/segmenter.js) cuts a lecture into sentences, through the replay harness
// web/live/tests/replay.mjs: latency (median / p90 s), words per commit (median / max), bad cuts, revisions, missed /
// extra words, for the iPhone Safari-like source and the Windows Live Captions-like source.
// Usage: node tools/live_cut_replay.mjs [--text FILE] [--lc-visible FILE,...] [--seeds N] [--opts JSON]
//          [--opts-safari JSON] [--opts-lc JSON] [--grid] [--bad]
//   --text FILE        the script, one sentence per line (default: web/live/tests/fixtures/lecture_synthetic.txt)
//   --lc-visible FILES local only: snapshots of the Live Captions window separated by "---" lines (the text is
//                      rebuilt from their overlaps and replayed as the script; never commit such text)
//   --opts* JSON       segmenter options for both sources / one source (default: the options live.js passes)
//   --grid             a grid of options over one source (--source safari | lc; --grid-json '{"stableMs": [500, 700]}')
//   --rates JSON       safari-like rewrites: {"split": 0.04, "late": 0.05, "quick": 0.3} (the default)
//   --bad              print the end of each bad cut
// Output: ASCII only (the text itself is never printed unless --bad).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runSource, packTerms } from "../web/live/tests/replay.mjs";
import * as segmenter from "../web/live/segmenter.js";

const segmenterOptions = segmenter.segmenterOptions || (() => ({}));

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const seeds = Array.from({ length: Number(opt("--seeds", "5")) }, (_, i) => i + 1);
const terms = await packTerms(ROOT + "packs/");
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, "?");

// the text behind overlapping snapshots of a caption window: each one appended from where the previous one ends
function rebuild(snapshots) {
  let words = [];
  for (const snap of snapshots) {
    const ws = snap.trim().split(/\s+/).slice(1);  // the first word may be cut by the window
    if (!words.length) { words = ws; continue; }
    let best = -1;
    for (let k = Math.min(words.length, ws.length); k >= 4; k--) {
      const tail = words.slice(-k).map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ""));
      const head = ws.slice(0, k).map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ""));
      if (tail.every((w, i) => w === head[i])) { best = k; break; }
    }
    if (best < 0) {
      // the window moved less than its own length: find the last 6 words of the text inside the snapshot
      const key = words.slice(-6).map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, "")).join(" ");
      const norm = ws.map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ""));
      let at = -1;
      for (let i = norm.length - 6; i >= 0; i--) if (norm.slice(i, i + 6).join(" ") === key) { at = i + 6; break; }
      if (at >= 0) {
        words = words.slice(0, words.length - 6).concat(ws.slice(at - 6));  // the later punctuation wins
      } else {
        words = words.concat(ws);
      }
    } else {
      words = words.slice(0, words.length - best).concat(ws);
    }
  }
  return words.join(" ").replace(/([.?!])\s+/g, "$1\n");
}

let text = readFileSync(opt("--text", ROOT + "web/live/tests/fixtures/lecture_synthetic.txt"), "utf8");
if (opt("--lc-visible")) {
  text = opt("--lc-visible").split(",").map((f) => rebuild(readFileSync(f, "utf8").split(/^---\s*$/m)
    .filter((s) => s.trim()))).join("\n");
}
const base = JSON.parse(opt("--opts", "null") || "null");
const rates = JSON.parse(opt("--rates", "{}"));  // safari: shares of words rewritten {split, late, quick}
const pick = (src) => JSON.parse(opt("--opts-" + src, "null") || "null") || base || segmenterOptions(src === "lc" ? "helper" : "mic");

function line(name, s) {
  return ascii(name.padEnd(46) + " lat " + String(s.latMedian).padStart(5) + " / " + String(s.latP90).padStart(5) +
    "  wpc " + String(s.wpcMedian).padStart(3) + " / " + String(s.wpcMax).padStart(3) +
    "  bad " + (s.badShare * 100).toFixed(1).padStart(5) + "% (" + s.badEnd + "+" + s.termSplit + "/" + s.commits + ")" +
    "  mid " + (s.midShare * 100).toFixed(0).padStart(3) + "%" +
    "  rev " + String(s.revisions).padStart(3) + "  miss " + s.missed + " extra " + s.extra + "  " + JSON.stringify(s.reasons));
}

// the grid: every combination of the arrays given (default below), over one source
function* combos(grid) {
  const keys = Object.keys(grid);
  const idx = keys.map(() => 0);
  for (;;) {
    yield Object.fromEntries(keys.map((k, i) => [k, grid[k][idx[i]]]));
    let i = keys.length - 1;
    while (i >= 0 && ++idx[i] === grid[keys[i]].length) idx[i--] = 0;
    if (i < 0) return;
  }
}

console.log("words per run " + text.split(/\s+/).filter(Boolean).length + ", seeds " + seeds.length + ", terms " + terms.length);
if (args.includes("--grid")) {
  const src = opt("--source", "safari");
  const grid = JSON.parse(opt("--grid-json", "null") || "null") || { stableMs: [500, 700, 900], minWords: [6, 8, 10],
    capWords: [14, 18, 20], pauseMs: [600, 800] };
  console.log(line(src + " today", runSource(text, src, { pauseMs: 1200, maxWords: 32 }, seeds, terms, rates).summary));
  for (const g of combos(grid)) {
    const o = { ...(src === "lc" ? segmenterOptions("helper") : segmenterOptions("mic")), ...g };
    if (g.pauseMs && !("pauseWeakMs" in g)) o.pauseWeakMs = 2 * g.pauseMs;
    const name = Object.entries(g).map(([k, v]) => k.replace(/Ms$|Words$/, "") + v).join(" ");
    console.log(line(name, runSource(text, src, o, seeds, terms, rates).summary));
  }
} else {
  for (const src of ["safari", "lc"]) {
    const today = runSource(text, src, { pauseMs: 1200, maxWords: 32 }, seeds, terms, rates);
    const now = runSource(text, src, pick(src), seeds, terms, rates);
    console.log(line(src + " today", today.summary));
    console.log(line(src + " options", now.summary));
    if (args.includes("--bad")) {
      for (const [name, r] of [["today", today], ["options", now]]) {
        for (const m of r.runs) for (const b of m.badList) console.log("  " + src + " " + name + ": ..." + ascii(b));
      }
    }
  }
}
