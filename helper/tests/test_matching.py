import pytest

from fixtures import make_docx, make_pptx
from nonmedical import ALLOWED_FAMILIES, TEXTS
from packutil import BREAST, REAL_PACKS, build, copy_real, make_pack
from vitranslate.config import REPO_ROOT
from vitranslate.matching import THRESHOLD, count_terms, score_packs, select_packs
from vitranslate.ooxml.document import collect_items
from vitranslate.ooxml.package import OoxmlPackage

PATHOLOGY_TEXT = (
    "Histopathology of the biopsy showed a meningioma with brisk mitoses and focal necrosis. Immunohistochemistry "
    "(IHC) staining was negative for the tumor markers; WHO classification grade 2. No lymph node metastasis.")
BREAST_TEXT = (
    "Core needle biopsy of the left breast: invasive carcinoma with a ductal carcinoma in situ component; lobular "
    "features absent. HER2 IHC staining 2+, Nottingham grade 2. Mammography showed a BI-RADS 5 mass. No lymph node "
    "metastasis; tumor necrosis present.")
# breast terms only: pathology has a single detect keyword here ("carcinoma" inside DCIS), so only the parent rule
# brings it in
BREAST_ONLY = ("Mammography: BI-RADS 4 lesion. Ductal carcinoma in situ, lobular pattern, HER2 equivocal. "
               "Mammography follow-up; HER2 retest; BI-RADS 3 on the right.")
# pathology outscores breast here, both pass the gate
PARENT_HIGHER = PATHOLOGY_TEXT + (
    " Glioma, astrocytoma and sarcoma with necrosis, gliosis and dementia; carcinoma and lymphoma on cytology; "
    "neoplasm with metastases. HER2 and mammography; BI-RADS.")
# many glossary words, one detect keyword: the detect gate keeps pathology out
GLOSSARY_ONLY = ("Pleomorphic cells in a cribriform, papillary and trabecular arrangement with storiform areas, "
                 "palisading and rosette formation; focal, diffuse and patchy patterns; one tumor.")


def doc_text(path):
    return "\n".join(i.segment.plain for i in collect_items(OoxmlPackage(path)) if i.segment)


@pytest.fixture(scope="module")
def path_manifest(tmp_path_factory):
    root = tmp_path_factory.mktemp("reg")
    return build(copy_real(root / "packs", "pathology"), root / "out")


@pytest.fixture(scope="module")
def two_manifest(tmp_path_factory):
    root = tmp_path_factory.mktemp("reg2")
    src = copy_real(root / "packs", "pathology")
    make_pack(src, "breast", parent="pathology", **BREAST)
    return build(src, root / "out")


def ids(matches):
    return [m.entry["id"] for m in matches]


def test_pathology_paragraph_selects_pathology(path_manifest):
    (m,) = select_packs(PATHOLOGY_TEXT, path_manifest)
    assert m.entry["id"] == "pathology" and m.score >= THRESHOLD and m.reason == "match"
    assert 3 <= len(m.matched) <= 8 and "meningioma" in m.matched and m.detect_hits >= 10


@pytest.mark.parametrize("maker", [make_pptx, make_docx])
def test_fixture_documents_select_pathology(path_manifest, tmp_path, maker):
    path = maker(tmp_path / ("a.pptx" if maker is make_pptx else "a.docx"))
    assert ids(select_packs(doc_text(path), path_manifest)) == ["pathology"]
    if maker is make_docx:  # meningioma + pathology: exactly at the gate since "staining" is no detect keyword
        assert score_packs(doc_text(path), path_manifest)[0].detect_hits == 2


def test_ambiguous_words_are_not_detect_keywords(path_manifest):
    (entry,) = path_manifest["packs"]
    assert "staining" not in entry["detect"] and "nuclei" not in entry["detect"]
    assert "nuclear staining" in entry["profile"]  # the glossary terms built on them still count


@pytest.fixture(scope="module")
def full_manifest(tmp_path_factory):
    """The full registry: every pack of packs/, drafts included (acceptance 3(a) of the pack roadmap holds for each
    pack, so this test reads the draft folders on purpose)."""
    return build(REAL_PACKS, tmp_path_factory.mktemp("full") / "out", include_drafts=True)


def families_of(matches, manifest):
    """Root ids of the selected packs (family = a root pack + its children)."""
    parent = {e["id"]: e.get("parent") for e in manifest["packs"]}
    roots = set()
    for m in matches:
        pid = m.entry["id"]
        while parent.get(pid) in parent and parent[pid] != pid:
            pid = parent[pid]
        roots.add(pid)
    return roots


