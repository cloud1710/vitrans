"""Build the Cloudflare Pages deploy folder (spec Amendment F): the page and the Pages Functions of one commit.

Usage: python tools/build_site.py <out_dir> [--commit SHA] [--worktree] [--patterns FILE] [--allow FILE] [--repo DIR]
                                  [--text-sources LIST] [--text-allow FILE] [--text-cache FILE]

- <out_dir>/web/: the files of web/ at the commit (git archive, default HEAD; the committed bytes whatever
  core.autocrlf says) minus the dev-only files: every tests/ and node_modules/ folder and web/engine/package*.json.
  It is the static output directory and keeps the name web/, so that the Functions' relative imports of the shared
  core (../web/engine/...) resolve in the deploy folder exactly as in the repo.
- <out_dir>/functions/: the Pages Functions (functions/ of the same commit, minus tests/ and node_modules/) when the
  commit has them, plus the pack bundle they import, functions/_generated/packs.json (git-ignored): built here by
  tools/bundle_packs.py's own code from the same commit (or the working tree), its private-data scan first, the same
  bytes its CLI writes -- one command gives a complete deploy folder.
- <out_dir>/wrangler.toml | wrangler.json | wrangler.jsonc: copied when the commit has one at the repo root.
- No /registry/ any more: the page does not read packs (the Functions do).
- --worktree: the working tree instead of a commit (local test runs only, never a deploy).
- Before anything is written, every output file is scanned with the private patterns: one case-insensitive regex per
  line of FILE (default <repo>/private/publish_patterns.txt), OR-ed as tools/export_public.py does (also the text
  parts of .docx / .pptx / .xlsx / .zip files). Allow-list lines "path-glob<TAB>regex" (default
  <repo>/private/publish_allow.txt) name repo paths, which the deploy folder keeps. Any hit -> exit 1, out_dir not
  written.
- Then the private-text scan (tools/private_text_guard.py) of every output file and of the pack bundle's files
  (decoded, under their repo paths packs/<id>/<file>): a run of 8+ consecutive words copied from a private document
  (sources: <repo>/private/corpus.txt + <repo>/private/text_sources.txt, or --text-sources LIST; allow list
  <repo>/private/text_allow.txt) -> "REFUSED: n private-text hit(s)", exit 1, out_dir not written; hits are printed
  as path:line:col + run length, never the words.
- out_dir must be new or empty. Deploy: cd <out_dir> && npx wrangler pages deploy web. Console output is ASCII only.
"""
import argparse
import base64
import fnmatch
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
import export_public  # noqa: E402
import private_text_guard  # noqa: E402

PrivateData = export_public.PrivateData
PrivateText = private_text_guard.PrivateText
BUNDLE = "functions/_generated/packs.json"  # what functions/_lib/deps.js imports (tools/bundle_packs.py builds it)
PREFIXES = ("web", "functions")
CONFIGS = ("wrangler.toml", "wrangler.json", "wrangler.jsonc")
DEV_DIRS = ("tests", "node_modules")
DEV_FILES = ("web/engine/package*.json",)
PRUNE = {"node_modules", "__pycache__", ".git"}  # never walked in --worktree mode


def _ascii(text):
    return str(text).encode("ascii", "replace").decode("ascii")


def dev_only(path):
    """True for a dev-only file; path is the repo path (web/... or functions/...)."""
    parts = path.split("/")
    return any(d in parts[:-1] for d in DEV_DIRS) or any(fnmatch.fnmatchcase(path, g) for g in DEV_FILES)


def _git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), "-c", "core.autocrlf=false"] + list(args), capture_output=True,
                          check=True).stdout


def committed_tree(repo, sha):
    """{repo path: bytes} of web/, functions/ and the root wrangler config at the commit (no line-end conversion)."""
    top = _git(repo, "ls-tree", "--name-only", sha).decode("utf-8").split("\n")
    wanted = [p for p in PREFIXES + CONFIGS if p in top]
    if not wanted:
        return {}
    out = {}
    with tarfile.open(fileobj=io.BytesIO(_git(repo, "archive", "--format=tar", sha, "--", *wanted))) as tar:
        for member in tar.getmembers():
            if member.isfile():
                out[member.name] = tar.extractfile(member).read()
    return out


