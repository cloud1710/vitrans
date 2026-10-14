from vitranslate.config import REPO_ROOT
from vitranslate.packs import EMPTY_PACK, Pack, TermFix, glossary_hits, load_pack, merge_packs
from vitranslate.qa import apply_term_fixes

PACKS = REPO_ROOT / "packs"
LOBULAR = "ti\u1ec3u th\u00f9y"
BIOPSY = "sinh thi\u1ebft"


def packs_dir():
    return PACKS


def test_load_real_packs():
    style = load_pack(packs_dir(), "_style")
    assert "\u0110\u1ecbnh ng\u1eef" in style.prompt
    path = load_pack(packs_dir(), "pathology")
    assert path.key() == "pathology@0.1.8"
    assert len(path.glossary) > 400
    assert any(f.en == "meningioma" for f in path.term_fixes)
    assert len(path.tests) >= 8 and all("must" in t for t in path.tests)
    same = load_pack(PACKS / "pathology")  # a pack directory path (as unpacked from the registry)
    assert same.key() == path.key() and same.glossary == path.glossary
    assert not (PACKS / "_general").exists()  # the base carries no glossary: EMPTY_PACK replaces _general


def test_pathology_puts_neocortical_before_diffuse():
    # Lewy body disease stage (user 2026-10-14): Vietnamese puts the adjective after the noun
    path = load_pack(packs_dir(), "pathology")
    assert ("diffuse neocortical", "v\u1ecf n\u00e3o m\u1edbi lan t\u1ecfa") in [g[:2] for g in path.glossary]
    wrong = "Lan t\u1ecfa v\u1ecf n\u00e3o m\u1edbi (n\u0103m v\u00f9ng)"  # the model's answer in the 0.1.4 run
    fixed, applied = apply_term_fixes(wrong, "Diffuse neocortical (five areas)", path.term_fixes)
    assert (fixed, applied) == ("V\u1ecf n\u00e3o m\u1edbi lan t\u1ecfa (n\u0103m v\u00f9ng)", ["diffuse neocortical"])


def test_pathology_atypical_is_khong_dien_hinh():
    # "atypical" is "not typical", never "abnormal" (bat thuong): the editor pass changed it when no row said so
    rows = [g[:2] for g in load_pack(packs_dir(), "pathology").glossary]
    assert ("atypical", "kh\u00f4ng \u0111i\u1ec3n h\u00ecnh") in rows
    assert ("atypical features", "\u0111\u1eb7c \u0111i\u1ec3m kh\u00f4ng \u0111i\u1ec3n h\u00ecnh") in rows
    hits = glossary_hits("The nuclei show atypical features.", load_pack(packs_dir(), "pathology").glossary)
    assert ("atypical features", "\u0111\u1eb7c \u0111i\u1ec3m kh\u00f4ng \u0111i\u1ec3n h\u00ecnh") in hits


XAM_NHAP = "x\u00e2m nh\u1eadp"
XAM_LAN = "x\u00e2m l\u1ea5n"
LYMPHATIC = " m\u1ea1ch b\u1ea1ch huy\u1ebft"
PERINEURAL = " quanh th\u1ea7n kinh"
MARGIN = "di\u1ec7n c\u1eaft"
NEGATIVE = "\u00e2m t\u00ednh"
POSITIVE = "d\u01b0\u01a1ng t\u00ednh"


