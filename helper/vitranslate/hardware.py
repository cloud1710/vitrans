"""Hardware scan for the recommendation (spec Amendment C): OS, CPU, RAM, GPUs, Ollama and free disk.

Every probe is injectable and failure-tolerant: a missing tool or API gives null fields, never an exception. The
static part (OS, CPU, RAM total, display adapters listed by Windows) is read once per process; the dynamic part (free
RAM, NVIDIA free / used memory and utilisation, Ollama models, free disk) is re-read when older than `ttl` seconds.
The profile carries no serial number, user name or path.
"""
import hashlib
import json
import os
import platform
import shutil
import struct
import subprocess
import threading
import time

import httpx

from . import config
from .device import apple_chip, gpu_fits, metal_budget_mb, ollama_vram_mb, sysctl

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
NVIDIA_QUERY = "--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu"
# Another program is computing on the GPU (a training job, a game): calibration waits. Windows (WDDM) does not report
# per-process GPU memory, so "foreign" memory = memory.used minus what Ollama's loaded models hold.
GPU_BUSY_UTIL = 30
GPU_BUSY_FOREIGN_MB = 4096
TTL_SECONDS = 5.0
ADAPTERS_PS = ("Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility | "
               "ConvertTo-Json -Compress")


def _int(text):
    text = (text or "").strip()
    return int(text) if text.isdigit() else None


def parse_nvidia(stdout):
    """nvidia-smi CSV (name, total, free, used, utilisation; no header, no units) -> GPU dicts. The name may hold
    commas, so the numbers are split from the right."""
    gpus = []
    for line in (stdout or "").splitlines():
        parts = [p.strip() for p in line.rsplit(",", 4)]
        if len(parts) != 5 or _int(parts[1]) is None:
            continue
        gpus.append({"vendor": "NVIDIA", "name": parts[0], "vram_total_mb": _int(parts[1]),
                     "vram_free_mb": _int(parts[2]), "vram_used_mb": _int(parts[3]), "util_pct": _int(parts[4]),
                     "backend": "CUDA"})
    return gpus


def nvidia_gpus(run=subprocess.run):
    try:
        res = run(["nvidia-smi", NVIDIA_QUERY, "--format=csv,noheader,nounits"], capture_output=True, text=True,
                  encoding="utf-8", errors="replace", timeout=10, creationflags=_NO_WINDOW)
    except (OSError, subprocess.SubprocessError, ValueError):
        return []
    if getattr(res, "returncode", 1) != 0:
        return []
    return parse_nvidia(res.stdout)


def vendor_of(name, compat=""):
    text = ("%s %s" % (name or "", compat or "")).lower()
    for key, vendor in (("nvidia", "NVIDIA"), ("geforce", "NVIDIA"), ("radeon", "AMD"), ("amd", "AMD"),
                        ("advanced micro", "AMD"), ("intel", "Intel"), ("apple", "Apple"),
                        ("microsoft", "Microsoft"), ("qualcomm", "Qualcomm")):
        if key in text:
            return vendor
    return None


def parse_adapters(text):
    """Win32_VideoController as JSON (one object or a list) -> adapter dicts. VRAM is left unknown: AdapterRAM is a
    32-bit field (wrong above 4 GB) and shows shared memory for integrated GPUs."""
    try:
        data = json.loads(text or "null")
    except ValueError:
        return []
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        return []
    out = []
    for d in data:
        if not isinstance(d, dict) or not isinstance(d.get("Name"), str) or not d["Name"].strip():
            continue
        out.append({"vendor": vendor_of(d["Name"], d.get("AdapterCompatibility")), "name": d["Name"].strip(),
                    "vram_total_mb": None, "vram_free_mb": None, "vram_used_mb": None, "util_pct": None,
                    "backend": None})
    return out


def wmi_adapters(run=subprocess.run, system="Windows"):
    if system != "Windows":
        return []
    try:
        res = run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ADAPTERS_PS], capture_output=True,
                  text=True, encoding="utf-8", errors="replace", timeout=30, creationflags=_NO_WINDOW)
    except (OSError, subprocess.SubprocessError, ValueError):
        return []
    if getattr(res, "returncode", 1) != 0:
        return []
    return parse_adapters(res.stdout)


