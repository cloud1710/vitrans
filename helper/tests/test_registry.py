import json

import httpx
import pytest

from packutil import build, make_pack
from vitranslate.registry import PackUnavailable, Registry


def local_registry(tmp_path):
    src = tmp_path / "packs"
    make_pack(src, "alpha", detect=["tumor"], glossary=[("biopsy", "sinh thi\u1ebft")])
    make_pack(src, "beta", detect=["lobular"], version="2.0.0")
    build(src, tmp_path / "reg")
    return tmp_path / "reg"


def entry(manifest, pid):
    return next(e for e in manifest["packs"] if e["id"] == pid)


def leftovers(home):
    d = home / "packs"
    return sorted(p.name for p in d.iterdir()) if d.exists() else []


def test_local_ensure_extracts_then_uses_cache(tmp_path):
    reg = Registry(local_registry(tmp_path), tmp_path / "home")
    m = reg.manifest()
    assert [e["id"] for e in m["packs"]] == ["alpha", "beta"] and not reg.offline
    path = reg.ensure(entry(m, "alpha"))
    assert path == tmp_path / "home" / "packs" / "alpha@1.0.0"
    assert (path / "pack.json").is_file() and (path / "glossary.csv").is_file()
    assert reg.last_source["alpha"] == "downloaded"
    assert reg.ensure(entry(m, "alpha")) == path and reg.last_source["alpha"] == "cache"
    assert reg.installed() == ["alpha@1.0.0"]
    reg.ensure(entry(m, "beta"))
    assert reg.installed() == ["alpha@1.0.0", "beta@2.0.0"]


def test_tampered_zip_is_refused_and_nothing_extracted(tmp_path):
    reg_dir = local_registry(tmp_path)
    zf = reg_dir / "alpha-1.0.0.zip"
    zf.write_bytes(zf.read_bytes() + b"x")
    reg = Registry(reg_dir, tmp_path / "home")
    with pytest.raises(PackUnavailable, match="sha256"):
        reg.ensure(entry(reg.manifest(), "alpha"))
    assert leftovers(tmp_path / "home") == []
    assert reg.installed() == []


def test_stale_cached_copy_is_replaced(tmp_path):
    reg = Registry(local_registry(tmp_path), tmp_path / "home")
    e = entry(reg.manifest(), "alpha")
    path = reg.ensure(e)
    (path / ".sha256").write_text("0" * 64, encoding="ascii")  # e.g. an interrupted older copy
    (path / "junk.txt").write_text("x", encoding="ascii")
    assert reg.ensure(e) == path and reg.last_source["alpha"] == "downloaded"
    assert not (path / "junk.txt").exists() and leftovers(tmp_path / "home") == ["alpha@1.0.0"]


def test_missing_pack_file_and_unsafe_entries(tmp_path):
    reg_dir = local_registry(tmp_path)
    (reg_dir / "beta-2.0.0.zip").unlink()
    reg = Registry(reg_dir, tmp_path / "home")
    m = reg.manifest()
    with pytest.raises(PackUnavailable):
        reg.ensure(entry(m, "beta"))
    bad = dict(entry(m, "alpha"), file="../alpha-1.0.0.zip")
    with pytest.raises(PackUnavailable):
        reg.ensure(bad)
    for field, value in (("id", "../evil"), ("id", "alpha\n"), ("version", "1.0.0\n"), ("version", ".."),
                         ("version", "1.0"), ("sha256", "abc")):
        with pytest.raises(PackUnavailable, match="unsafe"):
            reg.ensure(dict(entry(m, "alpha"), **{field: value}))
    assert leftovers(tmp_path / "home") == []


def test_missing_local_registry_is_offline(tmp_path):
    reg = Registry(tmp_path / "nothing", tmp_path / "home")
    assert reg.offline is None  # unknown until the first manifest() call
    assert reg.manifest() == {"packs": [], "idf": {}} and reg.offline


class Server:
    """Serves a built registry folder over a mock transport; records requests; can go down."""

    def __init__(self, root):
        self.root = root
        self.down = False
        self.requests = []

    def __call__(self, request):
        self.requests.append(request)
        if self.down:
            raise httpx.ConnectError("network down", request=request)
        name = request.url.path.rsplit("/", 1)[-1]
        f = self.root / name
        if not f.exists():
            return httpx.Response(404)
        etag = '"%d"' % f.stat().st_size
        if name == "manifest.json" and request.headers.get("if-none-match") == etag:
            return httpx.Response(304, headers={"ETag": etag})
        return httpx.Response(200, content=f.read_bytes(), headers={"ETag": etag})


URL = "https://reg.example/registry"


