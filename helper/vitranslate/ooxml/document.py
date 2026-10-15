"""Package -> ordered list of paragraph items, each with a Segment or a skip reason."""
import re
import unicodedata
from dataclasses import dataclass

from .codec import Skip, encode
from .ns import q
from .parts import keep_paragraph, location, paragraph_kind, part_labels, select_parts

STOP_HEADINGS = {"references", "reference", "reference list", "key references", "selected references",
                 "bibliography", "literature cited", "works cited", "further reading", "suggested reading",
                 "tai lieu tham khao", "t\u00e0i li\u1ec7u tham kh\u1ea3o"}
_NUMBERING = re.compile(r"^\d+(?:\.\d+)*[.)]\s*")  # "19. ", "3) ", "4.2. "
_HAS_WORD = re.compile(r"[A-Za-z]{2,}")
_TITLE_TYPES = {"title", "ctrTitle"}
_HEADING_N = re.compile(r"heading\s*(\d+)")  # style id "Heading2" / "heading 2"
_UNKNOWN = -1  # heading-like style id without a level
_DEEPEST = 8   # last heading outline level (w:outlineLvl 9 means body text)


@dataclass
class Item:
    part: str
    index: int
    location: str
    element: object
    segment: object = None
    skip: str = ""
    text: str = ""  # the paragraph's own text, also for skipped paragraphs (reports)


def _text(p, kind):
    """Own text of p: text of a nested paragraph (a text box inside a w:p) belongs to that paragraph."""
    tag, ptag = (q("w:t"), q("w:p")) if kind == "w" else (q("a:t"), q("a:p"))
    out = []
    for t in p.iter(tag):
        anc = t.getparent()
        while anc is not p and anc.tag != ptag:
            anc = anc.getparent()
        if anc is p:
            out.append(t.text or "")
    return "".join(out)


def is_stop_heading(text):
    t = " ".join(unicodedata.normalize("NFC", text).lower().split())
    t = _NUMBERING.sub("", t, count=1)
    return t.rstrip(":").strip() in STOP_HEADINGS


# The section titles of the back matter that follows a reference list (his report 2026-10-15: "dich phu luc, chi ko
# dich tai lieu tham khao"): optional numbering ("7.", "A.", "IV)"), the title, an optional number / letter ("A",
# "2", "S1", "II"), then nothing, a colon, or a separator and the rest of a short title.
_BACK_MATTER = re.compile(
    r"(?:(?:\d+(?:\.\d+)*|[a-z]|[ivxlc]+)[.)]\s*)?"
    r"(?:appendix|appendices|annex(?:es)?"
    r"|supplementary(?:\s+(?:materials?|data|information|methods|figures?|tables?))?"
    r"|supporting\s+information|online\s+resources?|acknowledge?ments?|abbreviations?|glossary"
    r"|figure\s+legends?|tables?|authors?\s+contributions?|author's\s+contributions?|funding"
    r"|conflicts?\s+of\s+interests?|competing\s+interests?|data\s+availability(?:\s+statement)?"
    r"|about\s+the\s+authors?|phu\s+luc)"
    r"(?:\s+(?:[a-z]?\d+(?:\.\d+)*|[a-z]|[ivx]+))?"
    r"(?P<rest>\s*[:.–—-]\s*.*)?")
_CITATION = re.compile(r"\b(?:19|20)\d\d\b|\bet al\b|\d\s*[;:(]\s*\d")


def _fold(text):
    """NFC lower case, white space squashed, diacritics dropped (d with stroke as d): "PHU LUC" with or without its
    marks reads the same."""
    t = " ".join(unicodedata.normalize("NFC", text).lower().split())
    t = t.replace("đ", "d")
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def is_back_matter_heading(text):
    """A short paragraph (<= 8 words) that reads as the title of a back-matter section (Appendix, Supplementary
    material, Acknowledgements, Abbreviations, Funding, Phu luc ...); not one whose rest looks like a citation (a
    year, "et al", volume:page)."""
    if len(text.split()) > 8:
        return False
    m = _BACK_MATTER.fullmatch(_fold(text))
    return m is not None and not (m.group("rest") and _CITATION.search(m.group("rest")))


