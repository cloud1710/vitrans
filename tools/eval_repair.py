"""Measure the term-repair candidate finder (helper/vitranslate/repair.py) on synthetic mis-heard sentences.

Sets (all synthetic, written for this tool; the keys are the glossary English keys of the chosen packs):
  heard      HEARD below: sentences with one mis-heard term the way a recognizer writes it (real words, splits)
  generated  one key per sampled glossary key, one of its words changed by a sound-alike rule (vowel, voicing,
             spelling, dropped or doubled letter, split word, ending), in a carrier sentence
  correct    the same carrier sentences with the right keys, the HEARD sentences with the term restored and plain
             talk sentences: every candidate there is a false one
  hard       HARD below: correct sentences with a real medical word close to a key (vocal / focal, intron / Intern,
             hypoplasia / hyperplasia): every candidate there is a false one, and the model takes most of them
Reports recall (the intended key among the candidates: @1, @3, @10), candidates per sentence, false candidates per
correct sentence and the time per sentence. --text FILE ... (local only: e.g. caption transcripts kept out of git)
adds their sentences (deduplicated) and prints every candidate found there, ASCII only.

Usage: eval_repair.py [--packs id,id,...] [--per-key N] [--gate off|any|changed] [--lexicon none|terms|all]
                      [--text FILE ...] [--json OUT]
(--gate: repair.py LEXICON_GATE; --lexicon: the words of web/engine/medical_words.json given to term_index, "terms"
by default, "all" = terms + corpus)
"""
import argparse
import json
import random
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "helper"))

from vitranslate.packs import load_pack  # noqa: E402
from vitranslate.repair import GATES, LEXICON_GATE, find_candidates, fold, term_index, words  # noqa: E402

