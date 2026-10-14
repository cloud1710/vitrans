"""Pack validator: the ownership rule across packs (K2 of docs/packs/2026-10-14-pack-roadmap.md) plus the per-pack
checks of the 2026-10-13 draft review.

Usage: python tools/check_packs.py [packs_dir] [--report FILE] [--no-drafts] [--parens-error]
  -> ASCII summary and the ERROR lines on the console; every finding (UTF-8, Vietnamese kept) in FILE (default
     out/check_packs.txt); exit 1 when there is an ERROR. tools/build_registry.py prints the one-line summary.

Keys are compared normalised (norm_key): NFC, lower case, hyphen = space, spaces collapsed, last word singular
(biopsies = biopsy, processes = process, nodes = node; words in -ss / -us / -is / -as kept). Values: NFC, case and
spacing ignored. Every pack of packs_dir can be selected together with every other (3 families / 6 packs), so the
rule is checked on every pair.

Ownership rule:
- cross_pack ERROR: one key, two values in two packs, unless one pack is the other's ancestor: INFO "override" (a
  child may override its own parent; it merges first). Rows two packs take from the same _shared include agree.
- fix_cross_pack ERROR: a term fix of pack A for a key that a pack B (neither A's ancestor nor its descendant) holds
  with another value, as a glossary row or a fix: which one wins would depend on the scores of the document.
- owner: packs/_shared/owners.csv (key,owner,note). owner "-": a bare key no pack may hold (ERROR, use a compound
  key); owner = pack id: every other pack except the owner's descendants must hold the owner's value (ERROR);
  WARNING while the owner pack does not exist or has no row for the key.
Per pack:
- pack_json ERROR: unreadable, id != folder name, version not MAJOR.MINOR.PATCH, parent not in packs_dir, depth > 2
- include ERROR: bad or missing include; include_override: an own row repeating (WARNING) or overriding (ERROR) a
  row of its include
- csv ERROR: header not en,vi,note, a row without 3 columns, empty en or vi; nfc ERROR: text not NFC; split_key
  ERROR: "A / B" keys; paren_key WARNING (ERROR with --parens-error): keys with "("
- duplicate_key: one normalised key twice in a pack: WARNING same value, ERROR another value
- rules ERROR: rules.json unreadable, a fix without en, wrong not a list of strings, an invalid regex
- fix_vs_glossary ERROR: a fix whose key has another value in the pack's own glossary
- fix_rewrites_canonical ERROR: in the merge of each family (root alone, each child before its root) a fix that
  rewrites the canonical value of another row (qa.apply_term_fixes on every row)
- tests ERROR: a tests.jsonl line that is not a JSON object, no src, must / must_not not lists of strings, must_any
  not a list of lists of strings; WARNING: an unknown field
- detect WARNING: a detect keyword among build_registry.COMMON_WORDS
"""
import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import namedtuple
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
sys.path.insert(0, str(ROOT / "helper"))
sys.path.insert(0, str(TOOLS))

import build_registry  # noqa: E402
from vitranslate.packs import (Pack, TermFix, _same_value, expand_includes, merge_packs, read_glossary,  # noqa: E402
                               resolve_includes)
from vitranslate.qa import apply_term_fixes  # noqa: E402

Finding = namedtuple("Finding", "level check pack key message")
LEVELS = {"ERROR": 0, "WARNING": 1, "INFO": 2}
TEST_FIELDS = {"src", "must", "must_not", "must_any", "note"}
_KEEP_S = ("ss", "us", "is", "as")


def _nfc(s):
    return unicodedata.normalize("NFC", s)


def _singular(w):
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 4 and w.endswith(("sses", "shes", "ches", "xes", "zes")):
        return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith(_KEEP_S):
        return w[:-1]
    return w


def norm_key(en):
    words = _nfc(en).lower().replace("-", " ").split()
    return " ".join(words[:-1] + [_singular(words[-1])]) if words else ""


def norm_value(vi):
    return " ".join(_nfc(vi).split()).casefold()


class Packs:
    """Every readable pack of packs_dir: meta, own and expanded glossary rows, valid term fixes."""

    def __init__(self):
        self.meta, self.dirs, self.glossary, self.fixes = {}, {}, {}, {}

    def ancestors(self, pid):
        chain, parent = [], self.meta[pid].get("parent")
        while parent in self.meta and parent != pid and parent not in chain:
            chain.append(parent)
            parent = self.meta[parent].get("parent")
        return chain

    def related(self, a, b):
        return a in self.ancestors(b) or b in self.ancestors(a)

    def value(self, pid, key):
        """(English as written, value) of the pack's row for a normalised key, or None."""
        for en, vi, _ in self.glossary[pid]:
            if norm_key(en) == key:
                return en, vi
        return None


