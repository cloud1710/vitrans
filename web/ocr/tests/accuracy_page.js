// The page side of tests/accuracy.mjs: loads the OCR engine (web/ocr/ocr.js) as the tool pages do, runs it on the
// synthetic cases (tests/synthetic.js) at the detection sizes asked for, and leaves the numbers in window.__result.
// ?sides=960,1280 (detection long sides), ?backend=wasm (default auto: WebGPU where the browser has it), ?proxy=0
// (WASM inference on the page's thread), ?mode=memory (the runner calls
// window.__load() and window.__run() itself, measuring the heap between). Test infrastructure only.
import { loadOcr } from "../ocr.js";
import { cases, photo } from "./synthetic.js";
import { cer } from "./cer.js";

const q = new URLSearchParams(location.search);
const sides = (q.get("sides") || "1280").split(",").map(Number);
const proxy = q.get("proxy") !== "0";
const backend = q.get("backend") || "auto";
const state = (t) => { document.getElementById("state").textContent = t; };

// the longest gap between 20 ms timer ticks while fn runs: how long the page's thread was blocked
async function timed(fn) {
  let last = performance.now(), maxGap = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last);
    last = now;
  }, 20);
  const t = performance.now();
  try {
    const value = await fn();
    return { value, ms: performance.now() - t, maxGapMs: Math.max(maxGap, performance.now() - last) };
  } finally {
    clearInterval(timer);
  }
}

let ocr = null;
const progress = [];

window.__load = async () => {
  const r = await timed(() => loadOcr({ proxy, backend, onProgress: (p) => progress.push(p.stage) }));
  ocr = r.value;
  return { ms: r.ms, backend: ocr.backend, fallback: ocr.fallback, stages: [...new Set(progress)] };
};

window.__run = async (side) => {
  const c = photo();
  const r = await timed(() => ocr.recognize(c.canvas, side ? { detMaxSide: side } : {}));
  return { ms: r.ms, maxGapMs: r.maxGapMs, lines: r.value.lines.length, cer: cer(c.truth, r.value.lines.map((l) => l.text)) };
};

async function accuracy() {
  state("loading the engine");
  const load = await window.__load();
  const out = { proxy, load, results: [] };
  const list = cases();
  for (const side of sides) {
    for (const c of list) {
      state(c.name + " @" + side);
      // warm-up of a new detection size is part of the first case: the times show it
      const r = await timed(() => ocr.recognize(c.canvas, { detMaxSide: side }));
      const hyp = r.value.lines.map((l) => l.text);
      out.results.push({ side, name: c.name, clean: !!c.clean, w: c.canvas.width, h: c.canvas.height,
        ms: Math.round(r.ms), maxGapMs: Math.round(r.maxGapMs), lines: hyp.length, truthLines: c.truth.length,
        cer: cer(c.truth, hyp), hyp, truth: c.truth, scores: r.value.lines.map((l) => Number(l.score.toFixed(3))) });
    }
  }
  state("done");
  return out;
}

if (q.get("mode") !== "memory") {
  accuracy().then((r) => { window.__result = r; }, (e) => { window.__error = String(e && e.stack ? e.stack : e); state("error"); });
} else {
  state("ready");
}
