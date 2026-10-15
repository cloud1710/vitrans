"""Dump what the Python helper decides in the translation logic, as JSON, for the JavaScript port's parity tests (M2
of docs/superpowers/plans/2026-10-14-browser-engine.md).

Every input here is synthetic (written for this project; the strings of helper/tests are synthetic too). The packs
are the committed, non-draft ones read from git HEAD (_style, pathology) plus synthetic packs written under
web/engine/tests/fixtures/engine/packs; the in-progress pack folders are never read.

Output (web/engine/tests/fixtures/engine/):
  pyre.json       Python regular expressions (the helper's own patterns and syntax edge cases) applied to a pool of
                  texts: matches with their groups, sub and split results; the JS side compiles the same patterns
                  with web/engine/pyre.js
  units.json      function-level cases: tags, qa, vnsyllable and the translate helpers on many small strings
  matching.json   manifests (built from the committed pathology pack + synthetic children) and pack selection
  packs.json      pack loading (sha256 of every source file), merging and glossary hits
  translate.json  Translator sessions with a SCRIPTED fake model: canned answers in call order, the exact prompts
                  sent, levels, flags, final texts, TM keys and TM contents
  pipeline.json   job wiring: pack choice, merged pack key, glossary hits, system prompt, scope and the outcome of
                  every segment of synthetic documents (prev / next context), with the scripted model
  repair.json     term repair candidates (repair.py) of synthetic mis-heard sentences over the pathology keys
  e2e.json        synthetic DOCX / PPTX through collect -> translate (scripted model) -> apply -> fit -> save: the
                  changed parts as the helper writes them (fonts and the re-open check are not part of the port)

Usage (Python = the vitranslate env): export_engine_fixtures.py [section ...]   (default: every section)
Console output is ASCII only.
"""
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "helper"))
sys.path.insert(0, str(ROOT / "helper" / "tests"))
sys.path.insert(0, str(ROOT / "tools"))

from vitranslate import matching, packs, qa, tags, translate, vnsyllable  # noqa: E402
from vitranslate.ooxml import document  # noqa: E402

OUT = ROOT / "web" / "engine" / "tests" / "fixtures" / "engine"
FLAG_LETTERS = ((re.I, "i"), (re.S, "s"), (re.M, "m"))


def write_json(obj, path, compact=False):
    text = json.dumps(obj, ensure_ascii=True, separators=(",", ":")) if compact else \
        json.dumps(obj, ensure_ascii=True, indent=1, sort_keys=False)
    Path(path).write_text(text + "\n", encoding="utf-8")


def flag_text(flags):
    return "".join(letter for bit, letter in FLAG_LETTERS if flags & bit)


def nfd(s):
    return unicodedata.normalize("NFD", s)


# ---------------------------------------------------------------- shared synthetic strings

VI_SENTENCES = [
    "Trong u m\u00e0ng n\u00e3o <g1>NF2-altered</g1> \u1edf ph\u1ed5i, <g2>m\u1ea5t 1p</g2> th\u01b0\u1eddng g\u1eb7p",
    "Kh\u1ed1i u \u1edf ph\u1ed5i nh\u1ecf",
    "Ph\u00e2n \u0111\u1ed9 u m\u00e0ng n\u00e3o",
    "Nhu\u1ed9m \u00e2m t\u00ednh",
    "T\u1ebf b\u00e0o gan ph\u00ecnh to quanh t\u0129nh m\u1ea1ch trung t\u00e2m",
    "Hepatocyte ph\u00ecnh to quanh t\u0129nh m\u1ea1ch trung t\u00e2m",
    "chi\u1ebfm 0,36-3% c\u1ee7a 7.016 ca",
    "Giai \u0111o\u1ea1n IIA $\\rightarrow$ IIB sau khi xem l\u1ea1i",
    "Kh\u1ed1i u $\\geq 5$ cm v\u00e0 x^{2}, CO_{2}",
    "\u0110\u1ed8T BI\u1ebeN BRAF V600E",
    "V\u00fa tr\u00e1i, g\u00f3c ph\u1ea7n t\u01b0 tr\u00ean ngo\u00e0i --- U x\u01a1 tuy\u1ebfn",
    "Sinh thi\u1ebft pulm\u00f4n",
    "H\u1ed9i ch\u1ee9ng S\u00e9zary",
    "**m\u1ea5t 1p** v\u00e0 *nh\u1ea5n m\u1ea1nh*",
    "Th\u1ec3 t\u1ebf b\u00e0o s\u00e1ng (CCRCC)",
]
EN_SENTENCES = [
    "In <g1>NF2-altered</g1> meningiomas of the lung, <g2>1p loss</g2> is common",
    "The tumor of the lung is small",
    "Meningioma grading",
    "Negative staining",
    "Swollen hepatocytes around the central vein",
    "accounts for 0.36-3% of 7,016 cases",
    "Stage IIA \u2192 IIB after review",
    "Spleen, upper pole, partial resection --- Congested red pulp with small granulomas",
    "Breast, left upper outer quadrant, ultrasound-guided core needle biopsy --- Fibroadenoma with apocrine metaplasia",
    "Clear cell type (CCRCC) with HER2 gain and p.V600E in NM_000546.6",
    "World Health Organization Classification of Tumours",
    "the cells were stained and the tissue was fixed",
    "Write $\\alpha$ in the formula",
    "SUMMARY OF EQA RESULTS",
    "Smith et al. J Clin Pathol 2001; 54:120-125",
]
ODD_TEXTS = [
    "", " ", "a", "_", "__x__", "x_y z", "\u00b2 \u00b3 \u2460", "\u0663\u0660 \u0967", "\U0001d400\U0001d41a b",
    "\U0001f600 emoji", "\u0130stanbul \u0131 \u017f K \u00df", "tab\there", "line\nbreak\n", "cr\r\nlf",
    "nbsp\u00a0x\u3000y\x85z\x1cw", "\u2028para\u2029", "\ufeffbom", "a-b - c -- d --- e \u2014 f \u2013 g ; h | i",
    "<g1>x</g1><x2/> < G1 > </ g1 > <g1/> <x3> &lt;g4&gt;", "<b>bold</b> <span style=\"color:red\">r</span> <br />",
    "$5 to $10", "C:\\Users\\data", "\\le 2 \\alpha \\frac{1}{2} ^{\\circ}", "e.g. Ki-67 (MIB-1) pT1a p<0.001",
    "Title Case Of The Book And The Sea", "x{2} {,3} a{1,2}b", "\"quoted\" \u201ccurly\u201d 'single' (paren) [br]",
    "http://example.org/a_b www.example.org mail@example.org",
    "\u0432\u0442\u043e \u0412\u0422\u041e \u1c80\u1c84\u1c85\u1c82", "\u0130", "\\1 i",
]


def text_pool():
    pool = []
    for s in VI_SENTENCES + EN_SENTENCES + ODD_TEXTS:
        for t in (s, nfd(s)):
            if t not in pool:
                pool.append(t)
    return pool


# ---------------------------------------------------------------- pyre: Python patterns applied to texts

SYNTAX_CASES = [
    # (pattern, flags) -- syntax the translator must handle like Python
    (r"\w+", 0), (r"\W+", 0), (r"\d+", 0), (r"\D+", 0), (r"\s+", 0), (r"\S+", 0), (r"\b\w", 0), (r"\B\w", 0),
    (r"[^\W\d_]+", 0), (r"[^\W_]+", 0), (r"[\W_]+", 0), (r"[\w.\-']+", 0), (r"[^\s*]+", 0), (r"[*\w]+", 0),
    (r"[\s\S]", 0), (r"[^\S\n]+", 0), (r"[\d\W]+", 0), (r"[^\d\s]+", 0),
    (r".", 0), (r".", re.S), (r"^\w+", 0), (r"\w+$", 0), (r"^.*$", re.M), (r"\A\w", 0), (r"\w\Z", 0),
    (r"x{2}|\{,3\}|a{1,2}b", 0), (r"x{,2}", 0), (r"{abc}", 0), (r"a{", 0), (r"\{", 0), (r"]", 0), (r"[]a]", 0),
    (r"[^]a]", 0), (r"[a-c\-]+", 0), (r"[\]\[]", 0), (r"\-", 0), (r"\ ", 0), (r"\#\&\~", 0), (r"[(){}|/.*+?$^]", 0),
    (r"(?:a|b)+", 0), (r"(a)(b)?", 0), (r"(?P<first>\w)(?P=first)", 0), (r"(\w)\1", 0), (r"(?<=\d)x", 0),
    (r"(?<!\w)ab(?!\w)", re.I), (r"(?i:b|em|strong)", 0), (r"(?i:[gx])\d", 0), (r"\x41\u0042\U00000043", 0),
    (r"\t|\n|\r", 0), (r"a(?#comment)b", 0), (r"(?i)istanbul", 0), (r"ISTANBUL", re.I), (r"stra(?i:SSE)", 0),
    (r"K", re.I), (r"\u00e9", re.I), (r"\u00c9t\u00e9", re.I), (r"[a-z]+", re.I), (r"[^a-z]+", re.I),
    (r"\$([^$\n]{1,80}?)\$", 0), (r"<(/?)g(\d+)>|<x(\d+)/>", 0), (r"(?<![\w-])ly-?mph(?![\w-])", 0),
    (r"a*", 0), (r"x*", 0), (r"\b", 0), (r"(?=a)", 0),
    ("\xdf|\u01c6|[\u01c6]|\u03b8", re.I), ("[^\xe0-\xff]+", re.I), ("i(?-i:I)", re.I), (r"(a)\1", re.I),
    ("\u0111\u1ed4i", re.I), (r"(?s:.)(?m:^x$)", 0),
    # \B never matches the empty string (Python 3.11); re.I equivalents of Python's _casefix table (Cyrillic);
    # an escaped backslash before a digit is no back-reference (re.I stays sre's, not JavaScript's /i)
    (r"\B", 0), ("\u0432\u0442\u043e", re.I), ("[\u0432-\u0442]+", re.I), (r"\\1|i", re.I),
]
# re.sub templates: group references, \g<...>, octal escapes (\0 = NUL), \b = backspace, unknown escapes kept
TEMPLATES = [
    (r"(a)(b)?", 0, r"[\1|\2]", "ab a x"), (r"(?P<w>\w)", 0, r"<\g<w>\g<0>\g<1>>", "xy"),
    (r"(\w)", 0, r"\0\01\012\101|", "ab"), (r"a", 0, r"\b\n\t\\\-", "a"), (r"(x)", 0, r"\10\1", "x"),
    (r"(\d)", 0, r"\1\11", "5"), (r"o", 0, "", "foo"), (r"(o)", 0, r"\g<1>0", "foo"),
]


def collect_module_patterns():
    """Every compiled module-level pattern of the ported modules (name, pattern, flags)."""
    out = []
    for mod in (tags, qa, translate, vnsyllable, matching, packs, document):
        for name in sorted(vars(mod)):
            v = getattr(mod, name)
            if isinstance(v, re.Pattern):
                out.append(("%s.%s" % (mod.__name__.split(".")[-1], name), v.pattern, v.flags & (re.I | re.S | re.M)))
    return out


def match_record(m):
    return [m.start(), m.end()] + [None if g is None else g for g in m.groups()]


def pyre_section():
    cases = [(name, pat, flags) for name, pat, flags in collect_module_patterns()]
    cases += [("syntax %d" % k, pat, flags) for k, (pat, flags) in enumerate(SYNTAX_CASES)]
    texts = text_pool()
    rows = []
    for name, pat, flags in cases:
        rx = re.compile(pat, flags)
        hits = []  # texts with a match: [text index, matches, sub, split]; no entry = no match anywhere
        for k, t in enumerate(texts):
            found = [match_record(m) for m in rx.finditer(t)]
            if found:
                hits.append([k, found, rx.sub("<\u00b7>", t), rx.split(t)])
        rows.append({
            "name": name, "pattern": pat, "flags": flag_text(flags), "groups": rx.groups, "hits": hits,
            "fullmatch": [k for k, t in enumerate(texts) if rx.fullmatch(t) is not None],
            "match1": [[k, match_record(m)] for k, m in ((k, rx.match(t, 1)) for k, t in enumerate(texts)) if m],
        })
    errors = []
    for pat in ["(oops", "a)", "[a", "z-a]", "[z-a]", "\\q", "a**", "*a", "(?P<1>x)", "x{2,1}"]:
        try:
            re.compile(pat)
            errors.append([pat, False])
        except re.error:
            errors.append([pat, True])
    templates = []
    for pat, flags, repl, text in TEMPLATES:
        try:
            out = re.compile(pat, flags).sub(repl, text)
        except (re.error, IndexError) as exc:
            out = {"error": type(exc).__name__}
        templates.append([pat, flag_text(flags), repl, text, out])
    return {"texts": texts, "cases": rows, "errors": errors, "templates": templates}


# ---------------------------------------------------------------- units: function-level cases

GOOD = VI_SENTENCES[0]
NO_G1 = GOOD.replace("<g1>", "").replace("</g1>", "")

TAG_SRC = [
    EN_SENTENCES[0], "a <g1>b</g1> c<x1/>d", "<g1>a</g1> <g2>b</g2>", "Line one<x1/>line two <g1>bold</g1>",
    "<g1>Primary antibody</g1>: dilution", "<g1>Sub optimal fixation </g1>e.g. delay", "<g1>TSC/MTOR</g1>-mutated",
    "include <g1>VHL</g1> genes", "<g1>Note: </g1><g2>BRAF</g2> mutated", "x <g1>y <g2>z</g2></g1> w",
    "<x1/><x2/>Figure 1. Tumour cells", "ab<x1/><x2/>cd", "<g1>x <g2>y</g2></g1> z",
    "with <g1>diffuse hyperplasia </g1><x2/>(Please correlate", "magnification <x400> view", "Grade G1<G2 tumours",
    "10<g1>9</g1>/L", "Area 5 cm<g1>2</g1> around the <g2>tumor</g2>.",
    "The coefficient <g1>x1</g1> of the model<x1/>is small", "<g1>a</g1> b<x1/>c", "Dear <Name>, thank you",
    "<g1><x1/></g1> t", "word <g1>b</g1>", "<g10>ten</g10> and <g2>two</g2>", "nephrectomy<x1/>--- Renal",
    "<g1>diffuse hyperplasia </g1>(Please correlate)", "a<x1/> Text", "Text <x1/>", "Tissue of the <g1>lung</g1> was fixed",
    "Use **bold** and *it*", "\u00c9t\u00e9 <g1>\u00e0 Paris</g1>", nfd("Tr\u01b0\u1edbc <g1>m\u1ed5</g1> sau"),
    "See (fig. 2) <g1>below</g1> now", "(a) <g1>b</g1>, (c) <g2>d</g2>", "word <g1>b</g1> \u201cquoted\u201d",
]
TAG_OUT = [
    GOOD, NO_G1, "x <g1>y</g1> z<x1/>w", "<g2>B</g2> va <g1>A</g1>", "x <g1></g1> z<x1/>", "<g1>a <g2>b</g1></g2>",
    "< G1 >x</ g1 >< X2 />", "Dong mot dong hai <g1>dam</g1> <g7>?</g7><x9/>", "Khang the so cap<g1></g1>: do pha loang",
    "<g1>Co dinh</g1>vi du", "<g1>L\u01b0u \u00fd:</g1><g2>BRAF</g2> \u0111\u1ed9t bi\u1ebfn", "x<g1>y<g2>z</g2></g1>w",
    "H\u00ecnh 1. T\u1ebf b\u00e0o u", "<g1>A</g1> B<x1/>C <i>D</i><g1/></G1>", "<g1>A</g1> B&lt;g2&gt;x&lt;/g2&gt;",
    "<g1>A</g1> B </x1", "x</x1>y z w", "v\u1edbi <g1>t\u0103ng s\u1ea3n lan t\u1ecfa</g1><x2/>(Vui l\u00f2ng",
    "<g1>A</g1> <span style=\"color:red\">B</span>", "U \u0111\u1ed9 G1 < G2", "K\u00ednh g\u1eedi <T\u00ean>, c\u1ea3m \u01a1n",
    "<g1> <x1/> </g1> t", "tu<x1/><g1>b</g1>", "<g2>hai</g2> v\u00e0 <g10>m\u01b0\u1eddi</g10>",
    "V\u00f9ng nhi\u1ec1u t\u1ebf b\u00e0o 5 cm2 quanh u.", "", ".", "<g1>x <g2>y</g1> z</g2>", "Nhu\u1ed9m <g1>...</g1>",
    "Nhu\u1ed9m \u00e2m t\u00ednh <g1>\u2026</g1>", "<g1>t\u0103ng s\u1ea3n</g1>(Vui l\u00f2ng)", "b<x1/>Van ban",
    "<x1/>Van ban", "M\u00f4 **pulm\u00f4n** \u0111\u01b0\u1ee3c c\u1ed1 \u0111\u1ecbnh", "Tr\u01b0\u1edbc <g1>m\u1ed5</g1>sau",
    nfd("Tr\u01b0\u1edbc <g1>m\u1ed5</g1> sau"), "<G1>a</G1> <g1>b</g1>", "a <x1/><x1/> <x3/>",
    "Xem (h\u00ecnh 2)<g1>d\u01b0\u1edbi</g1> nay", "(a)<g1>b</g1>, (c)<g2>d</g2>",
    "t\u1eeb<g1>b</g1>\u201ctr\u00edch\u201d",
]