def test_decision_6_lvi_pni_are_xam_nhap():
    # roadmap decision 6 (user 2026-10-14): LVI / PNI = "xam nhap"; vascular / capsular invasion stay "xam lan"
    path = load_pack(packs_dir(), "pathology")
    g = {en: vi for en, vi, _ in path.glossary}
    assert g["lymphovascular invasion"] == XAM_NHAP + LYMPHATIC
    assert g["perineural invasion"] == XAM_NHAP + PERINEURAL
    assert g["vascular invasion"] == XAM_LAN + " m\u1ea1ch m\u00e1u"
    assert g["capsular invasion"] == XAM_LAN + " v\u1ecf bao"
    src = "No lymphovascular invasion or perineural invasion was found."
    wrong = "Kh\u00f4ng th\u1ea5y " + XAM_LAN + LYMPHATIC + " hay " + XAM_LAN + PERINEURAL + "."
    fixed, applied = apply_term_fixes(wrong, src, path.term_fixes)
    assert fixed == "Kh\u00f4ng th\u1ea5y " + XAM_NHAP + LYMPHATIC + " hay " + XAM_NHAP + PERINEURAL + "."
    assert sorted(applied) == ["lymphovascular invasion", "perineural invasion"]
    # source-gated: only the LVI phrase is rewritten, "xam lan vo bao" (capsular invasion) stays
    other = XAM_LAN + " v\u1ecf bao, " + XAM_LAN + LYMPHATIC
    out, _ = apply_term_fixes(other, "capsular invasion, lymphovascular invasion", path.term_fixes)
    assert out == XAM_LAN + " v\u1ecf bao, " + XAM_NHAP + LYMPHATIC


def test_bare_invasion_never_shadows_compounds():
    # decision 6: bare "invasion" = "xam lan" (macroscopic / stage / imaging / surgery). Every compound still gets its
    # own row in the glossary hits, the bare key has no term fix, and the term-lock turns the bare value written into
    # LVI / PNI back to "xam nhap"
    path = load_pack(packs_dir(), "pathology")
    g = {en: vi for en, vi, _ in path.glossary}
    assert g["invasion"] == XAM_LAN
    assert not any(f.en.lower() == "invasion" for f in path.term_fixes)
    doi = ("depth of invasion", "\u0111\u1ed9 s\u00e2u " + XAM_LAN + " (DOI)", "")  # head-neck draft row, copied here
    glossary = path.glossary + [doi]
    want = {"lymphovascular invasion": XAM_NHAP + LYMPHATIC, "perineural invasion": XAM_NHAP + PERINEURAL,
            "vascular invasion": XAM_LAN + " m\u1ea1ch m\u00e1u", "capsular invasion": XAM_LAN + " v\u1ecf bao",
            "depth of invasion": doi[1]}
    for en, vi in want.items():
        hits = dict(glossary_hits("The resection shows %s at one site." % en, glossary))
        assert hits[en] == vi and hits["invasion"] == XAM_LAN, en
    bare_value = {"lymphovascular invasion": XAM_LAN + LYMPHATIC, "perineural invasion": XAM_LAN + PERINEURAL}
    for en, wrong in bare_value.items():
        out, applied = apply_term_fixes("C\u00f3 " + wrong + ".", "There is %s." % en, path.term_fixes)
        assert (out, applied) == ("C\u00f3 " + want[en] + ".", [en])
    for en in ("vascular invasion", "capsular invasion", "depth of invasion"):
        assert XAM_LAN in want[en]  # the bare value agrees with these compounds
    # the bare key never matches inside another word
    hits = dict(glossary_hits("Pseudoinvasion, microinvasion and an invasive carcinoma.", glossary))
    assert "invasion" not in hits


def test_margin_compound_keys_and_report_order():
    # bare "margin" is ambiguous (packs/_shared/owners.csv): compound keys only; the report-style inverted phrases
    # ("Margins negative") have keys of their own because the matcher keeps the word order
    path = load_pack(packs_dir(), "pathology")
    g = {en: vi for en, vi, _ in path.glossary}
    assert "margin" not in g and "margins" not in g
    assert g["surgical margin"] == MARGIN  # the attested form (breast pack count 4), not "dien cat phau thuat"
    assert g["margin status"] == "t\u00ecnh tr\u1ea1ng " + MARGIN
    assert g["close margin"] == MARGIN + " s\u00e1t u"
    for en in ("negative margin", "margins negative", "margins are negative", "margins free"):
        assert g[en] == MARGIN + " " + NEGATIVE, en
    for en in ("positive margin", "margins positive", "margins are positive", "margins involved"):
        assert g[en] == MARGIN + " " + POSITIVE, en
    cases = {"Margins negative for carcinoma.": "margins negative", "All margins are negative.": "margins are negative",
             "Margins free of tumour.": "margins free", "Margins involved by carcinoma.": "margins involved",
             "Negative margins were obtained.": "negative margin"}
    for src, en in cases.items():
        assert (en, g[en]) in glossary_hits(src, path.glossary), src
    fixed, applied = apply_term_fixes("R\u00eca " + NEGATIVE + ".", "Margins negative.", path.term_fixes)
    assert (fixed, applied) == ("D" + MARGIN[1:] + " " + NEGATIVE + ".", ["margins negative"])


