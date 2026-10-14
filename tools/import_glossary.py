"""Convert a translator-project glossary (markdown tables) into a pack glossary.csv + rules.json.

Usage: python tools/import_glossary.py <glossary.md> <seeds.json> <pack_dir> [overrides.json]
(overrides default to pathology_overrides.json next to the seeds file when that file exists)
Rows: | English | Vietnamese | note |.
- 'a / b' in the English cell gives one row per part. When the Vietnamese cell has the same number of ' / ' parts they
  are paired by position; otherwise every part gets the full Vietnamese cell. Overrides {"vi": {en: vi}, "drop":
  [en]} win over pairing for shared-head rows ("nuclear staining" = "nhuom nhan") and remove generic keys;
  overrides "add": [{en, vi, note}] are rows of their own, parsed like glossary rows after the file (so an added row
  wins a conflict, which is reported).
- 'ABBR (expansion)' English cells key on BOTH the abbreviation and the expansion.
- A trailing '(ABBR)' qualifier is stripped only when it looks like an abbreviation (letters/digits, mostly upper
  case); context qualifiers such as '(staining)' stay in the key.
- A vi cell that starts with 'giu nguyen' / 'giu tieng Anh' / 'khong dich' is an instruction, not a translation:
  vi becomes the English part itself, the instruction is appended to the note and no term_fix is generated.
- Markdown emphasis (** and backticks) is stripped from every cell.
- Duplicate English keys with different vi: a single-term row beats a part split from 'a / b'; between rows of the
  same kind the LATER row wins; each conflict is reported. Notes that claim a different vi for another row's key
  ("lymphocyte"=...) are reported as note conflicts (data unchanged).
Term fixes (VN->VN wrong variants, applied by the term-lock) are generated ONLY when all hold, else reported:
  a. the wrong-variant clause starts with the upper-case word KHONG and ends at the next ';' '.' '(' or end of note;
     quoted alternatives are split on '/' and de-duplicated;
  b. the owner is unambiguous (single English term, or the note names exactly one part, or exactly one part's paired
     vi is quoted before KHONG);
  c. the canonical vi has no ' / ';
  d. the wrong variant is not inside ANY glossary vi value (case-insensitive);
  e. the wrong variant has >= 3 syllables, unless listed in seeds "allow_short";
  f. the wrong variant is not a fragment: it has at least 2/3 of the words of the canonical vi;
  g. the English key is not in seeds "deny".  Seeds "allow_partial" (user-confirmed
     rules) exempts a key from rule f only.
The fix replacement ("vi") is the canonical WITHOUT its trailing parenthetical, so an abbreviation the model already
wrote stays untouched. Seeds file: {"allow_short": [...], "deny": [en...], "fixes": [{en, vi, wrong: [regex...]}]};
seed fixes come first, are exempt from rules e and f (hand-checked) but not from rule d.
"""
import csv
import json
import re
import sys
from pathlib import Path

_QUOTE_RE = re.compile(r"[\"\u201c]([^\"\u201d]+)[\"\u201d]")
_NOT = "KH\u00d4NG"
_KEEP_RE = re.compile(r"^(gi\u1eef nguy\u00ean|gi\u1eef ti\u1ebfng anh|kh\u00f4ng d\u1ecbch)", re.IGNORECASE)
_PAREN_RE = re.compile(r"\s*\(([^)]*)\)\s*$")
_ALIAS_RE = re.compile(r"^([A-Z][A-Z0-9/+\-]*[A-Z0-9])\s*\((.+)\)$")
_CLAIM_RE = re.compile(r"[\"\u201c]([^\"\u201d]+)[\"\u201d]\s*=\s*([^,;.|\"\u201d()]+)")
MIN_SYLLABLES = 3


class Row(tuple):
    """(en, vi, note); .multi: part of an 'a / b' English cell; .paired: vi came from positional pairing."""
    multi = False
    paired = False


def _cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _strip_md(text):
    return text.replace("**", "").replace("`", "").strip()


def _is_abbr(inner):
    if not re.fullmatch(r"[A-Za-z0-9/+\-]+", inner):
        return False
    letters = [c for c in inner if c.isalpha()]
    return bool(letters) and sum(c.isupper() for c in letters) * 2 >= len(letters)


def _strip_abbr(en):
    m = _PAREN_RE.search(en)
    if m and _is_abbr(m.group(1)):
        return en[:m.start()].strip()
    return en


