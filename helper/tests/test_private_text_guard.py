"""tools/private_text_guard.py: refuse to publish text copied from the private documents.

Every private source (txt / md / docx / pptx, PDFs when a reader is installed) becomes a set of hashed 8-word
shingles (NFC, casefold, diacritics folded; words = runs of letters / digits); a published file that repeats 8 or more
consecutive words of one of them is a hit, reported as path:line:col + run length only, never the words. All sources
here are synthetic files in tmp_path: no test reads the real private documents."""
import json
import os
import re
import subprocess
import sys
import types
import unicodedata
import zipfile
from xml.sax.saxutils import escape

import pytest

from packutil import build_registry  # noqa: F401  (puts tools/ on sys.path)

import build_site
import export_public
import private_text_guard as ptg

TXT_PRIVATE = ("Amber herons quietly measured eleven granite lanterns beside the northern harbour while patient "
               "archivists catalogued forgotten copper maps of distant islands")
DOCX_RUNS = ["Crimson lan", "terns drifted over the sleeping ", "orchard as nine silver foxes counted falling pears"]
SLIDE_TEXT = "Seven velvet tortoises negotiated a treaty with the marble lighthouse keepers at dawn"
NOTES_TEXT = "Remember to thank the cobalt beekeepers who mapped every hollow cedar along the ridge"
LAYOUT_TEXT = "Click to edit the master title style of every sample layout here"
# "Bac si doc ky tieu ban sinh thiet cua benh nhan truoc buoi hoi chan sang thu hai" with its diacritics (18 words)
VI_PRIVATE = ("B\u00e1c s\u0129 \u0111\u1ecdc k\u1ef9 ti\u00eau b\u1ea3n sinh thi\u1ebft c\u1ee7a b\u1ec7nh nh\u00e2n "
              "tr\u01b0\u1edbc bu\u1ed5i h\u1ed9i ch\u1ea9n s\u00e1ng th\u1ee9 hai")
SECRET_WORDS = ("quietly", "granite", "lanterns", "harbour", "archivists", "catalogued", "crimson", "tortoises",
                "beekeepers", "orchard")

# a published test module: one 9-word run (line 3) and one 7-word run (line 4) copied from TXT_PRIVATE
SAMPLE_PY = ('"""Synthetic module."""\n'
             "x = 1\n"
             'TEXT = "quietly measured eleven granite lanterns beside the northern harbour"\n'
             'OTHER = "patient archivists catalogued forgotten copper maps of"\n')


def make_docx(path, paragraphs):
    """A minimal .docx: one w:p per item of paragraphs, one w:r / w:t per run text."""
    body = "".join("<w:p>%s</w:p>" % "".join('<w:r><w:t xml:space="preserve">%s</w:t></w:r>' % escape(r) for r in runs)
                   for runs in paragraphs)
    xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats'
           '.org/wordprocessingml/2006/main"><w:body>%s</w:body></w:document>' % body)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", xml)
    return path


def _sld(root, text):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<p:%s xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>'
            '<a:p><a:r><a:t>%s</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:%s>' % (root, escape(text), root))


def make_pptx(path, slides, notes=None, layout=None):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        for i, text in enumerate(slides, 1):
            z.writestr("ppt/slides/slide%d.xml" % i, _sld("sld", text))
        if notes:
            z.writestr("ppt/notesSlides/notesSlide1.xml", _sld("notes", notes))
        if layout:
            z.writestr("ppt/slideLayouts/slideLayout1.xml", _sld("sldLayout", layout))
    return path


def write(root, files):
    for rel, data in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))
    return root


@pytest.fixture
def sources(tmp_path):
    """Synthetic private sources: a .txt, a .docx (a word split across runs), a .pptx (slide + notes + a layout whose
    boilerplate is not private) and a .md in a sub-folder."""
    d = tmp_path / "private_docs"
    write(d, {"notes.txt": TXT_PRIVATE + "\n", "sub/vi.md": "# Ghi ch\u00fa\n\n" + VI_PRIVATE + "\n"})
    make_docx(d / "report.docx", [["Opening line of the report"], DOCX_RUNS])
    make_pptx(d / "lecture.pptx", [SLIDE_TEXT], notes=NOTES_TEXT, layout=LAYOUT_TEXT)
    return [d / "notes.txt", d / "report.docx", d / "lecture.pptx", d / "sub"]


def found(hits):
    return [(h.where, h.line, h.col, h.words) for h in hits]


