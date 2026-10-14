"""packs/** is checked out and archived with LF line endings whatever core.autocrlf says (.gitattributes), so the
registry zips (tools/build_registry.py), the Functions' pack bundle (tools/bundle_packs.py, git archive of a commit)
and the TM pack keys (id@version#sha256[:8]) are the same on every machine. The engine's synthetic fixture packs keep
their deliberate CRLF / BOM bytes (-text)."""
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]


def attrs(*paths):
    """{path: {"text": ..., "eol": ...}} as git check-attr reports them (paths need not exist)."""
    if shutil.which("git") is None or not (REPO / ".git").exists():
        pytest.skip("not a git checkout")
    out = subprocess.run(["git", "-C", str(REPO), "check-attr", "text", "eol", "--"] + list(paths),
                         check=True, capture_output=True, text=True).stdout
    found = {}
    for line in out.splitlines():
        path, attr, value = line.rsplit(": ", 2)
        found.setdefault(path, {})[attr] = value
    return found


def test_pack_files_are_text_with_lf_line_endings():
    paths = ["packs/pathology/glossary.csv", "packs/pathology/rules.json", "packs/_style/prompt.md",
             "packs/_shared/example.csv", "packs/example/tests.jsonl"]
    found = attrs(*paths)
    assert sorted(found) == sorted(paths)
    for path in paths:
        assert found[path] == {"text": "set", "eol": "lf"}, path


def test_engine_fixture_packs_keep_their_bytes():
    path = "web/engine/tests/fixtures/engine/packs/example/glossary.csv"
    assert attrs(path)[path]["text"] == "unset"
