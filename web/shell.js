// The app shell's tool switcher: five tabs (role=tablist, arrow keys / Home / End, roving tabindex), "Văn bản" by
// default, the selected tool in the URL hash (#van-ban, #tai-lieu, #anh, #phu-de, #dich-duoi) so that links and the
// old /anh/ and /live/ addresses (their redirect pages) open it. Text, files and subtitles share one view run by
// app.js; the image and live tools have their own views, whose modules app.js loads when their tab first opens.
export const TOOLS = [
  { id: "text", slug: "van-ban", label: "Văn bản", view: "view-app" },
  { id: "file", slug: "tai-lieu", label: "Tài liệu", view: "view-app" },
  { id: "anh", slug: "anh", label: "Ảnh", view: "view-anh" },
  { id: "sub", slug: "phu-de", label: "Phụ đề", view: "view-app" },
  { id: "live", slug: "dich-duoi", label: "Dịch đuổi", view: "view-live" },
];
export const DEFAULT_TOOL = "text";
export const APP_TOOLS = TOOLS.filter((t) => t.view === "view-app").map((t) => t.id);

/** "#tai-lieu" (or "tai-lieu", "#file") -> "file"; anything unknown -> the default tool. */
export function toolFromHash(hash) {
  const key = String(hash || "").replace(/^#/, "").trim().toLowerCase();
  const t = TOOLS.find((x) => x.slug === key || x.id === key);
  return t ? t.id : DEFAULT_TOOL;
}

export function hashOf(id) {
  const t = TOOLS.find((x) => x.id === id);
  return "#" + (t ? t.slug : TOOLS[0].slug);
}

/** The tab a key moves to from index i of n (wrapping, skipping locked(i)); null for any other key. */
export function nextIndex(i, key, n, locked) {
  const skip = locked || (() => false);
  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (key === "Home" || key === "End") {
    const order = Array.from({ length: n }, (_, k) => (key === "Home" ? k : n - 1 - k));
    const k = order.find((x) => !skip(x));
    return k === undefined ? i : k;
  }
  if (!step) return null;
  for (let k = 1; k <= n; k++) {
    const j = (((i + step * k) % n) + n) % n;
    if (!skip(j)) return j;
  }
  return i;
}

/**
 * The ⋮ menu at the right end of the tab bar (his 2026-10-15 request: options in a Chrome-style menu): the button
 * opens and closes its panel (a drop-down on a desktop, a bottom sheet on a phone: style.css), focus goes to the
 * panel's checked choice; Esc closes it and gives focus back to the button; a click outside closes it (focus back to
 * the button unless the click went to a field or another control); Tab out of the panel closes it. o: { button,
 * panel, doc (document), onToggle (open) }. -> { open(), close(focusButton), isOpen() }
 */
export function createMenu(o) {
  const { button, panel } = o;
  const doc = o.doc || document;
  const isOpen = () => !panel.hidden;
  const CONTROLS = "input, textarea, select, button, a, [tabindex]";

  function set(open) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (o.onToggle) o.onToggle(open);
  }
  function open() {
    if (isOpen()) return;
    set(true);
    const first = panel.querySelector("input:checked") || panel.querySelector("input, button");
    if (first) first.focus();
  }
  function close(focusButton) {
    if (!isOpen()) return;
    set(false);
    if (focusButton) button.focus();
  }

  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => (isOpen() ? close(false) : open()));
  doc.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isOpen()) return;
    e.preventDefault();
    close(true);
  });
  doc.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (!isOpen() || panel.contains(t) || button.contains(t)) return;
    close(false);
    // after the press's own focus change (a click on plain page text leaves the focus on the body)
    if (!(t && t.closest && t.closest(CONTROLS))) setTimeout(() => button.focus(), 0);
  });
  panel.addEventListener("focusout", (e) => {
    const to = e.relatedTarget;
    if (to && !panel.contains(to) && !button.contains(to)) close(false);
  });
  return { open, close, isOpen };
}

/**
 * Wires the tabs of the page (#tools [role=tab][data-tool]) and their views. onChange(tool) runs for the first tool
 * (from the hash) and for every change. -> { current(), select(tool), lock(tools, on) }: locked tabs (a job of the
 * shared view running) cannot be opened.
 */
export function initTabs(opts) {
  const o = opts || {};
  const tabs = Array.from(document.querySelectorAll("#tools [role=tab]"));
  const locked = (i) => tabs[i].getAttribute("aria-disabled") === "true";
  let current = null;

  function select(id, focus) {
    const tool = TOOLS.find((t) => t.id === id) || TOOLS[0];
    const tab = tabs.find((t) => t.dataset.tool === tool.id);
    if (!tab || (locked(tabs.indexOf(tab)) && current !== null)) return false;
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    }
    for (const view of new Set(TOOLS.map((t) => t.view))) {
      const el = document.getElementById(view);
      if (el) el.hidden = view !== tool.view;
    }
    const v = document.getElementById(tool.view);
    if (v) v.setAttribute("aria-labelledby", tab.id);
    document.title = tool.id === DEFAULT_TOOL ? "ViTranslate" : "ViTranslate · " + tool.label;
    if (focus) tab.focus();
    const changed = current !== tool.id;
    current = tool.id;
    if (changed && o.onChange) o.onChange(tool.id);
    return true;
  }

  // the URL follows the tab (a new history entry, so Back returns to the previous tool)
  function open(id, focus) {
    if (!select(id, focus)) return;
    if (toolFromHash(location.hash) !== id || !location.hash) history.pushState(null, "", hashOf(id));
  }

  for (const t of tabs) t.addEventListener("click", () => open(t.dataset.tool, false));
  document.getElementById("tools").addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = nextIndex(i, e.key, tabs.length, locked);
    if (j === null) return;
    e.preventDefault();
    open(tabs[j].dataset.tool, true);
  });
  const follow = () => {
    const id = toolFromHash(location.hash);
    if (!select(id, false)) history.replaceState(null, "", hashOf(current));
  };
  window.addEventListener("hashchange", follow);
  window.addEventListener("popstate", follow);
  select(toolFromHash(location.hash), false);

  return {
    current: () => current,
    select: (id) => open(id, false),
    lock(ids, on) {
      for (const t of tabs) {
        if (on && ids.includes(t.dataset.tool) && t.dataset.tool !== current) t.setAttribute("aria-disabled", "true");
        else t.removeAttribute("aria-disabled");
      }
    },
  };
}
