"""Paragraph <-> tagged segment codec for DrawingML (a:p) and WordprocessingML (w:p)."""
import copy
import re
import unicodedata
from dataclasses import dataclass, field

from lxml import etree

from ..tags import TOKEN_RE, ids, strip_tags
from .ns import A, W, XML, is_element, local, ns_of, q

# XML 1.0 forbids C0 controls other than tab / LF / CR (LF and CR become spaces first), surrogates, U+FFFE, U+FFFF.
_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f" + chr(0xD800) + "-" + chr(0xDFFF) + chr(0xFFFE) + chr(0xFFFF)
                      + "]")
# sz / spc (font size, character spacing) are typography, not emphasis: like font names they never make a tag
_A_IGNORE_ATTRS = {"lang", "altLang", "dirty", "err", "noProof", "smtClean", "smtId", "bmk", "sz", "spc", "kumimoji"}
_A_IGNORE_CHILDREN = {"latin", "ea", "cs", "sym"}
_W_IGNORE_CHILDREN = {"lang", "noProof", "sz", "szCs", "rFonts", "webHidden", "rPrChange", "kern", "bCs", "iCs"}
_W_ANCHOR_START = {"bookmarkStart", "commentRangeStart", "permStart"}
_W_ANCHOR_END = {"bookmarkEnd", "commentRangeEnd", "permEnd"}
_W_DROP = {"proofErr", "lastRenderedPageBreak"}
_W_TRACKED = {"ins", "del", "moveFrom", "moveTo", "moveFromRangeStart", "moveToRangeStart", "moveFromRangeEnd",
              "moveToRangeEnd"}
_W_UNWRAP = {"smartTag", "customXml"}
_W_LANG_BEFORE = {"eastAsianLayout", "specVanish", "oMath", "rPrChange"}
_SYMBOL_FONT_RE = re.compile(r"\s*(symbol|wingdings( [23])?|webdings|marlett|mt extra)\s*$", re.I)
_SYMBOL_AREA_RE = re.compile("[" + chr(0xF000) + "-" + chr(0xF0FF) + "]")
_P_TAGS = (q("w:p"), q("a:p"))
LOCKED_SKIP = "locked text: field or content control"


class Skip(Exception):
    """Paragraph cannot be translated safely (reason in the message)."""


@dataclass
class Span:
    rpr: object        # detached deep copy of a:rPr / w:rPr, or None
    container: object  # original w:hyperlink element, or None
    sig: str


@dataclass
class Fixed:
    elements: list            # original elements, re-inserted as they are
    wrap: bool = False        # True: put them into one new w:r (run-internal children such as w:tab)
    wrap_rpr: object = None   # rPr copy for that new run
    container: object = None  # original w:hyperlink the wrapped run belongs to, or None


@dataclass
class Segment:
    kind: str
    tagged: str
    dominant: Span
    spans: dict = field(default_factory=dict)
    fixed: dict = field(default_factory=dict)
    anchors_start: list = field(default_factory=list)
    anchors_end: list = field(default_factory=list)
    locked: list = field(default_factory=list)  # visible text inside fixed elements: it stays untranslated

    @property
    def plain(self):
        return strip_tags(self.tagged)

    def reduced(self, keep):
        """Copy without the tags of spans where keep(span) is False; their text joins the dominant run."""
        kept = {n: s for n, s in self.spans.items() if keep(s)}

        def sub(m):
            if m.group(3):
                return m.group(0)
            return m.group(0) if int(m.group(2)) in kept else ""

        return Segment(self.kind, TOKEN_RE.sub(sub, self.tagged), self.dominant, kept, self.fixed,
                       self.anchors_start, self.anchors_end, self.locked)


def _canon(el, ignore_attrs=(), ignore_children=(), top=True):
    if el is None:
        return ""
    attrs = ["%s=%s" % (etree.QName(k).localname, v) for k, v in sorted(el.attrib.items())
             if etree.QName(k).localname not in ignore_attrs]
    kids = [_canon(ch, top=False) for ch in el if is_element(ch) and local(ch) not in ignore_children]
    if top and not attrs and not kids:
        return ""
    return "(" + local(el) + " " + " ".join(attrs) + "".join(kids) + ")"


def _with_symbol_font(sig, rpr, children, attrs):
    """Font names are ignored, except symbol-encoded fonts: their characters are glyph codes (U+F061 = alpha in
    Symbol), so merging such a run into another font changes the text shown."""
    for ch in (rpr if rpr is not None else ()):
        if is_element(ch) and local(ch) in children:
            for name in attrs:
                if _SYMBOL_FONT_RE.match(ch.get(name) or ""):
                    return sig + "{font %s}" % ch.get(name)
    return sig


