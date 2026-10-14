"""Inline tag tokens that carry formatting through translation.

Paired tags <gN>..</gN> wrap a formatted span; self-closing <xN/> stands for a fixed element (tab, break, field,
image). Ids are positive integers, unique within one segment.
"""
import re

TOKEN_RE = re.compile(r"<(/?)g(\d+)>|<x(\d+)/>")
_LOOSE_RE = re.compile(r"<\s*(/?)\s*([gGxX])\s*(\d+)\s*(/?)\s*>")
# Markup that is not a canonical token. "complete" = whole loose g/x tag, whitelisted inline html tag, or html-escaped
# token (repair may delete these); "frag" = broken fragment such as "<g2" (check only flags it).
_STRAY_RE = re.compile(
    r"(?P<complete><\s*/?\s*[gGxX]\s*\d+\s*/?\s*>"
    r"|(?i:</?(?:b|i|u|s|em|strong|sup|sub|span|font|br|small|mark|a|p)(?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s\"'<>=]+))*\s*/?>)"
    r"|(?i:&lt;/?[gx]\d+/?&gt;))"
    r"|(?P<frag></?\s*[gGxX]\s*\d)"
)
_G_TOKEN_RE = re.compile(r"</?g\d+>")
_EMPTY_PAIR_RE = re.compile(r"<g(\d+)>((?:\s|<x\d+/>)*)</g\1>")
_CLOSING_PUNCT = ":,;.)"
_OPENING_PUNCT = "([{\u201c\u2018"


def _squash(text):
    return re.sub(r"\s+", "", text)


def ids(text):
    """Return (g ids in opening order, x ids in order)."""
    g, x = [], []
    for m in TOKEN_RE.finditer(text):
        if m.group(3):
            x.append(int(m.group(3)))
        elif not m.group(1):
            g.append(int(m.group(2)))
    return g, x


def strip_tags(text, keep_x=False):
    if keep_x:
        return re.sub(r"</?g\d+>", "", text)
    return TOKEN_RE.sub("", text)


def normalize_tokens(text, src=""):
    """Fix spacing / case variants such as '< G1 >' or '</ g1 >' produced by the model.

    Loose matches that appear in the plain text of `src` (ignoring whitespace) are legitimate source text and are
    kept. Self-closing g tags have no meaning and are dropped; any loose x tag becomes <xN/>.
    """
    plain_src = _squash(TOKEN_RE.sub("", src))

    def fix(m):
        if _squash(m.group(0)) in plain_src:
            return m.group(0)
        slash, letter, num, selfclose = m.groups()
        if letter.lower() == "x":
            return "<x%d/>" % int(num)
        if selfclose:
            return ""
        return "<%sg%d>" % (slash, int(num))
    return _LOOSE_RE.sub(fix, text)


def _strays(text, plain_src, complete_only=False):
    """Stray markup matches in `text`: not canonical tokens, not legitimate source text (whitespace ignored)."""
    squashed_src = _squash(plain_src)
    out = []
    for m in _STRAY_RE.finditer(text):
        piece = m.group(0)
        if TOKEN_RE.fullmatch(piece) or _squash(piece) in squashed_src:
            continue
        if complete_only and not m.group("complete"):
            continue
        out.append(m)
    return out


def stray_markup(src, out):
    """Stray pieces (complete tags and fragments) in `out` that check() reports, after the source exception."""
    return [m.group(0) for m in _strays(out, TOKEN_RE.sub("", src))]


def check(src, out):
    """List of problems of `out` against the tags of `src`; empty list means tag-exact."""
    src_g, src_x = ids(src)
    errors, stack, opened, xs, open_at = [], [], [], [], {}
    for m in TOKEN_RE.finditer(out):
        if m.group(3):
            xs.append(int(m.group(3)))
            continue
        n = int(m.group(2))
        if m.group(1):
            if stack and stack[-1] == n:
                stack.pop()
                if not strip_tags(out[open_at[n]:m.start()]).strip():
                    errors.append("empty <g%d>" % n)
            else:
                errors.append("crossed or unopened </g%d>" % n)
                if n in stack:
                    stack.remove(n)
        else:
            opened.append(n)
            stack.append(n)
            open_at[n] = m.end()
    errors += ["unclosed <g%d>" % n for n in stack]
    missing = sorted(set(src_g) - set(opened))
    extra = sorted(set(opened) - set(src_g))
    dup = sorted({n for n in opened if opened.count(n) > 1})
    if missing:
        errors.append("missing " + ", ".join("<g%d>" % n for n in missing))
    if extra:
        errors.append("invented " + ", ".join("<g%d>" % n for n in extra))
    if dup:
        errors.append("duplicated " + ", ".join("<g%d>" % n for n in dup))
    if sorted(xs) != sorted(src_x):
        errors.append("placeholders differ: want %s got %s" % (sorted(src_x), sorted(xs)))
    errors += ["stray markup: " + piece for piece in stray_markup(src, out)]
    return errors


def _plain_len(text):
    return len(TOKEN_RE.sub("", text))