def test_a_copied_9_word_run_is_reported_and_a_7_word_run_is_not(sources, tmp_path):
    tree = write(tmp_path / "tree", {"helper/tests/test_sample.py": SAMPLE_PY, "README.md": "Nothing private here.\n"})
    guard = ptg.load(sources)
    assert found(guard.scan_tree(tree)) == [("helper/tests/test_sample.py", 3, 9, 9)]


def cli_args(tmp_path, sources, *extra):
    """--sources / --cache / --allow in tmp_path: a CLI test never reads or writes the real private folder."""
    lst = write(tmp_path, {"sources.txt": "\n".join(str(p) for p in sources) + "\n"}) / "sources.txt"
    return ["--sources", str(lst), "--cache", str(tmp_path / "cache.bin"), "--allow", str(tmp_path / "no-allow.txt")] \
        + list(extra)


def test_the_cli_prints_locations_and_run_lengths_never_the_words(sources, tmp_path, capsys):
    tree = write(tmp_path / "tree", {"helper/tests/test_sample.py": SAMPLE_PY})
    assert ptg.main(cli_args(tmp_path, sources, str(tree))) == 1
    out = capsys.readouterr().out
    assert out.isascii() and "helper/tests/test_sample.py:3:9  9 words" in out and "1 private-text hit(s)" in out
    assert not [w for w in SECRET_WORDS if w in out.lower()]
    clean = write(tmp_path / "clean", {"a.py": "x = 1\n"})
    assert ptg.main(cli_args(tmp_path, sources, str(clean))) == 0
    out = capsys.readouterr().out
    assert out.isascii() and "clean" in out


def test_docx_and_pptx_sources_are_read_from_their_text_nodes(sources, tmp_path):
    guard = ptg.load(sources)
    tree = write(tmp_path / "tree", {
        "a.txt": "crimson lanterns drifted over the sleeping orchard as nine\n",  # docx runs joined: "lan" + "terns"
        "b.txt": "seven velvet tortoises negotiated a treaty with the marble\n",  # slide
        "c.txt": "thank the cobalt beekeepers who mapped every hollow cedar\n",  # notes
        "d.txt": LAYOUT_TEXT + "\n",  # slide-layout boilerplate is not private text
    })
    assert found(guard.scan_tree(tree)) == [("a.txt", 1, 1, 9), ("b.txt", 1, 1, 9), ("c.txt", 1, 1, 9)]


def test_text_inside_published_docx_pptx_and_zip_files_is_scanned(sources, tmp_path):
    guard = ptg.load(sources)
    tree = tmp_path / "tree"
    (tree / "fx").mkdir(parents=True)
    make_docx(tree / "fx" / "f.docx", [["Unrelated opening line"], ["Crimson lan", "terns drifted over the sleeping "
                                                                     "orchard as nine silver foxes"]])
    make_pptx(tree / "fx" / "d.pptx", ["Seven velvet tortoises negotiated a treaty with the marble lighthouse keepers"],
              layout=LAYOUT_TEXT)
    with zipfile.ZipFile(tree / "fx" / "b.zip", "w") as z:
        z.writestr("notes/readme.txt", "intro\nremember to thank the cobalt beekeepers who mapped every hollow cedar\n")
    write(tree, {"fx/pic.png": b"\x89PNG\r\n\x1a\n\x00\x00binary"})
    assert found(guard.scan_tree(tree)) == [
        ("fx/b.zip!notes/readme.txt", 2, 1, 11),
        ("fx/d.pptx!ppt/slides/slide1.xml", 1, 1, 11),
        ("fx/f.docx!word/document.xml", 2, 1, 11),  # line = paragraph of the part
    ]


def test_escaped_and_accent_stripped_copies_are_found(sources, tmp_path):
    guard = ptg.load(sources)
    js = json.dumps({"cases": [{"en": "x", "vi": VI_PRIVATE}]}, ensure_ascii=True)  # \u escapes, one line
    nl = json.dumps({"text": "amber herons quietly measured\neleven granite lanterns beside the"})  # a \n escape inside
    tree = write(tmp_path / "tree", {
        "fx/vi.json": js + "\n",
        "fx/nl.json": nl + "\n",
        # diacritics stripped: 16 syllables
        "t/test_ascii.py": 'S = "Bac si doc ky tieu ban sinh thiet cua benh nhan truoc buoi hoi chan sang"\n',
        "t/nfd.txt": unicodedata.normalize("NFD", VI_PRIVATE.upper()) + "\n",
    })
    assert found(guard.scan_tree(tree)) == [
        ("fx/nl.json", 1, nl.index("amber") + 1, 9),
        ("fx/vi.json", 1, js.index("B\\u00e1c") + 1, 18),  # the column of the raw (escaped) line
        ("t/nfd.txt", 1, 1, 18),
        ("t/test_ascii.py", 1, 6, 16),
    ]


