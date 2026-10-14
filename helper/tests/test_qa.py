import pytest

from vitranslate.packs import TermFix
from vitranslate.qa import (apply_term_fixes, copied_english, english_left, fix_latex, glossary_misses, latex_markup,
                            missing_tokens, new_latex, numbers_changed, omitted_clauses, single_english, source_case,
                            strip_leaks, suspicious_tokens)


def test_strip_leaks_and_keep_source_edges():
    assert strip_leaks("Group C: ", "Nh\u00f3m C: /no_think") == "Nh\u00f3m C: "
    assert strip_leaks("Text", "<think>\nhmm\n</think>\nV\u0103n b\u1ea3n") == "V\u0103n b\u1ea3n"
    assert strip_leaks("Text", "Translation: V\u0103n b\u1ea3n") == "V\u0103n b\u1ea3n"
    assert strip_leaks("Text", "\"V\u0103n b\u1ea3n\"") == "V\u0103n b\u1ea3n"
    assert strip_leaks("\"Quoted\"", "\"Tr\u00edch\"") == "\"Tr\u00edch\""


def test_english_left():
    src = "Paraffin wax not completely removed from the tissue section"
    assert english_left(src, "Paraffin wax not completely removed from the tissue section")
    assert not english_left(src, "S\u00e1p paraffin ch\u01b0a \u0111\u01b0\u1ee3c lo\u1ea1i b\u1ecf ho\u00e0n to\u00e0n")
    assert not english_left("BRAF VE1 (-)", "BRAF VE1 (-)")  # nothing to translate


def test_numbers_changed():
    assert not numbers_changed("accounts for 0.36-3% of 7,016 cases", "chi\u1ebfm 0,36-3% c\u1ee7a 7.016 ca")
    assert numbers_changed("in 2 months", "trong 3 th\u00e1ng")


def test_term_fixes_source_gated_and_case():
    fixes = [TermFix("lung", "ph\u1ed5i", ["pulm\u00f4n"]), TermFix("meningioma", "u m\u00e0ng n\u00e3o",
             ["u nh\u00e0y m\u00e0ng n\u00e3o", "u nh\u00e0y"])]
    out, applied = apply_term_fixes("Pulm\u00f4n v\u00e0 v\u00fa", "Lung and breast", fixes)
    assert out == "Ph\u1ed5i v\u00e0 v\u00fa" and applied == ["lung"]
    out, applied = apply_term_fixes("u nh\u00e0y", "a myxoma", fixes)
    assert out == "u nh\u00e0y" and applied == []  # source has no 'meningioma' -> untouched
    out, _ = apply_term_fixes("C\u00e1c u nh\u00e0y m\u00e0ng n\u00e3o", "Meningiomas", fixes)
    assert out == "C\u00e1c u m\u00e0ng n\u00e3o"


def test_glossary_misses_and_suspicious():
    hits = [("biopsy", "sinh thi\u1ebft"), ("lung", "ph\u1ed5i")]
    assert glossary_misses("Lung biopsy", "Sinh thi\u1ebft pulm\u00f4n", hits) == ["lung"]
    assert suspicious_tokens("Sinh thi\u1ebft pulm\u00f4n") == ["pulm\u00f4n"]
    # eponyms copied from the source are not flagged
    assert suspicious_tokens("H\u1ed9i ch\u1ee9ng S\u00e9zary", "S\u00e9zary syndrome") == []


