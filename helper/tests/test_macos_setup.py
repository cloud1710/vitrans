"""The macOS helper's first run, process control and LaunchAgent, with the platform mocked: the pinned darwin
Ollama build (download / resume / checksum against a fake server, the .tgz unpack), the Ollama.app / Homebrew
detection, the process guard, the app arguments, --stop by folder, the LaunchAgent and the first-run question.
These run the same on Windows and on the macOS CI runner; test_the_real_darwin_build_* needs the network and a Mac.
"""
import hashlib
import io
import json
import os
import plistlib
import signal
import subprocess
import sys
import tarfile
import time
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from vitranslate import config, desktop, macos
from vitranslate import setup as setup_mod
from vitranslate.setup import PORTABLE_URL, SetupError, Setup, download, installed_portable, unpack_tgz


@pytest.fixture(autouse=True)
def no_url_override(monkeypatch):
    monkeypatch.setattr(config, "_ollama_override", None)


def make_tgz(path, files=None, links=None, top="ollama"):
    """A gzip tar like ollama-darwin.tgz: files {name: bytes} (top-level `top` executable) and symlinks
    {name: target}."""
    files = {top: b"\xcf\xfa\xed\xfe ollama", "libggml-base.0.25.3.dylib": b"dylib",
             "mlx_metal_v3/mlx.metallib": b"metal"} if files is None else files
    links = {"libggml-base.0.dylib": "libggml-base.0.25.3.dylib"} if links is None else links
    with tarfile.open(path, "w:gz") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size, info.mode = len(data), 0o755 if name == top else 0o644
            tar.addfile(info, io.BytesIO(data))
        for name, target in links.items():
            info = tarfile.TarInfo(name)
            info.type, info.linkname = tarfile.SYMTYPE, target
            tar.addfile(info)
    return path


# --- the pinned darwin build --------------------------------------------------------------------------------------

def test_the_darwin_build_is_the_official_tgz_of_the_pinned_version():
    b = setup_mod.build_for("darwin")
    assert b["version"] == setup_mod.OLLAMA_VERSION and b["exe"] == "ollama"
    assert b["asset"] == "ollama-darwin.tgz"
    assert b["url"] == "https://github.com/ollama/ollama/releases/download/v%s/ollama-darwin.tgz" % b["version"]
    assert len(b["sha256"]) == 64 and int(b["sha256"], 16) and b["size"] > 100 * 1024 * 1024


def test_windows_keeps_its_build():
    b = setup_mod.build_for("win32")
    assert (b["url"], b["sha256"], b["size"], b["asset"], b["exe"]) == (
        setup_mod.OLLAMA_URL, setup_mod.OLLAMA_SHA256, setup_mod.OLLAMA_SIZE, setup_mod.OLLAMA_ASSET, "ollama.exe")


# --- unpack -------------------------------------------------------------------------------------------------------

def test_unpack_tgz_puts_ollama_in_place_with_its_libraries_and_marks_the_version(tmp_path):
    target = tmp_path / "ollama"
    exe = unpack_tgz(make_tgz(tmp_path / "o.tgz"), target, "0.35.1", "ab" * 32)
    assert exe == target / "ollama" and (target / "mlx_metal_v3" / "mlx.metallib").read_bytes() == b"metal"
    assert (target / "libggml-base.0.dylib").read_bytes() == b"dylib"  # the symlink (a copy where links fail)
    assert installed_portable(target, "0.35.1", exe="ollama") == exe
    assert installed_portable(target, "0.36.0", exe="ollama") is None
    if os.name != "nt":
        assert os.access(exe, os.X_OK)
    assert not [p for p in tmp_path.iterdir() if ".tmp-" in p.name]