def _relative_pos(src, out, token):
    """Index in `out` matching the relative plain-text position `token` has in `src`, moved to a word end."""
    i = src.find(token)
    frac = _plain_len(src[:i]) / max(_plain_len(src), 1)
    total = _plain_len(out)
    target = round(frac * total)
    if target <= 0:
        return 0
    if target >= total:
        return len(out)
    count, pos = 0, 0
    while pos < len(out):
        m = TOKEN_RE.match(out, pos)
        if m:
            pos = m.end()
            continue
        if count == target:
            break
        count += 1
        pos += 1
    while pos < len(out) and not out[pos].isspace() and not TOKEN_RE.match(out, pos):
        pos += 1
    return pos


def _uncross(out):
    """Turn crossed pairs into nested ones: close inner tags before the outer close, drop their later close."""
    res, stack, drop, pos = [], [], {}, 0
    for m in TOKEN_RE.finditer(out):
        res.append(out[pos:m.start()])
        pos = m.end()
        if m.group(3):
            res.append(m.group(0))
            continue
        n = int(m.group(2))
        if not m.group(1):
            stack.append(n)
            res.append(m.group(0))
            continue
        if drop.get(n):
            drop[n] -= 1
            continue
        if n not in stack:
            continue
        while stack[-1] != n:
            inner = stack.pop()
            res.append("</g%d>" % inner)
            drop[inner] = drop.get(inner, 0) + 1
        stack.pop()
        res.append(m.group(0))
    res.append(out[pos:])
    return "".join(res)


def repair(src, out):
    """Ladder level 1: deterministic fixes. Run check() afterwards; leftovers go to level 2."""
    out = normalize_tokens(out, src)
    src_g, src_x = ids(src)
    allowed_g, allowed_x = set(src_g), set(src_x)
    plain_src = TOKEN_RE.sub("", src)

    def step(text):
        seen_x = set()

        def keep(m):
            if m.group(3):
                n = int(m.group(3))
                if n not in allowed_x or n in seen_x:
                    return ""
                seen_x.add(n)
                return m.group(0)
            return m.group(0) if int(m.group(2)) in allowed_g else ""

        text = TOKEN_RE.sub(keep, text)
        for m in reversed(_strays(text, plain_src, complete_only=True)):
            text = text[:m.start()] + text[m.end():]
        text = _uncross(text)
        return _EMPTY_PAIR_RE.sub(lambda m: m.group(2).strip() if "<x" in m.group(2) else m.group(2), text)

    while True:
        new = step(out)
        if new == out:
            break
        out = new
    present = set(ids(out)[1])
    missing = [n for n in src_x if n not in present]
    plan = [(_relative_pos(src, out, "<x%d/>" % n), k, "<x%d/>" % n) for k, n in enumerate(missing)]
    for pos, _, token in sorted(plan, reverse=True):
        out = out[:pos] + token + out[pos:]
    return out


def _plain_left(text, i):
    """Nearest plain (non-g-tag) character before index i, or ''."""
    ends = {m.end(): m.start() for m in _G_TOKEN_RE.finditer(text)}
    while i in ends:
        i = ends[i]
    return text[i - 1] if i > 0 else ""


def _plain_right(text, i):
    """Nearest plain (non-g-tag) character at or after index i, or ''."""
    starts = {m.start(): m.end() for m in _G_TOKEN_RE.finditer(text)}
    while i in starts:
        i = starts[i]
    return text[i] if i < len(text) else ""


def restore_spaces(src, out):
    """Re-insert a space at a tag edge when the source had one there and the model glued two words (or a word and an
    opening bracket); at a placeholder edge when the source had one there and the output has text on that side
    ("hyperplasia </g1><x2/>(Please" keeps its space before the line break, so the runs never read "lan toa(Vui")."""
    need = []
    for n in ids(src)[0]:
        open_tok, close_tok = "<g%d>" % n, "</g%d>" % n
        o = src.find(open_tok)
        c = src.find(close_tok, o)
        if o < 0 or c < 0:
            continue
        inner = src[o + len(open_tok):c]
        before = src[o - 1] if o > 0 else ""
        after = src[c + len(close_tok):c + len(close_tok) + 1]
        need.append((n, before.isspace() or inner[:1].isspace(), after.isspace() or inner[-1:].isspace()))

    def glued(text, i):
        left, right = _plain_left(text, i), _plain_right(text, i)
        return bool(left) and bool(right) and (right.isalnum() or right in _OPENING_PUNCT) \
            and (left.isalnum() or left in _CLOSING_PUNCT)

    res = out
    for n, need_before, need_after in need:
        if need_before:
            i = res.find("<g%d>" % n)
            if i >= 0 and glued(res, i):
                res = res[:i] + " " + res[i:]
        if need_after:
            tok = "</g%d>" % n
            i = res.find(tok)
            if i >= 0 and glued(res, i + len(tok)):
                j = i + len(tok)
                res = res[:j] + " " + res[j:]
    for n in ids(src)[1]:
        tok = "<x%d/>" % n
        s, i = src.find(tok), res.find(tok)
        if i < 0:
            continue
        if _plain_left(src, s).isspace() and _plain_left(res, i).strip():
            res = res[:i] + " " + res[i:]
            i += 1
        j = i + len(tok)
        if _plain_right(src, s + len(tok)).isspace() and _plain_right(res, j).strip():
            res = res[:j] + " " + res[j:]
    return res
