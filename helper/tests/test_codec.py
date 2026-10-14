import pytest
from lxml import etree

from describe import describe
from vitranslate.ooxml.codec import Skip, apply, encode
from vitranslate.ooxml.ns import A, W, XML, local, q

A_P = """<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:pPr algn="l"/>
  <a:r><a:rPr lang="en-US" sz="1800" dirty="0"/><a:t>In </a:t></a:r>
  <a:r><a:rPr lang="en-US" sz="1800" b="1" dirty="0"/><a:t>NF2-altered</a:t></a:r>
  <a:r><a:rPr lang="en-US" sz="1800" dirty="0"/><a:t> meningiomas, </a:t></a:r>
  <a:r><a:rPr lang="en-US" sz="2000"/><a:t>chromosome</a:t></a:r>
  <a:br><a:rPr lang="en-US"/></a:br>
  <a:r><a:rPr lang="en-US" sz="1800" i="1"/><a:t>1p loss</a:t></a:r>
  <a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>3</a:t></a:fld>
  <a:endParaRPr lang="en-US" sz="1800"/>
</a:p>"""

W_P = """<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
     xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
  <w:bookmarkStart w:id="0" w:name="_GoBack"/>
  <w:r w:rsidR="00A1"><w:rPr><w:lang w:val="en-US"/></w:rPr><w:t xml:space="preserve">See </w:t></w:r>
  <w:proofErr w:type="spellStart"/>
  <w:hyperlink r:id="rId5"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>the WHO site</w:t></w:r></w:hyperlink>
  <w:proofErr w:type="spellEnd"/>
  <w:r><w:t xml:space="preserve"> for </w:t></w:r>
  <w:r><w:rPr><w:b/></w:rPr><w:t>grading</w:t></w:r>
  <w:r><w:tab/><w:t>criteria</w:t></w:r>
  <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
  <w:r><w:t>4</w:t></w:r>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
  <w:bookmarkEnd w:id="0"/>
</w:p>"""

W_NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')
R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def el(xml):
    return etree.fromstring(xml)


def test_encode_drawingml():
    seg = encode(el(A_P))
    assert seg.kind == "a"
    assert seg.tagged == "In <g1>NF2-altered</g1> meningiomas, chromosome<x1/><g2>1p loss</g2><x2/>"
    assert seg.plain == "In NF2-altered meningiomas, chromosome1p loss"
    assert seg.dominant.rpr.get("sz") == "1800"


def test_encode_does_not_mutate():
    p = el(A_P)
    before = etree.tostring(p)
    encode(p)
    assert etree.tostring(p) == before


def test_identity_drawingml():
    p = el(A_P)
    before = describe(p)
    seg = encode(p)
    apply(p, seg, seg.tagged)
    assert describe(p) == before


def test_apply_translation_drawingml():
    p = el(A_P)
    seg = encode(p)
    apply(p, seg, "Trong c\u00e1c u m\u00e0ng n\u00e3o <g1>NF2-altered</g1>, m\u1ea5t<x1/><g2>1p</g2><x2/>")
    kids = [local(c) for c in p]
    assert kids == ["pPr", "r", "r", "r", "br", "r", "fld", "endParaRPr"]
    runs = p.findall(q("a:r"))
    assert [r.find(q("a:t")).text for r in runs] == [
        "Trong c\u00e1c u m\u00e0ng n\u00e3o ", "NF2-altered", ", m\u1ea5t", "1p"]
    assert runs[1].find(q("a:rPr")).get("b") == "1"
    assert runs[3].find(q("a:rPr")).get("i") == "1"
    assert all(r.find(q("a:rPr")).get("lang") == "vi-VN" for r in runs)
    assert p.find(q("a:endParaRPr")).get("lang") == "vi-VN"
    assert p.find(q("a:fld")).get("type") == "slidenum"


def test_identity_merges_runs_split_at_spaces():
    xml = ('<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
           '<a:r><a:rPr lang="en-US"/><a:t>Smith A. et al. </a:t></a:r>'
           '<a:r><a:rPr lang="en-US" i="1"/><a:t>J Clin</a:t></a:r>'
           '<a:r><a:rPr lang="en-US" i="1" err="1"/><a:t> </a:t></a:r>'
           '<a:r><a:rPr lang="en-US" i="1"/><a:t>Pathol</a:t></a:r></a:p>')
    p = el(xml)
    before = describe(p)
    seg = encode(p)
    assert seg.tagged == "Smith A. et al. <g1>J Clin Pathol</g1>"
    apply(p, seg, seg.tagged)
    assert describe(p) == before


