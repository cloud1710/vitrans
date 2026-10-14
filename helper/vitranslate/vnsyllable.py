"""Flag tokens that carry Vietnamese letters but are not valid Vietnamese syllables.

Only tokens with a Vietnamese-specific letter or a tone mark are checked; plain ASCII words (English terms, gene
names) are ignored. The check is permissive: it rejects impossible spellings, not rare-but-real ones.
"""
import re
import unicodedata

TONE_MARKS = {"\u0300", "\u0301", "\u0303", "\u0309", "\u0323"}
VN_MARKS = {"\u0302", "\u0306", "\u031b"}  # circumflex, breve, horn
D_BAR = "\u0111"

_ONSET = r"(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnprstvx]|\u0111)?"
_NUCLEI = [
    "oai", "oay", "oeo", "u\u00e2y", "u\u00f4i", "uya", "uy\u00ea", "\u01b0\u01a1i", "\u01b0\u01a1u",
    "y\u00eau", "i\u00eau", "uyu",
    "ai", "ao", "au", "ay", "\u00e2u", "\u00e2y", "eo", "\u00eau", "ia", "i\u00ea", "iu", "oa", "o\u0103",
    "oe", "oi", "\u00f4i", "\u01a1i", "ua", "u\u00e2", "u\u00ea", "ui", "u\u00f4", "u\u01a1", "uy",
    "\u01b0a", "\u01b0i", "\u01b0\u01a1", "\u01b0u", "y\u00ea", "oo",
    "a", "\u0103", "\u00e2", "e", "\u00ea", "i", "o", "\u00f4", "\u01a1", "u", "\u01b0", "y",
]
_CODA = r"(?:ch|ng|nh|c|m|n|p|t)?"
_SYLLABLE_RE = re.compile(
    "^" + _ONSET + "(?:" + "|".join(sorted(_NUCLEI, key=len, reverse=True)) + ")" + _CODA + "$"
)
_TOKEN_RE = re.compile(r"[^\W\d_]+")


def _needs_check(token):
    nfd = unicodedata.normalize("NFD", token.lower())
    return D_BAR in nfd or any(ch in TONE_MARKS or ch in VN_MARKS for ch in nfd)


def is_valid(token):
    nfd = unicodedata.normalize("NFD", token.lower())
    if sum(1 for ch in nfd if ch in TONE_MARKS) > 1:
        return False
    base = unicodedata.normalize("NFC", "".join(ch for ch in nfd if ch not in TONE_MARKS))
    return bool(_SYLLABLE_RE.match(base))


def suspicious(text):
    """Tokens with Vietnamese letters that are not valid syllables, first occurrence order, no duplicates."""
    seen, out = set(), []
    for token in _TOKEN_RE.findall(unicodedata.normalize("NFC", text)):
        if token in seen or not _needs_check(token):
            continue
        seen.add(token)
        if not is_valid(token):
            out.append(token)
    return out
