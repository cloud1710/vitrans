import os

import pytest

from fixtures import make_pptx
from vitranslate.fonts import FontIndex, fix_fonts, vietnamese_chars
from vitranslate.ooxml.ns import q
from vitranslate.ooxml.package import OoxmlPackage

WIN_FONTS = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts")
pytestmark = pytest.mark.skipif(not os.path.isdir(WIN_FONTS), reason="needs Windows fonts")


@pytest.fixture(scope="module")
def index(tmp_path_factory):
    return FontIndex(tmp_path_factory.mktemp("fonts") / "index.json")


def test_vietnamese_chars_filter():
    assert vietnamese_chars("Ph\u1ed5i \u2264 5 mm \u2013 \u0111\u01b0\u1eddng") == {"\u1ed5", "\u0111", "\u01b0", "\u1edd"}


def test_coverage_and_class(index):
    assert index.covers("Arial", {"\u01a1", "\u1ec7"}) is True
    assert index.covers("No Such Font 123", {"\u01a1"}) is None
    assert index.classify("Times New Roman") == "serif"
    assert index.classify("Arial") == "sans"
    assert index.classify("Consolas") == "mono"


def test_fix_theme_font(index, tmp_path):
    if index.covers("Georgia", {"\u01a1"}) is not False:
        pytest.skip("Georgia not installed or already covers Vietnamese")
    pkg = OoxmlPackage(make_pptx(tmp_path / "a.pptx"))
    theme = pkg.root("ppt/theme/theme1.xml")
    major = next(theme.iter(q("a:majorFont"))).find(q("a:latin"))
    major.set("typeface", "Georgia")
    changes = fix_fonts(pkg, {"\u01a1"}, index)
    assert major.get("typeface") == "Times New Roman"
    assert "ppt/theme/theme1.xml" in pkg.dirty
    assert {"font": "Georgia", "action": "replaced", "to": "Times New Roman"}.items() <= changes[0].items()


# ---- review round: symbol fonts, part coverage, cache robustness ----
import shutil
import zipfile

from lxml import etree

from fixtures import make_docx

HORN_O = chr(0x1A1)


def _add_part(src, dst, name, xml):
    shutil.copy(src, dst)
    with zipfile.ZipFile(dst, "a") as z:
        z.writestr(name, xml)
    return dst


def test_symbol_font_never_replaced_pptx(index, tmp_path):
    pkg = OoxmlPackage(make_pptx(tmp_path / "s.pptx"))
    slide = pkg.root("ppt/slides/slide1.xml")
    r = next(slide.iter(q("a:r")))
    rpr = r.find(q("a:rPr"))
    if rpr is None:
        rpr = etree.Element(q("a:rPr"))
        r.insert(0, rpr)
    latin = etree.SubElement(rpr, q("a:latin"))
    latin.set("typeface", "Symbol")
    r.find(q("a:t")).text = chr(0xF061)
    changes = fix_fonts(pkg, {HORN_O}, index)
    assert latin.get("typeface") == "Symbol"
    assert not [c for c in changes if c["font"] == "Symbol" and c["action"] == "replaced"]


def test_symbol_font_never_replaced_docx(index, tmp_path):
    pkg = OoxmlPackage(make_docx(tmp_path / "s.docx"))
    doc = pkg.root("word/document.xml")
    r = next(doc.iter(q("w:r")))
    rpr = r.find(q("w:rPr"))
    if rpr is None:
        rpr = etree.Element(q("w:rPr"))
        r.insert(0, rpr)
    rf = etree.SubElement(rpr, q("w:rFonts"))
    rf.set(q("w:ascii"), "Symbol")
    rf.set(q("w:hAnsi"), "Wingdings")
    fix_fonts(pkg, {HORN_O}, index)
    assert rf.get(q("w:ascii")) == "Symbol"
    assert rf.get(q("w:hAnsi")) == "Wingdings"


def test_symbol_cmap_font_detected(index):
    if index.covers("Symbol", {"a"}) is None:
        pytest.skip("Symbol not installed")
    assert index.is_symbol("Symbol") is True
    assert index.is_symbol("Arial") is False


def test_diagram_part_fonts_fixed(index, tmp_path):
    if index.covers("Georgia", {HORN_O}) is not False:
        pytest.skip("Georgia not installed or already covers Vietnamese")
    xml = ('<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" '
           'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r>'
           '<a:rPr><a:latin typeface="Georgia"/></a:rPr><a:t>x</a:t></a:r></a:p></dgm:dataModel>')
    src = make_pptx(tmp_path / "a.pptx")
    dst = _add_part(src, tmp_path / "d.pptx", "ppt/diagrams/data1.xml", xml)
    pkg = OoxmlPackage(dst)
    changes = fix_fonts(pkg, {HORN_O}, index)
    assert "ppt/diagrams/data1.xml" in pkg.dirty
    hit = [c for c in changes if c["font"] == "Georgia"][0]
    assert hit["count"] >= 1 and "SmartArt 1" in hit["where"]


def test_nfc_input(index, tmp_path):
    if index.covers("Georgia", {HORN_O}) is not False:
        pytest.skip("Georgia not installed or already covers Vietnamese")
    pkg = OoxmlPackage(make_pptx(tmp_path / "n.pptx"))
    theme = pkg.root("ppt/theme/theme1.xml")
    major = next(theme.iter(q("a:majorFont"))).find(q("a:latin"))
    major.set("typeface", "Georgia")
    fix_fonts(pkg, ["o" + chr(0x31B) + chr(0x323)], index)  # decomposed o + horn + dot below
    assert major.get("typeface") == "Times New Roman"


def _font_dir(tmp_path, *names):
    d = tmp_path / "fd"
    d.mkdir(exist_ok=True)
    for n in names:
        shutil.copy(os.path.join(WIN_FONTS, n), d / n)
    return d


def test_corrupt_cache_rebuilds(tmp_path):
    d = _font_dir(tmp_path, "arial.ttf")
    cache = tmp_path / "c.json"
    FontIndex(cache, dirs=[str(d)])
    cache.write_text(cache.read_text(encoding="utf-8")[:20], encoding="utf-8")
    again = FontIndex(cache, dirs=[str(d)])
    assert again.covers("Arial", {HORN_O}) is True


def test_swapped_font_file_same_count_rebuilds(tmp_path):
    d = _font_dir(tmp_path, "arial.ttf")
    cache = tmp_path / "c.json"
    assert FontIndex(cache, dirs=[str(d)]).covers("Arial", {"a"}) is True
    shutil.copy(os.path.join(WIN_FONTS, "times.ttf"), d / "arial.ttf")
    swapped = FontIndex(cache, dirs=[str(d)])
    assert swapped.covers("Arial", {"a"}) is None
    assert swapped.covers("Times New Roman", {"a"}) is True


def test_missing_indexed_file_is_none_not_crash(tmp_path):
    d = _font_dir(tmp_path, "arial.ttf")
    idx = FontIndex(tmp_path / "c.json", dirs=[str(d)])
    (d / "arial.ttf").unlink()
    assert idx.covers("Arial", {"a"}) is None
    assert idx.classify("Arial") == "sans"


def test_relative_dirs_skipped_without_localappdata(monkeypatch):
    import importlib
    import vitranslate.fonts as fonts
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    try:
        importlib.reload(fonts)
        assert all(os.path.isabs(p) for p in fonts.FONT_DIRS)
    finally:
        monkeypatch.undo()
        importlib.reload(fonts)
