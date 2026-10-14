"""Deterministic checks and fixes applied to every translated segment."""
import re
import unicodedata
from functools import lru_cache

from .tags import TOKEN_RE
from .vnsyllable import is_valid, suspicious

_THINK_RE = re.compile(r"<think>.*?</think>", re.S)
_THINK_OPEN_RE = re.compile(r"<think>.*$", re.S)
_SWITCH_RE = re.compile(r"\s*/no_?think\b")
_LABEL_RE = re.compile(r"^\s*(?:here is the (?:vietnamese )?translation|translation|translate|vietnamese|"
                       r"b\u1ea3n d\u1ecbch)\s*:\s*", re.I)
# a first line that only announces the translation ("Here is the Vietnamese translation:"); segments have no newline
_PREFACE_RE = re.compile(r"^[^\n]*(?:translat|vietnamese|b\u1ea3n d\u1ecbch|ti\u1ebfng vi\u1ec7t)[^\n]*:[ \t]*\n", re.I)
_FENCE_RE = re.compile(r"^```[^\n]*\n(.*?)\n?```$", re.S)
_WORD_COLON_RE = re.compile(r"^\s*[^\W\d_]+\s*:")
_QUOTES = {"\"": "\"", "\u201c": "\u201d", "'": "'"}
_EN_STOP = {"the", "of", "and", "with", "for", "is", "are", "was", "were", "by", "from", "that", "this", "which",
            "after", "before", "not", "between", "into", "these", "those", "has", "have", "been", "their"}
_NUM_RE = re.compile(r"\d+(?:[.,]\d+)*")
_QUOTED_RE = re.compile(r"\"[^\"]*\"|\u201c[^\u201d]*\u201d|\([^)]*\)|\[[^\]]*\]")
_TITLE_RUN_RE = re.compile(r"\b[A-Z]\w*(?:\s+(?:(?:of|and|the|for|in)\s+){0,2}[A-Z]\w*){2,}")


@lru_cache(maxsize=2048)
def _rx(pattern, flags=0):
    return re.compile(pattern, flags)


def _nfc(text):
    return unicodedata.normalize("NFC", text)


# American / British spellings of medical words (either may be the glossary key)
_SPELLINGS = (("tumor", "tumour"), ("estrogen", "oestrogen"), ("edema", "oedema"), ("esophag", "oesophag"),
              ("anemi", "anaemi"), ("ischemi", "ischaemi"), ("leukemi", "leukaemi"), ("pediatr", "paediatr"),
              ("behavior", "behaviour"), ("color", "colour"), ("center", "centre"), ("fiber", "fibre"),
              ("fetal", "foetal"), ("fetus", "foetus"), ("celiac", "coeliac"), ("diarrhea", "diarrhoea"),
              ("gynecolog", "gynaecolog"), ("etiolog", "aetiolog"))
_PLURALS = (("y", "ies"), ("is", "es"), ("us", "i"), ("um", "a"), ("ix", "ices"), ("ex", "ices"))


def _word_forms(w):
    """Spellings of one glossary word: -logy / -logic / -logical (pathology, pathologic, pathological) and -ic ->
    -ical in that family only (clinic never becomes clinical), American / British spelling, hem- / haem-,
    -ize / -ise."""
    forms = {w}
    if w.endswith("logy"):
        forms |= {w[:-1] + "ic", w[:-1] + "ical"}
    elif w.endswith("logic"):
        forms |= {w + "al", w[:-2] + "y"}
    elif w.endswith("logical"):
        forms |= {w[:-2], w[:-4] + "y"}
    for f in list(forms):
        for us, uk in _SPELLINGS:
            if us in f:
                forms.add(f.replace(us, uk))
            elif uk in f:
                forms.add(f.replace(uk, us))
    for f in list(forms):
        if f.startswith("hem") and len(f) > 4:
            forms.add("haem" + f[3:])
        elif f.startswith("haem") and len(f) > 5:
            forms.add("hem" + f[4:])
        m = re.search(r"i([sz])(e|ed|es|ing|ation|ations)$", f)
        if m:
            forms.add(f[:m.start(1)] + ("s" if m.group(1) == "z" else "z") + f[m.end(1):])
    return sorted(forms, key=lambda f: (-len(f), f))