def _csv_rows(path, label, add, parens_error):
    """Raw CSV checks of one glossary file (header, columns, empty cells, NFC, split / parenthesis keys)."""
    with Path(path).open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows or rows[0] != ["en", "vi", "note"]:
        add("ERROR", "csv", label, "", "header must be en,vi,note (found %s)" % (rows[0] if rows else "nothing"))
        return
    for n, row in enumerate(rows[1:], 2):
        if not row:
            continue
        if len(row) != 3:
            add("ERROR", "csv", label, norm_key(row[0]), "line %d has %d columns, not 3" % (n, len(row)))
            continue
        en, vi, note = row
        key = norm_key(en)
        if not en.strip() or not vi.strip():
            add("ERROR", "csv", label, key, "line %d: empty en or vi" % n)
        if any(_nfc(c) != c for c in row):
            add("ERROR", "nfc", label, key, "line %d is not NFC" % n)
        if " / " in en:
            add("ERROR", "split_key", label, key, "line %d: 'A / B' key, give each form its own row" % n)
        if "(" in en:
            add("ERROR" if parens_error else "WARNING", "paren_key", label, key,
                "line %d: key with '(' never matches a text; rewrite it" % n)


def _rules(d, pid, add):
    if not (d / "rules.json").is_file():
        return {}
    try:
        rules = json.loads((d / "rules.json").read_text(encoding="utf-8"))
        if not isinstance(rules, dict) or not isinstance(rules.get("term_fixes", []), list):
            raise ValueError("not {\"term_fixes\": [...]}")
        return rules
    except ValueError as exc:
        add("ERROR", "rules", pid, "", "rules.json unreadable: %s" % exc)
        return {}


def _valid_fixes(pid, fix_dicts, add):
    out = []
    for fx in fix_dicts:
        en = fx.get("en") if isinstance(fx, dict) else None
        if not isinstance(en, str) or not en.strip() or not isinstance(fx.get("vi", ""), str):
            add("ERROR", "rules", pid, "", "term fix without en / vi: %r" % (fx,))
            continue
        key, wrong = norm_key(en), fx.get("wrong", [])
        if not isinstance(wrong, list) or not all(isinstance(w, str) for w in wrong):
            add("ERROR", "rules", pid, key, "wrong must be a list of strings")
            continue
        bad = []
        for pat in wrong:
            try:
                re.compile(pat)
            except re.error as exc:
                bad.append("%r (%s)" % (pat, exc))
        if bad:
            add("ERROR", "rules", pid, key, "invalid wrong pattern " + ", ".join(bad))
            continue
        if _nfc(fx.get("vi", "")) != fx.get("vi", "") or any(_nfc(w) != w for w in wrong):
            add("ERROR", "nfc", pid, key, "term fix is not NFC")
        out.append(TermFix(en, fx.get("vi", ""), list(wrong)))
    return out