# (sentence, heard span, intended key): synthetic, the way a recognizer may write a term it does not know
HEARD = [
    ("The puppy thyroid carcinoma was multifocal in this patient.", "puppy thyroid carcinoma",
     "papillary thyroid carcinoma"),
    ("You can count the my toxic figures in ten fields.", "my toxic figures", "mitotic figures"),
    ("This looks like a new row endocrine tumor of the rectum.", "new row endocrine tumor", "neuroendocrine tumor"),
    ("We made a sell block from the fluid.", "sell block", "cell block"),
    ("The hurt will cell carcinoma had a solid pattern.", "hurt will cell carcinoma", "Hurthle cell carcinoma"),
    ("There is background Hashi moto thyroiditis in the gland.", "Hashi moto thyroiditis", "Hashimoto thyroiditis"),
    ("In children the pillow cystic astrocytoma is common.", "pillow cystic astrocytoma", "pilocytic astrocytoma"),
    ("Look at the some a toma calcification here.", "some a toma calcification", "psammomatous calcification"),
    ("The kidney mass was an angio my oh lipoma.", "angio my oh lipoma", "angiomyolipoma"),
    ("It was a signet ring sell carcinoma of the stomach.", "signet ring sell carcinoma",
     "signet ring cell carcinoma"),
    ("The nuclei show fine chroma tin with small nucleoli.", "chroma tin", "chromatin"),
    ("There is a well formed granny loma in the node.", "granny loma", "granuloma"),
    ("This is a cribble form carcinoma of the breast.", "cribble form carcinoma", "cribriform carcinoma"),
    ("The acid nick cell carcinoma arose in the parotid.", "acid nick cell carcinoma", "acinic cell carcinoma"),
    ("A war thin tumour has two layers of oncocytes.", "war thin tumour", "Warthin tumour"),
    ("The lesion was a lie po sarcoma of the thigh.", "lie po sarcoma", "liposarcoma"),
    ("He had a history of crones disease for ten years.", "crones disease", "Crohn disease"),
    ("We received a whip all specimen this morning.", "whip all specimen", "Whipple specimen"),
    ("The progester own receptor was positive in most cells.", "progester own receptor", "progesterone receptor"),
    ("We tested for micro satellite instability by PCR.", "micro satellite instability",
     "microsatellite instability"),
    ("The a plastic thyroid carcinoma grew very fast.", "a plastic thyroid carcinoma", "anaplastic thyroid carcinoma"),
    ("There was pair a neural invasion at the edge.", "pair a neural invasion", "perineural invasion"),
    ("The vessel wall showed fiber annoyed necrosis.", "fiber annoyed necrosis", "fibrinoid necrosis"),
    ("The duct biopsy showed a coal angio carcinoma.", "coal angio carcinoma", "cholangiocarcinoma"),
    ("The tall sell variant is more aggressive.", "tall sell variant", "tall cell variant"),
    ("The mass sat in the naso fair inks of a young man.", "naso fair inks", "nasopharynx"),
    ("The cells were positive for sin apto fizzin.", "sin apto fizzin", "synaptophysin"),
    ("Thyroid glob you lin was negative in the metastasis.", "Thyroid glob you lin", "thyroglobulin"),
    ("The serum calci tonin was high before surgery.", "calci tonin", "calcitonin"),
    ("We saw nuclear groves and pseudo inclusions.", "nuclear groves", "nuclear grooves"),
    ("The nodule was full of call oid.", "call oid", "colloid"),
    ("The parotid mass was a play o morphic adenoma.", "play o morphic adenoma", "pleomorphic adenoma"),
    ("The surgeon sent a fine needle aspiration of the neck.", None, None),  # correct as heard
    ("We stained for kromo granin and it was strong.", "kromo granin", "chromogranin A"),
    ("The patient had an onco cytoma of the kidney.", "onco cytoma", "oncocytoma"),
    ("The section shows a medullary carcinoma with amyloid.", None, None),  # correct as heard
]
# correct sentences (synthetic) naming a real medical word or term close to a glossary key
HARD = [
    "The next slide shows intron at low power.",
    "We also saw anal squamous intraepithelial lesion in this case.",
    "We also saw acute tubular necrosis in this case.",
    "We also saw vocal cord polyp in this case.",
    "The next slide shows hyaline membranes at low power.",
    "We also saw cross-contamination in this case.",
    "We also saw vocal cord nodule in this case.",
    "We also saw DNA band in this case.",
    "We also saw cystic partially differentiated nephroblastoma in this case.",
    "Here the answer was intestinal type, not something else.",
    "The next slide shows hypothyroidism at low power.",
    "We also saw branchial cleft cyst in this case.",
    "We also saw light microscopy in this case.",
    "Here the answer was tumor regression grade, not something else.",
    "Here the answer was electron microscopy, not something else.",
    "Here the answer was polymorphism, not something else.",
    "The next slide shows intestinal metaplasia at low power.",
    "Here the answer was mRNA translation, not something else.",
    "We also saw tumor proportion score in this case.",
    "The next slide shows single nucleotide polymorphism at low power.",
    # 2026-10-15, ten more of the same kind
    "The child had pulmonary hypoplasia at birth.",
    "This is neoplasia, not a reactive change.",
    "The dental lamina gives rise to this cyst.",
    "The kidney showed nephrosis without inflammation.",
    "He had clonic seizures before the scan.",
    "The ilium was involved by the tumour.",
    "The peroneal nerve was free of tumour.",
    "She complained of dysphasia after the stroke.",
    "There was mucous material in the cyst.",
    "The surgeon did a lumpectomy last week.",
]
CARRIERS = [
    "Here you can see the {t} at high power.",
    "So this one is {t}, and that is the key point.",
    "We looked again and the {t} was obvious.",
    "In this case the final answer was {t} after review.",
    "Remember that {t} can look like other things.",
]
TALK = [
    "Okay, so let us move on to the next slide.",
    "Thank you all for joining us this afternoon.",
    "If you have questions, please type them in the chat.",
    "I want to show you a few more examples before we finish.",
    "This is a very common question that I get from residents.",
    "You can see that the cells are bigger here than over there.",
    "Let me go back one slide so you can see it again.",
    "We will take a short break and come back in ten minutes.",
    "So what would you do next in this situation?",
    "I think that is a good place to stop for today.",
]
VOWELS = "aeiou"
VOICE = {"d": "t", "t": "d", "b": "p", "p": "b", "g": "k", "k": "g", "v": "f", "f": "v", "s": "z", "z": "s"}
SPELL = [("ph", "f"), ("c", "k"), ("x", "ks"), ("ae", "e"), ("y", "i"), ("qu", "kw"), ("th", "t")]
ENDS = [("in", "en"), ("oma", "omer"), ("osis", "oses"), ("ia", "ier"), ("ic", "ick"), ("ous", "us"), ("al", "le"),
        ("ar", "er"), ("ine", "een"), ("ity", "aty")]


