import time

from vitranslate.repair import LEXICON_GATE, MAX_CANDIDATES, find_candidates, sound_key, term_index, words

# synthetic glossary keys (a few real-looking pathology terms; no pack is read)
KEYS = ["papillary thyroid carcinoma", "follicular thyroid carcinoma", "thyroid carcinoma",
        "papillary thyroid microcarcinoma", "desmin", "smooth muscle actin", "carcinoma", "adenoma", "tumour",
        "lymph node", "biopsy", "biopsies", "in situ hybridization", "chromogranin", "oncocytoma", "stain", "Ki-67",
        "Hodgkin lymphoma", "ER", "HER2"]


def pairs(text, keys=KEYS, **kw):
    return [(c["from"], c["to"]) for c in find_candidates(text, term_index(keys), **kw)]


def test_sound_key_drops_inner_vowels_and_merges_voicing():
    assert sound_key("desmin") == "TSMN"
    assert sound_key("desmond") == "TSMNT"
    assert sound_key("adenoma") == "ATNM"
    assert sound_key("carcinoma") == "KRSNM"
    assert sound_key("phyllodes") == "FLTS"
    assert sound_key("thyroid") == "0RT"
    assert sound_key("knee") == "N"
    assert sound_key("chromogranin") == "KRMKRNN"
    assert sound_key("lesion") == "LXN"
    assert sound_key("bad") == sound_key("pat")
    assert sound_key("67") == "67"


def test_words_fold_case_marks_and_possessives():
    got = [(w[2]) for w in words("S" + chr(0xE9) + "zary's Ki-67 HER2 Bcl-2's don" + chr(0x2019) + "t")]
    assert got == ["sezary", "ki", "67", "her2", "bcl", "2", "dont"]


def test_misheard_single_word():
    assert pairs("Immunohistochemistry is positive for Desmond and smooth muscle actin.")[0] == ("Desmond", "desmin")


def test_misheard_word_inside_a_multiword_term():
    got = pairs("The puppy thyroid carcinoma was multifocal.")
    assert ("puppy thyroid carcinoma", "papillary thyroid carcinoma") in got
    assert all(to not in ("thyroid carcinoma", "carcinoma") for _, to in got)  # they occur exactly


def test_split_and_merged_words():
    assert ("car sin oma", "carcinoma") in pairs("This is a car sin oma of the colon.")
    assert pairs("It was a denoma.")[0] == ("a denoma", "adenoma")  # the better window wins over "denoma"


def test_correct_sentences_give_no_candidates():
    for text in ["The papillary thyroid carcinoma was multifocal.",
                 "Several tumours were stained for desmin.",
                 "The tumor was small and the biopsy was clear.",  # US spelling of a UK key
                 "Hodgkin's lymphoma and the biopsies of the lymph nodes.",
                 "We will look at the next slide now.", ""]:
        assert pairs(text) == [], text


def test_order_limit_and_determinism():
    text = "Desmond and puppy thyroid carcinoma with a denoma and chromogrannin in onkocytoma"
    got = find_candidates(text, term_index(KEYS))
    assert got == find_candidates(text, term_index(list(reversed(KEYS))))
    scores = [c["score"] for c in got]
    assert scores == sorted(scores, reverse=True)
    assert len(got) <= MAX_CANDIDATES
    assert len(find_candidates(text, term_index(KEYS), limit=2)) == 2
    for c in got:
        i, j = c["words"]
        assert 0 <= i < j <= i + 4
        assert isinstance(c["score"], int) and 0 < c["score"] <= 1000
    assert len({c["to"] for c in got}) == len(got)  # one window per key


def test_short_keys_are_never_candidates():
    assert pairs("Her tumour was er positive.", ["ER", "HER2", "tumour"]) == []


def test_speed_for_a_thousand_keys():
    keys = ["%s %s" % (a, b) for a in ("papillary", "follicular", "medullary", "clear cell", "spindle cell",
                                         "mucinous", "serous", "solid", "cribriform", "micropapillary")
            for b in ("carcinoma", "adenoma", "neoplasm", "tumour", "sarcoma", "lesion", "pattern", "hyperplasia",
                      "metaplasia", "dysplasia")] * 10
    keys = ["%s %d" % (k, n) if n else k for n, k in enumerate(keys)] + KEYS
    index = term_index(keys)
    text = ("Immunohistochemistry is positive for Desmond and smooth muscle actin and the puppy thyroid carcinoma "
            "shows a cribriform pattern with focal necrosis.")
    find_candidates(text, index)
    t0 = time.perf_counter()
    for _ in range(20):
        find_candidates(text, index)
    assert (time.perf_counter() - t0) / 20 < 0.05  # generous for CI; the measured figure is in the report


