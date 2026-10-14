"""Read-back editor pass (spec Amendment B): after translation + QA, the same model reads each slide / passage as a
group of numbered EN / VI lines and edits the Vietnamese for natural, consistent wording. Every edited line passes
deterministic guards against its draft; any failure keeps the draft (flag polish_rejected:<reason>, information)."""
import bisect
import hashlib
import re

from collections import Counter

from . import qa
from .llm import LLMError
from .ooxml.document import _heading_level
from .ooxml.ns import q
from .qa import _bounded
from .tags import TOKEN_RE, check, normalize_tokens, repair, restore_spaces
from .tm import TM
from .translate import CHECK_KINDS, _letters, _plain, _same, _suspect

POLISH_VERSION = "3"  # part of the TM key: change it whenever the editor prompt, parsing or guards change
# Lines never sent to the editor: kept on purpose (code, English, references) or not a clean translation.
NOT_SENT = frozenset({"kept_code", "kept_english", "kept_reference", "unchanged", "english_left", "empty_output",
                      "tags_broken"})
SLIDE_MAX_LINES, SLIDE_MAX_CHARS = 20, 2500     # a slide (or notes page) above this is split in order
PASSAGE_MAX_LINES, PASSAGE_MAX_CHARS = 8, 1500  # DOCX: consecutive body paragraphs (source characters)
GROUP_HITS = 40                                 # glossary rows listed per group
REJECTED = "polish_rejected:"
# Why a line kept its draft (web/app.js has a label for each)
REASONS = ("numbering", "error", "empty", "tags", "scaffold", "script", "angle", "markdown", "latex", "numbers",
           "acronym", "units", "symbols", "glossary", "dropped", "ratio", "english", "suspicious", "term_weakened",
           "anatomy", "repeat")
RATIO_LOW, RATIO_HIGH = 0.6, 1.5  # letters of the edit / letters of the draft
RATIO_SLACK = 4                   # letters a short line may gain or lose whatever the ratio ("C\u00e1c u" -> "U")
SHORT_LETTERS, SHORT_RATIO = 30, (0.4, 2.0)  # a label below 30 letters may shrink more

EDITOR_HEAD = "You edit Vietnamese translations of English documents (%s)."
EDITOR_RULES = """You get numbered lines from one slide or one passage of a document. Each line has the English \
source (EN) and a Vietnamese draft translation (VI) made by a machine; the drafts are mostly correct but often read \
like a translation. Rewrite each VI line the way a Vietnamese pathologist would write it, keeping the meaning exactly.
Fix in every line:
1. Titles, labels, table cells and short bullets are short noun phrases, never sentences. Drop a leading "C\u00e1c" / \
"Nh\u1eefng" that is there only because the English noun is plural ("C\u00e1c trung t\u00e2m tham gia" -> \
"Trung t\u00e2m tham gia"; \
"Normal functioning neurons" -> "Ch\u1ee9c n\u0103ng neuron b\u00ecnh th\u01b0\u1eddng").
2. Translation calques: "S\u1ef1 hi\u1ec7n di\u1ec7n c\u1ee7a X" -> "C\u00f3 X"; \
"Kh\u00f3 kh\u0103n trong vi\u1ec7c \u0111\u00e1nh gi\u00e1 X" -> "Kh\u00f3 \u0111\u00e1nh gi\u00e1 X"; \
redundant "c\u1ee7a", "s\u1ef1", "vi\u1ec7c", "m\u1ed9t", "\u0111\u01b0\u1ee3c", "b\u1edfi".
3. Natural word order and voice: modifiers after the head noun; active voice where Vietnamese prefers it \
("X \u0111\u01b0\u1ee3c \u0111o b\u1edfi hai b\u00e1c s\u0129" -> "Hai b\u00e1c s\u0129 \u0111o X"); \
"v\u1edbi ti\u1ec1n s\u1eed" -> "c\u00f3 ti\u1ec1n s\u1eed".
4. Parallel items (the labels of one figure, the bullets of one list, the cells of one column) phrased alike.
5. A line starts with a capital letter when its English does; keep the draft's final punctuation.
Never change: the meaning (no word that carries meaning is dropped or added: "only", "other", "not", "all", \
"more", numbers, negations), terms and glossary terms, numbers, units, abbreviations, codes, gene and person names, \
and every tag such as <g1>\u2026</g1> or <x1/> (each exactly once, around the same words). Use Southern Vietnam \
(TP.HCM) everyday wording, never by changing a medical term.
A line comes back unchanged only when none of these fixes applies.
Answer with one line per number, in order: [n] followed by the edited Vietnamese line only (no English, no arrow, \
no note)."""
RETRY_NUMBERING = ("Your previous answer did not give every line (missing: %s). Answer every line, [1] to [%d], one "
                   "line each, nothing else.")

