"""First-run setup of the installed helper (spec phase 5): an Ollama to talk to, then the model of this device.

Setup.run_once() runs at every start of the installed helper (and again on POST /api/setup/start), so a crash or a
reboot resumes where it stopped:
1. VITRANSLATE_OLLAMA set -> that Ollama as configured ("configured"); nothing is installed.
2. An Ollama answering on 127.0.0.1:11434 -> reused as it is ("system"); it is never started, stopped or changed.
3. An installed but stopped system Ollama (its tray app may start a moment after us at logon) -> wait up to grace_s
   for it before anything is downloaded.
4. Else the portable copy ("portable"): the official Windows build of the pinned Ollama version from Ollama's GitHub
   release, downloaded to <home>/downloads with HTTP range resume, checked against the pinned SHA-256 before it is
   unpacked into <home>/ollama, started hidden as `ollama serve` on 127.0.0.1:11435 with OLLAMA_MODELS =
   <home>/models, inside a kill-on-close job object so that it ends with the helper (also after a crash). A portable
   Ollama that exits is started again by the background loop.
5. The model the recommendation names for this device (recommend.py, via the server's model_needed) is pulled when
   Ollama lacks it (calibrate.ModelPull, with progress; Ollama resumes a partial pull by itself).
The installer's welcome page tells the user what is downloaded, how large and where (spec "Consent screen").

macOS (Apple silicon, installer/macos): the same steps with the official ollama-darwin.tgz of the same version
(BUILDS["darwin"]), unpacked into ~/Library/Application Support/ViTranslate/ollama (bsdtar after Python checked every
entry, so the signed Metal libraries keep their attributes); Ollama.app or a Homebrew ollama counts as the system
Ollama; the portable copy is ended at the helper's exit (ProcGroup) instead of by a job object; its log is in
~/Library/Logs/ViTranslate (config.logs_dir).
"""
import atexit
import hashlib
import json
import logging
import os
import posixpath
import shutil
import subprocess
import sys
import tarfile
import threading
import time
import uuid
import zipfile
from pathlib import Path, PurePosixPath

import httpx

from . import config

log = logging.getLogger("vitranslate.setup")

# Pinned official build (published 2026-09-29, >= 2 weeks before it was pinned; Gemma 4 and Qwen 3.5 supported).
# SHA-256 and size from the release's sha256sum.txt and GitHub's asset digest (both agree).
OLLAMA_VERSION = "0.35.1"
OLLAMA_ASSET = "ollama-windows-amd64.zip"
OLLAMA_URL = "https://github.com/ollama/ollama/releases/download/v%s/%s" % (OLLAMA_VERSION, OLLAMA_ASSET)
OLLAMA_SHA256 = "dc50b9ca7f9023c86525012632cd1615b093d0407987444a7f62ecab617e8e93"
OLLAMA_SIZE = 1471094402
# macOS (universal binary, Metal): the release's ollama-darwin.tgz; SHA-256 and size from its sha256sum.txt and
# GitHub's asset digest (both agree).
BUILDS = {
    "windows": {"version": OLLAMA_VERSION, "asset": OLLAMA_ASSET, "url": OLLAMA_URL, "sha256": OLLAMA_SHA256,
                "size": OLLAMA_SIZE, "exe": "ollama.exe"},
    "darwin": {"version": OLLAMA_VERSION, "asset": "ollama-darwin.tgz",
               "url": "https://github.com/ollama/ollama/releases/download/v%s/ollama-darwin.tgz" % OLLAMA_VERSION,
               "sha256": "3137dbf28948ee844e0fb3e584d9b5de6879d73d9f0cb7eff3ad64930601d307",
               "size": 159625239, "exe": "ollama"},
}
MAC_APP_DIRS = ("/Applications", "~/Applications")


def build_for(platform=None):
    """The pinned Ollama build of this platform (macOS: darwin; everything else: the Windows zip)."""
    return dict(BUILDS["darwin" if (platform or sys.platform) == "darwin" else "windows"])

SYSTEM_URL = "http://127.0.0.1:11434"
PORTABLE_HOST = "127.0.0.1:11435"
PORTABLE_URL = "http://" + PORTABLE_HOST
MARKER = ".vitranslate.json"  # in <home>/ollama: the version and SHA-256 of the build unpacked there
GRACE_S = 45.0
POLL_S = 1.0
START_TIMEOUT_S = 60.0
RETRY_S = 30.0
WATCH_S = 10.0
_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