def pk(pid, glossary=(), fixes=(), prompt="", tests=(), version="1.0.0"):
    return Pack(pid, version, pid.title(), [], prompt, list(glossary), list(fixes), list(tests))


def test_merge_packs_first_wins():
    breast = pk("breast", [("HER2", "HER2", ""), ("Lobular", LOBULAR, "")],
                [TermFix("lobular", LOBULAR, ["th\u00f9y nh\u1ecf"])], "Breast rules.", [{"src": "b"}])
    path = pk("pathology", [("lobular", "d\u1ea1ng " + LOBULAR, ""), ("biopsy", BIOPSY, "")],
              [TermFix("lobular", "x", []), TermFix("biopsy", BIOPSY, ["sinh thi\u1ec7t"])],
              "Pathology rules.", [{"src": "p"}], version="0.1.0")
    m = merge_packs([breast, path])
    assert m.key() == "breast@1.0.0+pathology@0.1.0" and m.name == "Breast, Pathology"
    assert m.id == "breast+pathology"
    assert m.prompt == "Breast rules.\n\nPathology rules."
    assert [g[:2] for g in m.glossary] == [("HER2", "HER2"), ("Lobular", LOBULAR), ("biopsy", BIOPSY)]
    assert [(f.en, f.vi) for f in m.term_fixes] == [("lobular", LOBULAR), ("biopsy", BIOPSY)]
    assert m.tests == [{"src": "b"}, {"src": "p"}]
    one = merge_packs([path])
    assert one.key() == "pathology@0.1.0" and one.id == "pathology" and one.glossary == path.glossary
    assert merge_packs([]) is None


def test_style_pack_is_domain_neutral_and_pathology_keeps_the_medical_rules():
    style = load_pack(packs_dir(), "_style").prompt.lower()
    medical = ("b\u1ec7nh", "y khoa", "tnm", "marker", "gi\u1ea3i ph\u1eabu", "bs ts", "nhu\u1ed9m", "di c\u0103n",
               "kh\u00e1ng th\u1ec3", "tert")
    assert [w for w in medical if w in style] == []
    for rule in ("\u0111\u01b0\u1ee3c/b\u1ecb", "m\u1ed9t / c\u1ee7a / s\u1ef1 / vi\u1ec7c", "d\u1ea5u ph\u1ea9y",
                 "vi\u1ebft hoa", "it is / there is", "c\u1ee5m danh t\u1eeb", "c\u00e1c/nh\u1eefng", "normal functioning"):
        assert rule in style, rule
    path = load_pack(packs_dir(), "pathology").prompt.lower()
    for rule in ("b\u1ec7nh nh\u00e2n nam", "tnm", "bs ts", "y khoa", "tert"):
        assert rule in path, rule


def test_merge_term_fixes_case_insensitive_and_glossary_owned():
    breast = pk("breast", [("HER2", "HER2", "")], [TermFix("Lobular", LOBULAR, ["th\u00f9y nh\u1ecf"])])
    path = pk("pathology", [("biopsy", BIOPSY, "")],
              [TermFix("lobular", "x", []), TermFix("her2", "y", ["z"]), TermFix("biopsy", BIOPSY, ["sinh thi\u1ec7t"])])
    m = merge_packs([breast, path])
    # "lobular": same English, other case -> first wins; "her2": owned by the breast glossary -> pathology fix dropped
    assert [(f.en, f.vi) for f in m.term_fixes] == [("Lobular", LOBULAR), ("biopsy", BIOPSY)]


