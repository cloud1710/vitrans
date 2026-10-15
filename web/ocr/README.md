# web/ocr -- on-device OCR (spec Amendment H)

Shared by the image tool (`/anh/`) and the PDF reader (scanned pages). Images never leave the device; the module only
returns text and boxes.

```js
import { loadOcr } from "/ocr/ocr.js";
const ocr = await loadOcr({ onProgress, signal });   // first use: ~27-29 MB, then the browser cache
const r = await ocr.recognize(source, { signal });   // ImageBitmap | canvas | ImageData | <img>
// r = { width, height, lines: [{ text, box: [x0, y0, x1, y1], quad: [[x, y] x 4], score, span }] }, reading order;
// span = [start, end] of the read text along the box (fractions of its length, from the CTC steps)
// ocr.backend = "webgpu" | "wasm"; loadOcr({ backend: "wasm" }) skips WebGPU
```

Pipeline (PaddleOCR's, no OpenCV): `pre.js` (detection input: long side <= 960, multiples of 32, BGR, ImageNet
mean / std; recognition input: each box cut along its rectangle, height 48, batches of 6 by width), `db.js` (DB
post-processing: thresh 0.3, box_thresh 0.6, unclip_ratio 1.5, min-area rectangles), `order.js` (reading order),
`ctc.js` (CTC greedy decoding, drop_score 0.5). Runtime, two backends of onnxruntime-web 1.30.0:
- WebGPU (the JSPI build) when the browser has WebGPU, JSPI (`WebAssembly.Suspending`: Chrome / Edge 137+) and a GPU
  adapter, and the engine reads a known line (`SELF_TEST_TEXT`, drawn on a canvas) back; otherwise, or when it fails
  to start, the WebAssembly runtime is fetched and used instead (`ocr.fallback` says why);
- WebAssembly, one thread, inference in its own same-origin module worker (`env.wasm.proxy`), so the page stays
  responsive (Safari, Firefox, older Chrome, no GPU).

Error codes: `ocr_unsupported`, `ocr_download`, `ocr_integrity`, `ocr_runtime` (OcrError.code); aborts are
AbortError.

CSP (web/_headers): `script-src 'self' 'wasm-unsafe-eval'`; the worker is the runtime's own file on this origin
(worker-src falls back to script-src 'self'), no blob: URL, no other host.

## Files, sources, licences