def parse_core_records(buf):
    """GetLogicalProcessorInformationEx(RelationProcessorCore) buffer -> the efficiency class of each physical
    core (record: DWORD relationship, DWORD size, BYTE flags, BYTE efficiency class, ...)."""
    classes, off = [], 0
    while off + 10 <= len(buf):
        rel, size = struct.unpack_from("<II", buf, off)
        if size <= 0:
            break
        if rel == 0:
            classes.append(buf[off + 9])
        off += size
    return classes


def windows_core_classes():
    if os.name != "nt":
        return None
    import ctypes
    k32 = ctypes.windll.kernel32
    size = ctypes.c_ulong(0)
    k32.GetLogicalProcessorInformationEx(0, None, ctypes.byref(size))
    if not size.value:
        return None
    buf = ctypes.create_string_buffer(size.value)
    if not k32.GetLogicalProcessorInformationEx(0, buf, ctypes.byref(size)):
        return None
    return parse_core_records(buf.raw[:size.value])


def windows_cpu_name():
    if os.name != "nt":
        return (platform.processor() or "").strip() or None
    import winreg
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
        return " ".join(str(winreg.QueryValueEx(key, "ProcessorNameString")[0]).split()) or None


def mac_core_classes(run=subprocess.run):
    """Per-core classes of an Apple-silicon CPU (1 = performance, 0 = efficiency) from sysctl hw.perflevel0/1;
    hw.physicalcpu alone when the levels are not reported; None when sysctl fails."""
    perf, eff = sysctl(run, "hw.perflevel0.physicalcpu"), sysctl(run, "hw.perflevel1.physicalcpu")
    if perf and perf.isdigit():
        return [1] * int(perf) + [0] * (int(eff) if eff and eff.isdigit() else 0)
    total = sysctl(run, "hw.physicalcpu")
    return [0] * int(total) if total and total.isdigit() else None


def parse_displays(text):
    """system_profiler SPDisplaysDataType -json -> (GPU name, GPU cores) of the first GPU; (None, None) when absent."""
    try:
        items = json.loads(text or "null").get("SPDisplaysDataType") or []
    except (ValueError, AttributeError):
        return None, None
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("sppci_model"), str):
            cores = str(item.get("sppci_cores") or "")
            return item["sppci_model"].strip() or None, int(cores) if cores.isdigit() else None
    return None, None


def apple_gpus(run, total_mb):
    """The GPU of an Apple-silicon Mac (name and cores from system_profiler, else the chip name from sysctl): Metal on
    the unified memory, its budget = device.metal_budget_mb of the RAM, never busy (macOS does not report load)."""
    try:
        res = run(["system_profiler", "SPDisplaysDataType", "-json"], capture_output=True, text=True,
                  encoding="utf-8", errors="replace", timeout=30)
        name, cores = parse_displays(res.stdout) if getattr(res, "returncode", 1) == 0 else (None, None)
    except (OSError, subprocess.SubprocessError, ValueError):
        name, cores = None, None
    budget = metal_budget_mb(total_mb)
    return [{"vendor": "Apple", "name": name or apple_chip(run) or "Apple silicon", "vram_total_mb": budget,
             "vram_free_mb": budget, "vram_used_mb": None, "util_pct": None, "backend": "Metal", "unified": True,
             "cores": cores}]


def cpu_info(name, classes, threads):
    """Physical cores from the per-core efficiency classes; a performance / efficiency split only when the cores
    differ (hybrid CPUs: the highest class = performance cores)."""
    cores = len(classes) if classes else None
    perf = eff = None
    if classes and len(set(classes)) > 1:
        perf = sum(1 for c in classes if c == max(classes))
        eff = cores - perf
    return {"model": name, "cores": cores, "threads": threads, "performance_cores": perf, "efficiency_cores": eff}