def _last_forms(w):
    """Forms of a term's last word: its spellings, each also as a plural (regular and Latin / Greek irregular)."""
    out = []
    for f in _word_forms(w):
        out.append(re.escape(f) + "(?:s|es)?")
        for end, plural in _PLURALS:
            if f.endswith(end) and len(f) > len(end):
                out.append(re.escape(f[:-len(end)] + plural))
    return out


@lru_cache(maxsize=4096)
def _bounded(term):
    """Whole-word, lower-case pattern of a glossary term: plurals of the last word, spelling and -logy / -logic
    variants of every word, a space or a hyphen between words ("lymph node" = "lymph-node"); a term never matches
    inside a hyphenated compound ("node" is not in "lymph-node")."""
    words = [w for w in re.split(r"[\s-]+", term.lower().strip()) if w]
    if not words:
        return r"(?!)"
    parts = ["(?:" + "|".join(re.escape(f) for f in _word_forms(w)) + ")" for w in words[:-1]]
    parts.append("(?:" + "|".join(_last_forms(words[-1])) + ")")
    return r"(?<![\w-])" + r"[\s-]+".join(parts) + r"(?![\w-])"


def strip_leaks(src, out):
    """Remove model chatter; restore the source's leading / trailing whitespace."""
    if "</think>" in out:
        out = out.rsplit("</think>", 1)[1]
    out = _THINK_RE.sub("", out)
    out = _THINK_OPEN_RE.sub("", out)
    out = _SWITCH_RE.sub("", out).strip()
    if "\n" not in src:
        out = _PREFACE_RE.sub("", out).strip()
    if "```" not in src:
        fence = _FENCE_RE.match(out)
        if fence:
            out = fence.group(1)
    if not _WORD_COLON_RE.match(src):
        out = _LABEL_RE.sub("", out)
    out = out.strip()
    if len(out) >= 2 and out[0] in _QUOTES and out[-1] == _QUOTES[out[0]] and src.strip()[:1] not in _QUOTES:
        inner = out[1:-1]
        if out[0] not in inner and out[-1] not in inner:
            out = inner.strip()
    lead = src[:len(src) - len(src.lstrip())]
    trail = src[len(src.rstrip()):]
    return lead + out + trail


def _first_alnum(text):
    """Index of the first letter or digit outside tag tokens, or -1."""
    pos = 0
    while pos < len(text):
        m = TOKEN_RE.match(text, pos)
        if m:
            pos = m.end()
        elif text[pos].isalnum():
            return pos
        else:
            pos += 1
    return -1


def source_case(src_plain, out):
    """Sentence-initial case from the source: when the source starts with a capital letter (digits and marks before
    it aside, "HER2 status" too) and the translation starts with a lower-case letter, that letter becomes a capital.
    A first word with a digit or a capital ("p53", "mRNA", "pH") or written that way in the source ("tau", "von",
    "mm") keeps its case; tags are skipped."""
    s, i = _first_alnum(src_plain), _first_alnum(out)
    if s < 0 or i < 0 or not src_plain[s].isupper() or not out[i].islower():
        return out
    word = _WORD_RE.match(out, i).group(0)
    if any(c.isdigit() or c.isupper() for c in word):
        return out
    if re.search(r"(?<![^\W_])" + re.escape(word) + r"(?![^\W_])", src_plain):
        return out
    return out[:i] + out[i].upper() + out[i + 1:]


def _prose(text):
    """Text with quoted / bracketed spans and Title-Case runs (WHO titles, journals) removed."""
    return _TITLE_RUN_RE.sub(" ", _QUOTED_RE.sub(" ", text))


def _stop_count(text):
    return sum(w in _EN_STOP for w in re.findall(r"[a-z]+", _prose(text).lower()))


def english_left(src_plain, out_plain):
    """True when the source reads as English prose and the output still does."""
    norm = lambda t: " ".join(t.lower().split())
    if norm(src_plain) == norm(out_plain) and len(re.findall(r"\b[a-z]{3,}\b", _prose(src_plain))) >= 3:
        return True
    if _stop_count(src_plain) < 2:
        return False
    return _stop_count(out_plain) >= 2