def test_http_manifest_cached_with_etag_then_used_offline(tmp_path):
    srv = Server(local_registry(tmp_path))
    home = tmp_path / "home"
    reg = Registry(URL, home, transport=httpx.MockTransport(srv))
    m = reg.manifest()
    assert [e["id"] for e in m["packs"]] == ["alpha", "beta"] and not reg.offline
    assert str(srv.requests[0].url) == URL + "/manifest.json"
    cached = home / "registry" / "manifest.json"
    assert json.loads(cached.read_text(encoding="utf-8")) == m
    assert reg.manifest() == m
    assert srv.requests[1].headers.get("if-none-match") and len(srv.requests) == 2  # answered 304
    path = reg.ensure(entry(m, "alpha"))
    assert (path / "pack.json").is_file() and reg.last_source["alpha"] == "downloaded"
    assert str(srv.requests[-1].url) == URL + "/alpha-1.0.0.zip"
    srv.down = True
    reg2 = Registry(URL, home, transport=httpx.MockTransport(srv))
    assert reg2.manifest() == m and reg2.offline
    assert reg2.ensure(entry(m, "alpha")) == path and reg2.last_source["alpha"] == "cache"
    with pytest.raises(PackUnavailable):
        reg2.ensure(entry(m, "beta"))


def test_http_no_cache_no_network_is_offline_and_empty(tmp_path):
    def down(request):
        raise httpx.ConnectError("no network", request=request)

    reg = Registry(URL, tmp_path / "home", transport=httpx.MockTransport(down))
    assert reg.manifest() == {"packs": [], "idf": {}} and reg.offline


def test_http_bad_manifest_falls_back_to_cache(tmp_path):
    srv = Server(local_registry(tmp_path))
    home = tmp_path / "home"
    good = Registry(URL, home, transport=httpx.MockTransport(srv)).manifest()

    def garbage(request):
        return httpx.Response(200, content=b"<html>captive portal</html>")

    reg = Registry(URL, home, transport=httpx.MockTransport(garbage))
    assert reg.manifest() == good and reg.offline


def read_manifest(reg_dir):
    return json.loads((reg_dir / "manifest.json").read_text(encoding="utf-8"))


def test_bad_manifest_entries_are_dropped(tmp_path):
    reg_dir = local_registry(tmp_path)
    m = read_manifest(reg_dir)
    good = entry(m, "alpha")
    trimmed = {k: v for k, v in good.items() if k != "size"}
    m["packs"] += [
        dict(good, id="gamma", sha256=None), dict(trimmed, id="delta"), dict(good, id="eps", profile={"tumor": "2"}),
        dict(good, id="zeta", profile={"tumor": float("inf")}), dict(good, id="eta", size="12"),
        dict(good, id="theta", detect="tumor"), dict(good, id="iota", version="1.0"), dict(good, id="Bad Id"),
        dict(good, id="kappa", parent=5), dict(good, id="lam", profile=[1, 2]), dict(good, id="mu", size=True),
        "not an entry", dict(good, name="Duplicate of alpha"),
    ]
    m["idf"].update({"weird": "x", "nan": float("nan"), "ok": 1.5})
    (reg_dir / "manifest.json").write_text(json.dumps(m), encoding="utf-8")  # json writes NaN / Infinity
    got = Registry(reg_dir, tmp_path / "home").manifest()
    assert [e["id"] for e in got["packs"]] == ["alpha", "beta"] and entry(got, "alpha")["name"] == "Alpha"
    assert "weird" not in got["idf"] and "nan" not in got["idf"] and got["idf"]["ok"] == 1.5
    assert "tumor" in got["idf"]


def test_http_invalid_manifest_is_never_cached(tmp_path, monkeypatch):
    from vitranslate import registry as registry_mod
    home = tmp_path / "home"
    for body in (b"<html>captive portal</html>", b'{"packs": "x"}', b"[1, 2]"):
        reg = Registry(URL, home, transport=httpx.MockTransport(lambda r, b=body: httpx.Response(200, content=b)))
        assert reg.manifest() == {"packs": [], "idf": {}} and reg.offline
        assert not (home / "registry" / "manifest.json").exists()
    monkeypatch.setattr(registry_mod, "MAX_MANIFEST_BYTES", 100)  # a manifest larger than the cap is refused
    reg = Registry(URL, home, transport=httpx.MockTransport(Server(local_registry(tmp_path))))
    assert reg.manifest() == {"packs": [], "idf": {}} and reg.offline
    assert not (home / "registry" / "manifest.json").exists()


def test_cache_hit_needs_pack_json_and_forget_drops_the_marker(tmp_path):
    reg = Registry(local_registry(tmp_path), tmp_path / "home")
    e = entry(reg.manifest(), "alpha")
    path = reg.ensure(e)
    (path / "pack.json").unlink()
    assert reg.ensure(e) == path and reg.last_source["alpha"] == "downloaded" and (path / "pack.json").is_file()
    reg.forget(e)
    assert not (path / ".sha256").exists() and reg.installed() == []
    assert reg.ensure(e) == path and reg.last_source["alpha"] == "downloaded"


