// The menu's choices (web/prefs.js), remembered in this browser: "Dịch bằng" (Máy chủ / Trên máy: one choice for the
// five tools, the old "Dịch trên máy" switch carried over), "Phụ đề" (Song ngữ, text size, the keys the live tool
// already used), "Giao diện" (Sáng / Tối / Theo máy). Storage that is blocked or full keeps the choice in memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrefs, engineChoice, themeChoice, THEME_KEY, SUB_EN_KEY, SUB_SIZE_KEY, SUB_SIZES, applyTheme }
  from "../prefs.js";
import { ENGINE_KEY } from "../advice.js";

function memoryStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), m };
}
const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); },
  removeItem() { throw new Error("blocked"); } };

test("exactly two engines; the old Dịch trên máy switch carries over (same key, same values)", () => {
  assert.equal(engineChoice(null, false), "cloud");
  assert.equal(engineChoice("cloud", false), "cloud");
  assert.equal(engineChoice("local", false), "local");     // a user who had "Dịch trên máy" on keeps it
  assert.equal(engineChoice("auto", false), "cloud");      // nothing automatic
  assert.equal(engineChoice(null, true), "local");         // the helper's own page: no cloud there
  assert.equal(engineChoice("cloud", true), "cloud");
  const old = memoryStorage({ [ENGINE_KEY]: "local" });
  assert.equal(createPrefs({ storage: () => old }).engine(), "local");
});

test("the engine choice is remembered for every tool and announced", () => {
  const storage = memoryStorage();
  const p = createPrefs({ storage: () => storage });
  const heard = [];
  p.on("engine", (v) => heard.push(v));
  assert.equal(p.engine(), "cloud");
  p.setEngine("local");
  assert.equal(storage.m.get(ENGINE_KEY), "local");
  assert.equal(createPrefs({ storage: () => storage }).engine(), "local");  // a reload
  p.setEngine("local");  // no change: no announcement
  p.setEngine("cloud");
  p.setEngine("bogus");  // ignored
  assert.deepEqual(heard, ["local", "cloud"]);
  assert.equal(p.engine(), "cloud");
});

test("Giao diện: Sáng / Tối / Theo máy (the default); the page root follows", () => {
  assert.equal(themeChoice(null), "auto");
  assert.equal(themeChoice("dark"), "dark");
  assert.equal(themeChoice("light"), "light");
  assert.equal(themeChoice("purple"), "auto");
  const storage = memoryStorage();
  const p = createPrefs({ storage: () => storage });
  p.setTheme("dark");
  assert.equal(storage.m.get(THEME_KEY), "dark");
  const root = { dataset: {}, removeAttribute(n) { if (n === "data-theme") delete this.dataset.theme; } };
  applyTheme(root, "dark");
  assert.equal(root.dataset.theme, "dark");
  applyTheme(root, "auto");
  assert.equal(root.dataset.theme, undefined);
});

test("Phụ đề: Song ngữ off by default, the size steps within SUB_SIZES (the live tool's own keys)", () => {
  assert.equal(SUB_EN_KEY, "vitranslate-live-en-v1");
  assert.equal(SUB_SIZE_KEY, "vitranslate-live-size-v1");
  const storage = memoryStorage();
  const p = createPrefs({ storage: () => storage });
  const heard = [];
  p.on("sub", () => heard.push([p.bilingual(), p.subSize()]));
  assert.equal(p.bilingual(), false);
  assert.equal(p.subSize(), -1);  // the stylesheet's size until a step
  p.setBilingual(true);
  assert.equal(storage.m.get(SUB_EN_KEY), "on");
  p.stepSubSize(1);
  assert.equal(p.subSize(), 4);   // the first step starts from the middle size
  for (let k = 0; k < 10; k++) p.stepSubSize(1);
  assert.equal(p.subSize(), SUB_SIZES.length - 1);
  assert.equal(storage.m.get(SUB_SIZE_KEY), String(SUB_SIZES.length - 1));
  assert.equal(heard.length, 12);
  const back = createPrefs({ storage: () => memoryStorage({ [SUB_SIZE_KEY]: "99", [SUB_EN_KEY]: "on" }) });
  assert.equal(back.subSize(), -1);  // out of range: the default
  assert.equal(back.bilingual(), true);
});

test("blocked or full storage: the choices hold in memory for this page", () => {
  for (const storage of [() => throwing, () => null, () => { throw new Error("SecurityError"); }]) {
    const p = createPrefs({ storage });
    assert.equal(p.engine(), "cloud");
    p.setEngine("local");
    p.setTheme("light");
    p.setBilingual(true);
    p.stepSubSize(-1);
    assert.deepEqual([p.engine(), p.theme(), p.bilingual(), p.subSize()], ["local", "light", true, 2]);
  }
});