def test_term_fixes_do_not_damage_correct_text():
    gen = [TermFix("genotyping", "x\u00e1c \u0111\u1ecbnh ki\u1ec3u gen", ["\u0111\u1ecbnh ki\u1ec3u gen"])]
    text = "x\u00e1c \u0111\u1ecbnh ki\u1ec3u gen (genotyping)"
    assert apply_term_fixes(text, "genotyping", gen)[0] == text
    lym = [TermFix("lymphoma", "u h\u1ea1ch", ["u lympho"])]
    assert apply_term_fixes("nhi\u1ec1u lympho b\u00e0o", "lymphoma", lym)[0] == "nhi\u1ec1u lympho b\u00e0o"
    node = [TermFix("lymph node", "h\u1ea1ch b\u1ea1ch huy\u1ebft", ["h\u1ea1ch"])]
    assert apply_term_fixes("th\u1ea1ch", "lymph node", node)[0] == "th\u1ea1ch"
    lewy = [TermFix("Lewy body", "th\u1ec3 Lewy", ["Lewy body"])]
    assert apply_term_fixes("c\u00f3 th\u1ec3 Lewy body", "Lewy body", lewy)[0] == "c\u00f3 th\u1ec3 Lewy"
    out, _ = apply_term_fixes("c\u00f3 Lewy body", "Lewy body", lewy)
    assert out == "c\u00f3 th\u1ec3 Lewy"


def test_term_fixes_idempotent_and_case():
    fixes = [TermFix("lung", "ph\u1ed5i", ["pulm\u00f4n"]),
             TermFix("meningioma", "u m\u00e0ng n\u00e3o", ["u nh\u00e0y m\u00e0ng n\u00e3o", "u nh\u00e0y"])]
    src = "Lung and Meningioma"
    once, _ = apply_term_fixes("Pulm\u00f4n v\u00e0 u nh\u00e0y m\u00e0ng n\u00e3o", src, fixes)
    twice, _ = apply_term_fixes(once, src, fixes)
    assert once == twice == "Ph\u1ed5i v\u00e0 u m\u00e0ng n\u00e3o"
    assert apply_term_fixes("PULM\u00d4N", "LUNG", fixes)[0] == "PH\u1ed4I"
    assert apply_term_fixes("Ung th\u01b0 Pulm\u00f4n", "Lung cancer", fixes)[0] == "Ung th\u01b0 ph\u1ed5i"


def test_strip_leaks_safety():
    assert strip_leaks("Fluid: clear", "D\u1ecbch: trong") == "D\u1ecbch: trong"
    assert strip_leaks("Translation: x", "Translation: y") == "Translation: y"
    assert strip_leaks("T", "<think>a</think>b</think>V\u0103n") == "V\u0103n"
    assert strip_leaks("T", "V\u0103n <think>unclosed") == "V\u0103n"
    assert strip_leaks("T", "\"a\" v\u00e0 \"b\"") == "\"a\" v\u00e0 \"b\""


def test_english_left_extra():
    s = "the cells were stained and the tissue was fixed"
    assert english_left("tumour cells and tissue fixed", "tumour cells and tissue fixed")
    assert not english_left("World Health Organization Classification of Tumours",
                            "World Health Organization Classification of Tumours")
    assert not english_left("see \"the role of the cell\" in the text",
                            "xem \"the role of the cell\" trong v\u0103n b\u1ea3n")
    assert english_left(s, s)


def test_irregular_plurals_in_glossary_misses():
    hits = [("carcinoma", "ung th\u01b0 bi\u1ec3u m\u00f4"), ("diagnosis", "ch\u1ea9n \u0111o\u00e1n"),
            ("index", "ch\u1ec9 s\u1ed1")]
    assert glossary_misses("diagnoses and indices", "xyz", hits) == ["diagnosis", "index"]


@pytest.mark.parametrize("key,text", [
    ("histologic patterns", "Six histological patterns"),       # -ic -> -ical
    ("cytologic atypia", "without cytological atypia"),
    ("neuropathology", "Neuropathologic diagnosis"),           # -logy -> -logic / -logical
    ("neuropathology", "neuropathological findings"),
    ("histopathologic features", "Histopathology features"),   # -logic -> -logy
    ("estrogen receptor", "Oestrogen receptors"),              # British spelling, both directions
    ("trophoblastic tumour", "trophoblastic tumors"),
    ("hematoxylin", "haematoxylin and eosin"),
    ("lymph node", "two lymph-nodes"),                         # hyphen or space inside a term
    ("high-grade", "high grade lesion"),
    ("Lewy body", "Dementia with Lewy bodies"),                # plural of the last word
])
def test_glossary_terms_match_spelling_and_derivation_variants(key, text):
    assert glossary_misses(text, "xyz", [(key, "v")]) == [key]