def mutate(word, rng):
    """One sound-alike change of a lower-case word (None when no rule applies)."""
    rules = list(range(6))
    rng.shuffle(rules)
    for r in rules:
        if r == 0:  # a vowel heard as another
            at = [i for i, ch in enumerate(word) if ch in VOWELS and i > 0]
            if at:
                i = rng.choice(at)
                return word[:i] + rng.choice([v for v in VOWELS if v != word[i]]) + word[i + 1:]
        elif r == 1:  # voicing
            at = [i for i, ch in enumerate(word) if ch in VOICE and i > 0]
            if at:
                i = rng.choice(at)
                return word[:i] + VOICE[word[i]] + word[i + 1:]
        elif r == 2:  # spelling of the same sound
            hits = [(a, b) for a, b in SPELL if a in word[1:]]
            if hits:
                a, b = rng.choice(hits)
                i = word.index(a, 1)
                return word[:i] + b + word[i + len(a):]
        elif r == 3:  # a dropped or doubled letter
            if len(word) > 6:
                i = rng.randrange(2, len(word) - 1)
                return word[:i] + word[i + 1:] if rng.random() < 0.5 else word[:i] + word[i] + word[i:]
        elif r == 4:  # split in two words
            if len(word) >= 8:
                i = rng.randrange(3, len(word) - 3)
                return word[:i] + " " + word[i:]
        else:  # the ending
            hits = [(a, b) for a, b in ENDS if word.endswith(a)]
            if hits:
                a, b = rng.choice(hits)
                return word[:-len(a)] + b
    return None


def pack_keys(ids):
    keys, seen = [], set()
    for pid in ids:
        pack = load_pack(ROOT / "packs" / pid)
        for row in pack.glossary:
            if row[0].lower() not in seen:
                seen.add(row[0].lower())
                keys.append(row[0])
    return keys


def generated(keys, rng, per_key):
    """[(sentence, heard span, key)] from sampled keys of >= 6 letters (one word changed), and [(sentence, key)] with
    the same carriers and the right keys."""
    heard, right = [], []
    sample = [k for k in keys if len(fold(k)) >= 6 and k.isascii()]
    rng.shuffle(sample)
    known = {tuple(w for _, _, w in words(k)) for k in keys}
    for key in sample[:per_key]:
        toks = key.split()
        long = [i for i, t in enumerate(toks) if len(t) >= 5 and t.isalpha()]
        if not long:
            continue
        i = rng.choice(long)
        new = mutate(toks[i].lower(), rng)
        if new is None:
            continue
        span = " ".join(toks[:i] + [new] + toks[i + 1:])
        if tuple(w for _, _, w in words(span)) in known:
            continue
        carrier = rng.choice(CARRIERS)
        heard.append((carrier.format(t=span), span, key))
        right.append(carrier.format(t=key))
    return heard, right


def sentences_of(path):
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    out, seen = [], set()
    for s in re.split(r"(?<=[.?!])\s+|\n+", text):
        s = s.strip()
        if len(s.split()) >= 4 and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def run(index, sentences, gate=LEXICON_GATE):
    """[(candidates, ms)] per sentence."""
    out = []
    for s in sentences:
        t0 = time.perf_counter()
        c = find_candidates(s, index, gate=gate)
        out.append((c, (time.perf_counter() - t0) * 1000))
    return out


def recall(rows, results):
    at = {1: 0, 3: 0, 10: 0}
    misses = []
    for (sentence, span, key), (cands, _) in zip(rows, results):
        tos = [c["to"].lower() for c in cands]
        for n in at:
            at[n] += key.lower() in tos[:n]
        if key.lower() not in tos:
            misses.append((span, key, [c["to"] for c in cands[:3]]))
    return at, misses


