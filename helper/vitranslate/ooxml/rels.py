"""Relationship (.rels) reading: resolve targets and derive the pptx slide structure."""
import posixpath

from lxml import etree

from .ns import P, R

_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"


def rels_targets(pkg, part):
    """rId -> resolved target part name for an internal relationship of `part`."""
    folder, base = posixpath.split(part)
    rels_name = posixpath.join(folder, "_rels", base + ".rels")
    raw = pkg.raw.get(rels_name)
    if raw is None:
        return {}
    out = {}
    for rel in etree.fromstring(raw).iter(_REL):
        if rel.get("TargetMode") == "External":
            continue
        target = rel.get("Target") or ""
        if target.startswith("/"):
            resolved = posixpath.normpath(target.lstrip("/"))
        else:
            resolved = posixpath.normpath(posixpath.join(folder, target))
        out[rel.get("Id")] = resolved
    return out


def pptx_structure(pkg):
    """slide_no / notes_no / used_layouts / used_masters for a pptx package."""
    pres = "ppt/presentation.xml"
    slide_no = {}
    if pres in pkg.raw:
        targets = rels_targets(pkg, pres)
        root = etree.fromstring(pkg.raw[pres])
        n = 0
        for sld in root.iter("{%s}sldId" % P):
            target = targets.get(sld.get("{%s}id" % R))
            if target and target in pkg.raw:
                n += 1
                slide_no[target] = n
    notes_no, layouts = {}, set()
    for slide, no in slide_no.items():
        for target in rels_targets(pkg, slide).values():
            if target.startswith("ppt/notesSlides/"):
                notes_no.setdefault(target, no)
            elif target.startswith("ppt/slideLayouts/"):
                layouts.add(target)
    masters = set()
    for layout in layouts:
        for target in rels_targets(pkg, layout).values():
            if target.startswith("ppt/slideMasters/"):
                masters.add(target)
    return {"slide_no": slide_no, "notes_no": notes_no,
            "used_layouts": layouts, "used_masters": masters}
