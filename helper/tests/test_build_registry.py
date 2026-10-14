import hashlib
import json
import math
import zipfile

import pytest

from packutil import build, build_registry, make_pack


def two_packs(root):
    make_pack(root, "alpha", detect=["Tumor", "IHC"], glossary=[("Biopsy", "sinh thi\u1ebft"), ("tumor", "u"),
                                                                  ("lymph node", "h\u1ea1ch")])
    make_pack(root, "beta", detect=["lobular"], glossary=[("biopsy", "sinh thi\u1ebft")], version="2.1.0",
              parent="alpha")
    (root / "alpha" / "tests.jsonl").write_text('{"src": "a", "must": ["b"]}\n', encoding="utf-8")
    style = root / "_style"
    style.mkdir()
    (style / "pack.json").write_text('{"id": "_style", "version": "0.1.0"}', encoding="utf-8")
    (root / "notapack").mkdir()
    return root


def test_build_is_deterministic(tmp_path):
    src = two_packs(tmp_path / "packs")
    build(src, tmp_path / "r1")
    build(src, tmp_path / "r2")
    build(src, tmp_path / "r2")  # rebuilding into the same folder changes nothing
    names = sorted(p.name for p in (tmp_path / "r1").iterdir())
    assert names == ["alpha-1.0.0.zip", "beta-2.1.0.zip", "manifest.json"]
    for name in names:
        assert (tmp_path / "r1" / name).read_bytes() == (tmp_path / "r2" / name).read_bytes(), name
    with zipfile.ZipFile(tmp_path / "r1" / "alpha-1.0.0.zip") as z:
        infos = z.infolist()
    assert [i.filename for i in infos] == ["glossary.csv", "pack.json", "prompt.md", "tests.jsonl"]
    assert all(i.date_time == (1980, 1, 1, 0, 0, 0) and i.compress_type == zipfile.ZIP_DEFLATED for i in infos)


def test_manifest_entries_hashes_and_profiles(tmp_path):
    src = two_packs(tmp_path / "packs")
    build(src, tmp_path / "reg")
    raw = (tmp_path / "reg" / "manifest.json").read_bytes()
    m = json.loads(raw.decode("utf-8"))
    assert m["format"] == 1 and [e["id"] for e in m["packs"]] == ["alpha", "beta"]
    alpha, beta = m["packs"]
    data = (tmp_path / "reg" / "alpha-1.0.0.zip").read_bytes()
    assert alpha["file"] == "alpha-1.0.0.zip" and alpha["sha256"] == hashlib.sha256(data).hexdigest()
    assert alpha["size"] == len(data) and alpha["version"] == "1.0.0" and alpha["name"] == "Alpha"
    assert alpha["parent"] is None and beta["parent"] == "alpha"
    idf_one = math.log(3 / 2) + 1  # N = 2 packs, term in one pack
    assert m["idf"]["biopsy"] == pytest.approx(1.0)  # in both packs: ln(3/3) + 1
    assert m["idf"]["tumor"] == pytest.approx(idf_one)
    # detect keywords weigh 2 (also when the glossary has them), glossary terms 1; keys lower-cased
    assert alpha["profile"]["tumor"] == pytest.approx(2 * idf_one)
    assert alpha["profile"]["ihc"] == pytest.approx(2 * idf_one)
    assert alpha["profile"]["lymph node"] == pytest.approx(idf_one)
    assert alpha["profile"]["biopsy"] == pytest.approx(1.0)
    assert beta["profile"] == {"biopsy": pytest.approx(1.0), "lobular": pytest.approx(2 * idf_one)}
    assert list(m) == sorted(m) and list(alpha) == sorted(alpha)  # sorted keys
    assert alpha["detect"] == ["ihc", "tumor"] and beta["detect"] == ["lobular"]  # normalised, for the detect gate


@pytest.mark.parametrize("version", ["1.0", "1.0.0-beta", "v1.0.0", "01.a.0"])
def test_version_must_be_major_minor_patch(tmp_path, version):
    make_pack(tmp_path / "packs", "alpha", detect=["tumor"], version=version)
    with pytest.raises(SystemExit, match="version"):
        build(tmp_path / "packs", tmp_path / "reg")


def test_common_english_detect_words_are_warned_about(tmp_path, capsys):
    make_pack(tmp_path / "packs", "alpha", detect=["Staining", "tumor", "Grade", "lymph node"])
    build_registry.main([str(tmp_path / "packs"), str(tmp_path / "reg")])  # a warning, not a failure
    warnings = [line for line in capsys.readouterr().out.splitlines() if line.startswith("WARNING")]
    assert len(warnings) == 2 and "staining" in warnings[0] + warnings[1] and "grade" in warnings[0] + warnings[1]
    assert all("alpha" in w for w in warnings)
    m = json.loads((tmp_path / "reg" / "manifest.json").read_text(encoding="utf-8"))
    assert m["packs"][0]["detect"] == ["grade", "lymph node", "staining", "tumor"]


def test_real_pathology_detect_list_has_no_common_words(capsys):
    from packutil import REAL_PACKS
    meta = json.loads((REAL_PACKS / "pathology" / "pack.json").read_text(encoding="utf-8"))
    assert not {build_registry._norm(k) for k in meta["detect"]} & build_registry.COMMON_WORDS


def test_drafts_are_skipped_unless_asked(tmp_path, capsys):
    src = two_packs(tmp_path / "packs")
    make_pack(src, "gamma", detect=["mammography"], draft=True)
    build_registry.main([str(src), str(tmp_path / "reg")])
    out = capsys.readouterr().out
    m = json.loads((tmp_path / "reg" / "manifest.json").read_text(encoding="utf-8"))
    assert [e["id"] for e in m["packs"]] == ["alpha", "beta"]
    assert not (tmp_path / "reg" / "gamma-1.0.0.zip").exists()
    assert out.isascii() and "alpha" in out and "gamma" in out  # the skipped draft is named
    build_registry.main([str(src), str(tmp_path / "reg2"), "--include-drafts"])
    m = json.loads((tmp_path / "reg2" / "manifest.json").read_text(encoding="utf-8"))
    assert [e["id"] for e in m["packs"]] == ["alpha", "beta", "gamma"]


def test_real_pathology_pack_builds(tmp_path):
    from packutil import copy_real
    src = copy_real(tmp_path / "packs", "pathology")
    build(src, tmp_path / "reg")
    m = json.loads((tmp_path / "reg" / "manifest.json").read_text(encoding="utf-8"))
    (entry,) = m["packs"]
    assert entry["id"] == "pathology" and len(entry["profile"]) > 400
    assert entry["profile"]["meningioma"] == pytest.approx(2.0)  # one pack: idf = 1
    with zipfile.ZipFile(tmp_path / "reg" / entry["file"]) as z:
        assert set(z.namelist()) == {"pack.json", "prompt.md", "glossary.csv", "rules.json", "tests.jsonl"}
