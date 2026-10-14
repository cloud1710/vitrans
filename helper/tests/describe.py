"""Visible structure of a paragraph, used to prove that encode + apply(identity) changes nothing visible."""
from lxml import etree

from vitranslate.ooxml.codec import a_sig, w_sig
from vitranslate.ooxml.ns import A, local, ns_of, q

# Invisible markers: the codec drops proofErr and moves anchors (bookmarks, comment / permission ranges) to the
# paragraph start / end, so they are not part of the visible structure.
_W_INVISIBLE = {"pPr", "proofErr", "bookmarkStart", "bookmarkEnd", "commentRangeStart", "commentRangeEnd",
                "permStart", "permEnd"}


def _container_key(el):
    if el is None:
        return ""
    return local(el) + ":" + ",".join("%s=%s" % (etree.QName(k).localname, v) for k, v in sorted(el.attrib.items()))


def describe(p):
    """(text with a {marker} per fixed element, [(signature, text without whitespace) ...], fixed element names).

    The markers sit in the text stream, so a fixed element that moves relative to the text is a difference.
    """
    entries, fixed, text = [], [], []

    def add(key, t):
        text.append(t)
        if not t.strip():
            return
        if entries and entries[-1][0] == key:
            entries[-1] = (key, entries[-1][1] + t)
        else:
            entries.append((key, t))

    def mark(name):
        fixed.append(name)
        text.append("{" + name + "}")

    if ns_of(p) == A:
        for ch in p:
            n = local(ch)
            if n in ("pPr", "endParaRPr"):
                continue
            if n == "r":
                run_text = "".join(t.text or "" for t in ch.findall(q("a:t")))
                add(a_sig(ch.find(q("a:rPr")), run_text), run_text)
            else:
                mark(n)
    else:
        def walk(children, container):
            for ch in children:
                n = local(ch)
                if n in _W_INVISIBLE:
                    continue
                if n in ("smartTag", "customXml"):
                    walk([k for k in ch if local(k) not in ("smartTagPr", "customXmlPr")], container)
                elif n == "hyperlink":
                    walk(list(ch), ch)
                elif n == "r":
                    sig = w_sig(ch.find(q("w:rPr"))) + "|" + _container_key(container)
                    for k in ch:
                        kn = local(k)
                        if kn == "t":
                            add(sig, k.text or "")
                        elif kn not in ("rPr", "lastRenderedPageBreak"):
                            mark(kn if container is None else _container_key(container) + "/" + kn)
                else:
                    mark(n)
        walk(list(p), None)
    # Whitespace-only runs fold into neighbours (by design), so entries compare non-space characters only; exact
    # whitespace is still checked by the text.
    return "".join(text), [(k, "".join(t.split())) for k, t in entries], fixed
