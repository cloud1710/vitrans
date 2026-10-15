"""Export tests/functions/fixtures/helper_parity.json: what the HELPER (Python, helper/vitranslate) decides for
synthetic documents, so tests/functions/parity.test.mjs can check that the cloud API gives the same prompts and the
same decisions.

Per document (plain-text paragraphs as the page's text mode sends them, and a slide with inline tags):
- the bundle of the committed non-draft packs (tools/bundle_packs.build_bundle: the bytes the Functions get);
- the helper's pack choice for the WHOLE document (pipeline.py choose_packs / load_packs), glossary hits, system
  prompt (build_system) and classify event;
- per segment, as run_job does: the helper's codec Segment of a one-run paragraph (plain text) or of a tagged slide
  paragraph, prev / nxt = the neighbours' plain text, a scripted model (canned answers in call order, then a default
  answer) and the Translator's outcome (text, level, flags) with every prompt it sent.

Usage: <python of the helper env> tests/functions/export_helper_parity.py   (deterministic; synthetic text only)
"""
import json
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "helper"))
sys.path.insert(0, str(REPO / "tools"))

from lxml import etree  # noqa: E402

import build_registry  # noqa: E402
import bundle_packs  # noqa: E402
from vitranslate import config  # noqa: E402
from vitranslate.ooxml.codec import encode  # noqa: E402
from vitranslate.packs import allowed_words, glossary_hits, load_pack  # noqa: E402
from vitranslate.pipeline import choose_packs, load_packs, top_candidates  # noqa: E402
from vitranslate.registry import Registry  # noqa: E402
from vitranslate.translate import Translator, build_system, is_essential  # noqa: E402

OUT = Path(__file__).resolve().parent / "fixtures" / "helper_parity.json"
A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
MODEL = "@cf/google/gemma-4-26b-a4b-it"


def xesc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def para(*items):
    """A DrawingML paragraph: a str is a plain run, ("b" | "i", text) a bold / italic run."""
    rpr = {None: '<a:rPr lang="en-US"/>', "b": '<a:rPr lang="en-US" b="1"/>', "i": '<a:rPr lang="en-US" i="1"/>'}
    runs = []
    for it in items:
        kind, text = (None, it) if isinstance(it, str) else it
        runs.append("<a:r>%s<a:t>%s</a:t></a:r>" % (rpr[kind], xesc(text)))
    return "<a:p %s>%s</a:p>" % (A_NS, "".join(runs))


# (paragraph, scripted answers in call order, default answer after them); synthetic text only
TEXT_DOC = [
    (para("Histopathology of the resected specimen shows an invasive ductal carcinoma."),
     [], "Mô bệnh học của bệnh phẩm phẫu thuật cho thấy ung thư biểu "
         "mô ống xâm nhập."),
    (para("The tumour measures 23 mm and the surgical margin is clear."),
     ["The tumour measures 23 mm and diện cắt is clear."],
     "U có kích thước 23 mm và diện cắt âm tính."),
    (para("Lymphovascular invasion is present in two separate foci of the tumour."),
     [""], "Có xâm nhập mạch bạch huyết ở hai ổ riêng biệt của u."),
    (para("ER and PR are positive in the tumour cells; HER2 is negative."),
     ["ER dương tính trong tế bào u; HER2 âm tính."],
     "ER và PR dương tính trong tế bào u; HER2 âm tính."),
    (para("HER2 3+ (IHC)"), [], "unused"),
    (para("Recommendation: correlate with the clinical findings and the imaging."),
     ["**Khuyến nghị**: đối chiếu với các dấu hiệu lâm sàng và "
      "hình ảnh học."],
     "Khuyến nghị: đối chiếu với các dấu hiệu lâm sàng và "
     "hình ảnh học."),
    (para("The biopsy showed no evidence of malignancy in the lymph node."),
     ["Sinh thiết không cho thấy bằng chứng <g1>ác tính</g1> trong hạch "
      "bạch huyết."],
     "Sinh thiết không cho thấy bằng chứng ác tính trong hạch bạch "
     "huyết."),
]

