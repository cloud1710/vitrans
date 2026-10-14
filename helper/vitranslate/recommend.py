"""Speed model, per-job time estimate and the setup recommendation (spec Amendment C).

Time of one segment of w source words = overhead_s + word_s * w; a job adds start_s once (model load, the CPU
system-prompt prime). The rates come from the stored calibration (calibrate.py) when the device was measured, else
from conservative defaults measured on the development machine (qwen3.5:9b, RTX 5080 / i5-13500, 2026-10-14):
GPU ~1,200 source words per minute translate-only and ~800 with the read-back pass; CPU ~12 s per average segment,
3-4 min per 500-word A4 page, read-back +65 % (so it is off by default on the CPU). The GPU default is now
gemma4:e4b (spec Amendment E), faster than the 9B in G1 (0.38 vs 0.51 s per segment), so the GPU defaults err on the
slow side until the calibration measures it. The fast draft (gemma4:e2b) is not measured on its own: its time is the
device default's time scaled by FAST_FACTOR.

Reasons are codes with values (ASCII); the page words them in Vietnamese.
"""
import math
from dataclasses import dataclass

from . import config

A4_WORDS, A4_SEGMENTS = 500, 18        # an average A4 page of running text: 500 words in ~18 paragraphs
SLIDE_WORDS, SLIDE_SEGMENTS = 40, 6    # an average slide: title + bullets, ~40 words in ~6 text runs
POLISH_FACTOR = {"gpu": 0.50, "cpu": 0.65}  # read-back pass time / translation time (Amendment B measurements)
FAST_FACTOR = 0.55                     # fast draft time / default time (GPU, G1: e2b 0.18 vs e4b 0.38 s; CPU unmeasured)
CPU_SLOW_PAGE_S = 600                  # 9B on this CPU over 10 min per A4 page: recommend the fast draft instead
RAM_FOR_9B_MB = 12 * 1024              # below this the 9B (6.6 GB + KV cache) does not run beside the OS on the CPU
WRITE_S, WRITE_PER_SEGMENT_S = 3.0, 0.01
MIN_SAMPLES = 3                        # segments before the measured pace replaces the prediction
RATIO_MIN, RATIO_MAX = 0.25, 4.0
DEFAULT_RATES = {"gpu": {"overhead_s": 0.3, "word_s": 0.039, "start_s": 5.0},
                 "cpu": {"overhead_s": 2.0, "word_s": 0.357, "start_s": 30.0}}


@dataclass
class Rates:
    overhead_s: float
    word_s: float
    start_s: float
    basis: str  # "measured" or "default"

    def segment(self, words):
        return self.overhead_s + self.word_s * words


def _number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) and x >= 0


def rates(device, model, calibration):
    """Rates for a device ("gpu" / "cpu") and model from the calibration results ({device: record}), else defaults."""
    rec = (calibration or {}).get(device)
    if isinstance(rec, dict) and _number(rec.get("overhead_s")) and _number(rec.get("word_s")) and rec["word_s"] > 0:
        start = rec.get("start_s")
        r = Rates(float(rec["overhead_s"]), float(rec["word_s"]),
                  float(start) if _number(start) else DEFAULT_RATES[device]["start_s"], "measured")
    else:
        d = DEFAULT_RATES[device]
        r = Rates(d["overhead_s"], d["word_s"], d["start_s"], "default")
    if model == config.MODEL_FAST:
        r = Rates(r.overhead_s * FAST_FACTOR, r.word_s * FAST_FACTOR, r.start_s * FAST_FACTOR, r.basis)
    return r


def page_seconds(r, device, words, segments, polish):
    """Seconds for a block of text (no one-time start): segments of words / segments words each."""
    core = segments * r.overhead_s + r.word_s * words
    return core * (1 + POLISH_FACTOR[device]) if polish else core