# Anatomical sites: a Vietnamese form and the English word stems that name it (a stem starts a source word: "nephr"
# in "nephrectomy"). A longer form comes before the shorter form it contains (b\u1ec3 th\u1eadn before th\u1eadn).
SITES = (
    ("b\u1ec3 th\u1eadn", ("pelvis", "pelvic", "pyel", "calyx", "calyc", "calice")),
    ("th\u01b0\u1ee3ng th\u1eadn", ("adrenal", "suprarenal")),
    ("th\u1eadn", ("kidney", "renal", "nephr")),
    ("ni\u1ec7u qu\u1ea3n", ("ureter",)),
    ("ni\u1ec7u \u0111\u1ea1o", ("urethr",)),
    ("b\u00e0ng quang", ("bladder", "vesic", "urothel")),
    ("gan", ("liver", "hepat")),
    ("m\u00e0ng ph\u1ed5i", ("pleura",)),
    ("ph\u1ed5i", ("lung", "pulmon", "pneum")),
    ("c\u1eadn gi\u00e1p", ("parathyroid",)),
    ("tuy\u1ebfn gi\u00e1p", ("thyroid",)),
    ("v\u00fa", ("breast", "mammar")),
    ("tuy\u1ebfn ti\u1ec1n li\u1ec7t", ("prostat",)),
    ("c\u1ed5 t\u1eed cung", ("cervix", "cervical")),
    ("t\u1eed cung", ("uterus", "uterine", "endometri", "womb")),
    ("bu\u1ed3ng tr\u1ee9ng", ("ovary", "ovarian", "ovaries")),
    ("tinh ho\u00e0n", ("testis", "testes", "testic")),
    ("d\u1ea1 d\u00e0y", ("stomach", "gastr")),
    ("\u0111\u1ea1i tr\u00e0ng", ("colon", "colorect")),
    ("tr\u1ef1c tr\u00e0ng", ("rectum", "rectal", "rectosigm")),
    ("t\u1ee5y", ("pancrea",)),
    ("l\u00e1ch", ("spleen", "splen")),
    ("th\u1ef1c qu\u1ea3n", ("esophag", "oesophag")),
    ("m\u00e0ng n\u00e3o", ("mening",)),
    ("ti\u1ec3u n\u00e3o", ("cerebell",)),
    ("n\u00e3o", ("brain", "cerebr", "encephal")),
    ("x\u01b0\u01a1ng", ("bone", "osse", "osteo", "skelet")),
    ("tim", ("heart", "cardi")),
    ("t\u00fai m\u1eadt", ("gallbladder", "cholecyst")),
    ("tuy\u1ebfn n\u01b0\u1edbc b\u1ecdt", ("saliv", "parotid", "submandib")),
    ("thanh qu\u1ea3n", ("laryn",)),
    ("tuy\u1ebfn y\u00ean", ("pituitar", "hypophys")),
    ("amidan", ("tonsil",)),
)
SITE_STEMS = tuple(s for _, stems in SITES for s in stems)
LATERALITY = frozenset(("left", "right", "upper", "lower", "bilateral"))


def _site_word(word):
    """A laterality word or a word that starts with a site stem, in any case ("Kidney", "Nephrectomy", "Right")."""
    low = word.lower()
    return low in LATERALITY or low.startswith(SITE_STEMS)


COPY_MIN_WORDS = 3
# Frequent general English words (function words, everyday vocabulary), never technical names: a copied run with one
# of them written in lower case is English left in the output, not a list of names, drugs or genes.
_EN_COMMON = _EN_STOP | frozenset("""
an or but nor without to in on at as onto over under during within about above below through than then who whom
whose what when where why how be being do does did can could may might must should would will shall no all any some
each every both more most less least other such only also very its it they them there here we our you your he she
his her if so per via while because although though since until upon whether either neither same
right left upper lower total partial whole half single double main major minor high low new old first last long
great little own big small large next early young important few public bad good well able please just now even back
still never always often usually again however today different similar various several many much time person year
way day thing man world life hand part child eye woman place work week case point number group problem fact say get
make go know take see seen come think look want give use find tell ask seem feel try leave call show shows shown
note notes""".split())
_LINK_RE = re.compile(r"\S*(?:://|@|www\.)\S*")
_WORD_RE = re.compile(r"[^\W_]+")