@pytest.mark.parametrize("key,text", [
    ("node", "lymph-node"),             # a word inside a hyphenated compound is not the term
    ("tumor", "tumorigenesis"),
    ("pathology", "pathway"),
    ("cytology", "cytologist"),
    ("histologic", "histone"),
    ("clinic", "clinical trial"),       # only the -logy / -logic family changes its ending
    ("lymph node", "lymphnode"),
])
def test_glossary_variants_do_not_match_other_words(key, text):
    assert glossary_misses(text, "xyz", [(key, "v")]) == []


@pytest.mark.parametrize("src,out,missing", [
    ("Clear cell (CCRCC) with HER2 gain", "T\u1ebf b\u00e0o s\u00e1ng v\u00e0 t\u0103ng HER2", ["CCRCC"]),
    ("Chromophobe (ChRCC) and UCa", "K\u1ef5 m\u00e0u v\u00e0 ung th\u01b0", ["ChRCC", "UCa"]),
    ("Recut H&E and IHC", "C\u1eaft l\u1ea1i H&E v\u00e0 h\u00f3a m\u00f4 mi\u1ec5n d\u1ecbch", ["IHC"]),
    ("Normal 22q11.2 region", "V\u00f9ng 22q11,2 b\u00ecnh th\u01b0\u1eddng", ["22q11.2"]),
    ("Transcript NM_000546.6 checked", "\u0110\u00e3 ki\u1ec3m NM_000546,6", ["NM_000546.6"]),
    ("Low ER+ve tumours", "U d\u01b0\u01a1ng t\u00ednh th\u1ee5 th\u1ec3 estrogen th\u1ea5p", ["ER"]),
    ("Two CNBs with PTCs", "Hai sinh thi\u1ebft c\u00f3 ung th\u01b0", ["CNBs", "PTCs"]),
])
def test_missing_tokens_finds_dropped_acronyms_and_codes(src, out, missing):
    assert missing_tokens(src, out) == missing


@pytest.mark.parametrize("src,out", [
    ("Clear cell (CCRCC)", "T\u1ebf b\u00e0o s\u00e1ng (ccRCC)"),           # case-insensitive
    ("FTD-tdp43 inclusions", "Th\u1ec3 v\u00f9i FTD-TDP-43"),               # hyphen between letters and digits
    ("34betaE12 (rare cells)", "34 beta E12 (hi\u1ebfm t\u1ebf b\u00e0o)"),
    ("CD117+ and p.V600E", "CD117 d\u01b0\u01a1ng t\u00ednh v\u00e0 p.V600E"),
    ("Two CNBs", "Hai CNB"),                                                 # plural acronym, singular kept
    ("Lateral neck LNs in HCMC", "H\u1ea1ch c\u1ed5 b\u00ean t\u1ea1i TP.HCM"),  # shorthand for common words
    ("Size 18.9x17.9 mm, 65fmol/mg per mm2", "K\u00edch th\u01b0\u1edbc 18,9 x 17,9 mm, 65 fmol/mg tr\u00ean mm\u00b2"),
    ("Jane Doe, MD, PhD, FRCPath", "BS TS Jane Doe, FRCPath"),         # degrees move before the name
    ("Born 14 SEP 1990 in JAPAN", "Sinh ng\u00e0y 14 th\u00e1ng 9 n\u0103m 1990 t\u1ea1i Nh\u1eadt B\u1ea3n"),
    ("Level II and TBS VI", "Nh\u00f3m 2 v\u00e0 TBS 6"),                   # roman numerals
    ("SUMMARY OF EQA RESULTS", "T\u00d3M T\u1eaeT K\u1ebeT QU\u1ea2 NGO\u1ea0I KI\u1ec2M"),  # shouting line
    ("In the 19th century, over 65yo, x2", "V\u00e0o th\u1ebf k\u1ef7 19, tr\u00ean 65 tu\u1ed5i, hai l\u1ea7n"),
    ("UK and USA centres", "Anh v\u00e0 M\u1ef9"),
])
def test_missing_tokens_ignores_words_degrees_dates_and_kept_tokens(src, out):
    assert missing_tokens(src, out) == []