@dataclass
class JobEstimate:
    per_segment: list    # predicted seconds of each segment, the job's start time included in the first
    polish_s: float
    write_s: float
    basis: str

    @property
    def translate_s(self):
        return sum(self.per_segment)

    def summary(self):
        t, p, w = self.translate_s, self.polish_s, self.write_s
        return {"translate_s": round(t, 1), "polish_s": round(p, 1), "write_s": round(w, 1),
                "total_s": round(t + p + w, 1), "basis": self.basis}

    def translate_ratio(self, done, elapsed):
        """Measured / predicted time of the segments done so far (1.0 until MIN_SAMPLES), bounded."""
        predicted = sum(self.per_segment[:done])
        if done < MIN_SAMPLES or predicted <= 0:
            return 1.0
        return min(RATIO_MAX, max(RATIO_MIN, elapsed / predicted))

    def remaining_translate(self, done, elapsed):
        ratio = self.translate_ratio(done, elapsed)
        return sum(self.per_segment[done:]) * ratio + self.polish_s * ratio + self.write_s

    def remaining_polish(self, done, total, elapsed, translate_ratio=1.0):
        ratio = translate_ratio
        if done >= 2 and total and self.polish_s > 0:
            ratio = min(RATIO_MAX, max(RATIO_MIN, elapsed / (self.polish_s * done / total)))
        left = 1 - (done / total if total else 1)
        return self.polish_s * ratio * left + self.write_s


def job_estimate(r, device, words, polish):
    """JobEstimate for segments of the given source word counts on a device with rates r."""
    per = [r.segment(w) for w in words]
    core = sum(per)
    if per:
        per[0] += r.start_s
    return JobEstimate(per, core * POLISH_FACTOR[device] if polish else 0.0,
                       WRITE_S + WRITE_PER_SEGMENT_S * len(words), r.basis)


def recommend(profile, calibration):
    """{engine: helper-gpu | helper-cpu | helper-cpu-fast, device, model, polish_default, fast_default,
    needs_download, reasons [{code, ...}], estimates {seconds_per_a4_page, seconds_per_slide, polish, basis}}.
    The device follows the rule a job applies (device.gpu_fits on free VRAM now) and the model is the one a job uses
    there (config.default_model, or the fast draft); a model that Ollama does not have is only recommended, never
    downloaded here (needs_download tells the page to ask first; false while Ollama is not running)."""
    g = profile.get("gpu_now") or {}
    ram = (profile.get("ram") or {}).get("total_mb")
    ollama = profile.get("ollama") or {}
    reasons = []
    if g.get("usable"):
        device, engine = "gpu", "helper-gpu"
        reasons.append({"code": "gpu_ok", "name": g.get("name"), "free_mb": g.get("free_mb")})
    else:
        device, engine = "cpu", "helper-cpu"
        if g.get("busy"):
            reasons.append({"code": "gpu_busy", "name": g.get("name"), "foreign_mb": g.get("foreign_mb"),
                            "util_pct": g.get("util_pct")})
        elif g.get("present"):
            reasons.append({"code": "gpu_small", "name": g.get("name"), "free_mb": g.get("free_mb"),
                            "total_mb": g.get("total_mb")})
        else:
            reasons.append({"code": "no_gpu"})
        cpu_page = page_seconds(rates("cpu", config.MODEL_DEFAULT_CPU, calibration), "cpu", A4_WORDS, A4_SEGMENTS,
                                False)
        if ram is not None and ram < RAM_FOR_9B_MB:
            engine = "helper-cpu-fast"
            reasons.append({"code": "ram_low", "ram_mb": ram})
        elif cpu_page > CPU_SLOW_PAGE_S:
            engine = "helper-cpu-fast"
            reasons.append({"code": "cpu_slow", "seconds_per_a4_page": round(cpu_page)})
        reasons.append({"code": "polish_off_cpu"})
    fast = engine == "helper-cpu-fast"
    model = config.MODEL_FAST if fast else config.default_model(device)
    polish = device == "gpu"
    r = rates(device, model, calibration)
    return {"engine": engine, "device": device, "model": model, "polish_default": polish,
            "fast_default": fast,
            "needs_download": bool(ollama.get("reachable")) and not ollama.get("model_" + ("fast" if fast else device)),
            "reasons": reasons,
            "estimates": {"seconds_per_a4_page": round(page_seconds(r, device, A4_WORDS, A4_SEGMENTS, polish), 1),
                          "seconds_per_slide": round(page_seconds(r, device, SLIDE_WORDS, SLIDE_SEGMENTS, polish), 1),
                          "polish": polish, "basis": r.basis}}
