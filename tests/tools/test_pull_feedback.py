"""tools/pull_feedback.py: the APPROVED term-pair feedback (spec Amendment G) from the D1 database vitrans-feedback
(npx wrangler d1 execute ... --json) into a JSON file for the pack learner; console output ASCII only, never a term.
Run: <env python> -m pytest -q tests/tools/test_pull_feedback.py (no network: wrangler is a fake runner)."""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))

import pull_feedback  # noqa: E402

ROWS = [
    {"en": "core needle", "vi_used": "kim l\u00f5i", "vi_user": "kim sinh thi\u1ebft l\u00f5i", "pack": "alpha-kid",
     "kind": "new", "count": 3, "first_day": "2026-10-14", "last_day": "2026-10-15"},
    {"en": "hepatocellular carcinoma", "vi_used": "ung th\u01b0 bi\u1ec3u m\u00f4 t\u1ebf b\u00e0o gan",
     "vi_user": "carcinom t\u1ebf b\u00e0o gan", "pack": "alpha", "kind": "new", "count": 2,
     "first_day": "2026-10-14", "last_day": "2026-10-14"},
]


def wrangler_answer(rows=ROWS, success=True):
    return json.dumps([{"results": rows, "success": success, "meta": {"served_by": "test", "duration": 0.1}}])


class FakeRun:
    def __init__(self, stdout="", returncode=0, stderr=""):
        self.calls = []
        self.result = (stdout, returncode, stderr)

    def __call__(self, args, **kwargs):
        self.calls.append((list(args), kwargs))
        stdout, code, stderr = self.result
        return subprocess.CompletedProcess(args, code, stdout=stdout, stderr=stderr)


def ascii_only(text):
    text.encode("ascii")
    return True


def test_approved_rows_go_to_a_json_file_and_the_console_names_counts_only(tmp_path, capsys):
    run = FakeRun(wrangler_answer())
    out = tmp_path / "approved.json"
    assert pull_feedback.main(["--out", str(out)], run=run) == 0
    args, kwargs = run.calls[0]
    assert args[1:] == ["--yes", "wrangler@4.150.0", "d1", "execute", "vitrans-feedback", "--remote", "--json",
                        "--command", pull_feedback.QUERY]
    assert "status = 'approved'" in pull_feedback.QUERY
    assert kwargs["capture_output"] and kwargs["encoding"] == "utf-8"
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["source"] == "d1 vitrans-feedback (remote)"
    assert data["rows"] == ROWS
    assert data["pulled_utc"].endswith("Z")
    printed = capsys.readouterr().out
    assert ascii_only(printed)
    assert "2 approved row(s)" in printed and "alpha: 1" in printed and "alpha-kid: 1" in printed
    assert "carcinoma" not in printed and "needle" not in printed


def test_local_state_and_default_file_name(tmp_path, monkeypatch):
    run = FakeRun(wrangler_answer([]))
    monkeypatch.setattr(pull_feedback, "OUT_DIR", tmp_path / "out" / "feedback")
    assert pull_feedback.main(["--local", "--persist-to", "D:/vt_state"], run=run) == 0
    args, _ = run.calls[0]
    assert args[args.index("--local") + 1:args.index("--local") + 3] == ["--persist-to", "D:/vt_state"]
    assert "--remote" not in args
    written = list((tmp_path / "out" / "feedback").glob("approved-*.json"))
    assert len(written) == 1
    assert json.loads(written[0].read_text(encoding="utf-8"))["rows"] == []


def test_a_failed_or_unreadable_wrangler_run_writes_nothing(tmp_path, capsys):
    out = tmp_path / "approved.json"
    for run in (FakeRun("", 1, "X [ERROR] Authentication error \u2717"), FakeRun("not json"),
                FakeRun(wrangler_answer(success=False)), FakeRun(json.dumps({"results": []}))):
        assert pull_feedback.main(["--out", str(out)], run=run) == 1
        assert not out.exists()
    assert ascii_only(capsys.readouterr().out)
