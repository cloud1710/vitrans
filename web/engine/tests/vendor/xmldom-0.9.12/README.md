@xmldom/xmldom 0.9.12 (MIT, see LICENSE): `LICENSE` and `lib/*.js` of the npm package
(https://registry.npmjs.org/@xmldom/xmldom/-/xmldom-0.9.12.tgz, integrity
sha512-5AXjrcMClTryPe9LgZrygpB1lj7s0S9E0+W+AHaVKAVyHanafK86iPSvG5xHVSp/jC+VH1UXu0TAEmY279xH7A==), byte-identical.
`package.json` here is ours: it only marks the CommonJS files as CommonJS inside web/engine (an ES module package).

sha256 LICENSE: 4da724fc305d81606b245b324d4d2586916b9d248b23d82183df753ace0fdf71
sha256 lib/conventions.js: da57fbe2b07f5a4aaee9217b49778936c11a1108da1761b2f24f356a900ff124
sha256 lib/dom-parser.js: 4188e24b953e2c70b66150306c66547495ad968d040e31dd65f22a7b3485da28
sha256 lib/dom.js: bea9ba89adfec227e9e572ee934a48223a170c5cf96b7087d7e3d3023ac47be3
sha256 lib/entities.js: ef333b680379392e8ee120e1cc77e0a8ff99a135e3b365b048f69c0df5f571f9
sha256 lib/errors.js: 3e97f9c4f0a189346e2621b29c7c5a3899cd7375d1d15cbfbddd044fb781cb9f
sha256 lib/grammar.js: 144f27b46adfb4a139adeb7483820def568b3940a6893194c03f5a71a94babc0
sha256 lib/index.js: 418c42598a45290498f4350b6b6f531ceeb25e8d4d9a107db2448a1c0b5b784e
sha256 lib/sax.js: 324e8a0c7b475c645efcd1736b634733e133150849bff741fa0e2215e7017d02

Test-only: the DOMParser of the Node tests (tests/dom-node.mjs); the page uses the browser's own. Vendored so the
tests run on a fresh checkout without `npm ci` (a missing node_modules made the first run of a new worktree fail);
build_site.py leaves every tests/ folder out of the deploy.