_W_BODY, _W_P, _W_TBL, _W_TXBX = q("w:body"), q("w:p"), q("w:tbl"), q("w:txbxContent")
_NUMBERED_RE = re.compile(r"^\s*\[(\d+)\]\s?(.*)$")
_LABEL_RE = re.compile(r"^\s*(EN|VI)\s*:\s?(.*)$")
_EDITOR_SCAFFOLD_RE = re.compile(r"\[\d+\]|(?<![^\W_])(?:EN|VI)\s*:")
_MICRO = (chr(0xB5), chr(0x3BC))  # micro sign, Greek mu
_UNIT_WORDS = (["mm", "cm", "nm", "um", "mm2", "cm2", "mm\u00b2", "cm\u00b2", "ml", "mL", "dl", "dL", "mg", "ng",
                "pg", "kg", "mmol", "nmol", "IU", "mIU", "mmHg", "HPF", "hpf", "kDa", "Gy", "cGy", "bp", "kb", "Mb"]
               + [m + u for m in _MICRO for u in ("m", "l", "L", "g", "mol")])
_UNIT_RE = re.compile(r"(?<![^\W\d_])(?:" + "|".join(re.escape(u) for u in sorted(_UNIT_WORDS, key=len, reverse=True))
                      + r")(?![^\W\d_])")
# Words the editor may delete on its own (rule 4 of _style and the plural calques); any other deleted word, with
# nothing added, is content dropped (translation of "Autopsy brain only" losing "only")
_FREE_WORDS = frozenset(("c\u00e1c nh\u1eefng \u0111\u01b0\u1ee3c c\u1ee7a s\u1ef1 vi\u1ec7c m\u1ed9t "
                        "l\u00e0 th\u00ec m\u00e0 r\u1eb1ng \u0111\u00e3 ra n\u00e0o b\u1edfi").split())
_SYLLABLE_RE = re.compile(r"[^\W_]+")
_END_PERIOD_RE = re.compile(r"\.((?:\s|</g\d+>)*)$")
_UNIT_SIGNS = "%\u2030\u00b0<>\u2264\u2265\u00b1\u00d7~"
# Footnote / reference marks: *, dagger, double dagger, section, pilcrow, superscript digits, and "[n]" references
_SYMBOLS = "*\u2020\u2021\u00a7\u00b6\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079"
_REF_RE = re.compile(r"\[\d+(?:\s*[,\u2013-]\s*\d+)*\]")
REPEAT_SYLLABLES = 6  # a phrase this long said twice is a duplicate, not a reused term ("ung thu bieu mo tuyen")
# Malignancy nouns (Vietnamese) and the English words that call for one; English words that a plain "u" translates
_MALIGNANT_VI_RE = re.compile(r"(?<!\w)(?:ung th\u01b0|carcin\u00f4m|carcinom|sarc\u00f4m|sarcom|lymph\u00f4m|"
                              r"melan\u00f4m)(?!\w)", re.I)
_MALIGNANT_EN_RE = re.compile(r"(?<![a-z])[a-z]*(?:carcinom|sarcom|cancer|lymphom|melanom)[a-z]*", re.I)
_TUMOUR_EN_RE = re.compile(r"(?<![a-z])(?:tumou?rs?|neoplasms?|neoplasia|mass(?:es)?|lesions?|nodules?)(?![a-z])",
                           re.I)
