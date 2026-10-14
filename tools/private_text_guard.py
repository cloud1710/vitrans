"""Private-text guard: refuse to publish text copied from the private documents.

Usage: python tools/private_text_guard.py [--sources LIST]... [--allow FILE] [--cache FILE] [--hashes] PATH...

- Private sources: the files named in the source lists, one path per line ('#' comments; a relative path is read
  from the list's folder; a folder means every .docx / .pptx / .pdf / .txt / .md under it). Default lists:
  <repo>/private/corpus.txt and <repo>/private/text_sources.txt (git-ignored: the paths are private document names).
  Sources are only read, never written.
- Text of a source: .docx = the w:t runs of word/*.xml; .pptx = the a:t runs of the slides, notes, diagrams, charts
  and comments (masters and layouts hold template boilerplate, not private text); .txt / .md as UTF-8; .pdf with
  pypdf or pdfminer when this Python has one, else skipped and counted in the summary.
- Shingles: words are runs of letters / digits (Vietnamese letters included), normalised NFC + casefold + diacritics
  folded (an accent-stripped copy still matches); every N = 8 consecutive words are hashed (blake2b, 64 bits) unless
  they are all numbers (a numbered table is not text), and a shingle whose source words carry diacritics is marked
  Vietnamese. The hashes (never text) are cached in
  <repo>/private/text_guard_cache.bin, one entry per source keyed by its path hash, size and mtime: a changed source
  is read again, the others come from the cache.
- Scan: every PATH (a folder: every file under it, reported relative to it). Text is decoded first: the escapes of
  Python / JSON / JS strings and the HTML entities (a copy written as escapes still matches), and the tags of
  .html / .xml / .svg files. .docx / .pptx / .xlsx / .zip: each XML / text entry, as "file!entry" (in a w:t / a:t
  part the line is the paragraph). A hit is a run of consecutive words found in a source: >= N = 8 words when the run
  holds an English window (8 words without diacritics whose shingle is not Vietnamese), else >= N_VI = 16 syllables
  (a Vietnamese run, or an accent-stripped copy of a Vietnamese source: 8 syllables are only a long term). Printed as
  where:line:col + run length, NEVER the words; --hashes adds the run's shingle hashes, for the allow list.
- Allow list (default <repo>/private/text_allow.txt), one rule per line, '#' comments: 16 hex digits = the hash of
  one shingle of a public phrase (a WHO book title...); anything else = a path glob (fnmatch on the published path or
  on "file!entry") whose hits are exempt. Built in, always on: DEFAULT_ALLOW_GLOBS (the curated terminology of the
  packs).
- tools/export_public.py and tools/build_site.py run this guard on everything they publish and refuse on a hit.
- Exit 0 clean, 1 private-text hit(s), 2 usage. Console output is ASCII only.
"""
import argparse
import bisect
import fnmatch
import functools
import hashlib
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import zipfile
from array import array
from collections import namedtuple
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
N = 8  # shingle size = the shortest English run reported
N_VI = 16  # the shortest Vietnamese run reported (syllables)
NORM = "nfc-casefold-nomarks-2"  # cache entries made with other shingles are read again (2: no numbers-only shingle)
MAGIC = b"VT-PRIVATE-TEXT-2\n"  # 2: per source, all hashes then the Vietnamese ones
# Built-in allow list (published paths). The curated terminology of the packs necessarily repeats long terms, journal
# names and citations that the private translations use too; a pack's tests.jsonl (sentences) stays scanned.
DEFAULT_ALLOW_GLOBS = (
    "packs/*/glossary.csv",  # term pairs
    "packs/*/sources.md",  # term evidence: counts, citation codes, titles, URLs
    "packs/*/MINING_REPORT.md",  # mining notes on the terms
    "packs/*/prompt.md",  # house-style term lists
    "packs/_shared/*.csv",  # shared term rows
    "web/engine/tests/fixtures/engine/packs.json",  # generated from the packs (tools/export_engine_fixtures.py)
)
CACHE_NAME = "text_guard_cache.bin"
SOURCE_EXT = (".docx", ".pptx", ".pdf", ".txt", ".md")
ZIP_EXT = (".docx", ".pptx", ".xlsx", ".zip")
MARKUP_EXT = (".html", ".htm", ".xhtml", ".xml", ".svg")
DOCX_PARTS = re.compile(r"word/(?!glossary/|theme/).+\.xml$")
PPTX_PARTS = re.compile(r"ppt/(?:slides|notesSlides|diagrams|charts|comments)/[^/]+\.xml$")

