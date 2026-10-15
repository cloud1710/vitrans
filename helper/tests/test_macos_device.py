"""Apple-silicon Macs (the macOS helper): the device probe, the hardware scan, the recommendation and the app paths.

Every macOS probe runs here with the platform mocked (sys.platform / platform.machine passed in, sysctl and
system_profiler outputs as fixtures), so these tests run the same on Windows and on the macOS CI runner.
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

from vitranslate import config, device, hardware
from vitranslate.recommend import recommend

GB = 1024 ** 3
M2_PRO_DISPLAYS = json.dumps({"SPDisplaysDataType": [{
    "_name": "Apple M2 Pro", "sppci_model": "Apple M2 Pro", "sppci_cores": "19", "sppci_device_type": "spdisplays_gpu",
    "spdisplays_mtlgpufamilysupport": "spdisplays_metal3", "spdisplays_vendor": "sppci_vendor_Apple"}]})


def mac_run(memsize=16 * GB, brand="Apple M2 Pro", perf=(8, 4), displays=M2_PRO_DISPLAYS, fail=()):
    """A fake subprocess.run of an Apple-silicon Mac: sysctl -n <key> and system_profiler SPDisplaysDataType -json."""
    values = {"hw.memsize": str(memsize) if memsize else None, "machdep.cpu.brand_string": brand,
              "hw.perflevel0.physicalcpu": str(perf[0]) if perf else None,
              "hw.perflevel1.physicalcpu": str(perf[1]) if perf else None,
              "hw.physicalcpu": str(sum(perf)) if perf else "8"}
    calls = []

    def run(cmd, **kwargs):
        calls.append(list(cmd))
        if cmd[0] in fail:
            raise FileNotFoundError(cmd[0])
        if cmd[0] == "nvidia-smi":
            raise FileNotFoundError("nvidia-smi")
        if cmd[:2] == ["sysctl", "-n"] and len(cmd) == 3:
            out = values.get(cmd[2])
            return SimpleNamespace(returncode=0 if out is not None else 1, stdout=(out or "") + "\n")
        if cmd[0] == "system_profiler":
            return SimpleNamespace(returncode=0 if displays else 1, stdout=displays or "")
        return SimpleNamespace(returncode=1, stdout="")
    run.calls = calls
    return run


def none():
    return 0


# --- device probe -------------------------------------------------------------------------------------------------

def test_apple_silicon_runs_every_layer_on_the_gpu_through_metal():
    dev = device.probe(run=mac_run(memsize=16 * GB), ps=none, system="darwin", machine="arm64")
    assert (dev.kind, dev.num_gpu, dev.name) == ("gpu", 999, "Apple M2 Pro")
    assert dev.free_mb == device.metal_budget_mb(16 * 1024)


def test_the_metal_budget_comes_from_the_unified_memory():
    assert device.metal_budget_mb(16 * 1024) == 10922  # 2/3 of RAM up to 36 GB (macOS's GPU working-set limit)
    assert device.metal_budget_mb(8 * 1024) == 5461
    assert device.metal_budget_mb(64 * 1024) == 49152  # 3/4 above 36 GB
    assert device.metal_budget_mb(None) == 0
    assert device.gpu_fits(device.metal_budget_mb(16 * 1024)) and not device.gpu_fits(device.metal_budget_mb(8 * 1024))


def test_a_small_mac_still_uses_metal_never_the_cpu():
    dev = device.probe(run=mac_run(memsize=8 * GB, brand="Apple M1"), ps=none, system="darwin", machine="arm64")
    assert (dev.kind, dev.num_gpu, dev.name, dev.free_mb) == ("gpu", 999, "Apple M1", 5461)


def test_a_mac_whose_sysctl_fails_is_still_apple_silicon():
    dev = device.probe(run=mac_run(fail=("sysctl",)), ps=none, system="darwin", machine="arm64")
    assert (dev.kind, dev.num_gpu, dev.name, dev.free_mb) == ("gpu", 999, "Apple silicon", 0)


def test_an_intel_mac_and_windows_keep_the_nvidia_rule():
    assert device.probe(run=mac_run(), ps=none, system="darwin", machine="x86_64").kind == "cpu"

    def nvidia(cmd, **kwargs):
        return SimpleNamespace(returncode=0, stdout="NVIDIA GeForce RTX 5080, 14500\n")
    dev = device.probe(run=nvidia, ps=none, system="win32", machine="AMD64")
    assert (dev.kind, dev.num_gpu, dev.free_mb) == ("gpu", 999, 14500)


# --- hardware scan ------------------------------------------------------------------------------------------------

def mac_scanner(memsize=16 * GB, **kw):
    total = memsize // 2 ** 20
    return hardware.Scanner(run=mac_run(memsize=memsize, **kw), system="Darwin", os_version="Darwin Kernel 24.6.0",
                            machine="arm64", memory=lambda: (total, total // 2), threads=lambda: 12,
                            disk=lambda home: 200000, home=Path("."))


def test_the_mac_scan_reports_the_apple_gpu_metal_and_its_memory_budget():
    prof = mac_scanner().profile()
    assert prof["os"]["system"] == "Darwin" and prof["os"]["machine"] == "arm64"
    assert prof["cpu"] == {"model": "Apple M2 Pro", "cores": 12, "threads": 12, "performance_cores": 8,
                           "efficiency_cores": 4}
    gpu = prof["gpus"][0]
    assert (gpu["vendor"], gpu["name"], gpu["backend"], gpu["unified"], gpu["cores"]) == (
        "Apple", "Apple M2 Pro", "Metal", True, 19)
    assert gpu["vram_total_mb"] == 10922
    now = prof["gpu_now"]
    assert now["present"] and now["usable"] and not now["busy"] and now["unified"]
    assert (now["name"], now["free_mb"], now["total_mb"]) == ("Apple M2 Pro", 10922, 10922)


def test_an_8_gb_mac_has_a_gpu_too_small_for_the_default_model():
    now = mac_scanner(memsize=8 * GB, brand="Apple M1", perf=(4, 4), displays=None).profile()["gpu_now"]
    assert now["present"] and now["unified"] and not now["usable"] and now["name"] == "Apple M1"


def test_mac_probes_failing_give_nulls_not_exceptions():
    s = hardware.Scanner(run=mac_run(fail=("sysctl", "system_profiler")), system="Darwin", os_version="x",
                         machine="arm64", memory=lambda: (None, None), threads=lambda: None, disk=lambda home: None,
                         home=Path("."))
    prof = s.profile()
    assert prof["cpu"]["model"] is None and prof["cpu"]["cores"] is None
    assert prof["gpus"][0]["name"] == "Apple silicon" and prof["gpus"][0]["vram_total_mb"] == 0
    assert prof["gpu_now"]["present"] and not prof["gpu_now"]["usable"]


def test_the_windows_scan_never_runs_the_mac_probes():
    run = mac_run()
    hardware.Scanner(run=run, system="Windows", os_version="10.0.26300", machine="AMD64",
                     memory=lambda: (32000, 16000), core_classes=lambda: [1, 1], cpu_name=lambda: "x",
                     threads=lambda: 4, disk=lambda home: 1, home=Path(".")).profile()
    assert not [c for c in run.calls if c[0] in ("sysctl", "system_profiler")]


# --- recommendation -----------------------------------------------------------------------------------------------

def test_a_16_gb_mac_gets_gemma4_e4b_on_the_gpu():
    rec = recommend(mac_scanner(memsize=16 * GB).profile(), {})
    assert (rec["engine"], rec["device"], rec["model"], rec["fast_default"]) == (
        "helper-gpu", "gpu", "gemma4:e4b", False)
    assert rec["reasons"][0]["code"] == "gpu_ok" and rec["polish_default"]


def test_an_8_gb_mac_gets_the_fast_gemma4_e2b_on_the_gpu():
    rec = recommend(mac_scanner(memsize=8 * GB, brand="Apple M1").profile(), {})
    assert (rec["engine"], rec["device"], rec["model"], rec["fast_default"]) == (
        "helper-gpu-fast", "gpu", "gemma4:e2b", True)
    assert [r["code"] for r in rec["reasons"]] == ["gpu_ok", "ram_low"]
    assert rec["reasons"][1]["ram_mb"] == 8192


# --- app paths ----------------------------------------------------------------------------------------------------

def test_the_mac_app_home_and_logs_live_in_the_user_library(tmp_path):
    user = tmp_path / "u"
    assert config.default_home("darwin", {}, user) == user / "Library" / "Application Support" / "ViTranslate"
    assert config.logs_dir(tmp_path / "h", "darwin", {}, user) == user / "Library" / "Logs" / "ViTranslate"
    # VITRANSLATE_HOME (tests, CI smoke run) keeps everything in that folder
    assert config.logs_dir(tmp_path / "h", "darwin", {"VITRANSLATE_HOME": "x"}, user) == tmp_path / "h" / "logs"


def test_the_windows_app_home_and_logs_are_unchanged(tmp_path):
    env = {"LOCALAPPDATA": str(tmp_path / "Local")}
    assert config.default_home("win32", env, tmp_path / "u") == tmp_path / "Local" / "ViTranslate"
    assert config.logs_dir(tmp_path / "h", "win32", env, tmp_path / "u") == tmp_path / "h" / "logs"


def test_the_mac_font_folders_are_scanned_for_vietnamese_glyphs(tmp_path):
    from vitranslate import fonts
    dirs = fonts._font_dirs(platform="darwin", user_home=tmp_path / "u")
    assert dirs[:3] == ["/System/Library/Fonts", "/Library/Fonts", str(tmp_path / "u" / "Library" / "Fonts")]
    assert "/Applications/Microsoft Word.app/Contents/Resources/DFonts" in dirs  # Office for Mac's own fonts
    if sys.platform == "win32":
        assert fonts._font_dirs(platform="win32") == fonts.FONT_DIRS  # Windows unchanged
