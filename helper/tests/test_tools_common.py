"""The acceptance helpers of tools/_common.py."""
import sys

from vitranslate.config import REPO_ROOT

sys.path.insert(0, str(REPO_ROOT / "tools"))
import _common  # noqa: E402


def test_silent_english_ignores_punctuation_the_model_dropped():
    src = "Kidney, right, nephrectomy<x1/>--- Oncocytoma with focal necrosis"
    assert _common.is_silent_english(src, "Kidney, right, nephrectomy Oncocytoma with focal necrosis", [])
    assert not _common.is_silent_english(src, "Th\u1eadn ph\u1ea3i, c\u1eaft th\u1eadn<x1/>--- Oncocytoma", [])
    assert not _common.is_silent_english(src, src, ["unchanged"])


def test_silent_english_counts_a_clause_copied_from_the_source():
    src = "Spleen, upper pole, partial resection --- Congested red pulp with small granulomas"
    out = (("Spleen, upper pole, partial resection --- T\u1ee7y \u0111\u1ecf sung huy\u1ebft k\u00e8m u h\u1ea1t "
           "nh\u1ecf"))
    assert _common.is_silent_english(src, out, [])
    assert not _common.is_silent_english(src, out, ["english_left"])


def test_silent_english_counts_a_single_word_copied_from_the_source():
    src = "Swollen hepatocytes around the central vein"
    out = "Hepatocyte ph\u00ecnh to quanh t\u0129nh m\u1ea1ch trung t\u00e2m"
    assert _common.is_silent_english(src, out, [])
    assert not _common.is_silent_english(src, out, ["english_left"])


def test_kept_reference_is_not_silent_english():
    assert not _common.is_silent_english("Smith et al. Mod Pathol. 2019.", "Smith et al. Mod Pathol. 2019.",
                                         ["kept_reference"])


def test_fake_reply_returns_the_editor_drafts_unchanged():
    from vitranslate.polish import EDITOR_HEAD, build_editor_user
    user = build_editor_user([("Grade <g1>2</g1>", "\u0110\u1ed9 <g1>2</g1>"), ("Tumor", "U")], [("tumor", "u")])
    assert _common.fake_reply(EDITOR_HEAD % "x", user) == "[1] \u0110\u1ed9 <g1>2</g1>\n[2] U"


def test_call_recorder_splits_translation_and_editor_calls():
    from vitranslate.llm import FakeLLM
    from vitranslate.polish import EDITOR_HEAD
    llm = FakeLLM(["ab", "cde"])
    llm.last_stats = {"eval_count": 4, "prompt_eval_count": 50, "eval_duration": 10, "prompt_eval_duration": 5}
    rec = _common.CallRecorder(llm)
    assert rec.chat("You translate", "u1") == "ab" and rec.chat(EDITOR_HEAD % "x", "u22") == "cde"
    totals = rec.totals()
    assert totals["translate"]["calls"] == 1 and totals["translate"]["answer_chars"] == 2
    assert totals["polish"] == {"calls": 1, "user_chars": 3, "answer_chars": 3, "prompt_tokens": 50,
                                "answer_tokens": 4, "prompt_ns": 5, "answer_ns": 10,
                                "seconds": totals["polish"]["seconds"]}
    rec.close()  # FakeLLM has no close: nothing happens