def test_windows_of_glossary_words_are_trusted():
    keys = ["calcification", "WHO classification", "adrenal cortex", "renal cortex", "luminal A", "solid", "slide"]
    assert pairs("The classification was clear.", keys) == []
    assert pairs("Look at the renal cortex here.", keys) == []  # not "and the renal" -> adrenal
    assert pairs("You see this luminal pattern.", keys) == []
    assert pairs("So let us go to the next slide.", keys) == []
    assert pairs("The calci fiction was clear.", keys) == [("calci fiction", "calcification")]
    assert pairs("The calsification was clear.", keys) == []  # a long well-formed word: taken as heard


def test_leading_y_counts_as_a_vowel():
    assert sound_key("hypoplasia")[0] == sound_key("hipoplasia")[0] == "A"


def test_other_forms_of_a_key_are_not_mishearings():
    keys = ["hyperplasia", "astrocyte", "papillary", "dysplasia", "ependymoma", "desmin", "translocation",
            "neuroendocrine carcinoma"]
    assert pairs("The hyperplastic polyp had dysplastic glands.", keys) == []
    assert pairs("Papillae and astrocytic processes after the translocated piece.", keys) == []
    assert pairs("It was an ependy moma, positive for Desmond.", keys) == [("ependy moma", "ependymoma"),
                                                                          ("Desmond", "desmin")]
    assert pairs("A neuroendocrine carcinomma.", keys) == [("neuroendocrine carcinomma", "neuroendocrine carcinoma")]


def test_long_well_formed_words_are_taken_as_heard():
    keys = ["interstitial", "hyperthyroidism", "macroscopic", "pleomorphism", "tumor progression", "anaplastic",
            "translocation"]
    for text in ["Here the type was intestinal, not something else.", "The next slide shows hypothyroidism.",
                 "We also saw light microscopy in this case.", "A single nucleotide polymorphism.",
                 "The tumor regression grade was 2.", "The mRNA translation step."]:
        assert pairs(text, keys) == [], text
    assert pairs("The a plastic carcinoma grew fast.", keys) == [("a plastic", "anaplastic")]


GATE_KEYS = ["papillary thyroid carcinoma", "cell block", "focal", "angiomyolipoma", "desmin", "tumor progression"]
GATE_LEX = {"thyroid", "carcinoma", "block", "vocal", "cord", "regression", "tumor", "angio", "desmin"}


def gated(text, gate):
    return [(c["from"], c["to"]) for c in find_candidates(text, term_index(GATE_KEYS, GATE_LEX), gate=gate)]


def test_lexicon_gate_any_content_word():
    assert gated("The puppy thyroid carcinoma was clear.", "any") == []  # thyroid, carcinoma are medical words
    assert gated("We made a sell block.", "any") == []
    assert gated("A vocal cord polyp.", "any") == []
    assert gated("The tumor regression grade.", "any") == []
    # allowed: a split / merged word count, a capitalised name inside the sentence
    assert gated("It was an angio my oh lipoma.", "any") == [("angio my oh lipoma", "angiomyolipoma")]
    assert gated("Positive for Desmond today.", "any") == [("Desmond", "desmin")]


def test_lexicon_gate_changed_words_only():
    assert gated("The puppy thyroid carcinoma was clear.", "changed") == [("puppy thyroid carcinoma",
                                                                          "papillary thyroid carcinoma")]
    assert gated("We made a sell block.", "changed") == [("sell block", "cell block")]
    assert gated("A vocal cord polyp.", "changed") == []
    assert gated("The tumor regression grade.", "changed") == []


def test_lexicon_gate_off_and_no_lexicon_keep_the_finder_as_it_was():
    assert ("vocal", "focal") in gated("A vocal cord polyp.", "off")
    assert ("vocal", "focal") in [(c["from"], c["to"]) for c in find_candidates("A vocal cord polyp.",
                                                                                term_index(GATE_KEYS))]


def test_the_committed_lexicon_is_up_to_date():
    import subprocess
    import sys
    from pathlib import Path
    tool = Path(__file__).resolve().parents[2] / "tools" / "build_lexicon.py"
    r = subprocess.run([sys.executable, str(tool), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_default_gate_is_changed_words():
    assert LEXICON_GATE == "changed"
    keys = ["lobectomy", "high-grade squamous intraepithelial lesion", "ELISA", "cell block"]
    idx = term_index(keys, {"anal", "squamous", "intraepithelial", "lesion", "block", "grade"})
    got = lambda t: [(c["from"], c["to"]) for c in find_candidates(t, idx)]  # noqa: E731
    assert got("The surgeon did a lumpectomy last week.") == []  # a procedure ending counts as medical
    assert got("We saw anal squamous intraepithelial lesion here.") == []  # high-grade = one word: same count
    assert got("Here it was that, not something else.") == []  # "else" is a stopword: no ELISA
    assert got("We made a sell block.") == [("sell block", "cell block")]
