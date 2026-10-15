"""Static checks of the macOS installer sources (installer/macos, .github/workflows/macos-installer.yml): the app
bundle's Info.plist, the PyInstaller spec, the build / smoke / uninstall scripts (bash -n, shellcheck when found:
SHELLCHECK=<path> or on PATH), the workflow, and that the public export keeps them."""
import os
import plistlib
import re
import shutil
import subprocess
import sys

import pytest

from vitranslate import config, macos

REPO = config.REPO_ROOT
MAC = REPO / "installer" / "macos"
WORKFLOW = REPO / ".github" / "workflows" / "macos-installer.yml"
SCRIPTS = [MAC / "build.sh", MAC / "smoke.sh", MAC / "uninstall.command"]


def _bash():
    found = shutil.which("bash")
    if found and "system32" not in found.lower():  # not the WSL launcher
        return found
    git_bash = "C:/Program Files/Git/bin/bash.exe"
    return git_bash if os.path.isfile(git_bash) else None


def _shellcheck():
    found = os.environ.get("SHELLCHECK") or shutil.which("shellcheck")
    return found if found and os.path.isfile(found) else None


# --- the app bundle -----------------------------------------------------------------------------------------------

def test_the_app_has_no_dock_icon_and_registers_the_vitranslate_scheme():
    info = plistlib.loads(plistlib.dumps(macos.bundle_info("1.2.3")))
    assert info["LSUIElement"] is True
    assert info["CFBundleURLTypes"] == [{"CFBundleURLName": macos.BUNDLE_ID, "CFBundleURLSchemes": ["vitranslate"]}]
    assert info["CFBundleIdentifier"] == macos.BUNDLE_ID and info["LSArchitecturePriority"] == ["arm64"]
    assert info["CFBundleShortVersionString"] == info["CFBundleVersion"] == "1.2.3"
    assert info["LSMinimumSystemVersion"] == macos.MIN_MACOS


def _list(spec, key):
    m = re.search(key + r"=\[(.*?)\]", spec, re.S)
    return sorted(re.findall(r'"([^"]+)"', m.group(1))) if m else None


def test_the_mac_spec_is_an_arm64_app_bundle_with_the_windows_data_and_excludes():
    mac = (MAC / "vitranslate-macos.spec").read_text(encoding="utf-8")
    win = (REPO / "installer" / "vitranslate.spec").read_text(encoding="utf-8")
    for needed in ('BUNDLE(', 'name="ViTranslate.app"', 'target_arch="arm64"', "argv_emulation=True",
                   "console=False", "bundle_info(", "bundle_identifier=BUNDLE_ID", '"vitranslate_app.py"'):
        assert needed in mac, needed
    for data in ('"web"', '"registry"', '"_style"'):
        assert data in mac
    assert _list(mac, "excludes") == _list(win, "excludes") and "docx" not in _list(mac, "excludes")
    assert "collect_submodules(\"uvicorn\")" in mac and "collect_submodules(\"fontTools.ttLib.tables\")" in mac


# --- scripts ------------------------------------------------------------------------------------------------------

def test_the_build_script_freezes_head_and_writes_the_dmg_and_its_checksums():
    text = (MAC / "build.sh").read_text(encoding="utf-8")
    assert text.startswith("#!/usr/bin/env bash\n") and "set -euo pipefail" in text
    for needed in ('git -C "$REPO" archive', "tools/build_site.py", "tools/build_registry.py", "-m PyInstaller",
                   "hdiutil create", "-format UDZO", "ln -s /Applications", "ViTranslate-macOS.dmg",
                   "ViTranslate-macOS-$VERSION.dmg", "shasum -a 256", "SHA256SUMS-macOS.txt",
                   "uninstall.command", "codesign --verify"):
        assert needed in text, needed


def test_the_smoke_test_mounts_starts_headless_checks_health_and_setup_and_stops():
    text = (MAC / "smoke.sh").read_text(encoding="utf-8")
    for needed in ("hdiutil attach", "--login", "/api/health", "/api/setup", "--stop", "hdiutil detach",
                   "VITRANSLATE_HOME", "VITRANSLATE_OLLAMA", "LSUIElement", "lipo"):
        assert needed in text, needed


def test_the_uninstall_script_removes_the_app_data_logs_and_agent_never_a_users_ollama():
    text = (MAC / "uninstall.command").read_text(encoding="utf-8")
    assert text.startswith("#!/bin/bash\n")
    for needed in ('"$HOME/Library/Application Support/ViTranslate"', '"$HOME/Library/Logs/ViTranslate"',
                   'LABEL="%s"' % macos.AGENT_LABEL, '"$HOME/Library/LaunchAgents/$LABEL.plist"',
                   "/Applications/ViTranslate.app"):
        assert needed in text, needed
    removals = [ln for ln in text.splitlines() if ln.strip().startswith("rm ")]
    assert removals and not [ln for ln in removals if "Ollama.app" in ln or ".ollama" in ln]


@pytest.mark.parametrize("path", SCRIPTS, ids=lambda p: p.name)
def test_shell_scripts_are_lf_ascii_and_parse(path):
    raw = path.read_bytes()
    assert b"\r\n" not in raw and max(raw) < 128
    bash = _bash()
    if bash is None:
        pytest.skip("no bash")
    res = subprocess.run([bash, "-n"], input=raw, capture_output=True)
    assert res.returncode == 0, res.stderr.decode("utf-8", "replace")


@pytest.mark.parametrize("path", SCRIPTS, ids=lambda p: p.name)
def test_shell_scripts_pass_shellcheck(path):
    sc = _shellcheck()
    if sc is None:
        pytest.skip("no shellcheck (SHELLCHECK=<path> or on PATH)")
    res = subprocess.run([sc, "--shell=bash", "-"], input=path.read_bytes(), capture_output=True)
    assert res.returncode == 0, res.stdout.decode("utf-8", "replace")


# --- workflow -----------------------------------------------------------------------------------------------------

def test_the_workflow_builds_on_apple_silicon_tests_smoke_tests_and_uploads():
    text = WORKFLOW.read_text(encoding="utf-8")
    for needed in ("runs-on: macos-14", 'python-version: "3.11"', "workflow_dispatch:", "release:",
                   "types: [published]", "tests/test_macos_device.py", "tests/test_macos_setup.py",
                   "tests/test_macos_installer.py", "VITRANSLATE_NET_TESTS", "bash installer/macos/build.sh",
                   "bash installer/macos/smoke.sh", "actions/upload-artifact@v4", "ViTranslate-macOS.dmg",
                   "gh release upload", "contents: write"):
        assert needed in text, needed
    try:
        import yaml
    except ImportError:
        return
    wf = yaml.safe_load(text)
    assert wf["jobs"]["build"]["runs-on"] == "macos-14"


def test_the_public_export_keeps_the_mac_installer():
    sys.path.insert(0, str(REPO / "tools"))
    try:
        import export_public
    finally:
        sys.path.pop(0)
    for p in SCRIPTS + [MAC / "vitranslate-macos.spec", MAC / "READ-ME-FIRST.txt", WORKFLOW]:
        rel = p.relative_to(REPO).as_posix()
        assert not rel.startswith(export_public.EXCLUDE), rel


def test_the_readme_explains_open_anyway_in_both_languages():
    text = (REPO / "installer" / "README.md").read_text(encoding="utf-8")
    assert "## macOS" in text and "Open Anyway" in text and "ViTranslate-macOS.dmg" in text
    note = (MAC / "READ-ME-FIRST.txt").read_text(encoding="utf-8")
    assert "Open Anyway" in note and "Privacy & Security" in note
