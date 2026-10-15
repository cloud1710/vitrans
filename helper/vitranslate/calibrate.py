"""Speed calibration (spec Amendment C): one short fixed translation on the device a job would use, timed from
Ollama's own counters, stored per hardware fingerprint so that it runs once per machine (again only when the CPU,
RAM, GPUs, Ollama version or model digests change, or on a forced re-run).

The calls are the job's calls: the same system prompt as a job without packs and the same user message shape (with
neighbour context), through OllamaLLM, so on the CPU the first call primes the system prompt (llm.py) and the second
call is the steady state a job's segments run in. Call 1 (warm-up: model load + prime) gives start_s, call 2 gives
prefill / decode tokens per second, overhead_s and word_s (recommend.py turns those into estimates).

It runs in a background thread only while no job is queued or running and never while another program uses the
GPU (hardware.gpu_now busy): it is postponed and retried every RETRY_SECONDS. A job that arrives mid-calibration wins:
the calibration stops after the call in flight (one short request) and keeps nothing half-measured.
"""
import json
import os
import threading
import time

import httpx

from . import config
from .hardware import fingerprint
from .llm import LLMError, OllamaLLM
from .packs import EMPTY_PACK, load_pack
from .translate import build_system, build_user

CAL_VERSION = 1
CAL_FILE = "calibration.json"
NS = 1_000_000_000
IN_TOKENS_PER_WORD = 1.4  # Qwen tokens per English word of running text
TIMEOUTS = {"gpu": 120.0, "cpu": 300.0}  # per call; the CPU warm-up loads 6.6 GB and primes ~1,100 tokens
RETRY_SECONDS = 60.0
# a background measurement keeps the model loaded only briefly (a job started right after still finds it loaded),
# so that it never holds ~7 GB of VRAM / RAM that another program may need for Ollama's default 10 minutes
CAL_KEEP_ALIVE = "2m"
# Synthetic sentences (not from any real document): warm-up, measured, and the measured one's next neighbour.
SAMPLES = (
    "Samples were collected from all participants at the first visit and stored frozen until the analysis.",
    "The tumour showed a solid growth pattern with moderate nuclear atypia, and mitotic figures were counted in ten "
    "high-power fields.",
    "No necrosis was seen in the examined sections of the specimen.",
)


class CalibrationError(Exception):
    """Ollama answered without usable timings."""


def default_system():
    """The system prompt of a job that selected no pack."""
    return build_system(load_pack(config.style_dir()).prompt, EMPTY_PACK, [])


def measure(llm, system, clock=time.perf_counter, should_stop=lambda: False):
    """Warm-up call, then the measured call. None when should_stop() turns true in between."""
    s1, s2, s3 = SAMPLES
    t0 = clock()
    llm.chat(system, build_user(s1, "", s2))
    t1 = clock()
    if should_stop():
        return None
    llm.chat(system, build_user(s2, s1, s3))
    t2 = clock()
    st = getattr(llm, "last_stats", None) or {}
    pn, pd, en, ed = (st.get(k) or 0 for k in ("prompt_eval_count", "prompt_eval_duration", "eval_count",
                                                 "eval_duration"))
    if not (pn > 0 and pd > 0 and en > 0 and ed > 0):
        raise CalibrationError("Ollama returned no timings")
    prefill, decode = pn / (pd / NS), en / (ed / NS)
    words = len(s2.split())
    segment = t2 - t1
    fixed = max(0.0, segment - pd / NS - ed / NS)
    rest = max(0.0, pn - IN_TOKENS_PER_WORD * words)  # prompt tokens other than the segment's own words
    return {"prefill_tps": prefill, "decode_tps": decode, "prompt_tokens": pn, "output_tokens": en,
            "words": words, "segment_s": segment, "start_s": max(0.0, (t1 - t0) - segment),
            "overhead_s": rest / prefill + fixed,
            "word_s": IN_TOKENS_PER_WORD / prefill + (en / words) / decode}


class CalibrationStore:
    """calibration.json in the app home: {version, fingerprint, results {device: record}}."""

    def __init__(self, home):
        self.path = os.path.join(str(home), CAL_FILE)
        self._lock = threading.Lock()

    def load(self, fp):
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            return {}
        if not isinstance(data, dict) or data.get("version") != CAL_VERSION or data.get("fingerprint") != fp:
            return {}
        res = data.get("results")
        return res if isinstance(res, dict) else {}

    def save(self, fp, results):
        with self._lock:
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"version": CAL_VERSION, "fingerprint": fp, "results": results}, f, indent=1)
            os.replace(tmp, self.path)

    def clear(self):
        with self._lock:
            try:
                os.remove(self.path)
            except OSError:
                pass


def target(profile):
    """(device to measure, None) or (None, reason to wait): ollama | gpu_busy | model_missing (the model a job would
    use on that device, config.default_model, is not installed)."""
    o = profile.get("ollama") or {}
    if not o.get("reachable"):
        return None, "ollama"
    g = profile.get("gpu_now") or {}
    if g.get("busy"):
        return None, "gpu_busy"
    kind = "gpu" if g.get("usable") else "cpu"
    if not o.get("model_" + kind):
        return None, "model_missing"
    return kind, None


def make_llm(kind, model, timeout):
    return OllamaLLM(config.ollama_url(), model, num_gpu=999 if kind == "gpu" else 0, timeout=timeout,
                     keep_alive=CAL_KEEP_ALIVE)