def test_symbol_font_runs_keep_their_font():
    # Real deck: "alpha-synuclein" with the alpha typed as U+F061 in the Symbol font (a glyph code, not text).
    xml = ('<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
           '<a:r><a:rPr lang="en-US"><a:latin typeface="Symbol" pitchFamily="18" charset="2"/></a:rPr>'
           '<a:t>\uf061</a:t></a:r>'
           '<a:r><a:rPr lang="en-US"><a:latin typeface="Arial"/></a:rPr><a:t>-synuclein immunoreactivity</a:t></a:r>'
           '</a:p>')
    p = el(xml)
    seg = encode(p)
    assert seg.tagged == "<g1>\uf061</g1>-synuclein immunoreactivity"
    apply(p, seg, "Ph\u1ea3n \u1ee9ng mi\u1ec5n d\u1ecbch <g1>\uf061</g1>-synuclein")
    fonts = [(r.find(q("a:t")).text, r.find(q("a:rPr")).find(q("a:latin")).get("typeface"))
             for r in p.findall(q("a:r"))]
    assert fonts == [("Ph\u1ea3n \u1ee9ng mi\u1ec5n d\u1ecbch ", "Arial"), ("\uf061", "Symbol"),
                     ("-synuclein", "Arial")]
    w = encode(el('<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                  '<w:r><w:t>A</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>'
                  '<w:t>\uf062</w:t></w:r><w:r><w:t xml:space="preserve"> amyloid plaque</w:t></w:r></w:p>'))
    assert w.tagged == "A<g1>\uf062</g1> amyloid plaque"
    # a:sym (Wingdings) sticks to runs typed after an inserted arrow; it only matters for U+F000-U+F0FF characters
    xml = ('<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
           '<a:r><a:rPr lang="en-US"><a:sym typeface="Wingdings"/></a:rPr><a:t>\uf0e8 </a:t></a:r>'
           '<a:r><a:rPr lang="en-US"><a:sym typeface="Wingdings"/></a:rPr><a:t>Lateral neck LNs</a:t></a:r>'
           '<a:r><a:rPr lang="en-US"/><a:t> (14.6%)</a:t></a:r></a:p>')
    p = el(xml)
    before = describe(p)
    seg = encode(p)
    assert seg.tagged == "<g1>\uf0e8 </g1>Lateral neck LNs (14.6%)"
    apply(p, seg, seg.tagged)
    assert describe(p) == before


def test_encode_wordprocessingml():
    seg = encode(el(W_P))
    assert seg.kind == "w"
    assert seg.tagged == "See <g1>the WHO site</g1> for <g2>grading</g2><x1/>criteria<g3>1</g3><x2/>"
    assert local(seg.spans[1].container) == "hyperlink"


def test_identity_wordprocessingml():
    p = el(W_P)
    before = describe(p)
    seg = encode(p)
    apply(p, seg, seg.tagged)
    assert describe(p) == before


def test_apply_translation_wordprocessingml():
    p = el(W_P)
    seg = encode(p)
    apply(p, seg, "Xem <g2>ph\u00e2n \u0111\u1ed9</g2> t\u1ea1i <g1>trang WHO</g1><x1/>ti\u00eau ch\u00ed<g3>1</g3><x2/>")
    kids = [local(c) for c in p]
    assert kids[0] == "pPr" and kids[1] == "bookmarkStart" and kids[-1] == "bookmarkEnd"
    link = p.find(q("w:hyperlink"))
    assert link.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id") == "rId5"
    assert link.find(q("w:r")).find(q("w:t")).text == "trang WHO"
    instr = p.findall(".//" + q("w:instrText"))
    assert len(instr) == 1 and instr[0].text == " PAGE "
    texts = [t for t in p.iter(q("w:t"))]
    assert all(t.get("{%s}space" % XML) == "preserve" for t in texts if t.text != "4")
    for r in p.iter(q("w:r")):
        if r.find(q("w:t")) is not None and r.find(q("w:t")).text != "4":
            assert r.find(q("w:rPr")).find(q("w:lang")).get(q("w:val")) == "vi-VN"


