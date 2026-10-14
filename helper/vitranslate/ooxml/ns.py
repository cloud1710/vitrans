"""OOXML namespaces and small element helpers."""
from lxml import etree

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
XML = "http://www.w3.org/XML/1998/namespace"
NSMAP = {"a": A, "w": W, "p": P, "r": R, "mc": MC}


def q(name):
    """'a:p' -> '{drawingml-ns}p'."""
    prefix, local_name = name.split(":")
    return "{%s}%s" % (NSMAP[prefix], local_name)


def is_element(el):
    return isinstance(el.tag, str)


def local(el):
    return etree.QName(el).localname if is_element(el) else ""


def ns_of(el):
    return etree.QName(el).namespace if is_element(el) else ""
