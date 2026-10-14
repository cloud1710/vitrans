"""Which package parts carry translatable text, in reading order, and how to label them."""
import re

from .ns import P, q
from .rels import pptx_structure

_DOCX = [r"word/document\.xml", r"word/header(\d*)\.xml", r"word/footer(\d*)\.xml", r"word/footnotes\.xml",
         r"word/endnotes\.xml", r"word/diagrams/data(\d*)\.xml", r"word/diagrams/drawing(\d*)\.xml",
         r"word/charts/chart(\d*)\.xml"]
_DOCX_COMMENTS = r"word/comments\.xml"
_PPTX = [r"ppt/slides/slide(\d+)\.xml", r"ppt/diagrams/data(\d*)\.xml", r"ppt/diagrams/drawing(\d*)\.xml",
         r"ppt/charts/chart(\d*)\.xml", r"ppt/slideLayouts/slideLayout(\d+)\.xml",
         r"ppt/slideMasters/slideMaster(\d+)\.xml"]
_PPTX_NOTES = r"ppt/notesSlides/notesSlide(\d+)\.xml"

_LABELS = [
    (r"ppt/slides/slide(\d+)\.xml", "Slide {}"), (r"ppt/notesSlides/notesSlide(\d+)\.xml", "Notes {}"),
    (r"ppt/slideLayouts/slideLayout(\d+)\.xml", "Layout {}"), (r"ppt/slideMasters/slideMaster(\d+)\.xml", "Master {}"),
    (r".*/diagrams/(?:data|drawing)(\d*)\.xml", "SmartArt {}"), (r".*/charts/chart(\d*)\.xml", "Chart {}"),
    (r"word/document\.xml", "Body"), (r"word/header(\d*)\.xml", "Header {}"), (r"word/footer(\d*)\.xml", "Footer {}"),
    (r"word/footnotes\.xml", "Footnotes"), (r"word/endnotes\.xml", "Endnotes"), (r"word/comments\.xml", "Comments"),
]


def select_parts(pkg, notes=True, comments=False):
    if pkg.kind == "docx":
        patterns = list(_DOCX) + ([_DOCX_COMMENTS] if comments else [])
    else:
        patterns = list(_PPTX)
        if notes:
            patterns.insert(1, _PPTX_NOTES)
    names = pkg.names()
    struct = pptx_structure(pkg) if pkg.kind == "pptx" and hasattr(pkg, "raw") else None
    out = []
    for pat in patterns:
        hits = []
        for name in names:
            m = re.fullmatch(pat, name)
            if m:
                num = int(m.group(1)) if m.groups() and m.group(1) else 0
                if struct is not None:
                    if pat == _PPTX[0]:
                        if name not in struct["slide_no"]:
                            continue
                        num = struct["slide_no"][name]
                    elif pat == _PPTX_NOTES:
                        if name not in struct["notes_no"]:
                            continue
                        num = struct["notes_no"][name]
                    elif "slideLayout" in pat and name not in struct["used_layouts"]:
                        continue
                    elif "slideMaster" in pat and name not in struct["used_masters"]:
                        continue
                hits.append((num, name))
        out += [name for _, name in sorted(hits)]
    return out


def part_labels(pkg):
    """part name -> display label (real slide / notes numbers for pptx)."""
    labels = {name: location(name) for name in pkg.names()}
    if pkg.kind == "pptx" and hasattr(pkg, "raw"):
        struct = pptx_structure(pkg)
        for name, no in struct["slide_no"].items():
            labels[name] = "Slide %d" % no
        for name, no in struct["notes_no"].items():
            labels[name] = "Notes %d" % no
    return labels


def paragraph_kind(kind, part):
    """'w' for WordprocessingML paragraphs, 'a' for DrawingML paragraphs."""
    if kind == "docx" and "/diagrams/" not in part and "/charts/" not in part:
        return "w"
    return "a"


def location(part):
    for pat, label in _LABELS:
        m = re.fullmatch(pat, part)
        if m:
            num = m.group(1) if m.groups() else ""
            return label.format(num or "1").strip()
    return part


def keep_paragraph(part, p):
    """Layouts / masters: skip paragraphs of placeholder shapes (prompt text never shows in a slideshow)."""
    if "slideLayout" not in part and "slideMaster" not in part:
        return True
    el = p.getparent()
    while el is not None:
        if el.tag == q("p:sp"):
            return el.find("{%s}nvSpPr/{%s}nvPr/{%s}ph" % (P, P, P)) is None
        el = el.getparent()
    return True