_SITE_RES = sorted(((form, re.compile(r"(?<!\w)" + re.escape(form) + r"(?!\w)", re.I), stems)
                    for form, stems in qa.SITES), key=lambda s: -len(s[0]))


# ---- groups -------------------------------------------------------------------------------------------------------

def sendable(item, outcome):
    """A line goes to the editor when its draft is a clean, tag-exact translation without locked text."""
    if any(f.split(":", 1)[0] in NOT_SENT for f in outcome.flags) or item.segment.locked:
        return False
    return "\n" not in outcome.text and not check(outcome.segment.tagged, outcome.text)


def _container(p):
    """Nearest table or text box around a paragraph (None in the running text)."""
    el = p.getparent()
    while el is not None:
        if el.tag in (_W_TBL, _W_TXBX):
            return el
        el = el.getparent()
    return None


class _Sections:
    """Section number of a body paragraph: the count of section breaks (w:pPr/w:sectPr) in the body before it."""

    def __init__(self):
        self._breaks = {}

    def number(self, p):
        top = p
        while top.getparent() is not None and top.getparent().tag != _W_BODY:
            top = top.getparent()
        body = top.getparent()
        if body is None:
            return 0
        if body not in self._breaks:
            self._breaks[body] = [n for n, ch in enumerate(body) if ch.tag == _W_P
                                  and ch.find("%s/%s" % (q("w:pPr"), q("w:sectPr"))) is not None]
        return bisect.bisect_left(self._breaks[body], body.index(top))


def group_lines(pairs, kind):
    """Groups of indices into pairs [(item, outcome)], in reading order, sendable lines only. PPTX: one group per part
    (a slide, a notes page, a chart...). DOCX: runs of consecutive paragraphs of one part, broken at headings, at
    tables / text boxes and at section breaks. Both are split in order above their line / source-character caps."""
    docx = kind == "docx"
    max_lines, max_chars = (PASSAGE_MAX_LINES, PASSAGE_MAX_CHARS) if docx else (SLIDE_MAX_LINES, SLIDE_MAX_CHARS)
    sections = _Sections()
    groups, key, chars = [], None, 0
    for n, (item, outcome) in enumerate(pairs):
        if not sendable(item, outcome):
            continue
        size = len(outcome.segment.plain)
        if docx:
            new_key = (item.part, _container(item.element), sections.number(item.element))
            heading = _heading_level(item.element) is not None
        else:
            new_key, heading = item.part, False
        if (new_key != key or heading or not groups or len(groups[-1]) >= max_lines
                or chars + size > max_chars):
            groups.append([])
            key, chars = new_key, 0
        groups[-1].append(n)
        chars += size
    return groups


# ---- prompt and answer --------------------------------------------------------------------------------------------

def build_editor_system(style_prompt, pack):
    """Static for the whole job (prefix cache): role, the _style rules, the pack voice, the editor rules."""
    parts = [EDITOR_HEAD % pack.name, style_prompt, pack.prompt, EDITOR_RULES]
    return "\n\n".join(p for p in parts if p)


def build_editor_user(lines, hits):
    """lines: [(tagged source, tagged draft)]; hits: the group's glossary rows [(en, vi)]."""
    parts = []
    if hits:
        parts.append("Glossary (English = Vietnamese, use these):\n" + "\n".join("- %s = %s" % h for h in hits))
    parts.append("\n".join("[%d] EN: %s\nVI: %s" % (n, src, vi) for n, (src, vi) in enumerate(lines, 1)))
    parts.append("Answer every line, [1] to [%d]." % len(lines))
    return "\n\n".join(parts)


def _initials(en):
    """Upper-case initials of a term of 3+ words ("fine needle aspiration" -> "FNA"), else ""."""
    words = [w for w in re.split(r"[\s-]+", en.strip()) if w]
    return "".join(w[0] for w in words).upper() if len(words) >= 3 else ""


def in_source(en, src):
    """True when a glossary term occurs in a source text: the term itself (qa._bounded forms), or its initials as an
    upper-case word ("FNA", "FNAs") -- an acronym the model expanded into the term."""
    if re.search(_bounded(en), src.lower()):
        return True
    ini = _initials(en)
    return bool(ini) and re.search(r"(?<![A-Za-z0-9])" + re.escape(ini) + r"s?(?![A-Za-z0-9])", src) is not None


