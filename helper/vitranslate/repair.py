"""Term repair candidates for speech-recognition text (spec
docs/superpowers/specs/2026-10-15-asr-term-repair-design.md).

Recognizers hear the words of a talk but misspell domain terms ("puppy thyroid carcinoma" for papillary thyroid
carcinoma, "Desmond" for desmin). find_candidates lists the glossary English keys that are CLOSE BUT NOT EQUAL to a
window of 1-4 words of a sentence, by spelling and by sound; the live translation on the host offers them to the model,
which replaces a heard span only when the term fits the context. Ported to web/engine/repair.js (parity fixtures:
tools/export_engine_fixtures.py section "repair").

- Words: runs of letters / digits (an apostrophe inside a word joins it, a possessive 's is dropped: "Hodgkin's" =
  "hodgkin"), folded to [a-z0-9] (NFKD, lower case, marks and other characters dropped); a key is read the same way.
- Spelling: the window's folded words joined without spaces; sound: sound_key of each word joined (inner vowels
  dropped, voiced / unvoiced pairs merged, common English digraphs). Similarity of a pair of strings = per mille of
  1 - Levenshtein / longer length (integers, so both runtimes rank alike); a pair counts when both similarities are
  >= MIN_PART and their mean is >= MIN_SCORE.
- A key that occurs in the sentence (same words; the last one may be a plural, -ed or -ing form; US / UK spelling) is
  never a candidate. A window is trusted when it is such an occurrence of some key, or when its words without the
  STOPWORDS at either end are all words of the keys ("classification", "luminal", "and the renal cortex") or long
  words of a well-formed English / medical shape (>= FORMED letters ending in one of ENDINGS: "intestinal",
  "microscopy", "polymorphism"; recognizers write real words, and a long real word is rarely a mis-hearing of a
  different term): when the best window of a key is a trusted one, the recognizer wrote valid words there and the key
  is not offered. A mis-heard term made only of such words is therefore never repaired (the price of no
  over-correction: the model, offered "intestinal" -> interstitial, takes it).
- Another form of a key's stem is not a mis-hearing either: a window with the key's words but the last, whose last
  word shares the start of the key's last word (>= STEM letters), differs only in an ending of <= ENDING letters on
  each side and sounds different ("hyperplastic" / hyperplasia, "papillae" / papillary, "translocated" /
  translocation) counts as trusted for that key; a slip that sounds the same ("carcinomma") stays a candidate.
- Lexicon gate (option D of the 2026-10-15 measurement; LEXICON_GATE, the lexicon: web/engine/medical_words.json,
  tools/build_lexicon.py, given to term_index): the model takes almost every sound-alike it is offered, also where a
  real medical word was heard ("intestinal" -> interstitial), so a window and a key with the same number of words are
  no candidate pair when the heard words hold a medical word: "any" = any content word (not a STOPWORD) of the
  window, "changed" = any of its content words that is not a word of the key ("puppy" of "puppy thyroid carcinoma"
  is no medical word: kept; "vocal" of "vocal cord": dropped), "off" = no gate (the finder before the gate). A
  different number of words (a split or merged term: "angio my oh lipoma") or a capitalised word inside the sentence
  (a name: "Desmond") passes the gate; words joined by a hyphen count as one there ("high-grade"). A word with a
  procedure ending (PROCEDURES: "lumpectomy") is a medical word too. A dropped pair counts as trusted for that key.
  No lexicon: no gate. "off" is the finder of commit 11de5f8 but for the longer STOPWORDS list.
- One window per key (its best: highest score, then the earliest, then the shortest), best keys first, at most
  `limit`. Keys shorter than MIN_CHARS letters (acronyms such as ER) are never offered."""
import re
import unicodedata

from .matching import _variants

MAX_CANDIDATES = 10
MAX_WORDS = 4
MIN_SCORE = 750  # per mille: mean of the spelling and the sound similarity
MIN_PART = 600  # per mille: each of them
MIN_CHARS = 4  # folded letters / digits of a key
GATES = ("off", "any", "changed")
LEXICON_GATE = "changed"  # see the module notes (the owner's choice, 2026-10-15)
PROCEDURES = ("ectomy", "otomy", "ostomy", "plasty", "scopy", "graphy", "pexy", "rrhaphy", "centesis", "tripsy")
FORMED = 8  # a word this long with one of ENDINGS is taken as a real word as heard
ENDINGS = ("al", "ar", "ary", "ic", "ism", "ist", "ia", "ion", "osis", "itis", "oma", "ous", "ive", "ity",
           "ment", "ence", "ance", "ent", "ant", "able", "ible", "ing", "ogy", "copy", "phy", "cyte", "cytes",
           "ure")
