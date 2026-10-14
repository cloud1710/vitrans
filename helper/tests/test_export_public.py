"""tools/export_public.py: clean public snapshot of the tracked files, refused while private data is found."""
import subprocess
import zipfile

import pytest

from packutil import build_registry  # noqa: F401  (puts tools/ on sys.path)

import export_public


def git_repo(path, files):
    path.mkdir()
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    for rel, text in files.items():
        p = path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(text if isinstance(text, bytes) else text.encode("utf-8"))
    subprocess.run(["git", "-C", str(path), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(path), "-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q",
                    "-m", "init"], check=True)
    return path


def test_only_committed_content_is_exported(tmp_path):
    repo = git_repo(tmp_path / "repo", {"web/_headers": "committed"})
    (repo / "web" / "_headers").write_text("half-done edit, not committed")
    dest = tmp_path / "dest"
    export_public.export(repo, dest, patterns=[], allow=[])
    assert (dest / "web" / "_headers").read_text() == "committed"


def test_exports_tracked_files_minus_internal_dirs_and_prunes(tmp_path):
    repo = git_repo(tmp_path / "repo", {
        "README.md": "hello", "helper/a.py": "x = 1\n", "docs/PACKS.md": "packs",
        "docs/superpowers/specs/s.md": "internal", "docs/packs/roadmap.md": "internal"})
    (repo / "untracked.txt").write_text("not in git")
    dest = tmp_path / "dest"
    (dest / ".git").mkdir(parents=True)
    (dest / ".git" / "keep").write_text("git dir stays")
    (dest / "old.txt").write_text("removed from the source since the last export")
    files = export_public.export(repo, dest, patterns=[], allow=[])
    assert sorted(files) == ["README.md", "docs/PACKS.md", "helper/a.py"]
    assert (dest / "helper" / "a.py").read_text() == "x = 1\n"
    assert not (dest / "docs" / "superpowers").exists() and not (dest / "untracked.txt").exists()
    assert not (dest / "old.txt").exists()
    assert (dest / ".git" / "keep").exists()


def test_private_hit_refuses_and_copies_nothing(tmp_path):
    repo = git_repo(tmp_path / "repo", {"README.md": "path C:/Users/someone/x", "b.md": "fine"})
    dest = tmp_path / "dest"
    with pytest.raises(export_public.PrivateData) as err:
        export_public.export(repo, dest, patterns=[r"c:/users/someone"], allow=[])
    assert err.value.hits[0][0] == "README.md"
    assert not dest.exists() or not any(dest.iterdir())


def test_allow_list_and_office_files_are_scanned(tmp_path):
    buf = tmp_path / "f.docx"
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", "<w:t>Dr Secretname</w:t>")
    repo = git_repo(tmp_path / "repo", {
        "packs/p/sources.md": "lu\u1eadn \u00e1n of a public author", "fixture.docx": buf.read_bytes()})
    patterns = [r"lu\u1eadn \u00e1n", r"secretname"]
    with pytest.raises(export_public.PrivateData) as err:
        export_public.export(repo, tmp_path / "d1", patterns=patterns, allow=[("packs/*/sources.md", r"lu\u1eadn \u00e1n")])
    assert [h[0] for h in err.value.hits] == ["fixture.docx!word/document.xml"]


def test_pattern_files_are_read_one_regex_per_line(tmp_path):
    pat = tmp_path / "patterns.txt"
    pat.write_text("# comment\n\nfoo\nbar baz\n", encoding="utf-8")
    allow = tmp_path / "allow.txt"
    allow.write_text("# glob<TAB>regex\npacks/*\tfoo\n", encoding="utf-8")
    assert export_public.read_patterns(pat) == ["foo", "bar baz"]
    assert export_public.read_allow(allow) == [("packs/*", "foo")]