def test_tracked_changes_skip():
    xml = ('<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
           '<w:ins w:id="1" w:author="a"><w:r><w:t>new</w:t></w:r></w:ins></w:p>')
    with pytest.raises(Skip):
        encode(el(xml))


def test_lang_order_and_hint():
    xml = ('<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:rPr>'
           '<w:rFonts w:hint="eastAsia"/><w:b/><w:eastAsianLayout w:id="1"/></w:rPr><w:t>Text</w:t></w:r></w:p>')
    p = el(xml)
    seg = encode(p)
    apply(p, seg, "V\u0103n b\u1ea3n")
    rpr = p.find(q("w:r")).find(q("w:rPr"))
    assert [local(c) for c in rpr] == ["rFonts", "b", "lang", "eastAsianLayout"]
    assert rpr.find(q("w:rFonts")).get(q("w:hint")) is None


def test_lang_goes_before_extension_elements():
    xml = ('<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
           'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:r><w:rPr>'
           '<w:b/><w14:ligatures w14:val="standardContextual"/></w:rPr><w:t>Text</w:t></w:r></w:p>')
    p = el(xml)
    apply(p, encode(p), "V\u0103n b\u1ea3n")
    rpr = p.find(q("w:r")).find(q("w:rPr"))
    assert [local(c) for c in rpr] == ["b", "lang", "ligatures"]


def test_no_text_returns_none():
    xml = '<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:endParaRPr/></a:p>'
    assert encode(el(xml)) is None


def test_reduced_keeps_only_selected_spans():
    seg = encode(el(A_P))
    red = seg.reduced(lambda span: span.rpr.get("i") == "1")
    assert red.tagged == "In NF2-altered meningiomas, chromosome<x1/><g2>1p loss</g2><x2/>"
    assert list(red.spans) == [2]
    p = el(A_P)
    seg2 = encode(p)
    red2 = seg2.reduced(lambda span: span.rpr.get("i") == "1")
    apply(p, red2, "Trong NF2-altered<x1/><g2>1p</g2><x2/>")
    assert [r.find(q("a:t")).text for r in p.findall(q("a:r"))] == ["Trong NF2-altered", "1p"]


def test_control_chars_and_nfc():
    p = el(A_P)
    seg = encode(p)
    decomposed = "ma\u0300ng"  # NFD
    apply(p, seg, "A\vB " + decomposed + " <g1>x</g1><x1/><g2>y</g2><x2/>")
    first = p.find(q("a:r")).find(q("a:t")).text
    assert first == "A B m\u00e0ng "


def test_lone_carriage_return_becomes_space():
    p = el(A_P)
    seg = encode(p)
    apply(p, seg, "A\rB <g1>x</g1><x1/><g2>y</g2><x2/>")
    assert p.find(q("a:r")).find(q("a:t")).text == "A B "


def test_apply_never_drops_fixed_elements():
    p = el(A_P)
    seg = encode(p)
    # x1 twice, x2 missing, x9 unknown: every original fixed element must still be there exactly once
    apply(p, seg, "A<x1/> <g1>b</g1><x1/><x9/> <g2>c</g2>")
    kids = [local(c) for c in p]
    assert kids.count("br") == 1 and kids.count("fld") == 1
    assert kids[-2:] == ["fld", "endParaRPr"]
    assert p.find(q("a:fld")).get("type") == "slidenum"


HYPERLINKED_IMAGES = (
    '<w:p %s><w:r><w:t xml:space="preserve">Visit our </w:t></w:r>'
    '<w:hyperlink r:id="rId9"><w:r><w:rPr><w:noProof/></w:rPr><w:drawing/></w:r><w:r><w:t>website</w:t></w:r>'
    '</w:hyperlink><w:r><w:t xml:space="preserve"> or </w:t></w:r>'
    '<w:hyperlink r:id="rId8"><w:r><w:drawing/></w:r></w:hyperlink></w:p>') % W_NS


