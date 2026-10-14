"""tools/check_packs.py (K2): ownership rule and pack validator."""
import json

from packutil import REAL_PACKS, build_registry, make_pack
from vitranslate.config import REPO_ROOT

import check_packs  # tools/ is on sys.path through packutil

DECOMPOSED = "e" + chr(0x301)  # "e" + combining acute: not NFC


def findings(root, **kw):
    return check_packs.check(root, **kw)


def of(fs, level=None, check=None):
    return [f for f in fs if (level is None or f.level == level) and (check is None or f.check == check)]


def rules(d, fixes):
    (d / "rules.json").write_text(json.dumps({"term_fixes": fixes}), encoding="utf-8")


def family(root):
    make_pack(root, "path", detect=["tumor"], glossary=[("tumor", "u"), ("cribriform", "dang sang"),
                                                        ("biopsy", "sinh thiet")])
    make_pack(root, "path-breast", parent="path", detect=["breast"],
              glossary=[("breast", "vu"), ("cribriform", "mat sang"), ("biopsy", "sinh thiet")])
    return root


def test_clean_family_child_override_is_info_only(tmp_path):
    fs = findings(family(tmp_path))
    assert of(fs, "ERROR") == [] and of(fs, "WARNING") == []
    (info,) = of(fs, "INFO", "override")
    assert (info.pack, info.key) == ("path-breast", "cribriform") and "path" in info.message


def test_siblings_must_agree(tmp_path):
    family(tmp_path)
    make_pack(tmp_path, "path-gi", parent="path", detect=["colon"], glossary=[("cribriform", "hinh sang")])
    (e,) = of(findings(tmp_path), "ERROR")
    assert e.check == "cross_pack" and e.key == "cribriform" and "path-breast" in e.message + e.pack


def test_child_may_only_override_its_own_parent(tmp_path):
    family(tmp_path)
    make_pack(tmp_path, "radiology", detect=["ct"], glossary=[("breast", "tuyen vu"), ("biopsy", "sinh thiet")])
    (e,) = of(findings(tmp_path), "ERROR")
    assert e.check == "cross_pack" and e.key == "breast"


def test_keys_are_normalised_case_hyphen_plural(tmp_path):
    make_pack(tmp_path, "a", detect=["x"], glossary=[("Lymph-Nodes", "hach")])
    make_pack(tmp_path, "b", detect=["y"], glossary=[("lymph node", "hach bach huyet")])
    make_pack(tmp_path, "c", detect=["z"], glossary=[("biopsies", "sinh thiet")])
    make_pack(tmp_path, "d", detect=["w"], glossary=[("Biopsy", "Sinh  thiet")])  # same value: case / spacing
    (e,) = of(findings(tmp_path), "ERROR")
    assert e.check == "cross_pack" and e.key == "lymph node"
    assert check_packs.norm_key("Lymph-Nodes") == check_packs.norm_key("lymph  node") == "lymph node"
    assert check_packs.norm_key("biopsies") == "biopsy" and check_packs.norm_key("processes") == "process"
    assert check_packs.norm_key("status") == "status" and check_packs.norm_key("axis") == "axis"


def test_parenthesis_keys_warn_and_error_with_the_flag(tmp_path):
    make_pack(tmp_path, "a", detect=["x"], glossary=[("rearrangement (gene)", "tai sap xep gen")])
    assert [f.key for f in of(findings(tmp_path), "WARNING", "paren_key")] == ["rearrangement (gene)"]
    assert [f.key for f in of(findings(tmp_path, parens_error=True), "ERROR", "paren_key")] == ["rearrangement (gene)"]


def test_csv_nfc_and_split_keys(tmp_path):
    d = make_pack(tmp_path, "a", detect=["x"], glossary=[("cafe", "c" + DECOMPOSED), ("A / B", "a")])
    with (d / "glossary.csv").open("a", encoding="utf-8") as f:
        f.write('"empty",,\n"x","y","z","extra"\n')
    fs = of(findings(tmp_path), "ERROR")
    assert sorted(f.check for f in fs) == ["csv", "csv", "nfc", "split_key"]
    (d / "glossary.csv").write_text("english,vietnamese\nx,y\n", encoding="utf-8")
    assert [f.check for f in of(findings(tmp_path), "ERROR")] == ["csv"]


