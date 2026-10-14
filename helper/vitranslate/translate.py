"""Translate one segment: prompt, model call, tag ladder L0-L5, sanity gate, deterministic finishing, translation
memory."""
import hashlib
import re
import unicodedata
from dataclasses import dataclass, field

from . import qa
from .ooxml.ns import local, q
from .tags import TOKEN_RE, check, ids, normalize_tokens, repair, restore_spaces, stray_markup, strip_tags
from .tm import TM

# Part of the TM key. The TM stores the text before finishing, so this must change whenever the prompts, the ladder,
# the gate, qa.strip_leaks or tags.repair change what that text would be.
TRANSLATOR_VERSION = "8"
MAX_TAGS = 12
MAX_SPAN_CALLS = 8        # model calls for span phrases at L4, per segment
SHORT_WORDS = 7           # sources shorter than this (titles, labels, table cells) are sent without neighbour context
EMPTY = "empty answer"

# No "..." inside example tags: the model copies "<g1>...</g1>" into answers that have no tags.
TAG_RULES = """The text may contain inline formatting tag pairs such as <g1>\u2026</g1> and placeholders such as <x1/>.
Rules:
- Keep EVERY tag and placeholder exactly once, with the same number. Put each tag pair around the Vietnamese words
  that translate the words it wraps. Word order may change; tags move with their words.
- Do not add new tags. Do not translate gene names, numbers, units, codes or abbreviations.
- Use the glossary translations for the listed terms.
- Output ONLY the Vietnamese translation, nothing else."""

KEEP_TAGS = "Keep these tags exactly once each, around the matching Vietnamese words: "
NO_TAGS = "This text has no tags; do not add any."
RETRY_TAGS = "Your previous answer broke the tags (%s). Translate again and keep every tag exactly once."
RETRY_EMPTY = "You gave an empty answer. Translate the text into Vietnamese and keep every tag exactly once."
RETRY_ENGLISH = "Your previous answer was still in English. Translate into Vietnamese."
# with the previous answer quoted: asked to translate again from scratch, the model rewrote whole segments (measured)
RETRY_ENGLISH_WORDS = ("Your previous answer was:\n%s\nIt left these words in English: %s. Write that answer again "
                       "with these words translated into Vietnamese; keep the rest and every tag.")
ENGLISH_ISSUE = "english:"
RETRY_SUSPECT = ("Your previous answer was not a clean translation (%s). Output only the Vietnamese translation of "
                 "the text after \"Translate:\", nothing else.")
RETRY_TOKENS = ("Your previous answer dropped or changed these abbreviations or codes: %s. Translate again and write "
                "each of them exactly as in the text.")
TOKENS_ISSUE = "acronym:"
RETRY_OMITTED = "Your previous answer left out part of the text: %s. Translate the whole text, every part of it."
OMITTED_ISSUE = "omitted:"
SPAN_PROMPT = "Translate this short phrase into Vietnamese. Output only the translation:\n"

# Sanity gate: reasons a tag-exact answer is still not a translation of its source.
SUSPECT_NOTES = {"ratio": "its length did not match the text", "script": "it contained non-Vietnamese script",
                 "scaffold": "it repeated the instructions or the context", "angle": "it added angle brackets",
                 "markdown": "it added markdown",
                 "latex": "it added LaTeX math markup (%s); write each symbol as a plain character such as "
                          "\u03b2, \u2192 or \u2265"}