def test_identity_keeps_images_inside_links():
    p = el(HYPERLINKED_IMAGES)
    before = describe(p)
    seg = encode(p)
    assert seg.tagged == "Visit our <x1/><g1>website</g1> or <x2/>"
    apply(p, seg, seg.tagged)
    assert describe(p) == before


def test_apply_keeps_images_inside_links():
    p = el(HYPERLINKED_IMAGES)
    seg = encode(p)
    apply(p, seg, "Xem <x1/><g1>trang web</g1> ho\u1eb7c <x2/>")
    links = p.findall(q("w:hyperlink"))
    assert [h.get(R_ID) for h in links] == ["rId9", "rId8"]
    assert "".join(t.text for t in links[0].iter(q("w:t"))) == "trang web"
    drawings = p.findall(".//" + q("w:drawing"))
    assert len(drawings) == 2
    assert [d.getparent().getparent() for d in drawings] == links


def test_identity_smarttag_and_comment_range():
    xml = ('<w:p %s><w:r><w:t xml:space="preserve">Grade </w:t></w:r>'
           '<w:commentRangeStart w:id="3"/>'
           '<w:smartTag w:uri="urn:x" w:element="place"><w:smartTagPr><w:attr w:name="a" w:val="b"/>'
           '</w:smartTagPr><w:r><w:rPr><w:b/></w:rPr><w:t>Hanoi</w:t></w:r></w:smartTag>'
           '<w:r><w:tab/><w:t>tumour</w:t></w:r>'
           '<w:commentRangeEnd w:id="3"/>'
           '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="3"/></w:r>'
           '</w:p>') % W_NS
    p = el(xml)
    before = describe(p)
    seg = encode(p)
    assert seg.tagged == "Grade <g1>Hanoi</g1><x1/>tumour<x2/>"
    apply(p, seg, seg.tagged)
    assert describe(p) == before
    kids = [local(c) for c in p]
    assert kids[0] == "commentRangeStart" and kids[-1] == "commentRangeEnd"
    assert len(p.findall(".//" + q("w:commentReference"))) == 1


# ---------------------------------------------------------------- review fixes

A_HEAD = '<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
W_HEAD = '<w:p %s>' % W_NS


def test_describe_detects_a_moved_placeholder():
    p = el(A_P)
    before = describe(p)
    seg = encode(p)
    apply(p, seg, "In <g1>NF2-altered</g1> meningiomas, chromosome<g2>1p loss</g2><x1/><x2/>")
    assert describe(p) != before
    p = el(W_P)
    before = describe(p)
    seg = encode(p)
    apply(p, seg, "See <g1>the WHO site</g1> for <x1/><g2>grading</g2>criteria<g3>1</g3><x2/>")
    assert describe(p) != before


def test_xml_illegal_characters_are_stripped():
    p = el(A_P)
    seg = encode(p)
    junk = "A" + chr(0xFFFE) + "B" + chr(0xD800) + "C" + chr(0xFFFF) + " "
    apply(p, seg, junk + "<g1>x</g1><x1/><g2>y</g2><x2/>")
    assert p.find(q("a:r")).find(q("a:t")).text == "ABC "


def test_c0_controls_are_stripped():
    p = el(A_P)
    seg = encode(p)
    apply(p, seg, "A\x01B\x08C\x0cD\x1fE\x00 <g1>x</g1><x1/><g2>y</g2><x2/>")
    assert p.find(q("a:r")).find(q("a:t")).text == "ABCDE "


def test_apply_is_exception_safe(monkeypatch):
    from vitranslate.ooxml import codec
    monkeypatch.setattr(codec, "_clean", lambda text: text)
    for xml in (A_P, W_P):
        p = el(xml)
        before = etree.tostring(p)
        seg = encode(p)
        with pytest.raises(ValueError):
            apply(p, seg, seg.tagged.replace("</g1>", chr(0xFFFE) + "</g1>"))
        assert etree.tostring(p) == before


def test_apply_adds_no_namespace_declarations():
    for xml in (A_P, W_P, HYPERLINKED_IMAGES):
        p = el(xml)
        seg = encode(p)
        apply(p, seg, seg.tagged)
        out = etree.tostring(p).decode("ascii")
        assert out.count("xmlns") == out[:out.index(">")].count("xmlns")