def test_empty_pack():
    assert EMPTY_PACK.id == "_none" and EMPTY_PACK.name == "Chung"
    assert not (EMPTY_PACK.prompt or EMPTY_PACK.glossary or EMPTY_PACK.term_fixes or EMPTY_PACK.tests)
    assert (merge_packs([]) or EMPTY_PACK) is EMPTY_PACK


def test_glossary_hits_orders_by_frequency_and_respects_boundaries():
    glossary = [("lung", "ph\u1ed5i", ""), ("biopsy", "sinh thi\u1ebft", ""), ("node", "n\u00fat", "")]
    text = "Lung biopsy. Lung nodule. Lymph-node."
    assert glossary_hits(text, glossary) == [("lung", "ph\u1ed5i"), ("biopsy", "sinh thi\u1ebft")]


def test_glossary_hits_see_variants_and_irregular_plurals():
    glossary = [("Lewy body", "th\u1ec3 Lewy", ""), ("neuropathology", "gi\u1ea3i ph\u1eabu b\u1ec7nh th\u1ea7n kinh", ""),
                ("tumor", "u", ""), ("node", "n\u00fat", "")]
    text = "Dementia with Lewy bodies. Neuropathologic diagnosis of tumours. Lymph-node."
    assert glossary_hits(text, glossary) == [("neuropathology", "gi\u1ea3i ph\u1eabu b\u1ec7nh th\u1ea7n kinh"),
                                              ("Lewy body", "th\u1ec3 Lewy"), ("tumor", "u")]


def test_pathology_tests_have_must_any_and_new_expectations():
    path = load_pack(packs_dir(), "pathology")
    assert any(t.get("must_any") for t in path.tests)
    assert "b\u1ec7nh nh\u00e2n nam" in path.tests[3]["must"] and "m\u00f4 h\u1ecdc" in path.tests[4]["must_not"]


def test_invalid_wrong_pattern_raises(tmp_path):
    import json
    import pytest
    d = tmp_path / "bad"
    d.mkdir()
    (d / "pack.json").write_text(json.dumps({"id": "bad", "version": "1"}), encoding="utf-8")
    (d / "rules.json").write_text(json.dumps({"term_fixes": [{"en": "x", "vi": "y", "wrong": ["(oops"]}]}),
                                  encoding="utf-8")
    with pytest.raises(ValueError, match="bad.*oops"):
        load_pack(tmp_path, "bad")


def test_real_pack_fixes_never_touch_glossary_vi_and_are_idempotent():
    from vitranslate.qa import apply_term_fixes
    path = load_pack(packs_dir(), "pathology")
    bad = []
    for en, vi, _ in path.glossary:
        out, _ = apply_term_fixes(vi, en, path.term_fixes)
        if out != vi:
            bad.append((en, vi, out))
    assert not bad, bad[:5]
    for fx in path.term_fixes:
        out, _ = apply_term_fixes(fx.vi, fx.en, path.term_fixes)
        assert out == fx.vi, (fx.en, fx.vi, out)


def test_real_pack_fixes_in_a_sentence():
    import re
    from vitranslate.qa import apply_term_fixes
    path = load_pack(packs_dir(), "pathology")
    vi_of = {en.lower(): vi for en, vi, _ in path.glossary}
    bad = []
    for fx in path.term_fixes:
        abbr = re.search(r"\(([^)]*)\)\s*$", vi_of.get(fx.en.lower(), ""))
        for pat in fx.wrong:
            wrong = re.sub(r"\\(.)", r"\1", pat)  # generated patterns are re.escape'd literals
            sents = ["Trong m\u1eabu n\u00e0y, %s \u0111\u01b0\u1ee3c ghi nh\u1eadn." % wrong]
            if abbr:
                sents.append("Trong m\u1eabu n\u00e0y, %s (%s) \u0111\u01b0\u1ee3c ghi nh\u1eadn." % (wrong, abbr.group(1)))
            for s in sents:
                out, _ = apply_term_fixes(s, fx.en, path.term_fixes)
                ok = out.count(fx.vi) == 1 and wrong not in out
                if abbr and "(" in s:
                    ok = ok and out.count("(%s)" % abbr.group(1)) == 1
                if not ok:
                    bad.append((fx.en, s, out))
    assert not bad, bad[:5]