@pytest.mark.parametrize("files,links", [
    ({"ollama": b"x", "../evil": b"x"}, {}),
    ({"ollama": b"x", "/abs": b"x"}, {}),
    ({"ollama": b"x", "lib/../../evil": b"x"}, {}),
    ({"ollama": b"x"}, {"evil": "../../outside"}),
    ({"ollama": b"x"}, {"evil": "/etc/passwd"}),
    ({"bin/ollama": b"x"}, {}),  # no ollama at the top
])
def test_unpack_tgz_refuses_unsafe_or_foreign_archives(tmp_path, files, links):
    target = tmp_path / "app" / "ollama"
    target.parent.mkdir()
    with pytest.raises(SetupError):
        unpack_tgz(make_tgz(tmp_path / "bad.tgz", files=files, links=links), target, "0.35.1", "ab" * 32)
    assert not target.exists() and not (tmp_path / "evil").exists()
    assert not [p for p in target.parent.iterdir() if ".tmp-" in p.name]


def test_unpack_tgz_refuses_a_broken_archive(tmp_path):
    bad = tmp_path / "bad.tgz"
    bad.write_bytes(b"not a tar")
    with pytest.raises(SetupError):
        unpack_tgz(bad, tmp_path / "ollama", "0.35.1", "ab" * 32)


@pytest.mark.skipif(not (Path("/usr/bin/tar").is_file() or Path(os.environ.get("SystemRoot", "C:/Windows"),
                                                                "System32", "tar.exe").is_file()),
                    reason="no system bsdtar")
def test_unpack_tgz_with_the_system_tar_keeps_what_python_checked(tmp_path):
    tar_cmd = "/usr/bin/tar" if Path("/usr/bin/tar").is_file() else str(
        Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32" / "tar.exe")
    target = tmp_path / "ollama"
    exe = unpack_tgz(make_tgz(tmp_path / "o.tgz", links={}), target, "0.35.1", "ab" * 32, tar_cmd=tar_cmd)
    assert exe.read_bytes().endswith(b"ollama") and installed_portable(target, "0.35.1", exe="ollama") == exe


# --- the setup on a Mac: download (fake server), resume, checksum, unpack, start --------------------------------

def fake_release(tgz_bytes, log, cut_after=None):
    def handler(request):
        rng = request.headers.get("range")
        log.append(rng)
        start = int(rng.split("=", 1)[1].split("-", 1)[0]) if rng else 0
        body = tgz_bytes[start:]
        headers = {"Content-Length": str(len(body))}
        if rng:
            headers["Content-Range"] = "bytes %d-%d/%d" % (start, len(tgz_bytes) - 1, len(tgz_bytes))
        if cut_after is not None and not rng:
            class Cut(httpx.SyncByteStream):
                def __iter__(self):
                    yield body[:cut_after]
                    raise httpx.ReadError("connection reset")
            return httpx.Response(206 if rng else 200, headers=headers, stream=Cut())
        return httpx.Response(206 if rng else 200, headers=headers, content=body)
    return httpx.MockTransport(handler)


class MacWorld:
    def __init__(self):
        self.answering, self.started, self.logs = set(), [], []

    def probe(self, url):
        return "0.35.1" if url in self.answering else None

    def start(self, exe, models, log):
        self.started.append((exe, models))
        self.logs.append(log)
        self.answering.add(PORTABLE_URL)
        return SimpleNamespace(poll=lambda: None)


class FakePull:
    def start(self, model):
        pass

    def wait(self, timeout=None):
        return True

    def status(self):
        return None


def mac_setup(tmp_path, world, build, transport):
    def dl(url, dest, sha256, size, progress=None):
        return download(url, dest, sha256, size, transport=transport, progress=progress)
    s = Setup(tmp_path / "home", probe=world.probe, system_exe=lambda: None, download=dl, start=world.start,
              environ={}, grace_s=0.0, poll_s=0.01, start_timeout=1.0, build=build,
              logs=tmp_path / "Library" / "Logs" / "ViTranslate")
    s.attach(model_needed=lambda: None, pull=FakePull())
    return s


def small_build(data, sha=None):
    return dict(setup_mod.build_for("darwin"), url="https://example.invalid/ollama-darwin.tgz",
                sha256=sha or hashlib.sha256(data).hexdigest(), size=len(data))


def test_a_mac_without_ollama_downloads_resumes_unpacks_and_starts_the_portable_copy(tmp_path):
    data = make_tgz(tmp_path / "src.tgz").read_bytes()
    log, world = [], MacWorld()
    s = mac_setup(tmp_path, world, small_build(data), fake_release(data, log, cut_after=40))
    assert s.run_once() == "error" and "download" in s.status()["error"]  # the connection drops mid-file
    home = tmp_path / "home"
    assert (home / "downloads" / "ollama-darwin.tgz.part").stat().st_size == 40
    assert s.run_once() == "ready"  # the next run (or a restart) resumes the file
    assert log == [None, "bytes=40-"]
    assert world.started == [(home / "ollama" / "ollama", home / "models")]
    assert world.logs == [tmp_path / "Library" / "Logs" / "ViTranslate" / "ollama.log"]
    st = s.status()
    assert st["mode"] == "portable" and st["ollama_url"] == PORTABLE_URL
    assert not (home / "downloads" / "ollama-darwin.tgz").exists()
    assert installed_portable(home / "ollama", setup_mod.OLLAMA_VERSION, exe="ollama")


def test_a_mac_download_that_is_not_the_pinned_build_is_refused(tmp_path):
    data = make_tgz(tmp_path / "src.tgz").read_bytes()
    world = MacWorld()
    s = mac_setup(tmp_path, world, small_build(data, sha="0" * 64), fake_release(data, []))
    assert s.run_once() == "error" and "SHA-256" in s.status()["error"]
    assert world.started == [] and not (tmp_path / "home" / "ollama").exists()


def test_a_mac_with_ollama_app_running_reuses_it(tmp_path):
    world = MacWorld()
    world.answering.add(setup_mod.SYSTEM_URL)
    s = mac_setup(tmp_path, world, small_build(b"x"), fake_release(b"x", []))
    assert s.run_once() == "ready" and s.status()["mode"] == "system" and world.started == []


def test_the_system_ollama_on_a_mac_is_ollama_app_or_homebrew_never_our_copy(tmp_path):
    apps = tmp_path / "Applications"
    exe = apps / "Ollama.app" / "Contents" / "Resources" / "ollama"
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b"x")
    ours = tmp_path / "ViTranslate" / "ollama"
    find = setup_mod.system_ollama_exe
    assert find(which=lambda n: None, own=ours, platform="darwin", app_dirs=[apps]) == str(exe)
    exe.unlink()
    brew = "/opt/homebrew/bin/ollama"
    assert find(which=lambda n: brew, own=ours, platform="darwin", app_dirs=[apps]) == brew
    assert find(which=lambda n: str(ours / "ollama"), own=ours, platform="darwin", app_dirs=[apps]) is None


