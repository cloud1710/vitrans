import json
import os
import struct
import subprocess
from types import SimpleNamespace

import httpx

from vitranslate import hardware
from vitranslate.device import gpu_fits
from vitranslate.hardware import (Scanner, cpu_info, fingerprint, gpu_now, ollama_info, parse_adapters,
                                  parse_core_records, parse_nvidia, public)

NV_LINE = "NVIDIA GeForce RTX 5080, 16303, 14500, 1803, 3\n"
ADAPTERS = json.dumps([{"Name": "NVIDIA GeForce RTX 5080", "AdapterCompatibility": "NVIDIA"},
                       {"Name": "Intel(R) UHD Graphics 770", "AdapterCompatibility": "Intel Corporation"}])


def fake_run(outputs):
    """outputs: {program name: stdout or an exception}; records every command."""
    calls = []

    def run(cmd, **kwargs):
        calls.append(cmd)
        out = outputs.get(cmd[0])
        if isinstance(out, BaseException):
            raise out
        if out is None:
            return SimpleNamespace(returncode=1, stdout="")
        return SimpleNamespace(returncode=0, stdout=out)
    run.calls = calls
    return run


def ollama_transport(version="0.40.3", models=(("qwen3.5:9b", "56671c" + "0" * 58),), vram=0, down=False):
    seen = []

    def handler(request):
        seen.append(request.url.path)
        if down:
            raise httpx.ConnectError("refused", request=request)
        if request.url.path == "/api/version":
            return httpx.Response(200, json={"version": version})
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": n, "digest": d} for n, d in models]})
        if request.url.path == "/api/ps":
            return httpx.Response(200, json={"models": [{"size_vram": vram * 1024 * 1024}]})
        return httpx.Response(404)
    t = httpx.MockTransport(handler)
    t.seen = seen
    return t


def core_record(efficiency, smt=True):
    # SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX, RelationProcessorCore (0), 48 bytes on x64
    return struct.pack("<IIBB20xHQH6x", 0, 48, 1 if smt else 0, efficiency, 1, 1, 0)


def test_gpu_rule_is_shared_with_device_probe():
    assert gpu_fits(9000) and not gpu_fits(8999)
    assert gpu_fits(5000, min_free_mb=4000)


def test_parse_nvidia_fields_comma_names_and_missing_values():
    gpus = parse_nvidia(NV_LINE + "NVIDIA RTX, Super Edition, 8192, 100, 8000, [N/A]\nnot a gpu line\n")
    assert gpus[0] == {"vendor": "NVIDIA", "name": "NVIDIA GeForce RTX 5080", "vram_total_mb": 16303,
                       "vram_free_mb": 14500, "vram_used_mb": 1803, "util_pct": 3, "backend": "CUDA"}
    assert gpus[1]["name"] == "NVIDIA RTX, Super Edition" and gpus[1]["util_pct"] is None
    assert len(gpus) == 2


def test_nvidia_missing_or_failing_gives_no_gpu():
    assert hardware.nvidia_gpus(fake_run({"nvidia-smi": FileNotFoundError("nvidia-smi")})) == []
    assert hardware.nvidia_gpus(fake_run({})) == []  # exit code 1
    assert hardware.nvidia_gpus(fake_run({"nvidia-smi": subprocess.TimeoutExpired("nvidia-smi", 10)})) == []


def test_parse_adapters_one_or_many_vram_unknown():
    many = json.dumps([{"Name": "Intel(R) UHD Graphics 770", "AdapterCompatibility": "Intel Corporation"},
                       {"Name": "AMD Radeon RX 7600", "AdapterCompatibility": "Advanced Micro Devices, Inc."}])
    got = parse_adapters(many)
    assert [(a["vendor"], a["name"]) for a in got] == [("Intel", "Intel(R) UHD Graphics 770"),
                                                      ("AMD", "AMD Radeon RX 7600")]
    assert all(a["vram_total_mb"] is None and a["vram_free_mb"] is None for a in got)
    one = parse_adapters(json.dumps({"Name": "Apple M2", "AdapterCompatibility": None}))
    assert one[0]["vendor"] == "Apple"
    assert parse_adapters("") == [] and parse_adapters("not json") == [] and parse_adapters("[1, null]") == []


