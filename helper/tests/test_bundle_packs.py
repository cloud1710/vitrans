"""tools/bundle_packs.py: the non-draft packs of a commit, as the registry ships them (tools/build_registry.py zips,
includes expanded), bundled into the JSON module the Pages Functions import -- {"format": 1, "source", "manifest",
"files": {"<id>@<version>/<file>": base64}} plus the writing-style pack under "_style/<file>" -- after the same
private-data scan as tools/build_site.py."""
import base64
import json
import subprocess
import zipfile

from packutil import build_registry  # noqa: F401  (puts tools/ on sys.path)

import bundle_packs


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo)] + list(args), check=True, capture_output=True).stdout


def commit_all(repo, message="change"):
    git(repo, "add", "-A")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q", "-m", message)
    return git(repo, "rev-parse", "HEAD").decode().strip()


def write(root, files):
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(text if isinstance(text, bytes) else text.encode("utf-8"))


def pack_json(pid, version, **extra):
    return json.dumps(dict({"id": pid, "version": version, "name": pid.title(), "detect": ["biopsy"]}, **extra))


PACKS = {
    "packs/_style/pack.json": pack_json("_style", "0.1.2", detect=[]),
    "packs/_style/prompt.md": "Quy tắc hành văn\n",
    "packs/_shared/core.csv": "en,vi,note\nmargin,diện cắt,\n",
    "packs/alpha/pack.json": pack_json("alpha", "1.0.0", include=["_shared/core"]),
    "packs/alpha/prompt.md": "Alpha prompt\n",
    "packs/alpha/glossary.csv": "en,vi,note\nbiopsy,sinh thiết,\ntumour,u,\n",
    "packs/alpha/rules.json": json.dumps({"term_fixes": [{"en": "tumour", "vi": "u", "wrong": ["bướu"]}]}),
    "packs/alpha/tests.jsonl": "{\"en\": \"biopsy\", \"must\": [\"sinh thiết\"]}\n",
    "packs/alpha/sources.md": "Sources\n",
    "packs/beta/pack.json": pack_json("beta", "0.3.1", parent="alpha"),
    "packs/beta/glossary.csv": b"\xef\xbb\xbfen,vi,note\r\nlobular,ti\xe1\xbb\x83u th\xc3\xb9y,\r\n",  # BOM + CRLF
    "packs/drafty/pack.json": pack_json("drafty", "0.1.0", draft=True),
    "packs/drafty/glossary.csv": "en,vi,note\nbiopsy,sinh thiết,\n",
}


def b64(data):
    return base64.b64encode(data).decode("ascii")


def test_the_bundle_holds_the_registry_files_of_the_non_draft_packs_and_the_style_pack(tmp_path):
    write(tmp_path, PACKS)
    bundle = bundle_packs.build_bundle(tmp_path / "packs", source="test")
    reg = tmp_path / "registry"
    manifest = build_registry.build(tmp_path / "packs", reg)
    assert bundle["format"] == 1 and bundle["source"] == "test"
    assert bundle["manifest"] == manifest
    assert [e["id"] for e in manifest["packs"]] == ["alpha", "beta"]  # the draft is not bundled
    expected = {"_style/pack.json": (tmp_path / "packs/_style/pack.json").read_bytes(),
                "_style/prompt.md": (tmp_path / "packs/_style/prompt.md").read_bytes()}
    for e in manifest["packs"]:
        with zipfile.ZipFile(reg / e["file"]) as z:
            for name in z.namelist():
                if name in ("pack.json", "prompt.md", "glossary.csv", "rules.json"):
                    expected["%s@%s/%s" % (e["id"], e["version"], name)] = z.read(name)
    assert bundle["files"] == {k: b64(v) for k, v in expected.items()}
    assert sorted(bundle["files"]) == ["_style/pack.json", "_style/prompt.md", "alpha@1.0.0/glossary.csv",
                                       "alpha@1.0.0/pack.json", "alpha@1.0.0/prompt.md", "alpha@1.0.0/rules.json",
                                       "beta@0.3.1/glossary.csv", "beta@0.3.1/pack.json"]
    # includes come expanded (the Functions resolve nothing); a file without includes keeps its bytes (BOM, CRLF)
    glossary = base64.b64decode(bundle["files"]["alpha@1.0.0/glossary.csv"]).decode("utf-8")
    assert "margin,diện cắt" in glossary
    assert json.loads(base64.b64decode(bundle["files"]["alpha@1.0.0/pack.json"]))["included"] == ["_shared/core"]
    assert base64.b64decode(bundle["files"]["beta@0.3.1/glossary.csv"]) == PACKS["packs/beta/glossary.csv"]


