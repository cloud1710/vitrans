"""Synthetic packs and throwaway registries for the registry / matching / pipeline tests."""
import json
import shutil
import sys

from vitranslate.config import REPO_ROOT

sys.path.insert(0, str(REPO_ROOT / "tools"))
import build_registry  # noqa: E402

REAL_PACKS = REPO_ROOT / "packs"


def make_pack(root, pid, detect=(), glossary=(), version="1.0.0", prompt=None, **extra):
    """A pack directory root/pid with pack.json, prompt.md and glossary.csv (glossary = [(en, vi), ...])."""
    d = root / pid
    d.mkdir(parents=True)
    meta = dict({"id": pid, "version": version, "name": pid.title(), "detect": list(detect)}, **extra)
    (d / "pack.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    (d / "prompt.md").write_text(prompt if prompt is not None else "Prompt of " + pid, encoding="utf-8")
    rows = ["en,vi,note"] + ['"%s","%s",' % (en, vi) for en, vi in glossary]
    (d / "glossary.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    return d


def copy_real(dest_root, *ids):
    """Copy real packs (e.g. pathology) from the repo; tests never read draft folders such as packs/pathology-breast."""
    dest_root.mkdir(parents=True, exist_ok=True)
    for pid in ids:
        shutil.copytree(REAL_PACKS / pid, dest_root / pid)
    return dest_root


def build(src, out, **kw):
    return build_registry.build(src, out, **kw)


BREAST = dict(
    detect=["ductal carcinoma in situ", "HER2", "BI-RADS", "mammography", "lobular"],
    glossary=[("ductal carcinoma in situ", "ung th\u01b0 bi\u1ec3u m\u00f4 \u1ed1ng t\u1ea1i ch\u1ed7"),
              ("HER2", "HER2"), ("BI-RADS", "BI-RADS"), ("mammography", "ch\u1ee5p X-quang tuy\u1ebfn v\u00fa"),
              ("lobular", "ti\u1ec3u th\u00f9y"), ("Nottingham grade", "\u0111\u1ed9 Nottingham"),
              ("core needle biopsy", "sinh thi\u1ebft l\u00f5i kim")],
)