_SCAFFOLD = ("translate:", "previous paragraph", "next paragraph", "your previous answer", "vietnamese:")
_MARKDOWN = ("```", "**", "__")
_EMPHASIS = ("**", "__")
_STAR_RE = re.compile(r"(?<![*\w])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![*\w])")  # *emphasis*
_SCRIPTS_OK = ("LATIN", "GREEK", "MICRO SIGN")  # Greek letters and the micro sign are normal in science text
_LOWER_WORD_RE = re.compile(r"(?<![A-Za-z])[a-z]{4,}(?![A-Za-z])")
_PAIR_RE = re.compile(r"<g(\d+)>.*?</g\1>", re.S)
_LEAF_PAIR_RE = re.compile(r"[ \t]*<g(\d+)>((?:(?!</?g\d+>).)*?)</g\1>", re.S)
# Code-only cells: no ASCII word of 3+ letters with 2+ lowercase ones, units aside, and no short function word.
_ASCII_WORD_RE = re.compile(r"[A-Za-z]+")
_UNITS = {"mm", "cm", "ml", "mg", "kg", "ng", "um", "nm", "hpf"}
_SMALL_WORDS = {"no", "or", "of", "in", "on", "to", "at", "by", "up", "is", "an"}
# Flag kinds that Translator._checks derives from a finished text (keep in step with it)
CHECK_KINDS = frozenset({"formatting_lost", "tags_broken", "unchanged", "kept_english", "english_left",
                         "numbers_changed", "acronym_lost", "suspect_output", "suspicious", "stray_markup",
                         "glossary_miss", "omitted"})


@dataclass
class Outcome:
    text: str
    segment: object
    level: int
    flags: list = field(default_factory=list)
    cached: bool = False


def build_system(style_prompt, pack, hits):
    parts = ["You translate English documents (%s) into natural academic Vietnamese." % pack.name, style_prompt]
    if pack.prompt:
        parts.append(pack.prompt)
    parts.append(TAG_RULES)
    if hits:
        parts.append("Glossary (English = Vietnamese):\n" + "\n".join("- %s = %s" % h for h in hits))
    return "\n\n".join(p for p in parts if p)


def _reminder(tagged):
    """The segment's own tags, listed right before the text (more first answers keep them all), or a no-tags note."""
    g, x = ids(tagged)
    if not g and not x:
        return NO_TAGS
    return KEEP_TAGS + ", ".join(["<g%d>\u2026</g%d>" % (n, n) for n in g] + ["<x%d/>" % n for n in x])


def build_user(tagged, prev="", nxt="", note=""):
    lines = []
    if prev:
        lines.append("Previous paragraph (context only, do not translate): " + prev[:300])
    if nxt:
        lines.append("Next paragraph (context only, do not translate): " + nxt[:300])
    if note:
        lines.append(note)
    lines.append(_reminder(tagged))
    lines.append("Translate:\n" + tagged)
    return "\n\n".join(lines)


def is_essential(span):
    """Spans kept at ladder level 3: bold, italic, superscript / subscript, links."""
    if span.container is not None:
        return True
    rpr = span.rpr
    if rpr is None:
        return False
    if rpr.get("b") in ("1", "true") or rpr.get("i") in ("1", "true") or rpr.get("baseline") not in (None, "0"):
        return True
    for ch in rpr:
        name = local(ch)
        if name == "hlinkClick":
            return True
        if name in ("b", "i") and ch.get(q("w:val")) in (None, "1", "true", "on"):
            return True
        if name == "vertAlign" and ch.get(q("w:val")) in ("superscript", "subscript"):
            return True
    return False


def _code_only(plain):
    """True when no ASCII word reads as English: marker names, stages and values ("BRAF VE1", "Ki-67 (MIB-1)",
    "pT1a", "p<0.001", "HER2 3+", "<5 mm") are kept as they are, without a model call. "No", "Left" are words."""
    for w in _ASCII_WORD_RE.findall(plain):
        low = w.lower()
        if low in _UNITS:
            continue
        if len(w) >= 3 and sum(1 for c in w if c.islower()) >= 2:
            return False
        if low in _SMALL_WORDS and not w.isupper():
            return False
    return True


_CAPS_WORD_RE = re.compile(r"(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])")


def _caps_prose(plain, hits=()):
    """True for ALL-CAPS English that _code_only would keep ("SEVEN YEARS LATER", "SPINDLE CELL"): two capital words
    of 4+ letters with 2+ vowels each (gene symbols such as BRAF, KRAS, TERT have one), or a glossary term written
    with lower-case letters ("spindle cell") found in it."""
    wordy = [w for w in _CAPS_WORD_RE.findall(plain) if sum(c in "AEIOU" for c in w) >= 2]
    if len(wordy) >= 2:
        return True
    low = plain.lower()
    return any(en != en.upper() and len(re.sub(r"[^A-Za-z]", "", en)) >= 4
               and re.search(r"(?<![\w-])" + re.escape(en.lower()) + r"(?![\w-])", low) for en, _ in hits)