def memory_mb():
    """(total, free) physical memory in MiB."""
    if os.name == "nt":
        import ctypes

        class MemoryStatusEx(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong)] + [
                (n, ctypes.c_ulonglong) for n in ("total", "avail", "page_total", "page_avail", "virt_total",
                                                  "virt_avail", "ext_avail")]
        st = MemoryStatusEx()
        st.dwLength = ctypes.sizeof(MemoryStatusEx)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
            return None, None
        return st.total // 2 ** 20, st.avail // 2 ** 20
    page = os.sysconf("SC_PAGE_SIZE")
    total = os.sysconf("SC_PHYS_PAGES") * page // 2 ** 20
    try:
        free = os.sysconf("SC_AVPHYS_PAGES") * page // 2 ** 20
    except (ValueError, OSError):
        free = None
    return total, free


def disk_free_mb(path):
    return shutil.disk_usage(str(path)).free // 2 ** 20


def ollama_info(base_url=None, transport=None, timeout=2.0):
    """Ollama version, installed models (name + short digest), whether the model of each role is installed (model_gpu,
    model_cpu, model_fast: config.MODEL_DEFAULT_GPU / _CPU / MODEL_FAST) and VRAM held by loaded models; never
    raises."""
    info = {"reachable": False, "version": None, "models": [], "digests": {}, "model_gpu": False, "model_cpu": False,
            "model_fast": False, "vram_mb": 0}
    base = (base_url or config.ollama_url()).rstrip("/")
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            tags = client.get(base + "/api/tags")
            tags.raise_for_status()
            models = [m for m in (tags.json().get("models") or []) if isinstance(m, dict)]
            info["reachable"] = True
            info["models"] = [str(m.get("name", "")) for m in models]
            info["digests"] = {str(m.get("name", "")): str(m.get("digest") or "")[:12] for m in models}
            try:
                info["version"] = client.get(base + "/api/version").json().get("version")
            except (httpx.HTTPError, ValueError, AttributeError):
                pass
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        return info
    info["model_gpu"] = config.MODEL_DEFAULT_GPU in info["models"]
    info["model_cpu"] = config.MODEL_DEFAULT_CPU in info["models"]
    info["model_fast"] = config.MODEL_FAST in info["models"]
    info["vram_mb"] = ollama_vram_mb(base, timeout=timeout, transport=transport)
    return info


def gpu_now(gpus, ollama_mb):
    """State of the best NVIDIA GPU right now: usable for the GPU model (device.gpu_fits on free VRAM + VRAM held by
    Ollama, the rule a job's device.probe applies) and busy (another program computes on it or holds
    GPU_BUSY_FOREIGN_MB or more: calibration waits)."""
    nv = [g for g in gpus if g.get("vendor") == "NVIDIA" and g.get("vram_total_mb")]
    if not nv:
        apple = [g for g in gpus if g.get("unified")]
        if apple:  # Apple silicon: the Metal budget of the unified memory (device.probe uses the same number)
            g = apple[0]
            budget = g.get("vram_total_mb") or 0
            return {"present": True, "name": g["name"], "total_mb": budget, "free_mb": budget, "foreign_mb": 0,
                    "util_pct": None, "usable": gpu_fits(budget), "busy": False, "unified": True}
        return {"present": False, "usable": False, "busy": False}
    g = max(nv, key=lambda x: x.get("vram_free_mb") or 0)
    free = (g.get("vram_free_mb") or 0) + ollama_mb
    foreign = max(0, (g.get("vram_used_mb") or 0) - ollama_mb)
    util = g.get("util_pct")
    busy = foreign >= GPU_BUSY_FOREIGN_MB or (util is not None and util >= GPU_BUSY_UTIL)
    return {"present": True, "name": g["name"], "total_mb": g["vram_total_mb"], "free_mb": free,
            "foreign_mb": foreign, "util_pct": util, "usable": gpu_fits(free), "busy": busy}


def os_info(system, build, machine):
    release = None
    if system == "Windows" and build:
        parts = str(build).split(".")
        if len(parts) >= 3 and parts[2].isdigit():
            release = "11" if int(parts[2]) >= 22000 else "10"
    return {"system": system or None, "release": release, "build": build or None, "machine": machine or None}


