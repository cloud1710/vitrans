"""pack.json "include": ["_shared/<name>"] (K6): shared rows resolved at build time and when loading a source dir."""
import csv
import io
import json
import zipfile

import pytest

from packutil import REAL_PACKS, build, make_pack
from vitranslate.packs import load_pack

SHARED_NAMES = ("clinical_core", "specimen_context", "binding_core")


def shared(root, name, rows, fixes=None):
    d = root / "_shared"
    d.mkdir(parents=True, exist_ok=True)
    lines = ["en,vi,note"] + ['"%s","%s",' % (en, vi) for en, vi in rows]
    (d / (name + ".csv")).write_text("\n".join(lines) + "\n", encoding="utf-8")
    if fixes is not None:
        (d / (name + ".rules.json")).write_text(json.dumps({"term_fixes": fixes}), encoding="utf-8")


def with_include(root):
    shared(root, "core", [("patient", "benh nhan"), ("biopsy", "sinh thiet (shared)")],
           [{"en": "patient", "vi": "benh nhan", "wrong": ["nguoi benh"]}])
    make_pack(root, "alpha", detect=["tumor"], glossary=[("tumor", "u"), ("biopsy", "sinh thiet")],
              include=["_shared/core"])
    return root


def test_load_pack_from_a_source_dir_expands_the_includes(tmp_path):
    p = load_pack(with_include(tmp_path), "alpha")
    # own rows first; an included key the pack already has is skipped (the validator reports it)
    assert [g[:2] for g in p.glossary] == [("tumor", "u"), ("biopsy", "sinh thiet"), ("patient", "benh nhan")]
    assert [(f.en, f.vi, f.wrong) for f in p.term_fixes] == [("patient", "benh nhan", ["nguoi benh"])]
    assert load_pack(tmp_path / "alpha").glossary == p.glossary  # the pack-directory form resolves them too


@pytest.mark.parametrize("name", ["_shared/missing", "../alpha", "other/core", "_shared/../x", 3])
def test_bad_or_missing_include_fails_loud(tmp_path, name):
    make_pack(tmp_path, "alpha", detect=["tumor"], include=[name])
    with pytest.raises(ValueError, match="alpha.*include"):
        load_pack(tmp_path, "alpha")


def test_bad_include_stops_the_build_with_a_message(tmp_path):
    make_pack(tmp_path / "packs", "alpha", detect=["tumor"], include=["_shared/missing"])
    with pytest.raises(SystemExit, match="alpha.*_shared/missing"):
        build(tmp_path / "packs", tmp_path / "reg")


def read_zip(path):
    with zipfile.ZipFile(path) as z:
        return {n: z.read(n) for n in z.namelist()}


def test_registry_zip_carries_the_expanded_glossary_and_rules(tmp_path):
    src = with_include(tmp_path / "packs")
    m = build(src, tmp_path / "r1")
    build(src, tmp_path / "r2")
    files = read_zip(tmp_path / "r1" / "alpha-1.0.0.zip")
    assert files == read_zip(tmp_path / "r2" / "alpha-1.0.0.zip")  # deterministic
    assert (tmp_path / "r1" / "alpha-1.0.0.zip").read_bytes() == (tmp_path / "r2" / "alpha-1.0.0.zip").read_bytes()
    rows = list(csv.reader(io.StringIO(files["glossary.csv"].decode("utf-8"))))
    assert rows == [["en", "vi", "note"], ["tumor", "u", ""], ["biopsy", "sinh thiet", ""], ["patient", "benh nhan", ""]]
    assert json.loads(files["rules.json"])["term_fixes"] == [{"en": "patient", "vi": "benh nhan", "wrong": ["nguoi benh"]}]
    meta = json.loads(files["pack.json"])
    assert "include" not in meta and meta["included"] == ["_shared/core"]  # nothing left to resolve at runtime
    assert "patient" in m["packs"][0]["profile"]  # included rows count for matching
    unpacked = tmp_path / "unpacked" / "alpha@1.0.0"
    unpacked.mkdir(parents=True)
    for name, data in files.items():
        (unpacked / name).write_bytes(data)
    assert load_pack(unpacked).glossary == load_pack(src, "alpha").glossary


def test_pack_without_include_is_zipped_byte_for_byte(tmp_path):
    src = with_include(tmp_path / "packs")
    make_pack(src, "beta", detect=["lobular"], glossary=[("lobular", "tieu thuy")])
    build(src, tmp_path / "reg")
    files = read_zip(tmp_path / "reg" / "beta-1.0.0.zip")
    for name in ("pack.json", "glossary.csv", "prompt.md"):
        assert files[name] == (src / "beta" / name).read_bytes(), name


def test_real_shared_files_are_header_only_and_unused():
    for name in SHARED_NAMES:
        path = REAL_PACKS / "_shared" / (name + ".csv")
        assert path.read_text(encoding="utf-8").splitlines() == ["en,vi,note"], name
    for d in REAL_PACKS.iterdir():
        if (d / "pack.json").is_file():
            assert "include" not in json.loads((d / "pack.json").read_text(encoding="utf-8")), d.name


def test_real_shared_file_can_be_included(tmp_path):
    import shutil
    shutil.copytree(REAL_PACKS / "_shared", tmp_path / "_shared")
    make_pack(tmp_path, "alpha", detect=["tumor"], glossary=[("tumor", "u")],
              include=["_shared/" + n for n in SHARED_NAMES])
    assert [g[:2] for g in load_pack(tmp_path, "alpha").glossary] == [("tumor", "u")]
    build(tmp_path, tmp_path / "reg")