def test_term_lock_absorbs_adjacent_canonical_words():
    small = [TermFix("small blue round cell tumor", "u t\u1ebf b\u00e0o tr\u00f2n nh\u1ecf (m\u00e0u xanh)",
                     ["xanh tr\u00f2n nh\u1ecf"])]
    out, _ = apply_term_fixes("u t\u1ebf b\u00e0o xanh tr\u00f2n nh\u1ecf", "small blue round cell tumor", small)
    assert out == "u t\u1ebf b\u00e0o tr\u00f2n nh\u1ecf (m\u00e0u xanh)"
    fna = [TermFix("fine needle aspiration", "ch\u1ecdc h\u00fat kim nh\u1ecf (FNA)", ["ch\u1ecdc h\u00fat kim nh\u1ecf"])]
    out, _ = apply_term_fixes("Ch\u1ecdc h\u00fat kim nh\u1ecf (FNA)", "Fine needle aspiration", fna)
    assert out == "Ch\u1ecdc h\u00fat kim nh\u1ecf (FNA)"
    fna2 = [TermFix("fine needle aspiration", "ch\u1ecdc h\u00fat b\u1eb1ng kim nh\u1ecf (FNA)", ["ch\u1ecdc h\u00fat kim nh\u1ecf"])]
    out, _ = apply_term_fixes("Ch\u1ecdc h\u00fat kim nh\u1ecf (FNA)", "Fine needle aspiration", fna2)
    assert out.count("(FNA)") == 1 and out == "Ch\u1ecdc h\u00fat b\u1eb1ng kim nh\u1ecf (FNA)"
    inc = [TermFix("thyroid inclusion", "m\u00f4 tuy\u1ebfn gi\u00e1p v\u00f9i trong h\u1ea1ch", ["th\u1ec3 v\u00f9i tuy\u1ebfn gi\u00e1p"])]
    out, _ = apply_term_fixes("th\u1ec3 v\u00f9i tuy\u1ebfn gi\u00e1p trong h\u1ea1ch", "thyroid inclusion", inc)
    assert out == "m\u00f4 tuy\u1ebfn gi\u00e1p v\u00f9i trong h\u1ea1ch"


def test_term_lock_fires_when_canonical_sits_inside_wrong_form():
    cases = [
        (TermFix("lung", "ph\u1ed5i", ["phe ph\u1ed5i"]), "lung", "vi\u00eam phe ph\u1ed5i", "vi\u00eam ph\u1ed5i"),
        (TermFix("surgical pathology", "gi\u1ea3i ph\u1eabu b\u1ec7nh ngo\u1ea1i khoa",
                 ["gi\u1ea3i ph\u1eabu b\u1ec7nh ngo\u1ea1i khoa h\u1ecdc"]), "surgical pathology",
         "gi\u1ea3i ph\u1eabu b\u1ec7nh ngo\u1ea1i khoa h\u1ecdc", "gi\u1ea3i ph\u1eabu b\u1ec7nh ngo\u1ea1i khoa"),
        (TermFix("mitotic figure", "h\u00ecnh ph\u00e2n b\u00e0o", ["h\u00ecnh ph\u00e2n b\u00e0o b\u1ea5t th\u01b0\u1eddng"]),
         "mitotic figure", "h\u00ecnh ph\u00e2n b\u00e0o b\u1ea5t th\u01b0\u1eddng", "h\u00ecnh ph\u00e2n b\u00e0o"),
        (TermFix("Lewy body", "th\u1ec3 Lewy", ["Lewy body"]), "Lewy body", "Lewy body", "Th\u1ec3 Lewy"),
    ]
    for fx, src, text, want in cases:
        assert apply_term_fixes(text, src, [fx])[0] == want