Hit = namedtuple("Hit", "where line col words hashes")

_WORD = re.compile(r"(?:[^\W_]|[\u0300-\u036f])+")
_ESCAPE = (r"\\(?:u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|x([0-9a-fA-F]{2})"
           r"|N\{([^}]{1,80})\}|(.))"
           r"|&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|[A-Za-z][A-Za-z0-9]{1,31});")
_DECODE = re.compile(_ESCAPE)
_DECODE_MARKUP = re.compile(_ESCAPE + r"|<[^<>]{0,2000}>")
_OOXML = re.compile(r"<(w:t|w:delText|a:t)(?:\s[^>]*)?>([^<]*)</\1>|(</[wa]:p>)|<(?:w:br|w:cr|w:tab|a:br)\b[^>]*>")
_OOXML_TEXT = re.compile(r"<(?:w:t|a:t)[\s>]")
_HEX16 = re.compile(r"[0-9a-fA-F]{16}")


class PrivateText(Exception):
    def __init__(self, hits):
        super().__init__("%d private-text hit(s)" % len(hits))
        self.hits = hits  # [Hit]: where, line, col, run length, shingle hashes -- never the words


def _ascii(text):
    return str(text).encode("ascii", "replace").decode("ascii")


def format_hit(hit):
    return "%s:%d:%d  %d words" % (_ascii(hit.where), hit.line, hit.col, hit.words)


def _rep(m):
    """Replacement of one escape / entity / tag: its character, or a space for a separator."""
    text = m.group(0)
    if text[0] == "\\":
        code = m.group(1) or m.group(2) or m.group(3) or m.group(4)
        if code:
            cp = int(code, 16)
            return chr(cp) if cp <= 0x10FFFF else " "
        if m.group(5) is not None:
            try:
                return unicodedata.lookup(m.group(5))
            except KeyError:
                return " "
        ch = m.group(6)
        return " " if ch.isalnum() else ch  # newline / tab / regex escapes separate words
    if text[0] == "&":
        code = m.group(7) or m.group(8)
        if code:
            cp = int(code, 10 if m.group(7) else 16)
            return chr(cp) if 0 < cp <= 0x10FFFF else " "
        return html.unescape(text)
    return " "  # a markup tag


def _decode(line, markup=False):
    """(decoded line, marks): marks = [(decoded length after an escape, raw - decoded length so far)]."""
    out, marks, pos, size, shift = [], [], 0, 0, 0
    for m in (_DECODE_MARKUP if markup else _DECODE).finditer(line):
        rep = _rep(m)
        out.append(line[pos:m.start()])
        out.append(rep)
        size += m.start() - pos + len(rep)
        shift += m.end() - m.start() - len(rep)
        marks.append((size, shift))
        pos = m.end()
    if not marks:
        return line, marks
    out.append(line[pos:])
    return "".join(out), marks


def _raw_col(marks, col):
    """Column of the raw line for a column of the decoded line."""
    if not marks:
        return col
    i = bisect.bisect_right(marks, col, key=lambda mk: mk[0]) - 1
    return col + (marks[i][1] if i >= 0 else 0)


@functools.lru_cache(maxsize=1 << 20)
def _norm(word):
    w = unicodedata.normalize("NFC", word).casefold()
    if not w.isascii():
        w = "".join(c for c in unicodedata.normalize("NFD", w) if not unicodedata.combining(c)).replace("\u0111", "d")
    return w


def _shingle(words):
    data = " ".join(words).encode("utf-8", "surrogatepass")
    return int.from_bytes(hashlib.blake2b(data, digest_size=8).digest(), "little")


def text_hashes(text):
    """(hashes, vi): the shingle hashes (ints) of a text, and those whose words carry diacritics (Vietnamese)."""
    words, marked = [], []
    for raw in _WORD.findall(_DECODE.sub(_rep, text)):
        w = _norm(raw)
        if w:
            words.append(w)
            marked.append(not raw.isascii())
    hashes, vi = set(), set()
    for i in range(len(words) - N + 1):
        if all(w.isdigit() for w in words[i:i + N]):
            continue  # numbers alone (a numbered table, match offsets) are not text
        h = _shingle(words[i:i + N])
        hashes.add(h)
        if any(marked[i:i + N]):
            vi.add(h)
    return hashes, vi