class SetupError(Exception):
    """A setup step failed (the message names the step and why); the next run tries again."""


class ChecksumError(SetupError):
    """The downloaded file is complete but not the pinned build."""


def ollama_version(url, transport=None, timeout=2.0):
    """The version of the Ollama answering at url, or None when nothing (or something else) answers."""
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            resp = client.get(url.rstrip("/") + "/api/version")
            resp.raise_for_status()
            version = resp.json().get("version")
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    return str(version) if version else "unknown"


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _range_start(header):
    """'bytes 300000-1048575/1048576' -> 300000 (None when absent or malformed)."""
    try:
        return int(header.split(" ", 1)[1].split("-", 1)[0])
    except (AttributeError, IndexError, ValueError):
        return None


def download(url, dest, sha256, size, transport=None, progress=None, timeout=60.0):
    """Download url to dest through dest.part, resuming a partial dest.part with a range request. dest appears only
    after the whole file matches size and sha256; a complete file that does not match is removed (ChecksumError);
    a dropped connection keeps the part for the next run (SetupError)."""
    dest = Path(dest)
    if dest.is_file():
        return dest  # only a verified file is ever renamed to dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    have = part.stat().st_size if part.is_file() else 0
    if have > size:
        part.unlink()
        have = 0
    report = progress or (lambda done, total: None)
    if have < size:
        headers = {"Range": "bytes=%d-" % have} if have else {}
        try:
            with httpx.Client(timeout=httpx.Timeout(timeout, connect=15.0), transport=transport,
                              follow_redirects=True) as client:
                with client.stream("GET", url, headers=headers) as resp:
                    if resp.status_code == 206 and have and _range_start(resp.headers.get("content-range")) == have:
                        mode = "ab"
                    elif resp.status_code == 200:
                        have, mode = 0, "wb"  # the server sends the whole file: start over
                    else:
                        raise SetupError("download: HTTP %d from %s" % (resp.status_code, url))
                    with open(part, mode) as f:
                        for block in resp.iter_bytes():
                            f.write(block)
                            have += len(block)
                            report(have, size)
        except httpx.HTTPError as exc:
            raise SetupError("download: %s" % (str(exc) or type(exc).__name__)) from exc
    got = part.stat().st_size
    if got < size:
        raise SetupError("download: incomplete (%d of %d bytes)" % (got, size))
    if got != size or _sha256(part) != sha256:
        part.unlink()
        raise ChecksumError("download: %s is not the pinned build (SHA-256 / size mismatch)" % dest.name)
    os.replace(part, dest)
    return dest


def _safe_name(name):
    if not name or name.startswith(("/", "\\")) or ":" in name:
        return False
    return ".." not in PurePosixPath(name.replace("\\", "/")).parts


def unpack(zip_path, target, version, sha256):
    """Unpack the Ollama zip into target (via a temp folder, moved into place in one step) and mark the version;
    returns target/ollama.exe. Entries outside the folder or a zip without a top-level ollama.exe are refused."""
    target = Path(target)
    tmp = target.with_name(target.name + ".tmp-" + uuid.uuid4().hex[:8])
    try:
        with zipfile.ZipFile(zip_path) as z:
            names = z.namelist()
            bad = [n for n in names if not _safe_name(n)]
            if bad:
                raise SetupError("unpack: unsafe entry %r" % bad[0])
            if "ollama.exe" not in names:
                raise SetupError("unpack: no ollama.exe at the top of %s" % Path(zip_path).name)
            z.extractall(tmp)
        (tmp / MARKER).write_text(json.dumps({"version": version, "sha256": sha256}), encoding="utf-8")
        if target.exists():
            shutil.rmtree(target)
        os.replace(tmp, target)
    except (zipfile.BadZipFile, OSError) as exc:
        raise SetupError("unpack: %s" % exc) from exc
    finally:
        if tmp.exists():
            shutil.rmtree(tmp, ignore_errors=True)
    return target / "ollama.exe"


def _tar_entries_ok(members, exe):
    """None when every entry of the archive stays in its folder (files, folders and relative links inside it only)
    and `exe` is a file at the top; else the reason."""
    names = set()
    for m in members:
        name = m.name[2:] if m.name.startswith("./") else m.name
        if not _safe_name(name):
            return "unsafe entry %r" % m.name
        if m.issym() or m.islnk():
            if m.linkname.startswith(("/", "\\")):
                return "link %r points outside" % m.name
            dest = posixpath.normpath(posixpath.join(posixpath.dirname(name) if m.issym() else "", m.linkname))
            if dest == ".." or dest.startswith("../"):
                return "link %r points outside" % m.name
        elif not (m.isfile() or m.isdir()):
            return "special entry %r" % m.name
        if m.isfile():
            names.add(name)
    return None if exe in names else "no %s at the top" % exe