@pytest.mark.parametrize("name", sorted(TEXTS))
def test_non_medical_texts_select_no_medical_family(path_manifest, two_manifest, full_manifest, name):
    """A non-medical text selects no medical family, today and as packs are added: only the non-medical families
    nonmedical.ALLOWED_FAMILIES names for that text may appear (they need not exist)."""
    allowed = ALLOWED_FAMILIES.get(name, set())
    for manifest in (path_manifest, two_manifest, full_manifest):
        assert families_of(select_packs(TEXTS[name], manifest), manifest) <= allowed
    assert all(m.detect_hits == 0 for m in score_packs(TEXTS[name], two_manifest))


def test_a_non_medical_family_may_be_selected_where_it_belongs(tmp_path):
    """Roadmap K8: once a molecular pack exists, the agri genetics text selects it, and that is right."""
    src = copy_real(tmp_path / "packs", "pathology")
    make_pack(src, "molecular", detect=["genotyping", "allele", "DNA methylation", "microsatellite"],
              glossary=[("genotyping", "x"), ("allele", "alen"), ("DNA methylation", "methyl hoa DNA"),
                        ("transcription factor", "yeu to phien ma"), ("microsatellite", "vi ve tinh")])
    m = build(src, tmp_path / "out")
    assert families_of(select_packs(TEXTS["agri genetics"], m), m) == {"molecular"} <= ALLOWED_FAMILIES["agri genetics"]
    assert families_of(select_packs(TEXTS["budget memo"], m), m) == set()


def test_short_non_medical_line_selects_nothing(path_manifest):
    assert select_packs("Quarterly budget and invoices.", path_manifest) == []
    assert select_packs("", path_manifest) == [] and select_packs(PATHOLOGY_TEXT, {"packs": [], "idf": {}}) == []


def test_detect_gate(path_manifest):
    (m,) = score_packs(GLOSSARY_ONLY, path_manifest)
    assert m.terms >= 8 and m.score >= THRESHOLD and m.detect_hits == 1  # would pass without the gate
    assert select_packs(GLOSSARY_ONLY, path_manifest) == []
    assert ids(select_packs(GLOSSARY_ONLY, path_manifest, min_detect=1)) == ["pathology"]
    assert ids(select_packs(GLOSSARY_ONLY.replace("one tumor", "tumor and tumors"), path_manifest)) == ["pathology"]
    no_detect = dict(path_manifest, packs=[dict(e, detect=[]) for e in path_manifest["packs"]])
    assert select_packs(PATHOLOGY_TEXT, no_detect) == []  # an entry without detect keywords is never auto-selected


def test_manifest_lists_normalised_detect_keywords(path_manifest):
    (entry,) = path_manifest["packs"]
    assert "ihc" in entry["detect"] and "who classification" in entry["detect"]
    assert entry["detect"] == sorted(set(entry["detect"]))


def test_breast_pathology_text_selects_both_breast_first(two_manifest):
    ms = select_packs(BREAST_TEXT, two_manifest)
    assert ids(ms) == ["breast", "pathology"] and ms[0].score > ms[1].score
    assert [m.reason for m in ms] == ["match", "match"]
    assert "ductal carcinoma in situ" in ms[0].matched and "her2" in ms[0].matched
    assert ids(select_packs(PATHOLOGY_TEXT, two_manifest)) == ["pathology"]  # no breast term: breast not chosen


def test_parent_is_included_after_the_child(two_manifest):
    scores = {m.entry["id"]: m for m in score_packs(BREAST_ONLY, two_manifest)}
    assert scores["pathology"].detect_hits < 2  # pathology would not be chosen on its own
    ms = select_packs(BREAST_ONLY, two_manifest)
    assert ids(ms) == ["breast", "pathology"] and [m.reason for m in ms] == ["match", "parent"]
    # a family that does not fit the pack cap is dropped whole: never a child without its root
    assert select_packs(BREAST_ONLY, two_manifest, max_packs=1) == []


def test_child_comes_before_a_higher_scoring_parent(two_manifest):
    """The IHC EQA deck case: pathology outscores breast, yet breast merges first so its overrides win."""
    scores = {m.entry["id"]: m.score for m in score_packs(PARENT_HIGHER, two_manifest)}
    assert scores["pathology"] > scores["breast"] >= THRESHOLD
    ms = select_packs(PARENT_HIGHER, two_manifest)
    assert ids(ms) == ["breast", "pathology"] and [m.reason for m in ms] == ["match", "match"]


def fam_manifest(*packs):
    """A manifest of (id, parent) packs; pack p has the three terms <p>one / <p>two / <p>three (detect too)."""
    entries = []
    for pid, parent in packs:
        terms = [pid.replace("-", "") + w for w in ("one", "two", "three")]
        entries.append({"id": pid, "parent": parent, "profile": {t: 1.0 for t in terms}, "detect": terms})
    return {"packs": entries, "idf": {}}


