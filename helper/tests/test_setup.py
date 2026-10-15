"""First-run setup of the installed helper: Ollama found or installed (portable copy), then the device's model.

No network: every download goes to an httpx.MockTransport "server"; processes are faked except in the job-object
test, which starts a local Python child.
"""
import hashlib
import io
import json
import os
import subprocess
import sys
import time
import zipfile

import httpx
import pytest

from vitranslate import config
from vitranslate import setup as setup_mod
from vitranslate.setup import (PORTABLE_URL, SYSTEM_URL, ChecksumError, Setup, SetupError, download,
                               installed_portable, start_portable, system_ollama_exe, unpack)

DATA = bytes(range(256)) * 4096  # 1 MiB
SHA = hashlib.sha256(DATA).hexdigest()


@pytest.fixture(autouse=True)
def no_url_override(monkeypatch):
    monkeypatch.setattr(config, "_ollama_override", None)


class Cut(httpx.SyncByteStream):
    """A body that breaks off after `limit` bytes (a dropped connection)."""

    def __init__(self, body, limit):
        self.body, self.limit = body, limit

    def __iter__(self):
        sent = 0
        while sent < self.limit:
            n = min(65536, self.limit - sent)
            yield self.body[sent:sent + n]
            sent += n
        raise httpx.ReadError("connection reset")


def server(data, log, honour_range=True, cut_after=None):
    def handler(request):
        rng = request.headers.get("range")
        log.append(rng)
        if rng and honour_range:
            start = int(rng.split("=", 1)[1].split("-", 1)[0])
            body, status = data[start:], 206
            headers = {"Content-Range": "bytes %d-%d/%d" % (start, len(data) - 1, len(data))}
        else:
            body, status, headers = data, 200, {}
        headers["Content-Length"] = str(len(body))
        if cut_after is not None:
            return httpx.Response(status, headers=headers, stream=Cut(body, cut_after))
        return httpx.Response(status, headers=headers, content=body)
    return httpx.MockTransport(handler)


# --- download: resume + checksum ---------------------------------------------------------------------------------

def test_download_writes_the_file_only_after_the_checksum_matches(tmp_path):
    log, seen = [], []
    dest = tmp_path / "o.zip"
    out = download("https://x/o.zip", dest, SHA, len(DATA), transport=server(DATA, log),
                   progress=lambda done, total: seen.append((done, total)))
    assert out == dest and dest.read_bytes() == DATA and not (tmp_path / "o.zip.part").exists()
    assert log == [None] and seen[-1] == (len(DATA), len(DATA))


def test_download_resumes_a_partial_file_with_a_range_request(tmp_path):
    log = []
    dest = tmp_path / "o.zip"
    (tmp_path / "o.zip.part").write_bytes(DATA[:300000])
    download("https://x/o.zip", dest, SHA, len(DATA), transport=server(DATA, log))
    assert log == ["bytes=300000-"] and dest.read_bytes() == DATA


def test_a_dropped_download_keeps_its_part_and_the_next_run_resumes(tmp_path):
    log = []
    dest = tmp_path / "o.zip"
    with pytest.raises(SetupError):
        download("https://x/o.zip", dest, SHA, len(DATA), transport=server(DATA, log, cut_after=400000))
    part = tmp_path / "o.zip.part"
    assert part.stat().st_size == 400000 and not dest.exists()
    download("https://x/o.zip", dest, SHA, len(DATA), transport=server(DATA, log))  # e.g. after a reboot
    assert log == [None, "bytes=400000-"] and dest.read_bytes() == DATA


def test_a_server_that_ignores_the_range_restarts_from_zero(tmp_path):
    log = []
    dest = tmp_path / "o.zip"
    (tmp_path / "o.zip.part").write_bytes(b"\0" * 1000)
    download("https://x/o.zip", dest, SHA, len(DATA), transport=server(DATA, log, honour_range=False))
    assert log == ["bytes=1000-"] and dest.read_bytes() == DATA


def test_a_part_larger_than_the_file_starts_over(tmp_path):
    log = []
    dest = tmp_path / "o.zip"
    (tmp_path / "o.zip.part").write_bytes(DATA + b"junk")
    download("https://x/o.zip", dest, SHA, len(DATA), transport=server(DATA, log))
    assert log == [None] and dest.read_bytes() == DATA


def test_a_checksum_mismatch_removes_the_part_and_fails(tmp_path):
    dest = tmp_path / "o.zip"
    with pytest.raises(ChecksumError):
        download("https://x/o.zip", dest, "0" * 64, len(DATA), transport=server(DATA, []))
    assert not dest.exists() and not (tmp_path / "o.zip.part").exists()