QA_SRC = [
    "The NTRKBCDG marker, the CcRCCTkR clone and the XYZWQRST code",
    "Paraffin wax not completely removed from the tissue section", "BRAF VE1 (-)",
    "accounts for 0.36-3% of 7,016 cases", "in 2 months", "Lung and breast", "a myxoma", "Meningiomas",
    "Lung biopsy", "S\u00e9zary syndrome", "tumour cells and tissue fixed", "World Health Organization Classification of Tumours",
    "see \"the role of the cell\" in the text", "the cells were stained and the tissue was fixed",
    "diagnoses and indices", "Six histological patterns", "Oestrogen receptors", "two lymph-nodes", "lymph-node",
    "Clear cell (CCRCC) with HER2 gain", "Chromophobe (ChRCC) and UCa", "Recut H&E and IHC", "Normal 22q11.2 region",
    "Transcript NM_000546.6 checked", "Low ER+ve tumours", "Two CNBs with PTCs", "FTD-tdp43 inclusions",
    "34betaE12 (rare cells)", "CD117+ and p.V600E", "Lateral neck LNs in HCMC",
    "Size 18.9x17.9 mm, 65fmol/mg per mm2", "Jane Doe, MD, PhD, FRCPath", "Born 14 SEP 1990 in JAPAN",
    "Level II and TBS VI", "SUMMARY OF EQA RESULTS", "In the 19th century, over 65yo, x2", "UK and USA centres",
    "Atlas of Tumours of the Northern Mountain Provinces",
    "Spleen, upper pole, partial resection --- Congested red pulp with small granulomas "
    "(Please compare with Lee\u2019s culture results)",
    "UBC cytology of the right ureter showed a low-grade papillary neoplasm", "the tumour of the lung",
    "Patients received gefitinib, erlotinib, afatinib", "Courtesy of Dr. Mei-Ling Tran", "Email: jdoe2@go.example.org",
    "in the right lobe", "the right lobe was removed", "HER2 and ER status", "Breast, Left, Lumpectomy --- Fibroadenoma",
    "Liver, Wedge Biopsy --- Steatosis", "Annual Meeting, Program Committee, Chair", "Left Kidney", "Grade of the lesion",
    "Class 2", "Levels of mRNA", "Patients with p53 loss", "Ki-67 in tau-positive cells", "3 Groups", "other findings",
    "Breast, left upper outer quadrant, ultrasound-guided core needle biopsy --- Fibroadenoma with apocrine metaplasia",
    "Grade 2; necrosis and brain invasion are both absent", "Liver --- Steatosis", "Nuclear \u03b2-catenin staining",
    "Stage IIA \u2192 IIB after review", "Tumours \u2265 5 cm", "Cells 5 \u00b5m wide", "Kept at 4 \u00b0C",
    "Write $\\alpha$ in the formula", "Half of the cells", "Area in mm2", "Costs $5 to $10",
    "Swollen hepatocytes around the central vein", "Nodule in the left lobe", "A deletion of 1p was found",
    "Losses of chromosomes 6 and 10", "Treated with trastuzumab", "Infection with Streptococcus pneumoniae",
    "Do not reuse old slides", "Tau in neurons", "Group C: ", "Fluid: clear", "Use ``` fences", "\"Quoted\"",
    "Text", "Translation: x", "",
    "Small round blue cells fill the marrow space now",  # exactly 40 letters: the ratio gate's boundary
    "1-3 NOVEMBER 2026", "Sept 2019 to May 2020",  # month names -> their numbers in Vietnamese
]
QA_OUT = [
    "S\u00e1p paraffin ch\u01b0a \u0111\u01b0\u1ee3c lo\u1ea1i b\u1ecf ho\u00e0n to\u00e0n", "BRAF VE1 (-)",
    "chi\u1ebfm 0,36-3% c\u1ee7a 7.016 ca", "trong 3 th\u00e1ng", "Pulm\u00f4n v\u00e0 v\u00fa", "u nh\u00e0y",
    "C\u00e1c u nh\u00e0y m\u00e0ng n\u00e3o", "Sinh thi\u1ebft pulm\u00f4n", "H\u1ed9i ch\u1ee9ng S\u00e9zary",
    "T\u1ebf b\u00e0o s\u00e1ng v\u00e0 t\u0103ng HER2", "T\u1ebf b\u00e0o s\u00e1ng (ccRCC)", "Th\u1ec3 v\u00f9i FTD-TDP-43",
    "34 beta E12 (hi\u1ebfm t\u1ebf b\u00e0o)", "V\u00f9ng 22q11,2 b\u00ecnh th\u01b0\u1eddng", "Hai CNB",
    "H\u1ea1ch c\u1ed5 b\u00ean t\u1ea1i TP.HCM", "BS TS Jane Doe, FRCPath", "Nh\u00f3m 2 v\u00e0 TBS 6",
    "T\u00d3M T\u1eaeT K\u1ebeT QU\u1ea2 NGO\u1ea0I KI\u1ec2M",
    "Spleen, upper pole, partial resection --- T\u1ee7y \u0111\u1ecf sung huy\u1ebft k\u00e8m u h\u1ea1t nh\u1ecf", "u: the tumour of the lung",
    "B\u1ec7nh nh\u00e2n d\u00f9ng gefitinib, erlotinib, afatinib", "\u1edf th\u00f9y ph\u1ea3i (in the right lobe)",
    "th\u00f9y right lobe \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1eaft", "t\u00ecnh tr\u1ea1ng HER2 and ER",
    "Breast, Left, Lumpectomy --- U x\u01a1 tuy\u1ebfn", "Liver, Wedge Biopsy --- Nhi\u1ec5m m\u1ee1",
    "Left Kidney b\u00ean tr\u00e1i", "ph\u00e2n \u0111\u1ed9 c\u1ee7a t\u1ed5n th\u01b0\u01a1ng", "\u201cnh\u00f3m 2\u201d",
    "<g1>t\u00ecnh tr\u1ea1ng</g1> di\u1ec7n c\u1eaft", "mRNA t\u0103ng", "p53 m\u1ea5t \u1edf b\u1ec7nh nh\u00e2n",
    "tau d\u01b0\u01a1ng t\u00ednh", "3 nh\u00f3m", "V\u00fa tr\u00e1i, g\u00f3c ph\u1ea7n t\u01b0 --- U x\u01a1 tuy\u1ebfn",
    "\u0110\u1ed9 2; kh\u00f4ng c\u00f3", "Gan --- M\u1ee1", "Nhu\u1ed9m $\\beta$-catenin trong nh\u00e2n",
    "Giai \u0111o\u1ea1n IIA $\\rightarrow$ IIB sau khi xem l\u1ea1i", "Kh\u1ed1i u $\\geq 5$ cm", "Kh\u1ed1i u \\le 2 cm",
    "T\u1ebf b\u00e0o r\u1ed9ng 5 $\\mu$m", "Gi\u1eef \u1edf 4 $^{\\circ}$C", "T\u00edn hi\u1ec7u <g1>TGF-$\\beta$</g1>",
    "M\u1ed9t n\u1eeda $\\frac{1}{2}$ s\u1ed1 t\u1ebf b\u00e0o", "Di\u1ec7n t\u00edch mm^{2}", "Gi\u00e1 $5 \u0111\u1ebfn $10",
    "Hepatocyte ph\u00ecnh to quanh t\u0129nh m\u1ea1ch trung t\u00e2m", "N\u1ed1t \u1edf th\u00f9y left",
    "Ph\u00e1t hi\u1ec7n deletion 1p", "M\u1ea5t nhi\u1ec5m s\u1eafc th\u1ec3 6 v\u00e0 10 chromosomes",
    "\u0110i\u1ec1u tr\u1ecb b\u1eb1ng trastuzumab", "Nhi\u1ec5m Streptococcus pneumoniae", "Tau trong neuron",
    "Kh\u00f4ng d\u00f9ng l\u1ea1i lam c\u0169 do h\u1ecfng", "Nh\u00f3m C: /no_think", "<think>\nhmm\n</think>\nV\u0103n b\u1ea3n",
    "Translation: V\u0103n b\u1ea3n", "\"V\u0103n b\u1ea3n\"", "\"Tr\u00edch\"", "D\u1ecbch: trong", "Translation: y",
    "<think>a</think>b</think>V\u0103n", "V\u0103n <think>unclosed", "\"a\" v\u00e0 \"b\"",
    "Translate:\nV\u0103n b\u1ea3n", "Here is the Vietnamese translation:\n```\nV\u0103n b\u1ea3n\n```",
    "B\u1ea3n d\u1ecbch ti\u1ebfng Vi\u1ec7t:\nV\u0103n b\u1ea3n", "Vietnamese: V\u0103n b\u1ea3n", "```\nD\u00f9ng\n```",
    "Swollen hepatocytes", "Paraffin wax not completely removed from the tissue section", "",
    nfd("Kh\u1ed1i u \u1edf ph\u1ed5i nh\u1ecf v\u00e0 g\u1ed3m 2,5 cm"), "PULM\u00d4N", "Ung th\u01b0 Pulm\u00f4n",
    "T\u1ebf b\u00e0o nh\u1ecf", "Nhi\u1ec1u lymph\u00f4 b\u00e0o, LYMPH\u00d4 v\u00e0 carcin\u00f4m",
    "1\u20133 TH\u00c1NG 11 N\u0102M 2026", "th\u00e1ng 9/2019 \u0111\u1ebfn th\u00e1ng 5/2020", "1-3 th\u00e1ng 12 n\u0103m 2026",
]
# the words of the active packs that the suspicious-word check accepts (packs.allowed_words: lower case)
SUSPICIOUS_ALLOWED = ["lymph\u00f4", "pulm\u00f4n", "s\u00e9zary"]
QA_HITS = [("biopsy", "sinh thi\u1ebft"), ("lung", "ph\u1ed5i"), ("carcinoma", "ung th\u01b0 bi\u1ec3u m\u00f4"),
           ("diagnosis", "ch\u1ea9n \u0111o\u00e1n"), ("index", "ch\u1ec9 s\u1ed1"), ("histologic patterns", "v"),
           ("estrogen receptor", "th\u1ee5 th\u1ec3 estrogen"), ("lymph node", "h\u1ea1ch"), ("high-grade", "\u0111\u1ed9 cao"),
           ("node", "n\u00fat"), ("tumor", "u"), ("Lewy body", "th\u1ec3 Lewy")]
TERMS = {"deletion", "chromosome", "hepatocyte"}
WORDS = ["flies", "spies", "skies", "bronchi", "radii", "abacus", "focus",
         "pathology", "pathologic", "pathological", "histologic", "neuropathology", "tumor", "tumour", "estrogen",
         "oestrogen", "hematoxylin", "haematoxylin", "hem", "haem", "organize", "organisation", "analyses", "diagnosis",
         "index", "nucleus", "bacterium", "biopsy", "matrix", "vertex", "clinic", "esophagus", "leukemia", "fetus",
         "color", "center", "fiber", "behavior", "anemia", "x", "", "Ki-67", "t(9;22)", "co-ordinate", "a.b", "AIDS"]
TERMS_BOUNDED = ["lymph node", "high-grade", "Lewy body", "histologic patterns", "estrogen receptor", "node",
                 "neuropathology", "t(9;22)", "Ki-67", "  spaced   term ", "-", "", "cancer of the colon",
                 "hematoxylin and eosin", "\u00e9t\u00e9", "CD3+ cells"]
VN_WORDS = ["nguy\u1ec5n", "\u0111\u01b0\u1eddng", "tho\u00e1i", "khu\u1ef7u", "qu\u1ed1c", "gi\u1eefa", "nghi\u00eang",
            "\u01b0a", "h\u00f3a", "ng\u01b0\u1eddi", "chuy\u1ec3n", "m\u00f4", "b\u1ec7nh", "h\u1ecdc", "x\u01b0\u01a1ng",
            "tuy\u1ebfn", "gi\u00e1p", "h\u01b0\u1edbng", "khuy\u1ebft", "g\u00ec", "qu\u00fd", "nh\u1eefng",
            "\u0111\u01b0\u1ee3c", "\u0110\u01af\u1edcNG", "pulm\u00f4n", "th\u01b0\u1eddngg", "\u1eb9xtra", "tr\u1ebb\u1ebb",
            "do", "can", "tau", "Hepatocyte", "a", "", nfd("nguy\u1ec5n"), "\u0111", "x\u0303"]
CAPS_HITS = [("spindle cell", "t\u1ebf b\u00e0o h\u00ecnh thoi"), ("BRAF", "BRAF"), ("Ki-67", "Ki-67"),
             ("lung", "ph\u1ed5i")]  # a 4-letter lower-case key: the caps-prose bound
