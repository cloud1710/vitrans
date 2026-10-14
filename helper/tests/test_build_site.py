"""tools/build_site.py: the Cloudflare Pages deploy folder = web/ of a commit minus the dev-only files (the static
output, kept at web/ so that the Functions' imports of ../web/engine/ resolve as in the repo) + the Pages Functions
(functions/ of the same commit, spec Amendment F) + a root wrangler config when there is one, scanned for private
data before anything is written. The page no longer needs a static /registry/: the Functions bundle the packs."""
import json
import subprocess

import pytest

from packutil import build_registry  # noqa: F401  (puts tools/ on sys.path)

import build_site


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo)] + list(args), check=True, capture_output=True).stdout


def commit_all(repo, message="change"):
    git(repo, "add", "-A")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q", "-m", message)
    return git(repo, "rev-parse", "HEAD").decode().strip()


def write(repo, files):
    for rel, text in files.items():
        p = repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(text if isinstance(text, bytes) else text.encode("utf-8"))


SITE_FILES = {
    "web/index.html": "<!doctype html><title>page</title>",
    "web/app.js": "console.log('app');\n",
    "web/_headers": "/*\n  X-Content-Type-Options: nosniff\n",
    "web/tests/advice.test.mjs": "test",
    "web/lab/core.js": "lab",
    "web/lab/tests/probe.test.mjs": "test",
    "web/engine/core.js": "export const core = 1;\n",
    "web/engine/tests/chrome.mjs": "test",
    "web/engine/tests/fixtures/doc.docx": b"PK\x03\x04 synthetic",
    "web/engine/node_modules/playwright-core/index.js": "dev only",
    "web/engine/package.json": "{}",
    "web/engine/package-lock.json": "{}",
    "web/engine/vendor/fflate-0.8.2/browser.js": "vendored",
    "packs/pathology/pack.json": json.dumps({"id": "pathology", "version": "0.1.8", "name": "P", "detect": []}),
    "helper/vitranslate/x.py": "not in the site\n",
    "private/corpus.txt": "never published\n",
}
WEB_EXPECTED = ["web/_headers", "web/app.js", "web/engine/core.js", "web/engine/vendor/fflate-0.8.2/browser.js",
                "web/index.html", "web/lab/core.js"]
FUNCTIONS = {
    "functions/api/v1/[[path]].js": "import { core } from \"../../../web/engine/core.js\";\nexport const onRequest = core;\n",
    "functions/_lib/http.js": "export const http = 1;\n",
    "functions/_lib/tests/http.test.mjs": "dev only",
    "functions/node_modules/x/index.js": "dev only",
    "wrangler.jsonc": "{ \"pages_build_output_dir\": \"./web\" }\n",
}


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    git(r, "init", "-q")
    write(r, SITE_FILES)
    commit_all(r, "init")
    return r


def files_under(root):
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file())


def test_the_static_output_is_web_of_the_commit_minus_tests_node_modules_and_package_files(repo, tmp_path):
    (repo / "web" / "app.js").write_text("half-done edit, not committed")
    (repo / "web" / "untracked.js").write_text("not in git")
    out = tmp_path / "site"
    summary = build_site.build(repo, out, patterns=[], allow=[])
    assert files_under(out) == WEB_EXPECTED  # no functions at this commit yet, no registry
    assert (out / "web" / "app.js").read_text() == "console.log('app');\n"  # the commit, not the working tree
    assert summary["web_files"] == len(WEB_EXPECTED) and summary["excluded"] == 7
    assert summary["functions_files"] == 0 and summary["config"] == []


def test_the_pages_functions_and_the_wrangler_config_of_the_same_commit_go_along(repo, tmp_path):
    write(repo, FUNCTIONS)
    commit_all(repo, "functions")
    out = tmp_path / "site"
    summary = build_site.build(repo, out, patterns=[], allow=[])
    assert files_under(out) == sorted(WEB_EXPECTED + ["functions/_generated/packs.json", "functions/_lib/http.js",
                                                      "functions/api/v1/[[path]].js", "wrangler.jsonc"])
    # the Functions' relative imports of the shared core resolve in the deploy folder as in the repo
    fn = (out / "functions" / "api" / "v1" / "[[path]].js").read_text()
    target = (out / "functions" / "api" / "v1" / "../../../web/engine/core.js").resolve()
    assert "../../../web/engine/core.js" in fn and target.is_file()
    assert summary["functions_files"] == 2 and summary["config"] == ["wrangler.jsonc"]
    assert summary["excluded"] == 9


PACK_FILES = {
    "packs/_style/pack.json": json.dumps({"id": "_style", "version": "0.1.2", "name": "Style", "detect": []}),
    "packs/_style/prompt.md": "Style rules\n",
    "packs/pathology/glossary.csv": "en,vi,note\nbiopsy,sinh thiet,\ntumour,u,\n",
    "packs/pathology/prompt.md": "Pathology voice\n",
    "packs/drafty/pack.json": json.dumps({"id": "drafty", "version": "0.1.0", "name": "D", "detect": [], "draft": True}),
}


def test_the_functions_get_the_pack_bundle_of_the_same_commit(repo, tmp_path):
    write(repo, dict(FUNCTIONS, **PACK_FILES))
    sha = commit_all(repo, "functions + packs")
    out = tmp_path / "site"
    summary = build_site.build(repo, out, patterns=[], allow=[])
    bundle_path = out / "functions" / "_generated" / "packs.json"
    bundle = json.loads(bundle_path.read_text(encoding="ascii"))
    assert bundle["format"] == 1 and bundle["source"] == "commit " + sha
    assert [p["id"] for p in bundle["manifest"]["packs"]] == ["pathology"]  # the draft stays out
    assert "_style/prompt.md" in bundle["files"] and "pathology@0.1.8/glossary.csv" in bundle["files"]
    assert summary["bundle"] == ["pathology 0.1.8"]
    # byte for byte what tools/bundle_packs.py writes for the same commit (its own CLI)
    import bundle_packs
    ref = tmp_path / "ref.json"
    assert bundle_packs.main(["--out", str(ref), "--commit", sha, "--patterns", "", "--repo", str(repo)]) == 0
    assert bundle_path.read_bytes() == ref.read_bytes()