def test_vietnamese_runs_need_16_syllables_and_english_runs_8_words(sources, tmp_path):
    guard = ptg.load(sources)
    syllables = VI_PRIVATE.split()
    tree = write(tmp_path / "tree", {
        "a.txt": " ".join(syllables[:15]) + "\n",
        "b.txt": " ".join(syllables[:16]) + "\n",
        # accent-stripped, but the private source is Vietnamese: the 16-syllable rule too
        "c.py": 'S = "Bac si doc ky tieu ban sinh thiet cua benh nhan truoc buoi hoi chan"\n',
        "d.txt": "amber herons quietly measured eleven granite lanterns beside\n",
    })
    assert found(guard.scan_tree(tree)) == [("b.txt", 1, 1, 16), ("d.txt", 1, 1, 8)]


def test_runs_of_numbers_alone_are_not_text(tmp_path):
    # a numbered table in a private source, the match offsets of a regex fixture: same digits, no text
    src = write(tmp_path / "p", {"table.txt": "Row 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16\n" + TXT_PRIVATE}) / "table.txt"
    offsets = json.dumps([[i, i + 1] for i in range(0, 16, 2)], separators=(",", ":"))
    hits = ptg.load([src]).scan_items([("fx/pyre.json", (offsets + "\n").encode()), ("a.txt", TXT_PRIVATE.encode())])
    assert found(hits) == [("a.txt", 1, 1, 21)]


def test_curated_terminology_files_are_allowed_by_default_but_pack_tests_are_scanned(sources, tmp_path):
    run = "quietly measured eleven granite lanterns beside the northern harbour\n"
    allowed = ["packs/x/glossary.csv", "packs/x/sources.md", "packs/x/MINING_REPORT.md", "packs/x/prompt.md",
               "packs/_shared/core.csv", "web/engine/tests/fixtures/engine/packs.json"]
    scanned = ["packs/x/tests.jsonl", "packs/x/rules.json", "web/engine/tests/fixtures/engine/pyre.json"]
    tree = write(tmp_path / "tree", {p: run for p in allowed + scanned})
    assert [h.where for h in ptg.load(sources).scan_tree(tree)] == sorted(scanned)


def test_the_allow_list_takes_shingle_hashes_or_path_globs(sources, tmp_path, capsys):
    tree = write(tmp_path / "tree", {
        "helper/tests/test_sample.py": SAMPLE_PY,
        "docs/notes.md": "while patient archivists catalogued forgotten copper maps of distant islands\n"})
    assert ptg.main(cli_args(tmp_path, sources, "--hashes", str(tree))) == 1
    out = capsys.readouterr().out
    assert "docs/notes.md:1:1  10 words" in out and "helper/tests/test_sample.py:3:9  9 words" in out
    blocks = out.split("helper/tests/test_sample.py:3:9")
    sample_hashes = re.findall(r"^\s+([0-9a-f]{16})$", blocks[1], re.M)
    assert len(sample_hashes) == 2  # a 9-word run = two 8-word shingles
    allow = write(tmp_path, {"allow.txt": "# public phrases\n%s\ndocs/*\n" % "\n".join(sample_hashes)}) / "allow.txt"
    guard = ptg.load(sources, allow=allow)
    assert guard.scan_tree(tree) == []
    only_one = write(tmp_path, {"one.txt": sample_hashes[0] + "\n"}) / "one.txt"
    assert found(ptg.load(sources, allow=only_one).scan_tree(tree)) == [
        ("docs/notes.md", 1, 1, 10), ("helper/tests/test_sample.py", 3, 17, 8)]