def _keys(part):
    """English keys of one part: 'ABBR (expansion)' gives both, otherwise the abbreviation-stripped part."""
    m = _ALIAS_RE.match(part)
    if m and not _is_abbr(m.group(2)):
        return [m.group(1), m.group(2).strip()]
    k = _strip_abbr(part)
    return [k] if k else []


def _wrong_variants(note):
    idx = note.find(_NOT)
    if idx < 0:
        return []
    rest = note[idx + len(_NOT):]
    m = re.search(r"[;.(]", rest)
    clause = rest[:m.start()] if m else rest
    out, seen = [], set()
    for q in _QUOTE_RE.findall(clause):
        for part in q.split("/"):
            p = part.strip()
            if p and p.lower() not in seen:
                seen.add(p.lower())
                out.append(p)
    return out


def _added_lines(overrides):
    """Overrides "add": [{en, vi, note}] as markdown table rows, parsed after the glossary file like its own rows."""
    lines = []
    for item in (overrides or {}).get("add", []):
        cells = [item["en"], item["vi"], item.get("note", "")]
        if any("|" in c or "\n" in c for c in cells):
            raise ValueError("override row %r: '|' or a line break inside a cell" % item["en"])
        lines.append("| %s | %s | %s |" % tuple(cells))
    return lines


def parse(md_text, overrides=None):
    """Return (rows, cands): rows are Row(en, vi, note); cands carry the row index and a local skip reason."""
    ov_vi = {k.lower(): v for k, v in (overrides or {}).get("vi", {}).items()}
    drop = {k.lower() for k in (overrides or {}).get("drop", [])}
    rows, cands = [], []
    for line in md_text.splitlines() + _added_lines(overrides):
        if not line.lstrip().startswith("|"):
            continue
        cells = _cells(line)
        if len(cells) < 2 or set(cells[0]) <= set("-: ") or cells[0].lower() == "english":
            continue
        en_field, vi = _strip_md(cells[0]), _strip_md(cells[1])
        note = _strip_md(cells[2]) if len(cells) > 2 else ""
        if not en_field or not vi:
            continue
        raw = [p.strip() for p in en_field.split(" / ") if p.strip()]
        vis = vi.split(" / ")
        keep = bool(_KEEP_RE.match(vi))
        if keep:
            note = (note + "; " if note else "") + vi
        paired = (not keep) and len(raw) > 1 and len(vis) == len(raw)
        wrong = [] if keep else _wrong_variants(note)
        before = note[:note.find(_NOT)] if _NOT in note else ""
        multi = len(raw) > 1
        entries = []  # (part index, key, vi)
        for i, part in enumerate(raw):
            pv = vis[i] if paired else vi
            for key in _keys(part):
                entries.append((i, key, key if keep else pv))
        if not multi:
            owner_parts = {0}
        else:
            named = {i for i, k, _ in entries if k.lower() in note.lower()}
            if len(named) != 1 and paired:
                named = {i for i in range(len(raw)) if '"%s"' % vis[i] in before}
            owner_parts = named if len(named) == 1 else set()
        for i, key, v in entries:
            if key.lower() in drop:
                continue
            v = ov_vi.get(key.lower(), v)
            row = Row((key, v, note))
            row.multi, row.paired = multi, paired and key.lower() not in ov_vi
            rows.append(row)
            if not wrong:
                continue
            skip = None
            if i not in owner_parts:
                skip = "ambiguous owner"
            elif " / " in v:
                skip = "canonical vi contains ' / '"
            cands.append({"row": len(rows) - 1, "en": key, "vi": v, "wrong": wrong, "skip": skip})
    return rows, cands


def note_conflicts(rows):
    """Notes that claim a different vi for another row's key: ("lymphocyte"=x while that row says y)."""
    vi_of = {r[0].lower(): r[1] for r in rows}
    out = []
    for en, _, note in rows:
        for key, claim in _CLAIM_RE.findall(note):
            actual = vi_of.get(key.strip().lower())
            claim = claim.strip()
            if actual is None or not claim:
                continue
            if claim.lower() in actual.lower() or actual.lower() in claim.lower():
                continue
            item = (en, key.strip(), claim, actual)
            if item not in out:
                out.append(item)
    return out


def single_word_pairs(rows):
    return [(r[0], r[1]) for r in rows if r.paired and len(r[1].split()) == 1]