def worktree_tree(repo):
    """{repo path: bytes} of the same files in the working tree (node_modules / __pycache__ never walked)."""
    repo = Path(repo)
    out = {}
    for name in CONFIGS:
        if (repo / name).is_file():
            out[name] = (repo / name).read_bytes()
    for prefix in PREFIXES:
        for dirpath, dirnames, filenames in os.walk(repo / prefix):
            dirnames[:] = sorted(d for d in dirnames if d not in PRUNE)
            for name in sorted(filenames):
                p = Path(dirpath) / name
                out[p.relative_to(repo).as_posix()] = p.read_bytes()
    return out


def scan(root, patterns, allow):
    """[(where, line number, matched text)] of the private patterns in every file under root (repo paths)."""
    if not patterns:
        return []
    rx = re.compile("|".join("(?:%s)" % p for p in patterns), re.IGNORECASE)
    allowed = [(glob, re.compile(r, re.IGNORECASE)) for glob, r in allow]
    hits = []
    for p in sorted(Path(root).rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(root).as_posix()
        for where, text in export_public._texts(p.read_bytes(), rel):
            for no, line in enumerate(text.splitlines(), 1):
                for m in rx.finditer(line):
                    if any(fnmatch.fnmatch(rel, glob) and a.fullmatch(m.group(0)) for glob, a in allowed):
                        continue
                    hits.append((where, no, m.group(0)))
    return hits


def build(repo, out_dir, commit="HEAD", worktree=False, patterns=(), allow=(), log=lambda line: None, text_guard=None):
    """Write the deploy folder into out_dir (new or empty); returns a summary dict. PrivateData on a scan hit (nothing
    written), PrivateText on a private-text hit of text_guard (a private_text_guard.Guard; nothing written),
    ValueError when out_dir is not empty."""
    repo, out = Path(repo), Path(out_dir)
    if out.exists() and (not out.is_dir() or any(out.iterdir())):
        raise ValueError("%s exists and is not empty" % out)
    if worktree:
        tree, source = worktree_tree(repo), "the working tree (local tests only)"
    else:
        sha = _git(repo, "rev-parse", "--verify", commit + "^{commit}").decode().strip()
        tree, source = committed_tree(repo, sha), "commit " + sha
    files, excluded = {}, 0
    for path, data in tree.items():
        if path not in CONFIGS and dev_only(path):
            excluded += 1
        else:
            files[path] = data
    bundled, text_hits = [], []
    if any(p.startswith("functions/") for p in files):
        # the Functions import the pack bundle (git-ignored): tools/bundle_packs.py's own code, the same commit
        import bundle_packs  # here, not at the top: bundle_packs imports this module
        bundle, _ = bundle_packs._bundle(repo, sha if not worktree else commit, worktree)
        hits = bundle_packs.scan_bundle(bundle, patterns, allow)
        if hits:
            raise PrivateData(hits)
        if text_guard is not None:  # the bundle holds base64: the guard reads each file decoded, under its repo path
            text_hits += text_guard.scan_items(
                ("packs/%s/%s" % (key.split("/", 1)[0].split("@", 1)[0], key.split("/", 1)[1]), base64.b64decode(data))
                for key, data in bundle["files"].items())
        files[BUNDLE] = (json.dumps(bundle, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n").encode("ascii")
        bundled = ["%s %s" % (e["id"], e["version"]) for e in bundle["manifest"]["packs"]]
    with tempfile.TemporaryDirectory(prefix="vt-site-") as tmp:
        stage = Path(tmp) / "site"
        stage.mkdir()
        for path, data in files.items():
            (stage / path).parent.mkdir(parents=True, exist_ok=True)
            (stage / path).write_bytes(data)
        hits = scan(stage, patterns, allow)
        if hits:
            raise PrivateData(hits)
        if text_guard is not None:
            text_hits += text_guard.scan_items(sorted(files.items()))
        if text_hits:
            raise PrivateText(sorted(text_hits, key=lambda h: (h.where, h.line, h.col)))
        out.mkdir(parents=True, exist_ok=True)
        shutil.copytree(stage, out, dirs_exist_ok=True)
    log("%d files from %s" % (len(files), source))
    return {"source": source, "excluded": excluded, "bundle": bundled,
            "web_files": sum(1 for p in files if p.startswith("web/")),
            "functions_files": sum(1 for p in files if p.startswith("functions/") and p != BUNDLE),
            "config": sorted(p for p in files if p in CONFIGS), "files": len(files),
            "bytes": sum(len(d) for d in files.values()), "patterns": len(patterns), "allow": len(allow)}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the ViTranslate Cloudflare Pages deploy folder.")
    ap.add_argument("out_dir")
    ap.add_argument("--commit", default="HEAD")
    ap.add_argument("--worktree", action="store_true", help="take the working tree instead of a commit (tests only)")
    ap.add_argument("--patterns", help="private patterns file (default <repo>/private/publish_patterns.txt)")
    ap.add_argument("--allow", help="allow-list file (default <repo>/private/publish_allow.txt when present)")
    ap.add_argument("--repo", default=str(ROOT), help=argparse.SUPPRESS)
    ap.add_argument("--text-sources", action="append", metavar="LIST",
                    help="private-text source list (default <repo>/private/corpus.txt and text_sources.txt)")
    ap.add_argument("--text-allow", help="private-text allow list (default <repo>/private/text_allow.txt)")
    ap.add_argument("--text-cache", help="private-text hash cache (default <repo>/private/text_guard_cache.bin)")
    args = ap.parse_args(argv)
    repo = Path(args.repo)
    pat_file = Path(args.patterns) if args.patterns else repo / "private" / "publish_patterns.txt"
    if not pat_file.is_file():
        print("REFUSED: no patterns file %s (the private-data scan is required)" % _ascii(pat_file))
        return 2
    patterns = export_public.read_patterns(pat_file)
    allow_file = Path(args.allow) if args.allow else repo / "private" / "publish_allow.txt"
    allow = export_public.read_allow(allow_file) if allow_file.is_file() else []
    guard = private_text_guard.for_repo(repo, lists=args.text_sources, cache=args.text_cache, allow=args.text_allow)
    try:
        s = build(repo, args.out_dir, commit=args.commit, worktree=args.worktree, patterns=patterns, allow=allow,
                  text_guard=guard)
    except PrivateData as err:
        print("REFUSED: %d private-data hit(s), nothing written" % len(err.hits))
        for where, no, tok in err.hits[:50]:
            print("  %s:%d  %s" % (_ascii(where), no, _ascii(tok)))
        return 1
    except PrivateText as err:
        print("REFUSED: %d private-text hit(s), nothing written" % len(err.hits))
        for hit in err.hits[:50]:
            print("  " + private_text_guard.format_hit(hit))
        print(guard.summary())
        return 1
    except ValueError as err:
        print("REFUSED: %s" % _ascii(err))
        return 2
    print("site from %s" % _ascii(s["source"]))
    print("web: %d files (%d dev-only files left out: tests/, node_modules/, web/engine/package*.json)"
          % (s["web_files"], s["excluded"]))
    print("functions: %s" % ("%d files + pack bundle %s (%s)" % (s["functions_files"], BUNDLE,
                                                                  ", ".join(s["bundle"]) or "no packs")
                             if s["functions_files"] else "none at this commit (the Pages Functions are not committed yet)"))
    print("config: %s" % (", ".join(s["config"]) or "none"))
    print("scan: %d files, %d patterns, %d allow rules: clean" % (s["files"], s["patterns"], s["allow"]))
    print(guard.summary() + ": clean")
    print("-> %s (%d files, %d KB); deploy: cd %s && npx wrangler pages deploy web"
          % (_ascii(args.out_dir), s["files"], round(s["bytes"] / 1024), _ascii(args.out_dir)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