def test_outside_windows_the_portable_ollama_ends_with_the_helper():
    assert isinstance(setup_mod.new_guard("posix"), setup_mod.ProcGroup)
    registered = []
    group = setup_mod.ProcGroup(register=registered.append)
    assert registered == [group.close]  # at exit (uvicorn turns SIGTERM into a normal exit)
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    try:
        group.add(child)
        group.close()
        assert child.poll() is not None
    finally:
        if child.poll() is None:
            child.kill()


@pytest.mark.skipif(not (os.environ.get("VITRANSLATE_NET_TESTS") == "1" and sys.platform == "darwin"),
                    reason="network + macOS only (CI: VITRANSLATE_NET_TESTS=1)")
def test_the_real_darwin_build_downloads_unpacks_and_serves_on_11435(tmp_path):
    b = setup_mod.build_for("darwin")
    tgz = download(b["url"], tmp_path / b["asset"], b["sha256"], b["size"])
    exe = unpack_tgz(tgz, tmp_path / "ollama", b["version"], b["sha256"])
    group = setup_mod.ProcGroup(register=lambda fn: None)
    proc = setup_mod.start_portable(exe, tmp_path / "models", tmp_path / "ollama.log", job=group)
    try:
        deadline = time.monotonic() + 60
        version = None
        while version is None and time.monotonic() < deadline and proc.poll() is None:
            time.sleep(0.5)
            version = setup_mod.ollama_version(PORTABLE_URL)
        assert version == b["version"], (tmp_path / "ollama.log").read_text(errors="replace")[-2000:]
    finally:
        group.close()


