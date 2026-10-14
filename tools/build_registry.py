"""Build the pack registry: one deterministic zip per domain pack + manifest.json with TF-IDF matching profiles.

Usage: python tools/build_registry.py <packs_dir> <out_dir> [--include-drafts]

- Packs: every directory of packs_dir whose name does not start with "_" and that holds a pack.json. A pack whose
  pack.json says "draft": true is skipped (and named in the report) unless --include-drafts is given.
- Zip `<id>-<version>.zip`: the files pack.json, prompt.md, glossary.csv, rules.json, tests.jsonl, sources.md that
  exist, in sorted order, fixed date 1980-01-01, deflate -> the same input always gives the same bytes.
- Includes: a pack.json "include": ["_shared/<name>", ...] is resolved here (vitranslate.packs.resolve_includes):
  the zip carries the expanded glossary.csv / rules.json (own rows first, then each include's; csv "\n" lines,
  JSON indent 1) and a pack.json with "included" instead of "include", so the helper resolves nothing at runtime.
  A pack without includes is zipped byte for byte.
- Profile (matching needs no download): terms = lower-cased glossary English keys (weight 1) + pack.json "detect"
  keywords (weight 2; a keyword that is also a glossary key keeps 2). idf over the packs of this build:
  idf(t) = ln((N + 1) / (df(t) + 1)) + 1; profile weight = weight * idf.
- detect: the normalised (lower-case, sorted, unique) pack.json "detect" keywords; the helper selects a pack only
  when the document contains them (detect-keyword gate in matching.py).
- manifest.json: {"format": 1, "packs": [{id, name, version, parent, file, sha256, size, detect, profile}],
  "idf": {...}}, UTF-8, sorted keys. Running twice gives byte-identical output. Versions are MAJOR.MINOR.PATCH.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "helper"))
from vitranslate.packs import expand_includes, read_glossary, resolve_includes  # noqa: E402

PACK_FILES =("pack.json", "prompt.md", "glossary.csv", "rules.json", "tests.jsonl", "sources.md")
ZIP_DATE = (1980, 1, 1, 0, 0, 0)
DETECT_WEIGHT = 2.0
GLOSSARY_WEIGHT = 1.0
DIGITS = 6
ID_RE = re.compile(r"^[a-z0-9_-]+$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
# Everyday English words that make poor detect keywords (wood staining, atomic nuclei, sandpaper grade...): a detect
# keyword among them is reported with a WARNING (the build goes on).
COMMON_WORDS = frozenset({
    "staining", "nuclei", "grade", "features", "marker", "negative", "positive", "patch", "threshold", "deletion",
    "insertion", "solid", "diffuse", "fusion", "score", "report", "cell", "tissue", "sample"})


def _norm(term):
    return " ".join(str(term).lower().split())


def find_packs(packs_dir, include_drafts=False):
    """(pack dirs with their pack.json, skipped draft ids), both sorted by directory name."""
    packs, drafts = [], []
    for d in sorted(Path(packs_dir).iterdir(), key=lambda p: p.name):
        if not d.is_dir() or d.name.startswith("_") or not (d / "pack.json").is_file():
            continue
        try:
            meta = json.loads((d / "pack.json").read_text(encoding="utf-8"))
        except ValueError as exc:
            raise SystemExit("pack %s: pack.json is not valid JSON (%s)" % (d.name, exc))
        if meta.get("draft") is True and not include_drafts:
            drafts.append(d.name)
            continue
        pid, version = meta.get("id"), meta.get("version")
        if pid != d.name or not ID_RE.fullmatch(str(pid)) or not VERSION_RE.fullmatch(str(version)):
            raise SystemExit("pack %s: id must equal the folder name and match %s; version must match %s"
                             % (d.name, ID_RE.pattern, VERSION_RE.pattern))
        try:
            resolve_includes(d, meta)
        except ValueError as exc:
            raise SystemExit(str(exc))
        packs.append((d, meta))
    return packs, drafts


def _rules(d):
    return json.loads((d / "rules.json").read_text(encoding="utf-8")) if (d / "rules.json").is_file() else {}


def expanded(d, meta):
    """(glossary rows, term-fix dicts) of the pack with its includes expanded."""
    return expand_includes(read_glossary(d / "glossary.csv"), _rules(d).get("term_fixes", []),
                           resolve_includes(d, meta))


def pack_files(d, meta):
    """{zip entry name: bytes}: the pack's files as they are, or with the includes expanded (module docstring)."""
    files = {n: (d / n).read_bytes() for n in PACK_FILES if (d / n).is_file()}
    includes = resolve_includes(d, meta)
    if not includes:
        return files
    glossary, fixes = expanded(d, meta)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["en", "vi", "note"])
    w.writerows(glossary)
    files["glossary.csv"] = buf.getvalue().encode("utf-8")
    if fixes or "rules.json" in files:
        rules = dict(_rules(d), term_fixes=fixes)
        files["rules.json"] = (json.dumps(rules, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    meta = {k: v for k, v in meta.items() if k != "include"}
    meta["included"] = [name for name, _, _ in includes]
    files["pack.json"] = (json.dumps(meta, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    return files


def pack_zip(d, meta):
    files = pack_files(d, meta)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, ZIP_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0  # same bytes whichever OS builds it
            info.external_attr = 0
            z.writestr(info, files[name])
    return buf.getvalue()


def pack_terms(d, meta):
    """{term: weight} before idf (glossary rows include the expanded "include" rows)."""
    terms = {}
    for en, vi, _ in expanded(d, meta)[0]:
        en = _norm(en)
        if en and vi:
            terms[en] = max(terms.get(en, 0.0), GLOSSARY_WEIGHT)
    for kw in meta.get("detect", []):
        k = _norm(kw)
        if k:
            terms[k] = DETECT_WEIGHT
    return terms


def build(packs_dir, out_dir, include_drafts=False, log=lambda line: None):
    """Write the zips and manifest.json into out_dir; returns the manifest dict."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    packs, drafts = find_packs(packs_dir, include_drafts)
    for name in drafts:
        log("skipped draft %s (use --include-drafts)" % name)
    for d, meta in packs:
        for word in sorted({_norm(k) for k in meta.get("detect", [])} & COMMON_WORDS):
            log("WARNING pack %s: detect keyword %r is a common English word; it can select the pack for "
                "non-domain text" % (meta["id"], word))
    import check_packs  # here, not at the top: check_packs imports this module
    log("check_packs: %s -- python tools/check_packs.py for details"
        % check_packs.summary(check_packs.check(packs_dir, include_drafts=include_drafts)))
    terms = [pack_terms(d, meta) for d, meta in packs]
    n = len(packs)
    df = {}
    for t in terms:
        for term in t:
            df[term] = df.get(term, 0) + 1
    idf = {term: math.log((n + 1) / (c + 1)) + 1 for term, c in df.items()}
    entries = []
    for (d, meta), weights in zip(packs, terms):
        data = pack_zip(d, meta)
        fname = "%s-%s.zip" % (meta["id"], meta["version"])
        (out / fname).write_bytes(data)
        entries.append({
            "id": meta["id"], "name": meta.get("name", meta["id"]), "version": meta["version"],
            "parent": meta.get("parent"), "file": fname, "sha256": hashlib.sha256(data).hexdigest(),
            "detect": sorted({_norm(k) for k in meta.get("detect", []) if _norm(k)}),
            "size": len(data),
            "profile": {term: round(w * idf[term], DIGITS) for term, w in weights.items()},
        })
        log("pack %s %s: %d profile terms, %d bytes, sha256 %s" % (
            meta["id"], meta["version"], len(weights), len(data), entries[-1]["sha256"][:12]))
    manifest = {"format": 1, "packs": entries, "idf": {t: round(v, DIGITS) for t, v in idf.items()}}
    text = json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=1) + "\n"
    (out / "manifest.json").write_bytes(text.encode("utf-8"))
    log("%d pack(s), %d terms in the vocabulary -> %s" % (len(entries), len(idf), out / "manifest.json"))
    return manifest


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the ViTranslate pack registry.")
    ap.add_argument("packs_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--include-drafts", action="store_true", help="also publish packs marked \"draft\": true")
    args = ap.parse_args(argv)

    def log(line):
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)

    build(args.packs_dir, args.out_dir, include_drafts=args.include_drafts, log=log)


if __name__ == "__main__":
    sys.exit(main())
