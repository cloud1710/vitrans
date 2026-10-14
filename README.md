# ViTranslate

English -> Vietnamese translation of text, DOCX and PPTX that **keeps the original formatting** (runs, links,
tables, images, layout). Built for medical documents (pathology first) with glossary packs. Two modes:

- **Cloud (default):** the page reads and writes the file in the browser and sends only the text segments to the
  translation API on Cloudflare (Pages Functions + Workers AI, Gemma 4 26B A4B). Works in any modern browser,
  phones and tablets included; nothing to install.
- **On this machine ("Dịch trên máy"):** the local helper (FastAPI on `127.0.0.1`) with Gemma 4 / Qwen 3.5 through
  Ollama; the document never leaves the machine.

> **Dịch tài liệu Anh -> Việt, giữ nguyên định dạng.** Không đăng nhập. Bản dịch do AI tạo ra và có thể sai: chuyên
> gia cần duyệt trước khi sử dụng, nhất là tài liệu y khoa. Không gửi tài liệu có thông tin định danh người bệnh lên
> chế độ máy chủ; với những tài liệu đó, dùng chế độ dịch trên máy.

Web page: <https://vitrans.pages.dev>.

## Status

- **Works now (phase 1):** `.docx` and `.pptx`; a local helper (FastAPI, 127.0.0.1 only) with Ollama; tag ladder
  that keeps inline formatting (bold, italic, super/subscript, links, symbol fonts); QA (acronyms and codes kept,
  numbers, term-lock, English-left detection, sanity gates); translation memory; font coverage fallback; glossary
  packs with TF-IDF selection. GPU when there is enough free VRAM, otherwise CPU.
- **Models** (spec Amendment E, evaluation in [docs/eval/2026-10-14-gemma4-vs-qwen35.md](docs/eval/2026-10-14-gemma4-vs-qwen35.md)):
  `gemma4:e4b` (Gemma 4 E4B) on the GPU; `qwen3.5:9b` (Qwen 3.5 9B) on the CPU until Gemma is measured there;
  `gemma4:e2b` (Gemma 4 E2B) as the "fast draft" option on either device. Thinking is always off. Gemma sometimes
  writes symbols as LaTeX ("$\beta$") or leaves one English word: the QA gates retry, write LaTeX symbols as the
  characters and flag what is left.
- **Cloud mode (works now):** the same pipeline ported to JavaScript (web/engine, parity-tested against the helper)
  runs as the translation API on Cloudflare; the browser handles the OOXML. Acceptance on a 239-segment lecture deck:
  tag-exact 0.996, no silent English, the output opens in PowerPoint.
- **Not yet:** PDF input, installer (run from source for now), measured text fit, learner / term sync. The in-browser
  model engine (LiteRT-LM, Gemma 4 E2B / E4B in WebGPU) is paused; the measurement lab stays at `/lab/`.

## Phones and tablets

The cloud mode works in the browser of any phone or tablet: the file is read and written on the device and only the
text goes to the API, so there is no model download. The local mode needs the helper on a Windows PC.

## Privacy

- **Cloud mode:** only the text of the document (segment by segment, no images, no file) is sent to the translation
  API on Cloudflare. Nothing is stored except counters (requests per day / month, no text); the text is not logged.
  Cloudflare's Workers AI terms: customer content is not used to train models. Do not send documents with
  patient-identifying data in this mode.
- **Local mode:** everything runs on your machine; the page and the helper never send document content anywhere. The
  only network requests the helper may make are plain downloads of glossary pack files from a pack registry (none is
  configured by default).

## Run from source

Prerequisites:

- Python 3.11 env with `pip install -e helper[dev]`, used below as `PY=<path to the env python>`.
- Ollama with the model of your device: `ollama pull gemma4:e4b` (NVIDIA GPU with ~9 GB free VRAM) and / or
  `ollama pull qwen3.5:9b` (CPU only); optionally `ollama pull gemma4:e2b` (the "fast draft" option). When the
  recommended model is missing, the page's "Gợi ý cho máy này" card offers one download button; nothing is
  downloaded on its own.
