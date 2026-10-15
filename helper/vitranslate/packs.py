"""Skill packs: prompt text, glossary and term fixes as data. `_style` (bundled) is shared by every job; domain packs
come from the registry (registry.py, chosen by matching.py) and the selected packs merge into one (merge_packs)."""
import csv
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .qa import _bounded
from .vnsyllable import suspicious


@lru_cache(maxsize=4096)
def _rx(pattern):
    return re.compile(pattern).findall


@dataclass
class TermFix:
    en: str
    vi: str
    wrong: list


@dataclass
class Pack:
    id: str
    version: str
    name: str
    detect: list
    prompt: str
    glossary: list
    term_fixes: list
    tests: list
    merged_key: str = ""  # set by merge_packs: the keys of every merged pack

    def key(self):
        return self.merged_key or "%s@%s" % (self.id, self.version)


# No domain pack selected: translation runs with the style pack only.
EMPTY_PACK = Pack("_none", "0", "Chung", [], "", [], [], [])


SHARED_RE = re.compile(r"^_shared/[a-z0-9_-]+$")


def read_glossary(path):
    """[(en, vi, note)] of a glossary CSV (header en,vi,note); rows without en or vi are skipped."""
    rows = []
    if Path(path).exists():
        with Path(path).open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                if row.get("en") and row.get("vi"):
                    rows.append((row["en"].strip(), row["vi"].strip(), (row.get("note") or "").strip()))
    return rows


def resolve_includes(d, meta):
    """[(name, glossary rows, term-fix dicts)] for pack.json "include": ["_shared/<name>", ...], read from
    <packs root>/_shared/<name>.csv and the optional <name>.rules.json next to it (the packs root = the parent of the
    pack directory). ValueError for a malformed name or a missing file. Registry zips carry the expanded files and no
    "include" (tools/build_registry.py), so the helper never resolves anything at runtime."""
    out = []
    for name in meta.get("include") or []:
        if not isinstance(name, str) or not SHARED_RE.fullmatch(name):
            raise ValueError("pack %s: include %r must be _shared/<name> (a-z, 0-9, _ or -)" % (meta.get("id"), name))
        base = Path(d).parent / name
        csv_path, rules_path = base.with_name(base.name + ".csv"), base.with_name(base.name + ".rules.json")
        if not csv_path.is_file():
            raise ValueError("pack %s: include %s: %s not found" % (meta.get("id"), name, csv_path))
        rules = json.loads(rules_path.read_text(encoding="utf-8")) if rules_path.is_file() else {}
        out.append((name, read_glossary(csv_path), list(rules.get("term_fixes", []))))
    return out


def expand_includes(glossary, fixes, includes):
    """(glossary rows, term-fix dicts): the pack's own first, then each include's in order, skipping an English key
    (lower case) already present -- the pack's own row wins (tools/check_packs.py reports such a row)."""
    glossary, fixes = list(glossary), list(fixes)
    keys, fixed = {r[0].lower() for r in glossary}, {f["en"].lower() for f in fixes}
    for _, rows, more in includes:
        for row in rows:
            if row[0].lower() not in keys:
                keys.add(row[0].lower())
                glossary.append(row)
        for fx in more:
            if fx["en"].lower() not in fixed:
                fixed.add(fx["en"].lower())
                fixes.append(fx)
    return glossary, fixes


def load_pack(dir_or_root, pack_id=None):
    """load_pack(root, id) reads root/id; load_pack(pack_dir) reads that directory (e.g. an unpacked registry pack).
    A source pack's "include" entries are expanded (resolve_includes)."""
    d = Path(dir_or_root) / pack_id if pack_id else Path(dir_or_root)
    pack_id = pack_id or d.name
    meta = json.loads((d / "pack.json").read_text(encoding="utf-8"))
    prompt = (d / "prompt.md").read_text(encoding="utf-8").strip() if (d / "prompt.md").exists() else ""
    rules = json.loads((d / "rules.json").read_text(encoding="utf-8")) if (d / "rules.json").exists() else {}
    glossary, fix_dicts = expand_includes(read_glossary(d / "glossary.csv"), rules.get("term_fixes", []),
                                          resolve_includes(d, meta))
    fixes = [TermFix(f["en"], f["vi"], list(f.get("wrong", []))) for f in fix_dicts]
    for fx in fixes:
        for pat in fx.wrong:
            try:
                re.compile(pat)
            except re.error as e:
                raise ValueError("pack %s: invalid wrong pattern %r for %r: %s" % (pack_id, pat, fx.en, e))
    tests = []
    if (d / "tests.jsonl").exists():
        tests = [json.loads(line) for line in (d / "tests.jsonl").read_text(encoding="utf-8").splitlines()
                 if line.strip()]
    return Pack(meta["id"], meta["version"], meta.get("name", meta["id"]), meta.get("detect", []), prompt,
                glossary, fixes, tests)