CODE_CELLS = ["LUNG BASE", "BRAF VE1", "Ki-67 (MIB-1)", "pT1a", "p<0.001", "CD20+", "HER2 3+", "<5 mm", "Ki-67", "p53",
              "OVERVIEW OF STAINING METHODS", "SEVEN YEARS LATER (2019)", "QUALITY CONTROL IN DAILY PRACTICE",
              "SPINDLE CELL", "BRAF NRAS KRAS", "TERT", "CDKN2A/B", "ALK ROS1 RET", "Negative staining", "trastuzumab",
              "Left", "No", "no", "NO", "mm hpf", "Smith et al. J Clin Pathol 2001; 54:120-125",
              "Nguyen A et al. Mod Pathol. 2019.", "Brown et al. (Am J Surg Pathol 2010)",
              "Histopathology. 2021 May;79(2):100-110.", "Garcia L et al. examplejournal.org 2018:",
              "Example J. 2024 Mar 2;16(3):e51234.", "Conclusion from Smith et al. (2017):", "Benign (Am J Pathol 1981)",
              "Results for ER agree with Smith et al. Example J Pathol 2000; 61: 101-108.", "", "\u00c9T\u00c9 ROUGE",
              "I AM ATTENDING ASDP 2026", "1-3 NOVEMBER 2026", "MAY 2026", "MAY", "SINGAPORE", "ER PR HER2 STATUS",
              "CD20 AND CD3", "RESULTS OF THE STUDY", "KI-67 IN TUMOUR", "HER2 IS POSITIVE"]
# academic-title runs (qa.fix_title_order): every rank, dots, tags, names with marks, and what stays as it is
TITLE_TEXTS = [
    "BS. TS. Jane Doe \u0111\u00e3 xem l\u1ea1i", "BS TS Jane Doe", "TS BS Nguyen A", "GS TS BS John Smith",
    "BS TS PGS Mei-Ling Tran", "BS. ThS. Nguy\u1ec5n V\u0103n A", "KS. ThS. Tran B", "CN TS Tran B", "BS Jane Doe",
    "TS. BS. TS. Jane Doe", "<g1>BS TS Jane Doe</g1> \u0111\u00e3 k\u00fd", "(BS. TS. Jane Doe)",
    "BS. TS. <g1>Jane Doe</g1>, MD", "BS TS <g1><g2>Jane</g2> Doe</g1>",
    "BS TS Jane Doe v\u00e0 BS. TS. John Smith, BS. TS. Nguyen A; TS. BS. Tran B", "BS\tTS  Jane Doe",
    "BS TS O'Brien", "BS TS O\u2019Brien", "BS TS \u0110\u1eb7ng V\u0103n A", nfd("BS TS \u0110\u1eb7ng V\u0103n A"),
    "BS TS \u00c9mile Roux", "TS. BS. Jane Doe", "GS. TS. BS. John Smith", "PGS. TS. Nguyen A", "ThS. BS. Tran B",
    "TS.  BS. Jane Doe", "C\u00e1c BS v\u00e0 TS", "BS CKII Nguyen A", "d\u00e2y th\u1ea7n kinh s\u1ecd (CN VII)",
    "TSH v\u00e0 BS", "Jane Doe, BS, TS", "<g1>BS. TS.</g1> Jane Doe", "BS-TS Nguyen A", "PGS.TS. Nguyen A",
    "bs ts Jane Doe", "BS TS 2 l\u1ea7n", "BS TS", "BS TS A. Smith", "ABS TS Nguyen", "", "BS. TS. <x1/>Jane",
    "Theo BS TS Jane Doe v\u00e0 PGS BS Tran B.",
]


def pairs_of(fn, a, b, marker=None):
    """fn over the cross product a x b, in order; marker: index of the argument a result equal to it is stored as
    True (keeps the file small)."""
    out = []
    for x in a:
        for y in b:
            r = fn(x, y)
            if marker is not None and r == (x, y)[marker]:
                r = True
            out.append(r)
    return out


def plain_of(text):
    return translate._plain(text)


def title_order_logged(text):
    """[text, applied, log] of qa.fix_title_order with a log."""
    log = []
    out, applied = qa.fix_title_order(text, log)
    return [out, applied, log]


def units_section():
    tag_src, tag_out = TAG_SRC, TAG_OUT
    qa_src, qa_out = QA_SRC, QA_OUT
    pools = {"tag_src": tag_src, "tag_out": tag_out, "qa_src": qa_src, "qa_out": qa_out, "words": WORDS,
             "terms_bounded": TERMS_BOUNDED, "vn_words": VN_WORDS, "code_cells": CODE_CELLS,
             "title_texts": TITLE_TEXTS}
    hits = [list(h) for h in QA_HITS]
    pair = {
        "tags.check": ["tag_src", "tag_out", None, pairs_of(tags.check, tag_src, tag_out)],
        "tags.repair": ["tag_src", "tag_out", 1, pairs_of(tags.repair, tag_src, tag_out, 1)],
        "tags.restore_spaces": ["tag_src", "tag_out", 1, pairs_of(tags.restore_spaces, tag_src, tag_out, 1)],
        "tags.normalize_tokens": ["tag_src", "tag_out", 1,
                                  pairs_of(lambda s, o: tags.normalize_tokens(o, s), tag_src, tag_out, 1)],
        "tags.stray_markup": ["tag_src", "tag_out", None, pairs_of(tags.stray_markup, tag_src, tag_out)],
        "tr._drop_blank_invented": ["tag_src", "tag_out", 1,
                                    pairs_of(translate._drop_blank_invented, tag_src, tag_out, 1)],
        "tr._strip_emphasis": ["tag_src", "tag_out", None,
                               pairs_of(lambda s, o: list(translate._strip_emphasis(s, o)), tag_src, tag_out)],
        "qa.strip_leaks.tags": ["tag_src", "tag_out", 1, pairs_of(qa.strip_leaks, tag_src, tag_out, 1)],
        "qa.source_case.tags": ["tag_src", "tag_out", 1,
                                pairs_of(lambda s, o: qa.source_case(plain_of(s), o), tag_src, tag_out, 1)],
        "qa.fix_latex.tags": ["tag_src", "tag_out", 1,
                              pairs_of(lambda s, o: qa.fix_latex(plain_of(s), o), tag_src, tag_out, 1)],
        "qa.english_left": ["qa_src", "qa_out", None, pairs_of(qa.english_left, qa_src, qa_out)],
        "qa.copied_english": ["qa_src", "qa_out", None, pairs_of(qa.copied_english, qa_src, qa_out)],
        "qa.single_english": ["qa_src", "qa_out", None, pairs_of(qa.single_english, qa_src, qa_out)],
        "qa.single_english.terms": ["qa_src", "qa_out", None,
                                    pairs_of(lambda s, o: qa.single_english(s, o, TERMS), qa_src, qa_out)],
        "qa.english_copies.terms": ["qa_src", "qa_out", None,
                                    pairs_of(lambda s, o: qa.english_copies(s, o, TERMS), qa_src, qa_out)],
        "qa.numbers_changed": ["qa_src", "qa_out", None, pairs_of(qa.numbers_changed, qa_src, qa_out)],
        "qa.missing_tokens": ["qa_src", "qa_out", None, pairs_of(qa.missing_tokens, qa_src, qa_out)],
        "qa.omitted_clauses": ["qa_src", "qa_out", None, pairs_of(qa.omitted_clauses, qa_src, qa_out)],
        "qa.new_latex": ["qa_src", "qa_out", None, pairs_of(qa.new_latex, qa_src, qa_out)],
        "qa.fix_latex": ["qa_src", "qa_out", 1, pairs_of(qa.fix_latex, qa_src, qa_out, 1)],
        "qa.source_case": ["qa_src", "qa_out", 1, pairs_of(qa.source_case, qa_src, qa_out, 1)],
        "qa.suspicious_tokens": ["qa_src", "qa_out", None,
                                 pairs_of(lambda s, o: qa.suspicious_tokens(o, s), qa_src, qa_out)],
        "qa.suspicious_tokens.allowed": ["qa_src", "qa_out", None,
                                         pairs_of(lambda s, o: qa.suspicious_tokens(o, s, SUSPICIOUS_ALLOWED), qa_src,
                                                  qa_out)],
        "qa.glossary_misses": ["qa_src", "qa_out", None,
                               pairs_of(lambda s, o: qa.glossary_misses(s, o, QA_HITS), qa_src, qa_out)],
        "qa.strip_leaks": ["qa_src", "qa_out", 1, pairs_of(qa.strip_leaks, qa_src, qa_out, 1)],
        "tr._suspect": ["qa_src", "qa_out", None, pairs_of(translate._suspect, qa_src, qa_out)],
        "tr._suspect.context": ["qa_src", "qa_out", None,
                                pairs_of(lambda s, o: translate._suspect(s, o, True), qa_src, qa_out)],
        "tr._same": ["qa_src", "qa_out", None, pairs_of(translate._same, qa_src, qa_out)],
    }
    every = tag_src + tag_out + qa_src + qa_out
    single = {
        "tags.ids": ["tag", [list(tags.ids(t)) for t in tag_src + tag_out]],
        "tags.strip_tags": ["tag", [tags.strip_tags(t) for t in tag_src + tag_out]],
        "tags.strip_tags.keep_x": ["tag", [tags.strip_tags(t, keep_x=True) for t in tag_src + tag_out]],
        "tr._plain": ["tag", [translate._plain(t) for t in tag_src + tag_out]],
        "tr._reminder": ["tag", [translate._reminder(t) for t in tag_src + tag_out]],
        "qa.protected_tokens": ["every", [qa.protected_tokens(t) for t in every]],
        "qa.latex_markup": ["every", [qa.latex_markup(t) for t in every]],
        "qa._vietnamese": ["every", [qa._vietnamese(t) for t in every]],
        "qa._first_alnum": ["every", [qa._first_alnum(t) for t in every]],
        "vn.suspicious": ["every", [vnsyllable.suspicious(t) for t in every]],
        "match.tokens": ["every", [matching.tokens(t) for t in every]],
        "tr._code_only": ["code_cells", [translate._code_only(t) for t in CODE_CELLS]],
        "tr._citation_only": ["code_cells", [translate._citation_only(t) for t in CODE_CELLS]],
        "tr._caps_prose": ["code_cells", [translate._caps_prose(t, CAPS_HITS) for t in CODE_CELLS]],
        "qa._word_forms": ["words", [qa._word_forms(w) for w in WORDS]],
        "match._variants": ["words", [matching._variants(w.lower()) for w in WORDS]],
        "qa._bounded": ["terms_bounded", [qa._bounded(t) for t in TERMS_BOUNDED]],
        "vn.is_valid": ["vn_words", [vnsyllable.is_valid(w) for w in VN_WORDS]],
        "vn._needs_check": ["vn_words", [vnsyllable._needs_check(w) for w in VN_WORDS]],
        "qa.fix_title_order": ["title_texts", [title_order_logged(t) for t in TITLE_TEXTS]],
    }
    chars = sorted(set("".join(every + WORDS + VN_WORDS + text_pool())))
    py = {
        "chars": "".join(chars),
        "isdigit": [c.isdigit() for c in chars], "isalnum": [c.isalnum() for c in chars],
        "isupper": [c.isupper() for c in chars], "islower": [c.islower() for c in chars],
        "isalpha": [c.isalpha() for c in chars], "isspace": [c.isspace() for c in chars],
        "nameok": [c.isalpha() and unicodedata.name(c, "").startswith(("LATIN", "GREEK", "MICRO SIGN")) for c in chars],
        "strings": {
            "isupper": [t.isupper() for t in every], "islower": [t.islower() for t in every],
            "isalpha": [t.isalpha() for t in every], "isascii": [t.isascii() for t in every],
            "casefold": [t.casefold() for t in every], "lower": [t.lower() for t in every],
            "upper": [t.upper() for t in every], "split": [t.split() for t in every],
            "splitlines": [t.splitlines() for t in every],
        },
    }
    from vitranslate.tm import TM
    tm_keys = []
    for model, pack_key, tagged in [("qwen3.5:9b", "pathology@0.1.0", "In <g1>x</g1>"), ("m", "p", "x"), ("a", "bc", "d"),
                                    ("ab", "c", "d"), ("gemma-4-E2B-it", "pathology@0.1.8#0123abcd+_style@0.1.2+0.1.0|v8|abc",
                                                       GOOD + "\n1,2"), ("", "", ""),
                                    ("m", "p", "\U0001d400 \x00 " + nfd(GOOD))]:
        tm_keys.append([model, pack_key, tagged, TM.key(model, pack_key, tagged)])
    return {"pools": pools, "pairs": pair, "single": single, "py": py, "hits": hits, "terms": sorted(TERMS),
            "caps_hits": [list(h) for h in CAPS_HITS], "suspicious_allowed": SUSPICIOUS_ALLOWED,
            "cases": explicit_cases(), "tm_keys": tm_keys}


TERM_FIXES = [
    ("lung", "ph\u1ed5i", ["pulm\u00f4n"]), ("meningioma", "u m\u00e0ng n\u00e3o", ["u nh\u00e0y m\u00e0ng n\u00e3o", "u nh\u00e0y"]),
    ("genotyping", "x\u00e1c \u0111\u1ecbnh ki\u1ec3u gen", ["\u0111\u1ecbnh ki\u1ec3u gen"]),
    ("lymphoma", "u h\u1ea1ch", ["u lympho"]), ("lymph node", "h\u1ea1ch b\u1ea1ch huy\u1ebft", ["h\u1ea1ch"]),
    ("Lewy body", "th\u1ec3 Lewy", ["Lewy body"]),
    ("small blue round cell tumor", "u t\u1ebf b\u00e0o tr\u00f2n nh\u1ecf (m\u00e0u xanh)", ["xanh tr\u00f2n nh\u1ecf"]),
    ("fine needle aspiration", "ch\u1ecdc h\u00fat b\u1eb1ng kim nh\u1ecf (FNA)", ["ch\u1ecdc h\u00fat kim nh\u1ecf"]),
    ("thyroid inclusion", "m\u00f4 tuy\u1ebfn gi\u00e1p v\u00f9i trong h\u1ea1ch", ["th\u1ec3 v\u00f9i tuy\u1ebfn gi\u00e1p"]),
    ("surgical pathology", "gi\u1ea3i ph\u1eabu b\u1ec7nh ngo\u1ea1i khoa", ["gi\u1ea3i ph\u1eabu b\u1ec7nh ngo\u1ea1i khoa h\u1ecdc"]),
    ("mitotic figure", "h\u00ecnh ph\u00e2n b\u00e0o", ["h\u00ecnh ph\u00e2n b\u00e0o b\u1ea5t th\u01b0\u1eddng"]),
    ("deleted", "", ["b\u1ecb x\u00f3a b\u1ecf"]), ("hematoxylin", "hematoxylin", ["h\u00e9matoxylin"]),
]
FIX_SOURCES = ["Lung and breast", "a myxoma", "Meningiomas", "LUNG", "Lung cancer", "Lung and Meningioma", "genotyping",
               "lymphoma", "lymph node", "Lewy body", "small blue round cell tumor", "Fine needle aspiration",
               "thyroid inclusion", "surgical pathology", "mitotic figure", "two lymph-nodes and lungs", "deleted",
               "Haematoxylin", nfd("Lung \u00e9t\u00e9")]
