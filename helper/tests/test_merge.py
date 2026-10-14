"""merge_packs conflict rules for term fixes (K7): a fix is dropped only when an earlier pack really disagrees."""
from vitranslate.packs import Pack, TermFix, merge_packs

FNA_ROW = ("fine needle aspiration", "choc hut te bao bang kim nho (FNA)", "")
FNA_FIX = TermFix("fine needle aspiration", "choc hut te bao bang kim nho", ["choc hut kim nho"])


def pk(pid, glossary=(), fixes=()):
    return Pack(pid, "1.0.0", pid.title(), [], "", list(glossary), list(fixes), [])


def fixes_of(m):
    return [(f.en, f.vi, f.wrong) for f in m.term_fixes]


def test_fix_kept_when_the_earlier_glossary_has_the_same_value():
    # child repeats the parent row (with its abbreviation): the parent fix must survive the child-first merge
    child = pk("child", [FNA_ROW])
    parent = pk("parent", [FNA_ROW], [FNA_FIX])
    assert fixes_of(merge_packs([child, parent])) == [
        ("fine needle aspiration", "choc hut te bao bang kim nho", ["choc hut kim nho"])]


def test_same_value_ignores_case_and_spacing():
    child = pk("child", [("Lymphovascular Invasion", "Xam  lan mach bach huyet", "")])
    parent = pk("parent", [], [TermFix("lymphovascular invasion", "xam lan mach bach huyet", ["viem mach"])])
    assert [f.en for f in merge_packs([child, parent]).term_fixes] == ["lymphovascular invasion"]


def test_fix_dropped_when_the_earlier_glossary_disagrees():
    # the child overrides the parent value: the parent fix would rewrite the child's term, so it goes
    child = pk("child", [("cribriform", "mat sang", "")])
    parent = pk("parent", [("cribriform", "dang sang", "")], [TermFix("cribriform", "dang sang", ["mat sang"])])
    assert merge_packs([child, parent]).term_fixes == []


def test_two_fixes_with_the_same_value_merge_their_wrong_forms():
    a = TermFix("lymphovascular invasion", "xam lan mach bach huyet", ["viem mach bach huyet"])
    b = TermFix("Lymphovascular invasion", "xam lan mach bach huyet", ["viem mach bach huyet", "xam nhap mach"])
    m = merge_packs([pk("child", [], [a]), pk("parent", [], [b])])
    assert fixes_of(m) == [("lymphovascular invasion", "xam lan mach bach huyet",
                            ["viem mach bach huyet", "xam nhap mach"])]
    assert a.wrong == ["viem mach bach huyet"]  # the input packs are not modified


def test_two_fixes_with_different_values_first_wins():
    a = TermFix("frozen section", "sinh thiet tuc thi", ["lat cat lanh"])
    b = TermFix("frozen section", "lat cat lanh", ["mau dong lanh"])
    assert fixes_of(merge_packs([pk("child", [], [a]), pk("parent", [], [b])])) == [
        ("frozen section", "sinh thiet tuc thi", ["lat cat lanh"])]
