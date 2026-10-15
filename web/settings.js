// The ⋮ menu's DOM (index.html #menu, #log-view) wired to the page's choices (web/prefs.js) and log (web/log.js):
// "Dịch bằng" (Máy chủ / Trên máy; locked while a job runs), "Trên máy" (shown with Trên máy only: the read-back pass
// and the fast draft, which app.js reads), "Phụ đề" (Song ngữ, text size; the live tool follows), "Giao diện" and
// "Nhật ký" (the log lines, Sao chép, Xóa). -> { lockEngine(on), menu }
import { createMenu } from "./shell.js";
import { prefs, applyTheme, SUB_SIZES } from "./prefs.js";
import { pageLog } from "./log.js";

const $ = (id) => document.getElementById(id);

export function initSettings() {
  const menu = createMenu({ button: $("menu-btn"), panel: $("menu"),
    onToggle: (open) => document.body.classList.toggle("menu-open", open) });
  const engines = Array.from(document.querySelectorAll('#menu input[name="engine"]'));
  const themes = Array.from(document.querySelectorAll('#menu input[name="theme"]'));

  const showEngine = () => {
    for (const r of engines) r.checked = r.value === prefs.engine();
    $("local-options").hidden = prefs.engine() !== "local";
  };
  for (const r of engines) r.addEventListener("change", () => { if (r.checked) prefs.setEngine(r.value); });
  prefs.on("engine", (v) => {
    showEngine();
    pageLog.add({ tool: "page", op: "engine", code: v });
  });
  showEngine();

  const showSub = () => {
    $("menu-bilingual").checked = prefs.bilingual();
    const k = prefs.subSize();
    $("menu-smaller").disabled = k === 0;
    $("menu-bigger").disabled = k === SUB_SIZES.length - 1;
  };
  $("menu-bilingual").addEventListener("change", () => prefs.setBilingual($("menu-bilingual").checked));
  $("menu-smaller").addEventListener("click", () => prefs.stepSubSize(-1));
  $("menu-bigger").addEventListener("click", () => prefs.stepSubSize(1));
  prefs.on("sub", showSub);
  showSub();

  const showTheme = () => {
    for (const r of themes) r.checked = r.value === prefs.theme();
    applyTheme(document.documentElement, prefs.theme());
  };
  for (const r of themes) r.addEventListener("change", () => { if (r.checked) prefs.setTheme(r.value); });
  prefs.on("theme", showTheme);
  showTheme();

  // Nhật ký: the lines as they come while the view is open
  const dlg = $("log-view");
  const render = () => {
    if (!dlg.open) return;
    const ol = $("log-lines");
    const lines = pageLog.lines();
    ol.replaceChildren(...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }));
    ol.hidden = !lines.length;
    $("log-empty").hidden = lines.length > 0;
    ol.scrollTop = ol.scrollHeight;
  };
  pageLog.onChange(render);
  $("menu-log").addEventListener("click", () => {
    menu.close(false);
    $("log-copied").textContent = "";
    dlg.showModal();
    render();
  });
  $("log-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pageLog.text());
      $("log-copied").textContent = "Đã sao chép.";
    } catch (e) {
      $("log-copied").textContent = "Trình duyệt không cho sao chép tự động.";
    }
  });
  $("log-clear").addEventListener("click", () => {
    pageLog.clear();
    $("log-copied").textContent = "";
  });
  // closed (Đóng or Esc): the focus back on the menu's button
  $("log-close").addEventListener("click", () => {
    dlg.close();
    $("menu-btn").focus();
  });
  dlg.addEventListener("close", () => $("menu-btn").focus());

  return {
    menu,
    lockEngine(on) { for (const r of engines) r.disabled = on; },
  };
}