FIX_OUTPUTS = ["Pulm\u00f4n v\u00e0 v\u00fa", "u nh\u00e0y", "C\u00e1c u nh\u00e0y m\u00e0ng n\u00e3o",
               "Pulm\u00f4n v\u00e0 u nh\u00e0y m\u00e0ng n\u00e3o", "PULM\u00d4N", "Ung th\u01b0 Pulm\u00f4n",
               "x\u00e1c \u0111\u1ecbnh ki\u1ec3u gen (genotyping)", "nhi\u1ec1u lympho b\u00e0o", "th\u1ea1ch",
               "c\u00f3 th\u1ec3 Lewy body", "c\u00f3 Lewy body", "Lewy body", "u t\u1ebf b\u00e0o xanh tr\u00f2n nh\u1ecf",
               "Ch\u1ecdc h\u00fat kim nh\u1ecf (FNA)", "th\u1ec3 v\u00f9i tuy\u1ebfn gi\u00e1p trong h\u1ea1ch",
               "gi\u1ea3i ph\u1eabu b\u1ec7nh ngo\u1ea1i khoa h\u1ecdc", "h\u00ecnh ph\u00e2n b\u00e0o b\u1ea5t th\u01b0\u1eddng",
               "<g1>Pulm\u00f4n</g1> v\u00e0 v\u00fa", "Hai h\u1ea1ch v\u00e0 pulm\u00f4n. Pulm\u00f4n: x", "\u0111\u00e3 b\u1ecb x\u00f3a b\u1ecf",
               nfd("Pulm\u00f4n v\u00e0 u nh\u00e0y"), "PULM\u00d4N V\u00c0 U NH\u00c0Y M\u00c0NG N\u00c3O", "h\u00e9matoxylin",
               "Nhu\u1ed9m H\u00e9matoxylin. H\u00e9matoxylin",
               # the canonical form already there as often as the source needs it: the wrong form stays
               "Ph\u1ed5i v\u00e0 pulm\u00f4n", "PH\u1ed4I, ph\u1ed5i v\u00e0 pulm\u00f4n",
               # a trailing abbreviation in another case: the term-lock still absorbs it -- with no space before the
               # parenthesis only the case-insensitive parenthesis rule does
               "Ch\u1ecdc h\u00fat kim nh\u1ecf (fna)", "Ch\u1ecdc h\u00fat kim nh\u1ecf(fna) cho th\u1ea5y"]


def explicit_cases():
    fixes = [packs.TermFix(en, vi, list(w)) for en, vi, w in TERM_FIXES]
    term_fix = []
    for src in FIX_SOURCES:
        for out in FIX_OUTPUTS:
            log = []
            text, applied = qa.apply_term_fixes(out, src, fixes, log)
            term_fix.append([src, out, text, applied, log])
    gate = []
    issue_sets = [["english_left"], ["english:Spleen, upper pole, partial resection"], ["ratio"], ["script", "scaffold"],
                  ["angle", "markdown", "latex"], ["acronym:CCRCC", "acronym:HER2"], ["omitted:Fibroadenoma with x"],
                  ["english_left", "ratio", "acronym:ER", "omitted:a b"], [], ["latex"]]
    answers = ["Giai \u0111o\u1ea1n IIA $\\rightarrow$ IIB $\\rightarrow$ IIC", "Kh\u1ed1i <g1>u</g1> $x^{2}$", ""]
    sources = ["Stage IIA to IIB", "Write $x^{2}$"]
    for issues in issue_sets:
        for ans in answers:
            for src in sources:
                gate.append([issues, ans, src, translate._gate_note(issues, ans, src), translate._retried(issues)])
    cache = []
    for level in range(6):
        for flags in [[], ["english_left"], ["unchanged"], ["tags_broken"], ["empty_output"], ["suspect_output:ratio"],
                      ["omitted:x"], ["formatting_lost"], ["term_fix:lung", "retried:gate"], ["acronym_lost:ER"]]:
            cache.append([level, flags, translate._cacheable(level, flags)])
    find_free = []
    for text, target, sl, sr in [("a <g1>u b</g1> u<x1/>", "u", False, False), ("<g1>u</g1> x1<x1/>", "u", False, False),
                                 ("V\u00f9ng nhi\u1ec1u t\u1ebf b\u00e0o 5 cm2 quanh u.", "u", False, False),
                                 ("V\u00f9ng nhi\u1ec1u t\u1ebf b\u00e0o 5 cm2 quanh u.", "2", True, False),
                                 ("M\u00f4 PH\u1ed4I ph\u1ed5i", "ph\u1ed5i", False, False), ("abc", "", False, False),
                                 ("x<x1/>y <g2>z</g2> y", "y", False, False), ("\U0001d400u u", "u", False, False)]:
        m = translate._find_free(text, target, sl, sr)
        find_free.append([text, target, sl, sr, None if m is None else [text[:m.start()], m.group(0)]])
    splits = []
    for tagged in TAG_SRC:
        for n in tags.ids(tagged)[0]:
            splits.append([tagged, n, list(translate._source_splits(tagged, n)), translate._span_text(tagged, n)])
    system = []
    for style, prompt, name, hits in [("STYLE RULES", "PACK VOICE", "GPB", [("lung", "ph\u1ed5i")]),
                                      ("STYLE", "", "Chung", []), ("", "P", "X", [("a", "b"), ("c", "d")])]:
        pk = packs.Pack("p", "1", name, [], prompt, [], [], [])
        system.append([style, prompt, name, [list(h) for h in hits], translate.build_system(style, pk, hits)])
    user = []
    astral = "\U0001d400" * 299 + "xyz"  # the 300-character cut counts code points, not UTF-16 units
    for tagged in TAG_SRC[:6]:
        for prev, nxt, note in [("", "", ""), ("P" * 350, "Next one", ""), ("", "N", "NOTE"), ("a", "", "b"),
                                (astral, astral, "")]:
            user.append([tagged, prev, nxt, note, translate.build_user(tagged, prev, nxt, note)])
    count = []
    texts = ["Tumors and a tumor; tumorigenesis. Lymph nodes, lymph-node. Ki-67 index. Mitoses.",
             "Two biopsies; one nucleus, many nuclei; bronchi; core biopsies.", "A nucleus.", "Many nuclei.",
             "HER2/neu and her2 neu; \u00e9t\u00e9 \u00c9T\u00c9", "Two flies and one fly; spies; skies; radii and a radius."]
    term_lists = [["tumor", "lymph node", "node", "ki-67", "index", "mitoses", "nodule"],
                  ["biopsy", "nuclei", "bronchus", "core biopsy"], ["nucleus"], ["her2/neu", "her2 neu", "\u00e9t\u00e9"],
                  ["fly", "spy", "sky", "radius"]]
    for t in texts:
        for terms in term_lists:
            count.append([t, terms, sorted(matching.count_terms(t, terms).items())])
    return {"term_fix": {"fixes": [list(f) for f in TERM_FIXES], "rows": term_fix}, "gate": gate, "cache": cache,
            "find_free": find_free, "splits": splits, "system": system, "user": user, "count_terms": count}


# ---------------------------------------------------------------- packs: committed packs + synthetic packs

REPO_PACKS = ROOT / "packs"
REAL = ("_style", "pathology")  # committed, non-draft packs the fixtures may use
SYNTH = OUT / "packs"
PACK_FILES = ("pack.json", "prompt.md", "glossary.csv", "rules.json", "tests.jsonl")


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, check=False)


def check_real_packs():
    """The committed packs used here must be exactly HEAD (pack miners edit other folders)."""
    for pid in REAL:
        if git("diff", "--quiet", "HEAD", "--", "packs/" + pid).returncode != 0:
            raise SystemExit("packs/%s differs from HEAD: commit or stash it before exporting" % pid)
        untracked = git("ls-files", "--others", "--exclude-standard", "--", "packs/" + pid).stdout.strip()
        if untracked:
            raise SystemExit("packs/%s has untracked files" % pid)
        meta = json.loads((REPO_PACKS / pid / "pack.json").read_text(encoding="utf-8"))
        if meta.get("draft") is True:
            raise SystemExit("packs/%s is a draft" % pid)


def text_sha(path):
    """sha256 of a text file with CR LF / CR as LF (a checkout may convert line ends)."""
    data = Path(path).read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(data).hexdigest()


def write_synthetic_packs():
    """Synthetic pack folders (inputs of the pack / matching / pipeline fixtures), rewritten on every export."""
    def pack(pid, meta, glossary=None, rules=None, prompt=None, tests=None, raw_csv=None):
        d = SYNTH / pid
        d.mkdir(parents=True, exist_ok=True)
        (d / "pack.json").write_text(json.dumps(meta, ensure_ascii=True), encoding="utf-8", newline="\n")
        if prompt is not None:
            (d / "prompt.md").write_bytes(prompt.encode("utf-8"))
        if raw_csv is not None:
            (d / "glossary.csv").write_bytes(raw_csv.encode("utf-8"))
        elif glossary is not None:
            rows = ["en,vi,note"] + ['"%s","%s",%s' % (en, vi, note) for en, vi, note in glossary]
            (d / "glossary.csv").write_text("\n".join(rows) + "\n", encoding="utf-8", newline="\n")
        if rules is not None:
            (d / "rules.json").write_text(json.dumps(rules, ensure_ascii=True, indent=1), encoding="utf-8", newline="\n")
        if tests is not None:
            (d / "tests.jsonl").write_text("".join(json.dumps(t, ensure_ascii=True) + "\n" for t in tests),
                                           encoding="utf-8", newline="\n")

    breast_detect = ["ductal carcinoma in situ", "HER2", "BI-RADS", "mammography", "lobular", "Nottingham"]
    breast_gloss = [("ductal carcinoma in situ", "ung th\u01b0 bi\u1ec3u m\xf4 \u1ed1ng t\u1ea1i ch\u1ed7", ""),
                    ("HER2", "HER2", ""), ("BI-RADS", "BI-RADS", ""),
                    ("mammography", "ch\u1ee5p X-quang tuy\u1ebfn v\xfa", ""), ("lobular", "ti\u1ec3u th\xf9y", ""),
                    ("Nottingham grade", "\u0111\u1ed9 Nottingham", ""), ("core needle biopsy", "sinh thi\u1ebft l\xf5i kim", ""),
                    ("tumor", "kh\u1ed1i u", "child row overrides the parent")]
    pack("breast", {"id": "breast", "version": "1.0.0", "name": "Breast (synthetic)", "parent": "pathology",
                    "detect": breast_detect}, breast_gloss,
         {"term_fixes": [{"en": "lobular", "vi": "ti\u1ec3u th\xf9y", "wrong": ["th\xf9y nh\u1ecf"]},
                         {"en": "mammography", "vi": "ch\u1ee5p X-quang tuy\u1ebfn v\xfa", "wrong": ["ch\u1ee5p v\xfa"]}]},
         "Breast voice (synthetic).", [{"src": "Lobular carcinoma.", "must": ["ti\u1ec3u th\xf9y"]}])
    pack("breast-kid", {"id": "breast-kid", "version": "0.1.0", "name": "Breast child (synthetic)", "parent": "breast",
                        "detect": ["phyllodes", "fibroadenoma"]},
         [("phyllodes tumor", "u di\u1ec7p th\u1ec3", ""), ("fibroadenoma", "u x\u01a1 tuy\u1ebfn", "")],
         {"term_fixes": [{"en": "fibroadenoma", "vi": "u x\u01a1 tuy\u1ebfn", "wrong": ["u tuy\u1ebfn x\u01a1"]}]},
         "Child voice (synthetic).")
    pack("finance", {"id": "finance", "version": "2.0.0", "name": "Finance (synthetic)",
                     "detect": ["budget", "spending", "fiscal year", "invoice"]},
         [("budget", "ng\xe2n s\xe1ch", ""), ("fiscal year", "n\u0103m t\xe0i ch\xednh", ""),
          ("spending", "chi ti\xeau", ""), ("threshold", "ng\u01b0\u1ee1ng", ""), ("invoice", "h\xf3a \u0111\u01a1n", "")],
         None, "Finance voice (synthetic).")
    sd = SYNTH / "_shared"
    sd.mkdir(parents=True, exist_ok=True)
    (sd / "core.csv").write_text('en,vi,note\n"patient","b\u1ec7nh nh\xe2n",\n"biopsy","sinh thi\u1ebft (shared)",\n'
                                 '"specimen","b\u1ec7nh ph\u1ea9m",\n', encoding="utf-8", newline="\n")
    (sd / "core.rules.json").write_text(json.dumps({"term_fixes": [
        {"en": "patient", "vi": "b\u1ec7nh nh\xe2n", "wrong": ["ng\u01b0\u1eddi b\u1ec7nh"]},
        {"en": "biopsy", "vi": "x", "wrong": ["y"]}]}, ensure_ascii=True), encoding="utf-8", newline="\n")
    pack("alpha", {"id": "alpha", "version": "1.0.0", "name": "Alpha", "detect": ["tumor"], "include": ["_shared/core"]},
         [("tumor", "u", ""), ("biopsy", "sinh thi\u1ebft", "")], {"term_fixes": [{"en": "Biopsy", "vi": "z", "wrong": []}]},
         "Prompt of alpha\r\nsecond line\r\n")
    pack("bad-include", {"id": "bad-include", "version": "1.0.0", "include": ["_shared/missing"]}, [])
    pack("bad-name", {"id": "bad-name", "version": "1.0.0", "include": ["../alpha"]}, [])
    pack("bad-wrong", {"id": "bad-wrong", "version": "1.0.0"}, [], {"term_fixes": [{"en": "x", "vi": "y", "wrong": ["(oops"]}]})
    csv_text = ("\ufeffen,vi,note\r\n"
                "\"lymph node\",\"h\u1ea1ch\",\"a \"\"quoted\"\" note\"\r\n"
                "\"multi\nline\",\"hai\r\nd\xf2ng\",x\r\n"
                "\r\n"
                "  spaced  ,  c\xe1ch  ,\r\n"
                "only-en,,\r\n"
                ",only-vi,\r\n"
                "extra,cols,a,b,c\r\n"
                "short\r\n"
                "q\"in,mid\"dle,\r\n"
                "\"after\"quote,v,\r\n"
                "\"unterminated,v")
    pack("csvedge", {"id": "csvedge", "version": "1.0.0", "name": "CSV edge cases"}, raw_csv=csv_text,
         rules={"term_fixes": [{"en": "lymph node", "vi": "h\u1ea1ch", "wrong": ["h\u1ea1ch b\u1ea1ch huy\u1ebft", "(?:x|y)z\\s+w"]}]},
         tests=[{"src": "a"}, {"src": "b"}])


def pack_summary(p):
    return {"id": p.id, "version": p.version, "name": p.name, "detect": list(p.detect), "prompt": p.prompt,
            "glossary": [list(r) for r in p.glossary], "term_fixes": [[f.en, f.vi, list(f.wrong)] for f in p.term_fixes],
            "tests": p.tests, "key": p.key(), "allowed": packs.allowed_words(p)}


def source_files(root, pid):
    d = Path(root) / pid
    return {name: text_sha(d / name) for name in PACK_FILES if (d / name).is_file()}


def read_glossary_text(text):
    """packs.read_glossary on a text: the same csv.DictReader over a file opened with utf-8-sig and newline=""."""
    import csv
    import io
    rows = []
    f = io.StringIO(text[1:] if text.startswith("\ufeff") else text, newline="")
    for row in csv.DictReader(f):
        if row.get("en") and row.get("vi"):
            rows.append((row["en"].strip(), row["vi"].strip(), (row.get("note") or "").strip()))
    return rows


