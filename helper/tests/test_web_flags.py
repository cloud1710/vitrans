"""Every warning kind the translator emits has a Vietnamese label in the web report (web/app.js FLAGS)."""
import re

from vitranslate.config import REPO_ROOT
from vitranslate.polish import REASONS

APP_JS = (REPO_ROOT / "web" / "app.js").read_text(encoding="utf-8")


def _flag_keys():
    block = re.search(r"const FLAGS = \{(.*?)\};", APP_JS, re.S).group(1)
    return set(re.findall(r"(\w+):\s*\"", block))


def test_new_quality_flags_have_vietnamese_labels():
    keys = _flag_keys()
    assert {"acronym_lost", "kept_reference", "english_left", "numbers_changed", "kept_code", "omitted"} <= keys


def test_every_sanity_gate_reason_has_a_vietnamese_label():
    from vitranslate.translate import SUSPECT_NOTES
    values = re.search(r"suspect_output: \{(.*?)\}", APP_JS, re.S).group(1)
    assert set(re.findall(r"(\w+):\s*\"", values)) == set(SUSPECT_NOTES)


def test_editor_rejects_an_edit_that_adds_latex():
    assert "latex" in REASONS


def test_editor_pass_has_a_label_a_stage_an_option_and_every_rejection_reason():
    assert "polish_rejected" in _flag_keys()
    values = re.search(r"polish_rejected: \{(.*?)\}", APP_JS, re.S).group(1)
    assert set(re.findall(r"(\w+):\s*\"", values)) == set(REASONS)
    stages = re.findall(r"\[\"(\w+)\", \"", re.search(r"const STAGES = \[(.*?)\];", APP_JS, re.S).group(1))
    assert stages.index("translate") < stages.index("polish") < stages.index("write")
    assert re.search(r"polish: \$\(\"opt-polish\"\)\.checked", APP_JS)
    html = (REPO_ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert re.search(r"<input id=\"opt-polish\" type=\"checkbox\"[^>]*> \u0110\u1ecdc l\u1ea1i cho m\u01b0\u1ee3t", html)