def _run_words(text, tokens):
    """(word or None, start, end) per word of text. None for what never counts as a copied English word: a word with
    Vietnamese letters or digits, the source's acronyms / codes, quoted or bracketed spans, Title-Case runs, links."""
    masked = [m.span() for t in tokens for m in _token_rx(t).finditer(text)]
    masked += [m.span() for rx in (_QUOTED_RE, _TITLE_RUN_RE, _LINK_RE) for m in rx.finditer(text)]
    out = []
    for m in _WORD_RE.finditer(text):
        w = m.group(0)
        english = w.isascii() and w.isalpha() and not any(a < m.end() and m.start() < b for a, b in masked)
        out.append((w if english else None, m.start(), m.end()))
    return out


def copied_english(src_plain, out_plain):
    """English fragments copied word for word from the source into the output: COPY_MIN_WORDS or more English words
    in a row that also follow each other in the source (case and punctuation ignored), one of them a frequent English
    word written in lower case ("Thyroid, right, thyroidectomy") or, in any case, a side or an anatomical site word
    (_site_word: "Breast, Left, Lumpectomy"). Drug / gene lists, names, degrees, acronyms, codes, links, quoted or
    bracketed spans and Title-Case runs (words joined by spaces only: titles, journals) never make such a fragment."""
    tokens = protected_tokens(src_plain)
    where = {}
    for j, (w, _, _) in enumerate(_run_words(src_plain, tokens)):
        if w:
            where.setdefault(w.lower(), []).append(j)
    words = _run_words(out_plain, tokens)
    ends, prev = [], {}  # ends[i]: longest run of source words in a row ending at output word i
    for w, _, _ in words:
        cur = {j: prev.get(j - 1, 0) + 1 for j in where.get(w.lower(), ())} if w else {}
        ends.append(max(cur.values(), default=0))
        prev = cur
    found, i = [], len(words) - 1
    while i >= 0:
        n = ends[i]
        if n < COPY_MIN_WORDS:
            i -= 1
            continue
        run = words[i - n + 1:i + 1]
        if any((w.islower() and len(w) > 1 and w in _EN_COMMON) or _site_word(w) for w, _, _ in run):
            found.append(out_plain[run[0][1]:run[-1][2]])
        i -= n
    return found[::-1]


def _forms(word):
    """A word in lower case with its plural / singular (-s, -es)."""
    w = word.lower()
    forms = {w, w + "s", w + "es"}
    if w.endswith("es"):
        forms.add(w[:-2])
    if w.endswith("s"):
        forms.add(w[:-1])
    return forms


def _vietnamese(text):
    """True when the text has a Vietnamese letter (a letter with a diacritic, or d with a stroke)."""
    return any(ch.isalpha() and (ch in "\u0111\u0110" or unicodedata.normalize("NFD", ch) != ch) for ch in text)


