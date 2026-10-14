import json
import re
import sys

from vitranslate.config import REPO_ROOT

sys.path.insert(0, str(REPO_ROOT / "tools"))
import import_glossary  # noqa: E402

MD = """# Glossary

| English | Tieng Viet | Ghi chu |
|---------|-----------|---------|
| anaplasia / anaplastic | tho\u00e1i s\u1ea3n | KH\u00d4NG d\u1ecbch "b\u1ea5t s\u1ea3n" hay "ngh\u1ecbch s\u1ea3n" |
| fine needle aspiration (FNA) | ch\u1ecdc h\u00fat (FNA) | |
| squamous cell carcinoma | ung th\u01b0 bi\u1ec3u m\u00f4 t\u1ebf b\u00e0o gai | "gai" KH\u00d4NG "v\u1ea3y" |
| intranodal thyroid inclusions (ITIs) | m\u00f4 tuy\u1ebfn gi\u00e1p v\u00f9i trong h\u1ea1ch | KH\u00d4NG "th\u1ec3 v\u00f9i tuy\u1ebfn gi\u00e1p" |
| positive / negative (staining) | d\u01b0\u01a1ng t\u00ednh / \u00e2m t\u00ednh | |
"""

EMPTY_SEEDS = {"fixes": [], "allow_short": [], "deny": []}


def _build(md, seeds=None, overrides=None):
    rows, cands = import_glossary.parse(md, overrides)
    return import_glossary.finalize(rows, cands, seeds or EMPTY_SEEDS)


def test_rows_pairing_and_qualifiers():
    rows, _, _, _ = _build(MD)
    d = {r[0]: r[1] for r in rows}
    assert d["anaplasia"] == d["anaplastic"] == "tho\u00e1i s\u1ea3n"  # part counts differ: full cell
    assert d["negative (staining)"] == "\u00e2m t\u00ednh" and d["positive"] == "d\u01b0\u01a1ng t\u00ednh"  # paired by position
    assert "fine needle aspiration" in d and "intranodal thyroid inclusions" in d


def test_pairing_needs_equal_counts_and_overrides_win():
    md = ("| a / b / c | m\u1ed9t / hai | |\n"
          "| membranous / nuclear staining | nhu\u1ed9m m\u00e0ng / nh\u00e2n | |\n")
    ov = {"vi": {"nuclear staining": "nhu\u1ed9m nh\u00e2n"}, "drop": ["c"]}
    rows, _, _, _ = _build(md, overrides=ov)
    d = {r[0]: r[1] for r in rows}
    assert d["a"] == d["b"] == "m\u1ed9t / hai" and "c" not in d
    assert d["membranous"] == "nhu\u1ed9m m\u00e0ng" and d["nuclear staining"] == "nhu\u1ed9m nh\u00e2n"
    assert import_glossary.single_word_pairs(rows) == []  # the override row is no longer a pairing result
    rows, _ = import_glossary.parse(md)
    assert import_glossary.single_word_pairs(rows) == [("nuclear staining", "nh\u00e2n")]


def test_abbr_expansion_rows_key_on_both():
    md = "| HPF (high power field) | vi tr\u01b0\u1eddng (HPF) | gi\u1eef vi\u1ebft t\u1eaft |\n| positive (staining) | d\u01b0\u01a1ng | |\n"
    rows, _, _, _ = _build(md)
    d = {r[0]: r[1] for r in rows}
    assert d["HPF"] == d["high power field"] == "vi tr\u01b0\u1eddng (HPF)"
    assert "positive (staining)" in d  # context qualifier stays in the key


def test_fixes_conservative_rules():
    _, fixes, skipped, _ = _build(MD)
    by = {f["en"]: f for f in fixes}
    # stripped English part is used (regression: ITIs suffix) and the 3-syllable variant survives
    assert by["intranodal thyroid inclusions"]["wrong"] == ["th\u1ec3\\ v\u00f9i\\ tuy\u1ebfn\\ gi\u00e1p"]
    # 2-syllable variants are skipped; ambiguous owners are skipped
    assert "anaplasia" not in by and "squamous cell carcinoma" not in by
    reasons = " ".join(skipped)
    assert "syllables" in reasons and "ambiguous owner" in reasons