def pct(n, d):
    return "%d/%d (%.1f%%)" % (n, d, 100.0 * n / d) if d else "0/0"


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--packs", default="pathology,pathology-endocrine,pathology-gi,pathology-headneck,pathology-hpb,"
                    "pathology-breast,pathology-kidney,pathology-respiratory,molecular-pathology,molecular")
    ap.add_argument("--per-key", type=int, default=400, help="generated sentences (sampled keys)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--gate", choices=GATES, default=LEXICON_GATE)
    ap.add_argument("--lexicon", choices=("none", "terms", "all"), default="terms")
    ap.add_argument("--text", nargs="*", default=[])
    ap.add_argument("--json", default="")
    args = ap.parse_args(argv)
    keys = pack_keys(args.packs.split(","))
    t0 = time.perf_counter()
    lex = json.loads((ROOT / "web" / "engine" / "medical_words.json").read_text(encoding="utf-8"))
    lexicon = {"none": [], "terms": lex["terms"], "all": lex["terms"] + lex["corpus"]}[args.lexicon]
    index = term_index(keys, lexicon)
    print("keys %d, index %.1f ms, gate %s, lexicon %s (%d words)" % (
        len(keys), (time.perf_counter() - t0) * 1000, args.gate, args.lexicon, len(lexicon)))
    rng = random.Random(args.seed)
    lower = {k.lower() for k in keys}
    heard = [h for h in HEARD if h[1] and h[2].lower() in lower]  # the intended key must be in these packs
    gen, gen_right = generated(keys, rng, args.per_key)
    right = [s.replace(span, key) for s, span, key in heard] + [h[0] for h in HEARD if not h[1]] + gen_right + TALK
    report = {"keys": len(keys)}
    print("heard: %d of %d HEARD sentences have their key in these packs" % (len(heard), sum(1 for h in HEARD if h[1])))
    times = []
    for name, rows in (("heard", heard), ("generated", gen)):
        res = run(index, [r[0] for r in rows], args.gate)
        times += [ms for _, ms in res]
        at, misses = recall(rows, res)
        n = len(rows)
        print("%-9s n=%d recall@1 %s @3 %s @10 %s, candidates/sentence %.2f" % (
            name, n, pct(at[1], n), pct(at[3], n), pct(at[10], n), sum(len(c) for c, _ in res) / max(1, n)))
        for span, key, top in misses[:12]:
            print("  miss: %s -> %s (got %s)" % (ascii(span), ascii(key), ascii(top)))
        report[name] = {"n": n, "recall": at, "misses": misses}
    for span in ("puppy thyroid carcinoma", "sell block"):
        got = [h for h in HEARD if h[1] == span]
        c = run(index, [got[0][0]], args.gate)[0][0] if got else []
        print("survives %-24s %s" % (span + ":", ascii([(x["from"], x["to"]) for x in c])))
    res = run(index, HARD, args.gate)
    hard = [(s, c) for s, (c, _) in zip(HARD, res) if c]
    print("hard      n=%d sentences with a candidate %s" % (len(HARD), pct(len(hard), len(HARD))))
    for s, c in hard:
        print("  hard: %s -> %s" % (ascii(c[0]["from"]), ascii([x["to"] for x in c])))
    report["hard"] = {"n": len(HARD), "with_candidate": len(hard)}
    res = run(index, right, args.gate)
    times += [ms for _, ms in res]
    false = [len(c) for c, _ in res]
    print("correct   n=%d false candidates/sentence %.3f, sentences with any %s, max %d" % (
        len(right), sum(false) / len(right), pct(sum(1 for f in false if f), len(right)), max(false)))
    for s, (c, _) in zip(right, res):
        for x in c:
            print("  false: %s -> %s (%d)" % (ascii(x["from"]), ascii(x["to"]), x["score"]))
    report["correct"] = {"n": len(right), "false": sum(false), "with_any": sum(1 for f in false if f)}
    for path in args.text:
        sents = sentences_of(path)
        res = run(index, sents, args.gate)
        times += [ms for _, ms in res]
        found = [(x["from"], x["to"], x["score"]) for c, _ in res for x in c]
        print("text %s: %d sentences, %d candidates (%.2f per sentence)" % (
            ascii(Path(path).name), len(sents), len(found), len(found) / max(1, len(sents))))
        for f in found:
            print("  %s -> %s (%d)" % (ascii(f[0]), ascii(f[1]), f[2]))
    times.sort()
    print("time per sentence: mean %.2f ms, p95 %.2f ms, max %.2f ms (Python)" % (
        sum(times) / len(times), times[int(0.95 * (len(times) - 1))], times[-1]))
    if args.json:
        Path(args.json).write_text(json.dumps(report, ensure_ascii=True, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