def test_cache_hit_needs_every_file_of_the_zip(tmp_path):
    reg = Registry(local_registry(tmp_path), tmp_path / "home")
    e = entry(reg.manifest(), "alpha")
    path = reg.ensure(e)
    marker = (path / ".sha256").read_text(encoding="ascii").split()
    assert marker[0] == e["sha256"] and sorted(marker[1:]) == ["glossary.csv", "pack.json", "prompt.md"]
    assert reg.ensure(e) == path and reg.last_source["alpha"] == "cache"
    (path / "glossary.csv").unlink()
    assert reg.ensure(e) == path and reg.last_source["alpha"] == "downloaded" and (path / "glossary.csv").is_file()
    (path / ".sha256").write_text(e["sha256"], encoding="ascii")  # an old marker without the file list
    assert reg.ensure(e) == path and reg.last_source["alpha"] == "downloaded"


def test_two_threads_install_the_same_pack(tmp_path):
    import threading
    from packutil import copy_real
    from vitranslate.packs import load_pack
    reg_dir = tmp_path / "reg"
    build(copy_real(tmp_path / "src", "pathology"), reg_dir)
    e = Registry(reg_dir, tmp_path / "h").manifest()["packs"][0]
    for trial in range(8):
        home = tmp_path / ("home%d" % trial)
        if trial % 2:  # half of the trials start from a stale copy that must be replaced
            stale = home / "packs" / ("pathology@" + e["version"])
            stale.mkdir(parents=True)
            (stale / ".sha256").write_text("0" * 64, encoding="ascii")
        barrier, sizes, errors = threading.Barrier(2), [], []

        def work():
            reg = Registry(reg_dir, home)
            barrier.wait()
            try:
                sizes.append(len(load_pack(reg.ensure(e)).glossary))
            except Exception as exc:  # collected and asserted below
                errors.append(repr(exc))

        threads = [threading.Thread(target=work) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(60)
        assert not any(t.is_alive() for t in threads), "install deadlocked"
        assert errors == [] and len(sizes) == 2 and min(sizes) > 400, (trial, errors, sizes)
        assert leftovers(home) == ["pathology@" + e["version"]], trial


def zip_of(files):
    import io
    import warnings
    import zipfile
    buf = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # duplicate names on purpose
        with zipfile.ZipFile(buf, "w") as z:
            for name, data in files:
                z.writestr(name, data)
    return buf.getvalue()


def test_zip_may_hold_only_pack_files(tmp_path):
    import hashlib
    reg_dir = local_registry(tmp_path)
    reg = Registry(reg_dir, tmp_path / "home")
    good = entry(reg.manifest(), "alpha")
    meta = json.dumps({"id": "alpha", "version": "1.0.0"})
    cases = {"extra": [("pack.json", meta), ("evil.txt", "x")], "dup": [("pack.json", meta), ("pack.json", meta)],
             "nested": [("pack.json", meta), ("sub/prompt.md", "x")]}
    for name, files in cases.items():
        data = zip_of(files)
        (reg_dir / ("alpha-%s.zip" % name)).write_bytes(data)
        e = dict(good, file="alpha-%s.zip" % name, sha256=hashlib.sha256(data).hexdigest(), size=len(data))
        with pytest.raises(PackUnavailable):
            reg.ensure(e)
        assert leftovers(tmp_path / "home") == [], name


def test_pack_json_must_match_the_entry(tmp_path):
    reg = Registry(local_registry(tmp_path), tmp_path / "home")
    e = dict(entry(reg.manifest(), "alpha"), version="9.9.9")  # same zip, the manifest claims another version
    with pytest.raises(PackUnavailable, match="pack.json"):
        reg.ensure(e)
    assert leftovers(tmp_path / "home") == []


def test_concurrent_install_is_reused(tmp_path, monkeypatch):
    import os
    reg_dir = local_registry(tmp_path)
    reg, other = Registry(reg_dir, tmp_path / "home"), Registry(reg_dir, tmp_path / "home")
    e = entry(reg.manifest(), "alpha")
    real_replace, raced = os.replace, []

    def racing(src, dst):
        if not raced:
            raced.append(dst)
            other.ensure(e)  # a second process installs the same pack first
            raise PermissionError("target in use")
        return real_replace(src, dst)

    monkeypatch.setattr(os, "replace", racing)
    path = reg.ensure(e)
    monkeypatch.setattr(os, "replace", real_replace)
    assert raced and (path / "pack.json").is_file() and leftovers(tmp_path / "home") == ["alpha@1.0.0"]


def test_old_tmp_folders_and_older_versions_are_pruned(tmp_path):
    import os
    import time
    packs = tmp_path / "home" / "packs"
    for name in (".tmp-old", ".tmp-new", "alpha@0.9.0", "alpha@2.0.0", "beta@1.5.0"):
        (packs / name).mkdir(parents=True)
        (packs / name / ".sha256").write_text("0" * 64, encoding="ascii")
    old = time.time() - 7200
    os.utime(packs / ".tmp-old", (old, old))
    reg = Registry(local_registry(tmp_path), tmp_path / "home")
    reg.ensure(entry(reg.manifest(), "alpha"))
    assert leftovers(tmp_path / "home") == [".tmp-new", "alpha@1.0.0", "alpha@2.0.0", "beta@1.5.0"]
