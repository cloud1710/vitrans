// The menu's choices, remembered in this browser (localStorage; every access wrapped: blocked or full storage keeps
// the choice in memory for this page):
//   engine   "cloud" (Máy chủ) | "local" (Trên máy): one choice for the five tools, nothing automatic (his words
//            2026-10-15 14:38). The key and values of the old "Dịch trên máy" switch of app.js (ENGINE_KEY), so a
//            user who had it on keeps it; on the helper's own page (127.0.0.1) the default is "local".
//   theme    "light" | "dark" | "auto" (Theo máy): data-theme on the page root (style.css; theme.js applies it before
//            the first paint).
//   sub      Song ngữ and the text size of the live subtitles (the keys the live tool already used).
// on(name, fn) hears a change made on this page (engine, theme, sub). No DOM here but applyTheme(root).
import { ENGINE_KEY, localMode } from "./advice.js";
import { helperPageOf } from "./helper.js";

export const THEME_KEY = "vitranslate-theme-v1";
export const SUB_EN_KEY = "vitranslate-live-en-v1";
export const SUB_SIZE_KEY = "vitranslate-live-size-v1";
export const SUB_SIZES = [1.2, 1.45, 1.7, 1.9, 2.3, 2.8, 3.4];  // rem
const SUB_DEFAULT_STEP = 3;  // the first A- / A+ steps from here
const ENGINES = ["cloud", "local"];
const THEMES = ["light", "dark", "auto"];

/** The engine of a stored value (ENGINE_KEY): "local" only when picked (or on the helper's own page). */
export function engineChoice(stored, helperPage) {
  return localMode(stored, helperPage) ? "local" : "cloud";
}

export function themeChoice(stored) {
  return THEMES.includes(stored) ? stored : "auto";
}

/** data-theme on the root for Sáng / Tối; none for Theo máy (the system's scheme, style.css). */
export function applyTheme(root, choice) {
  if (!root) return;
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else root.removeAttribute("data-theme");
}

/** opts: { storage () -> a localStorage-like object (default globalThis.localStorage), helperPage }. */
export function createPrefs(opts) {
  const o = opts || {};
  const memory = new Map();  // what this page set, whatever the storage did with it
  const listeners = { engine: new Set(), theme: new Set(), sub: new Set() };
  const storage = () => {
    try { return o.storage ? o.storage() : globalThis.localStorage; } catch (e) { return null; }
  };
  function read(key) {
    if (memory.has(key)) return memory.get(key);
    try { const st = storage(); return st ? st.getItem(key) : null; } catch (e) { return null; }
  }
  function write(key, value) {
    memory.set(key, value);
    try { const st = storage(); if (st) st.setItem(key, value); } catch (e) { /* the memory copy holds */ }
  }
  function emit(name, value) {
    for (const fn of listeners[name]) {
      try { fn(value); } catch (e) { /* a listener's problem */ }
    }
  }
  const subSize = () => {
    const raw = read(SUB_SIZE_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 0 && n < SUB_SIZES.length ? n : -1;
  };

  return {
    engine: () => engineChoice(read(ENGINE_KEY), !!o.helperPage),
    setEngine(v) {
      if (!ENGINES.includes(v) || v === this.engine()) return;
      write(ENGINE_KEY, v);
      emit("engine", v);
    },
    theme: () => themeChoice(read(THEME_KEY)),
    setTheme(v) {
      const t = themeChoice(v);
      write(THEME_KEY, t);
      emit("theme", t);
    },
    bilingual: () => read(SUB_EN_KEY) === "on",
    setBilingual(on) {
      write(SUB_EN_KEY, on ? "on" : "off");
      emit("sub");
    },
    subSize,
    stepSubSize(d) {
      const cur = subSize();
      const next = Math.max(0, Math.min(SUB_SIZES.length - 1, (cur < 0 ? SUB_DEFAULT_STEP : cur) + d));
      write(SUB_SIZE_KEY, String(next));
      emit("sub");
    },
    on(name, fn) {
      listeners[name].add(fn);
      return () => listeners[name].delete(fn);
    },
  };
}

/** The page's one set of choices (the menu writes them, every tool reads them). */
export const prefs = createPrefs({ helperPage: helperPageOf(globalThis.location) });