def fingerprint(profile):
    """Changes when the hardware or the models change (CPU, RAM total, GPU names + VRAM, Ollama version, model
    digests), not with free memory or load: a stored calibration stays valid until then."""
    o = profile.get("ollama") or {}
    key = {"cpu": (profile.get("cpu") or {}).get("model"),
           "ram_gb": round(((profile.get("ram") or {}).get("total_mb") or 0) / 1024),
           "gpus": sorted([g.get("name"), g.get("vram_total_mb")] for g in profile.get("gpus") or []),
           "ollama": o.get("version"),
           "models": {m: (o.get("digests") or {}).get(m) for m in config.MODELS}}
    return hashlib.sha256(json.dumps(key, sort_keys=True).encode("utf-8")).hexdigest()[:16]


def public(profile):
    """The profile as the API shows it (model digests are only for the fingerprint)."""
    out = json.loads(json.dumps(profile))
    (out.get("ollama") or {}).pop("digests", None)
    return out


def _safe(fn, *args, default=None):
    try:
        return fn(*args)
    except Exception:  # a probe must never break the scan
        return default


class Scanner:
    def __init__(self, run=subprocess.run, transport=None, base_url=None, home=None, system=None, os_version=None,
                 machine=None, memory=memory_mb, core_classes=None, cpu_name=None,
                 threads=os.cpu_count, disk=disk_free_mb, clock=time.monotonic, ttl=TTL_SECONDS):
        self.run, self.transport, self.base_url = run, transport, base_url
        self.home = home
        self.system = system if system is not None else platform.system()
        self.os_version = os_version if os_version is not None else platform.version()
        self.machine = machine if machine is not None else platform.machine()
        self.apple = self.system == "Darwin" and self.machine == "arm64"
        if core_classes is None:
            core_classes = (lambda: mac_core_classes(run)) if self.system == "Darwin" else windows_core_classes
        if cpu_name is None:
            cpu_name = (lambda: apple_chip(run)) if self.system == "Darwin" else windows_cpu_name
        self.memory, self.core_classes, self.cpu_name, self.threads, self.disk = (
            memory, core_classes, cpu_name, threads, disk)
        self.clock, self.ttl = clock, ttl
        self._static = None
        self._dynamic, self._at = None, None
        self._lock = threading.Lock()
        self._done = threading.Event()

    @property
    def ready(self):
        return self._done.is_set()

    def start(self):
        threading.Thread(target=self.profile, name="hardware-scan", daemon=True).start()

    def wait(self, timeout=None):
        return self._done.wait(timeout)

    def _memory(self):
        res = _safe(self.memory, default=None)
        if not (isinstance(res, tuple) and len(res) == 2):
            return None, None
        return res

    def _static_part(self):
        total, _ = self._memory()
        return {"os": os_info(self.system, self.os_version, self.machine),
                "cpu": cpu_info(_safe(self.cpu_name), _safe(self.core_classes), _safe(self.threads)),
                "ram_total_mb": total,
                "adapters": (_safe(apple_gpus, self.run, total, default=[]) if self.apple
                             else _safe(wmi_adapters, self.run, self.system, default=[]))}

    def _dynamic_part(self):
        _, free = self._memory()
        nvidia = _safe(nvidia_gpus, self.run, default=[])
        ollama = ollama_info(self.base_url, transport=self.transport)
        home = self.home if self.home is not None else _safe(config.app_home)
        return {"ram_free_mb": free, "nvidia": nvidia, "ollama": ollama,
                "disk_free_mb": _safe(self.disk, home) if home is not None else None}

    def profile(self, fresh=False):
        with self._lock:
            if self._static is None:
                self._static = self._static_part()
            now = self.clock()
            if fresh or self._dynamic is None or now - self._at > self.ttl:
                self._dynamic, self._at = self._dynamic_part(), now
            s, d = self._static, self._dynamic
        self._done.set()
        names = {g["name"].lower() for g in d["nvidia"]}
        gpus = d["nvidia"] + [a for a in s["adapters"] if a["name"].lower() not in names]
        return {"os": s["os"], "cpu": s["cpu"], "ram": {"total_mb": s["ram_total_mb"], "free_mb": d["ram_free_mb"]},
                "gpus": gpus, "gpu_now": gpu_now(gpus, d["ollama"]["vram_mb"]), "ollama": d["ollama"],
                "disk": {"free_mb": d["disk_free_mb"]}}