def test_the_cache_holds_hashes_only_and_is_rebuilt_when_a_source_changes(tmp_path):
    src = write(tmp_path / "p", {"notes.txt": TXT_PRIVATE}) / "notes.txt"
    deck = make_pptx(tmp_path / "p" / "deck.pptx", [SLIDE_TEXT])
    cache = tmp_path / "private" / "cache.bin"
    cache.parent.mkdir()
    first = ptg.load([src, deck], cache=cache)
    assert (first.stats["extracted"], first.stats["cached"]) == (2, 0)
    blob = cache.read_bytes().lower()
    assert not [w for w in SECRET_WORDS + ("notes.txt", "deck.pptx") if w.encode() in blob]
    again = ptg.load([src, deck], cache=cache)
    assert (again.stats["extracted"], again.stats["cached"]) == (0, 2)
    assert again.scan_items([("a.txt", TXT_PRIVATE.encode())]) != []
    # same size, other words, newer mtime: the source is read again
    st = src.stat()
    src.write_text(TXT_PRIVATE.replace("lanterns", "lanternz"), encoding="utf-8")
    assert src.stat().st_size == st.st_size
    os.utime(src, ns=(st.st_atime_ns, st.st_mtime_ns + 2 * 10 ** 9))
    changed = ptg.load([src, deck], cache=cache)
    assert (changed.stats["extracted"], changed.stats["cached"]) == (1, 1)
    assert found(changed.scan_items([("a.txt", b"eleven granite lanternz beside the northern harbour while patient"),
                                     ("b.txt", b"eleven granite lanterns beside the northern harbour while patient")])) \
        == [("a.txt", 1, 1, 9)]


def test_a_cache_that_cannot_be_written_never_stops_the_guard(tmp_path):
    src = write(tmp_path / "p", {"notes.txt": TXT_PRIVATE}) / "notes.txt"
    blocked = tmp_path / "cache.bin"
    blocked.mkdir()  # the cache path is taken (as by a file another process holds open)
    guard = ptg.load([src], cache=blocked)
    assert guard.stats["extracted"] == 1 and found(guard.scan_items([("a.txt", TXT_PRIVATE.encode())])) == [
        ("a.txt", 1, 1, 21)]


def test_pdfs_are_skipped_without_a_pdf_reader_and_read_once_one_is_there(tmp_path, monkeypatch):
    pdf = write(tmp_path / "p", {"paper.pdf": b"%PDF-1.4 synthetic"}) / "paper.pdf"
    cache = tmp_path / "cache.bin"
    for name in ("pypdf", "pdfminer", "pdfminer.high_level"):
        monkeypatch.setitem(sys.modules, name, None)  # not installed
    skipped = ptg.load([pdf], cache=cache)
    assert skipped.stats["pdf_skipped"] == 1 and "PDFs skipped: 1" in skipped.summary()
    fake = types.ModuleType("pypdf")

    class Page:
        def extract_text(self):
            return TXT_PRIVATE

    class PdfReader:
        def __init__(self, path):
            assert str(path).endswith("paper.pdf")
            self.pages = [Page()]

    fake.PdfReader = PdfReader
    monkeypatch.setitem(sys.modules, "pypdf", fake)
    read = ptg.load([pdf], cache=cache)  # a skipped PDF is never cached as empty
    assert read.stats["pdf_skipped"] == 0 and read.stats["extracted"] == 1
    assert found(read.scan_items([("a.txt", TXT_PRIVATE.encode())])) == [("a.txt", 1, 1, 21)]


def test_for_repo_reads_the_source_lists_of_private(tmp_path, sources):
    repo = tmp_path / "repo"
    write(repo, {"private/corpus.txt": "# corpus\n%s\nmissing.docx\n" % sources[0],
                 "private/text_sources.txt": "%s\n%s\n" % (sources[1].parent, tmp_path / "gone")})
    guard = ptg.for_repo(repo)
    assert guard.stats["sources"] == 4 and guard.stats["missing"] == 2  # notes.txt is listed twice, read once
    assert (repo / "private" / "text_guard_cache.bin").is_file()
    assert found(guard.scan_items([("x.py", SAMPLE_PY.encode())])) == [("x.py", 3, 9, 9)]
    assert ptg.for_repo(tmp_path / "nothing").stats["sources"] == 0


def git_repo(path, files):
    write(path, files)
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    commit(path)
    return path


def commit(path):
    subprocess.run(["git", "-C", str(path), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(path), "-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q",
                    "-m", "change"], check=True)


def test_export_public_refuses_committed_private_text_and_copies_nothing(sources, tmp_path):
    repo = git_repo(tmp_path / "repo", {"README.md": "hello\n", "helper/tests/test_sample.py": SAMPLE_PY})
    (repo / "helper" / "tests" / "test_sample.py").write_text("x = 1\n")  # the commit is published, not this edit
    guard = ptg.load(sources)
    dest = tmp_path / "dest"
    with pytest.raises(ptg.PrivateText) as err:
        export_public.export(repo, dest, patterns=[], allow=[], text_guard=guard)
    assert found(err.value.hits) == [("helper/tests/test_sample.py", 3, 9, 9)]
    assert not dest.exists() or not any(dest.iterdir())
    commit(repo)
    assert export_public.export(repo, dest, patterns=[], allow=[], text_guard=guard) == [
        "README.md", "helper/tests/test_sample.py"]