def single_english(src_plain, out_plain, terms=()):
    """Single English words copied from the source into an otherwise Vietnamese answer ("Hepatocyte ph\u00ecnh to"),
    which copied_english misses (it needs COPY_MIN_WORDS in a row). A word counts when the answer has Vietnamese
    letters and the word is written in lower case somewhere in the source (names, genera, brands, eponyms and places
    are capitalised), is not also a Vietnamese syllable ("do", "can", "tau"), is not one of the source's acronyms /
    codes nor inside a quoted / bracketed span, a Title-Case run or a link (_run_words), has no capitalised English
    word copied from the source right beside it ("Streptococcus pneumoniae") and is a frequent English word written in
    lower case (_EN_COMMON), an organ / side word (_site_word: "Hepatocyte") or one of `terms` (lower-case
    single-word glossary keys whose Vietnamese is not English). Singular and plural match ("hepatocytes").
    Measured 2026-10-14 on 2,198 (source, output) pairs (1,402 corpus segments, qwen3.5:9b; 796 G1 outputs of four
    models): of 470 single words copied from the source (52 English left, 418 names, protein / enzyme names,
    loanwords, acronyms...), it finds 16 (with every pack's single-word keys as terms; 11 without), all English left."""
    if not _vietnamese(out_plain):
        return []
    tokens = protected_tokens(src_plain)
    src_words = [w for w, _, _ in _run_words(src_plain, tokens) if w]
    lower_src = {w.lower() for w in src_words if w[0].islower()}
    any_src = {w.lower() for w in src_words}
    keys = {t.lower() for t in terms}
    words = _run_words(out_plain, tokens)

    def capital_copy(j, a, b):  # word j is a capitalised source word with only spaces between a and b
        if not 0 <= j < len(words) or not words[j][0]:
            return False
        w = words[j][0]
        return w[0].isupper() and bool(_forms(w) & any_src) and not out_plain[a:b].strip()

    found = []
    for i, (w, s, e) in enumerate(words):
        if not w or len(w) < 3 or is_valid(w) or not _forms(w) & lower_src:
            continue
        if capital_copy(i - 1, words[i - 1][2] if i else s, s) or \
                capital_copy(i + 1, e, words[i + 1][1] if i + 1 < len(words) else e):
            continue
        if (w.islower() and w in _EN_COMMON) or _site_word(w) or _forms(w) & keys:
            found.append(w)
    return found


def english_copies(src_plain, out_plain, terms=()):
    """English copied from the source: the runs of copied_english, then the single words of single_english that are
    not part of a run."""
    runs = copied_english(src_plain, out_plain)
    in_runs = {w.lower() for r in runs for w in re.findall(r"[A-Za-z]+", r)}
    return runs + [w for w in single_english(src_plain, out_plain, terms) if w.lower() not in in_runs]


# LaTeX / math markup (spec Amendment E): a model may write a symbol as LaTeX ("$\beta$", "$\rightarrow$", "$\ge 2$",
# "x^{2}"). Inline math between dollar signs counts when it holds a command, a ^ / _ or a brace (a price "$5 to $10"
# does not); outside it, a known command or a ^{...} / _{...} group. A command that stands for one symbol is written
# as that symbol by fix_latex; anything else stays for the sanity gate.
LATEX_SYMBOLS = {
    "alpha": "\u03b1", "beta": "\u03b2", "gamma": "\u03b3", "delta": "\u03b4", "epsilon": "\u03b5",
    "varepsilon": "\u03b5", "zeta": "\u03b6", "eta": "\u03b7", "theta": "\u03b8", "iota": "\u03b9", "kappa": "\u03ba",
    "lambda": "\u03bb", "mu": "\u03bc", "nu": "\u03bd", "xi": "\u03be", "pi": "\u03c0", "rho": "\u03c1",
    "sigma": "\u03c3", "tau": "\u03c4", "upsilon": "\u03c5", "phi": "\u03c6", "varphi": "\u03c6", "chi": "\u03c7",
    "psi": "\u03c8", "omega": "\u03c9", "Gamma": "\u0393", "Delta": "\u0394", "Theta": "\u0398", "Lambda": "\u039b",
    "Xi": "\u039e", "Pi": "\u03a0", "Sigma": "\u03a3", "Upsilon": "\u03a5", "Phi": "\u03a6", "Psi": "\u03a8",
    "Omega": "\u03a9",
    "rightarrow": "\u2192", "to": "\u2192", "longrightarrow": "\u2192", "leftarrow": "\u2190", "gets": "\u2190",
    "leftrightarrow": "\u2194", "Rightarrow": "\u21d2", "Leftarrow": "\u21d0", "Leftrightarrow": "\u21d4",
    "uparrow": "\u2191", "downarrow": "\u2193",
    "ge": "\u2265", "geq": "\u2265", "le": "\u2264", "leq": "\u2264", "ne": "\u2260", "neq": "\u2260",
    "approx": "\u2248", "sim": "~", "times": "\u00d7", "pm": "\u00b1", "mp": "\u2213", "cdot": "\u00b7",
    "div": "\u00f7", "infty": "\u221e", "circ": "\u00b0", "degree": "\u00b0", "ldots": "\u2026", "dots": "\u2026",
}
_LATEX_OTHER = frozenset("frac dfrac tfrac sqrt text textrm textit textbf mathrm mathbf mathit mathsf operatorname "
                         "left right big Big quad qquad sum prod int lim log ln exp".split())