def test_wrong_clause_boundaries_and_alternatives():
    md = ("| a | x | KH\u00d4NG \"m\u1ed9t hai ba\" / \"b\u1ed1n n\u0103m s\u00e1u\"; c\u00f2n \"b\u1ea3y t\u00e1m ch\u00edn\" |\n"
          "| b | y | kh\u00f4ng \"m\u1ed9t hai ba\" |\n"
          "| c | z | KH\u00d4NG \"m\u01b0\u1eddi m\u1ed9t m\u01b0\u1eddi\" (\"hai m\u01b0\u1eddi hai\") |\n")
    rows, cands = import_glossary.parse(md)
    got = {c["en"]: c["wrong"] for c in cands}
    assert got == {"a": ["m\u1ed9t hai ba", "b\u1ed1n n\u0103m s\u00e1u"], "c": ["m\u01b0\u1eddi m\u1ed9t m\u01b0\u1eddi"]}


def test_wrong_inside_any_glossary_vi_is_skipped():
    md = ("| a | alpha beta gamma | KH\u00d4NG \"delta epsilon zeta\" |\n"
          "| b | delta epsilon zeta eta | |\n")
    _, fixes, skipped, _ = _build(md)
    assert fixes == [] and "wrong variant inside a glossary vi" in skipped


def test_conflicts_later_row_wins():
    md = "| foo | c\u0169 | |\n| foo | m\u1edbi | |\n"
    rows, _, _, conflicts = _build(md)
    assert rows == [("foo", "m\u1edbi", "")]
    assert conflicts == [("foo", "c\u0169", "m\u1edbi")]


def test_keep_english_rows():
    md = ("| IDH-mutant / IDH-wildtype | gi\u1eef nguy\u00ean IDH-mutant / IDH-wildtype | t\u00ean gen, kh\u00f4ng d\u1ecbch |\n"
          "| HGBCL / DLBCL | Gi\u1eef nguy\u00ean | vi\u1ebft t\u1eaft, KH\u00d4NG \"x\u00f3a \u0111o\u1ea1n \u0111\u00f3\" |\n"
          "| Bethesda codes (NILM/ASC-US) | gi\u1eef ti\u1ebfng Anh | |\n"
          "| foo | Kh\u00f4ng d\u1ecbch | |\n")
    rows, fixes, _, _ = _build(md)
    d = {r[0]: r for r in rows}
    assert d["IDH-mutant"][1] == "IDH-mutant" and d["IDH-wildtype"][1] == "IDH-wildtype"
    assert d["HGBCL"][1] == "HGBCL" and d["DLBCL"][1] == "DLBCL"
    assert d["Bethesda codes"][1] == "Bethesda codes" and d["foo"][1] == "foo"
    assert "gi\u1eef nguy\u00ean" in d["HGBCL"][2].lower()
    assert fixes == []


def test_seeds_first_checked_against_glossary_and_deny(tmp_path):
    src = tmp_path / "g.md"
    src.write_text(MD, encoding="utf-8")
    seeds = tmp_path / "seeds.json"
    seeds.write_text(json.dumps({"allow_short": [], "deny": ["intranodal thyroid inclusions"], "fixes": [
        {"en": "lung", "vi": "ph\u1ed5i", "wrong": ["pulm\u00f4n", "tho\u00e1i s\u1ea3n"]}]}), encoding="utf-8")
    out = tmp_path / "pack"
    out.mkdir()
    import_glossary.run(src, seeds, out)
    csv_text = (out / "glossary.csv").read_text(encoding="utf-8")
    assert csv_text.splitlines()[0] == "en,vi,note"
    rules = json.loads((out / "rules.json").read_text(encoding="utf-8"))
    assert [f["en"] for f in rules["term_fixes"]] == ["lung"]  # generated fix denied
    assert rules["term_fixes"][0]["wrong"] == ["pulm\u00f4n"]  # "thoai san" is a glossary vi -> dropped


def test_single_term_row_beats_multi_term_part():
    md = ("| hyperplasia | t\u0103ng s\u1ea3n | |\n"
          "| proliferation / hyperplasia | t\u0103ng sinh / t\u0103ng s\u1ea3n nguy\u00ean b\u00e0o nu\u00f4i | |\n"
          "| bar / baz | m\u1ed9t / hai | |\n"
          "| baz | ba | |\n"
          "| baz | b\u1ed1n | |\n")
    rows, _, _, conflicts = _build(md)
    d = {r[0]: r[1] for r in rows}
    assert d["hyperplasia"] == "t\u0103ng s\u1ea3n"
    assert d["baz"] == "b\u1ed1n"  # same kind: later wins
    assert d["proliferation"] == "t\u0103ng sinh"
    assert ("hyperplasia", "t\u0103ng s\u1ea3n nguy\u00ean b\u00e0o nu\u00f4i", "t\u0103ng s\u1ea3n") in conflicts