DAI_THE, VI_THE = "\u0111\u1ea1i th\u1ec3", "vi th\u1ec3"


def test_pathology_core_vocabulary_and_user_decisions_2026_10_14():
    path = load_pack(packs_dir(), "pathology")
    g = {en.lower(): vi for en, vi, _ in path.glossary}
    assert g["histologic patterns"] == "h\u00ecnh th\u00e1i m\u00f4 b\u1ec7nh h\u1ecdc"
    assert g["macroscopic"] == g["gross"] == DAI_THE and g["microscopic"] == VI_THE
    assert g["macroscopic appearance"] == "h\u00ecnh \u1ea3nh " + DAI_THE
    assert g["microscopic appearance"] == "h\u00ecnh \u1ea3nh " + VI_THE
    assert g["lymph node dissection"] == "n\u1ea1o v\u00e9t h\u1ea1ch"
    assert g["case illustration"] == "minh h\u1ecda ca b\u1ec7nh"
    assert g["tumor"] == "u" and g["rearranged"] == "t\u00e1i s\u1eafp x\u1ebfp"
    assert g["gene fusion"] == "dung h\u1ee3p gen"  # the event; "gen dung hop" is the fusion gene


def test_pathology_narrow_term_fixes():
    from vitranslate.qa import apply_term_fixes
    path = load_pack(packs_dir(), "pathology")
    cases = [("Malignant transformation occurred.", "Chuy\u1ec3n h\u00f3a \u00e1c t\u00ednh x\u1ea3y ra.",
              "Chuy\u1ec3n d\u1ea1ng \u00e1c t\u00ednh x\u1ea3y ra."),
             ("Squamous cell carcinoma.", "Carcinom t\u1ebf b\u00e0o gai.", "Carcin\u00f4m t\u1ebf b\u00e0o gai."),
             ("Many plasma cells.", "Nhi\u1ec1u t\u1ebf b\u00e0o huy\u1ebft t\u01b0\u01a1ng.",
              "Nhi\u1ec1u t\u01b0\u01a1ng b\u00e0o.")]
    for src, out, want in cases:
        assert apply_term_fixes(out, src, path.term_fixes)[0] == want
    similar = "C\u00e1c t\u1ebf b\u00e0o t\u01b0\u01a1ng t\u1ef1 t\u01b0\u01a1ng b\u00e0o."  # "similar cells"
    assert apply_term_fixes(similar, "plasma cells", path.term_fixes)[0] == similar


def test_leukemia_is_benh_bach_cau_never_lo_xe_mi():  # user decision 2026-10-14 (Southern forms first)
    from vitranslate.qa import apply_term_fixes
    path = load_pack(packs_dir(), "pathology")
    g = {en.lower(): vi for en, vi, _ in path.glossary}
    assert g["hairy cell leukemia"] == "b\u1ec7nh b\u1ea1ch c\u1ea7u t\u1ebf b\u00e0o t\u00f3c (HCL)"
    assert g["aggressive nk-cell leukemia"].startswith("b\u1ec7nh b\u1ea1ch c\u1ea7u t\u1ebf b\u00e0o NK")
    for wrong in ("L\u01a1 x\u00ea mi t\u1ebf b\u00e0o t\u00f3c.", "L\u01a1-x\u00ea-mi t\u1ebf b\u00e0o t\u00f3c."):
        out, _ = apply_term_fixes(wrong, "Hairy cell leukaemia.", path.term_fixes)
        assert out == "B\u1ec7nh b\u1ea1ch c\u1ea7u t\u1ebf b\u00e0o t\u00f3c."


def test_user_confirmed_partial_fixes_present():
    path = load_pack(packs_dir(), "pathology")
    by = {f.en: f for f in path.term_fixes}
    assert "fine needle aspiration" in by and "targeted therapy" in by