def _non_latin(text):
    """A letter outside the Latin and Greek scripts (CJK, Thai, Cyrillic...). Greek is notation here (34betaE12);
    NFKC first folds letter-like symbols (micro sign, angstrom sign) into their script, and modifier letters
    (category Lm, such as the prime in 3') are marks, not words."""
    return any(c.isalpha() and unicodedata.category(c) != "Lm"
               and not unicodedata.name(c, "").startswith(("LATIN", "GREEK"))
               for c in unicodedata.normalize("NFKC", text))


def _ancestor(el, tag):
    el = el.getparent()
    while el is not None and el.tag != tag:
        el = el.getparent()
    return el


def _is_title(p):
    sp = _ancestor(p, q("p:sp"))
    ph = sp.find("%s/%s/%s" % (q("p:nvSpPr"), q("p:nvPr"), q("p:ph"))) if sp is not None else None
    return ph is not None and ph.get("type") in _TITLE_TYPES


def _references_slide(paras, texts):
    """A titled slide (title / ctrTitle placeholder with text) stops only on its title: a "References:" footnote may
    come first in shape order. An untitled slide stops on its first line of text (numbers such as a slide number are
    passed over), unless that line is a table cell ("Reference" is a common column header)."""
    titles = [t for p, t in zip(paras, texts) if t.strip() and _is_title(p)]
    if titles:
        return any(is_stop_heading(t) for t in titles)
    first = next((n for n, t in enumerate(texts) if any(c.isalpha() for c in t)), None)
    return first is not None and is_stop_heading(texts[first]) and _ancestor(paras[first], q("a:tbl")) is None


def _heading_level(p):
    """Outline level of a heading paragraph (0 = Title / Heading 1 ... 8), _UNKNOWN for a heading-like style id
    without a number, None for body text. A direct w:outlineLvl wins over the style, as in Word (9 = body text)."""
    ppr = p.find(q("w:pPr"))
    if ppr is None:
        return None
    outline = ppr.find(q("w:outlineLvl"))
    if outline is not None and (outline.get(q("w:val")) or "").isdigit():
        level = int(outline.get(q("w:val")))
        return level if level <= _DEEPEST else None
    style = ppr.find(q("w:pStyle"))
    name = (style.get(q("w:val")) or "").lower() if style is not None else ""
    if name == "title":
        return 0
    m = _HEADING_N.search(name)
    if m:
        return max(int(m.group(1)) - 1, 0)
    return _UNKNOWN if "heading" in name or "title" in name else None


def collect_items(pkg, notes=True, comments=False):
    items = []
    labels = part_labels(pkg)  # real slide / notes numbers from p:sldIdLst + rels
    for part in select_parts(pkg, notes=notes, comments=comments):
        kind = paragraph_kind(pkg.kind, part)
        root = pkg.root(part)
        paras = [p for p in root.iter(q("w:p") if kind == "w" else q("a:p")) if keep_paragraph(part, p)]
        texts = [_text(p, kind) for p in paras]
        refs_slide = pkg.kind == "pptx" and part.startswith("ppt/slides/") and _references_slide(paras, texts)
        # DOCX: only body-level paragraphs open or close the references region. A heading stop heading closes at the
        # next heading of the same or a higher level (sub-headings of the list stay inside); a heading-like style
        # without a level counts as the stop heading's level, and a stop heading without a level closes at any
        # heading. A plain paragraph stop heading runs to the end of the body. A back-matter title (Appendix,
        # Acknowledgements, Phu luc ...) always closes it, whatever its style or level.
        body = root.find(q("w:body")) if pkg.kind == "docx" and part == "word/document.xml" else None
        in_refs, close_at = False, None  # close_at: level that closes the region, None = never
        for i, (p, text) in enumerate(zip(paras, texts)):
            item = Item(part, i, labels.get(part) or location(part), p, text=text)
            if body is not None and p.getparent() is body:
                level = _heading_level(p)
                if in_refs and close_at is not None and level is not None:
                    in_refs = not (level == _UNKNOWN or level <= close_at)
                if in_refs and is_back_matter_heading(text):
                    in_refs = False
                if not in_refs and is_stop_heading(text):
                    in_refs = True
                    close_at = None if level is None else (_DEEPEST if level == _UNKNOWN else level)
            if refs_slide or in_refs:
                item.skip = "references"
            elif not _HAS_WORD.search(text):
                item.skip = "non_latin" if _non_latin(text) else "no_text"
            else:
                try:
                    item.segment = encode(p)
                    if item.segment is None:
                        item.skip = "no_text"
                except Skip as exc:
                    item.skip = str(exc)
            items.append(item)
    return items