def ooxml_text(xml):
    """Text of an OOXML part: its w:t / a:t runs, one line per paragraph."""
    out = []
    for m in _OOXML.finditer(xml):
        if m.group(1):
            out.append(html.unescape(m.group(2)))
        else:
            out.append("\n" if m.group(3) else " ")
    return "".join(out)


def _pdf_text(path):
    """Text of a PDF with pypdf or pdfminer; None when this Python has neither."""
    try:
        import pypdf
    except ImportError:
        pypdf = None
    if pypdf is not None:
        return "\n".join(page.extract_text() or "" for page in pypdf.PdfReader(str(path)).pages)
    try:
        from pdfminer.high_level import extract_text
    except ImportError:
        return None
    return extract_text(str(path))


def source_text(path):
    """Text of one private source; None for a PDF when no PDF reader is installed."""
    path = Path(path)
    ext = path.suffix.lower()
    if ext in (".docx", ".pptx"):
        parts = DOCX_PARTS if ext == ".docx" else PPTX_PARTS
        with zipfile.ZipFile(path) as z:
            return "\n".join(ooxml_text(z.read(name).decode("utf-8", "ignore")) for name in z.namelist()
                             if parts.match(name))
    if ext == ".pdf":
        return _pdf_text(path)
    return path.read_bytes().decode("utf-8", "replace")


def read_list(path):
    """Paths of a source list: one per line, '#' comments, a relative path taken from the list's folder."""
    path = Path(path)
    out = []
    for ln in path.read_text(encoding="utf-8-sig").splitlines():
        s = ln.strip()
        if s and not s.startswith("#"):
            p = Path(s)
            out.append(p if p.is_absolute() else path.parent / p)
    return out


def source_files(entries):
    """(files, missing): the files of the entries -- a folder gives its SOURCE_EXT files, Office lock files (~$...)
    left out -- resolved and deduplicated; missing = the entries that do not exist."""
    files, seen, missing = [], set(), 0
    for entry in map(Path, entries):
        if entry.is_dir():
            found = sorted(p for p in entry.rglob("*") if p.suffix.lower() in SOURCE_EXT
                           and not p.name.startswith("~$") and p.is_file())
        elif entry.is_file():
            found = [entry]
        else:
            missing += 1
            continue
        for p in found:
            p = p.resolve()
            key = os.path.normcase(str(p))
            if key not in seen:
                seen.add(key)
                files.append(p)
    return files, missing


def _read_cache(path):
    """{key: (size, mtime_ns, hashes, Vietnamese hashes)} of a cache file; {} when it is missing, of another format or
    damaged."""
    try:
        data = Path(path).read_bytes()
        if not data.startswith(MAGIC):
            return {}
        end = data.index(b"\n", len(MAGIC))
        head = json.loads(data[len(MAGIC):end].decode("ascii"))
        if head.get("n") != N or head.get("norm") != NORM:
            return {}
        out, pos = {}, end + 1
        for e in head["entries"]:
            arrays = []
            for count in (e["count"], e["vi"]):
                arr = array("Q")
                arr.frombytes(data[pos:pos + 8 * count])
                pos += 8 * count
                arrays.append(arr)
            out[e["key"]] = (e["size"], e["mtime_ns"], arrays[0], arrays[1])
        return out if pos == len(data) else {}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def _write_cache(path, entries):
    """MAGIC, one JSON line {n, norm, entries: [{key, size, mtime_ns, count, vi}]}, then per entry its hashes and its
    Vietnamese hashes (uint64): no text."""
    path = Path(path)
    head = {"n": N, "norm": NORM, "entries": [{"key": k, "size": s, "mtime_ns": t, "count": len(a), "vi": len(v)}
                                              for k, s, t, a, v in entries]}
    data = MAGIC + json.dumps(head, separators=(",", ":")).encode("ascii") + b"\n" \
        + b"".join(a.tobytes() + v.tobytes() for _, _, _, a, v in entries)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def read_allow(path):
    """(shingle hashes, path globs) of an allow-list file; nothing when it is missing."""
    hashes, globs = set(), []
    if path is not None and Path(path).is_file():
        for ln in Path(path).read_text(encoding="utf-8-sig").splitlines():
            s = ln.strip()
            if not s or s.startswith("#"):
                continue
            if _HEX16.fullmatch(s):
                hashes.add(int(s, 16))
            else:
                globs.append(s)
    return hashes, globs