- Microsoft Office only for the acceptance check that opens the outputs (`tools/com_open_check.ps1`).

Start: `cd helper && "$PY" -m vitranslate` prints the address it bound, for example `http://127.0.0.1:47831/` (first
free port of 47831-47835). Open it, or open <https://vitrans.pages.dev> which finds the helper on those ports.

Uploaded documents are removed from the helper's job folder as soon as the job ends; finished jobs can be deleted from
the result card, and job folders older than 24 hours are removed at startup.

## Glossary packs

See [docs/PACKS.md](docs/PACKS.md). Build a local registry from `packs/` and the helper uses it:

`"$PY" tools/build_registry.py packs out/registry` (add `--include-drafts` for the unreviewed organ packs)

The helper uses `VITRANSLATE_REGISTRY` when set (a folder or an https URL), else `out/registry` when it exists, else
none (translation still works with the style pack only).

## Translation API (Cloudflare Pages Functions)

Spec Amendment F: the shared JavaScript translation core (`web/engine/core.js`, the port of `helper/vitranslate`) also
runs as Pages Functions on the page's own origin (Pages project `vitrans`): routes in `functions/api/v1/`, code in
`functions/_lib/`. The server translates **text only**: the page reads and writes the document in the browser and
sends segments; files and images never reach it (only `application/json` bodies are accepted).