def _tests(d, pid, add):
    if not (d / "tests.jsonl").is_file():
        return
    for n, line in enumerate((d / "tests.jsonl").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            t = json.loads(line)
        except ValueError:
            add("ERROR", "tests", pid, "", "line %d is not JSON" % n)
            continue
        if not isinstance(t, dict) or not isinstance(t.get("src"), str):
            add("ERROR", "tests", pid, "", "line %d: an object with a src string is required" % n)
            continue
        bad = [k for k in ("must", "must_not") if k in t and not (
            isinstance(t[k], list) and all(isinstance(s, str) for s in t[k]))]
        if "must_any" in t and not (isinstance(t["must_any"], list) and all(
                isinstance(g, list) and all(isinstance(s, str) for s in g) for g in t["must_any"])):
            bad.append("must_any")
        if bad:
            add("ERROR", "tests", pid, "", "line %d: %s must be lists of strings" % (n, ", ".join(bad)))
        unknown = sorted(set(t) - TEST_FIELDS)
        if unknown:
            add("WARNING", "tests", pid, "", "line %d: unknown field(s) %s" % (n, ", ".join(unknown)))


def _load(packs_dir, include_drafts, parens_error, add):
    packs = Packs()
    for d in sorted(Path(packs_dir).iterdir(), key=lambda p: p.name):
        if not d.is_dir() or d.name.startswith("_") or not (d / "pack.json").is_file():
            continue
        try:
            meta = json.loads((d / "pack.json").read_text(encoding="utf-8"))
            if not isinstance(meta, dict):
                raise ValueError("not an object")
        except ValueError as exc:
            add("ERROR", "pack_json", d.name, "", "pack.json unreadable: %s" % exc)
            continue
        if meta.get("draft") is True and not include_drafts:
            continue
        pid = d.name
        if meta.get("id") != pid or not build_registry.ID_RE.fullmatch(str(meta.get("id"))) \
                or not build_registry.VERSION_RE.fullmatch(str(meta.get("version"))):
            add("ERROR", "pack_json", pid, "", "id must equal the folder name; version MAJOR.MINOR.PATCH")
        packs.meta[pid], packs.dirs[pid] = meta, d
        if (d / "glossary.csv").is_file():
            _csv_rows(d / "glossary.csv", pid, add, parens_error)
        own = read_glossary(d / "glossary.csv")
        try:
            includes = resolve_includes(d, meta)
        except ValueError as exc:
            add("ERROR", "include", pid, "", str(exc))
            includes = []
        for name, rows, _ in includes:
            shared = {norm_key(en): vi for en, vi, _ in rows}
            for en, vi, _ in own:
                k = norm_key(en)
                if k in shared:
                    same = norm_value(vi) == norm_value(shared[k])
                    add("WARNING" if same else "ERROR", "include_override", pid, k,
                        ("repeats the row of %s" if same else "overrides %s (%s -> %s): change the shared file")
                        % ((name,) if same else (name, shared[k], vi)))
        glossary, fix_dicts = expand_includes(own, _rules(d, pid, add).get("term_fixes", []), includes)
        packs.glossary[pid] = glossary
        packs.fixes[pid] = _valid_fixes(pid, fix_dicts, add)
        _tests(d, pid, add)
        for word in sorted({build_registry._norm(k) for k in meta.get("detect", [])} & build_registry.COMMON_WORDS):
            add("WARNING", "detect", pid, word, "detect keyword is a common English word")
    shared_dir = Path(packs_dir) / "_shared"
    if shared_dir.is_dir():
        for f in sorted(shared_dir.glob("*.csv")):
            if f.name != "owners.csv":
                _csv_rows(f, "_shared/" + f.stem, add, parens_error)
    return packs


def _pack_checks(packs, add):
    for pid, meta in packs.meta.items():
        parent = meta.get("parent")
        if parent is not None and parent not in packs.meta:
            add("ERROR", "pack_json", pid, "", "parent %s is not in the packs folder" % parent)
        elif parent is not None and packs.meta[parent].get("parent") is not None:
            add("ERROR", "pack_json", pid, "", "depth > 2: parent %s has a parent itself" % parent)
        groups = {}
        for en, vi, _ in packs.glossary[pid]:
            groups.setdefault(norm_key(en), []).append((en, vi))
        for key, rows in groups.items():
            if len(rows) > 1:
                same = len({norm_value(vi) for _, vi in rows}) == 1
                add("WARNING" if same else "ERROR", "duplicate_key", pid, key,
                    "%d rows: %s" % (len(rows), "; ".join("%s = %s" % r for r in rows)))
        for fx in packs.fixes[pid]:
            row = packs.value(pid, norm_key(fx.en))
            if row and not _same_value(row[1], fx.vi):
                add("ERROR", "fix_vs_glossary", pid, norm_key(fx.en),
                    "fix -> %s, glossary row %s = %s" % (fx.vi, row[0], row[1]))


def _cross_checks(packs, add):
    holders = {}
    for pid in packs.meta:
        for en, vi, _ in packs.glossary[pid]:
            holders.setdefault(norm_key(en), {}).setdefault(pid, vi)
    for key, by_pack in holders.items():
        ids = sorted(by_pack)
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                va, vb = by_pack[a], by_pack[b]
                if norm_value(va) == norm_value(vb):
                    continue
                if packs.related(a, b):
                    child, anc = (a, b) if b in packs.ancestors(a) else (b, a)
                    add("INFO", "override", child, key, "overrides %s: %s -> %s" % (anc, by_pack[anc], by_pack[child]))
                else:
                    add("ERROR", "cross_pack", a, key, "%s = %s, but %s = %s (not parent / child)" % (a, va, b, vb))
    fixes = {pid: {norm_key(f.en): f for f in packs.fixes[pid]} for pid in packs.meta}
    for a in sorted(packs.meta):
        for key, fx in fixes[a].items():
            for b in sorted(packs.meta):
                if b == a or packs.related(a, b):
                    continue
                vb = holders.get(key, {}).get(b)
                if vb is not None and not _same_value(vb, fx.vi):
                    add("ERROR", "fix_cross_pack", a, key, "%s fixes to %s, but %s = %s" % (a, fx.vi, b, vb))
                other = fixes[b].get(key)
                if a < b and other is not None and norm_value(other.vi) != norm_value(fx.vi):
                    add("ERROR", "fix_cross_pack", a, key, "%s fixes to %s, %s fixes to %s" % (a, fx.vi, b, other.vi))
    return holders


def _owners(packs_dir, packs, holders, add):
    path = Path(packs_dir) / "_shared" / "owners.csv"
    if not path.is_file():
        return
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows or rows[0] != ["key", "owner", "note"]:
        add("ERROR", "csv", "_shared/owners", "", "header must be key,owner,note")
        return
    for row in rows[1:]:
        if len(row) != 3 or not row[0].strip() or not row[1].strip():
            if row:
                add("ERROR", "csv", "_shared/owners", "", "bad row %r" % (row,))
            continue
        key, owner = norm_key(row[0]), row[1].strip()
        held = holders.get(key, {})
        for pid in sorted(held):
            if owner == "-":
                add("ERROR", "owner", pid, key, "bare key nobody may hold: use a compound key")
            elif pid == owner or owner in packs.ancestors(pid):
                continue
            elif owner not in packs.meta:
                add("WARNING", "owner", pid, key, "owned by %s, which is not in the packs folder yet" % owner)
            elif key not in holders or owner not in held:
                add("WARNING", "owner", pid, key, "owned by %s, which has no row for it" % owner)
            elif norm_value(held[pid]) != norm_value(held[owner]):
                add("ERROR", "owner", pid, key, "owned by %s (%s); here %s" % (owner, held[owner], held[pid]))


def _family_merges(packs, add):
    """Each root alone and each child merged before its root: no fix may rewrite another row's canonical value."""
    def pack(pid):
        m = packs.meta[pid]
        return Pack(pid, str(m.get("version")), pid, [], "", packs.glossary[pid], packs.fixes[pid], [])

    for pid in sorted(packs.meta):
        chain = [pid] + packs.ancestors(pid)
        merged = merge_packs([pack(p) for p in chain])
        owner = {}
        for p in chain:
            for fx in packs.fixes[p]:
                owner.setdefault(norm_key(fx.en), p)
        for en, vi, _ in merged.glossary:
            key = norm_key(en)
            others = [fx for fx in merged.term_fixes if norm_key(fx.en) != key]
            out, applied = apply_term_fixes(vi, en, others)
            if out != vi:
                for fen in applied:
                    add("ERROR", "fix_rewrites_canonical", owner.get(norm_key(fen), pid), key,
                        "fix %r rewrites %s = %s -> %s" % (fen, en, vi, out))


def check(packs_dir, include_drafts=True, parens_error=False):
    """Sorted, de-duplicated findings for packs_dir."""
    found = set()

    def add(level, check_name, pack, key, message):
        found.add(Finding(level, check_name, pack, key, message))

    packs = _load(packs_dir, include_drafts, parens_error, add)
    _pack_checks(packs, add)
    holders = _cross_checks(packs, add)
    _owners(packs_dir, packs, holders, add)
    _family_merges(packs, add)
    return sorted(found, key=lambda f: (LEVELS[f.level], f.check, f.pack, f.key, f.message))


def summary(findings):
    n = {lvl: sum(1 for f in findings if f.level == lvl) for lvl in LEVELS}
    return "%d error(s), %d warning(s), %d override(s)" % (n["ERROR"], n["WARNING"], n["INFO"])


def _ascii(s):
    return s.encode("ascii", "replace").decode("ascii")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check the ViTranslate packs (ownership rule and pack files).")
    ap.add_argument("packs_dir", nargs="?", default=str(ROOT / "packs"))
    ap.add_argument("--report", default=str(ROOT / "out" / "check_packs.txt"), help="UTF-8 file with every finding")
    ap.add_argument("--no-drafts", action="store_true", help="leave out packs marked \"draft\": true")
    ap.add_argument("--parens-error", action="store_true", help="keys with '(' are errors, not warnings")
    args = ap.parse_args(argv)
    fs = check(args.packs_dir, include_drafts=not args.no_drafts, parens_error=args.parens_error)
    report = Path(args.report)
    report.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# check_packs %s: %s" % (args.packs_dir, summary(fs)), "# level\tcheck\tpack\tkey\tmessage"]
    lines += ["\t".join(f) for f in fs]
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(_ascii("check_packs: %s in %s -> %s" % (summary(fs), args.packs_dir, report)))
    counts = {}
    for f in fs:
        counts[(f.level, f.check)] = counts.get((f.level, f.check), 0) + 1
    for (level, name), n in sorted(counts.items(), key=lambda kv: (LEVELS[kv[0][0]], kv[0][1])):
        print("  %-7s %-24s %d" % (level, name, n))
    for f in fs:
        if f.level == "ERROR":
            print(_ascii("ERROR %s %s [%s]: %s" % (f.check, f.pack, f.key, f.message)))
    return 1 if any(f.level == "ERROR" for f in fs) else 0


if __name__ == "__main__":
    sys.exit(main())
