"""Bundle the non-draft packs into the JSON module the Pages Functions import (spec Amendment F).

Usage: python tools/bundle_packs.py [--out FILE] [--commit SHA | --worktree] [--patterns FILE] [--allow FILE]

- Same files and bytes as the helper's registry: tools/build_registry.py builds the registry of the NON-DRAFT packs of
  the commit (default HEAD; git archive, so the committed bytes whatever core.autocrlf says; --worktree: the working
  files, for local runs only) into a temporary folder. The bundle holds its manifest.json unchanged (matching
  profiles, idf, sha256) and, per pack, the zip members the translator reads -- pack.json (includes expanded:
  "included"), prompt.md, glossary.csv, rules.json -- as base64 of their exact bytes; tests.jsonl and sources.md stay
  out. The writing-style pack packs/_style goes under "_style/<file>". The Functions decode every file with the
  core's decodeText (strict UTF-8, BOM kept), as a registry reader does.
- Output (default functions/_generated/packs.json, git-ignored): {"format": 1, "source": "commit <sha>" | "working
  tree", "manifest": {...}, "files": {"<id>@<version>/<file>" | "_style/<file>": base64}}, ASCII JSON with sorted
  keys, written in one step (temp file + rename): the same commit always gives the same bytes.
- Deploy folder: python tools/build_site.py out/site, then python tools/bundle_packs.py --out
  out/site/functions/_generated/packs.json (the same --commit for both).
- Private-data scan first, as tools/build_site.py does for what it publishes: every bundled file under its repo path
  (packs/<id>/<file>) with the patterns of FILE (default <repo>/private/publish_patterns.txt; --patterns "" turns the
  scan off, for tests) and the allow list (default <repo>/private/publish_allow.txt). Any hit -> exit 1 and nothing
  written; no patterns file -> exit 2.
- Console output is ASCII only.
"""
import argparse
import base64
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import uuid
import zipfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
import build_registry  # noqa: E402
import build_site  # noqa: E402
import export_public  # noqa: E402

FORMAT = 1
BUNDLED = ("pack.json", "prompt.md", "glossary.csv", "rules.json")
STYLE = "_style"
DEFAULT_OUT = ROOT / "functions" / "_generated" / "packs.json"


def _ascii(text):
    return str(text).encode("ascii", "replace").decode("ascii")


def _b64(data):
    return base64.b64encode(data).decode("ascii")


def bundle_from_registry(registry_dir, style_dir, source=""):
    """The bundle of a built registry folder (manifest.json + zips) and the style pack folder."""
    registry_dir, style_dir = Path(registry_dir), Path(style_dir)
    manifest = json.loads((registry_dir / "manifest.json").read_text(encoding="utf-8"))
    files = {}
    for e in manifest["packs"]:
        with zipfile.ZipFile(registry_dir / e["file"]) as z:
            for name in z.namelist():
                if name in BUNDLED:
                    files["%s@%s/%s" % (e["id"], e["version"], name)] = _b64(z.read(name))
    for name in BUNDLED:
        if (style_dir / name).is_file():
            files["%s/%s" % (STYLE, name)] = _b64((style_dir / name).read_bytes())
    return {"format": FORMAT, "source": source, "manifest": manifest, "files": files}


def build_bundle(packs_dir, source=""):
    """The bundle of a packs folder: registry of its non-draft packs (temporary) + its _style pack."""
    with tempfile.TemporaryDirectory(prefix="vt-bundle-") as tmp:
        registry = Path(tmp) / "registry"
        build_registry.build(packs_dir, registry, include_drafts=False)
        return bundle_from_registry(registry, Path(packs_dir) / STYLE, source)


