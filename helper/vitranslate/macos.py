"""macOS parts of the installed helper (ViTranslate.app, installer/macos): the app bundle's Info.plist entries, the
optional LaunchAgent (start at login, off by default, asked once at the first start from Finder), and --stop by
folder.

- bundle_info(version): what installer/macos/vitranslate-macos.spec puts into Contents/Info.plist: no Dock icon
  (LSUIElement), the vitranslate:// scheme (CFBundleURLTypes: the page's start link launches the app), arm64.
- The LaunchAgent ~/Library/LaunchAgents/<AGENT_LABEL>.plist runs the app with --login (start only, no page) at
  login. `ViTranslate --autostart on|off` changes it later; the uninstall script removes it.
- stop_processes(): the other ViTranslate app processes and every process started from <home>/ollama (the portable
  Ollama and its runners) get SIGTERM, then SIGKILL after wait_s. Ollama.app or a Homebrew Ollama is never touched.
Console / dialog texts in Vietnamese are written with \\u escapes (the .py files are ASCII only).
"""
import json
import os
import plistlib
import signal
import subprocess
import sys
import time
from pathlib import Path

from . import config

BUNDLE_ID = "io.github.cloud1710.vitranslate"
AGENT_LABEL = BUNDLE_ID + ".helper"
APP_PATH = "/Applications/ViTranslate.app"
MIN_MACOS = "14.0"  # the Ollama macOS build's minimum (Sonoma)
FIRST_RUN = "first-run.json"  # in the app home: the first-run question was asked (and its answer)
YES, NO = "C\u00f3", "Kh\u00f4ng"
QUESTION = ("Kh\u1edfi \u0111\u1ed9ng ViTranslate m\u1ed7i khi \u0111\u0103ng nh\u1eadp m\u00e1y Mac?\n\n"
            "Start ViTranslate when you log in?\n\n"
            "\u0110\u1ed5i l\u1ea1i sau / change later:\n"
            + APP_PATH + "/Contents/MacOS/ViTranslate --autostart on|off")
DIALOG = ("on run argv\n"
          "return display dialog (item 1 of argv) with title \"ViTranslate\" buttons {item 2 of argv, item 3 of argv}"
          " default button (item 2 of argv) giving up after 120\n"
          "end run")
SIGKILL = getattr(signal, "SIGKILL", 9)


def bundle_info(version):
    """Info.plist entries of ViTranslate.app (PyInstaller adds the executable / package keys)."""
    return {"CFBundleName": config.APP_NAME, "CFBundleDisplayName": config.APP_NAME,
            "CFBundleIdentifier": BUNDLE_ID, "CFBundleShortVersionString": version, "CFBundleVersion": version,
            "LSUIElement": True, "LSMinimumSystemVersion": MIN_MACOS, "LSArchitecturePriority": ["arm64"],
            "CFBundleURLTypes": [{"CFBundleURLName": BUNDLE_ID, "CFBundleURLSchemes": ["vitranslate"]}],
            "NSHumanReadableCopyright": "AGPL-3.0, github.com/cloud1710/vitrans"}


def app_executable():
    """The app's own binary (Contents/MacOS/ViTranslate) when frozen, else where the dmg installs it."""
    if getattr(sys, "frozen", False):
        return sys.executable
    return APP_PATH + "/Contents/MacOS/ViTranslate"


# --- LaunchAgent ------------------------------------------------------------------------------------------------

def agent_path(user_home=None):
    home = Path.home() if user_home is None else Path(user_home)
    return home / "Library" / "LaunchAgents" / (AGENT_LABEL + ".plist")


def agent_plist(exe):
    return plistlib.dumps({"Label": AGENT_LABEL, "ProgramArguments": [str(exe), "--login"], "RunAtLoad": True,
                           "LimitLoadToSessionType": "Aqua"})


def set_autostart(enabled, exe, user_home=None):
    """Write (enabled) or remove the LaunchAgent; it takes effect at the next login. Returns its path."""
    path = agent_path(user_home)
    if enabled:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(agent_plist(exe))
    elif path.exists():
        path.unlink()
    return path


def autostart_enabled(user_home=None):
    return agent_path(user_home).is_file()


def ask_autostart(run=subprocess.run):
    """The first-run question (osascript dialog, default button: no, gives up after 120 s): True only for yes."""
    try:
        res = run(["osascript", "-e", DIALOG, QUESTION, NO, YES], capture_output=True, text=True, encoding="utf-8",
                  errors="replace", timeout=180)
    except (OSError, subprocess.SubprocessError, ValueError):
        return False
    out = getattr(res, "stdout", "") or ""
    return getattr(res, "returncode", 1) == 0 and ("button returned:" + YES) in out and "gave up:true" not in out


def first_run_question(home, exe, run=subprocess.run, user_home=None):
    """Ask once whether to start at login (off unless the answer is yes); None when it was asked before."""
    marker = Path(home) / FIRST_RUN
    if marker.exists():
        return None
    answer = ask_autostart(run)
    set_autostart(answer, exe, user_home)
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(json.dumps({"autostart": answer}), encoding="utf-8")
    return answer


# --- --stop ------------------------------------------------------------------------------------------------------

def _alive(kill, pid):
    try:
        kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def stop_processes(home, run=subprocess.run, kill=os.kill, pid=None, sleep=time.sleep, clock=time.monotonic,
                   wait_s=15.0):
    """End the other ViTranslate app processes and everything started from <home>/ollama; wait, then force."""
    me = os.getpid() if pid is None else pid
    folder = Path(home).as_posix().rstrip("/") + "/ollama/"
    try:
        res = run(["ps", "-axo", "pid=,comm="], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return []
    targets = []
    for line in (getattr(res, "stdout", "") or "").splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2 or not parts[0].isdigit() or int(parts[0]) == me:
            continue
        path = parts[1].strip()
        if path.startswith(folder) or path.endswith("/Contents/MacOS/" + config.APP_NAME):
            targets.append(int(parts[0]))
    for p in targets:
        try:
            kill(p, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    left = [p for p in targets if _alive(kill, p)]
    deadline = clock() + wait_s
    while left and clock() < deadline:
        sleep(0.2)
        left = [p for p in left if _alive(kill, p)]
    for p in left:
        try:
            kill(p, SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    return targets