# --- the app: arguments, --stop, single start ---------------------------------------------------------------------

def test_mac_arguments_finder_opens_the_page_links_and_login_only_start():
    parse = desktop.parse_args
    assert parse([], "darwin")["open"] is True  # a double-click in Finder / Launchpad
    assert parse(["-psn_0_12345"], "darwin")["open"] is True  # older macOS adds a process serial number
    for argv in (["vitranslate://start"], ["--login"], ["VITRANSLATE://stop"]):
        assert parse(argv, "darwin") == {"open": False, "stop": False, "autostart": None}
    assert parse(["--open"], "darwin")["open"] is True and parse(["--stop"], "darwin")["stop"] is True
    assert parse(["--autostart", "on"], "darwin")["autostart"] is True
    assert parse(["--autostart", "off"], "darwin")["autostart"] is False
    assert parse(["vitranslate://x", "--autostart", "on"], "darwin")["autostart"] is None  # a page can not set it
    assert parse([], "win32") == {"open": False, "stop": False}  # Windows unchanged


PS = """  101 /Applications/ViTranslate.app/Contents/MacOS/ViTranslate
  102 {home}/ollama/ollama
  103 {home}/ollama/ollama
  104 /Applications/Ollama.app/Contents/Resources/ollama
  105 /Applications/ViTranslate.app/Contents/MacOS/ViTranslate
  106 /usr/libexec/ViTranslateHelperNot
"""


def test_mac_stop_ends_other_helpers_and_only_our_portable_ollama(tmp_path):
    home = tmp_path / "Library" / "Application Support" / "ViTranslate"
    sent, alive = [], {101, 102, 103, 104, 105, 106}

    def run(cmd, **kw):
        assert cmd[:2] == ["ps", "-axo"]
        return SimpleNamespace(returncode=0, stdout=PS.format(home=home.as_posix()))

    def kill(pid, sig):
        if sig == 0:
            if pid not in alive:
                raise ProcessLookupError(pid)
            return
        sent.append((pid, sig))
        alive.discard(pid)

    macos.stop_processes(home, run=run, kill=kill, pid=105, sleep=lambda s: None)
    assert sent == [(101, signal.SIGTERM), (102, signal.SIGTERM), (103, signal.SIGTERM)]


def test_mac_stop_kills_what_does_not_end_in_time(tmp_path):
    home = tmp_path / "h"
    sent = []

    def run(cmd, **kw):
        return SimpleNamespace(returncode=0, stdout="  7 %s/ollama/ollama\n" % home.as_posix())

    def kill(pid, sig):
        if sig != 0:
            sent.append(sig)

    clock = iter(range(100))
    macos.stop_processes(home, run=run, kill=kill, pid=1, sleep=lambda s: None, clock=lambda: next(clock), wait_s=5)
    assert sent == [signal.SIGTERM, getattr(signal, "SIGKILL", 9)]


def test_desktop_stop_on_a_mac_goes_by_folder(tmp_path, monkeypatch):
    seen = []
    monkeypatch.setattr(macos, "stop_processes", lambda home, **kw: seen.append(home))
    desktop.stop_running(tmp_path, platform="darwin")
    assert seen == [tmp_path]


# --- LaunchAgent (off by default) and the first-run question --------------------------------------------------

EXE = "/Applications/ViTranslate.app/Contents/MacOS/ViTranslate"


def test_the_launch_agent_starts_the_helper_at_login_without_a_page(tmp_path):
    path = macos.set_autostart(True, EXE, user_home=tmp_path)
    assert path == tmp_path / "Library" / "LaunchAgents" / (macos.AGENT_LABEL + ".plist")
    plist = plistlib.loads(path.read_bytes())
    assert plist["Label"] == macos.AGENT_LABEL and plist["ProgramArguments"] == [EXE, "--login"]
    assert plist["RunAtLoad"] is True and plist.get("KeepAlive", False) is False
    assert macos.autostart_enabled(user_home=tmp_path)
    macos.set_autostart(False, EXE, user_home=tmp_path)
    assert not path.exists() and not macos.autostart_enabled(user_home=tmp_path)
    macos.set_autostart(False, EXE, user_home=tmp_path)  # already off: no error


