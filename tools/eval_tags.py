"""Tag fidelity of the full translator (domain pack + style, ladder) on private/spike_samples.json.

Each sample is a tagged string from a real deck; spans carry no run properties, so ladder level 3 drops all tags.
Prints ASCII counts; writes out/eval_tags.json (out/eval_tags_fake.json with --fake) for review.
Usage: python tools/eval_tags.py [model] [--fake] [--device auto|cpu|gpu] [--pack ID] [--dir]
"""
import argparse
import json
import sys

import _common as c
from vitranslate import config
from vitranslate.ooxml.codec import Fixed, Segment, Span
from vitranslate.packs import glossary_hits, load_pack
from vitranslate.tags import ids
from vitranslate.translate import Translator, build_system


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("model", nargs="?", default=None, help="default: the job's model on the device")
    ap.add_argument("--fake", action="store_true")
    ap.add_argument("--device", choices=("auto", "cpu", "gpu"), default="auto")
    ap.add_argument("--pack", default="pathology")
    ap.add_argument("--dir", action="store_true", help="load the pack from packs/<id>, not the registry")
    args = ap.parse_args(argv)

    samples = json.loads((c.ROOT / "private" / "spike_samples.json").read_text(encoding="utf-8"))
    style = load_pack(config.style_dir())
    pack, source = c.load_domain_pack(args.pack, args.dir)
    hits = glossary_hits("\n".join(s["src"] for s in samples), pack.glossary)
    dev = c.pick_device(args.device)
    args.model = args.model or config.default_model(dev.kind)
    llm = c.make_llm(args.fake, dev, args.model)
    tr = Translator(llm, build_system(style.prompt, pack, hits), args.model, "eval", pack.term_fixes, hits, tm=None)
    levels, rows = {}, []
    unchanged = english_left = silent = 0
    try:
        for s in samples:
            g, x = ids(s["src"])
            seg = Segment("a", s["src"], Span(None, None, ""), {n: Span(None, None, "s%d" % n) for n in g},
                          {n: Fixed([]) for n in x})
            out = tr.translate(seg)
            levels[out.level] = levels.get(out.level, 0) + 1
            unchanged += "unchanged" in out.flags
            english_left += "english_left" in out.flags
            silent += c.is_silent_english(s["src"], out.text, out.flags)
            rows.append({"src": s["src"], "out": out.text, "level": out.level, "flags": out.flags})
    finally:
        if hasattr(llm, "close"):
            llm.close()
    (c.ROOT / "out").mkdir(exist_ok=True)
    name = "eval_tags_fake.json" if args.fake else "eval_tags.json"
    (c.ROOT / "out" / name).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    exact = sum(v for k, v in levels.items() if k <= 2)
    print("model", args.model, "fake", args.fake, "device", dev.kind, "pack", pack.key(), "from", source.encode(
        "ascii", "replace").decode(), "levels", json.dumps(levels, sort_keys=True),
        "tag_exact %d/%d" % (exact, len(rows)), "unchanged", unchanged, "english_left", english_left,
        "silent_english", silent)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