def _units(rel, data):
    """(where, text, markup) of each text of a published file: the file itself, or the XML / text entries of a
    .docx / .pptx / .xlsx / .zip (w:t / a:t parts as one line per paragraph). Binary data is skipped."""
    if rel.lower().endswith(ZIP_EXT):
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            z = None
        if z is not None:
            with z:
                for name in z.namelist():
                    low = name.lower()
                    if name.endswith("/") or low.endswith(".rels"):
                        continue
                    raw = z.read(name)
                    if b"\0" in raw[:4096]:
                        continue
                    text = raw.decode("utf-8", "ignore")
                    where = "%s!%s" % (rel, name)
                    if low.endswith(".xml") and _OOXML_TEXT.search(text):
                        yield where, ooxml_text(text), False
                    else:
                        yield where, text, low.endswith(MARKUP_EXT)
            return
    if b"\0" not in data[:4096]:
        yield rel, data.decode("utf-8", "ignore"), rel.lower().endswith(MARKUP_EXT)


def tree_files(root):
    """Published paths (posix, relative to root) of every file under root, .git left out."""
    root = Path(root)
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*")
                  if p.is_file() and ".git" not in p.relative_to(root).parts)


class Guard:
    """The hashed shingles of the private sources minus the allow-listed ones; scans what is about to be published."""

    def __init__(self, hashes, vi_hashes=(), allow_hashes=(), allow_globs=(), stats=None):
        self.hashes = set(hashes) - set(allow_hashes)
        self.vi_hashes = set(vi_hashes) & self.hashes
        self.allow_globs = list(DEFAULT_ALLOW_GLOBS) + list(allow_globs)
        self.allow_rules = len(set(allow_hashes)) + len(allow_globs)  # those of the allow-list file
        self.stats = dict(stats or {})

    def summary(self):
        s = self.stats
        out = "private text: %d sources (%d from cache), %d shingles, %d allow rules (+%d built in)" % (
            s.get("sources", 0), s.get("cached", 0), len(self.hashes), self.allow_rules, len(DEFAULT_ALLOW_GLOBS))
        if s.get("pdf_skipped"):
            out += ", PDFs skipped: %d (no pypdf / pdfminer in this Python)" % s["pdf_skipped"]
        if s.get("unreadable"):
            out += ", unreadable: %d" % s["unreadable"]
        if s.get("missing"):
            out += ", listed but missing: %d" % s["missing"]
        return out

    def scan_text(self, where, text, markup=False):
        """Hits of one text: each run of consecutive words whose every N-word window is a private shingle, kept when
        it holds an English window (N words without diacritics, shingle not Vietnamese) or reaches N_VI words."""
        if not self.hashes:
            return []
        words, spots, marks, plain = [], [], {}, []
        for no, line in enumerate(text.split("\n"), 1):
            decoded, mk = _decode(line, markup)
            if mk:
                marks[no] = mk
            for m in _WORD.finditer(decoded):
                w = _norm(m.group(0))
                if w:
                    words.append(w)
                    spots.append((no, m.start()))
                    plain.append(m.group(0).isascii())
        hs = [_shingle(words[i:i + N]) for i in range(len(words) - N + 1)]
        hits, i = [], 0
        while i < len(hs):
            if hs[i] not in self.hashes:
                i += 1
                continue
            j = i
            while j + 1 < len(hs) and hs[j + 1] in self.hashes:
                j += 1
            size = j - i + N
            english = any(hs[k] not in self.vi_hashes and all(plain[k:k + N]) for k in range(i, j + 1))
            if english or size >= N_VI:
                no, col = spots[i]
                hits.append(Hit(where, no, _raw_col(marks.get(no), col) + 1, size, tuple(hs[i:j + 1])))
            i = j + 1
        return hits

    def scan_bytes(self, rel, data):
        """Hits of one published file; rel = its published path (what the allow-list globs name)."""
        if not self.hashes:
            return []
        hits = []
        for where, text, markup in _units(rel, data):
            if not any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(where, g) for g in self.allow_globs):
                hits.extend(self.scan_text(where, text, markup))
        return hits

    def scan_items(self, items):
        """Hits of (published path, bytes) pairs, sorted by place."""
        hits = []
        for rel, data in items:
            hits.extend(self.scan_bytes(rel, data))
        return sorted(hits, key=lambda h: (h.where, h.line, h.col))

    def scan_tree(self, root):
        root = Path(root)
        return self.scan_items((rel, (root / rel).read_bytes()) for rel in tree_files(root))