def test_capitalisation_ignores_tags():
    fixes = [TermFix("lung", "ph\u1ed5i", ["pulm\u00f4n"])]
    out, _ = apply_term_fixes("<g1>Pulm\u00f4n</g1> v\u00e0 v\u00fa", "Lung and breast", fixes)
    assert out == "<g1>Ph\u1ed5i</g1> v\u00e0 v\u00fa"


def test_english_left_title_runs_with_joining_words():
    for t in ("Atlas of Tumours of the Northern Mountain Provinces",
              "Journal of the American Medical Association"):
        assert not english_left(t, t)


SPECIMEN_SRC = ("Spleen, upper pole, partial resection --- Congested red pulp with small granulomas "
                "(Please compare with Lee\u2019s culture results)")
SPECIMEN_OUT = ("Spleen, upper pole, partial resection --- T\u1ee7y \u0111\u1ecf sung huy\u1ebft k\u00e8m u h\u1ea1t "
                "nh\u1ecf (Vui l\u00f2ng \u0111\u1ed1i chi\u1ebfu k\u1ebft qu\u1ea3 c\u1ea5y c\u1ee7a Lee)")


def test_copied_english_finds_a_clause_left_in_english():
    # no English stop word in the clause, so the prose check cannot see it
    assert not english_left(SPECIMEN_SRC, SPECIMEN_OUT)
    assert copied_english(SPECIMEN_SRC, SPECIMEN_OUT) == ["Spleen, upper pole, partial resection"]
    src = "UBC cytology of the right ureter showed a low-grade papillary neoplasm"
    out = ("T\u1ebf b\u00e0o h\u1ecdc UBC c\u1ee7a ni\u1ec7u qu\u1ea3n ph\u1ea3i cho th\u1ea5y u nh\u00fa \u0111\u1ed9 "
           "th\u1ea5p low-grade papillary neoplasm")
    assert copied_english(src, out) == ["low-grade papillary neoplasm"]
    assert copied_english("the tumour of the lung", "u: the tumour of the lung") == ["the tumour of the lung"]
    assert copied_english(SPECIMEN_SRC, "L\u00e1ch, c\u1ef1c tr\u00ean, c\u1eaft m\u1ed9t ph\u1ea7n") == []


@pytest.mark.parametrize("src, out", [
    # drug lists, names, degrees, links: no common English word written in lower case
    ("Patients received gefitinib, erlotinib, afatinib",
     "B\u1ec7nh nh\u00e2n d\u00f9ng gefitinib, erlotinib, afatinib"),
    ("Courtesy of Dr. Mei-Ling Tran", "Do b\u00e1c s\u0129 Mei-Ling Tran cung c\u1ea5p"),
    ("Brown AC, Smith A, Lee C, Novak SE", "Brown AC, Smith A, Lee C, Novak SE"),
    ("Professor Jane Doe BSc, MBBS, FRCPA, FFSc", "Gi\u00e1o s\u01b0 Jane Doe CN, MBBS, FRCPA, FFSc"),
    ("Email: jdoe2@go.example.org", "Email: jdoe2@go.example.org"),
    # quoted titles, brackets (English glosses) and Title-Case runs stay English
    ("his lecture \"Common errors in the reading of frozen sections\"",
     "b\u00e0i gi\u1ea3ng \"Common errors in the reading of frozen sections\" c\u1ee7a \u00f4ng"),
    ("in the right lobe", "\u1edf th\u00f9y ph\u1ea3i (in the right lobe)"),
    ("World Health Organization Classification of Tumours", "World Health Organization Classification of Tumours"),
    # two words are not a run; acronyms and codes are not words; words must follow each other in the source too
    ("the right lobe was removed", "th\u00f9y right lobe \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1eaft"),
    ("HER2 and ER status", "t\u00ecnh tr\u1ea1ng HER2 and ER"),
    ("the tumour of the lung and the margin", "lung the margin of the tumour"),
])
def test_copied_english_ignores_what_stays_english(src, out):
    assert copied_english(src, out) == []


