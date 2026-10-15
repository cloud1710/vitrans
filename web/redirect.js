// The old tool addresses (/anh/, /live/) open their tab of the app shell; the query is kept (/anh/?ocr=wasm). The
// page's <meta http-equiv="refresh"> does the same without script.
(function () {
  var tab = /\/live(\/|$)/.test(location.pathname) ? "dich-duoi" : "anh";
  location.replace("../" + location.search + "#" + tab);
})();
