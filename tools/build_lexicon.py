"""Write web/engine/medical_words.json: the medical lexicon of the term repair gate (helper/vitranslate/repair.py,
LEXICON_GATE). Every word folded as repair.words folds it (a-z0-9), sorted, the repair STOPWORDS and words of fewer
than 3 characters or digits only left out.

  terms   the English words of every glossary key of every pack folder (drafts included), of the packs' term fixes
          and detect keywords, of packs/_shared/*.csv and of the term lists tools/pathology_overrides.json and
          tools/pathology_seed_fixes.json
  corpus  the words of the English test sentences of the packs (packs/*/tests.jsonl "src") that are not in terms

Committed repository files only (no download, no private file). Usage: build_lexicon.py [--check]
(--check: exit 1 when the committed file differs from a fresh build). Console output is ASCII only.
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "helper"))

from vitranslate.repair import STOPWORDS, words  # noqa: E402

OUT = ROOT / "web" / "engine" / "medical_words.json"


def _csv_first(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh))
    return [r[0] for r in rows[1:] if r]


def term_texts():
    out = []
    for d in sorted((ROOT / "packs").iterdir()):
        if not d.is_dir() or d.name == "_style":
            continue
        if (d / "glossary.csv").exists():
            out += _csv_first(d / "glossary.csv")
        for f in sorted(d.glob("*.csv")) if d.name == "_shared" else []:
            out += _csv_first(f)
        if (d / "rules.json").exists():
            out += [f["en"] for f in json.loads((d / "rules.json").read_text(encoding="utf-8")).get("term_fixes", [])]
        if (d / "pack.json").exists():
            out += json.loads((d / "pack.json").read_text(encoding="utf-8")).get("detect", [])
    over = json.loads((ROOT / "tools" / "pathology_overrides.json").read_text(encoding="utf-8"))
    out += list(over.get("vi", {})) + list(over.get("drop", [])) + [a["en"] for a in over.get("add", [])]
    seed = json.loads((ROOT / "tools" / "pathology_seed_fixes.json").read_text(encoding="utf-8"))
    out += list(seed.get("deny", [])) + list(seed.get("allow_partial", [])) + [f["en"] for f in seed.get("fixes", [])]
    return out


def corpus_texts():
    out = []
    for f in sorted((ROOT / "packs").glob("*/tests.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip():
                out.append(json.loads(line).get("src", ""))
    return out


def word_set(texts):
    keep = set()
    for t in texts:
        for _, _, w in words(t):
            if len(w) >= 3 and not w.isdigit() and w not in STOPWORDS:
                keep.add(w)
    return keep


def build():
    terms = word_set(term_texts())
    corpus = word_set(corpus_texts()) - terms
    return {"format": 1, "terms": sorted(terms), "corpus": sorted(corpus)}


def main(argv):
    data = build()
    text = json.dumps(data, ensure_ascii=True, separators=(",", ":")) + "\n"
    if "--check" in argv:
        same = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("medical_words.json is %s" % ("up to date" if same else "OUT OF DATE"))
        return 0 if same else 1
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print("%s: %d term words, %d corpus words" % (OUT.relative_to(ROOT).as_posix(), len(data["terms"]),
                                                  len(data["corpus"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