def test_copied_english_finds_title_case_specimen_labels_with_a_site_or_side():
    src = "Breast, Left, Lumpectomy --- Fibroadenoma"
    assert copied_english(src, "Breast, Left, Lumpectomy --- U x\u01a1 tuy\u1ebfn") == ["Breast, Left, Lumpectomy"]
    src = "Liver, Wedge Biopsy --- Steatosis"
    assert copied_english(src, "Liver, Wedge Biopsy --- Nhi\u1ec5m m\u1ee1") == ["Liver, Wedge Biopsy"]


@pytest.mark.parametrize("src, out", [
    # Title-Case names without a site or side word stay names
    ("Annual Meeting, Program Committee, Chair", "Annual Meeting, Program Committee, Ch\u1ee7 t\u1ecbch"),
    # a Title-Case run (title, journal) stays English even with an organ in it; two words are not a run
    ("Journal of Thyroid Research", "Journal of Thyroid Research"),
    ("Left Kidney", "Left Kidney b\u00ean tr\u00e1i"),
])
def test_copied_english_title_case_without_a_site_word_or_in_a_title_run_stays(src, out):
    assert copied_english(src, out) == []


@pytest.mark.parametrize("src, out, want", [
    ("Grade of the lesion", "ph\u00e2n \u0111\u1ed9 c\u1ee7a t\u1ed5n th\u01b0\u01a1ng",
     "Ph\u00e2n \u0111\u1ed9 c\u1ee7a t\u1ed5n th\u01b0\u01a1ng"),
    ("Class 2", "\u201cnh\u00f3m 2\u201d", "\u201cNh\u00f3m 2\u201d"),
    ("Margin <g1>status</g1>", "<g1>t\u00ecnh tr\u1ea1ng</g1> di\u1ec7n c\u1eaft",
     "<g1>T\u00ecnh tr\u1ea1ng</g1> di\u1ec7n c\u1eaft"),
    ("HER2 status", "t\u00ecnh tr\u1ea1ng HER2", "T\u00ecnh tr\u1ea1ng HER2"),  # an acronym starts the source too
])
def test_source_case_capitalises_the_first_letter_like_the_source(src, out, want):
    assert source_case(src, out) == want


@pytest.mark.parametrize("src, out", [
    ("other findings", "c\u00e1c ph\u00e1t hi\u1ec7n kh\u00e1c"),  # the source starts in lower case
    ("3 Groups", "3 nh\u00f3m"),  # no letter first
    ("Levels of mRNA", "mRNA t\u0103ng"),  # a code / gene name keeps its case
    ("Patients with p53 loss", "p53 m\u1ea5t \u1edf b\u1ec7nh nh\u00e2n"),
    ("Ki-67 in tau-positive cells", "tau d\u01b0\u01a1ng t\u00ednh"),  # written in lower case in the source
    ("Grade", ""),
])
def test_source_case_leaves_codes_names_and_lower_case_sources(src, out):
    assert source_case(src, out) == out


OMIT_SRC = ("Breast, left upper outer quadrant, ultrasound-guided core needle biopsy --- "
            "Fibroadenoma with apocrine metaplasia")
OMIT_HEAD = ("V\u00fa tr\u00e1i, g\u00f3c ph\u1ea7n t\u01b0 tr\u00ean ngo\u00e0i, sinh thi\u1ebft l\u00f5i kim d\u01b0\u1edbi "
             "h\u01b0\u1edbng d\u1eabn si\u00eau \u00e2m --- ")
OMIT_VI = OMIT_HEAD + "U x\u01a1 tuy\u1ebfn"
FULL_VI = OMIT_HEAD + "U x\u01a1 tuy\u1ebfn k\u00e8m d\u1ecb s\u1ea3n \u0111\u1ea1i h\u00e3n"


def test_omitted_clauses_finds_a_clause_translated_far_too_short():
    assert omitted_clauses(OMIT_SRC, OMIT_VI) == ["Fibroadenoma with apocrine metaplasia"]
    assert omitted_clauses(OMIT_SRC, FULL_VI) == []
    src = "Grade 2; necrosis and brain invasion are both absent"
    assert omitted_clauses(src, "\u0110\u1ed9 2; kh\u00f4ng c\u00f3") == ["necrosis and brain invasion are both absent"]