STEM = 5  # letters two forms of one stem share at least ...
ENDING = 4  # ... before endings of at most this many letters (hyperplastic / hyperplasia)
APOSTROPHES = "'" + chr(0x2019)
WORD_RE = re.compile(r"[^\W_]+(?:[" + APOSTROPHES + r"][^\W_]+)*")
VOWELS = "aeiou"
UK_US = (("ae", "e"), ("oe", "e"), ("our", "or"), ("ise", "ize"), ("yse", "yze"), ("tre", "ter"))
# function and talk words: a window made of glossary words with these around them is trusted
STOPWORDS = frozenset((
    "a an the and or but if so as at by for from in into of on onto to with without about over under than then that "
    "this these those there here is are was were be been being am do does did has have had can could will would "
    "shall should may might must it its we you he she they i me my our your his her their them us not no yes very "
    "just also only even still all any some each every let lets go going okay ok well now one two three four five "
    "six seven eight nine ten "
    "else something anything nothing everything someone anyone everyone thing things stuff kind sort really "
    "actually maybe quite much many more most less few other another same such like get got see saw seen look "
    "looks looking say said think know mean right yeah um uh oh ah hmm which what who when where why how "
    "because while again out up down off back way").split())
CODES = {"b": "P", "p": "P", "d": "T", "t": "T", "k": "K", "q": "K", "f": "F", "v": "F", "s": "S", "z": "S",
         "j": "J", "l": "L", "m": "M", "n": "N", "r": "R"}


def fold(word):
    """A word as [a-z0-9] only: NFKD, lower case, everything else dropped."""
    return "".join(c for c in unicodedata.normalize("NFKD", word).lower() if "a" <= c <= "z" or "0" <= c <= "9")


def words(text):
    """[(start, end, folded word)] of text; words that fold to nothing are left out."""
    out = []
    for m in WORD_RE.finditer(text):
        word = m.group(0)
        if len(word) > 2 and word[-2] in APOSTROPHES and word[-1] in "sS":
            word = word[:-2]  # a possessive: Hodgkin's = Hodgkin
        w = fold(word)
        if w:
            out.append((m.start(), m.end(), w))
    return out


def _collapse(w):
    return "".join(c for i, c in enumerate(w) if i == 0 or c != w[i - 1])


def sound_key(word):
    """A simple English sound key of a folded word: digits kept, a leading vowel (or y / w / h before one) -> "A",
    other vowels and h / w / y dropped, voiced / unvoiced pairs merged (b p -> P, d t -> T, g k c q -> K, v f -> F,
    z s -> S), ph -> F, th -> 0, sh -> X, ch -> X (K before r / l and in a leading "cho"), -tion / -sion -> XN,
    c / g before e i y -> S / J, x -> KS; doubled letters and repeated codes of adjacent letters count once."""
    w = _collapse(word)
    for head, rest in (("kn", "n"), ("gn", "n"), ("pn", "n"), ("wr", "r"), ("ps", "s"), ("wh", "w"), ("x", "s")):
        if w.startswith(head):
            w = rest + w[len(head):]
            break
    out = []
    last = ""

    def emit(code):
        nonlocal last
        if code != last:
            out.append(code)
        last = code

    i = 0
    n = len(w)
    while i < n:
        c = w[i]
        nxt = w[i + 1] if i + 1 < n else ""
        if c.isdigit():
            emit(c)
            i += 1
            continue
        if c in VOWELS:
            if i == 0:
                emit("A")
            last = ""
            i += 1
            continue
        if c in "hwy":
            if i == 0 and nxt and nxt in VOWELS + "y":
                emit("A")
                i += 2
                last = ""
                continue
            i += 1
            continue
        if w.startswith(("tion", "sion"), i):
            emit("X")
            emit("N")
            i += 4
            continue
        two = w[i:i + 2]
        if two == "ph":
            emit("F")
        elif two == "th":
            emit("0")
        elif two == "sh":
            emit("X")
        elif two == "ch":
            after = w[i + 2:i + 3]
            emit("K" if after in ("r", "l") or (i == 0 and after == "o") else "X")
        elif two == "ck":
            emit("K")
        elif two == "gh":
            if i == 0:
                emit("K")
        elif two == "dg":
            emit("J")
        else:
            if c == "c":
                emit("S" if nxt and nxt in "eiy" else "K")
            elif c == "g":
                emit("J" if nxt and nxt in "eiy" else "K")
            elif c == "x":
                emit("K")
                emit("S")
            else:
                emit(CODES[c])
            i += 1
            continue
        i += 2
    return "".join(out)