def test_a_finished_download_is_not_fetched_again(tmp_path):
    log = []
    dest = tmp_path / "o.zip"
    dest.write_bytes(DATA)
    assert download("https://x/o.zip", dest, SHA, len(DATA), transport=server(DATA, log)) == dest and log == []


def test_an_http_error_is_a_setup_error(tmp_path):
    def gone(request):
        return httpx.Response(404)
    with pytest.raises(SetupError):
        download("https://x/o.zip", tmp_path / "o.zip", SHA, len(DATA), transport=httpx.MockTransport(gone))


# --- unpack ------------------------------------------------------------------------------------------------------

def make_zip(path, names=("ollama.exe", "lib/ollama/ggml-base.dll")):
    with zipfile.ZipFile(path, "w") as z:
        for n in names:
            z.writestr(n, b"MZ" + n.encode("ascii"))
    return path


def test_unpack_puts_the_portable_ollama_in_place_and_marks_its_version(tmp_path):
    target = tmp_path / "ollama"
    exe = unpack(make_zip(tmp_path / "o.zip"), target, "0.35.1", "ab" * 32)
    assert exe == target / "ollama.exe" and (target / "lib" / "ollama" / "ggml-base.dll").is_file()
    assert installed_portable(target, "0.35.1") == exe
    assert installed_portable(target, "0.36.0") is None  # another pinned version: install again
    assert not [p for p in tmp_path.iterdir() if ".tmp-" in p.name]


def test_unpack_refuses_entries_outside_its_folder(tmp_path):
    target = tmp_path / "app" / "ollama"
    target.parent.mkdir()
    for bad in ("../evil.txt", "/abs.txt", "C:/x.txt", "lib/../../evil.txt"):
        with pytest.raises(SetupError):
            unpack(make_zip(tmp_path / "bad.zip", names=("ollama.exe", bad)), target, "0.35.1", "ab" * 32)
    assert not target.exists() and not (tmp_path / "evil.txt").exists()
    assert not [p for p in target.parent.iterdir() if ".tmp-" in p.name]


def test_unpack_needs_ollama_exe_at_the_top(tmp_path):
    with pytest.raises(SetupError):
        unpack(make_zip(tmp_path / "o.zip", names=("bin/ollama.exe",)), tmp_path / "ollama", "0.35.1", "ab" * 32)


def test_unpack_replaces_a_stale_copy(tmp_path):
    target = tmp_path / "ollama"
    target.mkdir()
    (target / "old.dll").write_bytes(b"old")
    unpack(make_zip(tmp_path / "o.zip"), target, "0.35.1", "ab" * 32)
    assert not (target / "old.dll").exists() and installed_portable(target, "0.35.1")


# --- system Ollama and the portable process ----------------------------------------------------------------------

def test_system_ollama_exe_finds_the_default_install_but_never_our_copy(tmp_path):
    local = tmp_path / "Local"
    exe = local / "Programs" / "Ollama" / "ollama.exe"
    ours = local / "ViTranslate" / "ollama" / "ollama.exe"
    for p in (exe, ours):
        p.parent.mkdir(parents=True)
        p.write_bytes(b"MZ")
    assert system_ollama_exe(local, which=lambda name: str(ours), own=ours.parent) == str(exe)
    exe.unlink()
    assert system_ollama_exe(local, which=lambda name: str(ours), own=ours.parent) is None
    other = tmp_path / "tools" / "ollama.exe"
    assert system_ollama_exe(local, which=lambda name: str(other), own=ours.parent) == str(other)


def test_start_portable_runs_serve_hidden_on_11435_with_models_in_the_app_folder(tmp_path):
    seen = {}

    class FakePopen:
        def __init__(self, args, **kw):
            seen["args"], seen["kw"] = args, kw

    added = []

    class Job:
        def add(self, proc):
            added.append(proc)

    proc = start_portable(tmp_path / "ollama" / "ollama.exe", tmp_path / "models", tmp_path / "logs" / "ollama.log",
                          popen=FakePopen, job=Job())
    assert seen["args"] == [str(tmp_path / "ollama" / "ollama.exe"), "serve"]
    env = seen["kw"]["env"]
    assert env["OLLAMA_HOST"] == "127.0.0.1:11435" and env["OLLAMA_MODELS"] == str(tmp_path / "models")
    assert (tmp_path / "models").is_dir() and (tmp_path / "logs" / "ollama.log").exists()
    if os.name == "nt":
        assert seen["kw"]["creationflags"] & 0x08000000  # CREATE_NO_WINDOW
    assert added == [proc]