def _system_tar():
    return "/usr/bin/tar" if sys.platform == "darwin" and os.path.isfile("/usr/bin/tar") else None


def unpack_tgz(tgz_path, target, version, sha256, exe="ollama", tar_cmd=None, run=subprocess.run):
    """unpack() for the macOS .tgz: every entry is checked first (_tar_entries_ok), then the archive is unpacked by
    bsdtar (tar_cmd; on macOS /usr/bin/tar, which keeps the code-signature attributes of the Metal libraries) or by
    Python's tarfile with the "data" filter; returns target/exe."""
    target = Path(target)
    tmp = target.with_name(target.name + ".tmp-" + uuid.uuid4().hex[:8])
    tar_cmd = _system_tar() if tar_cmd is None else tar_cmd
    try:
        with tarfile.open(tgz_path, "r:gz") as tar:
            why = _tar_entries_ok(tar.getmembers(), exe)
            if why:
                raise SetupError("unpack: %s in %s" % (why, Path(tgz_path).name))
            tmp.mkdir(parents=True)
            if not tar_cmd:
                tar.extractall(tmp, filter="data")
        if tar_cmd:
            res = run([tar_cmd, "-xzf", str(tgz_path), "-C", str(tmp)], capture_output=True, text=True, timeout=600)
            if res.returncode != 0:
                raise SetupError("unpack: tar exit %d: %s" % (res.returncode, (res.stderr or "").strip()[:200]))
        if not (tmp / exe).is_file():
            raise SetupError("unpack: no %s after unpacking %s" % (exe, Path(tgz_path).name))
        (tmp / MARKER).write_text(json.dumps({"version": version, "sha256": sha256}), encoding="utf-8")
        if target.exists():
            shutil.rmtree(target)
        os.replace(tmp, target)
    except (tarfile.TarError, OSError, subprocess.SubprocessError, EOFError) as exc:
        raise SetupError("unpack: %s" % exc) from exc
    finally:
        if tmp.exists():
            shutil.rmtree(tmp, ignore_errors=True)
    return target / exe