def answer(button):
    calls = []

    def run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="button returned:%s, gave up:false\n" % button)
    run.calls = calls
    return run


def test_the_first_run_asks_once_and_autostart_stays_off_unless_yes(tmp_path):
    home, user = tmp_path / "home", tmp_path / "u"
    run = answer(macos.NO)
    assert macos.first_run_question(home, EXE, run=run, user_home=user) is False
    assert not macos.autostart_enabled(user_home=user)
    assert run.calls[0][0] == "osascript"
    assert macos.first_run_question(home, EXE, run=answer(macos.YES), user_home=user) is None  # asked already
    assert json.loads((home / macos.FIRST_RUN).read_text(encoding="utf-8")) == {"autostart": False}


def test_yes_turns_the_launch_agent_on(tmp_path):
    assert macos.first_run_question(tmp_path / "h", EXE, run=answer(macos.YES), user_home=tmp_path / "u") is True
    assert macos.autostart_enabled(user_home=tmp_path / "u")


def test_a_failed_or_timed_out_dialog_means_no(tmp_path):
    def broken(cmd, **kw):
        raise FileNotFoundError("osascript")
    assert macos.ask_autostart(run=broken) is False

    def gave_up(cmd, **kw):
        return SimpleNamespace(returncode=0, stdout="button returned:, gave up:true\n")
    assert macos.ask_autostart(run=gave_up) is False


def test_mac_main_autostart_flag_writes_the_agent_and_exits(tmp_path, monkeypatch):
    seen = []
    monkeypatch.setattr(desktop.sys, "platform", "darwin")
    monkeypatch.setattr(macos, "set_autostart", lambda on, exe, user_home=None: seen.append((on, exe)))
    monkeypatch.setattr(desktop, "serve", lambda home, open_page: pytest.fail("must not serve"))
    monkeypatch.setattr(desktop, "setup_logging", lambda home, logger=None: home / "helper.log")
    assert desktop.main(["--autostart", "on"], home=tmp_path) == 0 and seen and seen[0][0] is True


def test_mac_main_asks_the_first_run_question_only_when_opened_from_finder(tmp_path, monkeypatch):
    asked, served = [], []
    monkeypatch.setattr(desktop.sys, "platform", "darwin")
    monkeypatch.setattr(desktop.sys, "frozen", True, raising=False)
    monkeypatch.setattr(desktop, "bundle_paths", lambda base, environ=None: None)
    monkeypatch.setattr(desktop, "acquire_instance", lambda name=desktop.MUTEX_NAME: object())
    monkeypatch.setattr(desktop, "find_running", lambda **kw: None)
    monkeypatch.setattr(desktop, "serve", lambda home, open_page: served.append(open_page))
    monkeypatch.setattr(desktop, "setup_logging", lambda home, logger=None: home / "helper.log")
    monkeypatch.setattr(desktop, "start_first_run_question", lambda home: asked.append(home))
    assert desktop.main([], home=tmp_path) == 0 and served == [True] and asked == [tmp_path]
    assert desktop.main(["--login"], home=tmp_path) == 0 and served == [True, False] and asked == [tmp_path]


def test_mac_logs_go_to_the_user_library_logs(tmp_path, monkeypatch):
    import logging
    monkeypatch.delenv("VITRANSLATE_HOME", raising=False)
    monkeypatch.setattr(config.sys, "platform", "darwin")
    monkeypatch.setattr(config.Path, "home", classmethod(lambda cls: tmp_path / "u"))
    logger = logging.getLogger("vitranslate-test-maclogs")
    path = desktop.setup_logging(tmp_path / "home", logger=logger)
    try:
        assert path == tmp_path / "u" / "Library" / "Logs" / "ViTranslate" / "helper.log"
    finally:
        for h in list(logger.handlers):
            logger.removeHandler(h)
            h.close()
