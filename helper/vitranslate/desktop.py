"""Entry point of the installed helper: ViTranslate.exe (PyInstaller onedir, no console window; see installer/).

ViTranslate.exe [--open | --stop | vitranslate://start]
- no argument, or any vitranslate: link (the page's start link, registered under HKCU by the installer): start the
  helper hidden. A web page can only start it: every other argument is ignored when a vitranslate: link is present.
- --open (Start Menu): start it when needed and open its own page http://127.0.0.1:<port>/ in the default browser.
- --stop (uninstaller, Start Menu stop entry): end the running helper (its live caption session first, so a hidden
  Live Captions window comes back) and the portable Ollama in its app folder.
Single instance: a named mutex, and a ViTranslate already answering on one of config.PORTS (also one run from
source) -> a second start only opens the page (--open) and exits. Logs: <home>/logs/helper.log (rotated) and
console.log (stdout / stderr: tracebacks). Bundled UI, pack registry and style pack: bundle_paths.

macOS (ViTranslate.app, installer/macos): opened from Finder (no argument) = --open, plus a one-time question
whether to start at login (macos.first_run_question); --login (the LaunchAgent) and vitranslate: links start it only;
--autostart on|off writes / removes the LaunchAgent; --stop goes by folder (macos.stop_processes); logs in
~/Library/Logs/ViTranslate; single instance by the port check only.
"""
import logging
import logging.handlers
import os
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

import httpx

from . import config

MUTEX_NAME = r"Local\ViTranslate.Helper"
ERROR_ALREADY_EXISTS = 183
CONSOLE_MAX_BYTES = 5 * 1024 * 1024
_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

log = logging.getLogger("vitranslate")


def parse_args(argv, platform=None):
    """macOS (ViTranslate.app): no argument = opened from Finder -> also open the page (the bundle's argv emulation
    turns the vitranslate:// launch into an argument, so a link still only starts it); --login (LaunchAgent) starts
    it only; --autostart on|off writes / removes the LaunchAgent."""
    mac = (platform or sys.platform) == "darwin"
    out = {"open": False, "stop": False}
    if mac:
        out["autostart"] = None
        argv = [a for a in argv if not str(a).startswith("-psn_")]  # process serial number (older macOS)
        if not argv:
            out["open"] = True
            return out
    if any(str(a).lower().startswith("vitranslate:") for a in argv):
        return out  # started from a web page: start only
    for i, a in enumerate(argv):
        if a == "--open":
            out["open"] = True
        elif a == "--stop":
            out["stop"] = True
        elif mac and a == "--autostart" and i + 1 < len(argv) and argv[i + 1] in ("on", "off"):
            out["autostart"] = argv[i + 1] == "on"
    return out


def page_url(port):
    return "http://127.0.0.1:%d/" % port


def acquire_instance(name=MUTEX_NAME):
    """A handle of the named mutex when this is the only helper, None when another one holds it (Windows; elsewhere
    the port check alone decides)."""
    if os.name != "nt":
        return object()
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateMutexW.restype = wintypes.HANDLE
    k32.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    ctypes.set_last_error(0)
    handle = k32.CreateMutexW(None, False, name)
    if not handle:
        return object()  # no mutex: the port check still guards
    if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
        k32.CloseHandle(handle)
        return None
    return handle


def release_instance(handle):
    if os.name == "nt" and isinstance(handle, int):
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CloseHandle.argtypes = [wintypes.HANDLE]
        k32.CloseHandle(handle)


def find_running(ports=config.PORTS, transport=None, timeout=5.0):
    """The port of a ViTranslate helper answering /api/health on 127.0.0.1, or None."""
    with httpx.Client(timeout=httpx.Timeout(timeout, connect=0.5), transport=transport) as client:
        for port in ports:
            try:
                resp = client.get("http://127.0.0.1:%d/api/health" % port)
                if resp.status_code == 200 and resp.json().get("app") == config.APP_NAME:
                    return port
            except (httpx.HTTPError, ValueError, AttributeError):
                continue
    return None


def stop_live(ports=config.PORTS, transport=None):
    """Ask a running helper to end its live caption session, so a hidden Live Captions window is shown again (or
    closed) before the helper is ended. True when one answered."""
    port = find_running(ports, transport=transport, timeout=3.0)
    if port is None:
        return False
    try:
        with httpx.Client(timeout=5.0, transport=transport) as client:
            return client.post("http://127.0.0.1:%d/api/live/stop" % port).status_code == 200
    except httpx.HTTPError as exc:
        log.warning("live stop failed: %s", exc)
        return False


def wait_running(timeout=20.0):
    """The port of the helper that holds the lock, once it answers (it may still be starting)."""
    deadline = time.monotonic() + timeout
    while True:
        port = find_running()
        if port is not None or time.monotonic() > deadline:
            return port
        time.sleep(0.5)