def test_duplicate_keys_inside_a_pack(tmp_path):
    make_pack(tmp_path, "a", detect=["x"], glossary=[("tumor", "u"), ("tumors", "u"), ("node", "hach"),
                                                     ("Node", "nut")])
    fs = findings(tmp_path)
    assert [(f.level, f.key) for f in of(fs, check="duplicate_key")] == [("ERROR", "node"), ("WARNING", "tumor")]


def shared(root, name, rows):
    (root / "_shared").mkdir(exist_ok=True)
    lines = ["en,vi,note"] + ['"%s","%s",' % r for r in rows]
    (root / "_shared" / (name + ".csv")).write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_includes_shared_rows_and_overrides(tmp_path):
    shared(tmp_path, "binding_core", [("carcinoma", "ung thu bieu mo"), ("lymphoma", "u lympho")])
    make_pack(tmp_path, "a", detect=["x"], glossary=[("lymphoma", "lymphom")], include=["_shared/binding_core"])
    make_pack(tmp_path, "b", detect=["y"], glossary=[], include=["_shared/binding_core"])
    fs = findings(tmp_path)
    # both packs carry "carcinoma" from the include: no conflict; a's own lymphoma row overrides the include (the
    # cause), so a and b now disagree on it (the effect)
    assert sorted((f.check, f.pack, f.key) for f in of(fs, "ERROR")) == [
        ("cross_pack", "a", "lymphoma"), ("include_override", "a", "lymphoma")]
    make_pack(tmp_path, "c", detect=["z"], include=["_shared/missing"])
    assert any(f.check == "include" and f.pack == "c" for f in of(findings(tmp_path), "ERROR"))


def test_term_fix_checks(tmp_path):
    d = make_pack(tmp_path, "a", detect=["x"], glossary=[("squamous cell carcinoma", "carcinom te bao gai"),
                                                         ("lung", "phoi")])
    rules(d, [{"en": "carcinoma", "vi": "ung thu bieu mo", "wrong": ["carcinom"]},  # rewrites the SCC canonical
              {"en": "lung", "vi": "la phoi", "wrong": ["phoi"]},                   # disagrees with its own row
              {"en": "x", "vi": "y", "wrong": ["(oops"]}])
    fs = of(findings(tmp_path), "ERROR")
    assert sorted((f.check, f.key) for f in fs) == [("fix_rewrites_canonical", "squamous cell carcinoma"),
                                                    ("fix_vs_glossary", "lung"), ("rules", "x")]


def test_term_fix_against_another_family(tmp_path):
    d = make_pack(tmp_path, "a", detect=["x"], glossary=[])
    rules(d, [{"en": "frozen section", "vi": "sinh thiet tuc thi", "wrong": ["lat cat lanh"]}])
    make_pack(tmp_path, "b", detect=["y"], glossary=[("frozen section", "lat cat lanh")])
    (e,) = of(findings(tmp_path), "ERROR")
    assert (e.check, e.key) == ("fix_cross_pack", "frozen section")
    rules(make_pack(tmp_path, "c", detect=["z"]), [{"en": "frozen sections", "vi": "tieu ban cat lanh", "wrong": []}])
    (tmp_path / "b" / "glossary.csv").write_text("en,vi,note\n", encoding="utf-8")
    (e,) = of(findings(tmp_path), "ERROR")  # two fixes, two values, two families
    assert (e.check, e.pack, e.key) == ("fix_cross_pack", "a", "frozen section") and "c fixes" in e.message


def test_tests_schema(tmp_path):
    d = make_pack(tmp_path, "a", detect=["x"])
    (d / "tests.jsonl").write_text('{"src": "a", "must": ["b"], "must_any": [["c", "d"]]}\n'
                                   '{"must": ["b"]}\n{"src": "a", "must_not": "b"}\nnot json\n'
                                   '{"src": "a", "mustt": ["b"]}\n', encoding="utf-8")
    fs = findings(tmp_path)
    assert len(of(fs, "ERROR", "tests")) == 3 and len(of(fs, "WARNING", "tests")) == 1


