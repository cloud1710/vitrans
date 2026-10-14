"""Pack selection v1: TF-IDF cosine between the document and each pack profile of the registry manifest, gated by the
pack's detect keywords.

Document vector over the manifest vocabulary (union of the profile terms): whole-word, plural-tolerant counts,
weight (1 + ln tf) * idf. A pack is selected when its cosine >= THRESHOLD, at least `min_terms` distinct profile
terms occur AND its detect keywords (manifest "detect") occur at least `min_detect` times in all. Family rule
(families(), decision 12 of the 2026-10-14 pack roadmap): a selected pack brings its parent chain along (reason
"parent"); family = root + its selected children; at most MAX_FAMILIES families ranked by their best score and
MAX_PACKS packs, a family that does not fit is dropped whole; within a family the child comes before its parent (the
merge order: the child's rows and term fixes win). Embedding cosine is a later second stage behind the same interface.

Calibration 2026-10-13 (profile = packs/pathology 0.1.2 alone: 659 terms, 32 detect keywords; whole-document text
from collect_items; "before" = cosine >= 0.10 and >= 3 terms, "after" = also >= 2 detect-keyword occurrences):
  document                       score  terms  detect  before  after
  pathology corpus (private/corpus.txt)
  Thyroid pitfalls deck          0.366    76     156    yes     yes
  Meningioma deck                0.296    61      75    yes     yes
  Neurodegeneration deck         0.291    54      39    yes     yes
  Renal tumours deck             0.278    45     142    yes     yes
  IHC EQA deck                   0.240    36      40    yes     yes
  Neuropathology abstract        0.151    11      11    yes     yes
  Pathologist CV                 0.124     9       6    yes     yes
  test fixtures pptx / docx      0.134 / 0.114  7 / 5   4 / 2  yes  yes
  non-medical (tests/nonmedical.py)
  agri genetics                  0.159    21       0    YES     no
  release notes                  0.155    20       0    YES     no
  finance report                 0.150    18       0    YES     no
  engineering spec               0.146    17       0    YES     no
  HR policy                      0.142    17       0    YES     no
  stats tutorial                 0.132    16       0    YES     no
  ISO 9001 procedure             0.127    14       0    YES     no
  wood staining guide            0.124    12       0    YES     no
  nuclear physics lecture        0.113    10       0    YES     no
  software README                0.077     5       0    no      no
  budget memo / school notice    0.051     2       0    no      no
  news article                   0.036     1       0    no      no
The cosine alone cannot separate them: generic glossary keys (threshold, deletion, marker, professor, quality
manual...) lift long technical texts to 0.11-0.16, above the CV (0.124). The detect keywords are what separates
them: 0 occurrences in every non-medical text, >= 2 in every pathology document. Detect keywords must not be
everyday words: with "staining" and "nuclei" still detect keywords (0.1.1) the wood staining guide (8 hits, 0.141)
and the nuclear physics lecture (13 hits, 0.130) were selected; 0.1.2 drops both (build_registry warns about such
words). THRESHOLD = 0.10 stays.
"""
import math
import re
from collections import Counter
from dataclasses import dataclass, field, replace

THRESHOLD = 0.10
MIN_TERMS = 3
MIN_DETECT = 2
TOKEN_RE = re.compile(r"[^\W_]+(?:-[^\W_]+)*")  # words; hyphenated compounds (Ki-67, lymph-node) stay one token


@dataclass
class Match:
    entry: dict
    score: float
    matched: list = field(default_factory=list)  # up to 8 terms, highest contribution first
    terms: int = 0                               # distinct profile terms found in the document
    detect_hits: int = 0                         # occurrences of the pack's detect keywords
    reason: str = "match"                        # match | parent | user


def tokens(text):
    return TOKEN_RE.findall(text.lower())


def _variants(word):
    """Forms a final word may stand for, tried in order after the word itself: tumors -> tumor, boxes -> box,
    biopsies -> biopsy, nucleus -> nuclei, nuclei -> nucleus, bronchi -> bronchus."""
    out = []
    if len(word) > 3 and word.endswith("s"):
        out.append(word[:-1])
        if word.endswith("es"):
            out.append(word[:-2])
        if len(word) > 4 and word.endswith("ies"):
            out.append(word[:-3] + "y")
        if len(word) > 4 and word.endswith("us"):
            out.append(word[:-2] + "i")
    if len(word) > 4 and word.endswith("i"):
        out.append(word[:-1] + "us")
    return out