def repo_with_packs(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q")
    write(repo, PACKS)
    write(repo, {"functions/_lib/http.js": "export const x = 1;\n"})
    return repo, commit_all(repo, "packs")


def test_the_cli_bundles_a_commit_as_ascii_json_deterministically(tmp_path, capsys):
    repo, sha = repo_with_packs(tmp_path)
    (repo / "packs" / "alpha" / "prompt.md").write_bytes(b"uncommitted\n")
    out = tmp_path / "site" / "functions" / "_generated" / "packs.json"
    assert bundle_packs.main(["--out", str(out), "--repo", str(repo), "--patterns", ""]) == 0
    raw = out.read_bytes()
    assert raw.isascii() and raw.endswith(b"\n")
    data = json.loads(raw)
    assert data["source"] == "commit " + sha
    assert base64.b64decode(data["files"]["alpha@1.0.0/prompt.md"]) == b"Alpha prompt\n"  # the commit's bytes
    printed = capsys.readouterr().out
    assert printed.isascii() and "alpha 1.0.0" in printed and "beta 0.3.1" in printed and "drafty" in printed
    assert [p.name for p in out.parent.iterdir()] == ["packs.json"]  # written in one step, no temp file left
    assert bundle_packs.main(["--out", str(out), "--repo", str(repo), "--patterns", ""]) == 0
    assert out.read_bytes() == raw
    assert bundle_packs.main(["--out", str(out), "--repo", str(repo), "--worktree", "--patterns", ""]) == 0
    wt = json.loads(out.read_bytes())
    assert wt["source"] == "working tree" and base64.b64decode(wt["files"]["alpha@1.0.0/prompt.md"]) == b"uncommitted\n"


def test_a_private_hit_in_a_pack_refuses_and_writes_nothing(tmp_path, capsys):
    repo, _ = repo_with_packs(tmp_path)
    write(repo, {"packs/alpha/prompt.md": "Reviewed by Dr Secretname\n"})
    commit_all(repo)
    patterns = tmp_path / "patterns.txt"
    patterns.write_text("secretname\n", encoding="utf-8")
    out = tmp_path / "out" / "packs.json"
    assert bundle_packs.main(["--out", str(out), "--repo", str(repo), "--patterns", str(patterns)]) == 1
    assert not out.exists()
    assert "packs/alpha/prompt.md" in capsys.readouterr().out
    allow = tmp_path / "allow.txt"
    allow.write_text("packs/alpha/prompt.md\tSecretname\n", encoding="utf-8")
    assert bundle_packs.main(["--out", str(out), "--repo", str(repo), "--patterns", str(patterns),
                              "--allow", str(allow)]) == 0
    assert out.is_file()


def test_the_patterns_file_is_required_unless_scanning_is_turned_off_explicitly(tmp_path, capsys):
    repo, _ = repo_with_packs(tmp_path)
    out = tmp_path / "out" / "packs.json"
    assert bundle_packs.main(["--out", str(out), "--repo", str(repo)]) == 2  # <repo>/private/... does not exist
    assert "REFUSED" in capsys.readouterr().out and not out.exists()
