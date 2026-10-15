"""Vietnamese glyph coverage of the fonts that render translated text; replace fonts that cannot show it."""
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

from fontTools.ttLib import TTCollection, TTFont

from .ooxml.codec import _SYMBOL_FONT_RE
from .ooxml.ns import q
from .ooxml.parts import part_labels, select_parts

FALLBACK = {"sans": "Arial", "serif": "Times New Roman", "mono": "Consolas"}
CACHE_VERSION = 3


def _font_dirs(platform=None, user_home=None):
    if (platform or sys.platform) == "darwin":  # macOS, and the fonts Office for Mac ships inside its apps
        home = Path.home() if user_home is None else Path(user_home)
        return ["/System/Library/Fonts", "/Library/Fonts", str(home / "Library" / "Fonts")] + [
            "/Applications/Microsoft %s.app/Contents/Resources/DFonts" % app for app in ("Word", "PowerPoint")]
    dirs = [os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts")]
    local = os.environ.get("LOCALAPPDATA")
    if local:  # an unset variable would otherwise yield relative paths
        dirs.append(os.path.join(local, "Microsoft", "Windows", "Fonts"))
        dirs.append(os.path.join(local, "Microsoft", "FontCache", "4", "CloudFonts"))
    dirs.append("C:/Program Files/Microsoft Office/root/vfs/Fonts/private")
    return [d for d in dirs if os.path.isabs(d)]


FONT_DIRS = _font_dirs()
_VN_RANGES = [(0x00C0, 0x00FF), (0x0102, 0x0103), (0x0110, 0x0111), (0x0128, 0x0129), (0x0168, 0x0169),
              (0x01A0, 0x01A1), (0x01AF, 0x01B0), (0x1EA0, 0x1EF9)]
_PPTX_EXTRA = r"ppt/(theme/theme\d+|slideMasters/slideMaster\d+|slideLayouts/slideLayout\d+|notesMasters/notesMaster\d+)\.xml"
_DOCX_EXTRA = r"word/(theme/theme\d+|styles)\.xml"
_REGULAR = {"regular", "normal", "book"}


def vietnamese_chars(text):
    return {c for c in text if any(lo <= ord(c) <= hi for lo, hi in _VN_RANGES)}


def _list_fonts(dirs):
    out = []
    for d in dirs:
        if not d or not os.path.isdir(d):
            continue
        for root, _, names in os.walk(d):
            for n in names:
                if n.lower().endswith((".ttf", ".otf", ".ttc")):
                    out.append(os.path.join(root, n))
    return sorted(out)


def _signature(files):
    sig = []
    for f in files:
        try:
            st = os.stat(f)
            sig.append([f, st.st_size, int(st.st_mtime)])
        except OSError:
            continue
    return sig


class FontIndex:
    """family name (lower case) -> (file, index in collection); cached as JSON keyed by (file, size, mtime) of
    every font file, so a replaced or updated font invalidates it."""

    def __init__(self, cache_path=None, dirs=None):
        self.dirs = dirs or FONT_DIRS
        sig = _signature(_list_fonts(self.dirs))
        families = self._read_cache(cache_path, sig)
        if families is None:
            families = self._scan([s[0] for s in sig])
            self._write_cache(cache_path, sig, families)
        self.families = families
        self._cmaps, self._panose, self._symbol = {}, {}, {}

    @staticmethod
    def _read_cache(cache_path, sig):
        if not cache_path or not Path(cache_path).exists():
            return None
        try:
            data = json.loads(Path(cache_path).read_text(encoding="utf-8"))
            if data.get("v") == CACHE_VERSION and data.get("sig") == sig and isinstance(data["families"], dict):
                return data["families"]
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            pass
        return None

    @staticmethod
    def _write_cache(cache_path, sig, families):
        if not cache_path:
            return
        tmp = str(cache_path) + ".tmp"
        try:
            Path(tmp).write_text(json.dumps({"v": CACHE_VERSION, "sig": sig, "families": families}),
                                 encoding="utf-8")
            os.replace(tmp, cache_path)
        except OSError:  # cache is an optimisation only
            pass

    @staticmethod
    def _scan(files):
        primary, typographic = {}, {}  # name -> (rank, [path, i]); rank 0 = Regular face

        def offer(table, name, rank, entry):
            old = table.get(name)
            if old is None or rank < old[0]:
                table[name] = (rank, entry)

        for path in files:
            try:
                count = len(TTCollection(path, lazy=True).fonts) if path.lower().endswith(".ttc") else 1
                for i in range(count):
                    font = TTFont(path, fontNumber=i, lazy=True)
                    recs = [r for r in font["name"].names if r.platformID == 3]
                    regular = any(r.nameID == 2 and r.toUnicode().strip().lower() in _REGULAR for r in recs)
                    rank = 0 if regular else 1
                    for rec in recs:
                        if rec.nameID in (1, 16):
                            table = primary if rec.nameID == 1 else typographic
                            offer(table, rec.toUnicode().strip().lower(), rank, [path, i])
                    font.close()
            except Exception:  # unreadable font file: not indexable, skip it
                continue
        families = {name: entry for name, (_, entry) in primary.items()}
        for name, (_, entry) in typographic.items():  # nameID 16 only fills gaps (Arial Narrow reports "Arial")
            families.setdefault(name, entry)
        return families

    def _load(self, family):
        entry = self.families.get(family.strip().lower())
        if not entry:
            return None
        key = (entry[0], entry[1])
        if key not in self._cmaps:
            try:
                font = TTFont(entry[0], fontNumber=entry[1], lazy=True)
                self._cmaps[key] = set(font.getBestCmap() or {})
                self._symbol[key] = any(t.platformID == 3 and t.platEncID == 0 for t in font["cmap"].tables)
                pan = font["OS/2"].panose if "OS/2" in font else None
                self._panose[key] = (pan.bFamilyType, pan.bSerifStyle, pan.bProportion) if pan else None
                font.close()
            except Exception:  # file removed or damaged since indexing: treat as not installed
                return None
        return key

    def covers(self, family, chars):
        key = self._load(family)
        if key is None:
            return None
        return all(ord(c) in self._cmaps[key] for c in chars)

    def is_symbol(self, family):
        """Symbol-encoded fonts (Symbol, Wingdings...) hold glyph codes, not letters: never substitute them."""
        if _SYMBOL_FONT_RE.match(family or ""):
            return True
        key = self._load(family)
        return bool(key and self._symbol.get(key))

    def classify(self, family):
        key = self._load(family)
        pan = self._panose.get(key) if key else None
        if pan and pan[0] == 2:
            if pan[2] == 9:
                return "mono"
            if pan[1] in (11, 12, 13, 14, 15):
                return "sans"
            if 2 <= pan[1] <= 10:
                return "serif"
        name = family.lower()
        if any(k in name for k in ("mono", "courier", "consol")):
            return "mono"
        if "sans" not in name and any(k in name for k in ("serif", "times", "garamond", "georgia", "book",
                                                           "roman", "cambria", "palatino")):
            return "serif"
        return "sans"


def _check(el, attr, index, chars, part, found):
    name = el.get(attr)
    if not name or name.startswith("+") or _SYMBOL_FONT_RE.match(name):
        return False
    if getattr(index, "is_symbol", lambda n: False)(name):  # duck-typed test indexes may lack it
        return False
    ok = index.covers(name, chars)
    if ok is None:
        found.append((part, name, "not_installed", None))
        return False
    if ok:
        return False
    new = FALLBACK[index.classify(name)]
    el.set(attr, new)
    found.append((part, name, "replaced", new))
    return True


def _target_parts(pkg):
    extra = _PPTX_EXTRA if pkg.kind == "pptx" else _DOCX_EXTRA
    parts = select_parts(pkg, notes=True, comments=True)
    parts += [n for n in pkg.names() if re.fullmatch(extra, n) and n not in parts]
    return parts


def fix_fonts(pkg, chars, index):
    chars = vietnamese_chars(unicodedata.normalize("NFC", "".join(chars)))
    if not chars:
        return []
    labels = part_labels(pkg)
    found = []
    for part in _target_parts(pkg):
        root = pkg.root(part)
        changed = False
        for el in root.iter(q("a:latin")):
            changed |= _check(el, "typeface", index, chars, part, found)
        if pkg.kind == "docx":
            for el in root.iter(q("w:rFonts")):
                for attr in (q("w:ascii"), q("w:hAnsi")):
                    changed |= _check(el, attr, index, chars, part, found)
        if changed:
            pkg.mark_dirty(part)
    merged = {}
    for part, font, action, to in found:
        rec = merged.setdefault((font, action, to), {"font": font, "action": action, "where": [], "count": 0})
        if to:
            rec["to"] = to
        label = labels.get(part, part)
        if label not in rec["where"]:
            rec["where"].append(label)
        rec["count"] += 1
    return list(merged.values())