def test_core_records_give_performance_and_efficiency_split():
    buf = b"".join([core_record(1)] * 6 + [core_record(0, smt=False)] * 8)
    classes = parse_core_records(buf)
    assert classes == [1] * 6 + [0] * 8
    info = cpu_info("Intel(R) Core(TM) i5-13500", classes, 20)
    assert info == {"model": "Intel(R) Core(TM) i5-13500", "cores": 14, "threads": 20,
                    "performance_cores": 6, "efficiency_cores": 8}
    same = cpu_info("AMD Ryzen 7 7700", [0] * 8, 16)
    assert same["cores"] == 8 and same["performance_cores"] is None and same["efficiency_cores"] is None
    assert cpu_info(None, None, None) == {"model": None, "cores": None, "threads": None,
                                          "performance_cores": None, "efficiency_cores": None}
    assert parse_core_records(b"\x00\x00") == [] and parse_core_records(struct.pack("<II", 0, 0)) == []


def test_ollama_info_versions_models_and_vram():
    t = ollama_transport(models=(("qwen3.5:9b", "a" * 64), ("gemma4:e2b", "b" * 64)), vram=6000)
    info = ollama_info("http://x", transport=t)
    assert info["reachable"] is True and info["version"] == "0.40.3"
    assert info["models"] == ["qwen3.5:9b", "gemma4:e2b"]
    # one flag per model role: the GPU default (gemma4:e4b) is missing here
    assert (info["model_gpu"], info["model_cpu"], info["model_fast"]) == (False, True, True)
    assert info["digests"] == {"qwen3.5:9b": "a" * 12, "gemma4:e2b": "b" * 12} and info["vram_mb"] == 6000
    down = ollama_info("http://x", transport=ollama_transport(down=True))
    assert down == {"reachable": False, "version": None, "models": [], "digests": {}, "model_gpu": False,
                    "model_cpu": False, "model_fast": False, "vram_mb": 0}


def nv(free, used, util, total=16303, name="NVIDIA GeForce RTX 5080"):
    return {"vendor": "NVIDIA", "name": name, "vram_total_mb": total, "vram_free_mb": free, "vram_used_mb": used,
            "util_pct": util, "backend": "CUDA"}


def test_gpu_now_usable_busy_small_and_absent():
    ok = gpu_now([nv(14500, 1800, 2)], 0)
    assert ok["present"] and ok["usable"] and not ok["busy"] and ok["free_mb"] == 14500
    # a training job holds the memory and the compute: busy, not usable
    busy = gpu_now([nv(71, 15907, 88)], 0)
    assert busy["busy"] and not busy["usable"] and busy["foreign_mb"] == 15907
    # memory held by Ollama itself is reusable and is not foreign
    mine = gpu_now([nv(2000, 14000, 0)], 12000)
    assert mine["usable"] and not mine["busy"] and mine["free_mb"] == 14000 and mine["foreign_mb"] == 2000
    small = gpu_now([nv(5800, 300, 0, total=6144, name="NVIDIA GeForce RTX 3050")], 0)
    assert small["present"] and not small["usable"] and not small["busy"] and small["total_mb"] == 6144
    other = gpu_now([{"vendor": "Intel", "name": "Intel(R) UHD Graphics 770", "vram_total_mb": None,
                      "vram_free_mb": None}], 0)
    assert other == {"present": False, "usable": False, "busy": False}
    assert gpu_now([], 0)["present"] is False


def scanner(run=None, transport=None, clock=None, **kw):
    run = run or fake_run({"nvidia-smi": NV_LINE, "powershell": ADAPTERS})
    defaults = dict(run=run, transport=transport or ollama_transport(), base_url="http://x", home=".",
                    system="Windows", os_version="10.0.26300", machine="AMD64",
                    memory=lambda: (65289, 40000), core_classes=lambda: [1] * 6 + [0] * 8,
                    cpu_name=lambda: "Intel(R) Core(TM) i5-13500", threads=lambda: 20,
                    disk=lambda path: 120000, clock=clock or (lambda: 0.0))
    defaults.update(kw)
    return Scanner(**defaults)