def bundle_paths(base, environ=None):
    """Point the helper at the files bundled next to the exe (UI, pack registry, style pack) unless configured."""
    environ = os.environ if environ is None else environ
    for key, rel in (("VITRANSLATE_WEB", "web"), ("VITRANSLATE_REGISTRY", "registry"),
                     ("VITRANSLATE_STYLE", "packs/_style")):
        path = Path(base) / rel
        if key not in environ and path.is_dir():
            environ[key] = str(path)


def setup_logging(home, logger=None):
    """<home>/logs/helper.log (rotated, 3 x 2 MB) for the logger (default: root); a missing console (windowed exe)
    is replaced by <home>/logs/console.log. Returns the helper.log path."""
    logs = config.logs_dir(home)  # macOS: ~/Library/Logs/ViTranslate
    logs.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger() if logger is None else logger
    handler = logging.handlers.RotatingFileHandler(logs / "helper.log", maxBytes=2 * 1024 * 1024, backupCount=3,
                                                   encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    for name in ("httpx", "httpcore"):  # one line per request to Ollama otherwise (the page polls every few s)
        logging.getLogger(name).setLevel(logging.WARNING)
    if sys.stdout is None or sys.stderr is None:
        console = logs / "console.log"
        big = console.is_file() and console.stat().st_size > CONSOLE_MAX_BYTES
        stream = open(console, "w" if big else "a", encoding="utf-8", buffering=1)
        if sys.stdout is None:
            sys.stdout = stream
        if sys.stderr is None:
            sys.stderr = stream
    return logs / "helper.log"


def stop_running(home, run=subprocess.run, pid=None, platform=None):
    """End every other ViTranslate.exe and every process started from <home>/ollama (the portable Ollama and its
    runners), then wait for them to exit. A system Ollama lives elsewhere and is never touched. macOS:
    macos.stop_processes (ps + signals)."""
    if (platform or sys.platform) == "darwin":
        from . import macos
        macos.stop_processes(home)
        return
    folder = (str(Path(home) / "ollama") + os.sep).replace("'", "''")
    me = os.getpid() if pid is None else pid
    script = ("$me = %d; $dir = '%s'; "
              "$p = @(Get-Process | Where-Object { ($_.Name -eq 'ViTranslate' -and $_.Id -ne $me) -or "
              "($_.Path -and $_.Path.StartsWith($dir, [System.StringComparison]::OrdinalIgnoreCase)) }); "
              "$p | Stop-Process -Force -ErrorAction SilentlyContinue; "
              "$p | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue" % (me, folder))
    try:
        run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], capture_output=True, text=True,
            timeout=60, creationflags=_NO_WINDOW)
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("stop failed: %s", exc)


def serve(home, open_page):
    import uvicorn

    from .__main__ import bind_free_socket
    from .server import create_app
    from .setup import Setup

    sock = bind_free_socket()
    port = sock.getsockname()[1]
    log.info("ViTranslate %s: %s", config.VERSION, page_url(port))
    app = create_app(setup=Setup(home))
    if open_page:
        threading.Timer(1.5, webbrowser.open, [page_url(port)]).start()
    server = uvicorn.Server(uvicorn.Config(app, log_config=None, access_log=False, log_level="warning",
                                           timeout_graceful_shutdown=3))
    server.run(sockets=[sock])


def start_first_run_question(home):
    """macOS: ask once, beside the starting helper, whether to start it at login (macos.first_run_question)."""
    from . import macos
    timer = threading.Timer(2.0, macos.first_run_question, [home, macos.app_executable()])
    timer.daemon = True  # an open dialog never keeps a stopping helper alive
    timer.start()


def main(argv=None, home=None):
    mac = sys.platform == "darwin"
    args = parse_args(sys.argv[1:] if argv is None else argv)
    home = config.app_home() if home is None else Path(home)
    setup_logging(home)
    frozen = getattr(sys, "frozen", False)
    if frozen:
        bundle_paths(Path(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))))
    if args["stop"]:
        stop_live()  # the live session first: Live Captions is put back before the helper ends
        stop_running(home)
        return 0
    if mac and args.get("autostart") is not None:
        from . import macos
        log.info("autostart %s: %s", "on" if args["autostart"] else "off",
                 macos.set_autostart(args["autostart"], macos.app_executable()))
        return 0
    lock = acquire_instance()
    port = find_running()
    if lock is None or port is not None:
        port = port or wait_running()
        log.info("another helper is running (port %s): exit", port)
        if args["open"] and port:
            webbrowser.open(page_url(port))
        return 0
    if mac and frozen and args["open"]:
        start_first_run_question(home)
    try:
        serve(home, open_page=args["open"])
    except BaseException:
        log.exception("helper stopped")
        raise
    return 0