def test_no_functions_no_bundle_and_a_private_hit_in_a_pack_refuses(repo, tmp_path):
    write(repo, PACK_FILES)
    commit_all(repo)
    out = tmp_path / "plain"
    assert build_site.build(repo, out, patterns=[], allow=[])["bundle"] == []
    assert not (out / "functions").exists()
    write(repo, dict(FUNCTIONS, **{"packs/pathology/prompt.md": "Voice of Dr Secretname\n"}))
    commit_all(repo)
    with pytest.raises(build_site.PrivateData) as err:
        build_site.build(repo, tmp_path / "site", patterns=["secretname"], allow=[])
    assert [h[0] for h in err.value.hits] == ["packs/pathology/prompt.md"]
    assert not (tmp_path / "site").exists() or not any((tmp_path / "site").iterdir())


def test_committed_bytes_are_published_whatever_the_line_end_settings(repo, tmp_path):
    # git archive would apply core.autocrlf (CRLF on Windows); the site must carry the committed LF bytes
    write(repo, FUNCTIONS)
    commit_all(repo)
    git(repo, "config", "core.autocrlf", "true")
    out = tmp_path / "site"
    build_site.build(repo, out, patterns=[], allow=[])
    assert b"\r" not in (out / "web" / "app.js").read_bytes()
    assert b"\r" not in (out / "functions" / "_lib" / "http.js").read_bytes()


def test_commit_option_builds_an_older_commit(repo, tmp_path):
    first = git(repo, "rev-parse", "HEAD").decode().strip()
    write(repo, dict(FUNCTIONS, **{"web/app.js": "console.log('v2');\n"}))
    commit_all(repo, "v2")
    old = tmp_path / "old"
    build_site.build(repo, old, commit=first, patterns=[], allow=[])
    assert (old / "web" / "app.js").read_text() == "console.log('app');\n" and not (old / "functions").exists()
    new = tmp_path / "new"
    build_site.build(repo, new, patterns=[], allow=[])
    assert (new / "web" / "app.js").read_text() == "console.log('v2');\n" and (new / "functions").is_dir()


def test_worktree_mode_takes_the_working_files_for_local_test_runs(repo, tmp_path):
    (repo / "web" / "app.js").write_text("uncommitted")
    write(repo, {"functions/_lib/http.js": "uncommitted function\n"})
    out = tmp_path / "site"
    build_site.build(repo, out, worktree=True, patterns=[], allow=[])
    assert (out / "web" / "app.js").read_text() == "uncommitted"
    assert (out / "functions" / "_lib" / "http.js").read_text() == "uncommitted function\n"
    assert not (out / "web" / "engine" / "node_modules").exists() and not (out / "web" / "tests").exists()


def test_a_private_hit_refuses_and_writes_nothing(repo, tmp_path):
    write(repo, {"web/app.js": "// written by Dr Secretname\n"})
    commit_all(repo)
    out = tmp_path / "site"
    with pytest.raises(build_site.PrivateData) as err:
        build_site.build(repo, out, patterns=["secretname", "c:/users/someone"], allow=[])
    assert err.value.hits[0][0] == "web/app.js" and err.value.hits[0][2] == "Secretname"
    assert not out.exists() or not any(out.iterdir())


def test_the_scan_covers_the_functions_and_honours_the_allow_list(repo, tmp_path):
    write(repo, dict(FUNCTIONS, **{"functions/_lib/config.js": "// case 7 of Dr Secretname\n"}))
    commit_all(repo)
    with pytest.raises(build_site.PrivateData) as err:
        build_site.build(repo, tmp_path / "a", patterns=["secretname"], allow=[])
    assert [h[0] for h in err.value.hits] == ["functions/_lib/config.js"]
    # the allow-list globs name repo paths, as for tools/export_public.py
    build_site.build(repo, tmp_path / "b", patterns=["secretname"], allow=[("functions/_lib/*", "secretname")])
    assert (tmp_path / "b" / "functions" / "_lib" / "config.js").is_file()


def test_out_dir_must_be_new_or_empty(repo, tmp_path):
    out = tmp_path / "site"
    out.mkdir()
    (out / "keep.txt").write_text("someone's file")
    with pytest.raises(ValueError):
        build_site.build(repo, out, patterns=[], allow=[])
    assert files_under(out) == ["keep.txt"]


def test_cli_prints_an_ascii_summary_and_exits_1_on_a_hit(repo, tmp_path, capsys):
    pat = tmp_path / "patterns.txt"
    pat.write_text("# comment\nnothing-matches-this\n", encoding="utf-8")
    assert build_site.main([str(tmp_path / "site"), "--repo", str(repo), "--patterns", str(pat)]) == 0
    text = capsys.readouterr().out
    assert text.isascii() and "web: 6 files" in text and "functions: none at this commit" in text and "clean" in text
    assert "wrangler pages deploy web" in text
    pat.write_text("console\n", encoding="utf-8")
    assert build_site.main([str(tmp_path / "site2"), "--repo", str(repo), "--patterns", str(pat)]) == 1
    text = capsys.readouterr().out
    assert text.isascii() and "REFUSED" in text and not (tmp_path / "site2").exists()
