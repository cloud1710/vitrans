from xml.sax.saxutils import escape

import pytest
from lxml import etree

from vitranslate.llm import FakeLLM
from vitranslate.ooxml.codec import encode
from vitranslate.packs import Pack, TermFix
from vitranslate.qa import strip_leaks
from vitranslate.tm import TM
from vitranslate import translate
from vitranslate.translate import SPAN_PROMPT, Translator, _find_free, build_system, build_user, is_essential

NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
RED = '<a:rPr lang="en-US"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>'
P_XML = ('<a:p %s><a:r><a:rPr lang="en-US"/><a:t>In </a:t></a:r>'
         '<a:r>' + RED + '<a:t>NF2-altered</a:t></a:r>'
         '<a:r><a:rPr lang="en-US"/><a:t> meningiomas of the lung, </a:t></a:r>'
         '<a:r><a:rPr lang="en-US" i="1"/><a:t>1p loss</a:t></a:r>'
         '<a:r><a:rPr lang="en-US"/><a:t> is common</a:t></a:r></a:p>') % NS
P_BOLD = P_XML.replace(RED, '<a:rPr lang="en-US" b="1"/>')  # same tagged text, every span essential
GOOD = "Trong u m\u00e0ng n\u00e3o <g1>NF2-altered</g1> \u1edf ph\u1ed5i, <g2>m\u1ea5t 1p</g2> th\u01b0\u1eddng g\u1eb7p"
NO_G1 = "Trong u m\u00e0ng n\u00e3o NF2-altered \u1edf ph\u1ed5i, <g2>m\u1ea5t 1p</g2> th\u01b0\u1eddng g\u1eb7p"
NO_TAGS = "Trong u m\u00e0ng n\u00e3o NF2-altered \u1edf ph\u1ed5i, m\u1ea5t 1p th\u01b0\u1eddng g\u1eb7p"
PREV_VI = ("Kh\u1ed1i u m\u00e0ng n\u00e3o l\u00e0 u nguy\u00ean ph\u00e1t th\u01b0\u1eddng g\u1eb7p nh\u1ea5t c\u1ee7a h\u1ec7 th\u1ea7n kinh trung \u01b0\u01a1ng "
           "\u1edf ng\u01b0\u1eddi l\u1edbn.")
CONTEXT = {"prev": "Meningiomas are common.", "nxt": "Grading follows WHO."}


def seg():
    return encode(etree.fromstring(P_XML))


def one_run(text):
    return encode(etree.fromstring('<a:p %s><a:r><a:rPr lang="en-US"/><a:t>%s</a:t></a:r></a:p>'
                                   % (NS, escape(text))))


def tr(replies, tm=None, fixes=()):
    llm = FakeLLM(replies)
    return Translator(llm, "SYS", "m", "p@1", fixes=fixes, tm=tm), llm


def test_segment_shape():
    s = seg()
    assert s.tagged == "In <g1>NF2-altered</g1> meningiomas of the lung, <g2>1p loss</g2> is common"
    assert not is_essential(s.spans[1]) and is_essential(s.spans[2])


def test_level0():
    t, llm = tr([GOOD])
    out = t.translate(seg())
    assert (out.level, out.text, len(llm.calls)) == (0, GOOD, 1)


def test_level1_repair():
    t, llm = tr([GOOD.replace("<g1>", "< g1 >").replace("</g1>", "</ g1 >")])
    out = t.translate(seg())
    assert out.level == 1 and out.text == GOOD and len(llm.calls) == 1


def test_level1_drops_invented_tags():
    t, llm = tr(["<g1>Nhu\u1ed9m</g1> \u00e2m <sup>t\u00ednh</sup>"])
    out = t.translate(one_run("Negative staining"))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (1, "Nhu\u1ed9m \u00e2m t\u00ednh", [], 1)


@pytest.mark.parametrize("dots", ["...", "\u2026"])
def test_invented_blank_pairs_are_dropped_with_their_content(dots):
    t, llm = tr(["Nhu\u1ed9m \u00e2m t\u00ednh <g1>%s</g1>" % dots])
    out = t.translate(one_run("Negative staining"))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (1, "Nhu\u1ed9m \u00e2m t\u00ednh", [], 1)


def test_level2_retry_names_the_error():
    t, llm = tr([NO_G1, GOOD])
    out = t.translate(seg())
    assert out.level == 2 and out.text == GOOD and out.flags == ["retried:tags"]
    assert "broke the tags" in llm.calls[1][1] and "<g1>" in llm.calls[1][1]


def test_level3_fewer_tags():
    t, llm = tr([NO_G1, NO_G1, NO_G1])
    out = t.translate(seg())
    assert out.level == 3 and list(out.segment.spans) == [2]
    assert out.text == NO_G1 and len(llm.calls) == 3
    assert "<g1>" not in llm.calls[2][1]


def test_level4_reattach():
    t, llm = tr([NO_G1, NO_G1, NO_TAGS, NO_TAGS, "m\u1ea5t 1p"])
    out = t.translate(seg())
    assert out.level == 4 and out.text == NO_G1
    assert len(llm.calls) == 5
    assert "This text has no tags; do not add any." in llm.calls[3][1]  # the plain L4 request


def test_reattach_drops_invented_blank_pairs():
    t, llm = tr([NO_G1, NO_G1, NO_TAGS, NO_TAGS + " <g7>...</g7>", "m\u1ea5t 1p"])
    out = t.translate(seg())
    assert (out.level, out.text, len(llm.calls)) == (4, NO_G1, 5)