def a_sig(rpr, text=""):
    """a:latin / a:ea / a:cs set the font of every character; a:sym only that of U+F000-U+F0FF characters."""
    children = ("latin", "ea", "cs", "sym") if _SYMBOL_AREA_RE.search(text) else ("latin", "ea", "cs")
    return _with_symbol_font(_canon(rpr, _A_IGNORE_ATTRS, _A_IGNORE_CHILDREN), rpr, children, ("typeface",))


def w_sig(rpr, text=""):
    """`text` is unused (same call shape as a_sig): Word stores inserted symbols as w:sym, a fixed element."""
    return _with_symbol_font(_canon(rpr, (), _W_IGNORE_CHILDREN), rpr, ("rFonts",),
                             (q("w:ascii"), q("w:hAnsi")))


# ---------------------------------------------------------------- encode

def _a_atoms(p):
    atoms = []
    for ch in p:
        if is_element(ch) and ns_of(ch) == A and local(ch) in ("pPr", "endParaRPr"):
            continue
        if is_element(ch) and ns_of(ch) == A and local(ch) == "r":
            text = "".join(t.text or "" for t in ch.findall(q("a:t")))
            if text:
                atoms.append(("t", text, ch.find(q("a:rPr")), None))
            continue
        atoms.append(("x", Fixed([ch])))
    return atoms, [], []


def _w_atoms(p):
    atoms, starts, ends = [], [], []
    state = {"field": None, "depth": 0}

    def run_atoms(r, container):
        rpr = r.find(q("w:rPr"))
        buf = []

        def flush():
            if buf:
                atoms.append(("t", "".join(buf), rpr, container))
                buf.clear()

        for k in r:
            n = local(k)
            if n == "rPr" or n in _W_DROP or not is_element(k):
                continue
            if n == "t":
                buf.append(k.text or "")
                continue
            flush()
            atoms.append(("x", Fixed([k], wrap=True, wrap_rpr=copy.deepcopy(rpr) if rpr is not None else None,
                                     container=container)))
        flush()

    def walk(children, container):
        for ch in children:
            if not is_element(ch) or ns_of(ch) != W:
                if state["field"] is not None:
                    state["field"].append(ch)
                else:
                    atoms.append(("x", Fixed([ch])))
                continue
            n = local(ch)
            if n == "pPr" or n in _W_DROP:
                continue
            if n in _W_TRACKED:
                raise Skip("tracked changes")
            if state["field"] is not None and n != "r":
                state["field"].append(ch)
                continue
            if n in _W_ANCHOR_START:
                starts.append(ch)
            elif n in _W_ANCHOR_END:
                ends.append(ch)
            elif n in _W_UNWRAP:
                walk([k for k in ch if local(k) not in ("smartTagPr", "customXmlPr")], container)
            elif n == "hyperlink":
                kids = [k for k in ch if is_element(k)]
                if container is None and all(local(k) in ("r", "proofErr") for k in kids) and not any(
                        k.find(q("w:fldChar")) is not None for k in kids):
                    walk(kids, ch)
                else:
                    atoms.append(("x", Fixed([ch])))
            elif n == "r":
                types = [f.get(q("w:fldCharType")) for f in ch.findall(q("w:fldChar"))]
                if state["field"] is not None or "begin" in types:
                    if state["field"] is None:
                        state["field"] = []
                    state["field"].append(ch)
                    state["depth"] += types.count("begin") - types.count("end")
                    if state["depth"] <= 0:
                        atoms.append(("x", Fixed(state["field"])))
                        state["field"], state["depth"] = None, 0
                else:
                    run_atoms(ch, container)
            else:
                atoms.append(("x", Fixed([ch])))

    walk(list(p), None)
    if state["field"] is not None:
        # field still open at the paragraph end: keep its runs as one placeholder; their text is reported as locked
        atoms.append(("x", Fixed(state["field"])))
    return atoms, starts, ends


def _locked_text(elements):
    """Visible text inside fixed elements, except nested paragraphs (text boxes are translated on their own)."""
    out = []
    for el in elements:
        if not is_element(el):
            continue
        for t in el.iter(q("w:t"), q("a:t")):
            anc = t.getparent()
            while anc is not None and anc is not el and anc.tag not in _P_TAGS:
                anc = anc.getparent()
            if anc is el:
                out.append(t.text or "")
    return "".join(out).strip()


def _neighbour_keys(items, order):
    """Per item, the key of the nearest non-blank text item met first along `order`; None when a fixed element or
    the end comes first. One linear pass."""
    keys, last = [None] * len(items), None
    for i in order:
        keys[i] = last
        if items[i][0] != "t":
            last = None
        elif items[i][1].strip():
            last = items[i][4]
    return keys