| Endpoint | Body | Answer |
|---|---|---|
| `POST /api/v1/session` | `{turnstile}` | `{session, expires_s, quota: {segments_left_today}}` |
| `POST /api/v1/classify` | `{session, text, domain?: [pack ids]}`; `text` = the whole document (the segments' plain text joined by newlines, at most 2 MiB) | the helper's `classify` event (each pack with its `version`) + `setup: {packs, hits}` + `setup_id` |
| `POST /api/v1/translate` | `{session, job_id, setup, setup_id?, profile?, segments: [{id, tagged, essential?, prev?, nxt?, where?}]}`, at most 20 segments | `{results: [{id, text, level, flags, cached, reduced, spans}], usage: {calls, prompt_tokens, cached_tokens, completion_tokens, neurons}, quota}` |
| `GET /api/v1/status` | | `{ok, model, budget_left_today, month_spent_usd}` |

- Helper parity: `/classify` runs `prepareTranslation` over the whole text (pack choice and glossary hits as the
  helper's `run_job`); `/translate` rebuilds the helper's system prompt from the `setup` it gets back (packs in merge
  order, at most 80 hits, each a glossary key of those packs), so every batch of a document carries the prompt the
  helper would use. `tests/functions/parity.test.mjs` checks prompts and decisions against `helper/vitranslate`.
  Plain text (the page's text mode) is a segment without tags: `essential: []`.
- Model: Workers AI `@cf/google/gemma-4-26b-a4b-it`, thinking off (`chat_template_kwargs.enable_thinking: false`;
  the model's default is on), temperature 0, the job id as `x-session-affinity` (prefix caching), retries on
  transient errors.
- Errors are JSON `{code, message}`: 400 `bad_request`, 401 `session_expired`, 403 `bad_turnstile` / `bad_origin`, 405,
  409 `packs_changed`, 413 `too_large`, 415 `unsupported_media_type`, 429 `quota_exceeded` / `budget_exhausted`,
  502 `model_error`, 503 `turnstile_unavailable`, 500 `server_misconfigured` / `server_error`. Same origin only: no
  CORS headers (a server-side caller such as the helper sends no `Origin`).

Privacy of the cloud mode: nothing is stored but counters (KV namespace `COUNTERS`: numbers per day and month, keyed
by a random session id or a keyed hash of the client IP -- never the IP, never text). Request bodies, segments and
model answers are never logged (errors are logged by code only) and every answer is `Cache-Control: no-store`.
Cloudflare does not use Workers AI inputs or outputs to train models or improve services and stores them only when a
storage product is used with it ([data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)).
Documents with patient identifiers belong in the local helper ("Dịch trên máy").

Abuse and cost limits (`wrangler.toml` `[vars]`):

- Turnstile, then an HMAC-signed session of 1 hour.
- Per UTC day: 1,500 segments per session and 3,000 per client IP (IPv6 per /64); a classify call counts one segment
  per started 10,000 characters.
- Budget of all users: 55,000 neurons per UTC day (10,000 free + 45,000 billed, about $0.50) and 1,363,000 billed
  neurons per UTC month ($15; with the $5 Workers Paid base, the $20 a month cap); live captions (`profile: "live"`)
  at most 50 % of the day's budget. Beyond them: 429 `budget_exhausted`.
- The counters are read, then written: concurrent requests can lose an increment and KV reads may lag up to 60 s
  between locations, so a cap can be overshot a little (one request is at most 20 segments). The free allocation is
  the account's: other Workers AI use on the same account is not counted.

Run locally: `"$PY" tools/bundle_packs.py --worktree` (writes `functions/_generated/packs.json`, git-ignored: the
non-draft packs as the registry ships them); a `.dev.vars` file (git-ignored) with
`TURNSTILE_SECRET=1x0000000000000000000000000000000AA` (Cloudflare's always-pass test secret), `SESSION_SECRET=<32+
random characters>` and `ALLOW_TEST_TURNSTILE=1`; then `npx wrangler@4.150.0 pages dev` at the repo root. The AI
binding always uses the account's real Workers AI (billed).

Tests: `node --test "tests/functions/*.test.mjs"` (no network: fake KV, AI binding and siteverify, the real core);
`cd helper && "$PY" -m pytest -q tests/test_bundle_packs.py`; `"$PY" tests/functions/export_helper_parity.py`
re-exports the parity fixture from the helper.

Deploy (a preview branch; production is the account owner's step):

```sh
"$PY" tools/build_site.py out/site --commit <sha>   # web/ + functions/ + the pack bundle + wrangler.toml, scanned
cd out/site && npx wrangler@4.150.0 pages deploy web --project-name vitrans --branch <preview branch>
```

Secrets per environment (`npx wrangler pages secret put <NAME> --project-name vitrans [--env preview]`):
`TURNSTILE_SECRET` and `SESSION_SECRET` (32+ random characters) in both; `ALLOW_TEST_TURNSTILE=1` in preview only,
never in production. Once a deploy carries `wrangler.toml`, it is the project's configuration (bindings and vars).

Measured on 2026-10-14 (preview, synthetic 300-segment slide deck): about 1 s per segment in batches of 20 (segments
run one after another), about 12 neurons per segment (about 1,300 prompt and 20 answer tokens per call), 63-90 % of
the prompt tokens served from the prefix cache (no discount on Gemma 4 26B's price list: it saves time, not money);
CPU per request: classify 28 ms warm (750 ms for the first request of an isolate, which compiles the regexes),
translate 6 ms for 1 segment to 143 ms for 20 (first batch of an isolate).

## Tests and acceptance tools

- Unit tests: `cd helper && "$PY" -m pytest -q` (no Ollama, no network).
- `tools/e2e.py [--fast] [--fake] [--device auto|cpu|gpu] [--files SUBSTR ...] [--polish auto|on|off]`: translates
  the files listed in `private/corpus.txt` (your own documents, git-ignored); `--fake` uses an echo model; `--polish`
  sets the read-back editor pass (default: on with a GPU, off on CPU) and every file also gets
  `<name>_vi_segments.json` (draft and final text per segment). Accept: tag-exact >= 0.95 per file, no paragraph
  silently left in English, no tag broken by the editor. The model is the job's: the device default, or the fast
  draft with `--fast`.
- `tools/eval_tags.py [model]`, `tools/eval_pack.py <pack_id> [model] [--family]` (model default: the device's),
  `tools/check_packs.py`.
- `powershell -NoProfile -File tools/com_open_check.ps1 -Dir out/e2e`: opens every output with PowerPoint / Word.

## License

AGPL-3.0 (see [LICENSE](LICENSE)). The models (Gemma 4, Qwen 3.5) are distributed by their authors under their own
licences and are not included in this repository.