_TRAILING_ABBR_RE = re.compile(r"\s*\([^()]*\)\s*$")


def _vi_key(vi):
    return " ".join(vi.split()).casefold()


def _same_value(glossary_vi, fix_vi):
    """A term fix steers to the glossary value: equal ignoring case and spacing, also when the glossary value carries
    a trailing abbreviation ("... kim nho (FNA)" vs the fix "... kim nho")."""
    return _vi_key(fix_vi) in (_vi_key(glossary_vi), _vi_key(_TRAILING_ABBR_RE.sub("", glossary_vi)))


def merge_packs(packs):
    """One pack from several, in merge order (a child before its parent, families by score): the earlier pack wins
    every conflict (glossary and term fixes by lower-cased English). A later pack's term fix is kept when it agrees
    with the earlier value of its English term and dropped when it disagrees: an earlier glossary row with another
    value, or an earlier fix with another value. Two fixes with the same value become one, with the wrong forms of
    both. None for no packs (the caller falls back to EMPTY_PACK)."""
    packs = list(packs)
    if not packs:
        return None
    if len(packs) == 1:
        return packs[0]
    glossary, seen = [], set()
    for p in packs:
        for row in p.glossary:
            if row[0].lower() not in seen:
                seen.add(row[0].lower())
                glossary.append(row)
    fixes, fixed, owned = [], {}, {}
    for p in packs:
        for fx in p.term_fixes:
            key = fx.en.lower()
            if key in fixed:  # an earlier fix of the term: same value -> one fix with both wrong lists
                i = fixed[key]
                extra = [w for w in fx.wrong if w not in fixes[i].wrong]
                if extra and _vi_key(fixes[i].vi) == _vi_key(fx.vi):
                    fixes[i] = TermFix(fixes[i].en, fixes[i].vi, fixes[i].wrong + extra)
            elif key not in owned or _same_value(owned[key], fx.vi):
                fixed[key] = len(fixes)
                fixes.append(fx)
        for row in p.glossary:  # later packs may only re-fix these terms towards the same value
            owned.setdefault(row[0].lower(), row[1])
    detect = []
    for p in packs:
        detect += [w for w in p.detect if w not in detect]
    return Pack("+".join(p.id for p in packs), "+".join(p.version for p in packs), ", ".join(p.name for p in packs),
                detect, "\n\n".join(p.prompt for p in packs if p.prompt), glossary, fixes,
                [t for p in packs for t in p.tests], merged_key="+".join(p.key() for p in packs))


def allowed_words(pack):
    """The words of a pack's Vietnamese values (glossary and term-fix values; never a note or a wrong form) that are no
    regular Vietnamese syllable (vnsyllable.suspicious), in lower case, sorted: the house forms the pack's author chose
    (lympho with a circumflex, eponyms such as Sezary with an acute), which the suspicious-word check accepts in a job
    that uses the pack (qa.suspicious_tokens)."""
    words = set()
    for vi in [row[1] for row in pack.glossary] + [fx.vi for fx in pack.term_fixes]:
        words.update(t.lower() for t in suspicious(vi))
    return sorted(words)


def _count(term, low):
    """Whole-word occurrences with the glossary matcher of qa (plurals, -logy / -logic, British spelling, hyphens)."""
    return len(_rx(_bounded(term))(low))


def glossary_hits(text, glossary, limit=80):
    """Glossary entries present in text, most frequent (then longest) first, as (en, vi)."""
    low, hits, seen = text.lower(), [], set()
    for en, vi, _ in glossary:
        if en.lower() in seen:
            continue
        n = _count(en, low)
        if n:
            seen.add(en.lower())
            hits.append((n, len(en), en, vi))
    hits.sort(key=lambda h: (-h[0], -h[1]))
    return [(en, vi) for _, _, en, vi in hits[:limit]]
