"""Export a clean public snapshot of the tracked files into a separate git checkout.

Usage: python tools/export_public.py <dest_dir> [--patterns FILE] [--allow FILE]
                                     [--text-sources LIST] [--text-allow FILE] [--text-cache FILE]

- Exports the files of the last commit (HEAD; uncommitted edits never) minus the internal folders in EXCLUDE (design notes with personal decisions, machine paths
  and private document names stay in the development repo).
- Before anything is copied, every exported file (and the XML parts inside .docx / .pptx / .xlsx / .zip) is scanned
  for the private patterns: one case-insensitive regex per line in FILE (default private/publish_patterns.txt, kept
  out of git because the patterns themselves are private). Allow-list lines are "path-glob<TAB>regex" and exempt known
  false positives (for example a public dissertation cited in a pack's sources). Any remaining hit -> exit 1, nothing copied.
- Then the private-text scan (tools/private_text_guard.py): any run of 8+ consecutive words copied from a private
  document (sources: private/corpus.txt + private/text_sources.txt, or --text-sources LIST; allow list
  private/text_allow.txt) -> "REFUSED: n private-text hit(s)", exit 1, nothing copied; hits are printed as
  path:line:col + run length, never the words.
- Files in dest_dir that are no longer exported are removed; dest_dir/.git is never touched. Commit and push are left
  to the caller after a review of `git -C dest_dir status`.
Console output is ASCII only.
"""
import fnmatch
import io
import re
import subprocess
import sys
import zipfile
from pathlib import Path

import private_text_guard

PrivateText = private_text_guard.PrivateText
EXCLUDE = ("docs/superpowers/", "docs/packs/", "private/", "out/")
ZIP_EXT = (".docx", ".pptx", ".xlsx", ".zip")
ZIP_TEXT = (".xml", ".rels", ".txt", ".csv", ".json", ".md")


class PrivateData(Exception):
    def __init__(self, hits):
        super().__init__("%d private-data hit(s)" % len(hits))
        self.hits = hits  # [(where, line_no, matched text)]


def read_patterns(path):
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    return [ln.strip() for ln in lines if ln.strip() and not ln.lstrip().startswith("#")]


def read_allow(path):
    out = []
    for ln in Path(path).read_text(encoding="utf-8").splitlines():
        if not ln.strip() or ln.lstrip().startswith("#"):
            continue
        glob, _, rx = ln.partition("\t")
        out.append((glob.strip(), rx.strip()))
    return out


def tracked(repo):
    """Files of the last commit (HEAD), minus EXCLUDE: uncommitted edits are never published."""
    res = subprocess.run(["git", "-C", str(repo), "ls-tree", "-r", "-z", "--name-only", "HEAD"],
                         capture_output=True, check=True)
    files = [f for f in res.stdout.decode("utf-8").split("\0") if f]
    return sorted(f for f in files if not f.startswith(EXCLUDE))


def committed(repo, rel):
    res = subprocess.run(["git", "-C", str(repo), "cat-file", "blob", "HEAD:" + rel], capture_output=True, check=True)
    return res.stdout


def _texts(data, rel):
    if rel.lower().endswith(ZIP_EXT):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                for name in z.namelist():
                    if name.endswith(ZIP_TEXT):
                        yield "%s!%s" % (rel, name), z.read(name).decode("utf-8", "ignore")
        except zipfile.BadZipFile:
            pass
        return
    if b"\0" not in data[:4096]:
        yield rel, data.decode("utf-8", "ignore")


def scan(repo, files, patterns, allow):
    if not patterns:
        return []
    rx = re.compile("|".join("(?:%s)" % p for p in patterns), re.IGNORECASE)
    allowed = [(glob, re.compile(r, re.IGNORECASE)) for glob, r in allow]
    hits = []
    for rel in files:
        for where, text in _texts(committed(repo, rel), rel):
            for no, line in enumerate(text.splitlines(), 1):
                for m in rx.finditer(line):
                    if any(fnmatch.fnmatch(rel, glob) and a.fullmatch(m.group(0)) for glob, a in allowed):
                        continue
                    hits.append((where, no, m.group(0)))
    return hits


def export(repo, dest, patterns, allow, text_guard=None):
    """text_guard: a private_text_guard.Guard; any private-text hit in an exported file -> PrivateText, nothing copied."""
    repo, dest = Path(repo), Path(dest)
    files = tracked(repo)
    hits = scan(repo, files, patterns, allow)
    if hits:
        raise PrivateData(hits)
    if text_guard is not None:
        text_hits = text_guard.scan_items((rel, committed(repo, rel)) for rel in files)
        if text_hits:
            raise PrivateText(text_hits)
    dest.mkdir(parents=True, exist_ok=True)
    keep = set(files)
    for p in sorted(dest.rglob("*"), reverse=True):
        rel = p.relative_to(dest).as_posix()
        if rel == ".git" or rel.startswith(".git/"):
            continue
        if p.is_file() and rel not in keep:
            p.unlink()
        elif p.is_dir() and not any(p.iterdir()):
            p.rmdir()
    for rel in files:
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(committed(repo, rel))
    return files


def main(argv):
    if not argv or argv[0].startswith("-"):
        print(__doc__.encode("ascii", "replace").decode())
        return 2
    args = dict(zip(argv[1::2], argv[2::2]))
    repo = Path(args.get("--repo", Path(__file__).resolve().parents[1]))
    patterns = read_patterns(args.get("--patterns", repo / "private" / "publish_patterns.txt"))
    allow_file = Path(args.get("--allow", repo / "private" / "publish_allow.txt"))
    allow = read_allow(allow_file) if allow_file.exists() else []
    guard = private_text_guard.for_repo(repo, lists=[args["--text-sources"]] if "--text-sources" in args else None,
                                        cache=args.get("--text-cache"), allow=args.get("--text-allow"))
    try:
        files = export(repo, argv[0], patterns, allow, text_guard=guard)
    except PrivateData as err:
        print("REFUSED: %d private-data hit(s), nothing copied" % len(err.hits))
        for where, no, tok in err.hits[:50]:
            print("  %s:%d  %s" % (where, no, tok))
        return 1
    except PrivateText as err:
        print("REFUSED: %d private-text hit(s), nothing copied" % len(err.hits))
        for hit in err.hits[:50]:
            print("  " + private_text_guard.format_hit(hit))
        print(guard.summary())
        return 1
    print("exported %d files to %s (%d patterns, %d allow rules)" % (len(files), argv[0], len(patterns), len(allow)))
    print(guard.summary() + ": clean")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
