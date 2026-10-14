import pytest

from vitranslate import config
from vitranslate.recommend import (A4_SEGMENTS, A4_WORDS, CPU_SLOW_PAGE_S, DEFAULT_RATES, FAST_FACTOR,
                                   POLISH_FACTOR, JobEstimate, job_estimate, page_seconds, rates, recommend)


def profile(gpu=None, ram_mb=65314, fast=True, gpu_model=True, cpu_model=True, reachable=True):
    if gpu == "ok":
        g = {"present": True, "name": "NVIDIA GeForce RTX 5080", "total_mb": 16303, "free_mb": 14500,
             "foreign_mb": 1800, "util_pct": 2, "usable": True, "busy": False}
    elif gpu == "busy":
        g = {"present": True, "name": "NVIDIA GeForce RTX 5080", "total_mb": 16303, "free_mb": 56,
             "foreign_mb": 15922, "util_pct": 83, "usable": False, "busy": True}
    elif gpu == "small":
        g = {"present": True, "name": "NVIDIA GeForce RTX 3050", "total_mb": 6144, "free_mb": 5800,
             "foreign_mb": 300, "util_pct": 0, "usable": False, "busy": False}
    else:
        g = {"present": False, "usable": False, "busy": False}
    return {"cpu": {"model": "Intel(R) Core(TM) i5-13500", "cores": 14, "threads": 20},
            "ram": {"total_mb": ram_mb, "free_mb": ram_mb // 2}, "gpu_now": g,
            "ollama": {"reachable": reachable, "model_gpu": gpu_model, "model_cpu": cpu_model, "model_fast": fast}}


def codes(rec):
    return [r["code"] for r in rec["reasons"]]


def test_defaults_match_the_measurements_on_this_machine():
    # GPU 9B ~1,200 source words / min translate-only, ~800 with the read-back pass
    gpu = page_seconds(rates("gpu", config.MODEL_DEFAULT_GPU, {}), "gpu", A4_WORDS, A4_SEGMENTS, polish=False)
    assert 60 * A4_WORDS / gpu == pytest.approx(1200, rel=0.08)
    gpu_rb = page_seconds(rates("gpu", config.MODEL_DEFAULT_GPU, {}), "gpu", A4_WORDS, A4_SEGMENTS, polish=True)
    assert 60 * A4_WORDS / gpu_rb == pytest.approx(800, rel=0.08)
    # CPU 9B: ~12 s per average segment, 3-4 min per 500-word A4 page, read-back +65 %
    cpu = rates("cpu", config.MODEL_DEFAULT_CPU, {})
    assert cpu.segment(A4_WORDS / A4_SEGMENTS) == pytest.approx(12, rel=0.1)
    page = page_seconds(cpu, "cpu", A4_WORDS, A4_SEGMENTS, polish=False)
    assert 180 <= page <= 240
    assert page_seconds(cpu, "cpu", A4_WORDS, A4_SEGMENTS, polish=True) == pytest.approx(page * 1.65)
    assert POLISH_FACTOR == {"gpu": 0.50, "cpu": 0.65}


def test_measured_rates_replace_the_defaults():
    measured = {"cpu": {"overhead_s": 1.0, "word_s": 0.2, "start_s": 20.0, "prefill_tps": 80.0, "decode_tps": 7.0}}
    r = rates("cpu", config.MODEL_DEFAULT_CPU, measured)
    assert r.basis == "measured" and r.segment(10) == pytest.approx(3.0) and r.start_s == 20.0
    assert rates("gpu", config.MODEL_DEFAULT_GPU, measured).basis == "default"
    # a broken record is ignored
    assert rates("cpu", config.MODEL_DEFAULT_CPU, {"cpu": {"overhead_s": "x"}}).basis == "default"
    # the 4B is not measured: the 9B rate scaled
    fast = rates("cpu", config.MODEL_FAST, measured)
    assert fast.segment(10) == pytest.approx(3.0 * FAST_FACTOR) and fast.basis == "measured"


def test_gpu_usable_recommends_gemma_e4b_on_gpu_with_read_back():
    rec = recommend(profile("ok"), {})
    assert rec["engine"] == "helper-gpu" and rec["device"] == "gpu" and rec["model"] == config.MODEL_DEFAULT_GPU
    assert rec["polish_default"] is True and rec["fast_default"] is False and rec["needs_download"] is False
    assert codes(rec)[0] == "gpu_ok" and rec["reasons"][0]["name"] == "NVIDIA GeForce RTX 5080"
    est = rec["estimates"]
    assert est["basis"] == "default" and est["polish"] is True
    assert 30 <= est["seconds_per_a4_page"] <= 45 and 2 <= est["seconds_per_slide"] <= 10


def test_busy_gpu_falls_back_to_cpu_and_says_why():
    rec = recommend(profile("busy"), {})
    assert rec["engine"] == "helper-cpu" and rec["device"] == "cpu" and rec["polish_default"] is False
    assert rec["model"] == config.MODEL_DEFAULT_CPU
    assert codes(rec)[:2] == ["gpu_busy", "polish_off_cpu"]
    assert 180 <= rec["estimates"]["seconds_per_a4_page"] <= 240
    assert codes(recommend(profile("small"), {}))[0] == "gpu_small"
    assert codes(recommend(profile(None), {}))[0] == "no_gpu"


def test_low_ram_recommends_the_fast_draft_and_asks_before_any_download():
    rec = recommend(profile(None, ram_mb=8 * 1024, fast=False), {})
    assert rec["engine"] == "helper-cpu-fast" and rec["model"] == config.MODEL_FAST and rec["fast_default"] is True
    assert "ram_low" in codes(rec) and rec["needs_download"] is True
    assert recommend(profile(None, ram_mb=8 * 1024, fast=True), {})["needs_download"] is False
    # 12 GB or more: the 9B on the CPU
    assert recommend(profile(None, ram_mb=16 * 1024), {})["engine"] == "helper-cpu"


def test_a_missing_recommended_model_is_offered_for_download_never_pulled():
    # the default for the device is not installed: the page asks first (one button), nothing is downloaded here
    assert recommend(profile("ok", gpu_model=False), {})["needs_download"] is True
    assert recommend(profile("ok", cpu_model=False), {})["needs_download"] is False  # the GPU model is there
    assert recommend(profile(None, cpu_model=False), {})["needs_download"] is True
    # Ollama not running: nothing can be downloaded, the page says Ollama is missing instead
    assert recommend(profile("ok", gpu_model=False, reachable=False), {})["needs_download"] is False


def test_a_very_slow_measured_cpu_recommends_the_fast_draft():
    slow = {"cpu": {"overhead_s": 10.0, "word_s": 1.5, "start_s": 60.0, "prefill_tps": 10.0, "decode_tps": 1.0}}
    rec = recommend(profile(None), slow)
    assert rec["engine"] == "helper-cpu-fast" and "cpu_slow" in codes(rec)
    assert rec["estimates"]["basis"] == "measured"
    assert page_seconds(rates("cpu", config.MODEL_DEFAULT_CPU, slow), "cpu", A4_WORDS, A4_SEGMENTS, False) > \
        CPU_SLOW_PAGE_S


def test_measured_gpu_estimates_follow_the_calibration():
    cal = {"gpu": {"overhead_s": 0.2, "word_s": 0.02, "start_s": 4.0, "prefill_tps": 3000.0, "decode_tps": 90.0}}
    rec = recommend(profile("ok"), cal)
    assert rec["estimates"]["basis"] == "measured"
    want = (A4_SEGMENTS * 0.2 + A4_WORDS * 0.02) * 1.5
    assert rec["estimates"]["seconds_per_a4_page"] == pytest.approx(want, abs=0.6)


def test_job_estimate_splits_translate_read_back_and_write():
    r = rates("gpu", config.MODEL_DEFAULT_GPU, {})
    est = job_estimate(r, "gpu", [10, 20, 30], polish=True)
    core = sum(r.segment(w) for w in (10, 20, 30))
    assert est.translate_s == pytest.approx(r.start_s + core)
    assert est.polish_s == pytest.approx(core * 0.5)
    assert est.summary()["total_s"] == pytest.approx(est.translate_s + est.polish_s + est.write_s, abs=0.5)
    assert est.summary()["basis"] == "default"
    off = job_estimate(rates("cpu", config.MODEL_DEFAULT_CPU, {}), "cpu", [10, 20, 30], polish=False)
    assert off.polish_s == 0 and off.summary()["polish_s"] == 0


def test_remaining_time_is_refined_by_the_measured_pace():
    est = JobEstimate(per_segment=[10.0] * 10, polish_s=50.0, write_s=5.0, basis="default")
    # before MIN_SAMPLES segments the prediction stands
    assert est.remaining_translate(2, elapsed=60.0) == pytest.approx(80 + 50 + 5)
    # the job runs twice as slowly as predicted: the rest (translation and read-back) takes twice as long
    assert est.remaining_translate(5, elapsed=100.0) == pytest.approx(2 * 50 + 2 * 50 + 5)
    # far faster than predicted (cached segments): bounded, never zero for the rest
    assert est.remaining_translate(5, elapsed=0.0) > 5
    # read-back: its own pace once two groups are done
    assert est.remaining_polish(0, 4, elapsed=0.0, translate_ratio=2.0) == pytest.approx(100 + 5)
    assert est.remaining_polish(2, 4, elapsed=50.0, translate_ratio=2.0) == pytest.approx(50 + 5)
    assert est.remaining_polish(4, 4, elapsed=80.0, translate_ratio=1.0) == pytest.approx(5)


def test_default_rates_cover_both_devices():
    assert set(DEFAULT_RATES) == {"gpu", "cpu"}
