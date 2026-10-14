fflate 0.8.2 (MIT, see LICENSE), file `esm/browser.js` of the npm package, byte-identical to
https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js.

sha256 browser.js: 8cc1f687e0159e977addb6b85e274dbd11e622cf151f4fcb7b85d49622ea43e7
sha256 LICENSE: 805f6cb28bb8b6d3a0badd83c93bccd9671fa01a3b4b92b7042b0743325ac243

Vendored so the page loads it from its own origin (CSP default-src 'self', no import map); the Node tests import the
same file. Only inflateSync / deflateSync are used (web/engine/ooxml/zip.js, package.js).
