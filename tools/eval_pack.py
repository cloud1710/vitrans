"""Run a pack's tests.jsonl through the translator; case-insensitive substring checks on the output without tags.

Test fields: src, must (every string present), must_not (none present), must_any (list of lists: from each inner
list at least one string present).
The pack comes from the registry (dev registry out/registry unless VITRANSLATE_REGISTRY is set; build it first with
tools/build_registry.py, plus --include-drafts for a draft pack) or, with --dir / when the registry lacks the id,
straight from packs/<id>.
--family: the pack merged with its parent chain, child first (the merge order of a real job), so a child's tests see
the parent's rows and term fixes; the parent's tests run too (after the child's).

Usage: python tools/eval_pack.py <pack_id> [model] [--fake] [--device auto|cpu|gpu] [--dir] [--family]
  -> ASCII pass count; failures in out/eval_pack_<id>[_family][_fake].json
"""
import argparse
import json
import sys

import _common as c
from vitranslate import config
from vitranslate.ooxml.codec import Segment, Span
from vitranslate.packs import glossary_hits, load_pack
from vitranslate.tags import strip_tags
from vitranslate.translate import Translator, build_system


def check(out, test):
    """(missing, forbidden) for one test."""
    low = out.lower()
    missing = [m for m in test.get("must", []) if m.lower() not in low]
    missing += ["any:" + "|".join(g) for g in test.get("must_any", []) if not any(m.lower() in low for m in g)]
    forbidden = [m for m in test.get("must_not", []) if m.lower() in low]
    return missing, forbidden


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("pack_id")
    ap.add_argument("model", nargs="?", default=None, help="default: the job's model on the device")
    ap.add_argument("--fake", action="store_true")
    ap.add_argument("--device", choices=("auto", "cpu", "gpu"), default="auto")
    ap.add_argument("--dir", action="store_true", help="load the pack from packs/<id>, not the registry")
    ap.add_argument("--family", action="store_true", help="merge the pack with its parent chain, child first")
    args = ap.parse_args(argv)

    style = load_pack(config.style_dir())
    pack, source = c.load_domain_pack(args.pack_id, args.dir, family=args.family)
    dev = c.pick_device(args.device)
    args.model = args.model or config.default_model(dev.kind)
    llm = c.make_llm(args.fake, dev, args.model)
    passed, failures = 0, []
    try:
        for t in pack.tests:
            hits = glossary_hits(t["src"], pack.glossary)
            tr = Translator(llm, build_system(style.prompt, pack, hits), args.model, "eval", pack.term_fixes, hits,
                            tm=None)
            out = strip_tags(tr.translate(Segment("a", t["src"], Span(None, None, ""))).text)
            missing, forbidden = check(out, t)
            if missing or forbidden:
                failures.append({"src": t["src"], "out": out, "missing": missing, "forbidden": forbidden})
            else:
                passed += 1
    finally:
        if hasattr(llm, "close"):
            llm.close()
    (c.ROOT / "out").mkdir(exist_ok=True)
    name = "eval_pack_%s%s%s.json" % (args.pack_id, "_family" if args.family else "", "_fake" if args.fake else "")
    (c.ROOT / "out" / name).write_text(json.dumps(failures, ensure_ascii=False, indent=1), encoding="utf-8")
    print("pack", args.pack_id, "family" if args.family else "alone", "(%s)" % pack.id, "from",
          source.encode("ascii", "replace").decode(), "model", args.model,
          "fake", args.fake, "device", dev.kind, "passed %d/%d" % (passed, len(pack.tests)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