PACK_TEXTS = [
    "The nuclei show atypical features.", "No lymphovascular invasion or perineural invasion was found.",
    "Margins negative for carcinoma.", "All margins are negative.", "Negative margins were obtained.",
    "Pseudoinvasion, microinvasion and an invasive carcinoma.",
    "Dementia with Lewy bodies. Neuropathologic diagnosis of tumours. Lymph-node.",
    "Lung biopsy. Lung nodule. Lymph-node.", "Diffuse neocortical (five areas)",
    "Histopathology of the biopsy showed a meningioma with brisk mitoses and focal necrosis. Immunohistochemistry "
    "(IHC) staining was negative for the tumor markers; WHO classification grade 2. No lymph node metastasis.",
    "", "Hairy cell leukaemia.", "Squamous cell carcinoma of the lung was confirmed by biopsy.",
] + EN_SENTENCES + QA_SRC[:40]


def packs_section():
    check_real_packs()
    write_synthetic_packs()
    loaded, errors = {}, {}
    for root, pid in [(REPO_PACKS, "_style"), (REPO_PACKS, "pathology"), (SYNTH, "breast"), (SYNTH, "breast-kid"),
                      (SYNTH, "finance"), (SYNTH, "alpha"), (SYNTH, "csvedge"), (SYNTH, "bad-include"),
                      (SYNTH, "bad-name"), (SYNTH, "bad-wrong")]:
        where = "repo" if root == REPO_PACKS else "synthetic"
        try:
            loaded[pid] = dict(pack_summary(packs.load_pack(root, pid)), where=where, files=source_files(root, pid))
        except ValueError as exc:  # no machine path in a committed file
            errors[pid] = {"where": where, "error": str(exc).replace(str(root), "<packs>")}
    path = packs.load_pack(REPO_PACKS, "pathology")
    breast = packs.load_pack(SYNTH, "breast")
    kid = packs.load_pack(SYNTH, "breast-kid")
    alpha = packs.load_pack(SYNTH, "alpha")
    T = packs.TermFix

    def pk(pid, glossary=(), fixes=(), prompt="", tests=(), version="1.0.0", detect=()):
        return packs.Pack(pid, version, pid.title(), list(detect), prompt, list(glossary), list(fixes), list(tests))

    fna_row = ("fine needle aspiration", "choc hut te bao bang kim nho (FNA)", "")
    fna_fix = T("fine needle aspiration", "choc hut te bao bang kim nho", ["choc hut kim nho"])
    synthetic_sets = {
        "first_wins": [pk("breast", [("HER2", "HER2", ""), ("Lobular", "ti\u1ec3u th\xf9y", "")],
                          [T("lobular", "ti\u1ec3u th\xf9y", ["th\xf9y nh\u1ecf"])], "Breast rules.", [{"src": "b"}],
                          detect=["a", "b"]),
                       pk("pathology", [("lobular", "d\u1ea1ng ti\u1ec3u th\xf9y", ""), ("biopsy", "sinh thi\u1ebft", "")],
                          [T("lobular", "x", []), T("biopsy", "sinh thi\u1ebft", ["sinh thi\u1ec7t"])], "Pathology rules.",
                          [{"src": "p"}], version="0.1.0", detect=["b", "c"])],
        "owned": [pk("breast", [("HER2", "HER2", "")], [T("Lobular", "ti\u1ec3u th\xf9y", ["th\xf9y nh\u1ecf"])]),
                  pk("pathology", [("biopsy", "sinh thi\u1ebft", "")], [T("lobular", "x", []), T("her2", "y", ["z"]),
                                                                       T("biopsy", "sinh thi\u1ebft", ["sinh thi\u1ec7t"])])],
        "same_value_abbr": [pk("child", [fna_row]), pk("parent", [fna_row], [fna_fix])],
        "same_value_case": [pk("child", [("Lymphovascular Invasion", "Xam  lan mach bach huyet", "")]),
                            pk("parent", [], [T("lymphovascular invasion", "xam lan mach bach huyet", ["viem mach"])])],
        "disagrees": [pk("child", [("cribriform", "mat sang", "")]),
                      pk("parent", [("cribriform", "dang sang", "")], [T("cribriform", "dang sang", ["mat sang"])])],
        "wrong_union": [pk("child", [], [T("lymphovascular invasion", "xam lan mach bach huyet", ["viem mach bach huyet"])]),
                        pk("parent", [], [T("Lymphovascular invasion", "XAM LAN mach bach huyet",
                                            ["viem mach bach huyet", "xam nhap mach"])])],
        "different_values": [pk("child", [], [T("frozen section", "sinh thiet tuc thi", ["lat cat lanh"])]),
                             pk("parent", [], [T("frozen section", "lat cat lanh", ["mau dong lanh"])])],
        "casefold": [pk("a", [("strasse", "Stra\xdfe", "")]), pk("b", [], [T("strasse", "STRASSE", ["x"])])],
        "detect_duplicates": [pk("a", detect=["x", "x", "y"]), pk("b", detect=["y", "z", "z", "x"])],
        "one": [pk("solo", [("a", "b", "")])],
        "none": [],
    }
    merges = {name: (None if packs.merge_packs(ps) is None else pack_summary(packs.merge_packs(ps)))
              for name, ps in synthetic_sets.items()}
    merge_inputs = {name: [pack_summary(p) for p in ps] for name, ps in synthetic_sets.items()}
    merges["real_kid_breast_path"] = pack_summary(packs.merge_packs([kid, breast, path]))
    merges["real_breast_path"] = pack_summary(packs.merge_packs([breast, path]))
    merges["real_alpha_path"] = pack_summary(packs.merge_packs([alpha, path]))
    merged = packs.merge_packs([kid, breast, path])
    hits = []
    # a document with more than 80 distinct glossary terms: glossary_hits keeps the 80 most frequent / longest
    many = ", ".join(en for en, _, _ in path.glossary[:160]) + ". " + ", ".join(en for en, _, _ in path.glossary[:40])
    for text in PACK_TEXTS + [many]:
        hits.append([text, [list(h) for h in packs.glossary_hits(text, path.glossary)],
                     [list(h) for h in packs.glossary_hits(text, merged.glossary, limit=5)]])
    # the real term fixes over the real glossary (never touch a correct value) and over wrong forms in a sentence
    fix_rows = []
    for en, vi, _ in path.glossary:
        fix_rows.append([vi, en, list(qa.apply_term_fixes(vi, en, path.term_fixes))])
    for fx in path.term_fixes:
        fix_rows.append([fx.vi, fx.en, list(qa.apply_term_fixes(fx.vi, fx.en, path.term_fixes))])
        for pat in fx.wrong:
            wrong = re.sub(r"\\(.)", r"\1", pat)
            for s in ["Trong m\u1eabu n\xe0y, %s \u0111\u01b0\u1ee3c ghi nh\u1eadn." % wrong, wrong.upper(),
                      wrong[:1].upper() + wrong[1:] + " v\xe0 " + wrong]:
                fix_rows.append([s, fx.en, list(qa.apply_term_fixes(s, fx.en, path.term_fixes))])
    csv_cases = []
    for text in ["en,vi,note\na,b,c\n", "\ufeffen,vi\r\nx,y\r\n", "", "\n\nen,vi\na,b\n", "vi,en\nb,a\n",
                 "en,vi,note,en\na,b,c\n", "en,vi\n\"a\nb\",\"c\"\"d\"\n", "en,vi\n\"open,v\n", "en,vi\r\na,b\rc,d\r\n",
                 "en,vi\n a , b \n\u3000c\u3000,\u3000d\u3000\n", "en;vi\na;b\n", "en,vi\n\"x\"y,z\n"]:
        csv_cases.append([text, [list(r) for r in read_glossary_text(text)]])
    return {"repo_files": {pid: source_files(REPO_PACKS, pid) for pid in REAL}, "loaded": loaded, "errors": errors,
            "merges": merges, "merge_inputs": merge_inputs, "hits": hits, "term_fixes": fix_rows, "csv": csv_cases}


# ---------------------------------------------------------------- matching: manifests and selection

def build_manifest(dirs):
    """tools/build_registry.build for the given pack folders, in memory (no zip files written)."""
    import math
    import build_registry
    metas = [(d, json.loads((d / "pack.json").read_text(encoding="utf-8"))) for d in dirs]
    terms = [build_registry.pack_terms(d, meta) for d, meta in metas]
    n = len(metas)
    df = {}
    for t in terms:
        for term in t:
            df[term] = df.get(term, 0) + 1
    idf = {term: math.log((n + 1) / (c + 1)) + 1 for term, c in df.items()}
    entries = []
    for (d, meta), weights in zip(metas, terms):
        data = build_registry.pack_zip(d, meta)
        entries.append({
            "id": meta["id"], "name": meta.get("name", meta["id"]), "version": meta["version"],
            "parent": meta.get("parent"), "file": "%s-%s.zip" % (meta["id"], meta["version"]),
            "sha256": hashlib.sha256(data).hexdigest(),
            "detect": sorted({build_registry._norm(k) for k in meta.get("detect", []) if build_registry._norm(k)}),
            "size": len(data),
            "profile": {term: round(w * idf[term], build_registry.DIGITS) for term, w in weights.items()},
        })
    manifest = {"format": 1, "packs": entries, "idf": {t: round(v, build_registry.DIGITS) for t, v in idf.items()}}
    return json.loads(json.dumps(manifest, ensure_ascii=False, sort_keys=True))  # key order of manifest.json


def fam_manifest(*specs):
    entries = []
    for pid, parent in specs:
        words = [pid.replace("-", "") + w for w in ("one", "two", "three")]
        entries.append({"id": pid, "parent": parent, "profile": {t: 1.0 for t in words}, "detect": words})
    return {"packs": entries, "idf": {}}


def fam_text(reps):
    return " ".join(" ".join([pid.replace("-", "") + w] * k) for pid, k in reps.items() for w in ("one", "two", "three"))


def match_summary(m):
    return {"id": m.entry.get("id"), "score": m.score, "matched": m.matched, "terms": m.terms,
            "detect_hits": m.detect_hits, "reason": m.reason}


MATCH_TEXTS = {}


def matching_texts():
    from nonmedical import TEXTS
    pathology_text = PACK_TEXTS[9]
    breast_text = ("Core needle biopsy of the left breast: invasive carcinoma with a ductal carcinoma in situ component; "
                   "lobular features absent. HER2 IHC staining 2+, Nottingham grade 2. Mammography showed a BI-RADS 5 "
                   "mass. No lymph node metastasis; tumor necrosis present.")
    breast_only = ("Mammography: BI-RADS 4 lesion. Ductal carcinoma in situ, lobular pattern, HER2 equivocal. "
                   "Mammography follow-up; HER2 retest; BI-RADS 3 on the right.")
    parent_higher = pathology_text + (" Glioma, astrocytoma and sarcoma with necrosis, gliosis and dementia; carcinoma "
                                      "and lymphoma on cytology; neoplasm with metastases. HER2 and mammography; BI-RADS.")
    glossary_only = ("Pleomorphic cells in a cribriform, papillary and trabecular arrangement with storiform areas, "
                     "palisading and rosette formation; focal, diffuse and patchy patterns; one tumor.")
    kid_text = breast_text + " Phyllodes tumor and fibroadenoma; phyllodes tumour; fibroadenomas."
    texts = {"pathology": pathology_text, "breast": breast_text, "breast_only": breast_only,
             "parent_higher": parent_higher, "glossary_only": glossary_only,
             "glossary_only_2": glossary_only.replace("one tumor", "tumor and tumors"), "kid": kid_text,
             "min_terms": "Tumor tumor tumor. Meningioma meningioma meningioma meningioma.",
             "glioma": "Glioma and astrocytoma with dementia.", "budget_line": "Quarterly budget and invoices.",
             "empty": "", "mixed": kid_text + " The budget for the fiscal year: spending above the threshold; invoice."}
    texts.update({"nonmedical " + k: v for k, v in TEXTS.items()})
    texts["fam_surgery"] = fam_text({"surgery-gi": 5, "surgery": 4, "medicine-oncology": 3})
    texts["fam_abcd"] = fam_text({"a": 2, "b": 4, "c": 3, "d": 1, "d-kid": 6})
    texts["fam_big"] = fam_text({"a1": 9, "a3": 8, "a2": 7, "a": 6, "b1": 5, "b2": 4, "b": 3, "c": 2})
    texts["fam_orphan"] = fam_text({"orphan": 3, "other": 2})
    texts["fam_cycle"] = fam_text({"x": 2, "y": 3, "z": 1})
    return texts


def matching_manifests():
    return {
        "path": build_manifest([REPO_PACKS / "pathology"]),
        "two": build_manifest([REPO_PACKS / "pathology", SYNTH / "breast"]),
        "three": build_manifest([REPO_PACKS / "pathology", SYNTH / "breast", SYNTH / "breast-kid", SYNTH / "finance"]),
        "fam_surgery": fam_manifest(("surgery", None), ("surgery-gi", "surgery"), ("medicine", None),
                                    ("medicine-oncology", "medicine")),
        "fam_abcd": fam_manifest(("a", None), ("b", None), ("c", None), ("d", None), ("d-kid", "d")),
        "fam_big": fam_manifest(("a", None), ("a1", "a"), ("a2", "a"), ("a3", "a"), ("b", None), ("b1", "b"),
                                ("b2", "b"), ("c", None)),
        "fam_orphan": fam_manifest(("orphan", "ghost"), ("other", None)),
        "fam_cycle": fam_manifest(("x", "y"), ("y", "x"), ("z", "z")),
        "empty": {"packs": [], "idf": {}},
    }


def matching_section():
    check_real_packs()
    write_synthetic_packs()
    from vitranslate import pipeline
    manifests = matching_manifests()
    texts = matching_texts()
    params = [{}, {"threshold": 0.0}, {"threshold": 0.0, "max_packs": 3}, {"threshold": 0.0, "max_families": 1},
              {"threshold": 0.0, "min_terms": 2}, {"min_detect": 1}, {"max_packs": 1}]
    rows = []
    for mname, manifest in manifests.items():
        for tname, text in texts.items():
            scored = matching.score_packs(text, manifest)
            sel = [[[m.entry.get("id"), m.reason] for m in matching.select_packs(text, manifest, **p)] for p in params]
            rows.append({"manifest": mname, "text": tname, "scored": [match_summary(m) for m in scored], "select": sel})
    choose = []
    for mname in ("two", "three", "fam_surgery"):
        for tname in ("pathology", "breast_only", "kid", "mixed", "fam_surgery", "empty"):
            for domain in ("", "breast", "breast-kid, finance", "pathology,ghost,pathology", "ghost", "surgery-gi"):
                matches, unknown = pipeline.choose_packs(texts[tname], domain, manifests[mname])
                top = pipeline.top_candidates(texts[tname], manifests[mname], {m.entry.get("id") for m in matches})
                choose.append({"manifest": mname, "text": tname, "domain": domain,
                               "matches": [[m.entry.get("id"), m.reason, m.score] for m in matches],
                               "unknown": unknown, "top": top})
    return {"manifests": manifests, "texts": texts, "params": params, "rows": rows, "choose": choose}


# ---------------------------------------------------------------- translate: Translator sessions, scripted model

