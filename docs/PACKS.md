# Glossary packs

ViTranslate's base translator ships **no glossary**. Domain terminology comes in **packs**: small, versioned bundles
that are selected per document, downloaded (or taken from the local cache) and merged into the prompt and the QA
term-lock. Only the pack file is fetched; no document content ever leaves the machine.

## Layout of a pack

```
packs/<id>/
  pack.json     {"id", "version", "name" (Vietnamese), "parent" (root pack id or absent), "draft" (optional),
                 "detect": [distinctive English keywords], "include": ["_shared/<name>"] (optional)}
  prompt.md     3-8 lines of domain voice in Vietnamese (register, what stays in English)
  glossary.csv  en,vi,note -- one row per English term; the note carries the evidence ("freq N; src: ...")
  rules.json    {"term_fixes": [{"en", "wrong": [...], "right"}]} -- deterministic VN->VN fixes, source-gated
  tests.jsonl   synthetic English sentences with "must" / "must_not" / "must_any" checks on the Vietnamese output
  sources.md    per term: Vietnamese variants found, counts and citations
```

`packs/_style` is the domain-neutral writing-style pack bundled with the helper. `packs/_shared/*.csv` hold rows that
several families must share; a pack pulls them in with `"include"` and the registry build expands them, so the helper
never sees includes.

## Selection and merging

- The registry manifest carries a TF-IDF profile per pack (glossary keys weight 1, `detect` keywords weight 2).
- A document selects a pack when the cosine score is >= 0.10, at least 3 distinct terms match and at least 2 of them
  are `detect` keywords. Matching tolerates plurals, hyphen / space variants, British / American spelling and
  -logy / -logic(al) forms.
- **Family rule:** a family is a root pack plus its selected children. At most 3 families and 6 packs per document,
  families ranked by their best score; a family that does not fit is dropped whole; a child is never used without its
  root; inside a family the child is merged before its parent, so the more specific pack wins.
- Merged packs feed: the system prompt (voice + the document's glossary hits), the term-lock (`term_fixes`) and the
  `glossary_miss` QA flag. The translation-memory key includes every selected pack key.

## Choosing the Vietnamese term

1. The variant most used in Vietnamese peer-reviewed medical literature, counted per term with citations.
2. Southern (Ho Chi Minh City) usage first; when the South has no form of its own, the Northern / national one.
3. English stays only when Vietnamese literature keeps it (gene and protein symbols, staging codes, named scores) or
   has no standard.
4. One owning pack per English key (`packs/_shared/owners.csv`); other packs either agree exactly or use longer,
   unambiguous keys. A child may override only its own parent.

## Tools

| Tool | Purpose |
|---|---|
| `tools/import_glossary.py` | Build a pack glossary from a Markdown term table + seed fixes + overrides (reproducible) |
| `tools/build_registry.py packs out/registry [--include-drafts]` | Deterministic zips + `manifest.json` with sha256 and profiles |
| `tools/check_packs.py [packs]` | Validator: ownership rule across packs, CSV / NFC / duplicate checks, test schema; exit 1 on error |
| `tools/eval_pack.py <id> [--family]` | Run a pack's `tests.jsonl` through the real model (with its parent chain when `--family`) |
| `tools/corpus_fetch.py` | The only sanctioned downloader for term mining: per-host and per-run caps, >= 3 s between requests to a host, cache, manifest, deny list, stops at the first 429 / 403 / reset |

## Packs in this repository

| Pack | Version | Status | Rows |
|---|---|---|---|
| `_style` (writing style, no glossary) | 0.1.3 | bundled with the helper | - |
| `pathology` (Giải phẫu bệnh) | 0.2.0 | published | 715 |
| `pathology-breast` (vú) | 0.1.2 | **draft, not reviewed** | 89 |
| `pathology-gi` (tiêu hóa) | 0.1.2 | **draft, not reviewed** | 96 |
| `pathology-headneck` (đầu cổ) | 0.1.2 | **draft, not reviewed** | 70 |
| `pathology-hpb` (gan mật tụy) | 0.1.2 | **draft, not reviewed** | 82 |
| `pathology-respiratory` (hô hấp) | 0.1.1 | **draft, not reviewed** | 77 |

Draft packs are skipped by the registry build unless `--include-drafts` is given. Planned families: internal medicine,
surgery, obstetrics, radiology, molecular biology / genetics, microbiology, data analysis, computer vision.

## Adding a pack

1. Create `packs/<id>/` with the files above (`"draft": true` until a domain expert has reviewed it).
2. Mine terms only through `tools/corpus_fetch.py`; record variants, counts and citations in `sources.md`.
3. Write 8-15 synthetic tests in `tests.jsonl` (never copy sentences from papers).
4. `tools/check_packs.py` must report 0 errors; `tools/eval_pack.py <id> --family` must pass.
5. Remove `"draft"` after review and rebuild the registry.