def load(sources, cache=None, allow=None):
    """The guard of the sources (files or folders); cache = the hash cache file (read, then rewritten when a source
    was read again), allow = the allow-list file."""
    files, missing = source_files(sources)
    old = _read_cache(cache) if cache else {}
    stats = {"sources": 0, "cached": 0, "extracted": 0, "pdf_skipped": 0, "unreadable": 0, "missing": missing}
    entries, hashes, vi_hashes = [], set(), set()
    for path in files:
        key = hashlib.sha256(os.path.normcase(str(path)).encode("utf-8")).hexdigest()[:32]
        try:
            st = path.stat()
            known = old.get(key)
            if known and known[0] == st.st_size and known[1] == st.st_mtime_ns:
                arr, vi, text = known[2], known[3], ""
            else:
                arr, vi, text = None, None, source_text(path)
        except Exception:  # a damaged or locked document: counted in the summary, never fatal
            stats["unreadable"] += 1
            continue
        if arr is not None:
            stats["cached"] += 1
        elif text is None:
            stats["pdf_skipped"] += 1  # not cached: read once a PDF reader is installed
            continue
        else:
            all_set, vi_set = text_hashes(text)
            arr, vi = array("Q", sorted(all_set)), array("Q", sorted(vi_set))
            stats["extracted"] += 1
        entries.append((key, st.st_size, st.st_mtime_ns, arr, vi))
        hashes.update(arr)
        vi_hashes.update(vi)
    stats["sources"] = len(entries)
    if cache and entries and (stats["extracted"] or set(old) != {e[0] for e in entries}):
        try:
            _write_cache(cache, entries)
        except OSError:  # held open by another run, or not writable: the cache only saves time
            pass
    allow_hashes, allow_globs = read_allow(allow)
    return Guard(hashes, vi_hashes, allow_hashes, allow_globs, stats)


def for_repo(repo, lists=None, cache=None, allow=None):
    """The guard of a repo: the sources of the lists (default <repo>/private/corpus.txt and text_sources.txt; a
    missing list counts as a missing source), cache and allow list under <repo>/private/ unless given."""
    private = Path(repo) / "private"
    lists = [private / "corpus.txt", private / "text_sources.txt"] if lists is None else [Path(p) for p in lists]
    entries, missing_lists = [], 0
    for lst in lists:
        if lst.is_file():
            entries.extend(read_list(lst))
        else:
            missing_lists += 1
    guard = load(entries, cache=private / CACHE_NAME if cache is None else cache,
                 allow=private / "text_allow.txt" if allow is None else allow)
    guard.stats["missing"] += missing_lists
    return guard


def main(argv=None):
    ap = argparse.ArgumentParser(description="Find text copied from the private documents (location and run length "
                                             "only, never the words).")
    ap.add_argument("paths", nargs="+", metavar="PATH", help="file or folder to scan")
    ap.add_argument("--sources", action="append", metavar="LIST",
                    help="source list (default <repo>/private/corpus.txt and <repo>/private/text_sources.txt)")
    ap.add_argument("--allow", help="allow list (default <repo>/private/text_allow.txt)")
    ap.add_argument("--cache", help="hash cache (default <repo>/private/%s)" % CACHE_NAME)
    ap.add_argument("--hashes", action="store_true", help="also print each hit's shingle hashes (allow-list lines)")
    args = ap.parse_args(argv)
    t0 = time.time()
    guard = for_repo(ROOT, lists=args.sources, cache=args.cache, allow=args.allow)
    t1 = time.time()
    hits, files = [], 0
    for p in map(Path, args.paths):
        if p.is_dir():
            rels = tree_files(p)
            files += len(rels)
            hits += guard.scan_items((rel, (p / rel).read_bytes()) for rel in rels)
        elif p.is_file():
            files += 1
            hits += guard.scan_items([(p.as_posix(), p.read_bytes())])
        else:
            print("no such path: %s" % _ascii(p))
            return 2
    t2 = time.time()
    print("%s (%.1f s)" % (guard.summary(), t1 - t0))
    if not guard.stats.get("sources"):
        print("WARNING: no private source was read: nothing to compare against")
    if hits:
        print("%d private-text hit(s) in %d files scanned (%.1f s):" % (len(hits), files, t2 - t1))
        for h in hits:
            print("  " + format_hit(h))
            if args.hashes:
                for x in h.hashes:
                    print("    %016x" % x)
        return 1
    print("scan: %d files, no private text: clean (%.1f s)" % (files, t2 - t1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
