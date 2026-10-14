import re

from vitranslate.tags import check, ids, normalize_tokens, repair, restore_spaces, strip_tags, stray_markup

SRC = "a <g1>b</g1> c<x1/>d"


def test_ids_and_strip():
    assert ids("<g2>a</g2><x1/><g1>b</g1>") == ([2, 1], [1])
    assert strip_tags("a<g1>b</g1><x2/>c") == "abc"
    assert strip_tags("a<g1>b</g1><x2/>c", keep_x=True) == "ab<x2/>c"


def test_check_ok_and_reordered():
    assert check(SRC, "x <g1>y</g1> z<x1/>w") == []
    assert check("<g1>a</g1> <g2>b</g2>", "<g2>B</g2> va <g1>A</g1>") == []


def test_check_errors():
    assert any("missing" in e for e in check(SRC, "x y z<x1/>w"))
    assert any("invented" in e for e in check(SRC, "x <g1>y</g1> <g2>q</g2><x1/>"))
    assert any("empty" in e for e in check(SRC, "x <g1></g1> z<x1/>"))
    assert check("<g1>a</g1> <g2>b</g2>", "<g1>a <g2>b</g1></g2>") != []
    assert any("placeholders" in e for e in check(SRC, "x <g1>y</g1> z w"))


def test_normalize_tokens():
    assert normalize_tokens("< G1 >x</ g1 >< X2 />") == "<g1>x</g1><x2/>"


def test_repair_drops_invented_and_restores_placeholder():
    src = "Line one<x1/>line two <g1>bold</g1>"
    out = repair(src, "Dong mot dong hai <g1>dam</g1> <g7>?</g7><x9/>")
    assert check(src, out) == []
    assert out.count("<x1/>") == 1
    assert re.search(r"\w<x1/>\w", out) is None


def test_repair_removes_empty_pair_and_check_reports_it():
    src = "<g1>Primary antibody</g1>: dilution"
    out = repair(src, "Khang the so cap<g1></g1>: do pha loang")
    assert "<g1>" not in out
    assert any("missing" in e for e in check(src, out))


def test_restore_spaces():
    src = "<g1>Sub optimal fixation </g1>e.g. delay"
    assert restore_spaces(src, "<g1>Co dinh</g1>vi du") == "<g1>Co dinh</g1> vi du"
    src2 = "<g1>TSC/MTOR</g1>-mutated"
    assert restore_spaces(src2, "<g1>TSC/MTOR</g1>-dot bien") == "<g1>TSC/MTOR</g1>-dot bien"
    src3 = "include <g1>VHL</g1> genes"
    assert restore_spaces(src3, "gen<g1>VHL</g1>") == "gen <g1>VHL</g1>"


def test_check_reports_duplicated_unclosed_and_closing_only():
    src = "<g1>a</g1> b"
    assert any("duplicated" in e for e in check(src, "<g1>a</g1> <g1>b</g1>"))
    assert any("unclosed" in e for e in check(src, "<g1>a b"))
    assert any("unopened" in e for e in check(src, "a</g1> b"))


def test_check_flags_stray_markup():
    src = "<g1>a</g1> b<x1/>c"
    base = "<g1>A</g1> B<x1/>C"
    assert check(src, base) == []
    for tail in ["<g1/>", "<x1>", "</G1>", " <i>D</i>", "<g1"]:
        assert any("stray" in e for e in check(src, base + tail)), tail
    assert any("stray" in e for e in check("10<g1>9</g1>/L", "10<g1>9</g1>/L <sup>2</sup>"))


def test_stray_exception_for_source_text():
    src = "magnification <x400> view"
    assert check(src, "do phong dai <x400> view") == []
    assert repair(src, "do phong dai <x400> view") == "do phong dai <x400> view"
    assert normalize_tokens("a <x400> b", src) == "a <x400> b"


def test_repair_drops_stray_markup():
    src = "<g1>a</g1> b<x1/>c"
    out = repair(src, "<g1>A</g1> B<x1/>C <i>D</i><g1/></G1>")
    assert check(src, out) == []
    assert "<i>" not in out and "G1" not in out


def test_normalize_drops_self_closing_g():
    assert normalize_tokens("a<g1/>b") == "ab"


def test_restore_spaces_between_adjacent_tags():
    assert restore_spaces("<g1>Primary</g1> <g2>antibody</g2>",
                          "<g1>Khang the</g1><g2>so cap</g2>") == "<g1>Khang the</g1> <g2>so cap</g2>"


def test_restore_spaces_after_punctuation():
    src = "<g1>Note: </g1><g2>BRAF</g2> mutated"
    out = "<g1>L\u01b0u \u00fd:</g1><g2>BRAF</g2> \u0111\u1ed9t bi\u1ebfn"
    assert restore_spaces(src, out) == "<g1>L\u01b0u \u00fd:</g1> <g2>BRAF</g2> \u0111\u1ed9t bi\u1ebfn"


def test_restore_spaces_nested():
    assert restore_spaces("x <g1>y <g2>z</g2></g1> w", "x<g1>y<g2>z</g2></g1>w") == "x <g1>y <g2>z</g2></g1> w"


def test_repair_keeps_placeholder_order():
    out = repair("<x1/><x2/>Figure 1. Tumour cells", "H\u00ecnh 1. T\u1ebf b\u00e0o u")
    assert out.startswith("<x1/><x2/>H")
    out3 = repair("<x1/><x2/><x3/>Figure", "H\u00ecnh")
    assert out3 == "<x1/><x2/><x3/>H\u00ecnh"
    out2 = repair("ab<x1/><x2/>cd", "abcd")
    assert check("ab<x1/><x2/>cd", out2) == []
    assert out2.index("<x1/>") < out2.index("<x2/>")