@pytest.mark.skipif(os.name != "nt", reason="Windows job objects")
def test_processes_in_the_kill_job_end_when_the_job_is_closed():
    job = setup_mod.KillJob()
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    try:
        job.add(child)
        assert child.poll() is None
        job.close()  # what Windows does when the helper process ends, also after a crash
        assert child.wait(timeout=10) is not None
    finally:
        if child.poll() is None:
            child.kill()


# --- the setup state machine -------------------------------------------------------------------------------------

class World:
    """Fake machine: which Ollama answers, what is installed, what was downloaded / started / pulled."""

    def __init__(self, tmp_path, system=False, system_exe=None, zip_path=None):
        self.answering = {SYSTEM_URL} if system else set()
        self.system_exe = system_exe
        self.zip_path = zip_path or make_zip(tmp_path / "src.zip")
        self.downloads, self.started, self.probes = [], [], []
        self.fail_download = None

    def probe(self, url):
        self.probes.append(url)
        return "0.40.4" if url in self.answering else None

    def download(self, url, dest, sha256, size, progress=None):
        self.downloads.append(url)
        if self.fail_download:
            err, self.fail_download = self.fail_download, None
            raise err
        progress(size, size)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(self.zip_path.read_bytes())
        return dest

    def start(self, exe, models, log):
        self.started.append((exe, models))
        self.answering.add(PORTABLE_URL)

        class Proc:
            def poll(self):
                return None
        return Proc()


class FakePull:
    def __init__(self):
        self.models = []

    def start(self, model):
        self.models.append(model)

    def wait(self, timeout=None):
        return True

    def status(self):
        return {"model": self.models[-1] if self.models else None, "state": "done" if self.models else "idle",
                "error": None, "completed": 10, "total": 10}


def make_setup(tmp_path, world, needed=(None,), environ=None, grace_s=0.0, pull=None):
    left = list(needed)
    s = Setup(tmp_path / "home", probe=world.probe, system_exe=lambda: world.system_exe, download=world.download,
              start=world.start, environ={} if environ is None else environ, grace_s=grace_s, poll_s=0.01,
              start_timeout=1.0)
    s.attach(model_needed=lambda: left.pop(0) if len(left) > 1 else left[0], pull=pull or FakePull())
    return s


def test_a_running_ollama_on_11434_is_reused_and_nothing_is_downloaded(tmp_path):
    w = World(tmp_path, system=True)
    s = make_setup(tmp_path, w)
    assert s.run_once() == "ready"
    st = s.status()
    assert st["state"] == "ready" and st["mode"] == "system" and st["ollama_url"] == SYSTEM_URL
    assert w.downloads == [] and w.started == [] and config._ollama_override == SYSTEM_URL


def test_without_ollama_the_portable_copy_is_downloaded_unpacked_and_started_hidden(tmp_path):
    w = World(tmp_path)
    s = make_setup(tmp_path, w)
    assert s.run_once() == "ready"
    home = tmp_path / "home"
    assert w.downloads == [setup_mod.OLLAMA_URL]
    assert w.started == [(home / "ollama" / "ollama.exe", home / "models")]
    st = s.status()
    assert st["mode"] == "portable" and st["ollama_url"] == PORTABLE_URL and config._ollama_override == PORTABLE_URL
    assert st["download"] == {"done": setup_mod.OLLAMA_SIZE, "total": setup_mod.OLLAMA_SIZE}
    assert not (home / "downloads" / setup_mod.OLLAMA_ASSET).exists()  # the zip is removed once unpacked


def test_an_installed_portable_copy_is_started_without_downloading(tmp_path):
    w = World(tmp_path)
    home = tmp_path / "home"
    unpack(make_zip(tmp_path / "o.zip"), home / "ollama", setup_mod.OLLAMA_VERSION, setup_mod.OLLAMA_SHA256)
    s = make_setup(tmp_path, w)
    assert s.run_once() == "ready" and w.downloads == [] and len(w.started) == 1


