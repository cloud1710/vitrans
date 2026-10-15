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
- **Windows installer (local mode):** per-user `ViTranslate-Setup.exe`, see [Install on Windows](#install-on-windows)
  and [installer/README.md](installer/README.md).
- **macOS installer (local mode, Apple silicon):** unsigned `ViTranslate-macOS.dmg` built by GitHub Actions, see
  [Install on macOS](#install-on-macos).
- **Not yet:** PDF input, measured text fit, learner / term sync. The in-browser model engine (LiteRT-LM, Gemma 4
  E2B / E4B in WebGPU) is paused; the measurement lab stays at `/lab/`.

## Phones and tablets

The cloud mode works in the browser of any phone or tablet: the file is read and written on the device and only the
text goes to the API, so there is no model download. The local mode needs the helper on a Windows PC or an
Apple-silicon Mac.

## Privacy

- **Cloud mode:** only the text of the document (segment by segment, no images, no file) is sent to the translation
  API on Cloudflare. Nothing is stored except counters (requests per day / month, no text); the text is not logged.
  Only if the user chooses to send them after the term review, term pairs (English term, Vietnamese, pack) are kept
  for the author -- never a sentence, the document's text or its name. Cloudflare's Workers AI terms: customer content
  is not used to train models. Do not send documents with patient-identifying data in this mode.
- **Local mode:** everything runs on your machine; the page and the helper never send document content anywhere. The
  only network requests the helper may make are plain downloads of glossary pack files from a pack registry (none is
  configured by default) and, in the installed helper's first-run setup, the download of Ollama (official GitHub
  release, pinned version and SHA-256; only when no Ollama is running) and of the recommended model through Ollama.

## Install on Windows

Download `ViTranslate-Setup.exe` (and its SHA-256 in `SHA256SUMS.txt`) from the
[latest release](https://github.com/cloud1710/vitrans/releases/latest) and run it: per-user, no administrator
rights. The installer is not code-signed, so Windows SmartScreen may warn:
"Windows protected your PC" -> click "More info" -> "Run anyway".

On its first start the helper reuses an Ollama already running on this PC, or downloads its own copy (~1.5 GB) into
`%LOCALAPPDATA%\ViTranslate`, then the model for this device (~5-7 GB); progress shows on the page. Uninstalling
(Settings > Apps) removes the app and `%LOCALAPPDATA%\ViTranslate`, models included; an Ollama you installed yourself
is not touched. Details, build and release steps: [installer/README.md](installer/README.md).

## Install on macOS

Apple-silicon Macs (M1 or later, macOS 14+): download `ViTranslate-macOS.dmg` (SHA-256 in `SHA256SUMS-macOS.txt`)
from the [latest release](https://github.com/cloud1710/vitrans/releases/latest), drag ViTranslate.app into
Applications and open it. The app is not signed or notarized by Apple, so the first open is blocked: System
Settings -> Privacy & Security -> "Open Anyway" (enter your password, then "Open Anyway" again). Then it works like
the Windows helper: it reuses a running Ollama (Ollama.app, port 11434) or downloads its own copy (~160 MB) into
`~/Library/Application Support/ViTranslate`, then the model for this Mac (16 GB or more: Gemma 4 E4B on the GPU;
8 GB: Gemma 4 E2B). No Dock icon; logs in `~/Library/Logs/ViTranslate`. Uninstall: "Uninstall ViTranslate.command"
in the disk image, or see [installer/README.md](installer/README.md#macos).

Máy Mac chip Apple (M1 trở lên, macOS 14+): tải `ViTranslate-macOS.dmg`, kéo ViTranslate.app vào Applications rồi
mở. Ứng dụng chưa ký số với Apple nên lần đầu bị chặn: System Settings (Cài đặt hệ thống) -> Privacy & Security
(Quyền riêng tư & Bảo mật) -> "Open Anyway" (Vẫn mở), nhập mật khẩu, bấm "Open Anyway" lần nữa.

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
  502 `model_error`, 503 `turnstile_unavailable`, 500 `server_misconfigured` / `server_error` (the admin API also: 403
  `forbidden`, 404 `not_found`, 503 `admin_not_configured` / `access_unavailable`). Same origin only: no CORS headers
  (a server-side caller such as the helper sends no `Origin`).
- Term review and feedback to the author (`/api/v1/terms`, `/api/v1/feedback`, the review page): see the next section.

Privacy of the cloud mode: nothing is stored but counters (KV namespace `COUNTERS`: numbers per day and month, keyed
by a random session id or a keyed hash of the client IP -- never the IP, never text) and the term pairs a user chooses
to send (D1, next section). Request bodies, segments and
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

Tests: `node --test "tests/functions/*.test.mjs"` (no network: fake KV, AI binding and siteverify, an in-memory D1 over
Node's built-in SQLite with `migrations/` applied, Access certs made in the test, the real core);
`cd helper && "$PY" -m pytest -q tests/test_bundle_packs.py`; `"$PY" -m pytest -q tests/tools`;
`"$PY" tests/functions/export_helper_parity.py` re-exports the parity fixture from the helper.

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

## Term review and feedback (spec Amendment G)

After a job the page can list the document's new terms with the Vietnamese the translation used, let the user correct
them in the file, and send the term pairs to the author:

| Endpoint | Body | Answer |
|---|---|---|
| `POST /api/v1/terms` | `{session, job_id, setup, setup_id?, items: [{id, src, vi}]}`: the segments' English plain text and their translation, at most 200 items / 60,000 characters | `{terms: [{en, vi, count, ids}], usage}` |
| `POST /api/v1/feedback` | `{session, items: [{en, vi_used, vi_user, pack, kind: "new" or "fixed"}]}`, at most 50 | `{ok: true, stored}` |
| `GET /admin/api/feedback?status=` | `new`, `approved`, `rejected` or `all` (default) | `{rows: [{key, en, vi_used, vi_user, pack, kind, count, first_day, last_day, status}]}` |
| `POST /admin/api/decide` | `{key, decision: "approved" or "rejected"}` | `{ok, key, status}` |

- `/terms`: one call of the translation model per 20,000 characters (thinking off, strict JSON; an answer in a code
  fence or after a preface is repaired, anything else is 502 `model_error`). A term is kept when its English is in a
  segment (the core's glossary matcher: plurals, US / UK spellings), its Vietnamese is in the same segment's
  translation and it is not a glossary key of the job's packs (`setup`; the glossary hits are named in the prompt as
  known); `ids` = the segments that hold the pair, `count` = occurrences of the English term in them. Counted like
  `/translate` (profile `file`): the neurons on the day's budget, one segment per started 2,000 characters of src + vi
  on the session and IP quotas (`TERMS_CHARS_PER_UNIT`). Measured locally (3 synthetic segments): one call, about
  300 prompt and 110 answer tokens, 4-6 neurons, 3 s.
- `/feedback`: term pairs only -- `en` at most 80 and each Vietnamese at most 120 characters (a sentence is refused),
  `pack` = a pack id of the deployment, no other field (no sentence, no document text, no file name). Stored in the D1
  database `vitrans-feedback` (binding `FEEDBACK`, schema `migrations/`): one row per (en, vi_user, pack, kind)
  ignoring case and spacing, with count, first / last UTC day and the review status (`new`, `approved`, `rejected`).
  At most 500 rows per client IP per UTC day (`FEEDBACK_ROWS_PER_DAY`), counted under the session's keyed IP hash --
  never the IP; counts older than yesterday are removed. Beyond it: 429 `quota_exceeded`.
- Review page `/admin/` (`web/admin/`): the rows of a status, most frequent first, "Duyệt" / "Bỏ". The page and its
  API (`/admin/api/*`) sit behind a Cloudflare Access application (his e-mail only), and the Functions check the
  Access login again: the `Cf-Access-Jwt-Assertion` JWT must be RS256, signed by a key of
  `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (cached per isolate, fetched again for a new key id),
  with that issuer, `ACCESS_AUD` in its audience, a valid time and an e-mail of `ADMIN_EMAILS`. Without `ACCESS_AUD`,
  `ACCESS_TEAM` and `ADMIN_EMAILS` the admin API is closed (503 `admin_not_configured`); a refused login is 403
  `forbidden` with a short reason (for example: the e-mail of this Access login is not on the admin list).
- Approved rows: `"$PY" tools/pull_feedback.py` (a wrangler login with D1 access) writes
  `out/feedback/approved-<UTC date>.json`; they reach a pack only through the normal pack work (evidence note "user
  feedback, n users", tests, `tools/check_packs.py`, eval) and a deploy.

Setup: the database was made with `npx wrangler@4.150.0 d1 create vitrans-feedback`; the schema goes in with
`npx wrangler@4.150.0 d1 migrations apply vitrans-feedback --remote` (`--local --persist-to <dir>` for `wrangler pages
dev`). Cloudflare Access: Zero Trust -> Access controls -> Applications -> a self-hosted application for
`vitrans.pages.dev` with the path `admin` (it covers `/admin/*`, the API included), policy Allow -> Include -> Emails
-> the author's e-mail; the AUD tag is under the application's Configure -> Additional settings ("Application Audience
(AUD) Tag"), the team domain under Zero Trust -> Settings. Then the secrets per environment (`npx wrangler pages
secret put <NAME> --project-name vitrans [--env preview]`): `ACCESS_AUD`, `ACCESS_TEAM` (`<team>.cloudflareaccess.com`)
and `ADMIN_EMAILS` (comma-separated). Preview deployments are not behind Access: their admin API answers 403.

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