def test_export_public_cli_refuses_with_locations_only(sources, tmp_path, capsys):
    repo = git_repo(tmp_path / "repo", {"README.md": "hello\n", "helper/tests/test_sample.py": SAMPLE_PY})
    pat = write(tmp_path, {"patterns.txt": "nothing-matches-this\n"}) / "patterns.txt"
    lst = write(tmp_path, {"sources.txt": "\n".join(str(p) for p in sources)}) / "sources.txt"
    args = ["--repo", str(repo), "--patterns", str(pat), "--text-sources", str(lst),
            "--text-cache", str(tmp_path / "cache.bin")]
    assert export_public.main([str(tmp_path / "dest")] + args) == 1
    out = capsys.readouterr().out
    assert out.isascii() and "REFUSED: 1 private-text hit(s), nothing copied" in out
    assert "helper/tests/test_sample.py:3:9  9 words" in out
    assert not [w for w in SECRET_WORDS if w in out.lower()] and not (tmp_path / "dest").exists()
    (repo / "helper" / "tests" / "test_sample.py").write_text("x = 1\n")
    commit(repo)
    assert export_public.main([str(tmp_path / "dest")] + args) == 0
    out = capsys.readouterr().out
    assert "exported 2 files" in out and "private text: 4 sources" in out


SITE = {
    "web/index.html": "<!doctype html><title>page</title>",
    "web/app.js": "// eleven granite lanterns beside the northern harbour while patient archivists\n",
    "web/tests/t.test.mjs": "// quietly measured eleven granite lanterns beside the northern harbour (dev only)\n",
    "functions/_lib/http.js": "export const http = 1;\n",
    "packs/demo/pack.json": json.dumps({"id": "demo", "version": "0.1.0", "name": "Demo", "detect": []}),
    "packs/demo/prompt.md": "Voice notes:\nseven velvet tortoises negotiated a treaty with the marble lighthouse\n",
    "packs/demo/rules.json": json.dumps({"note": "seven velvet tortoises negotiated a treaty with the marble lighthouse"}),
    "packs/demo/glossary.csv": "en,vi,note\nbiopsy,sinh thiet,\n",
}


def test_build_site_refuses_private_text_in_the_site_and_in_the_pack_bundle(sources, tmp_path):
    repo = git_repo(tmp_path / "repo", SITE)
    out = tmp_path / "site"
    with pytest.raises(ptg.PrivateText) as err:
        build_site.build(repo, out, patterns=[], allow=[], text_guard=ptg.load(sources))
    # the bundle carries packs/<id>/<file> as base64: the guard reads the decoded bytes (prompt.md is on the built-in
    # allow list, rules.json is not); web/tests/ is not published
    assert [(h.where, h.words) for h in err.value.hits] == [("packs/demo/rules.json", 10), ("web/app.js", 10)]
    assert err.value.hits[1][:3] == ("web/app.js", 1, 4)
    assert not out.exists() or not any(out.iterdir())


def test_build_site_cli_refuses_and_reports_the_guard(sources, tmp_path, capsys):
    repo = git_repo(tmp_path / "repo", SITE)
    pat = write(tmp_path, {"patterns.txt": "nothing-matches-this\n"}) / "patterns.txt"
    lst = write(tmp_path, {"sources.txt": "\n".join(str(p) for p in sources)}) / "sources.txt"
    args = ["--repo", str(repo), "--patterns", str(pat), "--text-sources", str(lst),
            "--text-cache", str(tmp_path / "cache.bin")]
    assert build_site.main([str(tmp_path / "site")] + args) == 1
    out = capsys.readouterr().out
    assert out.isascii() and "REFUSED: 2 private-text hit(s), nothing written" in out
    assert "web/app.js:1:4  10 words" in out and not [w for w in SECRET_WORDS if w in out.lower()]
    write(repo, {"web/app.js": "console.log('app');\n", "packs/demo/rules.json": "{}"})
    commit(repo)
    assert build_site.main([str(tmp_path / "site")] + args) == 0
    out = capsys.readouterr().out
    assert out.isascii() and "private text: 4 sources" in out and "clean" in out