SLIDE_DOC = [
    (para(("b", "Invasive ductal carcinoma"), ", grade 2, with lymphovascular invasion."), [],
     "<g1>Ung thư biểu mô ống xâm nhập</g1>, độ 2, có xâm nhập mạch "
     "bạch huyết."),
    (para("Margins: ", ("i", "clear"), " (nearest 4 mm)."),
     ["Diện cắt: âm tính (gần nhất 4 mm)."],
     "Diện cắt: <g1>âm tính</g1> (gần nhất 4 mm)."),
    # the pack's term-lock writes its house form (lymphocyte = "lymph\u00f4 b\u00e0o"): no strange word
    (para("Many lymphocytes surround the tumour nests."), [],
     "Nhi\u1ec1u t\u1ebf b\u00e0o lympho bao quanh c\u00e1c \u1ed5 u."),
    # Vietnamese academic titles before the name, in order, a dot after each
    (para("Reviewed by ", ("b", "Jane Doe"), ", MD, PhD."), [],
     "Xem l\u1ea1i b\u1edfi BS. TS. <g1>Jane Doe</g1>."),
]


class ScriptedLLM:
    def __init__(self, replies, default):
        self.replies = list(replies)
        self.default = default
        self.calls = []

    def chat(self, system, user):
        reply = self.replies[len(self.calls)] if len(self.calls) < len(self.replies) else self.default
        self.calls.append({"system": system, "user": user, "reply": reply})
        return reply


def run_document(name, doc, registry, manifest, style):
    segs = [encode(etree.fromstring(p)) for p, _, _ in doc]
    full_text = "\n".join(s.plain for s in segs)
    matches, unknown = choose_packs(full_text, "", manifest)
    pack, rows, missing, pack_key = load_packs(matches, registry)
    assert not missing and not unknown
    hits = glossary_hits(full_text, pack.glossary)
    system = build_system(style.prompt, pack, hits)
    scope = pack_key + "+" + style.key() + "+" + config.VERSION
    classify = {"stage": "classify", "offline": False, "unavailable": [],
                "packs": [{k: r[k] for k in ("id", "name", "score", "matched", "reason")} for r in rows],
                "candidates": top_candidates(full_text, manifest, {m.entry.get("id") for m in matches})}
    out = []
    for n, (seg, (_, replies, default)) in enumerate(zip(segs, doc)):
        prev = segs[n - 1].plain if n > 0 else ""
        nxt = segs[n + 1].plain if n + 1 < len(segs) else ""
        llm = ScriptedLLM(replies, default)
        t = Translator(llm, system, MODEL, scope, pack.term_fixes, hits, None, allowed=allowed_words(pack))
        res = t.translate(seg, prev, nxt)
        out.append({"id": n, "tagged": seg.tagged, "plain": seg.plain, "prev": prev, "nxt": nxt,
                    "essential": sorted(k for k, sp in seg.spans.items() if is_essential(sp)),
                    "where": "Doan %d" % (n + 1), "replies": replies, "default": default,
                    "calls": [{"user": c["user"], "reply": c["reply"]} for c in llm.calls],
                    "result": {"text": res.text, "level": res.level, "flags": list(res.flags),
                               "fixes": res.fixes, "reduced": res.segment is not seg}})
        assert all(c["system"] == system for c in llm.calls)
    return {"name": name, "full_text": full_text, "system": system, "scope": scope,
            "hits": [list(h) for h in hits], "classify": classify, "segments": out}


def main():
    packs_dir = REPO / "packs"
    bundle = bundle_packs.build_bundle(packs_dir, source="tests/functions/export_helper_parity.py")
    style = load_pack(packs_dir / "_style")
    with tempfile.TemporaryDirectory(prefix="vt-parity-") as tmp:
        build_registry.build(packs_dir, Path(tmp) / "registry")
        registry = Registry(Path(tmp) / "registry", Path(tmp) / "home")
        manifest = registry.manifest()
        docs = [run_document("plain text", TEXT_DOC, registry, manifest, style),
                run_document("slide with tags", SLIDE_DOC, registry, manifest, style)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"model": MODEL, "app_version": config.VERSION, "bundle": bundle, "documents": docs}
    OUT.write_bytes((json.dumps(data, ensure_ascii=True, sort_keys=True, indent=1) + "\n").encode("ascii"))
    print("wrote %s: %d documents, %d segments, %d model calls" % (
        OUT.relative_to(REPO).as_posix(), len(docs), sum(len(d["segments"]) for d in docs),
        sum(len(s["calls"]) for d in docs for s in d["segments"])))
    for d in docs:
        for s in d["segments"]:
            print("  %s #%d: level %d, flags %s, %d call(s)" % (d["name"], s["id"], s["result"]["level"],
                                                               ",".join(s["result"]["flags"]) or "-", len(s["calls"])))


if __name__ == "__main__":
    main()