def test_apply_reports_placeholder_fixes():
    p = el(A_P)
    seg = encode(p)
    assert apply(p, seg, seg.tagged) == []
    p = el(A_P)
    seg = encode(p)
    fixes = apply(p, seg, "A<x1/> <g1>b</g1><x1/><x9/> <g7>c</g7> <g2>d</g2>")
    assert fixes == ["x_duplicate:1", "x_unknown:9", "x_missing:2", "g_unknown:7"]


def test_duplicate_placeholder_first_one_wins():
    p = el(A_P)
    seg = encode(p)
    apply(p, seg, "A<x1/>B<x1/>C <g1>b</g1><g2>c</g2><x2/>")
    br = p.find(q("a:br"))
    assert br.getprevious().find(q("a:t")).text == "A" and br.getnext().find(q("a:t")).text == "B"


def test_whitespace_only_span_folds_into_dominant():
    p = el(A_HEAD + '<a:r><a:rPr lang="en-US"/><a:t>Hello</a:t></a:r>'
           '<a:r><a:rPr lang="en-US" u="sng"/><a:t> </a:t></a:r>'
           '<a:r><a:rPr lang="en-US"/><a:t>world</a:t></a:r></a:p>')
    seg = encode(p)
    assert seg.tagged == "Hello world" and not seg.spans
    apply(p, seg, seg.tagged)
    runs = p.findall(q("a:r"))
    assert len(runs) == 1 and runs[0].find(q("a:rPr")).get("u") is None
    w = encode(el(W_HEAD + '<w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t></w:r>'
                  '<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r>'
                  '<w:r><w:t>long dominant text</w:t></w:r></w:p>'))
    assert w.tagged == "<g1>a</g1> long dominant text"


def test_whitespace_between_one_format_joins_its_span():
    p = el(A_HEAD + '<a:r><a:rPr lang="en-US"/><a:t>Results of the study: </a:t></a:r>'
           '<a:r><a:rPr lang="en-US" u="sng"/><a:t>a</a:t></a:r>'
           '<a:r><a:rPr lang="en-US" b="1"/><a:t> </a:t></a:r>'
           '<a:r><a:rPr lang="en-US" u="sng"/><a:t>b</a:t></a:r></a:p>')
    before = describe(p)
    seg = encode(p)
    assert seg.tagged == "Results of the study: <g1>a b</g1>"
    apply(p, seg, seg.tagged)
    assert describe(p) == before


def test_font_size_and_name_differences_fold():
    a = encode(el(A_HEAD + '<a:r><a:rPr lang="en-US" sz="1800"><a:latin typeface="Arial"/></a:rPr>'
                  '<a:t>Tumour </a:t></a:r><a:r><a:rPr lang="en-US" sz="2400"><a:latin typeface="Calibri"/>'
                  '</a:rPr><a:t>cells</a:t></a:r></a:p>'))
    assert a.tagged == "Tumour cells"
    w = encode(el(W_HEAD + '<w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="24"/></w:rPr>'
                  '<w:t xml:space="preserve">Tumour </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Times New Roman"/>'
                  '<w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>cells</w:t></w:r></w:p>'))
    assert w.tagged == "Tumour cells"


def _run(text, attrs=""):
    return '<a:r><a:rPr lang="en-US"%s/><a:t>%s</a:t></a:r>' % (attrs, text)


def test_character_spacing_differences_fold():
    # Real decks condense single words by 0.1-0.5 pt (spc="-10".."-50"): one tag per such word (up to 21 in one
    # paragraph) made the model drop or empty the tags. Spacing folds like size and font; bold / italic still tag.
    a = encode(el(A_HEAD + _run("Spindle cell ") + _run("lesion", ' spc="-10"') + _run(" with ")
                  + _run("myxoid", ' spc="-20"') + _run(" stroma ") + _run("(SCL-", ' spc="-35"')
                  + _run("MS)", ' spc="-20"') + '</a:p>'))
    assert a.tagged == "Spindle cell lesion with myxoid stroma (SCL-MS)" and not a.spans
    b = encode(el(A_HEAD + _run("Grade ", ' b="1"') + _run("2", ' b="1" spc="-25"') + '</a:p>'))
    assert b.tagged == "Grade 2" and not b.spans
    i = encode(el(A_HEAD + _run("Loss of ", ' spc="-10"') + _run("ABC1", ' i="1" spc="-45"')
                  + _run("-mutated", ' spc="-45"') + _run(" cells") + '</a:p>'))
    assert i.tagged == "Loss of <g1>ABC1</g1>-mutated cells" and i.spans[1].rpr.get("i") == "1"