def test_omitted_clauses_needs_matching_clauses_and_a_long_enough_source_clause():
    assert omitted_clauses(OMIT_SRC, OMIT_VI.replace(" --- ", ": ")) == []  # clauses do not line up
    assert omitted_clauses("Liver --- Steatosis", "Gan --- M\u1ee1") == []  # under 20 letters
    assert omitted_clauses("Fibroadenoma with apocrine metaplasia", "U x\u01a1 tuy\u1ebfn") == []  # one clause: the ratio gate's job


# ---- LaTeX / math markup in a Vietnamese answer (spec Amendment E: Gemma 4 writes symbols as LaTeX)

def test_latex_markup_finds_inline_math_commands_and_script_groups_in_order():
    assert latex_markup("Nhu\u1ed9m $\\beta$-catenin") == ["$\\beta$"]
    assert latex_markup("IIA $\\rightarrow$ IIB, $\\ge 2$ h\u1ea1ch") == ["$\\rightarrow$", "$\\ge 2$"]
    assert latex_markup("ki\u1ec3u \\alpha v\u00e0 x^{2}, CO_{2}") == ["\\alpha", "^{2}", "_{2}"]


@pytest.mark.parametrize("text", [
    "Gi\u00e1 $5 \u0111\u1ebfn $10",  # prices
    "Th\u01b0 m\u1ee5c C:\\Users\\data",  # a path: not a known command
    "T\u1ec9 l\u1ec7 \u2265 2 v\u00e0 \u03b2-catenin \u2192 \u00b5m",  # the symbols themselves
    "t\u1ec7p ten_tep_1",  # an underscore without a brace
])
def test_latex_markup_ignores_prices_paths_real_symbols_and_plain_underscores(text):
    assert latex_markup(text) == []


def test_new_latex_ignores_markup_the_source_has():
    assert new_latex("Write $\\alpha$ in the formula", "Vi\u1ebft $\\alpha$ trong c\u00f4ng th\u1ee9c") == []
    assert new_latex("Nuclear \u03b2-catenin", "\u03b2-catenin trong nh\u00e2n $\\beta$") == ["$\\beta$"]


@pytest.mark.parametrize("src, out, want", [
    ("Nuclear \u03b2-catenin staining", "Nhu\u1ed9m $\\beta$-catenin trong nh\u00e2n",
     "Nhu\u1ed9m \u03b2-catenin trong nh\u00e2n"),
    ("Stage IIA \u2192 IIB after review", "Giai \u0111o\u1ea1n IIA $\\rightarrow$ IIB sau khi xem l\u1ea1i",
     "Giai \u0111o\u1ea1n IIA \u2192 IIB sau khi xem l\u1ea1i"),
    ("Tumours \u2265 5 cm", "Kh\u1ed1i u $\\geq 5$ cm", "Kh\u1ed1i u \u2265 5 cm"),
    ("Tumours \u2264 2 cm", "Kh\u1ed1i u \\le 2 cm", "Kh\u1ed1i u \u2264 2 cm"),  # a bare command
    ("Cells 5 \u00b5m wide", "T\u1ebf b\u00e0o r\u1ed9ng 5 $\\mu$m", "T\u1ebf b\u00e0o r\u1ed9ng 5 \u00b5m"),  # micro sign as in the source
    ("Kept at 4 \u00b0C", "Gi\u1eef \u1edf 4 $^{\\circ}$C", "Gi\u1eef \u1edf 4 \u00b0C"),
    ("TGF-\u03b2 signalling", "T\u00edn hi\u1ec7u <g1>TGF-$\\beta$</g1>", "T\u00edn hi\u1ec7u <g1>TGF-\u03b2</g1>"),
])
def test_fix_latex_writes_known_symbols_as_characters(src, out, want):
    assert fix_latex(src, out) == want