_ETAL_RE = re.compile(r"\bet\s+al\b\.?")
_VOLUME_RE = re.compile(r"\b(?:19|20)\d\d\b[^;]{0,12};\s*\d+|\d+\(\d+\):\s*e?\d+")
_YEAR_RE = re.compile(r"\b(?:19|20)\d\d\b")
_CITE_LOWER = {"et", "al", "and", "in", "of", "de", "van", "von", "der", "le", "la"}


def _citation_only(plain):
    """A segment that is only a literature citation ("Smith et al. Mod Pathol. 2019.", "Histopathology. 2021 May;
    79(2):100-110."): et al. or a year;volume / volume(issue):pages, a year, and every other word capitalised (author,
    journal, month) or a web address. References stay in English."""
    if not _YEAR_RE.search(plain) or not (_ETAL_RE.search(plain) or _VOLUME_RE.search(plain)):
        return False
    for w in re.findall(r"[^\W\d_][\w.\-']*", plain):
        w = w.strip(".")
        if w and w[0].islower() and w.lower() not in _CITE_LOWER and "." not in w \
                and not any(c.isdigit() for c in w):  # e51234: an article number
            return False
    return True


def _span_text(tagged, n):
    m = re.search(r"<g%d>(.*?)</g%d>" % (n, n), tagged, re.S)
    return strip_tags(m.group(1)) if m else ""


def _plain(text):
    """Text without tags for the checks; a placeholder (line break, tab) keeps the words on its sides apart."""
    return TOKEN_RE.sub(lambda m: " " if m.group(3) else "", text)


def _same(a, b):
    """Equal when spaces, punctuation and case are ignored (an English answer that only dropped "---" is the source)."""
    return re.sub(r"[\W_]+", "", a).lower() == re.sub(r"[\W_]+", "", b).lower()


def _blank(work, out):
    """True when a source with letters or digits came back without any ("", ".")."""
    return any(ch.isalnum() for ch in work.plain) and not any(ch.isalnum() for ch in strip_tags(out))


def _drop_blank_invented(src, out):
    """An invented tag pair with no letter or digit inside ("<g1>...</g1>" copied from an example) goes with its
    content and the spaces before it (repair would keep the dots); the source's edge whitespace is kept."""
    known = set(ids(src)[0])

    def keep(m):
        return int(m.group(1)) in known or any(c.isalnum() for c in m.group(2))

    new = _LEAF_PAIR_RE.sub(lambda m: m.group(0) if keep(m) else "", out)
    if new == out:
        return out
    return src[:len(src) - len(src.lstrip())] + new.strip() + src[len(src.rstrip()):]


def _strip_emphasis(src, out):
    """(out, stripped): markdown emphasis (**x**, __x__, *x*) that the source does not have is removed."""
    stripped = False
    for mark in _EMPHASIS:
        if mark in out and mark not in src:
            out, stripped = out.replace(mark, ""), True
    if _STAR_RE.search(out) and not _STAR_RE.search(src):
        out, stripped = _STAR_RE.sub(r"\1", out), True
    return out, stripped


def _letters(text):
    return sum(1 for ch in text if ch.isalpha())


def _suspect(src_plain, out_plain, context=False):
    """Sanity gate reasons: length far from the source (both ways; tighter when neighbour context was sent; short
    sources with a neighbour appended), a script the source does not have (Chinese, Thai...), the prompt's own
    scaffold, angle brackets the source does not have ("<pT1a>"), markdown the source does not have, LaTeX / math
    markup the source does not have ("$\\beta$": qa.new_latex)."""
    reasons = []
    n_src, n_out = _letters(src_plain), _letters(out_plain)
    high = 1.5 if context else 1.8
    if (n_src >= 40 and not 0.5 <= n_out / n_src <= high) or (n_src < 40 and n_out > 3 * n_src + 10):
        reasons.append("ratio")
    src_chars = set(src_plain)
    if any(ch.isalpha() and ch not in src_chars and not unicodedata.name(ch, "").startswith(_SCRIPTS_OK)
           for ch in set(out_plain)):
        reasons.append("script")
    low_src, low_out = src_plain.lower(), out_plain.lower()
    if any(m in low_out and m not in low_src for m in _SCAFFOLD):
        reasons.append("scaffold")
    if any(ch in out_plain and ch not in src_plain for ch in "<>"):
        reasons.append("angle")
    if (any(m in out_plain and m not in src_plain for m in _MARKDOWN)
            or (_STAR_RE.search(out_plain) and not _STAR_RE.search(src_plain))):
        reasons.append("markdown")
    if qa.new_latex(src_plain, out_plain):
        reasons.append("latex")
    return reasons