def finalize(rows, cands, seeds):
    """Dedupe rows (later wins) and select safe term fixes. Returns (rows, fixes, skipped, conflicts)."""
    last = {}
    for i, (en, _, _) in enumerate(rows):
        k = en.lower()
        # a single-term row beats a multi-term part; between rows of the same kind the later one wins
        if k not in last or not rows[i].multi or rows[last[k]].multi:
            last[k] = i
    conflicts = []
    for i, (en, vi, _) in enumerate(rows):
        j = last[en.lower()]
        if j != i and rows[j][1] != vi:
            conflicts.append((en, vi, rows[j][1]))
    keep_idx = sorted(set(last.values()))
    remap = {old: new for new, old in enumerate(keep_idx)}
    out_rows = [rows[i] for i in keep_idx]
    all_vi = "\n".join(r[1].lower() for r in out_rows)
    allow = {w.lower() for w in seeds.get("allow_short", [])}
    deny = {w.lower() for w in seeds.get("deny", [])}
    partial = {w.lower() for w in seeds.get("allow_partial", [])}
    skipped = {}

    def skip(reason, en, wrong):
        skipped.setdefault(reason, []).append((en, wrong))

    seed_fixes = []
    for s in seeds.get("fixes", []):
        ok = []
        for w in s["wrong"]:
            if w.lower() in all_vi:
                skip("wrong variant inside a glossary vi", s["en"], w)
            else:
                ok.append(w)
        if ok and s["en"].lower() not in deny:
            seed_fixes.append(dict(s, wrong=ok))
    seen = {s["en"].lower() for s in seeds.get("fixes", [])}
    fixes = list(seed_fixes)
    for c in cands:
        if c["row"] not in remap:
            skip("row replaced by a later duplicate", c["en"], " | ".join(c["wrong"]))
            continue
        if c["skip"]:
            skip(c["skip"], c["en"], " | ".join(c["wrong"]))
            continue
        if c["en"].lower() in deny:
            skip("denied in seeds", c["en"], " | ".join(c["wrong"]))
            continue
        if c["en"].lower() in seen:
            continue
        fvi = _PAREN_RE.sub("", c["vi"]).strip() or c["vi"]
        ok = []
        for w in c["wrong"]:
            wl = w.lower()
            if wl in c["vi"].lower() or wl in all_vi:
                skip("wrong variant inside a glossary vi", c["en"], w)
            elif len(w.split()) < MIN_SYLLABLES and wl not in allow:
                skip("fewer than %d syllables" % MIN_SYLLABLES, c["en"], w)
            elif 3 * len(w.split()) < 2 * len(fvi.split()) and c["en"].lower() not in partial:
                skip("fragment of canonical", c["en"], w)
            else:
                ok.append(re.escape(w))
        if ok:
            fixes.append({"en": c["en"], "vi": fvi, "wrong": ok})
            seen.add(c["en"].lower())
    return out_rows, fixes, skipped, conflicts


def run(md_path, seeds_path, pack_dir, overrides_path=None):
    if overrides_path is None:
        cand = Path(seeds_path).with_name("pathology_overrides.json")
        overrides_path = cand if cand.exists() else None
    overrides = json.loads(Path(overrides_path).read_text(encoding="utf-8")) if overrides_path else {}
    rows, cands = parse(Path(md_path).read_text(encoding="utf-8"), overrides)
    seeds = json.loads(Path(seeds_path).read_text(encoding="utf-8"))
    rows, fixes, skipped, conflicts = finalize(rows, cands, seeds)
    pack_dir = Path(pack_dir)
    with (pack_dir / "glossary.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["en", "vi", "note"])
        w.writerows(rows)
    (pack_dir / "rules.json").write_text(json.dumps({"term_fixes": fixes}, ensure_ascii=False, indent=1),
                                         encoding="utf-8")
    print("rows", len(rows), "term_fixes", len(fixes))
    for reason in sorted(skipped):
        print("skipped fixes: %s (%d)" % (reason, len(skipped[reason])))
        for en, wrong in skipped[reason]:
            print("   ", ascii(en), ascii(wrong))
    print("conflicts (single-term beats multi-term, else later row kept): %d" % len(conflicts))
    for en, old, new in conflicts:
        print("   ", ascii(en), "|", ascii(old), "->", ascii(new))
    nc = note_conflicts(rows)
    print("note conflicts (no data change): %d" % len(nc))
    for en, key, claim, actual in nc:
        print("   ", ascii(en), "note claims", ascii(key), "=", ascii(claim), "but row says", ascii(actual))
    sw = single_word_pairs(rows)
    print("paired single-word vi (review): %d" % len(sw))
    for en, v in sw:
        print("   ", ascii(en), "=", ascii(v))


if __name__ == "__main__":
    run(*sys.argv[1:5])
