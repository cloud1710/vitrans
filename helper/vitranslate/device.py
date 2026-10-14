"""Choose GPU or CPU before each job: an NVIDIA GPU with enough free VRAM runs the whole model, else CPU."""
import os
import platform
import re
import subprocess
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


def probe(run=subprocess.run, min_free_mb=GPU_MIN_FREE_MB, ps=ollama_vram_mb):
    gpus = _query_gpus(run)
    if gpus:
        name, free = max(gpus, key=lambda g: g[1])
        free += ps()  # VRAM that Ollama itself holds is reusable by the next job
        if gpu_fits(free, min_free_mb):
            return Device("gpu", name, free, 999)
    return Device("cpu", _cpu_name(), 0, 0)