def test_complex_script_bold_italic_do_not_tag():
    w = encode(el(W_HEAD + '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>Bold</w:t></w:r>'
                  '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> words</w:t></w:r>'
                  '<w:r><w:rPr><w:iCs/></w:rPr><w:t xml:space="preserve"> and plain text here</w:t></w:r></w:p>'))
    assert w.tagged == "<g1>Bold words</g1> and plain text here"


def test_split_hyperlink_is_cloned():
    p = el(W_HEAD + '<w:r><w:t xml:space="preserve">Read the </w:t></w:r>'
           '<w:hyperlink r:id="rId5"><w:r><w:rPr><w:b/></w:rPr><w:t>WHO</w:t></w:r>'
           '<w:r><w:t xml:space="preserve"> classification site</w:t></w:r></w:hyperlink>'
           '<w:r><w:t xml:space="preserve"> now and then again</w:t></w:r></w:p>')
    seg = encode(p)
    assert seg.tagged == "Read the <g1>WHO</g1><g2> classification site</g2> now and then again"
    apply(p, seg, "Doc <g2>trang phan loai</g2> cua <g1>WHO</g1> ngay")
    links = p.findall(q("w:hyperlink"))
    assert [h.get(R_ID) for h in links] == ["rId5", "rId5"]
    assert ["".join(t.text for t in h.iter(q("w:t"))) for h in links] == ["trang phan loai", "WHO"]
    assert links[1].find(q("w:r")).find(q("w:rPr")).find(q("w:b")) is not None


def test_last_rendered_page_break_is_dropped():
    p = el(W_HEAD + '<w:r><w:lastRenderedPageBreak/><w:t>Second page text</w:t></w:r></w:p>')
    seg = encode(p)
    assert seg.tagged == "Second page text" and not seg.fixed
    apply(p, seg, "Trang hai")
    assert p.find(".//" + q("w:lastRenderedPageBreak")) is None


@pytest.mark.parametrize("tracked", [
    '<w:del w:id="1" w:author="a"><w:r><w:delText>old</w:delText></w:r></w:del>',
    '<w:moveFrom w:id="2" w:author="a"><w:r><w:t>moved</w:t></w:r></w:moveFrom>',
    '<w:moveFromRangeEnd w:id="3"/>',
    '<w:moveToRangeEnd w:id="4"/>'])
def test_tracked_changes_skip_all_kinds(tracked):
    with pytest.raises(Skip):
        encode(el(W_HEAD + '<w:r><w:t>Text</w:t></w:r>' + tracked + '</w:p>'))


def test_paragraph_mark_language():
    p = el('<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
           'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:pPr><w:rPr><w:b/>'
           '<w14:ligatures w14:val="all"/></w:rPr></w:pPr><w:r><w:t>Text</w:t></w:r></w:p>')
    apply(p, encode(p), "Van ban")
    mark = p.find(q("w:pPr")).find(q("w:rPr"))
    assert [local(c) for c in mark] == ["b", "lang", "ligatures"]
    assert mark.find(q("w:lang")).get(q("w:val")) == "vi-VN"
    p = el(W_HEAD + '<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Text</w:t></w:r></w:p>')
    apply(p, encode(p), "Van ban")
    assert p.find(q("w:pPr")).find(q("w:rPr")) is None


def test_open_field_is_locked_not_lost():
    p = el(W_HEAD + '<w:r><w:t xml:space="preserve">Intro text </w:t></w:r>'
           '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
           '<w:r><w:instrText xml:space="preserve"> TOC </w:instrText></w:r>'
           '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Result text</w:t></w:r></w:p>')
    before = describe(p)
    seg = encode(p)
    assert seg.tagged == "Intro text <x1/>"
    assert seg.locked == ["Result text"]
    apply(p, seg, seg.tagged)
    assert describe(p) == before


