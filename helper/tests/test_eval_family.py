"""tools/eval_pack.py --family (K9): a child pack is evaluated merged with its parent chain, child first."""
import json

import pytest

from packutil import build, make_pack

import _common  # tools/ is on sys.path through packutil
import eval_pack


def family(root):
    make_pack(root, "path", detect=["tumor"], glossary=[("tumor", "u"), ("cribriform", "dang sang")])
    (root / "path" / "tests.jsonl").write_text('{"src": "A tumor.", "must": ["u"]}\n', encoding="utf-8")
    (root / "path" / "rules.json").write_text(json.dumps({"term_fixes": [
        {"en": "tumor", "vi": "u", "wrong": ["khoi u"]}]}), encoding="utf-8")
    make_pack(root, "path-breast", parent="path", detect=["breast"],
              glossary=[("breast", "vu"), ("cribriform", "mat sang")])
    (root / "path-breast" / "tests.jsonl").write_text('{"src": "Cribriform.", "must": ["mat sang"]}\n',
                                                      encoding="utf-8")
    return root


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """A fake repo root for tools/_common: packs/ with a root + child, no registry."""
    family(tmp_path / "packs")
    monkeypatch.setattr(_common, "ROOT", tmp_path)
    return tmp_path


def check_family(pack):
    g = {en: vi for en, vi, _ in pack.glossary}
    assert pack.id == "path-breast+path"
    assert g["cribriform"] == "mat sang" and g["tumor"] == "u" and g["breast"] == "vu"  # the child row wins
    assert [f.en for f in pack.term_fixes] == ["tumor"]  # the parent fix is in force
    assert [t["src"] for t in pack.tests] == ["Cribriform.", "A tumor."]


def test_family_from_the_packs_folder(repo):
    pack, source = _common.load_domain_pack("path-breast", from_dir=True, family=True)
    check_family(pack)
    assert source == "dir packs/path-breast + dir packs/path"


def test_family_from_the_registry(repo, monkeypatch):
    build(repo / "packs", repo / "registry")
    monkeypatch.setenv("VITRANSLATE_REGISTRY", str(repo / "registry"))
    pack, source = _common.load_domain_pack("path-breast", family=True)
    check_family(pack)
    child_src, parent_src = source.split(" + ")
    assert child_src.startswith("registry ") and parent_src.startswith("registry ") and child_src.endswith("(1.0.0)")


def test_without_family_or_for_a_root_the_pack_stays_alone(repo):
    assert _common.load_domain_pack("path-breast", from_dir=True)[0].id == "path-breast"
    assert _common.load_domain_pack("path", from_dir=True, family=True)[0].id == "path"


def test_eval_pack_family_flag(repo, capsys):
    assert eval_pack.main(["path-breast", "--fake", "--family", "--dir", "--device", "cpu"]) == 0
    out = capsys.readouterr().out
    assert out.isascii() and "family" in out and "/2" in out  # child + parent tests
    assert (repo / "out" / "eval_pack_path-breast_family_fake.json").is_file()
    assert "model qwen3.5:9b" in out  # no model named: the default of the device (CPU: Qwen 3.5 9B)


def test_eval_pack_default_model_follows_the_device(repo, capsys):
    assert eval_pack.main(["path", "--fake", "--dir", "--device", "gpu"]) == 0
    assert "model gemma4:e4b" in capsys.readouterr().out
    assert eval_pack.main(["path", "gemma4:e2b", "--fake", "--dir", "--device", "gpu"]) == 0
    assert "model gemma4:e2b" in capsys.readouterr().out