A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
W_NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')
RED = '<a:rPr lang="en-US"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>'
A_RPR = {None: '<a:rPr lang="en-US"/>', "b": '<a:rPr lang="en-US" b="1"/>', "i": '<a:rPr lang="en-US" i="1"/>',
         "red": RED, "sup": '<a:rPr lang="en-US" baseline="30000"/>', "b0": '<a:rPr lang="en-US" b="0"/>',
         "link": '<a:rPr lang="en-US"><a:hlinkClick r:id="rId9" '
                 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></a:rPr>',
         "u": '<a:rPr lang="en-US" u="sng"/>'}
W_RPR = {None: "", "b": "<w:rPr><w:b/></w:rPr>", "b0": '<w:rPr><w:b w:val="0"/></w:rPr>',
         "i": '<w:rPr><w:i w:val="on"/></w:rPr>', "sup": '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>',
         "color": '<w:rPr><w:color w:val="FF0000"/></w:rPr>', "u": '<w:rPr><w:u w:val="single"/></w:rPr>'}


def xesc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def a_para(*items):
    """DrawingML paragraph: a str is a plain run, (kind, text) a formatted run, "BR" a line break."""
    out = []
    for it in items:
        if it == "BR":
            out.append("<a:br/>")
            continue
        kind, text = (None, it) if isinstance(it, str) else it
        out.append("<a:r>%s<a:t>%s</a:t></a:r>" % (A_RPR[kind], xesc(text)))
    return "<a:p %s>%s</a:p>" % (A_NS, "".join(out))


def w_para(*items):
    """WordprocessingML paragraph: a str is a plain run, (kind, text) a formatted run, ("link", text) a hyperlink,
    "TAB" a tab run."""
    out = []
    for it in items:
        if it == "TAB":
            out.append("<w:r><w:tab/></w:r>")
            continue
        kind, text = (None, it) if isinstance(it, str) else it
        run = '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (W_RPR.get(kind, ""), xesc(text))
        out.append('<w:hyperlink r:id="rId5">%s</w:hyperlink>' % run if kind == "link" else run)
    return "<w:p %s>%s</w:p>" % (W_NS, "".join(out))


def one(text):
    return a_para(text)


P_XML = a_para("In ", ("red", "NF2-altered"), " meningiomas of the lung, ", ("i", "1p loss"), " is common")
P_BOLD = a_para("In ", ("b", "NF2-altered"), " meningiomas of the lung, ", ("i", "1p loss"), " is common")
NO_TAGS = NO_G1.replace("<g2>", "").replace("</g2>", "")
PREV_VI = ("Kh\u1ed1i u m\xe0ng n\xe3o l\xe0 u nguy\xean ph\xe1t th\u01b0\u1eddng g\u1eb7p nh\u1ea5t c\u1ee7a h\u1ec7 "
           "th\u1ea7n kinh trung \u01b0\u01a1ng \u1edf ng\u01b0\u1eddi l\u1edbn.")
CTX = {"prev": "Meningiomas are common.", "nxt": "Grading follows WHO."}
LUNG_FIX = [["lung", "ph\u1ed5i", ["pulm\xf4n"]]]
DEFAULT_CFG = {"system": "SYS", "model": "m", "pack_key": "p@1", "fixes": [], "hits": [], "allowed": []}
SPAN = translate.SPAN_PROMPT


def step(para, script, **kw):
    return dict({"para": para, "script": script}, **kw)


def replies(*r):
    return {"replies": list(r)}


ECHO = {"echo": True}

COPIED_SRC = "Spleen, upper pole, partial resection --- Congested red pulp with small granulomas"
COPIED_VI = "--- T\u1ee7y \u0111\u1ecf sung huy\u1ebft k\u00e8m u h\u1ea1t nh\u1ecf"
COPIED_PARTIAL = "Spleen, upper pole, partial resection " + COPIED_VI
COPIED_GOOD = "L\u00e1ch, c\u1ef1c tr\u00ean, c\u1eaft m\u1ed9t ph\u1ea7n " + COPIED_VI
OMIT_SRC = ("Breast, left upper outer quadrant, ultrasound-guided core needle biopsy --- "
            "Fibroadenoma with apocrine metaplasia")
OMIT_HEAD = ("V\xfa tr\xe1i, g\xf3c ph\u1ea7n t\u01b0 tr\xean ngo\xe0i, sinh thi\u1ebft l\xf5i kim d\u01b0\u1edbi "
             "h\u01b0\u1edbng d\u1eabn si\xeau \xe2m --- ")
OMIT_VI = OMIT_HEAD + "U x\u01a1 tuy\u1ebfn"
FULL_VI = OMIT_HEAD + "U x\u01a1 tuy\u1ebfn k\xe8m d\u1ecb s\u1ea3n \u0111\u1ea1i h\xe3n"
PROBES = {
    "tags_only": "<g1>NF2-altered</g1> <g2>m\u1ea5t 1p</g2>",
    "previous_paragraph": PREV_VI + " " + GOOD,
    "runaway": GOOD + " l\u1eb7p l\u1ea1i" * 300,
    "chinese": GOOD.replace("th\u01b0\u1eddng g\u1eb7p", "\u5e38\u89c1"),
    "scaffold": "Your previous answer: " + GOOD,
    "markdown": GOOD.replace("<g2>m\u1ea5t 1p</g2>", "<g2>**m\u1ea5t 1p**</g2>"),
    "star": GOOD.replace("<g2>m\u1ea5t 1p</g2>", "<g2>*m\u1ea5t 1p*</g2>"),
    "angle": GOOD.replace("m\u1ea5t 1p", "m\u1ea5t <1p>"),
    "latex": GOOD.replace("m\u1ea5t 1p", "m\u1ea5t 1p $x^{2}$"),
    "thai": GOOD.replace("th\u01b0\u1eddng g\u1eb7p", "\u0e1e\u0e1a\u0e1a\u0e48\u0e2d\u0e22"),
}
GREEK_OK = GOOD.replace("m\u1ea5t 1p", "m\u1ea5t 1p \u03b2 \xb5m")  # Greek letters and the micro sign pass the gate
LATEX_SRC = "Stage IIA \u2192 IIB after review"
LATEX_OUT = "Giai \u0111o\u1ea1n IIA $\\rightarrow$ IIB sau khi xem l\u1ea1i"
LATEX_GOOD = "Giai \u0111o\u1ea1n IIA \u2192 IIB sau khi xem l\u1ea1i"
HEPATO_SRC = "Swollen hepatocytes around the central vein"
HEPATO_OUT = "Hepatocyte ph\xecnh to quanh t\u0129nh m\u1ea1ch trung t\xe2m"
HEPATO_GOOD = "T\u1ebf b\xe0o gan ph\xecnh to quanh t\u0129nh m\u1ea1ch trung t\xe2m"


