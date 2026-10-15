"""Choose GPU or CPU before each job: an NVIDIA GPU with enough free VRAM runs the whole model, else CPU.

Apple-silicon Macs: Ollama runs every layer on the GPU through Metal in the unified memory, so the device is always
the GPU; its memory budget is the share of RAM macOS lets the GPU use (metal_budget_mb), which decides the model
(recommend.py: the default model when it fits, else the fast draft)."""
import os
import platform
import re
import subprocess
import sys
from dataclasses import dataclass

import httpx

from .config import GPU_MIN_FREE_MB, ollama_url

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


@dataclass
class Device:
    kind: str     # "gpu" or "cpu"
    name: str
    free_mb: int
    num_gpu: int  # sent to Ollama: 999 = all layers on the GPU, 0 = CPU only


def _query_gpus(run):
    try:
        res = run(["nvidia-smi", "--query-gpu=name,memory.free", "--format=csv,noheader,nounits"],
                  capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10,
                  creationflags=_NO_WINDOW)
    except (OSError, subprocess.SubprocessError):
        return []
    if res.returncode != 0:
        return []
    gpus = []
    for line in (res.stdout or "").splitlines():
        parts = [p.strip() for p in line.rsplit(",", 1)]
        if len(parts) == 2 and parts[1].isdigit():
            gpus.append((parts[0], int(parts[1])))
    return gpus


def ollama_vram_mb(base_url=None, timeout=2.0, transport=None):
    """VRAM (MiB) already held by models loaded in Ollama; 0 when Ollama is unreachable."""
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            resp = client.get((base_url or ollama_url()).rstrip("/") + "/api/ps")
            resp.raise_for_status()
            models = resp.json().get("models", [])
        return sum(int(m.get("size_vram", 0) or 0) for m in models) // (1024 * 1024)
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        return 0


def _cpu_name():
    name = re.sub(r"\s*Family \d+ Model \d+ Stepping \d+,?\s*", " ", platform.processor() or "").strip()
    return name or "CPU"


def gpu_fits(free_mb, min_free_mb=GPU_MIN_FREE_MB):
    """The GPU rule shared by every caller: the whole GPU model + KV cache + margin fits in this much free VRAM."""
    return free_mb >= min_free_mb


def is_apple_silicon(system=None, machine=None):
    return (system or sys.platform) == "darwin" and (machine or platform.machine()) == "arm64"


def sysctl(run, key):
    """`sysctl -n key` as a stripped string, None when it fails (macOS)."""
    try:
        res = run(["sysctl", "-n", key], capture_output=True, text=True, encoding="utf-8", errors="replace",
                  timeout=10)
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    out = (getattr(res, "stdout", "") or "").strip()
    return out if getattr(res, "returncode", 1) == 0 and out else None


def apple_chip(run=subprocess.run):
    """'Apple M2 Pro' from sysctl machdep.cpu.brand_string, else None."""
    return sysctl(run, "machdep.cpu.brand_string")


def apple_memory_mb(run=subprocess.run):
    """Total unified memory in MiB from sysctl hw.memsize, else None."""
    out = sysctl(run, "hw.memsize")
    return int(out) // 2 ** 20 if out and out.isdigit() else None


def metal_budget_mb(total_mb):
    """The unified memory the GPU may use (macOS's default Metal working-set limit): about 2/3 of RAM up to 36 GB,
    3/4 above; 0 when the RAM is unknown."""
    if not total_mb:
        return 0
    return total_mb * 3 // 4 if total_mb > 36 * 1024 else total_mb * 2 // 3


def probe(run=subprocess.run, min_free_mb=GPU_MIN_FREE_MB, ps=ollama_vram_mb, system=None, machine=None):
    if is_apple_silicon(system, machine):
        return Device("gpu", apple_chip(run) or "Apple silicon", metal_budget_mb(apple_memory_mb(run)), 999)
    gpus = _query_gpus(run)
    if gpus:
        name, free = max(gpus, key=lambda g: g[1])
        free += ps()  # VRAM that Ollama itself holds is reusable by the next job
        if gpu_fits(free, min_free_mb):
            return Device("gpu", name, free, 999)
    return Device("cpu", _cpu_name(), 0, 0)