def _uk(w):
    for a, b in UK_US:
        w = w.replace(a, b)
    return w


def _forms(toks):
    """Every way the word list may be written as the same term: US / UK spelling, the last word as a plural,
    singular, -ed or -ing form."""
    toks = [_uk(t) for t in toks]
    last = toks[-1]
    alts = [last] + _variants(last)
    if len(last) > 5:
        if last.endswith("ed"):
            alts += [last[:-2], last[:-1]]
        if last.endswith("ing"):
            alts += [last[:-3], last[:-3] + "e"]
    return {tuple(toks[:-1] + [a]) for a in alts}


def _related(toks, ktoks):
    """True when the word lists differ only in the ending of the last word (see the module notes)."""
    if len(toks) != len(ktoks) or [_uk(t) for t in toks[:-1]] != [_uk(t) for t in ktoks[:-1]]:
        return False
    a, b = toks[-1], ktoks[-1]
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]:
        n += 1
    return n >= STEM and len(a) - n <= ENDING and len(b) - n <= ENDING and sound_key(a) != sound_key(b)


def _distance(a, b, limit):
    """Levenshtein distance of a and b, or limit + 1 once it is known to be larger."""
    la, lb = len(a), len(b)
    if abs(la - lb) > limit:
        return limit + 1
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        ca = a[i - 1]
        low = i
        for j in range(1, lb + 1):
            v = prev[j - 1] if ca == b[j - 1] else prev[j - 1] + 1
            if prev[j] + 1 < v:
                v = prev[j] + 1
            if cur[j - 1] + 1 < v:
                v = cur[j - 1] + 1
            cur[j] = v
            if v < low:
                low = v
        if low > limit:
            return limit + 1
        prev = cur
    return prev[lb]


def _limit(longest, need):
    """The largest distance d with 1000 * (longest - d) // longest >= need (per mille)."""
    return (longest * (1000 - need)) // 1000


def _pairs(s):
    return [s[i:i + 2] for i in range(len(s) - 1)]


def _bound(la, lb):
    """The best per mille similarity two strings of these lengths can have."""
    longest = max(la, lb)
    return (1000 * (longest - abs(la - lb))) // longest


class TermIndex:
    """The glossary keys of a job, read once: per key its spelling, sound, letter pairs and forms; the keys that may
    be offered grouped by the first code of their sound and the length of their sound key."""

    def __init__(self, keys, lexicon=()):
        self.lexicon = frozenset(lexicon)  # folded medical words (the lexicon gate)
        self.keys = []
        self.by_form = {}
        self.by_head = {}
        self.vocab = set()  # every word of a key, in each of its forms
        seen = set()
        for key in keys:
            kws = words(key)
            toks = [w for _, _, w in kws]
            if not toks or key.lower() in seen:
                continue
            seen.add(key.lower())
            k = len(self.keys)
            spell = "".join(toks)
            sound = "".join(sound_key(t) for t in toks)
            self.keys.append((key, spell, sound, set(_pairs(spell)), set(_pairs(sound)), toks,
                              _units(key, kws, 0, len(kws))))
            for f in _forms(toks):
                self.by_form.setdefault(f, []).append(k)
            for t in toks:
                self.vocab.update(f[0] for f in _forms([t]))
            if len(spell) >= MIN_CHARS and sound:
                self.by_head.setdefault(sound[0], {}).setdefault(len(sound), []).append(k)


def term_index(keys, lexicon=()):
    return TermIndex(keys, lexicon)


def _medical(word, lexicon):
    return any(f[0] in lexicon for f in _forms([word])) or word in lexicon or word.endswith(PROCEDURES)


def _units(text, ws, i, j):
    """Words i..j-1 of ws counted with the ones joined by a hyphen as one ("high-grade" = 1)."""
    return (j - i) - sum(1 for n in range(i, j - 1) if text[ws[n][1]:ws[n + 1][0]] == "-")


def _gated(gate, toks, ktoks, named, lexicon, units, kunits):
    """True when the lexicon gate drops the pair of a window (its words, whether it holds a name, its word count with
    hyphenated words as one) and a key (its words and word count)."""
    if gate == "off" or not lexicon or named or units != kunits:
        return False
    content = [t for t in toks if t not in STOPWORDS]
    if gate == "changed":
        own = {_uk(t) for t in ktoks}
        content = [t for t in content if _uk(t) not in own]
    return any(_medical(t, lexicon) for t in content)