def group_hits(sources, hits, limit=GROUP_HITS):
    """The job's glossary rows whose English (or its acronym) occurs in one of the group's source texts (job order
    kept)."""
    text = "\n".join(sources)
    return [h for h in hits if in_source(h[0], text)][:limit]


def parse_answer(raw, count):
    """({n: line}, missing numbers) of an editor answer. Thinking and code fences are dropped; "[n] EN: ..." echoes are
    ignored and a "VI:" label is removed; a line without a number continues the line before it (text before the
    first number is ignored); a number given twice is ambiguous and counts as missing, like one never given."""
    if "</think>" in raw:
        raw = raw.rsplit("</think>", 1)[1]
    lines, seen, current = {}, set(), None
    for text in raw.splitlines():
        if text.strip().startswith("```") or not text.strip():
            continue
        m = _NUMBERED_RE.match(text)
        if m:
            n, text = int(m.group(1)), m.group(2)
            current = n if 1 <= n <= count else None
            if current is None:
                continue
            if current in seen:
                lines.pop(current, None)
                current = None
                continue
            seen.add(current)
            lines[current] = ""
        elif current is None:
            continue
        label = _LABEL_RE.match(text)
        if label and label.group(1) == "EN":
            continue
        if label:
            lines[current] = label.group(2)
        else:
            lines[current] = (lines[current] + " " + text.strip()) if lines[current] else text.strip()
    lines = {n: t for n, t in lines.items() if t.strip()}
    return lines, [n for n in range(1, count + 1) if n not in lines]


# ---- guards -------------------------------------------------------------------------------------------------------

def _units(text):
    return sorted(_UNIT_RE.findall(text) + [c for c in text if c in _UNIT_SIGNS])


def _lost_tokens(src, draft, edit):
    """Acronyms / codes of the source or of the draft that the edit no longer has (the draft's own losses aside)."""
    lost_before = set(qa.missing_tokens(src, draft))
    return [t for t in qa.missing_tokens(src, edit) if t not in lost_before] + qa.missing_tokens(draft, edit)


def _dropped(d, e):
    """True when the edit only deletes words of the draft (adds none) and one of them is neither a free word nor a
    repeat that the edit still has once ("TERT TERT" -> "TERT"); "trong" is free together with "vi\u1ec7c" only."""
    dc = Counter(w.lower() for w in _SYLLABLE_RE.findall(d))
    ec = Counter(w.lower() for w in _SYLLABLE_RE.findall(e))
    gone = dc - ec
    free = _FREE_WORDS | ({"trong"} if "vi\u1ec7c" in gone else set())
    return not (ec - dc) and any(w not in free and not ec[w] for w in gone)


def _symbols(text):
    return Counter([c for c in text if c in _SYMBOLS] + _REF_RE.findall(text))


def _lost_symbols(src, d, e):
    """Footnote / reference marks of the draft that the edit drops, as far as the source has them ("*2021 ..." keeps
    its "*"; a mark only the draft has may go)."""
    cs, cd, ce = _symbols(src), _symbols(d), _symbols(e)
    return [s for s, n in cd.items() if ce[s] < min(n, cs[s])]


def _weakened(src, d, e):
    """True when the edit has fewer malignancy nouns (ung thu, carcinom, sarcom...) than the draft owes its source:
    one per malignancy word of the source, and every one of the draft's that no tumour word of the source explains
    ("Tumours" over-translated as "Ung thu" may become "U"; "PTC" written out as "ung thu bieu mo" may not)."""
    nd, ne = len(_MALIGNANT_VI_RE.findall(d)), len(_MALIGNANT_VI_RE.findall(e))
    need = min(nd, max(len(_MALIGNANT_EN_RE.findall(src)), nd - len(_TUMOUR_EN_RE.findall(src))))
    return ne < need