def translate_cases():
    """Each case: {name, steps, cfg?, tm?}. A step translates one paragraph (or puts / rechecks) with a script."""
    c = []

    def add(name, steps, **kw):
        c.append(dict({"name": name, "steps": steps}, **kw))

    seg_p = P_XML
    add("level0", [step(seg_p, replies(GOOD))])
    add("level1 loose tokens", [step(seg_p, replies(GOOD.replace("<g1>", "< g1 >").replace("</g1>", "</ g1 >")))])
    add("level1 drops invented", [step(one("Negative staining"), replies("<g1>Nhu\u1ed9m</g1> \xe2m <sup>t\xednh</sup>"))])
    for dots in ("...", "\u2026"):
        add("level1 blank invented " + dots, [step(one("Negative staining"),
                                                   replies("Nhu\u1ed9m \xe2m t\xednh <g1>%s</g1>" % dots))])
    add("level2 tags retry", [step(seg_p, replies(NO_G1, GOOD))])
    add("level3 fewer tags", [step(seg_p, replies(NO_G1, NO_G1, NO_G1))])
    add("level4 reattach", [step(seg_p, replies(NO_G1, NO_G1, NO_TAGS, NO_TAGS, "m\u1ea5t 1p"))])
    add("level4 drops invented blank", [step(seg_p, replies(NO_G1, NO_G1, NO_TAGS, NO_TAGS + " <g7>...</g7>",
                                                             "m\u1ea5t 1p"))])
    add("level5 not cached", [step(seg_p, replies(NO_G1, NO_G1, NO_TAGS, NO_TAGS, "s\u1ef1 m\u1ea5t 1p")),
                              step(seg_p, replies(GOOD))])
    add("all spans essential skip L3, partial cached", [
        step(P_BOLD, replies(NO_G1, NO_G1, NO_TAGS, "s\u1ef1 m\u1ea5t 1p")), step(P_BOLD, replies())])
    add("cache hit and system prompt", [step(seg_p, replies(GOOD)), step(seg_p, replies()),
                                        step(seg_p, replies(GOOD), cfg={"system": "SYS with other glossary hits"})])
    add("cache hit reruns term fixes", [step(seg_p, replies(GOOD.replace("ph\u1ed5i", "pulm\xf4n"))),
                                        step(seg_p, replies())], cfg={"fixes": LUNG_FIX})
    sub = a_para(("b", "Sub optimal fixation "), "of the lung tissue in this case")
    add("finishing spaces and term fix", [step(sub, replies(
        "<g1>C\u1ed1 \u0111\u1ecbnh kh\xf4ng t\u1ed1i \u01b0u</g1>c\u1ee7a m\xf4 pulm\xf4n trong ca n\xe0y"))],
        cfg={"fixes": LUNG_FIX})
    add("first letter capital, cached", [step(one("Grade of the lesion"), replies("ph\xe2n \u0111\u1ed9 c\u1ee7a t\u1ed5n th\u01b0\u01a1ng")),
                                         step(one("Grade of the lesion"), replies())])
    add("english left retry", [step(one("The tumor of the lung is small"), replies(
        "The tumor of the lung is small", "Kh\u1ed1i u \u1edf ph\u1ed5i nh\u1ecf"))])
    add("copied english retry", [step(one(COPIED_SRC), replies(COPIED_PARTIAL, COPIED_GOOD))])
    add("copied english retry gives source back", [step(one(COPIED_SRC), replies(COPIED_PARTIAL, COPIED_SRC))])
    add("copied english after retry not cached", [step(one(COPIED_SRC), replies(COPIED_PARTIAL, COPIED_PARTIAL)),
                                                  step(one(COPIED_SRC), replies(COPIED_GOOD))])
    add("omitted clause retry", [step(one(OMIT_SRC), replies(OMIT_VI, FULL_VI))])
    add("omitted clause still", [step(one(OMIT_SRC), replies(OMIT_VI, OMIT_VI)), step(one(OMIT_SRC), replies(FULL_VI))])
    for blank in ("", ".", "  ", "<think>x</think>"):
        add("empty answer retried %r" % blank, [step(one("The tumor of the lung is small"),
                                                     replies(blank, "Kh\u1ed1i u \u1edf ph\u1ed5i nh\u1ecf"))])
    add("empty answers keep source", [step(seg_p, replies("", "", "", "")), step(seg_p, replies(GOOD))])
    red1 = a_para("In ", ("red", "NF2"), " tumours of the lung")
    bold1 = a_para("In ", ("b", "NF2"), " tumours of the lung")
    plain1 = "Trong u NF2 \u1edf ph\u1ed5i"
    add("no essential span L3, key sees essential", [step(red1, replies(plain1, plain1, plain1)), step(red1, replies()),
                                                     step(bold1, replies("Trong u <g1>NF2</g1> \u1edf ph\u1ed5i"))])
    coef = a_para("The coefficient ", ("i", "x1"), " of the model", "BR", "is small")
    plain2 = "M\xf4 h\xecnh<x1/>c\xf3 h\u1ec7 s\u1ed1 x1 nh\u1ecf"
    add("reattach never splits a placeholder", [step(coef, replies(plain2, plain2, plain2))])
    area = a_para("Area 5 cm", ("sup", "2"), " around the ", ("b", "tumor"), ".")
    plain3 = "V\xf9ng nhi\u1ec1u t\u1ebf b\xe0o 5 cm2 quanh u."
    add("reattach splits a word only where the source did", [step(area, replies(plain3, plain3, plain3, "u"))])
    texts = ["dup", "dup"] + ["s%d" % k for k in range(3, 12)]
    many = a_para(*[x for k, t in enumerate(texts, 1) for x in ("word%d " % k, ("i", t))])
    add("span calls memoised and capped", [step(many, {"rules": [[SPAN, "zz"]], "default": "Trong ca n\xe0y"})])
    tissue = a_para("Tissue of the ", ("b", "lung"), " was fixed")
    for mark in ("**", "*"):
        flat = "M\xf4 %spulm\xf4n%s \u0111\u01b0\u1ee3c c\u1ed1 \u0111\u1ecbnh" % (mark, mark)
        add("level4 term fixes and markdown " + mark, [step(tissue, replies(flat, flat, flat))],
            cfg={"fixes": LUNG_FIX, "hits": [["lung", "ph\u1ed5i"]]})
    thirteen = a_para(*[x for k in range(1, 13) for x in ("word%d " % k, ("red", "red%d" % k))],
                      " and the ", ("i", "last one"))
    add("more than 12 tags start at L3", [step(thirteen, replies("T\u1eeb <g13>cu\u1ed1i</g13>"))])
    add("damaged cache entry", [{"put": sub, "out": "<g1></g1> c\u1ee7a m\xf4 ph\u1ed5i trong ca n\xe0y", "level": 0},
                                step(sub, replies())])
    for name, reply in sorted(PROBES.items()):
        add("gate retry without context: " + name, [step(seg_p, replies(reply, GOOD), **CTX)])
        add("gate flags and skips cache: " + name, [step(seg_p, replies(reply, reply)), step(seg_p, replies(GOOD))])
    add("greek letters pass the gate", [step(seg_p, replies(GREEK_OK), **CTX)])
    add("latex retry", [step(one(LATEX_SRC), replies(LATEX_OUT, LATEX_GOOD))])
    add("latex symbols after retry cached", [step(one(LATEX_SRC), replies(LATEX_OUT, LATEX_OUT)),
                                             step(one(LATEX_SRC), replies())])
    bad = "T\u1ec9 s\u1ed1 $\\frac{a}{b}$ th\u1ea5p"
    add("latex no symbol flagged", [step(one("The ratio a over b was low"), replies(bad, bad)),
                                    step(one("The ratio a over b was low"), replies("T\u1ec9 s\u1ed1 a tr\xean b th\u1ea5p"))])
    add("latex in source kept", [step(one("Write $\\alpha$ in the formula"),
                                      replies("Vi\u1ebft $\\alpha$ trong c\xf4ng th\u1ee9c"))])
    add("single english retry", [step(one(HEPATO_SRC), replies(HEPATO_OUT, HEPATO_GOOD))])
    add("single english flagged", [step(one(HEPATO_SRC), replies(HEPATO_OUT, HEPATO_OUT)),
                                   step(one(HEPATO_SRC), replies(HEPATO_GOOD))])
    dele = "Ph\xe1t hi\u1ec7n deletion 1p"
    add("glossary key left in english", [step(one("A deletion of 1p was found"), replies(dele, dele))],
        cfg={"hits": [["deletion", "m\u1ea5t \u0111o\u1ea1n"]]})
    add("not a glossary key: no flag", [step(one("A deletion of 1p was found"), replies(dele))])
    add("glossary word kept in english", [step(one(HEPATO_SRC), replies(HEPATO_OUT))],
        cfg={"hits": [["hepatocyte", "hepatocyte"]]})
    add("emphasis after a tag retry", [step(seg_p, replies(NO_G1, PROBES["markdown"])), step(seg_p, replies(GOOD))])
    for text in ["Outline", "Classification", "Curriculum Vitae", "Six Major Patterns of Renal Tumors",
                 "External Quality Assessment (EQA)", "Contact Information", "Jane Doe, MD, PhD"]:
        add("unchanged retried then flagged: " + text, [step(one(text), ECHO, **CTX), step(one(text), ECHO)])
    longer = GOOD + " v\xe0 th\u01b0\u1eddng g\u1eb7p \u1edf ng\u01b0\u1eddi l\u1edbn tu\u1ed5i h\u01a1n"
    add("ratio tighter with context", [step(seg_p, replies(longer, GOOD), **CTX), step(seg_p, replies(longer))],
        tm=False)
    add("short source bleed", [step(one("Meningioma grading"), replies("Ph\xe2n \u0111\u1ed9 u m\xe0ng n\xe3o " + PREV_VI,
                                                                       "Ph\xe2n \u0111\u1ed9 u m\xe0ng n\xe3o"))])
    add("short segments get no context", [step(one("Negative staining"), replies("Nhu\u1ed9m \xe2m t\xednh"),
                                                prev="Marker", nxt="Result")])
    add("table cells up to six words get no context", [
        step(one("Maximal dimension in millimetres, median value"), replies("K\xedch th\u01b0\u1edbc t\u1ed1i \u0111a (mm), trung v\u1ecb"),
             prev="P value", nxt="Location, n (%)"),
        step(one("All samples were fixed in buffered formalin"),
             replies("C\xe1c m\u1eabu \u0111\u01b0\u1ee3c c\u1ed1 \u0111\u1ecbnh trong formalin"), prev="Methods", nxt="Results")])
    add("unchanged short english retried", [step(one("Negative staining"), replies("Negative staining", "Nhu\u1ed9m \xe2m t\xednh"),
                                                 prev="Marker", nxt="Result")])
    add("unchanged short english flagged", [step(one("Negative staining"), replies("Negative staining", "negative  staining")),
                                            step(one("Negative staining"), replies("Nhu\u1ed9m \xe2m t\xednh"))])
    add("kept english glossary term", [step(one("trastuzumab"), replies("trastuzumab"))],
        cfg={"hits": [["trastuzumab", "trastuzumab"]]})
    add("kept glossary terms on cache hits", [step(one("Tau"), replies("tau")), step(one("Tau"), replies())],
        cfg={"hits": [["tau", "tau"]]})
    add("single word unchanged twice", [step(one("trastuzumab"), replies("trastuzumab", "trastuzumab")),
                                        step(one("trastuzumab"), replies())])
    for text in ["BRAF VE1", "Ki-67 (MIB-1)", "pT1a", "p<0.001", "CD20+", "HER2 3+", "<5 mm", "Ki-67", "p53"]:
        add("code only: " + text, [step(one(text), replies())])
    add("code only keeps tags", [step(a_para(("i", "BRAF"), " V600E"), replies())])
    for text in ["OVERVIEW OF STAINING METHODS", "SEVEN YEARS LATER (2019)", "QUALITY CONTROL IN DAILY PRACTICE"]:
        add("all caps translated: " + text, [step(one(text), replies("C\xf3"))])
    add("all caps glossary term", [step(one("SPINDLE CELL"), replies("T\u1ebf b\xe0o h\xecnh thoi"))],
        cfg={"hits": [["spindle cell", "t\u1ebf b\xe0o h\xecnh thoi"]]})
    for text in ["BRAF NRAS KRAS", "TERT", "CDKN2A/B", "ALK ROS1 RET"]:
        add("gene list stays code: " + text, [step(one(text), replies())])
    lost = "Kidney, right, nephrectomy Oncocytoma with focal necrosis"
    add("english answer that lost punctuation", [step(one("Kidney, right, nephrectomy --- Oncocytoma with focal necrosis"),
                                                      replies(lost, lost))])
    for text in ["Smith et al. J Clin Pathol 2001; 54:120-125", "Nguyen A et al. Mod Pathol. 2019.",
                 "Brown et al. (Am J Surg Pathol 2010)", "Histopathology. 2021 May;79(2):100-110.",
                 "Garcia L et al. examplejournal.org 2018:", "Example J. 2024 Mar 2;16(3):e51234."]:
        add("citation only: " + text, [step(one(text), replies())])
    for text in ["Conclusion from Smith et al. (2017):", "Benign (Am J Pathol 1981)",
                 "Results for ER agree with Smith et al. Example J Pathol 2000; 61: 101-108."]:
        add("sentence with citation: " + text, [step(one(text), {"rules": [], "default": "K\u1ebft qu\u1ea3 ER"})])
    add("dropped acronym retry", [step(one("Clear cell type (CCRCC)"), replies(
        "Th\u1ec3 t\u1ebf b\xe0o s\xe1ng", "Th\u1ec3 t\u1ebf b\xe0o s\xe1ng (CCRCC)"), **CTX)])
    add("acronym retry not recovered", [step(one("Clear cell type (CCRCC)"), replies(
        "Th\u1ec3 t\u1ebf b\xe0o s\xe1ng", "Ki\u1ec3m so\xe1t kh\xe1c"))])
    add("acronym still missing", [step(one("Clear cell type (CCRCC)"), replies(
        "Th\u1ec3 t\u1ebf b\xe0o s\xe1ng", "Th\u1ec3 t\u1ebf b\xe0o s\xe1ng"))])
    for text in ["Negative staining", "trastuzumab", "Left", "No"]:
        add("word cell translated: " + text, [step(one(text), replies("C\xf3"))])
    add("leaks stripped", [step(seg_p, replies("Translate:\n" + GOOD))])
    add("leaks: think, label, fence, quotes", [
        step(seg_p, replies("<think>\nhmm\n</think>\n" + GOOD)), step(seg_p, replies("Translation: " + GOOD), cfg={"model": "m2"}),
        step(seg_p, replies("```\n" + GOOD + "\n```"), cfg={"model": "m3"}),
        step(seg_p, replies("\u201c" + GOOD + "\u201d"), cfg={"model": "m4"}),
        step(one("Fluid: clear"), replies("D\u1ecbch: trong")), step(seg_p, replies(GOOD + " /no_think"), cfg={"model": "m5"})])
    add("recheck", [{"recheck": seg_p, "text": GOOD.replace("1p", "2p")}, {"recheck": seg_p, "text": NO_G1},
                    {"recheck": seg_p, "text": "Trong <i>u</i> <g1>NF2-altered</g1> <g2>x</g2> pulm\xf4n ph\u1ed5i"}])
    # extra paths: DOCX runs (hyperlinks, w:b val=0, vertAlign, tabs), numbers, suspicious tokens, stray markup,
    # glossary misses, NFD answers, real pack fixes / hits / system prompt
    wp = w_para("See the ", ("link", "WHO site"), " for ", ("b", "grading"), " and ", ("b0", "staging"), " of ",
                ("sup", "2"), " tumours", "TAB", "in the lung")
    wp_good = ("Xem <g1>trang WHO</g1> v\u1ec1 <g2>ph\xe2n \u0111\u1ed9</g2> v\xe0 <g3>giai \u0111o\u1ea1n</g3> c\u1ee7a "
               "<g4>2</g4> u<x1/>\u1edf ph\u1ed5i")
    add("docx level0", [step(wp, replies(wp_good)), step(wp, replies())])
    add("docx tags lost then reattach", [step(wp, replies("Xem trang WHO v\u1ec1 ph\xe2n \u0111\u1ed9 v\xe0 giai \u0111o\u1ea1n c\u1ee7a 2 u \u1edf ph\u1ed5i",
                                                          "Xem trang WHO", "Xem trang WHO v\u1ec1 ph\xe2n \u0111\u1ed9",
                                                          "Xem trang WHO v\u1ec1 ph\xe2n \u0111\u1ed9 c\u1ee7a 2 u<x1/>\u1edf ph\u1ed5i",
                                                          "trang WHO", "ph\xe2n \u0111\u1ed9"))])
    wcol = w_para("Stained ", ("color", "red"), " and ", ("u", "underlined"), " words of the lung tissue", "TAB", "x")
    add("docx no essential spans", [step(wcol, replies("Nhu\u1ed9m <g1>\u0111\u1ecf</g1> v\xe0 <g2>g\u1ea1ch ch\xe2n</g2> t\u1eeb c\u1ee7a m\xf4 ph\u1ed5i<x1/>x")),
                                    step(wcol, replies("Nhu\u1ed9m \u0111\u1ecf v\xe0 g\u1ea1ch ch\xe2n m\xf4 ph\u1ed5i<x1/>x",
                                                       "Nhu\u1ed9m \u0111\u1ecf", "Nhu\u1ed9m \u0111\u1ecf v\xe0 g\u1ea1ch ch\xe2n m\xf4 ph\u1ed5i<x1/>x"),
                                         cfg={"model": "m2"})])
    add("placeholder missing restored", [step(coef, replies("H\u1ec7 s\u1ed1 <g1>x1</g1> c\u1ee7a m\xf4 h\xecnh nh\u1ecf"))])
    add("numbers changed and suspicious", [step(one("In 2 of 7,016 cases the lung was involved"),
                                                replies("Trong 3 tr\xean 7.016 ca, pulm\xf4n b\u1ecb x\xe2m nh\u1eadp"))])
    add("stray markup kept as fragment", [step(seg_p, replies(GOOD + " </x1", GOOD + " <g3", NO_G1 + " </x1",
                                                              NO_TAGS + " </x1", "m\u1ea5t 1p"))])
    add("stray html removed at L1", [step(seg_p, replies(GOOD.replace("th\u01b0\u1eddng", "<b>th\u01b0\u1eddng</b>")))])
    add("glossary miss flagged", [step(one("Lung biopsy of the left lobe was done"),
                                       replies("Sinh thi\u1ebft th\xf9y tr\xe1i \u0111\xe3 l\xe0m"))],
        cfg={"hits": [["biopsy", "sinh thi\u1ebft"], ["lung", "ph\u1ed5i"]]})
    add("NFD answer normalised by the term fixes", [step(seg_p, replies(nfd(GOOD.replace("ph\u1ed5i", "pulm\xf4n"))))],
        cfg={"fixes": LUNG_FIX})
    add("NFD answer without fixes", [step(seg_p, replies(nfd(GOOD)))])
    add("L1 repair then gate retry", [step(seg_p, replies(GOOD.replace("<g1>", "< g1 >") + " " + PREV_VI, GOOD), **CTX)])
    add("gate retry broken tags keeps first", [step(seg_p, replies(PROBES["scaffold"], NO_G1))])
    add("gate retry tie accepted", [step(seg_p, replies(PROBES["angle"], PROBES["scaffold"]), **CTX)])
    add("L3 empty then L4", [step(seg_p, replies(NO_G1, NO_G1, "", NO_TAGS, "m\u1ea5t 1p"))])
    add("L4 empty answer keeps source", [step(seg_p, replies(NO_G1, NO_G1, NO_TAGS + "<g1>", "  "))])
    add("tm off", [step(seg_p, replies(GOOD)), step(seg_p, replies(GOOD))], tm=False)
    # an essential span without lower-case letters that the answer does not contain: no glossary / model lookup
    caps = a_para("The ", ("b", "WHO GRADE"), " of this small lesion is low")
    flat_caps = "M\u1ee9c \u0111\u1ed9 c\u1ee7a t\u1ed5n th\u01b0\u01a1ng nh\u1ecf n\xe0y th\u1ea5p"
    add("L4 all-caps span is not looked up", [step(caps, replies(flat_caps, flat_caps, flat_caps))])
    # Vietnamese academic titles before the name, in order, a dot after each; listed in fixes like the term fixes
    titled = one("Jane Doe, M.D., Ph.D., reviewed all the slides.")
    reviewed = " \u0111\xe3 xem l\u1ea1i t\u1ea5t c\u1ea3 ti\xeau b\u1ea3n."
    add("title order fixed, listed and cached", [step(titled, replies("BS. TS. Jane Doe" + reviewed)),
                                                 step(titled, replies())])
    add("title order and term fixes listed together", [
        step(one("Jane Doe, MD, PhD: lung and lung"), replies("BS TS Jane Doe: pulm\xf4n v\xe0 Pulm\xf4n"))],
        cfg={"fixes": LUNG_FIX})
    add("title order inside a formatted span", [step(a_para("Signed by ", ("b", "Jane Doe, MD, PhD")),
                                                     replies("K\xfd b\u1edfi <g1>BS TS Jane Doe</g1>"))])
    add("title order before a formatted name", [step(a_para("Reviewed by ", ("b", "Jane Doe"), ", MD, PhD"),
                                                     replies("Xem l\u1ea1i b\u1edfi BS. TS. <g1>Jane Doe</g1>"))])
    add("title order kept when right", [step(titled, replies("TS. BS. Jane Doe" + reviewed))])
    # the words of the active packs are no strange words, on cache hits too; real strange words stay flagged
    lym = one("Many lymphocytes and a carcinoma in the node")
    lym_vi = "Nhi\u1ec1u lymph\xf4 b\xe0o v\xe0 carcin\xf4m trong h\u1ea1ch"
    add("house forms of the active packs", [step(lym, replies(lym_vi), cfg={"allowed": ["lymph\xf4"]}),
                                            step(lym, replies()), step(lym, replies(), cfg={"allowed": ["lymph\xf4"]})])
    return c


class ScriptedLLM:
    """The scripted fake model: canned answers in call order, an echo of the text, or answers by prompt prefix."""

    def __init__(self, script):
        self.script = script
        self.calls = []

    def chat(self, system, user):
        s = self.script
        if "replies" in s:
            reply = s["replies"][len(self.calls)]
        elif "fn" in s:
            reply = s["fn"](system, user)
        elif s.get("echo"):
            reply = user.split("Translate:\n", 1)[1]
        else:
            reply = next((r for prefix, r in s["rules"] if user.startswith(prefix)), s["default"])
        self.calls.append([system, user, reply, min(4096, 64 + 2 * len(user))])
        return reply


def tm_rows(tm):
    return [list(r) for r in tm._db.execute("SELECT key, out, level FROM tm ORDER BY key").fetchall()]


def make_translator(cfg, llm, tm):
    from vitranslate.translate import Translator
    fixes = [packs.TermFix(en, vi, list(w)) for en, vi, w in cfg["fixes"]]
    hits = [tuple(h) for h in cfg["hits"]]
    return Translator(llm, cfg["system"], cfg["model"], cfg["pack_key"], fixes, hits, tm, allowed=cfg["allowed"])


def essential_ids(seg):
    """Span ids the helper keeps at ladder level 3 (translate.is_essential): what a client sends with a segment."""
    from vitranslate.translate import is_essential
    return sorted(n for n, span in seg.spans.items() if is_essential(span))