def known(toks, index):
    """True when the words, without the stopwords at either end, are all words of the glossary keys or long words of
    a well-formed shape (none left is also true): the recognizer wrote real words there."""
    a, b = 0, len(toks)
    while a < b and toks[a] in STOPWORDS:
        a += 1
    while b > a and toks[b - 1] in STOPWORDS:
        b -= 1
    return all(_uk(t) in index.vocab or (len(t) >= FORMED and t.endswith(ENDINGS)) for t in toks[a:b])


def _names(text, ws):
    """Per word: a capitalised word (an upper-case first letter, a lower-case letter after it) inside a sentence."""
    out = []
    for n, (start, end, _) in enumerate(ws):
        word = text[start:end]
        before = text[:start].rstrip()
        out.append(n > 0 and bool(before) and before[-1] not in ".!?:" and word[0].isupper() and
                   any(c.islower() for c in word[1:]))
    return out


def find_candidates(text, index, limit=MAX_CANDIDATES, min_score=MIN_SCORE, gate=LEXICON_GATE):
    """[{from: the heard span as written, to: the key, score: per mille, words: [first, end) word indices}] of text,
    best first (see the module notes)."""
    ws = words(text)
    sounds = [sound_key(w) for _, _, w in ws]
    names = _names(text, ws)
    present = set()
    windows = []  # (start word, end word, spelling, sound, trusted)
    for i in range(len(ws)):
        for j in range(i + 1, min(i + MAX_WORDS, len(ws)) + 1):
            toks = [w for _, _, w in ws[i:j]]
            trusted = known(toks, index)
            for f in _forms(toks):
                for k in index.by_form.get(f, ()):
                    present.add(k)
                    trusted = True
            spell = "".join(toks)
            sound = "".join(sounds[i:j])
            windows.append((i, j, spell, sound, trusted, _pairs(spell), _pairs(sound), toks, _units(text, ws, i, j)))
    need = 2 * min_score
    best = {}  # key -> (score, start, length, trusted)
    for i, j, spell, sound, trusted, pairs, spairs, toks, units in windows:
        lengths = index.by_head.get(sound[:1])
        if not lengths:
            continue
        ls, lp = len(sound), len(spell)
        for lk, ks in lengths.items():
            b1 = _bound(ls, lk)
            if b1 < MIN_PART or b1 + 1000 < need:
                continue
            for k in ks:
                if k in present:
                    continue
                _, kspell, ksound, kpairs, kspairs, ktoks, kunits = index.keys[k]
                b2 = _bound(lp, len(kspell))
                if b2 < MIN_PART or b1 + b2 < need:
                    continue
                # each edit changes at most two letter pairs of the window: d >= (pairs not in the key + 1) // 2
                longest = max(lp, len(kspell))
                missing = len(pairs) - sum(1 for q in pairs if q in kpairs)
                if (missing + 1) // 2 > _limit(longest, max(MIN_PART, need - b1)):
                    continue
                longest = max(ls, lk)
                missing = len(spairs) - sum(1 for q in spairs if q in kspairs)
                if (missing + 1) // 2 > _limit(longest, max(MIN_PART, need - b2)):
                    continue
                d = _distance(sound, ksound, _limit(longest, max(MIN_PART, need - b2)))
                s1 = (1000 * (longest - d)) // longest
                if s1 < MIN_PART or s1 + b2 < need:
                    continue
                longest = max(lp, len(kspell))
                d = _distance(spell, kspell, _limit(longest, max(MIN_PART, need - s1)))
                s2 = (1000 * (longest - d)) // longest
                if s2 < MIN_PART or s1 + s2 < need:
                    continue
                score = (s1 + s2) // 2
                sure = trusted or _related(toks, ktoks) or _gated(gate, toks, ktoks, any(names[i:j]),
                                                                  index.lexicon, units, kunits)
                have = best.get(k)
                if have is None or (score, -i, i - j) > (have[0], -have[1], -have[2]) or (
                        score == have[0] and sure and not have[3]):
                    best[k] = (score, i, j - i, sure)
    out = []
    for k, (score, i, length, trusted) in best.items():
        if trusted:
            continue
        key = index.keys[k][0]
        out.append((-score, i, key.lower(), key, {"from": text[ws[i][0]:ws[i + length - 1][1]], "to": key,
                                                  "score": score, "words": [i, i + length]}))
    out.sort(key=lambda r: r[:4])
    return [r[4] for r in out[:limit]]