_LATEX_RE = re.compile(r"\$([^$\n]{1,80}?)\$|\\([A-Za-z]+)|[\^_]\{[^{}\n]*\}")
_MATH_MARK_RE = re.compile(r"[\\^_{]")
_DEGREE_RE = re.compile(r"\^\s*\{?\s*\\circ\s*\}?")


def latex_markup(text):
    """LaTeX / math pieces of a text, in order (see LATEX_SYMBOLS)."""
    found = []
    for m in _LATEX_RE.finditer(text):
        if m.group(1) is not None:
            if _MATH_MARK_RE.search(m.group(1)):
                found.append(m.group(0))
        elif m.group(2) is None or m.group(2) in LATEX_SYMBOLS or m.group(2) in _LATEX_OTHER:
            found.append(m.group(0))
    return found


def new_latex(src_plain, out_plain):
    """LaTeX / math pieces of the output that the source does not have."""
    return [p for p in latex_markup(out_plain) if p not in src_plain]


def _latex_symbol(name, src_plain):
    if name == "mu" and "\u00b5" in src_plain:
        return "\u00b5"  # the micro sign, as the source writes it
    return LATEX_SYMBOLS.get(name)


def fix_latex(src_plain, out):
    """Write LaTeX symbol markup that the source does not have as the symbols: inline math made only of symbol
    commands (LATEX_SYMBOLS), a degree sign and plain text loses its markup ("$\\ge 2$" -> "\u2265 2"); a symbol
    command outside inline math becomes its symbol ("\\le" -> "\u2264"). Other markup (fractions, ^{...} / _{...}
    groups) and markup the source has stay as they are. Tags are kept."""
    def convert(content):
        text = _DEGREE_RE.sub("\u00b0", content).replace("\\%", "%")
        text = re.sub(r"\\([A-Za-z]+)", lambda m: _latex_symbol(m.group(1), src_plain) or m.group(0), text)
        return None if re.search(r"[\\^_{}]", TOKEN_RE.sub("", text)) else text

    def sub(m):
        piece = m.group(0)
        if piece in src_plain:
            return piece
        if m.group(1) is not None:
            text = convert(m.group(1)) if _MATH_MARK_RE.search(m.group(1)) else None
            return piece if text is None else text
        if m.group(2) is not None:
            return _latex_symbol(m.group(2), src_plain) or piece
        return piece

    return _LATEX_RE.sub(sub, out)


# Clauses of a specimen line or a list ("Site, procedure --- Diagnosis & finding"; "a; b"): the length gate per clause
_CLAUSE_SEP_RE = re.compile(r"\s*(?:-{2,}|\u2014|\u2013|;|\|)\s*")
OMIT_MIN_LETTERS, OMIT_RATIO = 20, 0.5


def omitted_clauses(src_plain, out_plain):
    """Source clauses whose translation is far too short: when source and output split into the same 2+ clauses
    (at "---", em / en dash, ";", "|"), each source clause of OMIT_MIN_LETTERS+ letters whose output clause has fewer
    than OMIT_RATIO of its letters (a second diagnosis dropped from one clause, which the whole-segment ratio gate
    misses)."""
    letters = lambda t: sum(1 for ch in t if ch.isalpha())  # noqa: E731
    src = [c.strip() for c in _CLAUSE_SEP_RE.split(src_plain) if c.strip()]
    out = [c.strip() for c in _CLAUSE_SEP_RE.split(out_plain) if c.strip()]
    if len(src) < 2 or len(src) != len(out):
        return []
    return [s for s, o in zip(src, out) if letters(s) >= OMIT_MIN_LETTERS and letters(o) < OMIT_RATIO * letters(s)]


def _numbers(text):
    return sorted(n.replace(",", ".") for n in _NUM_RE.findall(text))


def numbers_changed(src_plain, out_plain):
    return _numbers(src_plain) != _numbers(out_plain)


def _wb(pattern):
    """Syllable-boundary wrapper: a Vietnamese term never starts or ends in the middle of a word."""
    return _rx(r"(?<!\w)(?:" + pattern + r")(?!\w)", re.I)