def test_fragment_wrong_forms_are_skipped_and_vi_is_trimmed():
    md = ("| sbrct | u t\u1ebf b\u00e0o tr\u00f2n nh\u1ecf (m\u00e0u xanh) | KH\u00d4NG \"xanh tr\u00f2n nh\u1ecf\" |\n"
          "| intranodal | m\u00f4 tuy\u1ebfn gi\u00e1p v\u00f9i trong h\u1ea1ch | KH\u00d4NG \"th\u1ec3 v\u00f9i tuy\u1ebfn gi\u00e1p\" |\n"
          "| fna | ch\u1ecdc h\u00fat t\u1ebf b\u00e0o b\u1eb1ng kim nh\u1ecf (FNA) | KH\u00d4NG \"ch\u1ecdc h\u00fat t\u1ebf b\u00e0o kim nh\u1ecf\" |\n")
    _, fixes, skipped, _ = _build(md)
    assert [f["en"] for f in fixes] == ["intranodal", "fna"]
    assert fixes[1]["vi"] == "ch\u1ecdc h\u00fat t\u1ebf b\u00e0o b\u1eb1ng kim nh\u1ecf"  # trailing parenthetical dropped
    assert "fragment of canonical" in " ".join(skipped)


def test_note_conflicts_reported():
    md = ("| lymphoma | lymph\u00f4m | Nh\u01b0ng \"lymphocyte\"=t\u1ebf b\u00e0o lympho, gi\u1eef |\n"
          "| lymphocyte | lympho b\u00e0o | |\n"
          "| disorder | r\u1ed1i lo\u1ea1n | |\n"
          "| x | y | disorder=r\u1ed1i lo\u1ea1n |\n")
    rows, _ = import_glossary.parse(md)
    got = import_glossary.note_conflicts(rows)
    assert got == [("lymphoma", "lymphocyte", "t\u1ebf b\u00e0o lympho", "lympho b\u00e0o")]


def test_allow_partial_exempts_fragment_rule_only():
    md = '| fna | ch\u1ecdc h\u00fat t\u1ebf b\u00e0o b\u1eb1ng kim nh\u1ecf (FNA) | KH\u00d4NG "ch\u1ecdc h\u00fat kim nh\u1ecf" |\n'
    seeds = dict(EMPTY_SEEDS, allow_partial=["FNA"])
    _, fixes, _, _ = _build(md, seeds)
    assert [f["en"] for f in fixes] == ["fna"] and fixes[0]["vi"] == "ch\u1ecdc h\u00fat t\u1ebf b\u00e0o b\u1eb1ng kim nh\u1ecf"
    seeds = dict(EMPTY_SEEDS, allow_partial=["fna"])
    md2 = '| fna | ch\u1ecdc h\u00fat t\u1ebf b\u00e0o b\u1eb1ng kim nh\u1ecf (FNA) | KH\u00d4NG "kim nh\u1ecf" |\n'
    assert _build(md2, seeds)[1] == []  # still needs >= 3 syllables


def test_override_add_rows_join_the_glossary_like_markdown_rows():
    ov = {"add": [{"en": "macroscopic", "vi": "\u0111\u1ea1i th\u1ec3", "note": 'KH\u00d4NG "v\u0129 m\u00f4 \u0111\u1ea1i quan"'},
                  {"en": "exon", "vi": "gi\u1eef nguy\u00ean", "note": ""},
                  {"en": "anaplasia", "vi": "tho\u00e1i s\u1ea3n r\u00f5", "note": ""}]}
    rows, fixes, _, conflicts = _build(MD, overrides=ov)
    d = {r[0]: r[1] for r in rows}
    assert d["macroscopic"] == "\u0111\u1ea1i th\u1ec3" and d["exon"] == "exon"
    assert d["anaplasia"] == "tho\u00e1i s\u1ea3n r\u00f5"  # an added row comes last and wins, reported as a conflict
    assert ("anaplasia", "tho\u00e1i s\u1ea3n", "tho\u00e1i s\u1ea3n r\u00f5") in conflicts
    by = {f["en"]: f for f in fixes}
    assert by["macroscopic"]["wrong"] == ["v\u0129\ m\u00f4\ \u0111\u1ea1i\ quan"]