def test_repair_idempotent_and_unwraps():
    src = "<g1>a</g1> x"
    for bad in ["<g1><g2></g2></g1> x", "<g1>  </g1> x"]:
        once = repair(src, bad)
        assert repair(src, once) == once
    src2 = "<g1><x1/></g1> t"
    assert repair(src2, "<g1> <x1/> </g1> t") == "<x1/> t"


def test_repair_uncrosses_pairs():
    src = "<g1>x <g2>y</g2></g1> z"
    out = repair(src, "<g1>x <g2>y</g1> z</g2>")
    assert out == "<g1>x <g2>y</g2></g1> z"
    assert check(src, out) == []


LOOKALIKE = [
    ("Grade G1<G2 tumours", "U \u0111\u1ed9 G1 < G2"),
    ("if x1<x2 then", "n\u1ebfu x1 < x2 th\u00ec"),
    ("for 0<x1<10", "v\u1edbi 0 < x1 < 10"),
    ("objective <x40", "v\u1eadt k\u00ednh < x40"),
    ("low grade (<G2)", "(< G2)"),
    ("Dear <Name>, thank you", "K\u00ednh g\u1eedi <T\u00ean>, c\u1ea3m \u01a1n"),
    ("value <missing>", "gi\u00e1 tr\u1ecb <thi\u1ebfu>"),
]


def test_lookalike_text_is_kept():
    for src, out in LOOKALIKE:
        assert check(src, out) == [], (src, out)
        assert repair(src, out) == out, (src, out)


def test_repair_removes_whitelisted_html_with_attributes():
    out = repair("<g1>a</g1> b", '<g1>A</g1> <span style="color:red">B</span>')
    assert out == "<g1>A</g1> B"


def test_escaped_tokens_flagged_and_dropped():
    src = "<g1>a</g1> b"
    bad = "<g1>A</g1> B&lt;g2&gt;x&lt;/g2&gt;"
    assert any("stray" in e for e in check(src, bad))
    assert repair(src, bad) == "<g1>A</g1> Bx"


def test_fragments_flagged_but_not_deleted():
    src = "<g1>a</g1> b"
    out = "<g1>A</g1> B </x1"
    assert any("stray" in e for e in check(src, out))
    assert repair(src, out) == out


def test_lone_closing_x_becomes_placeholder():
    assert repair("a<x1/>b c d", "x</x1>y z w") == "x<x1/>y z w"


def test_restore_spaces_x_is_boundary():
    assert restore_spaces("word <g1>b</g1>", "tu<x1/><g1>b</g1>") == "tu<x1/><g1>b</g1>"


def test_restore_spaces_at_placeholder_edges():
    # the source space sits inside the span, before a line break; text extraction joins the runs ("lan toa(Vui")
    src = "with <g1>diffuse hyperplasia </g1><x2/>(Please correlate"
    out = "v\u1edbi <g1>t\u0103ng s\u1ea3n lan t\u1ecfa</g1><x2/>(Vui l\u00f2ng"
    assert restore_spaces(src, out) == "v\u1edbi <g1>t\u0103ng s\u1ea3n lan t\u1ecfa</g1> <x2/>(Vui l\u00f2ng"
    assert restore_spaces("a<x1/> Text", "b<x1/>Van ban") == "b<x1/> Van ban"
    assert restore_spaces("a <x1/>b", "c <x1/>d") == "c <x1/>d"  # already there
    assert restore_spaces("nephrectomy<x1/>--- Renal", "cat than<x1/>--- Mo") == "cat than<x1/>--- Mo"
    assert restore_spaces("<x1/> Text", "<x1/>Van ban") == "<x1/> Van ban"
    assert restore_spaces("Text <x1/>", "<x1/>Van ban") == "<x1/>Van ban"  # nothing before it in the output


def test_restore_spaces_before_an_opening_bracket():
    src = "<g1>diffuse hyperplasia </g1>(Please correlate)"
    out = "<g1>t\u0103ng s\u1ea3n</g1>(Vui l\u00f2ng)"
    assert restore_spaces(src, out) == out.replace("</g1>(", "</g1> (")
    assert restore_spaces("<g1>word</g1> is", "<g1>tu</g1>, la") == "<g1>tu</g1>, la"


def test_html_alternative_needs_real_attributes():
    cases = [
        ("x<a and y>b", "n\u1ebfu x<a v\u00e0 y>b th\u00ec"),
        ("a<b, c>d", "a<b v\u00e0 c>d"),
        ("i<p and j>q", "i<p v\u00e0 j>q"),
        ("tumours <s 2 cm and >5 cm", "u <s 2 cm v\u00e0 >5 cm"),
    ]
    for src, out in cases:
        assert check(src, out) == [], (src, out)
        assert repair(src, out) == out, (src, out)
    src = "<g1>a</g1> b"
    for tag in ['<span style="color:red">B</span>', "<font color=red>B</font>", "B<br />", "B<br>"]:
        assert repair(src, "<g1>A</g1> " + tag).replace("B", "") == "<g1>A</g1> ", tag


def test_stray_markup_helper():
    src = "<g1>a</g1> b"
    assert stray_markup(src, "<g1>A</g1> B <i>C</i>") == ["<i>", "</i>"]
    assert stray_markup(src, "<g1>A</g1> B </x1") == ["</x1"]
    assert stray_markup(src, "<g1>A</g1> B") == []