def encode(p):
    """Paragraph -> Segment, or None when it has no text. Raises Skip for paragraphs we must not touch, and for
    paragraphs whose only text sits inside fixed elements (locked text, e.g. a table-of-contents entry)."""
    kind = "a" if ns_of(p) == A else "w"
    atoms, starts, ends = (_a_atoms if kind == "a" else _w_atoms)(p)
    sig_fn = a_sig if kind == "a" else w_sig
    locked = [s for s in (_locked_text(at[1].elements) for at in atoms if at[0] == "x")
              if any(c.isalpha() for c in s)]
    items = [list(at) + [(sig_fn(at[2], at[1]), id(at[3]) if at[3] is not None else None)] if at[0] == "t" else at
             for at in atoms]
    weights = {}
    for it in items:
        if it[0] == "t" and it[1].strip():
            weights[it[4]] = weights.get(it[4], 0) + len(it[1].strip())
    if not weights:
        if locked:
            raise Skip(LOCKED_SKIP)
        return None
    dom_key = max(weights, key=weights.get)
    # Whitespace-only text has no formatting of its own: it joins a span that continues on both sides, otherwise
    # the dominant run. Decided before merging, so "<u>a</u><b> </b><u>b</u>" becomes one span.
    before = _neighbour_keys(items, range(len(items)))
    after = _neighbour_keys(items, range(len(items) - 1, -1, -1))
    for i, it in enumerate(items):
        if it[0] == "t" and not it[1].strip():
            it[4] = before[i] if before[i] is not None and before[i] == after[i] else dom_key
    merged = []  # ["t", text, rpr, container, key, has_text] or ("x", Fixed)
    for it in items:
        if it[0] != "t":
            merged.append(it)
            continue
        real = bool(it[1].strip())
        if merged and merged[-1][0] == "t" and merged[-1][4] == it[4]:
            prev = merged[-1]
            prev[1] += it[1]
            if real and not prev[5]:  # formatting comes from text, never from folded whitespace
                prev[2], prev[3], prev[5] = it[2], it[3], True
        else:
            merged.append(["t", it[1], it[2], it[3], it[4], real])
    dom = next(m for m in merged if m[0] == "t" and m[4] == dom_key and m[5])
    dominant = Span(copy.deepcopy(dom[2]) if dom[2] is not None else None, dom[3], dom_key[0])
    parts, spans, fixed, g, x = [], {}, {}, 0, 0
    for m in merged:
        if m[0] == "x":
            x += 1
            fixed[x] = m[1]
            parts.append("<x%d/>" % x)
        elif m[4] == dom_key or not m[5]:
            parts.append(m[1])
        else:
            g += 1
            spans[g] = Span(copy.deepcopy(m[2]) if m[2] is not None else None, m[3], m[4][0])
            parts.append("<g%d>%s</g%d>" % (g, m[1], g))
    return Segment(kind, "".join(parts), dominant, spans, fixed, starts, ends, locked)


# ---------------------------------------------------------------- apply

def _clean(text):
    text = unicodedata.normalize("NFC", text).replace("\r\n", " ")
    text = text.replace("\n", " ").replace("\r", " ").replace("\v", " ")
    return _CTRL_RE.sub("", text)


def _pieces(text):
    out, stack, pos = [], [], 0
    for m in TOKEN_RE.finditer(text):
        if m.start() > pos:
            out.append(("t", text[pos:m.start()], stack[-1] if stack else None))
        if m.group(3):
            out.append(("x", int(m.group(3)), None))
        elif m.group(1):
            if stack and stack[-1] == int(m.group(2)):
                stack.pop()
        else:
            stack.append(int(m.group(2)))
        pos = m.end()
    if pos < len(text):
        out.append(("t", text[pos:], stack[-1] if stack else None))
    return out


def _placed(pieces, fixed, fixes):
    """Each known placeholder once (first wins), unknown ones dropped, missing ones last; fixes are reported."""
    out, seen = [], set()
    for piece in pieces:
        if piece[0] == "x":
            n = piece[1]
            if n not in fixed:
                fixes.append("x_unknown:%d" % n)
                continue
            if n in seen:
                fixes.append("x_duplicate:%d" % n)
                continue
            seen.add(n)
        out.append(piece)
    missing = [n for n in sorted(fixed) if n not in seen]
    fixes += ["x_missing:%d" % n for n in missing]
    return out + [("x", n, None) for n in missing]


def _span(seg, span_id):
    return seg.spans.get(span_id, seg.dominant) if span_id else seg.dominant