def test_scan_profile_shape():
    p = scanner().profile()
    assert p["os"] == {"system": "Windows", "release": "11", "build": "10.0.26300", "machine": "AMD64"}
    assert p["cpu"]["cores"] == 14 and p["cpu"]["performance_cores"] == 6
    assert p["ram"] == {"total_mb": 65289, "free_mb": 40000}
    # the NVIDIA adapter listed by Windows too is not repeated; the other adapter has no VRAM figure
    assert [g["name"] for g in p["gpus"]] == ["NVIDIA GeForce RTX 5080", "Intel(R) UHD Graphics 770"]
    assert p["gpu_now"]["usable"] is True and p["ollama"]["model_cpu"] is True
    assert p["disk"] == {"free_mb": 120000}


def test_static_part_scanned_once_dynamic_part_reread_after_ttl():
    now = [0.0]
    memory_calls = []

    def memory():
        memory_calls.append(1)
        return (65289, 40000 - len(memory_calls))
    run = fake_run({"nvidia-smi": NV_LINE, "powershell": "[]"})
    s = scanner(run=run, clock=lambda: now[0], memory=memory)
    first = s.profile()
    s.profile()  # within the TTL: nothing re-read
    assert sum(1 for c in run.calls if c[0] == "powershell") == 1 and len(memory_calls) == 2  # static + dynamic
    now[0] = 10.0
    second = s.profile()
    assert second["ram"]["free_mb"] != first["ram"]["free_mb"]
    assert sum(1 for c in run.calls if c[0] == "powershell") == 1  # adapters are not asked again
    s.profile(fresh=True)
    assert len(memory_calls) == 4


def test_every_probe_failing_gives_nulls_not_exceptions():
    def boom(*a, **k):
        raise OSError("no")
    s = scanner(run=fake_run({"nvidia-smi": OSError("x"), "powershell": OSError("y")}),
                transport=ollama_transport(down=True), memory=boom, core_classes=boom, cpu_name=boom,
                threads=boom, disk=boom)
    p = s.profile()
    assert p["cpu"]["model"] is None and p["cpu"]["cores"] is None and p["cpu"]["threads"] is None
    assert p["ram"] == {"total_mb": None, "free_mb": None} and p["gpus"] == [] and p["disk"] == {"free_mb": None}
    assert p["ollama"]["reachable"] is False and p["gpu_now"]["present"] is False
    json.dumps(p)  # serialisable


def test_scanner_ready_flag_and_background_start():
    s = scanner()
    assert s.ready is False
    s.start()
    s.wait(5)
    assert s.ready is True


def test_fingerprint_follows_hardware_and_models_not_free_memory():
    base = scanner().profile()
    fp = fingerprint(base)
    assert fp == fingerprint(scanner(memory=lambda: (65289, 1000)).profile())
    assert fp == fingerprint(scanner(run=fake_run({"nvidia-smi": "NVIDIA GeForce RTX 5080, 16303, 71, 15907, 88\n",
                                                   "powershell": ADAPTERS})).profile())
    assert fp != fingerprint(scanner(memory=lambda: (32768, 1000)).profile())
    assert fp != fingerprint(scanner(run=fake_run({"nvidia-smi": "NVIDIA GeForce RTX 4090, 24564, 20000, 500, 0\n",
                                                   "powershell": ADAPTERS})).profile())
    assert fp != fingerprint(scanner(transport=ollama_transport(version="0.41.0")).profile())
    assert fp != fingerprint(scanner(transport=ollama_transport(models=(("qwen3.5:9b", "f" * 64),))).profile())
    # every model a job may use is part of it (the GPU default Gemma 4 E4B arriving re-runs the calibration)
    both = (("qwen3.5:9b", "56671c" + "0" * 58), ("gemma4:e4b", "e" * 64))
    assert fp != fingerprint(scanner(transport=ollama_transport(models=both)).profile())
    assert fp != fingerprint(scanner(cpu_name=lambda: "AMD Ryzen 9 9950X").profile())


def test_public_profile_has_no_user_names_paths_or_digests(tmp_path):
    p = scanner(home=str(tmp_path)).profile()
    text = json.dumps(public(p))
    assert "digests" not in text and str(tmp_path) not in text
    user = os.environ.get("USERNAME") or os.environ.get("USER")
    if user and len(user) > 2:
        assert user not in text
    assert public(p)["ollama"]["models"] == ["qwen3.5:9b"]
