"""Interim PPTX fit (phase 1): shrink shape text that grew in Vietnamese; phase 3 replaces it with measuring."""
import math

from lxml import etree

from .ooxml.ns import local, q
from .tags import strip_tags

FLOOR = 0.5


def _text_body(p):
    el = p.getparent()
    while el is not None:
        if local(el) == "txBody":
            return el
        el = el.getparent()
    return None


def _parse_scale(value):
    """fontScale is thousandths of a percent (90000) or, in newer files, a percent string ("62.5%")."""
    try:
        value = value.strip()
        return float(value[:-1]) / 100.0 if value.endswith("%") else int(value) / 100000.0
    except ValueError:
        return 1.0


def _current_scale(body_pr):
    na = body_pr.find(q("a:normAutofit"))
    fs = na.get("fontScale") if na is not None else None
    return _parse_scale(fs) if fs else 1.0


def _set_scale(body_pr, scale):
    """wrap="none" labels stay on one line (forcing a wrap would run a second line off the slide)."""
    if body_pr.get("wrap") != "none":
        body_pr.set("wrap", "square")
    reduction = 0
    old = body_pr.find(q("a:normAutofit"))
    if old is not None and old.get("lnSpcReduction"):
        reduction = _parse_scale(old.get("lnSpcReduction"))
    for tag in ("a:spAutoFit", "a:noAutofit", "a:normAutofit"):
        old = body_pr.find(q(tag))
        if old is not None:
            body_pr.remove(old)
    na = etree.SubElement(body_pr, q("a:normAutofit"))
    na.set("fontScale", str(int(round(scale * 100000))))
    reduction = max(reduction, 0.1 if scale < 0.85 else 0.0)
    if reduction > 0:
        na.set("lnSpcReduction", str(int(round(reduction * 100000))))
    warp = body_pr.find(q("a:prstTxWarp"))
    if warp is not None:
        warp.addnext(na)
    else:
        body_pr.insert(0, na)


def fit_pptx(pairs):
    """pairs: (item, outcome) for slide paragraphs. Returns change records for the report."""
    bodies = {}
    for item, outcome in pairs:
        body = _text_body(item.element)
        if body is None:
            continue
        rec = bodies.setdefault(id(body), [body, 0, 0, item.location])
        rec[1] += len(item.segment.plain)
        rec[2] += len(strip_tags(outcome.text))
    changes = []
    for body, en, vi, where in bodies.values():
        if en == 0 or vi <= en * 1.05:
            continue
        parent = body.getparent()
        if parent is not None and local(parent) == "tc":
            if vi > en * 1.3:
                changes.append({"where": where, "table_cell_longer": True})
            continue
        body_pr = body.find(q("a:bodyPr"))
        if body_pr is None:
            continue
        cur = _current_scale(body_pr)
        ratio = en / vi
        new = max(FLOOR, min(1.0, cur * (ratio if body_pr.get("wrap") == "none" else math.sqrt(ratio))))
        if new < cur - 0.005:
            _set_scale(body_pr, new)
            changes.append({"where": where, "scale": round(new, 2)})
    return changes