def _gate_note(issues, answer="", src=""):
    notes = [RETRY_ENGLISH] if "english_left" in issues else []
    copied = ["\"%s\"" % i[len(ENGLISH_ISSUE):] for i in issues if i.startswith(ENGLISH_ISSUE)]
    if copied:
        notes.append(RETRY_ENGLISH_WORDS % (answer, ", ".join(copied)))
    latex = ", ".join("\"%s\"" % p for p in dict.fromkeys(qa.new_latex(src, _plain(answer))))
    reasons = [SUSPECT_NOTES[i] % latex if i == "latex" else SUSPECT_NOTES[i] for i in issues if i in SUSPECT_NOTES]
    if reasons:
        notes.append(RETRY_SUSPECT % "; ".join(reasons))
    tokens = [i[len(TOKENS_ISSUE):] for i in issues if i.startswith(TOKENS_ISSUE)]
    if tokens:
        notes.append(RETRY_TOKENS % ", ".join(tokens))
    left_out = ["\"%s\"" % i[len(OMITTED_ISSUE):] for i in issues if i.startswith(OMITTED_ISSUE)]
    if left_out:
        notes.append(RETRY_OMITTED % ", ".join(left_out))
    return " ".join(notes)


def _retried(issues):
    """Info flags naming why a gate retry was made, so level-2 causes show in the report."""
    english = ["english_left" == i or i.startswith(ENGLISH_ISSUE) for i in issues]
    return (["retried:english"] if any(english) else []) + (["retried:gate"] if not all(english) else [])


def _cacheable(level, flags):
    """Bad results stay out of the TM, so the next run tries again."""
    return not any(f in ("english_left", "unchanged", "tags_broken", "empty_output")
                   or f.startswith(("suspect_output:", OMITTED_ISSUE)) or (f == "formatting_lost" and level == 5)
                   for f in flags)


def _splits_word(text, i):
    """True when index i falls between two letters / digits of one word (tags ignored, placeholders separate)."""
    return _plain(text[:i])[-1:].isalnum() and _plain(text[i:])[:1].isalnum()


def _source_splits(tagged, n):
    """(left, right): whether span n starts / ends inside a word of the source, as a superscript in cm<g1>2</g1>."""
    o = tagged.find("<g%d>" % n)
    c = tagged.find("</g%d>" % n, o) + len("</g%d>" % n)
    return _splits_word(tagged, o), _splits_word(tagged, c)


def _find_free(text, target, split_left=False, split_right=False):
    """First case-insensitive occurrence of `target` outside every tag token and every existing <gN>..</gN> pair (no
    nesting) that cuts a word only on a side where the source span did (so "u" never takes the bold inside "nhieu"
    or "quanh"), or None."""
    taken = [m.span() for m in TOKEN_RE.finditer(text)] + [m.span() for m in _PAIR_RE.finditer(text)]
    pattern = re.compile(re.escape(target), re.I)
    m = pattern.search(text)
    while m is not None:
        if (not any(s < m.end() and m.start() < e for s, e in taken)
                and (split_left or not _splits_word(text, m.start()))
                and (split_right or not _splits_word(text, m.end()))):
            return m
        m = pattern.search(text, m.start() + 1)
    return None