def installed_portable(target, version, exe="ollama.exe"):
    """target/<exe> when the build unpacked there is the given version, else None."""
    target = Path(target)
    try:
        marker = json.loads((target / MARKER).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    exe = target / exe
    return exe if isinstance(marker, dict) and marker.get("version") == version and exe.is_file() else None


def _under(path, folder):
    a, b = os.path.normcase(os.path.abspath(str(path))), os.path.normcase(os.path.abspath(str(folder)))
    return a == b or a.startswith(b.rstrip(os.sep) + os.sep)


def system_ollama_exe(localappdata=None, which=shutil.which, own=None, platform=None, app_dirs=MAC_APP_DIRS):
    """An Ollama installed by the user (Windows: the default per-user install folder; macOS: Ollama.app in
    /Applications or ~/Applications; or on PATH, e.g. Homebrew), never the portable copy in `own`; None when there
    is none."""
    if (platform or sys.platform) == "darwin":
        for folder in app_dirs:
            exe = Path(os.path.expanduser(str(folder))) / "Ollama.app" / "Contents" / "Resources" / "ollama"
            if exe.is_file():
                return str(exe)
        local = None
    else:
        local = localappdata if localappdata is not None else os.environ.get("LOCALAPPDATA")
    if local:
        default = Path(local) / "Programs" / "Ollama" / "ollama.exe"
        if default.is_file():
            return str(default)
    found = which("ollama")
    if found and not (own is not None and _under(found, own)):
        return str(found)
    return None


class KillJob:
    """A Windows job object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: every process added to it (and the processes it
    starts) ends when the job's last handle closes, that is when the helper process ends, however it ends. No-op
    outside Windows."""

    def __init__(self):
        self.handle = None
        if os.name != "nt":
            return
        import ctypes
        from ctypes import wintypes

        class Basic(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class Extended(ctypes.Structure):
            _fields_ = [("BasicLimitInformation", Basic), ("IoInfo", ctypes.c_uint64 * 6),
                        ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        k32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        k32.CloseHandle.argtypes = [wintypes.HANDLE]
        self._k32 = k32
        handle = k32.CreateJobObjectW(None, None)
        if not handle:
            raise OSError(ctypes.get_last_error(), "CreateJobObjectW failed")
        info = Extended()
        info.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not k32.SetInformationJobObject(handle, 9, ctypes.byref(info), ctypes.sizeof(info)):
            err = ctypes.get_last_error()
            k32.CloseHandle(handle)
            raise OSError(err, "SetInformationJobObject failed")
        self.handle = handle

    def add(self, proc):
        if self.handle is None:
            return
        import ctypes
        if not self._k32.AssignProcessToJobObject(self.handle, int(proc._handle)):
            raise OSError(ctypes.get_last_error(), "AssignProcessToJobObject failed")

    def close(self):
        if self.handle is not None:
            self._k32.CloseHandle(self.handle)
            self.handle = None


class ProcGroup:
    """Outside Windows: the processes added are ended when the helper exits normally (atexit; uvicorn turns SIGTERM
    into a normal exit). After a hard kill the portable Ollama may stay up: the next start reuses it on 11435 and
    --stop ends it by folder."""

    def __init__(self, register=atexit.register):
        self.procs = []
        register(self.close)

    def add(self, proc):
        self.procs.append(proc)

    def close(self, timeout=5.0):
        procs, self.procs = self.procs, []
        for p in procs:
            if p.poll() is None:
                p.terminate()
        for p in procs:
            try:
                p.wait(timeout)
            except subprocess.TimeoutExpired:
                p.kill()


def new_guard(name=None):
    """What ends the portable Ollama with the helper: a kill-on-close job object on Windows, else a ProcGroup."""
    return KillJob() if (name or os.name) == "nt" else ProcGroup()


def start_portable(exe, models_dir, log_path, popen=subprocess.Popen, job=None):
    """`ollama serve` hidden on 127.0.0.1:11435 with its models in models_dir, output appended to log_path."""
    models_dir, log_path = Path(models_dir), Path(log_path)
    models_dir.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, OLLAMA_HOST=PORTABLE_HOST, OLLAMA_MODELS=str(models_dir))
    with open(log_path, "ab") as out:  # the child keeps its own handle
        proc = popen([str(exe), "serve"], env=env, stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT,
                     cwd=str(Path(exe).parent), creationflags=_NO_WINDOW)
    if job is not None:
        job.add(proc)
    return proc


def _default_download(url, dest, sha256, size, progress=None):
    return download(url, dest, sha256, size, progress=progress)


class Setup:
    """The setup state machine; status() is what GET /api/setup shows: state idle | running | waiting | ready | error,
    step detect | download | unpack | start | model, reason (waiting: ollama | system_ollama_starting), mode system |
    portable | configured, ollama_url, ollama_version, download {done, total} bytes, model (the pull status), error."""

    def __init__(self, home, probe=ollama_version, system_exe=None, download=None, start=None, environ=None,
                 grace_s=GRACE_S, poll_s=POLL_S, start_timeout=START_TIMEOUT_S, retry_s=RETRY_S, watch_s=WATCH_S,
                 build=None, logs=None):
        self.home = Path(home)
        self.build = build or build_for()
        self.logs = Path(logs) if logs is not None else config.logs_dir(self.home)
        self.ollama_dir, self.models_dir = self.home / "ollama", self.home / "models"
        self.zip_path = self.home / "downloads" / self.build["asset"]
        self.probe = probe
        self.system_exe = system_exe or (lambda: system_ollama_exe(own=self.ollama_dir))
        self._download = download or _default_download
        self._start = start or self._start_portable
        self.configured = (os.environ if environ is None else environ).get("VITRANSLATE_OLLAMA")
        self.grace_s, self.poll_s, self.start_timeout = grace_s, poll_s, start_timeout
        self.retry_s, self.watch_s = retry_s, watch_s
        self.model_needed, self.pull = (lambda: None), None
        self._st = {"state": "idle", "step": None, "reason": None, "mode": None, "ollama_url": None,
                    "ollama_version": None, "download": None, "error": None}
        self._lock = threading.Lock()
        self._proc, self._job, self._thread = None, None, None
        self._wake, self._stop = threading.Event(), threading.Event()

    def attach(self, model_needed, pull):
        """model_needed() -> the recommended model when Ollama lacks it, else None; pull: a calibrate.ModelPull."""
        self.model_needed, self.pull = model_needed, pull

    def status(self):
        with self._lock:
            out = dict(self._st)
        out["model"] = self.pull.status() if self.pull is not None else None
        return out

    def _set(self, **kw):
        with self._lock:
            self._st.update(kw)
            return self._st["state"]

    def _progress(self, done, total):
        self._set(download={"done": done, "total": total})

    def _start_portable(self, exe, models_dir, log_path):
        if self._job is None:
            self._job = new_guard()
        return start_portable(exe, models_dir, log_path, job=self._job)

    def _installed(self):
        return installed_portable(self.ollama_dir, self.build["version"], self.build["exe"])

    def _use(self, mode, url, version):
        if mode != "configured":
            config.set_ollama_url(url)
        self._set(mode=mode, ollama_url=url, ollama_version=version)
        log.info("setup: Ollama %s (%s) at %s", version, mode, url)
        return url

    def _portable(self):
        v = self.probe(PORTABLE_URL)  # ours, still running (or one left from an earlier start)
        if v is not None:
            return self._use("portable", PORTABLE_URL, v)
        b = self.build
        exe = self._installed()
        if exe is None:
            self._set(step="download")
            self._download(b["url"], self.zip_path, b["sha256"], b["size"], progress=self._progress)
            self._set(step="unpack")
            if b["asset"].endswith(".tgz"):
                exe = unpack_tgz(self.zip_path, self.ollama_dir, b["version"], b["sha256"], exe=b["exe"])
            else:
                exe = unpack(self.zip_path, self.ollama_dir, b["version"], b["sha256"])
            try:
                os.remove(self.zip_path)
            except OSError:
                pass
        self._set(step="start")
        self._proc = self._start(exe, self.models_dir, self.logs / "ollama.log")
        deadline = time.monotonic() + self.start_timeout
        while True:
            v = self.probe(PORTABLE_URL)
            if v is not None:
                return self._use("portable", PORTABLE_URL, v)
            if self._proc.poll() is not None or time.monotonic() > deadline:
                raise SetupError("start: the portable Ollama did not answer on %s (see logs/ollama.log)"
                                 % PORTABLE_HOST)
            self._stop.wait(self.poll_s)

    def _find_ollama(self):
        if self.configured:
            v = self.probe(self.configured)
            return None if v is None else self._use("configured", self.configured, v)
        v = self.probe(SYSTEM_URL)
        if v is None and self._proc is None and self.system_exe() and self._installed() is None:
            self._set(state="waiting", reason="system_ollama_starting")
            deadline = time.monotonic() + self.grace_s
            while v is None and time.monotonic() < deadline and not self._stop.is_set():
                self._stop.wait(self.poll_s)
                v = self.probe(SYSTEM_URL)
            self._set(state="running", reason=None)
        if v is not None:
            return self._use("system", SYSTEM_URL, v)
        return self._portable()

    def _run(self):
        self._set(state="running", step="detect", reason=None, error=None)
        if self._find_ollama() is None:
            return self._set(state="waiting", reason="ollama")
        self._set(step="model")
        model = self.model_needed()
        if model:
            log.info("setup: pulling %s", model)
            self.pull.start(model)
            self.pull.wait()
            if self.model_needed():
                err = (self.pull.status() or {}).get("error") or "still missing after the download"
                raise SetupError("model %s: %s" % (model, err))
        return self._set(state="ready", step=None)

    def run_once(self):
        """One pass of the steps: ready | waiting | error (never raises)."""
        try:
            return self._run()
        except SetupError as exc:
            log.warning("setup: %s", exc)
            return self._set(state="error", error=str(exc)[:300])
        except Exception as exc:  # the setup thread must never die silently
            log.exception("setup failed")
            return self._set(state="error", error=("%s: %s" % (type(exc).__name__, exc))[:300])

    def _watch(self):
        """While ready: wait for a new run request or for the portable Ollama to exit."""
        while not self._stop.is_set():
            if self._wake.wait(self.watch_s):
                self._wake.clear()
                return
            if self._proc is not None and self._proc.poll() is not None:
                log.warning("setup: the portable Ollama exited (code %s): starting it again", self._proc.poll())
                return

    def _loop(self):
        while not self._stop.is_set():
            if self.run_once() == "ready":
                self._watch()
            else:
                self._wake.wait(self.retry_s)
                self._wake.clear()

    def start(self):
        """Run in the background (and keep watching); when already running, run the steps again now."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                self._wake.set()
                return
            self._thread = threading.Thread(target=self._loop, name="setup", daemon=True)
            self._thread.start()

    def stop(self, timeout=5.0):
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join(timeout)