def _sites(text):
    """Counter of anatomical site forms (qa.SITES), a longer form hiding the shorter forms inside it."""
    taken, out = [], Counter()
    for form, rx, _ in _SITE_RES:
        for m in rx.finditer(text):
            if not any(a < m.end() and m.start() < b for a, b in taken):
                taken.append(m.span())
                out[form] += 1
    return out


def _new_sites(src, d, e):
    """Anatomical sites the edit adds to the draft that no word of the source names ("kh\u1ed1i th\u1eadn" ->
    "kh\u1ed1i b\u1ec3 th\u1eadn" for "renal mass")."""
    cd, ce, low = _sites(d), _sites(e), src.lower()
    stems = {form: s for form, _, s in _SITE_RES}
    return [f for f, n in ce.items() if n > cd[f]
            and not any(re.search(r"(?<![a-z])" + re.escape(s), low) for s in stems[f])]


def _stutters(words):
    """Spans of 2+ words said twice in a row ("th\u00f9y tr\u00e1i th\u00f9y tr\u00e1i")."""
    n = len(words)
    return sum(1 for k in range(2, n // 2 + 1) for i in range(n - 2 * k + 1)
               if words[i] == words[i + k] and words[i:i + k] == words[i + k:i + 2 * k])


def _repeated(d, e):
    """True when the edit says a phrase twice that the draft did not: more back-to-back repeats of 2+ words than the
    draft, or a phrase of REPEAT_SYLLABLES+ words more often than in the draft (and at least twice). Repeats the draft
    already had ("ti\u1ec1n s\u1eed, ti\u1ec1n s\u1eed") and reused short terms pass."""
    dw = [w.lower() for w in _SYLLABLE_RE.findall(d)]
    ew = [w.lower() for w in _SYLLABLE_RE.findall(e)]
    if _stutters(ew) > _stutters(dw):
        return True
    k = REPEAT_SYLLABLES
    dg = Counter(tuple(dw[i:i + k]) for i in range(len(dw) - k + 1))
    eg = Counter(tuple(ew[i:i + k]) for i in range(len(ew) - k + 1))
    return any(n >= 2 and n > dg[g] for g, n in eg.items())


def _base(vi):
    """A glossary value without its trailing note ("... (clear cell)" -> "...")."""
    return re.sub(r"\s*\([^()]*\)\s*$", "", vi)


def _english_back(src, d, e, hits):
    """English words of the source that the edit adds and the draft does not have ("d\u1ea1ng sarc\u00f4m" -> "d\u1ea1ng
    sarcomatoid"), unless a glossary value of the group writes them."""
    words = lambda t: {w.lower() for w in re.findall(r"(?<![^\W\d_])[A-Za-z]{3,}(?![^\W\d_])", t)}
    allowed = words(" ".join(vi for _, vi in hits))
    return [w for w in words(e) - words(d) - allowed if w in words(src) and not w.isupper()]


def _end_period(src_plain, draft, edit):
    """A final period follows the draft, unless the source agrees with the edit (no period added to a label)."""
    src_dot = src_plain.rstrip().endswith(".")
    edit_dot, draft_dot = bool(_END_PERIOD_RE.search(edit)), bool(_END_PERIOD_RE.search(draft))
    if edit_dot and not draft_dot and not src_dot:
        return _END_PERIOD_RE.sub(r"\1", edit)
    if draft_dot and not edit_dot and src_dot:
        m = re.search(r"(?:\s|</g\d+>)*$", edit)
        return edit[:m.start()] + "." + edit[m.start():]
    return edit


def _first_letter(text):
    """Index of the first letter outside tag tokens, or -1."""
    pos = 0
    while pos < len(text):
        m = TOKEN_RE.match(text, pos)
        if m:
            pos = m.end()
        elif text[pos].isalpha():
            return pos
        else:
            pos += 1
    return -1


def _first_case(src_plain, draft, edit):
    """When the edit only flips the case of the draft's first word, the source's first letter decides it. An edit that
    only changes case (a line in capitals) keeps the draft's casing, with that first-letter rule."""
    s = next((c for c in src_plain if c.isalpha()), "")
    i, j = _first_letter(draft), _first_letter(edit)
    if not s or i < 0 or j < 0:
        return edit
    if edit.lower() == draft.lower():
        if s.isupper() == draft[i].isupper():
            return draft
        return draft[:i] + (draft[i].upper() if s.isupper() else draft[i].lower()) + draft[i + 1:]
    a, b = _SYLLABLE_RE.match(draft, i).group(0), _SYLLABLE_RE.match(edit, j).group(0)
    if a == b or a.lower() != b.lower():
        return edit
    return edit[:j] + (edit[j].upper() if s.isupper() else edit[j].lower()) + edit[j + 1:]


def _reason(seg, draft, edit, hits):
    """First failing guard of an edit (tags already exact) against its draft, or None. Leaked prompt pieces come
    first: a "[2]" copied from the next line is scaffold, not a changed number."""
    src, d, e = _plain(seg.tagged), _plain(draft), _plain(edit)
    if _EDITOR_SCAFFOLD_RE.search(e) and not _EDITOR_SCAFFOLD_RE.search(d):
        return "scaffold"
    suspect = [r for r in _suspect(d, e) if r != "ratio"]
    if suspect:
        return suspect[0]
    if qa.numbers_changed(d, e):
        return "numbers"
    if _lost_tokens(src, d, e):
        return "acronym"
    if _units(d) != _units(e):
        return "units"
    if _lost_symbols(src, d, e):
        return "symbols"
    low_d, low_e = d.lower(), e.lower()
    for en, vi in hits:
        for form in dict.fromkeys((vi.lower(), _base(vi).lower())):
            if form and form in low_d and form not in low_e and in_source(en, src):
                return "glossary"
    if _dropped(d, e):
        return "dropped"
    nd, ne = _letters(d), _letters(e)
    low, high = SHORT_RATIO if nd < SHORT_LETTERS else (RATIO_LOW, RATIO_HIGH)
    if abs(nd - ne) > RATIO_SLACK and not (nd and low <= ne / nd <= high):
        return "ratio"
    if (_same(src, e) or (qa.english_left(src, e) and not qa.english_left(src, d))
            or _english_back(src, d, e, hits)):
        return "english"
    if set(qa.suspicious_tokens(e, src)) - set(qa.suspicious_tokens(d, src)):
        return "suspicious"
    if _weakened(src, d, e):
        return "term_weakened"
    if _new_sites(src, d, e):
        return "anatomy"
    if _repeated(d, e):
        return "repeat"
    return None


def guard_line(seg, draft, edit, hits, fixes):
    """(text, reason, term fixes applied) for one edited line against its draft: leaks stripped and the draft's edge
    whitespace kept, tags exact (level-1 repair allowed), tag-edge spaces restored, term-lock re-applied, the draft's
    final period and first-letter case kept where the editor only toggled them, then the guards of _reason. On any
    failure the draft comes back with the reason; reason None = accepted (the text may be the draft itself)."""
    edit = qa.strip_leaks(draft, edit)
    if not edit.strip():
        return draft, "empty", []
    if check(seg.tagged, edit):
        edit = repair(seg.tagged, normalize_tokens(edit, seg.tagged))
        if check(seg.tagged, edit):
            return draft, "tags", []
    edit = restore_spaces(seg.tagged, edit)
    edit, applied = qa.apply_term_fixes(edit, _plain(seg.tagged), fixes)
    edit = _first_case(_plain(seg.tagged), draft, _end_period(_plain(seg.tagged), draft, edit))
    edit = qa.source_case(_plain(seg.tagged), edit)
    if edit == draft:
        return draft, None, []
    reason = _reason(seg, draft, edit, hits)
    return (draft, reason, []) if reason else (edit, None, applied)


# ---- editor and job pass ------------------------------------------------------------------------------------------

class Polisher:
    """One editor call per group (one retry when the numbering is incomplete), guards per line, TM per group. The
    TM keeps the raw answer; every hit is parsed and guarded again, as in the translator."""

    def __init__(self, llm, system, model_key, scope_key, fixes=(), hits=(), tm=None):
        self.llm = llm
        self.system = system
        self.model_key = model_key
        self.scope_key = scope_key
        self.fixes = list(fixes)
        self.hits = list(hits)
        self.tm = tm
        self._system_hash = hashlib.sha256(system.encode("utf-8")).hexdigest()[:12]

    def _guarded(self, lines, parsed, hits):
        return [guard_line(seg, draft, parsed[n], hits, self.fixes) for n, (seg, draft) in enumerate(lines, 1)]

    def edit(self, lines):
        """lines: [(work segment, tagged draft)] -> ([(text, reason, term fixes)] per line, from the TM)."""
        hits = group_hits([seg.plain for seg, _ in lines], self.hits)
        user = build_editor_user([(seg.tagged, draft) for seg, draft in lines], hits)
        key = TM.key(self.model_key, "polish|v%s|%s|%s" % (POLISH_VERSION, self.scope_key, self._system_hash), user)
        if self.tm is not None:
            hit = self.tm.get(key)
            if hit:
                parsed, missing = parse_answer(hit[0], len(lines))
                if not missing:
                    return self._guarded(lines, parsed, hits), True
        try:
            raw = self.llm.chat(self.system, user)
            parsed, missing = parse_answer(raw, len(lines))
            if missing:
                note = RETRY_NUMBERING % (", ".join("[%d]" % n for n in missing), len(lines))
                raw = self.llm.chat(self.system, user + "\n\n" + note)
                parsed, missing = parse_answer(raw, len(lines))
        except LLMError:
            return [(draft, "error", []) for _, draft in lines], False
        if missing:
            return [(draft, "numbering", []) for _, draft in lines], False
        if self.tm is not None:
            self.tm.put(key, raw, 0)
        return self._guarded(lines, parsed, hits), False


def _final_flags(old, applied, rechecked):
    """Flags of an accepted edit: the translation's own flags (retries, term fixes, stripped markdown) stay, the
    check flags of the draft are replaced by the checks of the new text (Translator.recheck)."""
    kept = [f for f in old if f.split(":", 1)[0] not in CHECK_KINDS or f == "suspect_output:markdown"]
    return list(dict.fromkeys(kept + ["term_fix:" + a for a in applied] + list(rechecked)))


def run_polish(pairs, kind, polisher, progress, recheck):
    """Edit the outcomes of pairs [(item, outcome)] in place, group by group (progress stage "polish"). A line whose
    (source, draft) was decided earlier in the job is not sent again: it takes that decision, so repeated titles and
    SmartArt data / drawing copies stay identical. Returns (report counts, indices of changed outcomes)."""
    groups = group_lines(pairs, kind)
    stats = {"enabled": True, "groups": len(groups), "calls": 0, "cached": 0, "lines": 0, "changed": 0,
             "reused": 0, "rejected": {}}
    decided, touched = {}, []
    progress({"stage": "polish", "done": 0, "total": len(groups)})

    def take(n, text, reason, applied):
        outcome = pairs[n][1]
        if reason:
            outcome.flags = outcome.flags + [REJECTED + reason]
        elif text != outcome.text:
            outcome.flags = _final_flags(outcome.flags, applied, recheck(outcome.segment, text))
            outcome.text = text
        else:
            return
        touched.append(n)

    for done, group in enumerate(groups, 1):
        keys = {n: (pairs[n][1].segment.tagged, pairs[n][1].text) for n in group}
        fresh = []
        for n in group:
            if keys[n] not in decided and keys[n] not in [keys[m] for m in fresh]:
                fresh.append(n)
        if fresh:
            results, cached = polisher.edit([(pairs[n][1].segment, pairs[n][1].text) for n in fresh])
            stats["cached" if cached else "calls"] += 1
            for n, (text, reason, applied) in zip(fresh, results):
                decided[keys[n]] = (text, None, applied)  # a repeat of a rejected line keeps its draft, unflagged
                stats["lines"] += 1
                if reason:
                    stats["rejected"][reason] = stats["rejected"].get(reason, 0) + 1
                elif text != pairs[n][1].text:
                    stats["changed"] += 1
                take(n, text, reason, applied)
        for n in group:
            if n not in fresh:
                stats["reused"] += 1
                take(n, *decided[keys[n]])
        progress({"stage": "polish", "done": done, "total": len(groups)})
    return stats, touched