def test_pack_json_parent_and_depth(tmp_path):
    make_pack(tmp_path, "root", detect=["x"])
    make_pack(tmp_path, "kid", parent="root", detect=["y"])
    make_pack(tmp_path, "grandkid", parent="kid", detect=["z"])
    make_pack(tmp_path, "orphan", parent="ghost", detect=["w"])
    fs = of(findings(tmp_path), "ERROR", "pack_json")
    assert sorted(f.pack for f in fs) == ["grandkid", "orphan"]


def test_common_detect_words_warn(tmp_path):
    make_pack(tmp_path, "a", detect=["Staining", "tumor"])
    assert [f.key for f in of(findings(tmp_path), "WARNING", "detect")] == ["staining"]


def test_owners(tmp_path):
    (tmp_path / "_shared").mkdir()
    (tmp_path / "_shared" / "owners.csv").write_text(
        "key,owner,note\nmargin,-,bare key\nexpression,path,\nconsolidation,medicine-pulmonology,\n",
        encoding="utf-8")
    make_pack(tmp_path, "path", detect=["x"], glossary=[("expression", "boc lo"), ("resection margin", "dien cat")])
    make_pack(tmp_path, "molecular", detect=["y"], glossary=[("expression", "bieu hien"), ("margins", "bo"),
                                                             ("consolidation", "dong dac")])
    fs = findings(tmp_path)
    assert sorted((f.check, f.pack, f.key) for f in of(fs, "ERROR", "owner")) == [
        ("owner", "molecular", "expression"), ("owner", "molecular", "margin")]
    assert [(f.pack, f.key) for f in of(fs, "WARNING", "owner")] == [("molecular", "consolidation")]


def test_drafts_can_be_left_out(tmp_path):
    family(tmp_path)
    make_pack(tmp_path, "draft-x", detect=["q"], glossary=[("breast", "nhu hoa")], draft=True)
    assert of(findings(tmp_path), "ERROR")
    assert of(findings(tmp_path, include_drafts=False), "ERROR") == []


def test_cli_ascii_console_utf8_report_exit_code(tmp_path, capsys):
    nhu_hoa = "nh" + chr(0x169) + " hoa"  # Vietnamese text: the console stays ASCII, the report keeps it
    make_pack(tmp_path, "a", detect=["x"], glossary=[("breast", "v" + chr(0xFA))])
    make_pack(tmp_path, "b", detect=["y"], glossary=[("breast", nhu_hoa)])
    report = tmp_path / "report.txt"
    assert check_packs.main([str(tmp_path), "--report", str(report)]) == 1
    out = capsys.readouterr().out
    assert out.isascii() and "1 error" in out and "cross_pack" in out
    assert nhu_hoa in report.read_text(encoding="utf-8")
    report.unlink()
    make_pack(tmp_path, "c", detect=["z"])
    (tmp_path / "b" / "glossary.csv").write_text("en,vi,note\n", encoding="utf-8")
    assert check_packs.main([str(tmp_path), "--report", str(report)]) == 0


def test_build_registry_prints_the_check_summary(tmp_path, capsys):
    family(tmp_path / "packs")
    build_registry.main([str(tmp_path / "packs"), str(tmp_path / "reg")])
    lines = [line for line in capsys.readouterr().out.splitlines() if line.startswith("check_packs:")]
    assert lines == ["check_packs: 0 error(s), 0 warning(s), 1 override(s) -- python tools/check_packs.py for details"]


def test_real_packs_have_no_errors():
    """The validator guards packs/ (drafts included): a conflict between packs fails the suite. Keys with "(" stay
    warnings until the pathology data rewrites them (then: parens_error=True here)."""
    fs = check_packs.check(REAL_PACKS)
    assert [f for f in fs if f.level == "ERROR"] == []
    owners = (REAL_PACKS / "_shared" / "owners.csv").read_text(encoding="utf-8").splitlines()
    assert owners[0] == "key,owner,note" and any(line.startswith("margin,-,") for line in owners)
    assert (REPO_ROOT / "tools" / "check_packs.py").is_file()