| File | Bytes | sha256 | Source | Licence |
|---|---|---|---|---|
| `models/pp-ocrv5-mobile-en/det.onnx` | 4,826,518 | `a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d` | PaddlePaddle/PP-OCRv5_mobile_det (Hugging Face, commit 0d63e78e2b680928f6b1747d76a08db6e645efb7, 2025-07-22) converted with paddle2onnx 2.1.0 (paddlepaddle 3.1.1, default opset, constant folding) | Apache-2.0 (`models/pp-ocrv5-mobile-en/LICENSE`, PaddleOCR's) |
| `models/pp-ocrv5-mobile-en/rec.onnx` | 7,874,456 | `498c10d6816df8c6b087cf4ebaed9591a8d6e90d5edd7115af48e1b869ab5b7c` | PaddlePaddle/en_PP-OCRv5_mobile_rec (Hugging Face, commit 267c36e24c331595590fe7bd72bde2436fd286f2, 2025-08-29), same conversion | Apache-2.0 |
| `models/pp-ocrv5-mobile-en/dict.txt` | 1,416 | `e025a66d31f327ba0c232e03f407ae8d105e1e709e7ccb3f408aa778c24e70d6` | `PostProcess.character_dict` of the rec model's inference.yml, one entry per line (436 entries; identical to PaddleOCR's `ppocrv5_en_dict.txt`); the model's 438 classes = blank + these + space | Apache-2.0 |
| `vendor/onnxruntime-web-1.30.0/ort.wasm.min.js` | 50,126 | `219e6a1fc8a9938268d18efca3c91d310bd2f4a59bbd13744df5b2b7fc6cee3b` | npm onnxruntime-web@1.30.0 (2026-09-14) `dist/ort.wasm.min.mjs`, renamed .js only | MIT (`vendor/onnxruntime-web-1.30.0/LICENSE`, the v1.30.0 tag's; the bundled components' notices: https://github.com/microsoft/onnxruntime/blob/v1.30.0/ThirdPartyNotices.txt -- not copied here: its contributor e-mail addresses trip the deploy's private-data scan) |
| `vendor/onnxruntime-web-1.30.0/ort-wasm-simd-threaded.js` | 24,381 | `e13f7f94fc51b4ca72b12faeb1ee95f4ace6dfbc8939bc718aabdc0a27c4299b` | same package, `dist/ort-wasm-simd-threaded.mjs`, renamed .js | MIT |
| `vendor/onnxruntime-web-1.30.0/ort-wasm-simd-threaded.wasm` | 14,239,897 | `3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2` | same package, `dist/ort-wasm-simd-threaded.wasm` | MIT |
| `vendor/onnxruntime-web-1.30.0/ort.jspi.min.js` | 66,511 | `bc57179d923fda2d88d4a395359c8df44399dde087bf9ff44fc0e40ab398e4d9` | same package, `dist/ort.jspi.min.mjs` (WebGPU EP), renamed .js | MIT |
| `vendor/onnxruntime-web-1.30.0/ort-wasm-simd-threaded.jspi.js` | 50,918 | `270e2c6da9f297239d301d329782b6446641cb1e16a77967690adcfca35f3268` | same package, `dist/ort-wasm-simd-threaded.jspi.mjs`, renamed .js | MIT |
| `vendor/onnxruntime-web-1.30.0/ort-wasm-simd-threaded.jspi.wasm` | 16,758,545 | `a54c76f86b0f0d9572380cf1c6292a7b3903716ffcbcd6b0e5c7050bf430eb93` | same package, `dist/ort-wasm-simd-threaded.jspi.wasm` | MIT |

Source files of the conversion (sha256): det inference.json `05feef1a...`, inference.pdiparams `afa1820c...`,
inference.yml `98069072...`; rec inference.json `fd1b6ec7...`, inference.pdiparams `3ec8a97e...`, inference.yml
`27e91d05...`. Check of the conversion: the ONNX models and the Paddle inference models on the same random inputs
(det 1x3x320x480 and 1x3x640x96, rec 1x3x48x320 and 2x3x48x200): largest absolute difference 1.3e-7 (det) and
3.0e-6 (rec).

The models are loaded by `fetch` and checked against these sha256 values (ocr.js `OCR_FILES` / `ORT_FILES` /
`ORT_GPU_FILES`; a Node test checks them against the files); the runtime's binary is handed to it
(`env.wasm.wasmBinary`), so it is downloaded once and checked too. A browser downloads one runtime binary (14.2 or
16.8 MB), both only after a failed WebGPU start. Every file is under Cloudflare Pages' 25 MiB limit; not shipped:
`ort.webgpu` (its 25.5 MiB asyncify binary is over it) and the JSEP build (27 MiB). When a file changes, change its
folder name (models are cached by URL).

Measured on this PC (Chrome, headless, RTX 5080; synthetic images, detection side 960): clean renders CER 0.00 %
on both backends; the 2048 x 1536 camera-like photo 1.2-1.3 s with WASM (page stall <= ~100 ms thanks to the
worker), 0.13-0.27 s with WebGPU after its warm-up (~0.8 s, the first image); renderer peak working set ~430 MB
(WASM) / ~335 MB (WebGPU, plus ~370 MB in the GPU process). Phones are not measured yet.

## Tests

- `node --test web/ocr/tests` -- pre-processing, DB post-processing, reading order, CTC, the pipeline with scripted
  models, the pinned files, the CER helper.
- `node web/ocr/tests/accuracy.mjs [--sides 960,1280,1600]` -- the real engine in Chrome under the site's CSP on
  synthetic images (`tests/synthetic.js`: slide, body text, table, rotated +3 / -5 degrees, low contrast, 16 px text,
  a camera-like 2048 x 1536 photo) on both backends (`--backends auto,wasm`): character error rate per case, time,
  the page's longest stall, renderer and GPU process memory.
