from vitranslate.report import build_report


def row(flags, level=0):
    return {"where": "Slide 1", "src": "a", "out": "b", "level": level, "flags": flags, "cached": False}


def test_info_flags_are_counted_not_flagged():
    rows = [row(["kept_code"]), row(["kept_english"]), row(["retried:tags", "term_fix:biopsy"]),
            row(["retried:english"]), row(["glossary_miss:biopsy"]),
            row(["retried:gate", "suspect_output:angle"]), row(["english_left"]), row([], level=3)]
    rep = build_report({}, rows, [], [], [])
    assert rep["counts"]["flagged"] == 3
    assert [r["flags"] for r in rep["flagged"]] == [["retried:gate", "suspect_output:angle"], ["english_left"], []]
    assert rep["info"] == {"kept_code": 1, "kept_english": 1, "retried": 3, "term_fix": 1, "glossary_miss": 1}


def test_info_kinds_match_exactly():
    rep = build_report({}, [row(["kept_codex"]), row(["retried"]), row(["term_fixed:x"])], [], [], [])
    assert rep["counts"]["flagged"] == 2 and rep["info"] == {"retried": 1}


def test_a_rejected_editor_line_is_information():
    rep = build_report({}, [row(["polish_rejected:numbers"])], [], [], [])
    assert rep["counts"]["flagged"] == 0 and rep["info"] == {"polish_rejected": 1}


def test_kept_reference_is_information():
    rep = build_report({}, [row(["kept_reference"])], [], [], [])
    assert rep["counts"]["flagged"] == 0 and rep["info"] == {"kept_reference": 1}


def meta(fast=False, packs=True, polish=True):
    return {"fast": fast, "packs": [{"id": "pathology", "name": "GPB", "score": 0.3}] if packs else [],
            "polish": {"enabled": polish}}


def rows_with(flagged, total=100, flag="numbers_changed"):
    return [row([flag]) for _ in range(flagged)] + [row([]) for _ in range(total - flagged)]


def test_review_level_moderate_when_everything_is_in_place():
    from vitranslate.report import review_level
    rep = build_report(meta(), rows_with(3), [], [], [])
    assert rep["review"] == {"level": "moderate", "reasons": [], "flagged": 3, "segments": 100}
    assert review_level(rep) == rep["review"]


def test_review_level_thorough_for_the_fast_draft_many_flags_or_a_warning_flag():
    for m, rows, reason in ((meta(fast=True), rows_with(0), "fast_draft"),
                            (meta(), rows_with(16), "flagged_over_15"),
                            (meta(), rows_with(1, flag="english_left"), "warning_flags"),
                            (meta(), rows_with(1, flag="omitted:a clause"), "warning_flags"),
                            (meta(), rows_with(1, flag="tags_broken"), "warning_flags"),
                            (meta(), rows_with(1, flag="acronym_lost:WHO"), "warning_flags"),
                            (meta(), rows_with(1, flag="suspect_output:ratio"), "warning_flags")):
        review = build_report(m, rows, [], [], [])["review"]
        assert review["level"] == "thorough" and reason in review["reasons"], (m, reason)


def test_review_level_careful_without_a_pack_without_read_back_or_over_5_percent():
    for m, rows, reason in ((meta(packs=False), rows_with(0), "no_pack"),
                            (meta(polish=False), rows_with(0), "polish_off"),
                            (meta(), rows_with(6), "flagged_over_5")):
        review = build_report(m, rows, [], [], [])["review"]
        assert review["level"] == "careful" and review["reasons"] == [reason], (m, reason)
    # exactly 5 % / 15 % are not over the line
    assert build_report(meta(), rows_with(5), [], [], [])["review"]["level"] == "moderate"
    assert build_report(meta(), rows_with(15), [], [], [])["review"]["level"] == "careful"
    # an empty document: nothing flagged, no division by zero
    assert build_report(meta(), [], [], [], [])["review"]["level"] == "moderate"
    # several reasons are all listed, the thorough ones first
    both = build_report(meta(fast=True, packs=False), rows_with(0), [], [], [])["review"]
    assert both["level"] == "thorough" and both["reasons"] == ["fast_draft", "no_pack"]