def committed_packs(repo, sha, dest):
    """Write packs/ of the commit (git archive, no line-end conversion) under dest; returns dest/packs."""
    raw = subprocess.run(["git", "-C", str(repo), "-c", "core.autocrlf=false", "archive", "--format=tar", sha, "--",
                          "packs"], capture_output=True, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
        for member in tar.getmembers():
            if member.isfile():
                p = Path(dest) / member.name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(tar.extractfile(member).read())
    return Path(dest) / "packs"


def scan_bundle(bundle, patterns, allow):
    """[(where, line, text)] private-data hits of the bundled files, each under its repo path packs/<id>/<file>."""
    if not patterns:
        return []
    with tempfile.TemporaryDirectory(prefix="vt-bundle-scan-") as tmp:
        root = Path(tmp)
        for key, data in bundle["files"].items():
            head, name = key.split("/", 1)
            p = root / "packs" / head.split("@", 1)[0] / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(base64.b64decode(data))
        return build_site.scan(root, patterns, allow)


def _bundle(repo, commit, worktree):
    """(bundle, draft pack ids left out) of the commit or the working tree."""
    if worktree:
        packs = Path(repo) / "packs"
        return build_bundle(packs, source="working tree"), build_registry.find_packs(packs)[1]
    sha = subprocess.run(["git", "-C", str(repo), "rev-parse", "--verify", commit + "^{commit}"], capture_output=True,
                         check=True).stdout.decode().strip()
    with tempfile.TemporaryDirectory(prefix="vt-bundle-src-") as tmp:
        packs = committed_packs(repo, sha, tmp)
        return build_bundle(packs, source="commit " + sha), build_registry.find_packs(packs)[1]


def write_once(path, data):
    """Write bytes to path in one step (a temp file next to it, then rename)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(".%s.%s.tmp" % (path.name, uuid.uuid4().hex))
    try:
        tmp.write_bytes(data)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Bundle the non-draft packs for the ViTranslate Pages Functions.")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--commit", default="HEAD")
    ap.add_argument("--worktree", action="store_true", help="take packs/ from the working tree (local runs only)")
    ap.add_argument("--patterns", help="private patterns file (default <repo>/private/publish_patterns.txt; "
                                       "an empty value turns the scan off)")
    ap.add_argument("--allow", help="allow-list file (default <repo>/private/publish_allow.txt when present)")
    ap.add_argument("--repo", default=str(ROOT), help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    repo = Path(args.repo)
    if args.patterns == "":
        patterns = []
    else:
        pat_file = Path(args.patterns) if args.patterns else repo / "private" / "publish_patterns.txt"
        if not pat_file.is_file():
            print("REFUSED: no patterns file %s (the private-data scan is required)" % _ascii(pat_file))
            return 2
        patterns = export_public.read_patterns(pat_file)
    allow_file = Path(args.allow) if args.allow else repo / "private" / "publish_allow.txt"
    allow = export_public.read_allow(allow_file) if allow_file.is_file() else []
    bundle, drafts = _bundle(repo, args.commit, args.worktree)
    hits = scan_bundle(bundle, patterns, allow)
    if hits:
        print("REFUSED: %d private-data hit(s), nothing written" % len(hits))
        for where, no, tok in hits[:50]:
            print("  %s:%d  %s" % (_ascii(where), no, _ascii(tok)))
        return 1
    data = (json.dumps(bundle, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n").encode("ascii")
    write_once(args.out, data)
    style = json.loads(base64.b64decode(bundle["files"].get(STYLE + "/pack.json", _b64(b"{}")))).get("version")
    print("bundle from %s" % _ascii(bundle["source"]))
    print("packs: %s; drafts left out: %s; style pack %s" % (
        ", ".join("%s %s" % (e["id"], e["version"]) for e in bundle["manifest"]["packs"]) or "none",
        ", ".join(drafts) or "none", style))
    print("scan: %s" % ("%d files, %d patterns, %d allow rules: clean" % (len(bundle["files"]), len(patterns), len(allow))
                        if patterns else "off"))
    print("-> %s (%d files, %d KB)" % (_ascii(args.out), len(bundle["files"]), round(len(data) / 1024)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
