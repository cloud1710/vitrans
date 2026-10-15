// The remembered "Giao diện" choice (web/prefs.js THEME_KEY: light / dark; none = the system's) on the page root before
// the first paint, so a page chosen dark never flashes light. A classic script in <head>; prefs.js does the rest.
(function () {
  try {
    var t = localStorage.getItem("vitranslate-theme-v1");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* storage blocked: the system's scheme */ }
})();
