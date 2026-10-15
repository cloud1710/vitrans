# Vendored libraries and fonts of the PDF path (web/pdf)

Served from this origin only (the page's CSP stays `default-src 'self'`); loaded on demand by `web/pdf/libs.js` when
a PDF job starts. `web/pdf/tests/vendor.test.mjs` checks every file below against its sha256.

| File | Source | Licence | sha256 |
|---|---|---|---|
| pdfjs-6.3.289/pdf.min.js | npm `pdfjs-dist@6.3.289` `legacy/build/pdf.min.mjs` (renamed .js: served as JavaScript everywhere) | Apache-2.0 (LICENSE) | f401927e692efc7735e0cd528c490d0dd31b7f0972c122b7040df805be45cce4 |
| pdfjs-6.3.289/pdf.worker.min.js | same package, `legacy/build/pdf.worker.min.mjs` (module worker) | Apache-2.0 | a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e |
| pdfjs-6.3.289/wasm/jbig2_nowasm_fallback.js | same package, `wasm/` (JBIG2 / CCITT decoder without WebAssembly: pdf.js runs with `useWasm: false`) | BSD-3 (PDFium) + Apache-2.0 (wasm/LICENSE_*) | 04c795a6657a4553a64b781ea3e85256203d913c3b71b72b85fa3ce00622f458 |
| pdfjs-6.3.289/wasm/openjpeg_nowasm_fallback.js | same package, `wasm/` (JPEG 2000 decoder without WebAssembly) | BSD-2 (OpenJPEG) + BSD (wasm/LICENSE_*) | 0f998419819da4491d8302222aa9e2ff2494685641aa2a6c21c3760c29f3e319 |
| pdf-lib-1.17.1/pdf-lib.esm.min.js | npm `pdf-lib@1.17.1` `dist/pdf-lib.esm.min.js` (self-contained ES module) | MIT (LICENSE.md) | 72c052d97b4d5d9fa6cdbdcb7ad709f03d4ddb1122390cb3afeba4d88651d969 |
| fontkit-1.1.1/fontkit.umd.min.js | npm `@pdf-lib/fontkit@1.1.1` `dist/fontkit.umd.min.js` (loaded as a classic script: defines `self.fontkit`) | MIT (package.json; fontkit, Copyright Devon Govett) | d8df561b9fba98e24f2e5130e40948809281bbbc55a20c412359f1a0a5eb35a6 |

pdf.js 6.3.289 was published on 2026-08-29 (6.4.299 of 2026-10-03 was under two weeks old when this was vendored).

## Fonts (../fonts)

Noto Sans and Noto Serif, Regular / Bold / Italic / BoldItalic, from
https://github.com/notofonts/notofonts.github.io (`fonts/NotoSans/unhinted/ttf/`, `fonts/NotoSerif/unhinted/ttf/`),
SIL Open Font License 1.1 (../fonts/OFL.txt; no reserved font name). Subset with fontTools 4.66.1 to Latin,
Vietnamese, Greek and punctuation, without layout tables (pdf-lib's text encoding then maps one character to one glyph,
so the text copied from the PDF is right):

    python -m fontTools.subset <face>.ttf --unicodes="U+0000-024F,U+0300-036F,U+0370-03FF,U+1E00-1EFF,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-214F,U+2150-218F,U+FFFD" --layout-features='' --no-layout-closure --name-IDs='*' --name-languages='*' --notdef-outline

The subsets are small enough for short glyph offsets (head.indexToLocFormat 0): fontkit 1.1.1, which pdf-lib subsets
with at write time, draws long-offset fonts as stray letters. Characters outside the subsets (for example the
mathematical signs) are drawn with the standard Symbol font where it has them.

| Face | sha256 |
|---|---|
| NotoSans-Regular.ttf | 4b1459187ba997b40ca7426457b3c22e68a99f279509f2b64acb984ed083c8c7 |
| NotoSans-Bold.ttf | 8ec66a09b8f82c8c764e827eba9e1c20c912baffb2a17fa00a6f5083580e8648 |
| NotoSans-Italic.ttf | a9264cabe717c7f9b2f868e40fa1deeb73c288f98264f794b85e3cb1d90d5c05 |
| NotoSans-BoldItalic.ttf | b82c8bab8ed3f757029b6f7798c2604407c4e9913c959a8eac5467c0d234891e |
| NotoSerif-Regular.ttf | 591b55dd4f231559a3c49b10f0271301aa503710c59c688f9562fce4b540e58e |
| NotoSerif-Bold.ttf | 53675925741c5c47e8de1284dd16caeb7698c16aaf3fd931c402d604f9b2de33 |
| NotoSerif-Italic.ttf | 393bb1baf12b75754011f6c356c6b0614b93067c4db3f45ed783b1f762dc3952 |
| NotoSerif-BoldItalic.ttf | 058dacbcdb6ffd851123f4eb49af69eaa4ee686b1f1a7ac16a5f1baa879241d9 |