def run_translate_case(case):
    from lxml import etree
    from vitranslate.ooxml.codec import encode
    from vitranslate.tm import TM
    tm = TM(":memory:") if case.get("tm", True) else None
    out = []
    for st in case["steps"]:
        cfg = dict(DEFAULT_CFG, **case.get("cfg", {}), **st.get("cfg", {}))
        if "put" in st:
            seg = encode(etree.fromstring(st["put"]))
            t = make_translator(cfg, ScriptedLLM({"replies": []}), tm)
            tm.put(t._key(seg), st["out"], st["level"])
            out.append({"tagged": seg.tagged, "essential": essential_ids(seg), "key": t._key(seg), "tm": tm_rows(tm)})
            continue
        if "recheck" in st:
            seg = encode(etree.fromstring(st["recheck"]))
            t = make_translator(cfg, ScriptedLLM({"replies": []}), tm)
            out.append({"tagged": seg.tagged, "essential": essential_ids(seg), "flags": t.recheck(seg, st["text"])})
            continue
        seg = encode(etree.fromstring(st["para"]))
        llm = ScriptedLLM(st["script"])
        t = make_translator(cfg, llm, tm)
        try:
            res = t.translate(seg, st.get("prev", ""), st.get("nxt", ""))
        except IndexError:
            raise SystemExit("case %r: the model was asked more than %d times" % (case["name"], len(llm.calls)))
        if "replies" in st["script"] and len(llm.calls) != len(st["script"]["replies"]):
            raise SystemExit("case %r: %d calls for %d canned answers" % (case["name"], len(llm.calls),
                                                                          len(st["script"]["replies"])))
        out.append({"tagged": seg.tagged, "essential": essential_ids(seg), "calls": llm.calls, "text": res.text,
                    "level": res.level, "flags": res.flags, "fixes": res.fixes,
                    "cached": res.cached, "work_tagged": res.segment.tagged, "work_spans": sorted(res.segment.spans),
                    "key": t._key(seg), "tm": tm_rows(tm) if tm is not None else None})
    return out


def translate_section():
    cases = translate_cases()
    rows = []
    levels, kinds = {}, {}
    for case in cases:
        results = run_translate_case(case)
        rows.append(dict(case, results=results))
        for r in results:
            if "level" in r:
                levels[r["level"]] = levels.get(r["level"], 0) + 1
                for f in r["flags"]:
                    k = f.split(":", 2)[0] + (":" + f.split(":")[1] if f.startswith(("retried", "suspect_output")) else "")
                    kinds[k] = kinds.get(k, 0) + 1
    print("translate: %d cases; levels %s" % (len(rows), sorted(levels.items())))
    print("flag kinds: %s" % ", ".join("%s=%d" % kv for kv in sorted(kinds.items())))
    return {"default_cfg": DEFAULT_CFG, "span_prompt": SPAN, "cases": rows}


# ---------------------------------------------------------------- e2e: the helper's run_job on synthetic files

M1_FIXTURES = ROOT / "web" / "engine" / "tests" / "fixtures"
E2E_MODEL = "gemma4:e4b"  # config.default_model("gpu"), what run_job asks the llm_factory for
VN_WORDS_E2E = ["m\xf4", "ph\u1ed5i", "u", "t\u1ebf b\xe0o", "nhu\u1ed9m", "\xe2m t\xednh", "d\u01b0\u01a1ng t\xednh",
                "gan", "th\u1eadn", "giai \u0111o\u1ea1n", "ph\xe2n \u0111\u1ed9", "k\u1ebft qu\u1ea3", "d\u1ea5u \u1ea5n",
                "m\xe0ng n\xe3o", "s\u1ed1", "\u0111\u1ed9"]
E2E_CASES = [
    # (file, run_job options, registry: "three" / "offline" / "broken")
    ("deck.pptx", {}, "three"),
    ("doc.docx", {"domain": "breast"}, "three"),
    ("fit_cases.pptx", {}, "three"),
    ("comments.docx", {"comments": True}, "three"),
    ("codec_cases.pptx", {"notes": False}, "three"),
    ("deck3.pptx", {}, "offline"),
    ("codec_cases.docx", {"domain": "finance,ghost,unloadable"}, "broken"),
    ("notes_order.pptx", {}, "three"),
]


def fake_vn(text):
    """The scripted model's 'translation': every word of the text outside tags becomes a Vietnamese word (acronyms
    stay), so most segments pass every gate at L0."""
    def word(m):
        w = m.group(0)
        if len(w) > 1 and w.isupper():
            return w
        v = VN_WORDS_E2E[sum(map(ord, w)) % len(VN_WORDS_E2E)]
        return v[:1].upper() + v[1:] if w[:1].isupper() else v
    out, pos = [], 0
    for m in tags.TOKEN_RE.finditer(text):
        out.append(re.sub("[A-Za-z]+", word, text[pos:m.start()]))
        out.append(m.group(0))
        pos = m.end()
    out.append(re.sub("[A-Za-z]+", word, text[pos:]))
    return "".join(out)


def fake_model(system, user):
    if user.startswith(SPAN):
        return fake_vn(user[len(SPAN):])
    text = user.split("Translate:\n", 1)[1]
    if text in ("Marker", "Result") and translate.RETRY_EMPTY not in user:
        return ""  # one empty answer: the retry path runs inside the job too
    if text.startswith("Grade depends") and "context only" in user:
        return "Previous paragraph (context only, do not translate): " + fake_vn(text)  # scaffold: gate retry
    return fake_vn(text)


class FakeRegistry:
    """Registry stand-in for run_job: the manifest given, pack folders from the repo / the synthetic fixtures."""

    def __init__(self, manifest, dirs, offline=False):
        self._manifest, self._dirs, self._offline = manifest, dirs, offline
        self.offline = None
        self.last_source = {}

    def manifest(self):
        self.offline = self._offline
        return {"packs": [], "idf": {}} if self._offline else self._manifest

    def ensure(self, entry):
        from vitranslate.registry import PackUnavailable
        if entry["id"] not in self._dirs:
            raise PackUnavailable("pack %s: not available" % entry["id"])
        return self._dirs[entry["id"]]

    def forget(self, entry):
        pass


class AllFonts:
    def covers(self, family, chars):
        return True

    def classify(self, family):
        return "sans"


def e2e_section():
    from unittest import mock
    from vitranslate import pipeline
    from vitranslate.device import Device
    from vitranslate.ooxml.package import OoxmlPackage
    from vitranslate.tm import TM
    from lxml import etree
    check_real_packs()
    write_synthetic_packs()
    manifests = matching_manifests()
    three = manifests["three"]
    broken = dict(three, packs=three["packs"] + [{
        "id": "unloadable", "name": "Unloadable", "version": "1.0.0", "parent": None, "file": "unloadable-1.0.0.zip",
        "sha256": "0" * 64, "detect": [], "size": 1, "profile": {}}])
    dirs = {"pathology": REPO_PACKS / "pathology", "breast": SYNTH / "breast", "breast-kid": SYNTH / "breast-kid",
            "finance": SYNTH / "finance"}
    where = {"pathology": "repo", "_style": "repo", "breast": "synthetic", "breast-kid": "synthetic",
             "finance": "synthetic", "_shared": "synthetic"}
    cases = []
    for fname, opts, reg in E2E_CASES:
        registry = FakeRegistry(broken if reg == "broken" else three, dirs, offline=(reg == "offline"))
        llm = ScriptedLLM({"fn": fake_model})
        events, captured = [], {}

        def save(pkg, out_path, captured=captured):
            for name in sorted(pkg.dirty):
                captured[name] = etree.tostring(pkg._roots[name].getroottree(), xml_declaration=True,
                                                encoding="UTF-8", standalone=True)

        tm = TM(":memory:")
        with mock.patch.object(pipeline, "fix_fonts", lambda pkg, texts, index: []), \
                mock.patch.object(pipeline, "reopen", lambda path: None), \
                mock.patch.object(OoxmlPackage, "save", save), mock.patch("os.replace", lambda a, b: None):
            res = pipeline.run_job(M1_FIXTURES / fname, OUT, pipeline.Options(polish=False, **opts),
                                   progress=events.append, llm_factory=lambda dev, model: llm,
                                   probe=lambda: Device("gpu", "Test GPU", 8000, 999), registry=registry,
                                   font_index=AllFonts(), tm=tm)
        report = {k: v for k, v in res.report.items() if k != "seconds"}
        cases.append({"file": fname, "options": opts, "registry": reg, "calls": llm.calls, "events": events,
                      "report": report, "output": res.output.name, "tm": tm_rows(tm),
                      "parts": {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                                for name, data in captured.items()}})
    print("e2e: %d files, %d model calls, %d changed parts" % (
        len(cases), sum(len(c["calls"]) for c in cases), sum(len(c["parts"]) for c in cases)))
    return {"model": E2E_MODEL, "device": {"kind": "gpu", "name": "Test GPU"}, "where": where,
            "manifests": {"three": three, "broken": broken}, "cases": cases}


# ---------------------------------------------------------------- report: report.py on synthetic job rows

def report_row(level, flags=(), cached=False, n=0):
    return {"where": "Slide %d" % (n + 1), "src": "Source %d" % n, "out": "Ngu\u1ed3n %d" % n, "level": level,
            "flags": list(flags), "cached": cached}


def report_section():
    from vitranslate import report as rp
    meta_base = {"file": "x.pptx", "output": "x_vi.pptx", "kind": "pptx", "domain": "pathology", "domain_name": "GPB",
                 "pack": "pathology@0.1.8", "packs": [{"id": "pathology"}], "packs_unavailable": [],
                 "packs_unavailable_names": [], "registry_offline": False, "device": "gpu", "device_name": "GPU",
                 "model": "m", "fast": False, "polish": {"enabled": True}}
    skipped = [{"where": "Slide 9", "reason": "references", "text": "Refs"},
               {"where": "Slide 9", "reason": "no_text", "text": ""},
               {"where": "Slide 8", "reason": "tracked changes", "text": "t"}]
    clean = [report_row(0, n=k) for k in range(20)]
    scenarios = {
        # a level-3 row with only info flags is still listed (formatting reduced)
        "level 3 with info flags only": (meta_base, [report_row(3, ["retried:tags"], n=0)] + clean[1:]),
        "level 2 with a warning flag": (meta_base, [report_row(2, ["retried:gate", "english_left"])] + clean[1:]),
        "share exactly 5%": (meta_base, [report_row(0, ["numbers_changed"])] + clean[1:]),
        "share 10%": (meta_base, [report_row(0, ["numbers_changed"], n=k) for k in range(2)] + clean[2:]),
        "share exactly 15%": (meta_base, [report_row(0, ["unchanged"], n=k) for k in range(3)] + clean[3:]),
        "share 20%": (meta_base, [report_row(5, ["formatting_lost"], n=k) for k in range(4)] + clean[4:]),
        "fast draft": (dict(meta_base, fast=True), clean),
        "no pack, polish off": (dict(meta_base, packs=[], polish={"enabled": False}), clean),
        "moderate": (meta_base, clean),
        "info kinds and cache": (meta_base, [report_row(0, ["term_fix:lung", "glossary_miss:x", "kept_code",
                                                            "retried:english", "polish_rejected:ratio",
                                                            "kept_reference", "kept_english"], cached=True)]
                                 + [report_row(1, cached=True, n=1), report_row(4, ["formatting_lost"], n=2)] + clean[3:]),
        "empty job": (meta_base, []),
    }
    cases = []
    for name, (meta, rows) in scenarios.items():
        fit = [{"where": "Slide 1", "scale": 0.9}]
        cases.append({"name": name, "meta": meta, "rows": rows, "skipped": skipped, "fit": fit, "fonts": [],
                      "report": rp.build_report(meta, rows, skipped, fit, [])})
    return {"cases": cases}


# ---------------------------------------------------------------- repair: term repair candidates

REPAIR_KEYS = ["papillary thyroid carcinoma", "follicular thyroid carcinoma", "desmin", "smooth muscle actin",
               "Hodgkin lymphoma", "tumour", "biopsies", "Ki-67", "ER", "HER2", "calcification", "WHO classification",
               "adrenal cortex", "renal cortex", "luminal A", "S\u00e9zary syndrome", "haemorrhage", "staining"]


def repair_section():
    """Term repair candidates (repair.py) for synthetic sentences: the keys are the committed pathology pack's
    glossary keys plus REPAIR_KEYS; the texts are the mis-heard sentences of tools/eval_repair.py (HEARD and a
    generated set), the same sentences with the right terms, its talk sentences and the shared text pool. Per text:
    the folded words and the candidates with the lexicon of web/engine/medical_words.json (terms + corpus) under the
    default gate ("changed"), under the gates "off" and "any", and with limit 3 / min_score 700; the sound key of every word
    of the keys. The pack's keys and the lexicon are not written (the JS side reads the pack itself): in glossary order they repeat
    runs of the documents they were mined from."""
    import random
    import eval_repair
    from vitranslate import repair
    check_real_packs()
    keys = [row[0] for row in packs.load_pack(REPO_PACKS / "pathology").glossary] + REPAIR_KEYS
    lex = json.loads((ROOT / "web" / "engine" / "medical_words.json").read_text(encoding="utf-8"))
    index = repair.term_index(keys, lex["terms"] + lex["corpus"])
    heard, right = eval_repair.generated(keys, random.Random(11), 160)
    texts = [h[0] for h in eval_repair.HEARD] + [h[0].replace(h[1], h[2]) for h in eval_repair.HEARD if h[1]]
    texts += [h[0] for h in heard] + right + eval_repair.TALK + eval_repair.HARD + EN_SENTENCES + text_pool()
    texts += ["Hodgkin's lymphoma and S\u00e9zary's syndrome", "the tumor was haemorrhagic", "Positive for Desmond.",
              "It was a denoma.", "car sin oma", "hypoplasia and hipoplasia", "staining stained stains",
              "The vocal cord. Vocal cords and Focal changes", "We met Dr. Desmond: Desmond said hello",
              "The lymph mode and the Lymph Mode"]
    seen = set()
    cases = []
    for t in texts:
        if t in seen:
            continue
        seen.add(t)
        cases.append({"text": t, "words": [w for _, _, w in repair.words(t)],
                      "candidates": repair.find_candidates(t, index),
                      "off": repair.find_candidates(t, index, gate="off"),
                      "any": repair.find_candidates(t, index, gate="any"),
                      "small": repair.find_candidates(t, index, limit=3, min_score=700)})
    vocab = sorted({w for k in keys for _, _, w in repair.words(k)})
    return {"pack": "pathology", "extra_keys": REPAIR_KEYS, "key_count": len(keys), "cases": cases,
            "sounds": {w: repair.sound_key(w) for w in vocab}}


SECTIONS = {"pyre": pyre_section, "units": units_section, "packs": packs_section, "matching": matching_section,
            "e2e": e2e_section, "report": report_section,
            "translate": translate_section, "repair": repair_section}
COMPACT = {"pyre", "units", "matching", "repair"}


def main(argv):
    names = argv or list(SECTIONS)
    unknown = [n for n in names if n not in SECTIONS]
    if unknown:
        print(__doc__)
        print("unknown section(s): %s" % ", ".join(unknown))
        return 2
    OUT.mkdir(parents=True, exist_ok=True)
    for name in names:
        data = SECTIONS[name]()
        write_json(data, OUT / (name + ".json"), compact=name in COMPACT)
        print("%-10s written (%d bytes)" % (name, (OUT / (name + ".json")).stat().st_size))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