def count_terms(text, terms):
    """{term: occurrences} for the terms found in text. Terms and text are tokenized alike and counted by n-gram
    lookup; the last word may be a plural / singular variant of the term's last word (see _variants)."""
    index, first, longest = {}, set(), 0
    for term in terms:
        key = tuple(tokens(term))
        if key:
            index.setdefault(key, []).append(term)
            first.add(key[0])
            longest = max(longest, len(key))
    toks = tokens(text)
    counts = Counter()
    for i, tok in enumerate(toks):
        if tok not in first and not any(v in first for v in _variants(tok)):
            continue
        for n in range(1, min(longest, len(toks) - i) + 1):
            gram = tuple(toks[i:i + n])
            hit = index.get(gram)
            if hit is None:
                for v in _variants(gram[-1]):
                    hit = index.get(gram[:-1] + (v,))
                    if hit is not None:
                        break
            for term in hit or ():
                counts[term] += 1
    return dict(counts)


def score_packs(text, manifest):
    """A Match for every pack of the manifest, best first (no threshold, no gate)."""
    packs = manifest.get("packs") or []
    idf = manifest.get("idf") or {}
    vocab = set()
    for entry in packs:
        vocab.update(entry.get("profile") or {})
        vocab.update(entry.get("detect") or [])
    counts = count_terms(text, vocab)
    doc = {t: (1.0 + math.log(c)) * idf.get(t, 1.0) for t, c in counts.items()}
    dnorm = math.sqrt(sum(v * v for v in doc.values()))
    out = []
    for entry in packs:
        prof = entry.get("profile") or {}
        pnorm = math.sqrt(sum(w * w for w in prof.values()))
        contrib = {t: v * prof[t] for t, v in doc.items() if t in prof}
        score = sum(contrib.values()) / (dnorm * pnorm) if dnorm and pnorm else 0.0
        ranked = sorted(contrib, key=lambda t: (-contrib[t], t))
        hits = sum(counts.get(t, 0) for t in set(entry.get("detect") or []))
        out.append(Match(entry, score, ranked[:8], len(contrib), hits))
    out.sort(key=lambda m: (-m.score, str(m.entry.get("id"))))
    return out


MAX_FAMILIES = 3  # families per document (family = a root pack + its selected children)
MAX_PACKS = 6     # hard cap on packs per document


def _ancestors(pid, by_id):
    """Parent chain of pid inside by_id, nearest first (a parent missing from the manifest ends it; cycles stop)."""
    chain, parent = [], by_id[pid].entry.get("parent")
    while parent in by_id and parent != pid and parent not in chain:
        chain.append(parent)
        parent = by_id[parent].entry.get("parent")
    return chain


def families(chosen, scored, max_families=None, max_packs=None):
    """The chosen matches in merge order, grouped by family.

    Family = a root pack (top of the parent chain within `scored`) + its chosen descendants + the ancestors between
    them (reason "parent" when not chosen themselves). Families rank by the best score of their chosen packs; inside a
    family every pack comes before its parent (deepest first, then by score), so a child's rows and term fixes win
    the merge even when the parent scores higher. At most max_families families and max_packs packs (None: no
    limit): a family that does not fit is dropped whole, never a child without its root; a later, smaller family may
    still fit."""
    by_id = {m.entry.get("id"): m for m in scored}
    by_id.update({m.entry.get("id"): m for m in chosen})
    groups = {}  # root id -> {pack id: (depth, match)}
    for m in chosen:
        pid = m.entry.get("id")
        chain = _ancestors(pid, by_id)
        members = groups.setdefault(chain[-1] if chain else pid, {})
        members[pid] = (len(chain), m)
        for depth, anc in enumerate(chain):
            if anc not in members:
                members[anc] = (len(chain) - 1 - depth, replace(by_id[anc], reason="parent"))
    chosen_ids = {m.entry.get("id") for m in chosen}

    def best(root):
        return max(m.score for pid, (_, m) in groups[root].items() if pid in chosen_ids)

    out, used = [], 0
    for root in sorted(groups, key=lambda r: (-best(r), r)):
        if max_families is not None and used >= max_families:
            break
        members = sorted(groups[root].values(), key=lambda dm: (-dm[0], -dm[1].score, str(dm[1].entry.get("id"))))
        if max_packs is not None and len(out) + len(members) > max_packs:
            continue
        out += [m for _, m in members]
        used += 1
    return out


def select_packs(text, manifest, threshold=THRESHOLD, min_terms=MIN_TERMS, max_packs=MAX_PACKS, min_detect=MIN_DETECT,
                 max_families=MAX_FAMILIES):
    scored = score_packs(text, manifest)
    chosen = [m for m in scored if m.score >= threshold and m.terms >= min_terms and m.detect_hits >= min_detect]
    return families(chosen, scored, max_families, max_packs)