_TAG_RE = re.compile(r"</?[A-Za-z][^<>]*>")
_PAREN_RE = re.compile(r"\s*(\([^()]*\))")


def _starts_sentence(text, pos):
    before = _TAG_RE.sub("", text[:pos]).rstrip(" \t")
    return before == "" or before[-1] in ".!?:\n"


def _extend(text, s, e, vi, lo):
    """Grow the span [s, e) over canonical words already sitting next to a wrong-form match."""
    words = vi.split()
    ls, re_end = s, e
    for k in range(len(words), 0, -1):
        pat = r"(?<!\w)" + r"\s+".join(re.escape(w) for w in words[:k]) + r"\s+\Z"
        m = _rx(pat, re.I).search(text[lo:s])
        if m:
            ls = lo + m.start()
            break
    tail = text[e:]
    pm = _PAREN_RE.match(tail)
    if pm and vi.lower().endswith(pm.group(1).lower()):
        re_end = e + pm.end()
    else:
        for k in range(len(words), 0, -1):
            pat = r"\s+" + r"\s+".join(re.escape(w) for w in words[-k:]) + r"(?!\w)"
            m = _rx(pat, re.I).match(tail)
            if m:
                re_end = e + m.end()
                break
    return ls, re_end


def _replace_all(rx, out, vi, canon_spans):
    parts, pos = [], 0
    for m in rx.finditer(out):
        s, e = m.span()
        if s < pos or any(a <= s and e <= b for a, b in canon_spans):
            continue
        ls, re_end = _extend(out, s, e, vi, pos)
        word = out[ls:re_end]
        if len(word) > 1 and word.isupper():
            rep = vi.upper()
        elif word[:1].isupper() and _starts_sentence(out, ls):
            rep = vi[:1].upper() + vi[1:]
        else:
            rep = vi
        parts.append(out[pos:ls])
        parts.append(rep)
        pos = re_end
    parts.append(out[pos:])
    return "".join(parts)


def apply_term_fixes(out, src_plain, fixes):
    """Source-gated, idempotent VN->VN replacement of known wrong variants."""
    out = _nfc(out)
    src_low = _nfc(src_plain).lower()
    applied = []
    for fx in sorted(fixes, key=lambda f: -len(f.vi)):
        need = len(_rx(_bounded(_nfc(fx.en)), re.I).findall(src_low))
        if not need:
            continue
        vi = _nfc(fx.vi)
        canon = _wb(re.escape(vi)) if vi else None  # empty vi = pure deletion fix
        wrongs = [_wb(_nfc(w)) for w in sorted(fx.wrong, key=len, reverse=True)]
        if canon:
            wspans = [m.span() for rx in wrongs for m in rx.finditer(out)]
            present = sum(1 for m in canon.finditer(out)
                          if not any(a < m.end() and m.start() < b for a, b in wspans))
            if present >= need:
                continue
        hit = False
        for rx in wrongs:
            spans = [m.span() for m in canon.finditer(out)] if canon else []
            new = _replace_all(rx, out, vi, spans)
            if new != out:
                hit = True
                out = new
        if hit:
            applied.append(fx.en)
    return out, applied


# Acronyms and codes the output must keep (HER2, CCRCC, ChRCC, UCa, 22q11.2, NM_000546.6, p.V600E). Not tokens:
# academic degrees (moved before the name as a Vietnamese title), months, roman numerals, ordinals / ages / units,
# capital words of a shouting line, capital words of 5+ letters with 2+ vowels (JAPAN, CANADA), country codes.
_ALNUM_RE = re.compile(r"(?<![A-Za-z0-9])[A-Za-z0-9]+(?![A-Za-z0-9])")
_HGVS_RE = re.compile(r"(?<![\w.])(?:[cgmnpr]\.[A-Za-z0-9_*>+\-]*[A-Za-z0-9*>]|N[MRPGC]_\d+(?:\.\d+)?"
                      r"|(?:\d{1,2}|[XY])?[pq]\d+(?:\.\d+)+)(?![\w])")