def fam_text(reps):
    """Every term of pack p repeated reps[p] times: more repeats, higher score."""
    return " ".join(" ".join([pid.replace("-", "") + w] * n) for pid, n in reps.items()
                    for w in ("one", "two", "three"))


def test_family_rule_keeps_every_child_with_its_root():
    # the old rule counted parents in max_packs=3: surgery-gi, surgery, medicine-oncology (oncology without medicine)
    m = fam_manifest(("surgery", None), ("surgery-gi", "surgery"), ("medicine", None),
                     ("medicine-oncology", "medicine"))
    text = fam_text({"surgery-gi": 5, "surgery": 4, "medicine-oncology": 3})
    ms = select_packs(text, m, threshold=0.0)
    assert ids(ms) == ["surgery-gi", "surgery", "medicine-oncology", "medicine"]
    assert [x.reason for x in ms] == ["match", "match", "match", "parent"]
    assert ids(select_packs(text, m, threshold=0.0, max_packs=3)) == ["surgery-gi", "surgery"]


def test_at_most_three_families_ranked_by_their_best_score():
    m = fam_manifest(("a", None), ("b", None), ("c", None), ("d", None), ("d-kid", "d"))
    # d itself scores lowest, but its child scores highest: the d family ranks first
    text = fam_text({"a": 2, "b": 4, "c": 3, "d": 1, "d-kid": 6})
    assert ids(select_packs(text, m, threshold=0.0)) == ["d-kid", "d", "b", "c"]
    assert ids(select_packs(text, m, threshold=0.0, max_families=1)) == ["d-kid", "d"]


def test_family_that_does_not_fit_is_dropped_whole_and_smaller_ones_still_fit():
    m = fam_manifest(("a", None), ("a1", "a"), ("a2", "a"), ("a3", "a"), ("b", None), ("b1", "b"), ("b2", "b"),
                     ("c", None))
    text = fam_text({"a1": 9, "a3": 8, "a2": 7, "a": 6, "b1": 5, "b2": 4, "b": 3, "c": 2})
    # a = 4 packs, b = 3 (4 + 3 > 6: dropped whole), c = 1; siblings by score, then their root
    assert ids(select_packs(text, m, threshold=0.0)) == ["a1", "a3", "a2", "a", "c"]


def test_pack_whose_parent_is_not_in_the_manifest_is_its_own_root():
    m = fam_manifest(("orphan", "ghost"), ("other", None))
    assert ids(select_packs(fam_text({"orphan": 3, "other": 2}), m, threshold=0.0)) == ["orphan", "other"]


def test_min_terms_enforced(path_manifest):
    text = "Tumor tumor tumor. Meningioma meningioma meningioma meningioma."
    assert select_packs(text, path_manifest, threshold=0.0) == []  # 2 distinct terms, however often
    (m,) = select_packs(text, path_manifest, threshold=0.0, min_terms=2)
    assert m.matched == ["meningioma", "tumor"] and m.detect_hits == 7  # highest contribution first
    assert ids(select_packs("Glioma and astrocytoma with dementia.", path_manifest, threshold=0.0)) == ["pathology"]


def test_score_packs_scores_every_pack(two_manifest):
    scores = {m.entry["id"]: m for m in score_packs(PATHOLOGY_TEXT, two_manifest)}
    assert set(scores) == {"pathology", "breast"}
    assert scores["pathology"].score > scores["breast"].score >= 0.0


def test_count_terms_whole_words_plurals_and_ngrams():
    counts = count_terms("Tumors and a tumor; tumorigenesis. Lymph nodes, lymph-node. Ki-67 index. Mitoses.",
                         ["tumor", "lymph node", "node", "ki-67", "index", "mitoses", "nodule"])
    assert counts == {"tumor": 2, "lymph node": 1, "node": 1, "ki-67": 1, "index": 1, "mitoses": 1}


def test_count_terms_ies_and_latin_plurals():
    counts = count_terms("Two biopsies; one nucleus, many nuclei; bronchi; core biopsies.",
                         ["biopsy", "nuclei", "bronchus", "core biopsy"])
    assert counts == {"biopsy": 2, "nuclei": 2, "bronchus": 1, "core biopsy": 1}
    assert count_terms("A nucleus.", ["nucleus"]) == {"nucleus": 1}
    assert count_terms("Many nuclei.", ["nucleus"]) == {"nucleus": 1}


@pytest.mark.private
def test_private_corpus_selects_pathology(path_manifest):
    listing = REPO_ROOT / "private" / "corpus.txt"
    paths = [p.strip() for p in listing.read_text(encoding="utf-8").splitlines() if p.strip()]
    assert len(paths) == 7
    for p in paths:
        assert ids(select_packs(doc_text(p), path_manifest)) == ["pathology"], p