def _set_w_lang(rpr):
    lang = rpr.find(q("w:lang"))
    if lang is None:
        lang = etree.SubElement(rpr, q("w:lang"))
        # schema order: lang precedes eastAsianLayout..rPrChange and the w14 / w15 extensions Word writes last
        anchor = next((c for c in rpr if is_element(c) and (local(c) in _W_LANG_BEFORE or ns_of(c) != W)), None)
        if anchor is not None:
            anchor.addprevious(lang)
    lang.set(q("w:val"), "vi-VN")
    fonts = rpr.find(q("w:rFonts"))
    if fonts is not None and fonts.get(q("w:hint")) == "eastAsia":
        del fonts.attrib[q("w:hint")]


def _a_run(holder, span, value):
    r = etree.SubElement(holder, q("a:r"))
    if span.rpr is not None:
        rpr = copy.deepcopy(span.rpr)
        r.append(rpr)
    else:
        rpr = etree.SubElement(r, q("a:rPr"))
    rpr.set("lang", "vi-VN")
    etree.SubElement(r, q("a:t")).text = value
    return r


def _w_run(holder, span, value):
    r = etree.SubElement(holder, q("w:r"))
    if span.rpr is not None:
        rpr = copy.deepcopy(span.rpr)
        r.append(rpr)
    else:
        rpr = etree.SubElement(r, q("w:rPr"))
    _set_w_lang(rpr)
    t = etree.SubElement(r, q("w:t"))
    t.text = value
    t.set("{%s}space" % XML, "preserve")
    return r


def _build(seg, pieces, make, holder):
    """New runs for the text pieces (None for placeholders), built off-tree before the paragraph is touched."""
    return [make(holder, _span(seg, span_id), value) if kind == "t" and value else None
            for kind, value, span_id in pieces]


def _apply_a(p, seg, pieces):
    built = _build(seg, pieces, _a_run, etree.Element(q("a:p"), nsmap={"a": A}))
    ppr, end = p.find(q("a:pPr")), p.find(q("a:endParaRPr"))
    for ch in list(p):
        if ch is not ppr and ch is not end:
            p.remove(ch)

    def emit(el):
        if el.getparent() is not p:
            p.append(el)
        if end is not None:
            end.addprevious(el)

    for (kind, value, _), r in zip(pieces, built):
        if kind == "x":
            for el in seg.fixed[value].elements:
                emit(el)
        elif r is not None:
            emit(r)
    if end is not None:
        end.set("lang", "vi-VN")


def _apply_w(p, seg, pieces):
    built = _build(seg, pieces, _w_run, etree.Element(q("w:p"), nsmap={"w": W}))
    ppr = p.find(q("w:pPr"))
    for ch in list(p):
        if ch is not ppr:
            p.remove(ch)
    mark = ppr.find(q("w:rPr")) if ppr is not None else None
    if mark is not None:
        _set_w_lang(mark)  # paragraph-mark run properties
    for a in seg.anchors_start:
        p.append(a)
    attached = {}

    def parent_for(cont):
        if cont is None:
            return p
        current = attached.get(id(cont))
        if current is not None and len(p) and p[-1] is current:
            return current
        if current is None:
            for k in list(cont):
                cont.remove(k)
            p.append(cont)
            attached[id(cont)] = cont
            return cont
        clone = etree.SubElement(p, cont.tag, attrib=dict(cont.attrib))
        attached[id(cont)] = clone
        return clone

    for (kind, value, span_id), r in zip(pieces, built):
        if kind == "x":
            fx = seg.fixed[value]
            if fx.wrap:
                wrap = etree.SubElement(parent_for(fx.container), q("w:r"))
                if fx.wrap_rpr is not None:
                    wrap.append(copy.deepcopy(fx.wrap_rpr))
                for el in fx.elements:
                    wrap.append(el)
            else:
                for el in fx.elements:
                    p.append(el)
        elif r is not None:
            parent_for(_span(seg, span_id).container).append(r)
    for a in seg.anchors_end:
        p.append(a)


def apply(p, seg, text):
    """Rebuild paragraph p from a translated tagged string (validate it with tags.check first).

    Returns the fixes made to unchecked text, e.g. ["x_duplicate:1", "x_unknown:9", "x_missing:2", "g_unknown:7"]
    (empty when the tags were exact): a placeholder is used once, unknown ones are dropped, missing ones go to the
    end so no fixed element is ever lost, and unknown spans take the dominant formatting. New runs are built before
    p is touched, so an error leaves p unchanged.
    """
    text = _clean(text)
    fixes = []
    pieces = _placed(_pieces(text), seg.fixed, fixes)
    fixes += ["g_unknown:%d" % n for n in dict.fromkeys(ids(text)[0]) if n not in seg.spans]
    (_apply_a if seg.kind == "a" else _apply_w)(p, seg, pieces)
    return fixes