@pytest.mark.parametrize("src, out", [
    ("Half of the cells", "M\u1ed9t n\u1eeda $\\frac{1}{2}$ s\u1ed1 t\u1ebf b\u00e0o"),  # not a symbol
    ("Area in mm2", "Di\u1ec7n t\u00edch mm^{2}"),  # a superscript group
    ("Write $\\alpha$ here", "Vi\u1ebft $\\alpha$ \u1edf \u0111\u00e2y"),  # the source's own markup stays
    ("Costs $5 to $10", "Gi\u00e1 $5 \u0111\u1ebfn $10"),
])
def test_fix_latex_leaves_other_markup_and_the_source_markup_alone(src, out):
    assert fix_latex(src, out) == out


# ---- a single English word left in a Vietnamese answer (spec Amendment E: "Hepatocyte ...")

HEPATO_SRC = "Swollen hepatocytes around the central vein"
HEPATO_OUT = "Hepatocyte ph\u00ecnh to quanh t\u0129nh m\u1ea1ch trung t\u00e2m"


def test_single_english_finds_one_word_copied_into_a_vietnamese_answer():
    assert single_english(HEPATO_SRC, HEPATO_OUT) == ["Hepatocyte"]  # an organ word (hepat-), plural in the source
    assert single_english("Nodule in the left lobe", "N\u1ed1t \u1edf th\u00f9y left") == ["left"]  # a side / frequent word
    assert single_english("HER2 and ER status", "t\u00ecnh tr\u1ea1ng HER2 and ER") == ["and"]
    src, out = "A deletion of 1p was found", "Ph\u00e1t hi\u1ec7n deletion 1p"
    assert single_english(src, out) == []  # neither a frequent word nor an organ word ...
    assert single_english(src, out, terms={"deletion"}) == ["deletion"]  # ... but a glossary key with a Vietnamese value
    src, out = "Losses of chromosomes 6 and 10", "M\u1ea5t nhi\u1ec5m s\u1eafc th\u1ec3 6 v\u00e0 10 chromosomes"
    assert single_english(src, out, terms={"chromosome"}) == ["chromosomes"]


@pytest.mark.parametrize("src, out", [
    ("Treated with trastuzumab", "\u0110i\u1ec1u tr\u1ecb b\u1eb1ng trastuzumab"),  # a drug INN
    ("KRAS and BRAF mutations", "\u0110\u1ed9t bi\u1ebfn KRAS v\u00e0 BRAF"),  # gene symbols
    ("Positive for synaptophysin and chromogranin",
     "D\u01b0\u01a1ng t\u00ednh v\u1edbi synaptophysin v\u00e0 chromogranin"),  # protein names
    ("Infection with Streptococcus pneumoniae", "Nhi\u1ec5m Streptococcus pneumoniae"),  # a Latin species (pneum-)
    ("Pneumocystis was seen", "Th\u1ea5y Pneumocystis"),  # a genus: capitalised in the source
    ("Cohorts from Cardiff and Liverpool", "C\u00e1c nh\u00f3m t\u1eeb Cardiff v\u00e0 Liverpool"),  # places (cardi-, liver)
    ("Hashimoto thyroiditis", "Vi\u00eam tuy\u1ebfn gi\u00e1p Hashimoto"),  # an eponym
    ("A 5 mm nodule", "N\u1ed1t 5 mm"),  # a unit
    ("The CCRCC subtype", "Ph\u00e2n nh\u00f3m CCRCC"),  # an acronym
    ("Tau in neurons", "Tau trong neuron"),  # a Vietnamese syllable (tau); a loanword that is no organ word
    ("in the right lobe", "\u1edf th\u00f9y ph\u1ea3i (in the right lobe)"),  # a bracketed gloss
    ("Do not reuse old slides", "Kh\u00f4ng d\u00f9ng l\u1ea1i lam c\u0169 do h\u1ecfng"),  # "do" is Vietnamese too
    ("Left Kidney", "Left Kidney b\u00ean tr\u00e1i"),  # capitalised in the source (a name or a label)
    (HEPATO_SRC, "Swollen hepatocytes"),  # no Vietnamese in the answer: the job of english_left / unchanged
])
def test_single_english_leaves_names_codes_species_units_and_loanwords(src, out):
    assert single_english(src, out) == []