def test_an_installed_but_stopped_system_ollama_gets_a_grace_period_before_any_download(tmp_path):
    w = World(tmp_path, system_exe=r"C:\Users\u\AppData\Local\Programs\Ollama\ollama.exe")
    calls = []

    def late_probe(url):
        calls.append(url)
        if url == SYSTEM_URL and calls.count(SYSTEM_URL) >= 3:  # its tray app starts a moment after us
            return "0.40.4"
        return None
    w.probe = late_probe
    s = make_setup(tmp_path, w, grace_s=5.0)
    assert s.run_once() == "ready" and s.status()["mode"] == "system" and w.downloads == []


def test_after_the_grace_period_the_portable_copy_is_installed(tmp_path):
    w = World(tmp_path, system_exe=r"C:\Users\u\AppData\Local\Programs\Ollama\ollama.exe")
    s = make_setup(tmp_path, w, grace_s=0.05)
    assert s.run_once() == "ready" and s.status()["mode"] == "portable" and len(w.downloads) == 1


def test_a_configured_ollama_url_is_used_as_is(tmp_path):
    w = World(tmp_path)
    w.answering.add("http://10.0.0.5:11434")
    s = make_setup(tmp_path, w, environ={"VITRANSLATE_OLLAMA": "http://10.0.0.5:11434"})
    assert s.run_once() == "ready"
    assert s.status()["mode"] == "configured" and s.status()["ollama_url"] == "http://10.0.0.5:11434"
    assert w.downloads == [] and config._ollama_override is None


def test_a_configured_ollama_that_does_not_answer_waits(tmp_path):
    w = World(tmp_path)
    s = make_setup(tmp_path, w, environ={"VITRANSLATE_OLLAMA": "http://10.0.0.5:11434"})
    assert s.run_once() == "waiting" and s.status()["reason"] == "ollama" and w.downloads == []


def test_the_recommended_model_is_pulled_when_missing(tmp_path):
    w = World(tmp_path, system=True)
    pull = FakePull()
    s = make_setup(tmp_path, w, needed=("gemma4:e4b", None), pull=pull)
    assert s.run_once() == "ready" and pull.models == ["gemma4:e4b"]
    assert s.status()["model"]["model"] == "gemma4:e4b"


def test_a_model_still_missing_after_the_pull_is_an_error(tmp_path):
    w = World(tmp_path, system=True)

    class Failing(FakePull):
        def status(self):
            return dict(super().status(), state="error", error="disk full")
    s = make_setup(tmp_path, w, needed=("gemma4:e4b",), pull=Failing())
    assert s.run_once() == "error"
    st = s.status()
    assert st["state"] == "error" and st["step"] == "model" and "disk full" in st["error"]


def test_a_failed_download_is_reported_and_the_next_run_goes_on(tmp_path):
    w = World(tmp_path)
    w.fail_download = SetupError("download: connection reset")
    s = make_setup(tmp_path, w)
    assert s.run_once() == "error"
    st = s.status()
    assert st["state"] == "error" and st["step"] == "download" and "connection reset" in st["error"]
    assert s.run_once() == "ready" and len(w.downloads) == 2


def test_a_portable_ollama_that_does_not_come_up_is_an_error(tmp_path):
    w = World(tmp_path)

    def dead_start(exe, models, log):
        w.started.append((exe, models))

        class Proc:
            def poll(self):
                return 1
        return Proc()
    w.start = dead_start
    s = make_setup(tmp_path, w)
    s.start_timeout = 0.05
    assert s.run_once() == "error" and s.status()["step"] == "start"


def test_status_before_any_run_is_idle(tmp_path):
    s = make_setup(tmp_path, World(tmp_path))
    st = s.status()
    assert st["state"] == "idle" and st["mode"] is None and st["download"] is None


def test_the_background_loop_reaches_ready_and_restarts_a_portable_ollama_that_exited(tmp_path):
    w = World(tmp_path)
    procs = []

    def start(exe, models, log):
        w.started.append((exe, models))
        w.answering.add(PORTABLE_URL)

        class Proc:
            code = None

            def poll(self):
                return self.code
        p = Proc()
        procs.append(p)
        return p
    w.start = start
    s = make_setup(tmp_path, w)
    s.watch_s = 0.02
    s.start()
    for _ in range(200):
        if s.status()["state"] == "ready":
            break
        time.sleep(0.01)
    assert s.status()["state"] == "ready" and len(procs) == 1
    w.answering.discard(PORTABLE_URL)
    procs[0].code = 3  # crashed
    for _ in range(300):
        if len(procs) == 2 and s.status()["state"] == "ready":
            break
        time.sleep(0.01)
    s.stop()
    assert len(procs) == 2 and len(w.downloads) == 1  # restarted from the installed copy, not downloaded again
