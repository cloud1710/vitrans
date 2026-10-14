from types import SimpleNamespace

from lxml import etree

from vitranslate.fit import fit_pptx
from vitranslate.ooxml.codec import encode
from vitranslate.ooxml.ns import local, q

SP = """<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:txBody><a:bodyPr><a:prstTxWarp prst="textNoShape"/><a:normAutofit fontScale="90000"/><a:extLst/></a:bodyPr>
  <a:p><a:r><a:rPr lang="en-US"/><a:t>Short English line</a:t></a:r></a:p></p:txBody></p:sp>"""

TBL = """<a:tbl xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:tr><a:tc><a:txBody><a:bodyPr/>
  <a:p><a:r><a:t>Marker</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl>"""


def pair(root, vi):
    p = next(root.iter(q("a:p")))
    item = SimpleNamespace(element=p, segment=encode(p), location="Slide 1")
    return item, SimpleNamespace(text=vi)


def test_scales_longer_vietnamese_and_keeps_schema_order():
    sp = etree.fromstring(SP)
    changes = fit_pptx([pair(sp, "M\u1ed9t d\u00f2ng ti\u1ebfng Vi\u1ec7t d\u00e0i h\u01a1n nhi\u1ec1u so v\u1edbi g\u1ed1c")])
    body_pr = next(sp.iter(q("a:bodyPr")))
    assert [local(c) for c in body_pr] == ["prstTxWarp", "normAutofit", "extLst"]
    scale = int(body_pr.find(q("a:normAutofit")).get("fontScale")) / 100000
    assert 0.5 <= scale < 0.9
    assert body_pr.get("wrap") == "square"
    assert changes and changes[0]["where"] == "Slide 1"


def test_no_change_when_not_longer():
    sp = etree.fromstring(SP)
    assert fit_pptx([pair(sp, "Ng\u1eafn")]) == []
    body_pr = next(sp.iter(q("a:bodyPr")))
    assert body_pr.find(q("a:normAutofit")).get("fontScale") == "90000"


def test_table_cells_reported_not_scaled():
    tbl = etree.fromstring(TBL)
    changes = fit_pptx([pair(tbl, "D\u1ea5u \u1ea5n mi\u1ec5n d\u1ecbch h\u1ecdc")])
    assert changes == [{"where": "Slide 1", "table_cell_longer": True}]
    assert next(tbl.iter(q("a:bodyPr"))).find(q("a:normAutofit")) is None


# ---- review round ----
NOWRAP = SP.replace('<a:bodyPr>', '<a:bodyPr wrap="none">').replace(
    '<a:normAutofit fontScale="90000"/>', '<a:spAutoFit/>')


def test_wrap_none_label_scaled_linearly_and_stays_one_line():
    sp = etree.fromstring(NOWRAP)
    changes = fit_pptx([pair(sp, "x" * 30)])
    body_pr = next(sp.iter(q("a:bodyPr")))
    assert body_pr.get("wrap") == "none"
    scale = int(body_pr.find(q("a:normAutofit")).get("fontScale")) / 100000
    assert abs(scale - 18 / 30) < 0.01
    assert changes[0]["scale"] == 0.6


def test_percent_font_scale_parsed():
    sp = etree.fromstring(SP.replace('fontScale="90000"', 'fontScale="62.5%"'))
    fit_pptx([pair(sp, "x" * 40)])
    body_pr = next(sp.iter(q("a:bodyPr")))
    scale = int(body_pr.find(q("a:normAutofit")).get("fontScale")) / 100000
    assert 0.5 <= scale < 0.625


def test_larger_line_spacing_reduction_kept():
    sp = etree.fromstring(SP.replace('fontScale="90000"', 'fontScale="90000" lnSpcReduction="20000"'))
    fit_pptx([pair(sp, "x" * 60)])
    body_pr = next(sp.iter(q("a:bodyPr")))
    assert body_pr.find(q("a:normAutofit")).get("lnSpcReduction") == "20000"