def test_locked_text_in_content_control_and_fields():
    sdt = encode(el(W_HEAD + '<w:r><w:t xml:space="preserve">Date: </w:t></w:r><w:sdt><w:sdtPr/><w:sdtContent>'
                    '<w:r><w:t>Click here to enter a date</w:t></w:r></w:sdtContent></w:sdt></w:p>'))
    assert sdt.tagged == "Date: <x1/>" and sdt.locked == ["Click here to enter a date"]
    fld = encode(el(W_HEAD + '<w:r><w:t xml:space="preserve">See </w:t></w:r>'
                    '<w:fldSimple w:instr=" REF _Ref1 "><w:r><w:t>Table 1</w:t></w:r></w:fldSimple>'
                    '<w:r><w:t xml:space="preserve"> for details</w:t></w:r></w:p>'))
    assert fld.tagged == "See <x1/> for details" and fld.locked == ["Table 1"]
    assert encode(el(W_P)).locked == []  # page number "4": no letters, nothing left in English
    assert encode(el(A_P)).locked == []  # slide number "3"
    date = encode(el(A_HEAD + '<a:r><a:rPr lang="en-US"/><a:t>Updated </a:t></a:r>'
                     '<a:fld id="{1}" type="datetime8"><a:rPr lang="en-US"/><a:t>Tuesday, October 13</a:t></a:fld>'
                     '</a:p>'))
    assert date.locked == ["Tuesday, October 13"]
    assert date.reduced(lambda span: False).locked == ["Tuesday, October 13"]


def test_paragraph_with_only_locked_text_is_skipped():
    toc = (W_HEAD + '<w:hyperlink w:anchor="_Toc1" w:history="1">'
           '<w:r><w:t>Introduction</w:t></w:r><w:r><w:tab/></w:r>'
           '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
           '<w:r><w:instrText xml:space="preserve"> PAGEREF _Toc1 </w:instrText></w:r>'
           '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>3</w:t></w:r>'
           '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>')
    with pytest.raises(Skip, match="locked text"):
        encode(el(toc))


def test_text_box_in_drawing_is_not_locked():
    box = ('<w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>Box text</w:t></w:r></w:p>'
           '</w:txbxContent></w:drawing></w:r>')
    seg = encode(el(W_HEAD + '<w:r><w:t xml:space="preserve">Caption </w:t></w:r>' + box + '</w:p>'))
    assert seg.tagged == "Caption <x1/>" and seg.locked == []
    assert encode(el(W_HEAD + box + '</w:p>')) is None


def test_closed_field_then_text():
    seg = encode(el(W_HEAD + '<w:r><w:t xml:space="preserve">Visit </w:t></w:r>'
                    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
                    '<w:r><w:instrText xml:space="preserve"> HYPERLINK "https://www.who.int" </w:instrText></w:r>'
                    '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>the WHO website</w:t></w:r>'
                    '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
                    '<w:r><w:t xml:space="preserve"> today</w:t></w:r></w:p>'))
    assert seg.tagged == "Visit <x1/> today"
    assert seg.locked == ["the WHO website"]


def test_whitespace_does_not_join_a_span_across_a_fixed_element():
    seg = encode(el(W_HEAD + '<w:r><w:t xml:space="preserve">Grades of the tumour: </w:t></w:r>'
                    '<w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t></w:r><w:r><w:tab/></w:r>'
                    '<w:r><w:t xml:space="preserve"> </w:t></w:r>'
                    '<w:r><w:rPr><w:b/></w:rPr><w:t>b</w:t></w:r></w:p>'))
    assert seg.tagged == "Grades of the tumour: <g1>a</g1><x1/> <g2>b</g2>"


def test_encode_is_linear_in_blank_runs():
    import time
    blank = '<a:r><a:rPr lang="en-US" u="sng"/><a:t> </a:t></a:r>'
    word = '<a:r><a:rPr lang="en-US"/><a:t>w</a:t></a:r>'
    p = el(A_HEAD + word + blank * 10000 + (word + blank) * 5000 + word + '</a:p>')
    start = time.perf_counter()
    seg = encode(p)
    elapsed = time.perf_counter() - start
    assert seg.plain == "w" + " " * 10000 + "w " * 5000 + "w"
    assert elapsed < 2.0, elapsed