class Translator:
    def __init__(self, llm, system, model_key, pack_key, fixes=(), hits=(), tm=None):
        self.llm = llm
        self.system = system
        self.model_key = model_key
        self.pack_key = pack_key
        self.fixes = list(fixes)
        self.hits = list(hits)
        self.tm = tm
        self._system_hash = hashlib.sha256(system.encode("utf-8")).hexdigest()[:12]
        # glossary terms kept in English (vi == en) never count as English left
        self._kept = [re.compile(r"(?<!\w)" + re.escape(en.strip()) + r"(?!\w)", re.I)
                      for en, vi in self.hits if en.strip() and en.strip().lower() == vi.strip().lower()]
        # single-word glossary keys whose Vietnamese does not contain them: left in English, they are English left
        self._terms = frozenset(en.strip().lower() for en, vi in self.hits if re.fullmatch(r"[A-Za-z]+", en.strip())
                                and not re.search(r"(?<![A-Za-z])%s(?![A-Za-z])" % re.escape(en.strip().lower()),
                                                  vi.lower()))

    def _ask(self, tagged, prev, nxt, note=""):
        return self.llm.chat(self.system, build_user(tagged, prev, nxt, note))

    def _without_kept(self, src_plain, out_plain):
        for rx in self._kept:
            src_plain, out_plain = rx.sub(" ", src_plain), rx.sub(" ", out_plain)
        return src_plain, out_plain

    def _english_left(self, src_plain, out_plain):
        """Partial English: qa.english_left (English prose words left; it ignores Title-Case runs), kept-English
        glossary terms aside."""
        return qa.english_left(*self._without_kept(src_plain, out_plain))

    def _copied(self, src_plain, out_plain):
        """English copied word for word from the source, kept-English glossary terms aside: partial English that has
        no English stop word ("Thyroid, right, thyroidectomy --- ...", qa.copied_english) and single words
        ("Hepatocyte ...", qa.single_english, with the single-word glossary keys of the document)."""
        return qa.english_copies(*self._without_kept(src_plain, out_plain), terms=self._terms)

    def _unchanged(self, src_plain, out_plain):
        """The answer is the source itself (case, spaces and tags ignored), kept-English glossary terms aside.
        Headings such as "Outline" or "Contact Information" count: nothing may stay English silently."""
        src, out = self._without_kept(src_plain, out_plain)
        return _same(src, out) and any(ch.isalpha() for ch in src)

    @staticmethod
    def _problems(work, out):
        """check() errors, plus EMPTY when the answer has no text: an empty answer is never accepted."""
        return check(work.tagged, out) + ([EMPTY] if _blank(work, out) else [])

    def _issues(self, work, out, context):
        """Sanity gate of a tag-exact answer: english_left (partial English or the source returned unchanged), else one
        "english:X" per English fragment X copied from the source, the suspect_output reasons, one "acronym:X" per
        acronym / code of the source missing from the answer and one "omitted:X" per source clause X translated far
        too short."""
        src, plain = _plain(work.tagged), _plain(out)
        english = self._unchanged(src, plain) or self._english_left(src, plain)
        copied = [] if english else [ENGLISH_ISSUE + c for c in self._copied(src, plain)]
        return ((["english_left"] if english else []) + copied + _suspect(src, plain, context)
                + [TOKENS_ISSUE + t for t in qa.missing_tokens(src, plain)]
                + [OMITTED_ISSUE + c for c in qa.omitted_clauses(src, plain)])

    def _tagfix(self, work, raw):
        """(text, repaired) when tags are right, possibly after level-1 repair; (None, False) otherwise."""
        out = qa.strip_leaks(work.tagged, raw)
        if not self._problems(work, out):
            return out, False
        fixed = repair(work.tagged, _drop_blank_invented(work.tagged, normalize_tokens(out, work.tagged)))
        if not self._problems(work, fixed):
            return fixed, True
        return None, False

    def _span_targets(self, text, memo, budget):
        """Candidate translations of a span's text, cheapest first: the text as it is, its glossary entry, then one
        model call (memoised per segment; once budget[0] reaches MAX_SPAN_CALLS no more calls are made)."""
        t = text.strip()
        if not t:
            return
        yield t
        if not re.search(r"[a-z]", t):
            return
        for en, vi in self.hits:
            if en.lower() == t.lower():
                yield vi
        if t not in memo:
            if budget[0] >= MAX_SPAN_CALLS:
                return
            budget[0] += 1
            memo[t] = strip_tags(qa.strip_leaks(t, self.llm.chat(self.system, SPAN_PROMPT + t))).strip()
        if memo[t]:
            yield memo[t]

    def _reattach(self, work, prev, nxt, flags):
        """Levels 4-5: translate without <g> tags, drop markdown emphasis, apply term fixes, then wrap each span's own
        translation where found verbatim. Returns (text, level); level 3 when no span is left to re-attach,
        (None, None) for an empty answer."""
        plain_src = strip_tags(work.tagged, keep_x=True)
        raw = qa.strip_leaks(plain_src, self._ask(plain_src, prev, nxt))
        out = repair(plain_src, _drop_blank_invented(plain_src, normalize_tokens(raw, plain_src)))
        out, stripped = _strip_emphasis(plain_src, out)  # before the span search: "**pulmon**" must match
        if _blank(work, out):
            return None, None
        if stripped:
            flags.append("suspect_output:markdown")
        out, applied = qa.apply_term_fixes(out, _plain(work.tagged), self.fixes)
        flags += ["term_fix:" + a for a in applied]
        if not work.spans:
            return out, 3
        memo, budget, found = {}, [0], 0
        for n in sorted(work.spans):
            splits = _source_splits(work.tagged, n)
            m = None
            for target in self._span_targets(_span_text(work.tagged, n), memo, budget):
                m = _find_free(out, target, *splits)
                if m is not None:
                    break
            if m is None:
                continue
            out = "%s<g%d>%s</g%d>%s" % (out[:m.start()], n, m.group(0), n, out[m.end():])
            found += 1
        return out, (5 if found == 0 else 4)

    def recheck(self, work, out):
        """The check flags (kinds in CHECK_KINDS) of a text that replaces a finished translation (the editor pass)."""
        return self._checks(work, out)

    def _checks(self, work, out, context=False):
        """Flags for a finished text. Every check() failure is flagged: missing spans as formatting_lost, stray
        markup as stray_markup, anything else as tags_broken. Runs on cache hits too. Its flag kinds are
        CHECK_KINDS."""
        plain, src_plain = _plain(out), _plain(work.tagged)
        flags = []
        errors = check(work.tagged, out)
        if any(e.startswith("missing <g") for e in errors):
            flags.append("formatting_lost")
        if any(not e.startswith(("missing <g", "stray markup")) for e in errors):
            flags.append("tags_broken")
        if self._unchanged(src_plain, plain):
            # one lowercase word kept twice (a drug name) is information; anything else unchanged is a warning
            single = len(src_plain.split()) == 1 and _LOWER_WORD_RE.search(src_plain) is not None
            flags.append("kept_english" if single else "unchanged")
        elif _same(src_plain, plain) and any(ch.isalpha() for ch in src_plain):
            flags.append("kept_english")  # only glossary terms kept in English ("Tau" -> "tau"): said, not silent
        elif self._english_left(src_plain, plain) or self._copied(src_plain, plain):
            flags.append("english_left")
        if qa.numbers_changed(src_plain, plain):
            flags.append("numbers_changed")
        lost = qa.missing_tokens(src_plain, plain)
        if lost:
            flags.append("acronym_lost:" + ",".join(lost))
        flags += ["suspect_output:" + r for r in _suspect(src_plain, plain, context)]
        flags += ["suspicious:" + t for t in qa.suspicious_tokens(plain, src_plain)]
        if stray_markup(work.tagged, out):
            flags.append("stray_markup")
        flags += ["glossary_miss:" + en for en in qa.glossary_misses(src_plain, plain, self.hits)]
        flags += [OMITTED_ISSUE + c for c in qa.omitted_clauses(src_plain, plain)]
        return flags

    def _finish(self, work, out, flags, context=False):
        out = restore_spaces(work.tagged, out)
        out = qa.fix_latex(_plain(work.tagged), out)  # "$\beta$" -> the symbol; other LaTeX stays for the flag
        out, applied = qa.apply_term_fixes(out, _plain(work.tagged), self.fixes)
        out = qa.source_case(_plain(work.tagged), out)  # sentence-initial capital from the source, never the model's
        flags += ["term_fix:" + a for a in applied]
        flags += self._checks(work, out, context)
        return out

    def _key(self, seg):
        """TM key: model, pack, translator version, system prompt (it carries the document's glossary hits), tagged
        source and the ids of its essential spans. Paragraphs with the same tagged text can reduce differently at
        level 3 (bold vs colour), so a cached level-3+ answer must only meet an identical reduction."""
        essential = ",".join(str(n) for n in sorted(seg.spans) if is_essential(seg.spans[n]))
        scope = "%s|v%s|%s" % (self.pack_key, TRANSLATOR_VERSION, self._system_hash)
        return TM.key(self.model_key, scope, seg.tagged + "\n" + essential)

    def translate(self, seg, prev="", nxt=""):
        if _code_only(_plain(seg.tagged)) and not _caps_prose(_plain(seg.tagged), self.hits):
            return Outcome(seg.tagged, seg, 0, ["kept_code"])  # no model call, same answer every run
        if _citation_only(_plain(seg.tagged)):
            return Outcome(seg.tagged, seg, 0, ["kept_reference"])
        key = self._key(seg)
        if self.tm is not None:
            hit = self.tm.get(key)
            if hit:
                text, level = hit
                work = seg if level < 3 else seg.reduced(is_essential)
                flags = []
                text = self._finish(work, text, flags)  # same finishing as a fresh run: same text, same flags
                return Outcome(text, work, level, flags, cached=True)
        if len(_plain(seg.tagged).split()) < SHORT_WORDS:
            prev = nxt = ""  # titles and table cells: the neighbours bleed into short answers
        context = bool(prev or nxt)
        flags = []
        work, level = (seg, 0) if len(seg.spans) <= MAX_TAGS else (seg.reduced(is_essential), 3)
        raw = self._ask(work.tagged, prev, nxt)
        out, repaired = self._tagfix(work, raw)
        if out is not None and repaired:
            level = max(level, 1)
        if out is None and level < 3:
            errors = self._problems(work, qa.strip_leaks(work.tagged, raw))
            empty = EMPTY in errors
            flags.append("retried:empty" if empty else "retried:tags")
            note = RETRY_EMPTY if empty else RETRY_TAGS % "; ".join(errors)
            out, _ = self._tagfix(work, self._ask(work.tagged, prev, nxt, note))
            level = 2
        if out is None and level < 3:
            reduced = seg.reduced(is_essential)
            work, level = reduced, 3
            if reduced.spans and reduced.tagged != seg.tagged:  # all spans essential: L3 would repeat L0, go to L4
                out, _ = self._tagfix(work, self._ask(work.tagged, prev, nxt))
        if out is None:
            out, level = self._reattach(work, prev, nxt, flags)
            if out is None:
                # every answer was empty: keep the source as it is (flagged, not cached) rather than erase the text
                return Outcome(seg.tagged, seg, 5, ["empty_output"] + self._checks(seg, seg.tagged))
        elif level < 2:
            issues = self._issues(work, out, context)
            if issues:  # one retry, without the neighbours: they are the usual source of bleed
                flags += _retried(issues)
                again, _ = self._tagfix(work, self._ask(work.tagged, "", "", _gate_note(issues, out,
                                                                                        _plain(work.tagged))))
                left = self._issues(work, again, False) if again is not None else None
                # a tie is accepted (the retry ran without the neighbours), except when every issue was a missing
                # acronym, a copied English fragment or a clause left out: a retry that removes none of them is only a
                # different wording
                narrow = all(i.startswith((TOKENS_ISSUE, ENGLISH_ISSUE, OMITTED_ISSUE)) for i in issues)
                if left is not None and (len(left) < len(issues) or (len(left) == len(issues) and not narrow)):
                    out, level, context = again, 2, False
        out, stripped = _strip_emphasis(_plain(work.tagged), out)  # L0-L3 too (L4 already did it): never write "**"
        if stripped:
            flags.append("suspect_output:markdown")
        stored = out  # the TM keeps the text before finishing; every hit runs the same finishing again
        out = self._finish(work, out, flags, context)
        if self.tm is not None and _cacheable(level, flags):
            self.tm.put(key, stored, level)
        return Outcome(out, work, level, flags)