class Calibrator:
    def __init__(self, scanner, store, job_active=lambda: False, llm_factory=make_llm, system=default_system,
                 clock=time.perf_counter, wall=time.time, retry_s=RETRY_SECONDS):
        self.scanner, self.store, self.job_active = scanner, store, job_active
        self.llm_factory, self.system, self.clock, self.wall = llm_factory, system, clock, wall
        self.retry_s = retry_s
        self._lock = threading.Lock()
        self._state, self._reason, self._device, self._error = "idle", None, None, None
        self._generation = 0
        self._thread = None
        self._wake = threading.Event()

    def results(self, profile=None):
        return self.store.load(fingerprint(profile or self.scanner.profile()))

    def _set(self, state, reason=None, device=None, error=None):
        with self._lock:
            self._state, self._reason, self._device, self._error = state, reason, device, error
        return reason or state

    def status(self, profile=None):
        prof = profile or self.scanner.profile()
        have = self.results(prof)
        kind, why = target(prof)
        with self._lock:
            state, reason, device, error = self._state, self._reason, self._device, self._error
        out = {"results": have}
        if state == "running":
            return dict(out, state="running", device=device)
        if kind is not None and kind in have:
            return dict(out, state="done", device=kind)
        if state in ("waiting", "error"):
            return dict(out, state=state, reason=reason, error=error)
        return dict(out, state="missing" if kind else "waiting", reason=why)

    def step(self):
        """One attempt: done | job | gpu_busy | ollama | model_missing | error."""
        if self.job_active():
            return self._set("waiting", "job")
        prof = self.scanner.profile(fresh=True)
        fp = fingerprint(prof)
        kind, why = target(prof)
        if kind is None:
            return self._set("waiting", why)
        if kind in self.store.load(fp):
            return self._set("done", device=kind)
        with self._lock:
            generation = self._generation
        self._set("running", device=kind)
        model = config.default_model(kind)
        llm = self.llm_factory(kind, model, TIMEOUTS[kind])
        try:
            res = measure(llm, self.system(), clock=self.clock, should_stop=lambda: self.job_active())
        except (LLMError, CalibrationError, httpx.HTTPError, OSError, ValueError) as exc:
            return self._set("error", "error", error=str(exc)[:200])
        finally:
            if hasattr(llm, "close"):
                llm.close()
        if res is None:
            return self._set("waiting", "job")
        with self._lock:
            if generation != self._generation:  # forced re-run meanwhile: this result is stale
                return "job"
        have = self.store.load(fp)
        have[kind] = dict(res, model=model,
                          at=time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(self.wall())))
        self.store.save(fp, have)
        return self._set("done", device=kind)

    def _loop(self):
        while True:
            code = self.step()
            if code in ("done", "error"):
                return
            self._wake.wait(self.retry_s)
            self._wake.clear()

    def start(self, force=False):
        """Run in the background until measured (no-op when already measured or running); force: measure again."""
        with self._lock:
            if force:
                self._generation += 1
                self.store.clear()
            if self._thread is not None and self._thread.is_alive():
                self._wake.set()  # retry now instead of after RETRY_SECONDS
                return
            self._thread = threading.Thread(target=self._loop, name="calibration", daemon=True)
            self._thread.start()

    def wait_idle(self, timeout=None):
        t = self._thread
        if t is not None:
            t.join(timeout)
        return t is None or not t.is_alive()


class PullError(Exception):
    """Ollama reported an error in the pull stream, or the stream ended without "success"."""


class ModelPull:
    """Download one model through Ollama (/api/pull, streamed), only after the user allowed it: the page's button or
    the installed helper's first-run setup (setup.py), each passing the recommended model. status() names the last
    model asked for (None before any) and the bytes done / to do over the layers seen so far (None before any)."""

    def __init__(self, base_url=None, transport=None, timeout=7200.0):
        self.base_url, self.transport, self.timeout = base_url, transport, timeout
        self.model = None
        self._state, self._error = "idle", None
        self._completed = self._total = None
        self._thread = None
        self._lock = threading.Lock()

    def status(self):
        with self._lock:
            return {"model": self.model, "state": self._state, "error": self._error, "completed": self._completed,
                    "total": self._total}

    def start(self, model):
        with self._lock:
            if self._state == "running":
                return
            self.model = model
            self._state, self._error = "running", None
            self._completed = self._total = None
            self._thread = threading.Thread(target=self._run, name="model-pull", daemon=True)
            self._thread.start()

    def wait(self, timeout=None):
        if self._thread is not None:
            self._thread.join(timeout)
        return self._thread is None or not self._thread.is_alive()

    def _layer(self, layers, msg):
        digest, total, done = msg.get("digest"), msg.get("total"), msg.get("completed")
        if not (isinstance(digest, str) and isinstance(total, int) and total > 0):
            return
        layers[digest] = (done if isinstance(done, int) else 0, total)
        with self._lock:
            self._completed = sum(d for d, _ in layers.values())
            self._total = sum(t for _, t in layers.values())

    def _run(self):
        base = (self.base_url or config.ollama_url()).rstrip("/")
        layers, ok = {}, False
        try:
            with httpx.Client(timeout=httpx.Timeout(self.timeout, connect=5.0), transport=self.transport) as c:
                with c.stream("POST", base + "/api/pull", json={"model": self.model, "stream": True}) as resp:
                    resp.raise_for_status()
                    for line in resp.iter_lines():
                        try:
                            msg = json.loads(line)
                        except ValueError:
                            continue
                        if not isinstance(msg, dict):
                            continue
                        if msg.get("error"):
                            raise PullError(str(msg["error"]))
                        self._layer(layers, msg)
                        ok = ok or msg.get("status") == "success"
            if not ok:
                raise PullError("the download stopped before it finished")
            state, error = "done", None
        except (httpx.HTTPError, PullError) as exc:
            state, error = "error", (str(exc) or type(exc).__name__)[:200]
        with self._lock:
            self._state, self._error = state, error
