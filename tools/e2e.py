"""Acceptance run over private/corpus.txt (real Ollama + device probe by default).

One JSON line per file on stdout (ASCII), per-file reports and summary.json under the output folder (UTF-8,
git-ignored). Accept criteria, every file: tag_exact_after_ladder / segments >= 0.95 AND silent_english == 0
(segments whose output equals the source, or keeps English words copied from it, with no unchanged / kept_code /
kept_english / kept_reference / english_left flag: _common.is_silent_english).

Usage: python tools/e2e.py [--fast] [--fake] [--device auto|cpu|gpu] [--files SUBSTR ...] [--domain IDS]
                           [--out DIR] [--keep-tm] [--polish auto|on|off] [--corpus LIST]
  --fake    echo LLM (no Ollama), default output folder out/e2e-fake instead of out/e2e
  --files   keep only corpus files whose name contains one of the substrings (case-insensitive)
  --domain  comma-separated pack ids (as in the UI); default: automatic pack selection
  --polish  read-back editor pass (default auto: on with a GPU). Every file also gets <output stem>_segments.json:
            each translated segment in order with its draft (before the editor) and final text, and its model calls
            per phase (translate / polish: characters, tokens, seconds) in the summary row
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import _common as c
from vitranslate import pipeline
from vitranslate.pipeline import Options, run_job
from vitranslate.tags import check, strip_tags
from vitranslate.translate import Translator
from vitranslate.tm import TM

ACCEPT = 0.95


def log_progress(name):
    safe = name.encode("ascii", "replace").decode()

    def progress(ev):
        if ev["stage"] == "translate" and (ev["done"] % 25 == 0 or ev["done"] == ev["total"]):
            print("  %s %d/%d" % (safe, ev["done"], ev["total"]), flush=True)
        elif ev["stage"] in ("classify", "device"):
            print("  " + json.dumps(ev, ensure_ascii=True), flush=True)
    return progress


class RecordingTranslator(Translator):
    """Remembers (source, draft, outcome) of every segment: unflagged rows are not in the report, and the editor pass
    changes the outcome (text, flags) after translation."""
    seen = []

    def translate(self, seg, prev="", nxt=""):
        out = super().translate(seg, prev, nxt)
        self.seen.append((seg.tagged, out.text, out))
        return out


def shown(tagged):
    """Plain text of a tagged text: a placeholder is a space, tags dropped, spaces collapsed (no length cap)."""
    return " ".join(strip_tags(re.sub(r"<x\d+/>", " ", tagged)).split())


def segments(seen):
    return [{"i": n, "src": shown(src), "draft": shown(draft), "final": shown(out.text), "src_tagged": src,
             "draft_tagged": draft, "final_tagged": out.text, "level": out.level, "flags": out.flags}
            for n, (src, draft, out) in enumerate(seen)]


def corpus_paths(files, listing=None):
    listing = Path(listing) if listing else c.ROOT / "private" / "corpus.txt"
    paths = [Path(line.strip()) for line in listing.read_text(encoding="utf-8").splitlines() if line.strip()]
    paths = [p for p in paths if p.suffix.lower() in (".docx", ".pptx")]
    if files:
        subs = [f.lower() for f in files]
        paths = [p for p in paths if any(s in p.name.lower() for s in subs)]
    return paths


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--fake", action="store_true")
    ap.add_argument("--device", choices=("auto", "cpu", "gpu"), default="auto")
    ap.add_argument("--files", nargs="*", default=[])
    ap.add_argument("--domain", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--keep-tm", action="store_true", help="reuse the e2e translation memory of an earlier run")
    ap.add_argument("--polish", choices=("auto", "on", "off"), default="auto")
    ap.add_argument("--corpus", default="", help="file listing the documents (default private/corpus.txt)")
    args = ap.parse_args(argv)
    polish = {"auto": None, "on": True, "off": False}[args.polish]

    out_dir = Path(args.out) if args.out else c.ROOT / "out" / ("e2e-fake" if args.fake else "e2e")
    out_dir.mkdir(parents=True, exist_ok=True)
    tm_path = out_dir / "tm.sqlite"  # private to the run: acceptance must not reuse the user's own memory
    if not args.keep_tm:
        for suffix in ("", "-wal", "-shm"):
            Path(str(tm_path) + suffix).unlink(missing_ok=True)
    dev = c.pick_device(args.device)
    paths = corpus_paths(args.files, args.corpus)
    if not paths:
        print("no corpus file matches", flush=True)
        return 2

    pipeline.Translator = RecordingTranslator
    summary, tm = [], TM(tm_path)
    try:
        for path in paths:
            t0 = time.time()
            RecordingTranslator.seen.clear()
            recorders = []

            def factory(d, model):
                recorders.append(c.CallRecorder(c.make_llm(args.fake, d, model)))
                return recorders[-1]

            res = run_job(path, out_dir, Options(fast=args.fast, domain=args.domain, polish=polish),
                          progress=log_progress(path.name), llm_factory=factory, probe=lambda: dev, tm=tm)
            rep, counts = res.report, res.report["counts"]
            flagged = rep["flagged"]
            seen = RecordingTranslator.seen
            (out_dir / (res.output.stem + "_segments.json")).write_text(
                json.dumps(segments(seen), ensure_ascii=False, indent=1), encoding="utf-8")
            row = {"file": path.name, "segments": counts["segments"], "levels": rep["levels"],
                   "tag_exact_rate": round(counts["tag_exact_after_ladder"] / max(counts["segments"], 1), 4),
                   "flagged": counts["flagged"],
                   "english_left": sum(1 for r in flagged if "english_left" in r["flags"]),
                   "unchanged": sum(1 for r in flagged if "unchanged" in r["flags"]),
                   "silent_english": sum(1 for src, _, out in seen if c.is_silent_english(src, out.text, out.flags)),
                   # tag-exact levels whose final text (after the editor pass) no longer passes the tag check
                   "tags_broken_final": sum(1 for _, _, out in seen
                                            if out.level <= 2 and check(out.segment.tagged, out.text)),
                   "polish": rep.get("polish"), "stage_seconds": rep.get("seconds"),
                   "calls": recorders[0].totals() if recorders else {},
                   "suspect_output": sum(1 for r in flagged if any(f.startswith("suspect_output") for f in r["flags"])),
                   "packs": [p["id"] for p in rep.get("packs", [])], "fonts": rep["fonts"], "fit": len(rep["fit"]),
                   "device": rep["device"], "fake": args.fake, "seconds": round(time.time() - t0, 1),
                   "output": str(res.output)}
            (out_dir / (res.output.stem + "_report.json")).write_text(
                json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
            summary.append(row)
            print(json.dumps(row, ensure_ascii=True), flush=True)
    finally:
        tm.close()
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = bool(summary) and all(r["tag_exact_rate"] >= ACCEPT for r in summary)
    silent = sum(r["silent_english"] for r in summary)
    print("TOTAL segments=%d unchanged=%d english_left=%d silent_english=%d" % (
        sum(r["segments"] for r in summary), sum(r["unchanged"] for r in summary),
        sum(r["english_left"] for r in summary), silent), flush=True)
    broken = sum(r["tags_broken_final"] for r in summary)
    ok = ok and silent == 0 and broken == 0
    print("ACCEPT tag_exact>=%.2f per file, silent_english==0, tags_broken_final==0: %s" % (ACCEPT, ok), flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