_NOT_TOKENS = frozenset((
    "MD PHD JD BSC MSC MBBS MBCHB DPHIL MPH MBA DO RN DDS DMD BS MS MA BA FRCPATH FRCPA FRCP FRCS MRCP FIBMS FFSC "
    "FAHMS FACP FCAP PHARMD JAN FEB MAR APR MAY JUN JUL AUG SEP SEPT OCT NOV DEC NO YES OK VS AND OR THE OF IN ON TO "
    "BY AT FOR NOT ALL NEW NOTE US UK USA EU HCMC LN LNS").split())  # LN: lymph node shorthand
_ROMAN_RE = re.compile(r"^[IVX]+$")
# ordinals, ages, number + unit (19th, 65yo, 65fmol, mm2), multipliers and sizes (x2, 9x17)
_COUNT_RE = re.compile(r"^(?:\d+[a-z]{2,}|\d+[xyhd]|x\d+|\d+x\d+|[cmun]?m[23])$", re.I)


def _is_acronym(tok, shouting):
    letters = [c for c in tok if c.isalpha()]
    upper = sum(c.isupper() for c in letters)
    if not letters or tok.upper() in _NOT_TOKENS or _ROMAN_RE.match(tok) or _COUNT_RE.match(tok):
        return False
    if any(c.isdigit() for c in tok):  # gene / marker / stage codes: HER2, CDKN2A, p53, tdp43, 1p, pT1a
        return upper >= 1 or bool(re.search(r"[a-z]\d|\d[a-z]", tok)) and len(letters) <= 4
    if upper < 2 or upper < len(letters) - upper or len(letters) > 7:
        return False
    if tok.isupper():
        if shouting or tok.rstrip("S").upper() in _NOT_TOKENS:
            return False
        return not (len(tok) >= 5 and sum(c in "AEIOU" for c in tok) >= 2)
    return True  # mixed case: ChRCC, TcRCC, UCa, LNs, PTCs


def protected_tokens(src_plain):
    """Acronyms and codes of the source, first occurrence order, no duplicates."""
    words = re.findall(r"[A-Za-z]{3,}", src_plain)
    caps = [w for w in words if w.isupper()]
    shouting = len(caps) >= 2 and 2 * len(caps) >= len(words)
    found = [m.group(0) for m in _HGVS_RE.finditer(src_plain)]
    covered = [m.span() for m in _HGVS_RE.finditer(src_plain)]
    for m in _ALNUM_RE.finditer(src_plain):
        if not any(a <= m.start() < b for a, b in covered) and _is_acronym(m.group(0), shouting):
            found.append(m.group(0))
    return list(dict.fromkeys(found))


def _token_rx(tok):
    """Case-insensitive whole-token pattern; a hyphen or space may come between letters and digits or before a capital
    (tdp43 = TDP-43, 34betaE12 = 34 beta E12), a plural acronym may come back singular (LNs = LN)."""
    if re.fullmatch(r"[A-Z]{2,}s", tok):
        tok = tok[:-1]
        tail = "s?"
    else:
        tail = ""
    parts, prev = [], ""
    for ch in tok:
        if prev.isalnum() and ch.isalnum() and (prev.isalpha() != ch.isalpha() or (prev.islower() and ch.isupper())):
            parts.append(r"[-\s]?")
        parts.append(re.escape(ch))
        prev = ch
    return _rx(r"(?<![A-Za-z0-9])" + "".join(parts) + tail + r"(?![A-Za-z0-9])", re.I)


def missing_tokens(src_plain, out_plain):
    """Acronyms / codes of the source that the output does not contain (case-insensitive, whole tokens)."""
    return [t for t in protected_tokens(src_plain) if not _token_rx(t).search(out_plain)]


def glossary_misses(src_plain, out_plain, hits):
    low_src, low_out = src_plain.lower(), out_plain.lower()
    return [en for en, vi in hits if re.search(_bounded(en), low_src) and vi.lower() not in low_out]


def suspicious_tokens(out_plain, src_plain=""):
    """Invalid-looking Vietnamese tokens, ignoring words copied from the source (eponyms: Sezary, Barre...)."""
    src_low = src_plain.lower()
    return [t for t in suspicious(out_plain) if t.lower() not in src_low]