def test_level5_when_nothing_reattaches_is_not_cached(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    t, llm = tr([NO_G1, NO_G1, NO_TAGS, NO_TAGS, "s\u1ef1 m\u1ea5t 1p"], tm=tm)
    out = t.translate(seg())
    assert out.level == 5 and "formatting_lost" in out.flags and out.text == NO_TAGS
    assert len(llm.calls) == 5
    assert not tr([GOOD], tm=tm)[0].translate(seg()).cached


def test_all_spans_essential_skips_level3_and_partial_reattach_is_cached(tmp_path):
    s = encode(etree.fromstring(P_BOLD))
    assert s.tagged == seg().tagged and all(is_essential(sp) for sp in s.spans.values())
    tm = TM(tmp_path / "tm.sqlite")
    t, llm = tr([NO_G1, NO_G1, NO_TAGS, "s\u1ef1 m\u1ea5t 1p"], tm=tm)
    out = t.translate(s)
    # no level-3 call (it would repeat L0); "NF2-altered" is found as it is, without a span call
    assert out.level == 4 and out.text == "Trong u m\u00e0ng n\u00e3o <g1>NF2-altered</g1> \u1edf ph\u1ed5i, m\u1ea5t 1p th\u01b0\u1eddng g\u1eb7p"
    assert len(llm.calls) == 4 and "formatting_lost" in out.flags
    t2, llm2 = tr([], tm=tm)
    hit = t2.translate(encode(etree.fromstring(P_BOLD)))
    assert hit.cached and hit.text == out.text and "formatting_lost" in hit.flags and llm2.calls == []


def test_cache_hit_costs_no_call_and_key_sees_the_system_prompt(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    t, _ = tr([GOOD], tm=tm)
    t.translate(seg())
    t2, llm2 = tr([], tm=tm)
    out = t2.translate(seg())
    assert out.cached and out.text == GOOD and llm2.calls == []
    other = Translator(FakeLLM([GOOD]), "SYS with other glossary hits", "m", "p@1", tm=tm)
    assert not other.translate(seg()).cached


def test_cache_hit_reruns_term_fixes_and_keeps_their_flags(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    fixes = [TermFix("lung", "ph\u1ed5i", ["pulm\u00f4n"])]
    reply = GOOD.replace("ph\u1ed5i", "pulm\u00f4n")
    first = tr([reply], tm=tm, fixes=fixes)[0].translate(seg())
    hit = tr([], tm=tm, fixes=fixes)[0].translate(seg())
    assert first.text == hit.text == GOOD and hit.cached
    assert "term_fix:lung" in first.flags and "term_fix:lung" in hit.flags
    assert first.fixes == hit.fixes == [{"en": "lung", "from": "pulm\u00f4n", "to": "ph\u1ed5i"}]


def test_finishing_spaces_and_term_fix():
    xml = ('<a:p %s><a:r><a:rPr lang="en-US" b="1"/><a:t>Sub optimal fixation </a:t></a:r>'
           '<a:r><a:rPr lang="en-US"/><a:t>of the lung tissue in this case</a:t></a:r></a:p>') % NS
    s = encode(etree.fromstring(xml))
    assert s.tagged == "<g1>Sub optimal fixation </g1>of the lung tissue in this case"
    reply = "<g1>C\u1ed1 \u0111\u1ecbnh kh\u00f4ng t\u1ed1i \u01b0u</g1>c\u1ee7a m\u00f4 pulm\u00f4n trong ca n\u00e0y"
    t, _ = tr([reply], fixes=[TermFix("lung", "ph\u1ed5i", ["pulm\u00f4n"])])
    out = t.translate(s)
    assert out.text == ("<g1>C\u1ed1 \u0111\u1ecbnh kh\u00f4ng t\u1ed1i \u01b0u</g1> c\u1ee7a m\u00f4 ph\u1ed5i "
                        "trong ca n\u00e0y")
    assert "term_fix:lung" in out.flags


def test_finishing_capitalises_the_first_letter_like_the_source(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    out = tr(["ph\u00e2n \u0111\u1ed9 c\u1ee7a t\u1ed5n th\u01b0\u01a1ng"], tm=tm)[0].translate(one_run("Grade of the lesion"))
    assert out.text == "Ph\u00e2n \u0111\u1ed9 c\u1ee7a t\u1ed5n th\u01b0\u01a1ng" and out.flags == []
    hit = tr([], tm=tm)[0].translate(one_run("Grade of the lesion"))
    assert hit.cached and hit.text == out.text


def test_english_left_gets_one_retry():
    s = one_run("The tumor of the lung is small")
    t, llm = tr(["The tumor of the lung is small", "Kh\u1ed1i u \u1edf ph\u1ed5i nh\u1ecf"])
    out = t.translate(s)
    assert out.level == 2 and "english_left" not in out.flags and len(llm.calls) == 2
    assert out.flags == ["retried:english"]


COPIED_SRC = "Spleen, upper pole, partial resection --- Congested red pulp with small granulomas"
COPIED_VI = "--- T\u1ee7y \u0111\u1ecf sung huy\u1ebft k\u00e8m u h\u1ea1t nh\u1ecf"
COPIED_PARTIAL = "Spleen, upper pole, partial resection " + COPIED_VI
COPIED_GOOD = "L\u00e1ch, c\u1ef1c tr\u00ean, c\u1eaft m\u1ed9t ph\u1ea7n " + COPIED_VI


def test_english_copied_from_the_source_gets_one_retry_naming_it():
    # the retry quotes the previous answer: asked to re-translate from scratch, the model rewrote the whole segment
    t, llm = tr([COPIED_PARTIAL, COPIED_GOOD])
    out = t.translate(one_run(COPIED_SRC))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (2, COPIED_GOOD, ["retried:english"], 2)
    assert "\"Spleen, upper pole, partial resection\"" in llm.calls[1][1] and COPIED_PARTIAL in llm.calls[1][1]


def test_a_retry_that_keeps_the_copied_english_does_not_replace_the_first_answer():
    t, llm = tr([COPIED_PARTIAL, COPIED_SRC])  # the retry gave the English source back
    out = t.translate(one_run(COPIED_SRC))
    assert (out.level, out.text, len(llm.calls)) == (0, COPIED_PARTIAL, 2)
    assert out.flags == ["retried:english", "english_left"]


def test_english_copied_after_the_retry_is_english_left_and_not_cached(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    out = tr([COPIED_PARTIAL, COPIED_PARTIAL], tm=tm)[0].translate(one_run(COPIED_SRC))
    assert out.text == COPIED_PARTIAL and "english_left" in out.flags and "retried:english" in out.flags
    assert not tr([COPIED_GOOD], tm=tm)[0].translate(one_run(COPIED_SRC)).cached


OMIT_SRC = ("Breast, left upper outer quadrant, ultrasound-guided core needle biopsy --- "
            "Fibroadenoma with apocrine metaplasia")
OMIT_HEAD = ("V\u00fa tr\u00e1i, g\u00f3c ph\u1ea7n t\u01b0 tr\u00ean ngo\u00e0i, sinh thi\u1ebft l\u00f5i kim d\u01b0\u1edbi "
             "h\u01b0\u1edbng d\u1eabn si\u00eau \u00e2m --- ")
OMIT_VI = OMIT_HEAD + "U x\u01a1 tuy\u1ebfn"
FULL_VI = OMIT_HEAD + "U x\u01a1 tuy\u1ebfn k\u00e8m d\u1ecb s\u1ea3n \u0111\u1ea1i h\u00e3n"


def test_a_clause_left_out_gets_one_retry_naming_it():
    t, llm = tr([OMIT_VI, FULL_VI])
    out = t.translate(one_run(OMIT_SRC))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (2, FULL_VI, ["retried:gate"], 2)
    assert "left out" in llm.calls[1][1] and "\"Fibroadenoma with apocrine metaplasia\"" in llm.calls[1][1]


def test_a_clause_still_left_out_after_the_retry_is_flagged_and_not_cached(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    out = tr([OMIT_VI, OMIT_VI], tm=tm)[0].translate(one_run(OMIT_SRC))
    assert (out.level, out.text) == (0, OMIT_VI)
    assert out.flags == ["retried:gate", "omitted:Fibroadenoma with apocrine metaplasia"]
    assert not tr([FULL_VI], tm=tm)[0].translate(one_run(OMIT_SRC)).cached


def test_build_system_contains_parts():
    pack = Pack("pathology", "0.1.0", "GPB", [], "PACK VOICE", [], [], [])
    text = build_system("STYLE RULES", pack, [("lung", "ph\u1ed5i")])
    assert "STYLE RULES" in text and "PACK VOICE" in text and "- lung = ph\u1ed5i" in text
    assert "Keep EVERY tag" in text and "..." not in text  # the model copies "<g1>...</g1>" into tagless answers


def test_reminder_lists_the_segment_tags():
    t, llm = tr([GOOD])
    t.translate(seg())
    user = llm.calls[0][1]
    assert "Keep these tags exactly once each, around the matching Vietnamese words: <g1>\u2026</g1>, <g2>\u2026</g2>" in user
    assert user.index("Keep these tags") < user.index("Translate:\n") and "..." not in user
    assert user.endswith("Translate:\n" + seg().tagged)
    assert "<g1>\u2026</g1>, <x1/>" in build_user("A <g1>b</g1><x1/>")
    assert "This text has no tags; do not add any." in build_user("Negative staining")


# ---- empty answers, cache key, re-attach safety, flags on every tag failure

@pytest.mark.parametrize("blank", ["", "."])
def test_empty_answer_is_retried(blank):
    t, llm = tr([blank, "Kh\u1ed1i u \u1edf ph\u1ed5i nh\u1ecf"])
    out = t.translate(one_run("The tumor of the lung is small"))
    assert (out.level, out.text, len(llm.calls)) == (2, "Kh\u1ed1i u \u1edf ph\u1ed5i nh\u1ecf", 2)
    assert "empty answer" in llm.calls[1][1] and "broke the tags" not in llm.calls[1][1]
    assert out.flags == ["retried:empty"]


def test_empty_answers_keep_the_source_and_skip_the_cache(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    t, llm = tr(["", "", "", ""], tm=tm)
    out = t.translate(seg())
    assert (out.text, out.level, len(llm.calls)) == (seg().tagged, 5, 4)
    assert "empty_output" in out.flags and list(out.segment.spans) == [1, 2]
    t2, llm2 = tr([GOOD], tm=tm)
    again = t2.translate(seg())
    assert not again.cached and again.text == GOOD and len(llm2.calls) == 1


def _one_span_para(rpr_attrs, rpr_kids):
    xml = ('<a:p %s><a:r><a:rPr lang="en-US"/><a:t>In </a:t></a:r>'
           '<a:r><a:rPr lang="en-US"%s>%s</a:rPr><a:t>NF2</a:t></a:r>'
           '<a:r><a:rPr lang="en-US"/><a:t> tumours of the lung</a:t></a:r></a:p>') % (NS, rpr_attrs, rpr_kids)
    return encode(etree.fromstring(xml))


def test_no_essential_span_is_level3_and_cache_key_sees_essential_spans(tmp_path):
    red = _one_span_para("", '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>')
    bold = _one_span_para(' b="1"', "")
    assert red.tagged == bold.tagged == "In <g1>NF2</g1> tumours of the lung"
    plain = "Trong u NF2 \u1edf ph\u1ed5i"
    tm = TM(tmp_path / "tm.sqlite")
    t, llm = tr([plain, plain, plain], tm=tm)
    first = t.translate(red)
    assert (first.level, first.text, first.segment.spans, len(llm.calls)) == (3, plain, {}, 3)
    assert tr([], tm=tm)[0].translate(red).cached
    t2, llm2 = tr(["Trong u <g1>NF2</g1> \u1edf ph\u1ed5i"], tm=tm)
    out = t2.translate(bold)  # same tagged text, but g1 is essential here: the level-3 answer would drop the bold
    assert not out.cached and out.level == 0 and list(out.segment.spans) == [1] and len(llm2.calls) == 1


def test_reattach_never_splits_a_placeholder():
    xml = ('<a:p %s><a:r><a:rPr lang="en-US"/><a:t>The coefficient </a:t></a:r>'
           '<a:r><a:rPr lang="en-US" i="1"/><a:t>x1</a:t></a:r>'
           '<a:r><a:rPr lang="en-US"/><a:t> of the model</a:t></a:r><a:br/>'
           '<a:r><a:rPr lang="en-US"/><a:t>is small</a:t></a:r></a:p>') % NS
    s = encode(etree.fromstring(xml))
    assert s.tagged == "The coefficient <g1>x1</g1> of the model<x1/>is small"
    plain = "M\u00f4 h\u00ecnh<x1/>c\u00f3 h\u1ec7 s\u1ed1 x1 nh\u1ecf"
    t, llm = tr([plain, plain, plain])  # "x1" is found as it is: no span call
    out = t.translate(s)
    assert out.level == 4 and out.text == "M\u00f4 h\u00ecnh<x1/>c\u00f3 h\u1ec7 s\u1ed1 <g1>x1</g1> nh\u1ecf"
    # only the info flag of the level-2 retry: words around a line break are not glued into one "suspicious" token
    assert len(llm.calls) == 3 and out.flags == ["retried:tags"]
    assert "Keep these tags exactly once each, around the matching Vietnamese words: <x1/>" in llm.calls[2][1]


def test_reattach_splits_a_word_only_where_the_source_span_did():
    xml = ('<a:p %s><a:r><a:rPr lang="en-US"/><a:t>Area 5 cm</a:t></a:r>'
           '<a:r><a:rPr lang="en-US" baseline="30000"/><a:t>2</a:t></a:r>'
           '<a:r><a:rPr lang="en-US"/><a:t> around the </a:t></a:r>'
           '<a:r><a:rPr lang="en-US" b="1"/><a:t>tumor</a:t></a:r>'
           '<a:r><a:rPr lang="en-US"/><a:t>.</a:t></a:r></a:p>') % NS
    s = encode(etree.fromstring(xml))
    assert s.tagged == "Area 5 cm<g1>2</g1> around the <g2>tumor</g2>."
    plain = "V\u00f9ng nhi\u1ec1u t\u1ebf b\u00e0o 5 cm2 quanh u."
    t, llm = tr([plain, plain, plain, "u"])  # "2" has no letters: re-attached without a call
    out = t.translate(s)
    # "u" also ends the second word and sits inside "quanh": only the free-standing word may take the bold
    assert out.text == "V\u00f9ng nhi\u1ec1u t\u1ebf b\u00e0o 5 cm<g1>2</g1> quanh <g2>u</g2>."
    assert out.level == 4 and len(llm.calls) == 4 and out.flags == ["retried:tags"]


def test_find_free_skips_tokens_and_existing_spans():
    text = "a <g1>u b</g1> u<x1/>"
    assert _find_free(text, "u").start() == len("a <g1>u b</g1> ")
    assert _find_free("<g1>u</g1> x1<x1/>", "u") is None


def test_span_calls_are_memoised_and_capped():
    texts = ["dup", "dup"] + ["s%d" % k for k in range(3, 12)]  # 11 spans, 10 different texts
    runs = "".join('<a:r><a:rPr lang="en-US"/><a:t>word%d </a:t></a:r>'
                   '<a:r><a:rPr lang="en-US" i="1"/><a:t>%s</a:t></a:r>' % (k, t) for k, t in enumerate(texts, 1))
    s = encode(etree.fromstring("<a:p %s>%s</a:p>" % (NS, runs)))
    assert len(s.spans) == 11 and all(is_essential(sp) for sp in s.spans.values())
    llm = FakeLLM(fn=lambda system, user: "zz" if user.startswith(SPAN_PROMPT) else "Trong ca n\u00e0y")
    out = Translator(llm, "SYS", "m", "p@1").translate(s)
    span_calls = [u for _, u in llm.calls if u.startswith(SPAN_PROMPT)]
    assert out.level == 5 and len(span_calls) == 8 and len(llm.calls) == 3 + 8
    assert sum(u.endswith("\ndup") for u in span_calls) == 1


@pytest.mark.parametrize("mark", ["**", "*"])
def test_level4_term_fixes_and_markdown_before_reattach(mark):
    xml = ('<a:p %s><a:r><a:rPr lang="en-US"/><a:t>Tissue of the </a:t></a:r>'
           '<a:r><a:rPr lang="en-US" b="1"/><a:t>lung</a:t></a:r>'
           '<a:r><a:rPr lang="en-US"/><a:t> was fixed</a:t></a:r></a:p>') % NS
    s = encode(etree.fromstring(xml))
    assert s.tagged == "Tissue of the <g1>lung</g1> was fixed"
    flat = "M\u00f4 %spulm\u00f4n%s \u0111\u01b0\u1ee3c c\u1ed1 \u0111\u1ecbnh" % (mark, mark)
    llm = FakeLLM([flat, flat, flat])
    t = Translator(llm, "SYS", "m", "p@1", fixes=[TermFix("lung", "ph\u1ed5i", ["pulm\u00f4n"])], hits=[("lung", "ph\u1ed5i")])
    out = t.translate(s)
    assert out.text == "M\u00f4 <g1>ph\u1ed5i</g1> \u0111\u01b0\u1ee3c c\u1ed1 \u0111\u1ecbnh" and out.level == 4 and len(llm.calls) == 3
    assert "term_fix:lung" in out.flags and "suspect_output:markdown" in out.flags
    assert out.fixes == [{"en": "lung", "from": "pulm\u00f4n", "to": "ph\u1ed5i"}]  # fixed before the re-attach


def test_more_than_12_tags_start_at_level3():
    runs = "".join('<a:r><a:rPr lang="en-US"/><a:t>word%d </a:t></a:r><a:r>%s<a:t>red%d</a:t></a:r>' % (k, RED, k)
                   for k in range(1, 13))
    xml = ('<a:p %s>%s<a:r><a:rPr lang="en-US"/><a:t> and the </a:t></a:r>'
           '<a:r><a:rPr lang="en-US" i="1"/><a:t>last one</a:t></a:r></a:p>') % (NS, runs)
    s = encode(etree.fromstring(xml))
    assert len(s.spans) == 13 and is_essential(s.spans[13])
    t, llm = tr(["T\u1eeb <g13>cu\u1ed1i</g13>"])
    out = t.translate(s)
    assert (out.level, list(out.segment.spans), len(llm.calls)) == (3, [13], 1)
    assert "<g13>" in llm.calls[0][1] and "<g12>" not in llm.calls[0][1]


def test_damaged_cache_entry_is_flagged(tmp_path):
    s = encode(etree.fromstring(('<a:p %s><a:r><a:rPr lang="en-US" b="1"/><a:t>Sub optimal fixation </a:t></a:r>'
                                 '<a:r><a:rPr lang="en-US"/><a:t>of the lung tissue in this case</a:t></a:r></a:p>')
                                % NS))
    tm = TM(tmp_path / "tm.sqlite")
    t, llm = tr([], tm=tm)
    tm.put(t._key(s), "<g1></g1> c\u1ee7a m\u00f4 ph\u1ed5i trong ca n\u00e0y", 0)
    out = t.translate(s)
    assert out.cached and "tags_broken" in out.flags and llm.calls == []


# ---- sanity gate: a tag-exact answer that is still not a translation of this source

PROBES = {
    "tags_only": ("<g1>NF2-altered</g1> <g2>m\u1ea5t 1p</g2>", "ratio"),
    "previous_paragraph": (PREV_VI + " " + GOOD, "ratio"),
    "runaway": (GOOD + " l\u1eb7p l\u1ea1i" * 3000, "ratio"),
    "chinese": (GOOD.replace("th\u01b0\u1eddng g\u1eb7p", "\u5e38\u89c1"), "script"),
    "scaffold": ("Your previous answer: " + GOOD, "scaffold"),
    "markdown": (GOOD.replace("<g2>m\u1ea5t 1p</g2>", "<g2>**m\u1ea5t 1p**</g2>"), "markdown"),
    "star": (GOOD.replace("<g2>m\u1ea5t 1p</g2>", "<g2>*m\u1ea5t 1p*</g2>"), "markdown"),
    "angle": (GOOD.replace("m\u1ea5t 1p", "m\u1ea5t <1p>"), "angle"),
    "latex": (GOOD.replace("m\u1ea5t 1p", "m\u1ea5t 1p $x^{2}$"), "latex"),
}


@pytest.mark.parametrize("name", sorted(PROBES))
def test_sanity_gate_retries_without_context(name):
    t, llm = tr([PROBES[name][0], GOOD])
    out = t.translate(seg(), **CONTEXT)
    assert (out.level, out.text, out.flags, len(llm.calls)) == (2, GOOD, ["retried:gate"], 2)
    assert "Previous paragraph" in llm.calls[0][1] and "Next paragraph" in llm.calls[0][1]
    note = llm.calls[1][1]
    assert "not a clean translation" in note and "Previous paragraph" not in note and "Next paragraph" not in note


@pytest.mark.parametrize("name", sorted(PROBES))
def test_sanity_gate_flags_and_skips_the_cache(name, tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    reply, reason = PROBES[name]
    out = tr([reply, reply], tm=tm)[0].translate(seg())
    assert out.level == 2 and "suspect_output:" + reason in out.flags
    assert not tr([GOOD], tm=tm)[0].translate(seg()).cached
    if name in ("markdown", "star"):
        assert out.text == GOOD  # emphasis markers are stripped at L0-L2 too, the flag stays


LATEX_SRC = "Stage IIA \u2192 IIB after review"
LATEX_OUT = "Giai \u0111o\u1ea1n IIA $\\rightarrow$ IIB sau khi xem l\u1ea1i"
LATEX_GOOD = "Giai \u0111o\u1ea1n IIA \u2192 IIB sau khi xem l\u1ea1i"


def test_latex_markup_gets_one_retry_naming_it():
    t, llm = tr([LATEX_OUT, LATEX_GOOD])
    out = t.translate(one_run(LATEX_SRC))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (2, LATEX_GOOD, ["retried:gate"], 2)
    assert "LaTeX" in llm.calls[1][1] and "\"$\\rightarrow$\"" in llm.calls[1][1]


def test_latex_symbols_left_after_the_retry_are_written_as_characters_and_cached(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    out = tr([LATEX_OUT, LATEX_OUT], tm=tm)[0].translate(one_run(LATEX_SRC))
    assert (out.text, out.flags) == (LATEX_GOOD, ["retried:gate"])
    hit = tr([], tm=tm)[0].translate(one_run(LATEX_SRC))
    assert hit.cached and (hit.text, hit.flags) == (LATEX_GOOD, [])


def test_latex_that_is_no_symbol_is_flagged_and_not_cached(tmp_path):
    src = "The ratio a over b was low"
    bad = "T\u1ec9 s\u1ed1 $\\frac{a}{b}$ th\u1ea5p"
    tm = TM(tmp_path / "tm.sqlite")
    out = tr([bad, bad], tm=tm)[0].translate(one_run(src))
    assert out.text == bad and out.flags == ["retried:gate", "suspect_output:latex"]
    assert not tr(["T\u1ec9 s\u1ed1 a tr\u00ean b th\u1ea5p"], tm=tm)[0].translate(one_run(src)).cached


def test_latex_the_source_has_is_kept_without_a_retry():
    src = "Write $\\alpha$ in the formula"
    t, llm = tr(["Vi\u1ebft $\\alpha$ trong c\u00f4ng th\u1ee9c"])
    out = t.translate(one_run(src))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (0, "Vi\u1ebft $\\alpha$ trong c\u00f4ng th\u1ee9c", [], 1)


HEPATO_SRC = "Swollen hepatocytes around the central vein"
HEPATO_OUT = "Hepatocyte ph\u00ecnh to quanh t\u0129nh m\u1ea1ch trung t\u00e2m"
HEPATO_GOOD = "T\u1ebf b\u00e0o gan ph\u00ecnh to quanh t\u0129nh m\u1ea1ch trung t\u00e2m"


def test_a_single_english_word_left_gets_one_retry_naming_it():
    t, llm = tr([HEPATO_OUT, HEPATO_GOOD])
    out = t.translate(one_run(HEPATO_SRC))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (2, HEPATO_GOOD, ["retried:english"], 2)
    assert "\"Hepatocyte\"" in llm.calls[1][1] and HEPATO_OUT in llm.calls[1][1]


def test_a_single_english_word_still_left_after_the_retry_is_english_left(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    out = tr([HEPATO_OUT, HEPATO_OUT], tm=tm)[0].translate(one_run(HEPATO_SRC))
    assert (out.text, out.flags) == (HEPATO_OUT, ["retried:english", "english_left"])
    assert not tr([HEPATO_GOOD], tm=tm)[0].translate(one_run(HEPATO_SRC)).cached


def test_a_glossary_key_with_a_vietnamese_value_left_in_english_is_english_left():
    src, out_en = "A deletion of 1p was found", "Ph\u00e1t hi\u1ec7n deletion 1p"
    hits = [("deletion", "m\u1ea5t \u0111o\u1ea1n")]
    out = Translator(FakeLLM([out_en, out_en]), "SYS", "m", "p@1", hits=hits).translate(one_run(src))
    assert "english_left" in out.flags and "retried:english" in out.flags
    out = Translator(FakeLLM([out_en]), "SYS", "m", "p@1").translate(one_run(src))  # not a glossary key: no flag
    assert "english_left" not in out.flags


def test_a_glossary_word_kept_in_english_is_not_english_left():
    hits = [("hepatocyte", "hepatocyte")]
    llm = FakeLLM([HEPATO_OUT])
    out = Translator(llm, "SYS", "m", "p@1", hits=hits).translate(one_run(HEPATO_SRC))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (0, HEPATO_OUT, [], 1)


def test_emphasis_after_a_tag_retry_is_stripped_and_flagged(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    t, llm = tr([NO_G1, PROBES["markdown"][0]], tm=tm)
    out = t.translate(seg())
    assert (out.level, out.text, len(llm.calls)) == (2, GOOD, 2)
    assert out.flags == ["retried:tags", "suspect_output:markdown"]
    assert not tr([GOOD], tm=tm)[0].translate(seg()).cached


def echo(system, user):
    return user.split("Translate:\n", 1)[1]


@pytest.mark.parametrize("text", ["Outline", "Classification", "Curriculum Vitae",
                                  "Six Major Patterns of Renal Tumors", "External Quality Assessment (EQA)",
                                  "Contact Information", "Jane Doe, MD, PhD"])
def test_unchanged_answer_is_retried_then_flagged(text, tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    llm = FakeLLM(fn=echo)
    out = Translator(llm, "SYS", "m", "p@1", tm=tm).translate(one_run(text), **CONTEXT)
    assert (out.level, out.text, len(llm.calls)) == (2, text, 2)
    assert out.flags == ["retried:english", "unchanged"]
    note = llm.calls[1][1]
    assert "still in English" in note and "paragraph" not in note
    assert not Translator(FakeLLM(fn=echo), "SYS", "m", "p@1", tm=tm).translate(one_run(text)).cached


def test_ratio_bound_is_tighter_when_context_was_sent():
    longer = GOOD + " v\u00e0 th\u01b0\u1eddng g\u1eb7p \u1edf ng\u01b0\u1eddi l\u1edbn tu\u1ed5i h\u01a1n"  # 67 / 44 letters = 1.52
    t, llm = tr([longer, GOOD])
    out = t.translate(seg(), **CONTEXT)
    assert (out.level, out.text, out.flags) == (2, GOOD, ["retried:gate"])
    t, llm = tr([longer])
    out = t.translate(seg())
    assert (out.level, out.flags, len(llm.calls)) == (0, [], 1)


def test_short_source_bleed_is_caught_by_the_ratio_gate():
    t, llm = tr(["Ph\u00e2n \u0111\u1ed9 u m\u00e0ng n\u00e3o " + PREV_VI, "Ph\u00e2n \u0111\u1ed9 u m\u00e0ng n\u00e3o"])
    out = t.translate(one_run("Meningioma grading"))
    assert (out.level, out.text, out.flags, len(llm.calls)) == (2, "Ph\u00e2n \u0111\u1ed9 u m\u00e0ng n\u00e3o", ["retried:gate"], 2)


def test_short_segments_get_no_context():
    t, llm = tr(["Nhu\u1ed9m \u00e2m t\u00ednh"])
    out = t.translate(one_run("Negative staining"), prev="Marker", nxt="Result")
    assert out.level == 0 and "paragraph" not in llm.calls[0][1]


def test_table_cells_up_to_six_words_get_no_context():
    t, llm = tr(["K\u00edch th\u01b0\u1edbc t\u1ed1i \u0111a (mm), trung v\u1ecb"])
    t.translate(one_run("Maximal dimension in millimetres, median value"), prev="P value", nxt="Location, n (%)")
    assert "paragraph" not in llm.calls[0][1]
    t, llm = tr(["C\u00e1c m\u1eabu \u0111\u01b0\u1ee3c c\u1ed1 \u0111\u1ecbnh trong formalin"])
    t.translate(one_run("All samples were fixed in buffered formalin"), prev="Methods", nxt="Results")
    assert "Previous paragraph" in llm.calls[0][1]


def test_unchanged_short_english_is_retried_then_flagged(tmp_path):
    t, llm = tr(["Negative staining", "Nhu\u1ed9m \u00e2m t\u00ednh"])
    out = t.translate(one_run("Negative staining"), prev="Marker", nxt="Result")
    assert (out.level, out.text, out.flags, len(llm.calls)) == (2, "Nhu\u1ed9m \u00e2m t\u00ednh", ["retried:english"], 2)
    tm = TM(tmp_path / "tm.sqlite")
    out = tr(["Negative staining", "negative  staining"], tm=tm)[0].translate(one_run("Negative staining"))
    assert "unchanged" in out.flags and "english_left" not in out.flags
    assert not tr(["Nhu\u1ed9m \u00e2m t\u00ednh"], tm=tm)[0].translate(one_run("Negative staining")).cached


def test_kept_english_glossary_term_is_not_english_left():
    llm = FakeLLM(["trastuzumab"])
    out = Translator(llm, "SYS", "m", "p@1", hits=[("trastuzumab", "trastuzumab")]).translate(one_run("trastuzumab"))
    assert (out.level, out.flags, len(llm.calls)) == (0, ["kept_english"], 1)


def test_segment_of_kept_glossary_terms_is_kept_english_on_cache_hits_too(tmp_path):
    # a heading that is only a glossary term kept in English ("Tau" -> "tau") is information, never silent
    tm, hits = TM(tmp_path / "tm.sqlite"), [("tau", "tau")]
    out = Translator(FakeLLM(["tau"]), "SYS", "m", "p@1", hits=hits, tm=tm).translate(one_run("Tau"))
    assert (out.level, out.text, out.flags) == (0, "Tau", ["kept_english"])  # first letter capital like the source
    hit = Translator(FakeLLM([]), "SYS", "m", "p@1", hits=hits, tm=tm).translate(one_run("Tau"))
    assert hit.cached and hit.flags == ["kept_english"]


def test_single_word_unchanged_twice_is_kept_english_and_cached(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    t, llm = tr(["trastuzumab", "trastuzumab"], tm=tm)
    out = t.translate(one_run("trastuzumab"))
    assert (out.level, out.text, len(llm.calls)) == (2, "trastuzumab", 2)
    assert "kept_english" in out.flags and "english_left" not in out.flags and "retried:english" in out.flags
    hit = tr([], tm=tm)[0].translate(one_run("trastuzumab"))
    assert hit.cached and "kept_english" in hit.flags and "english_left" not in hit.flags


@pytest.mark.parametrize("text", ["BRAF VE1", "Ki-67 (MIB-1)", "pT1a", "p<0.001", "CD20+", "HER2 3+", "<5 mm",
                                  "Ki-67", "p53"])
def test_code_only_cells_are_kept_without_a_call(text, tmp_path):
    t, llm = tr([], tm=TM(tmp_path / "tm.sqlite"))
    s = one_run(text)
    out = t.translate(s)
    assert (out.text, out.level, out.flags, llm.calls) == (s.tagged, 0, ["kept_code"], [])


def test_code_only_cell_keeps_its_tags():
    s = encode(etree.fromstring('<a:p %s><a:r><a:rPr lang="en-US" i="1"/><a:t>BRAF</a:t></a:r>'
                                '<a:r><a:rPr lang="en-US"/><a:t> V600E</a:t></a:r></a:p>' % NS))
    assert s.tagged == "<g1>BRAF</g1> V600E"
    t, llm = tr([])
    out = t.translate(s)
    assert (out.text, out.segment, out.flags, llm.calls) == (s.tagged, s, ["kept_code"], [])


@pytest.mark.parametrize("text", ["OVERVIEW OF STAINING METHODS", "SEVEN YEARS LATER (2019)",
                                  "QUALITY CONTROL IN DAILY PRACTICE",
                                  # one long word + an English function word; a month name with a number (a date)
                                  "I AM ATTENDING ASDP 2026", "1-3 NOVEMBER 2026", "RESULTS OF THE STUDY", "MAY 2026"])
def test_all_caps_english_is_translated_not_kept_as_code(text):
    t, llm = tr(["C\u00f3"])
    out = t.translate(one_run(text))
    assert len(llm.calls) == 1 and "kept_code" not in out.flags


def test_all_caps_glossary_term_is_translated():
    llm = FakeLLM(["T\u1ebf b\u00e0o h\u00ecnh thoi"])
    t = Translator(llm, "SYS", "m", "p@1", hits=[("spindle cell", "t\u1ebf b\u00e0o h\u00ecnh thoi")])
    out = t.translate(one_run("SPINDLE CELL"))
    assert len(llm.calls) == 1 and "kept_code" not in out.flags


@pytest.mark.parametrize("text", ["BRAF NRAS KRAS", "TERT", "CDKN2A/B", "ALK ROS1 RET", "SINGAPORE",
                                  "ER PR HER2 STATUS", "MAY", "CD20 AND CD3"])
def test_all_caps_gene_lists_stay_code(text):
    t, llm = tr([])
    out = t.translate(one_run(text))
    assert out.flags == ["kept_code"] and llm.calls == []


def test_english_answer_that_only_lost_punctuation_is_unchanged(tmp_path):
    src = "Kidney, right, nephrectomy --- Oncocytoma with focal necrosis"
    lost = "Kidney, right, nephrectomy Oncocytoma with focal necrosis"
    tm = TM(tmp_path / "tm.sqlite")
    t, llm = tr([lost, lost], tm=tm)
    out = t.translate(one_run(src))
    assert len(llm.calls) == 2 and "unchanged" in out.flags


@pytest.mark.parametrize("text", ["Smith et al. J Clin Pathol 2001; 54:120-125",
                                  "Nguyen A et al. Mod Pathol. 2019.",
                                  "Brown et al. (Am J Surg Pathol 2010)",
                                  "Histopathology. 2021 May;79(2):100-110.",
                                  "Garcia L et al. examplejournal.org 2018:",
                                  "Example J. 2024 Mar 2;16(3):e51234."])
def test_citation_only_segments_are_kept_without_a_call(text):
    t, llm = tr([])
    s = one_run(text)
    out = t.translate(s)
    assert (out.text, out.level, out.flags, llm.calls) == (s.tagged, 0, ["kept_reference"], [])


@pytest.mark.parametrize("text", ["Conclusion from Smith et al. (2017):",
                                  "Benign (Am J Pathol 1981)",
                                  "Results for ER agree with Smith et al. Example J Pathol 2000; 61: 101-108."])
def test_sentences_with_a_citation_are_translated(text):
    llm = FakeLLM(fn=lambda system, user: "K\u1ebft qu\u1ea3 ER")
    out = Translator(llm, "SYS", "m", "p@1").translate(one_run(text))
    assert len(llm.calls) >= 1 and "kept_reference" not in out.flags


def test_dropped_acronym_gets_one_retry_naming_it(tmp_path):
    t, llm = tr(["Th\u1ec3 t\u1ebf b\u00e0o s\u00e1ng", "Th\u1ec3 t\u1ebf b\u00e0o s\u00e1ng (CCRCC)"])
    out = t.translate(one_run("Clear cell type (CCRCC)"), **CONTEXT)
    assert (out.level, out.text, out.flags, len(llm.calls)) == (2, "Th\u1ec3 t\u1ebf b\u00e0o s\u00e1ng (CCRCC)",
                                                                 ["retried:gate"], 2)
    note = llm.calls[1][1]
    assert "CCRCC" in note and "Previous paragraph" not in note


def test_retry_that_does_not_recover_the_acronym_keeps_the_first_answer():
    first, second = "Th\u1ec3 t\u1ebf b\u00e0o s\u00e1ng", "Ki\u1ec3m so\u00e1t kh\u00e1c"
    t, llm = tr([first, second])
    out = t.translate(one_run("Clear cell type (CCRCC)"))
    assert len(llm.calls) == 2 and out.text == first and out.level == 0
    assert "retried:gate" in out.flags and "acronym_lost:CCRCC" in out.flags


def test_acronym_still_missing_after_the_retry_is_flagged():
    t, llm = tr(["Th\u1ec3 t\u1ebf b\u00e0o s\u00e1ng", "Th\u1ec3 t\u1ebf b\u00e0o s\u00e1ng"])
    out = t.translate(one_run("Clear cell type (CCRCC)"))
    assert len(llm.calls) == 2 and "acronym_lost:CCRCC" in out.flags


@pytest.mark.parametrize("text", ["Negative staining", "trastuzumab", "Left", "No"])
def test_word_cells_are_translated(text):
    t, llm = tr(["C\u00f3"])
    out = t.translate(one_run(text))
    assert len(llm.calls) == 1 and "kept_code" not in out.flags


def test_strip_leaks_preface_label_and_fences():
    assert strip_leaks("Text", "Translate:\nV\u0103n b\u1ea3n") == "V\u0103n b\u1ea3n"
    assert strip_leaks("Text", "Here is the Vietnamese translation:\n```\nV\u0103n b\u1ea3n\n```") == "V\u0103n b\u1ea3n"
    assert strip_leaks("Text", "B\u1ea3n d\u1ecbch ti\u1ebfng Vi\u1ec7t:\nV\u0103n b\u1ea3n") == "V\u0103n b\u1ea3n"
    assert strip_leaks("Text", "Vietnamese: V\u0103n b\u1ea3n") == "V\u0103n b\u1ea3n"
    assert strip_leaks("Use ``` fences", "```\nD\u00f9ng\n```") == "```\nD\u00f9ng\n```"  # the source's own fence stays
    t, llm = tr(["Translate:\n" + GOOD])
    out = t.translate(seg())
    assert (out.level, out.text, out.flags, len(llm.calls)) == (0, GOOD, [], 1)


def test_recheck_gives_the_check_flags_of_a_finished_text():
    t, _ = tr([])
    flags = t.recheck(seg(), GOOD.replace("1p", "2p"))
    assert "numbers_changed" in flags and set(f.split(":")[0] for f in flags) <= translate.CHECK_KINDS


TITLED_SRC = "Jane Doe, M.D., Ph.D., reviewed all the slides."
TITLED_VI = "\u0111\u00e3 xem l\u1ea1i t\u1ea5t c\u1ea3 ti\u00eau b\u1ea3n."


def test_title_order_is_fixed_flagged_and_listed_also_on_cache_hits(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    first = tr(["BS. TS. Jane Doe " + TITLED_VI], tm=tm)[0].translate(one_run(TITLED_SRC))
    assert first.text == "TS. BS. Jane Doe " + TITLED_VI and first.level == 0
    assert "term_fix:title-order" in first.flags
    assert first.fixes == [{"en": "title-order", "from": "BS. TS.", "to": "TS. BS."}]
    hit = tr([], tm=tm)[0].translate(one_run(TITLED_SRC))
    assert hit.cached and (hit.text, hit.flags, hit.fixes) == (first.text, first.flags, first.fixes)


def test_term_fixes_and_the_title_fix_are_listed_together():
    fixes = [TermFix("lung", "ph\u1ed5i", ["pulm\u00f4n"])]
    t, _ = tr(["BS TS Jane Doe: pulm\u00f4n v\u00e0 Pulm\u00f4n"], fixes=fixes)
    out = t.translate(one_run("Jane Doe, MD, PhD: lung and lung"))
    assert out.text == "TS. BS. Jane Doe: ph\u1ed5i v\u00e0 ph\u1ed5i"
    assert [f for f in out.flags if f.startswith("term_fix:")] == ["term_fix:lung", "term_fix:title-order"]
    assert out.fixes == [{"en": "lung", "from": "pulm\u00f4n", "to": "ph\u1ed5i"},
                         {"en": "lung", "from": "Pulm\u00f4n", "to": "ph\u1ed5i"},
                         {"en": "title-order", "from": "BS TS", "to": "TS. BS."}]


def test_segments_without_a_fix_list_none():
    assert tr([GOOD])[0].translate(seg()).fixes == []
    assert tr([])[0].translate(one_run("HER2 3+")).fixes == []  # kept as code, no model call


def test_words_of_the_active_packs_are_not_suspicious():
    answer = "Nhi\u1ec1u lymph\u00f4 b\u00e0o v\u00e0 carcin\u00f4m trong h\u1ea1ch"
    src = one_run("Many lymphocytes and a carcinoma in the node")
    flags = Translator(FakeLLM([answer]), "SYS", "m", "p@1", allowed=["lymph\u00f4"]).translate(src).flags
    assert "suspicious:carcin\u00f4m" in flags and not any("lymph" in f for f in flags)
    assert "suspicious:lymph\u00f4" in tr([answer])[0].translate(src).flags  # no pack: still strange
