import json
import time

import httpx
import pytest

from vitranslate import config
from vitranslate.calibrate import (CAL_VERSION, SAMPLES, CalibrationError, CalibrationStore, Calibrator, ModelPull,
                                   measure, target)
from vitranslate.llm import LLMError
from vitranslate.translate import build_user

NS = 1_000_000_000


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class StatsLLM:
    """Answers every call, advancing a fake clock; the second call reports the given Ollama timings."""

    def __init__(self, clock, walls=(10.0, 7.5), stats=None, fail=False):
        self.clock, self.walls, self.fail = clock, list(walls), fail
        self.stats = stats or {"prompt_eval_count": 200, "prompt_eval_duration": 2 * NS,
                               "eval_count": 50, "eval_duration": 5 * NS}
        self.calls, self.last_stats, self.closed = [], {}, False

    def chat(self, system, user):
        if self.fail:
            raise LLMError("down")
        self.calls.append((system, user))
        self.clock.t += self.walls[len(self.calls) - 1]
        self.last_stats = dict(self.stats) if len(self.calls) == 2 else {"eval_count": 1}
        return "Ban dich"

    def close(self):
        self.closed = True


def test_measure_uses_the_job_prompts_and_the_steady_state_call():
    clock = Clock()
    llm = StatsLLM(clock)
    res = measure(llm, "SYSTEM", clock=clock)
    (s1, u1), (s2, u2) = llm.calls
    assert s1 == s2 == "SYSTEM"  # one system prompt: on the CPU the first call primes it, as in a job
    assert u1 == build_user(SAMPLES[0], "", SAMPLES[1]) and u2 == build_user(SAMPLES[1], SAMPLES[0], SAMPLES[2])
    words = len(SAMPLES[1].split())
    assert res["prefill_tps"] == pytest.approx(100.0) and res["decode_tps"] == pytest.approx(10.0)
    assert res["words"] == words and res["segment_s"] == pytest.approx(7.5)
    assert res["start_s"] == pytest.approx(2.5)  # warm-up (load, prime) minus one steady segment
    # word_s: own input tokens at the prefill rate + output tokens per source word at the decode rate
    assert res["word_s"] == pytest.approx(1.4 / 100 + (50 / words) / 10)
    # overhead_s: the rest of the prompt (context, instructions) + the call's fixed cost
    rest = (200 - 1.4 * words) / 100 + (7.5 - 2 - 5)
    assert res["overhead_s"] == pytest.approx(rest)


def test_measure_stops_for_a_job_and_rejects_missing_timings():
    clock = Clock()
    llm = StatsLLM(clock)
    assert measure(llm, "S", clock=clock, should_stop=lambda: True) is None and len(llm.calls) == 1
    with pytest.raises(CalibrationError):
        measure(StatsLLM(clock, stats={"eval_count": 0, "eval_duration": 0}), "S", clock=clock)


def test_samples_are_short_and_synthetic():
    assert len(SAMPLES) == 3 and all(10 <= len(s.split()) <= 30 for s in SAMPLES)


def test_store_keys_results_by_fingerprint_and_version(tmp_path):
    store = CalibrationStore(tmp_path)
    assert store.load("fp1") == {}
    store.save("fp1", {"gpu": {"word_s": 0.02}})
    assert store.load("fp1") == {"gpu": {"word_s": 0.02}} and store.load("fp2") == {}
    data = json.loads((tmp_path / "calibration.json").read_text(encoding="utf-8"))
    assert data["version"] == CAL_VERSION and data["fingerprint"] == "fp1"
    (tmp_path / "calibration.json").write_text(json.dumps(dict(data, version=CAL_VERSION + 1)), encoding="utf-8")
    assert store.load("fp1") == {}
    (tmp_path / "calibration.json").write_text("{broken", encoding="utf-8")
    assert store.load("fp1") == {}
    store.save("fp1", {"cpu": {}})
    store.clear()
    assert store.load("fp1") == {}


def prof(usable=True, busy=False, reachable=True, gpu_model=True, cpu_model=True, gpu_name="NVIDIA GeForce RTX 5080"):
    return {"cpu": {"model": "Intel(R) Core(TM) i5-13500"}, "ram": {"total_mb": 65314},
            "gpus": [{"name": gpu_name, "vram_total_mb": 16303}],
            "gpu_now": {"present": True, "usable": usable, "busy": busy},
            "ollama": {"reachable": reachable, "version": "0.40.3", "model_gpu": gpu_model, "model_cpu": cpu_model,
                       "digests": {"gemma4:e4b": "def", "qwen3.5:9b": "abc"}}}


class FakeScanner:
    def __init__(self, profile):
        self.p = profile
        self.fresh = 0

    def profile(self, fresh=False):
        self.fresh += fresh
        return self.p


def test_target_device_and_postpone_reasons():
    assert target(prof()) == ("gpu", None)
    assert target(prof(usable=False)) == ("cpu", None)
    assert target(prof(busy=True)) == (None, "gpu_busy")  # never measured while another program uses the GPU
    assert target(prof(reachable=False)) == (None, "ollama")
    # the model a job would use on that device must be installed (GPU: Gemma 4 E4B, CPU: Qwen 3.5 9B)
    assert target(prof(gpu_model=False)) == (None, "model_missing")
    assert target(prof(usable=False, gpu_model=False)) == ("cpu", None)
    assert target(prof(usable=False, cpu_model=False)) == (None, "model_missing")


def calibrator(tmp_path, profile=None, job=lambda: False, llm=None, **kw):
    clock = Clock()
    made = []

    def factory(kind, model, timeout):
        made.append((kind, model, timeout))
        return llm or StatsLLM(clock)
    cal = Calibrator(FakeScanner(profile or prof()), CalibrationStore(tmp_path), job_active=job,
                     llm_factory=factory, system=lambda: "SYSTEM", clock=clock, wall=lambda: 1_760_000_000.0, **kw)
    cal.made = made
    return cal


def test_step_measures_the_gpu_once_then_uses_the_cache(tmp_path):
    cal = calibrator(tmp_path)
    assert cal.status()["state"] == "missing"
    assert cal.step() == "done"
    assert cal.made == [("gpu", config.MODEL_DEFAULT_GPU, 120.0)]
    res = cal.results()
    assert set(res) == {"gpu"} and res["gpu"]["model"] == config.MODEL_DEFAULT_GPU and "at" in res["gpu"]
    st = cal.status()
    assert st["state"] == "done" and st["device"] == "gpu" and st["results"]["gpu"]["prefill_tps"] == 100.0
    assert cal.step() == "done" and len(cal.made) == 1  # cached: no new measurement
    # a new helper process (same hardware) reads the stored calibration
    assert calibrator(tmp_path).status()["state"] == "done"


def test_a_hardware_change_triggers_a_new_calibration(tmp_path):
    calibrator(tmp_path).step()
    cal = calibrator(tmp_path, profile=prof(gpu_name="NVIDIA GeForce RTX 4090"))
    assert cal.status()["state"] == "missing" and cal.results() == {}
    assert cal.step() == "done" and len(cal.made) == 1


def test_postponed_while_a_job_runs_or_the_gpu_is_busy(tmp_path):
    cal = calibrator(tmp_path, job=lambda: True)
    assert cal.step() == "job" and cal.made == [] and cal.status()["state"] == "waiting"
    assert cal.status()["reason"] == "job"
    busy = calibrator(tmp_path, profile=prof(busy=True))
    assert busy.step() == "gpu_busy" and busy.made == [] and busy.status()["reason"] == "gpu_busy"
    assert calibrator(tmp_path, profile=prof(reachable=False)).step() == "ollama"


def test_a_job_arriving_mid_calibration_wins_and_nothing_half_measured_is_kept(tmp_path):
    calls = []

    def job():
        calls.append(1)
        return len(calls) > 1  # idle at the start, a job right after the warm-up call
    cal = calibrator(tmp_path, job=job)
    assert cal.step() == "job" and cal.results() == {}
    cal.job_active = lambda: False
    assert cal.step() == "done" and set(cal.results()) == {"gpu"}


def test_cpu_measured_when_no_usable_gpu_and_errors_reported(tmp_path):
    cal = calibrator(tmp_path, profile=prof(usable=False))
    assert cal.step() == "done" and cal.made[0] == ("cpu", config.MODEL_DEFAULT_CPU, 300.0)
    assert cal.results()["cpu"]["model"] == config.MODEL_DEFAULT_CPU
    bad = calibrator(tmp_path / "b", llm=StatsLLM(Clock(), fail=True))
    assert bad.step() == "error" and bad.status()["state"] == "error"


def test_force_measures_again(tmp_path):
    cal = calibrator(tmp_path)
    cal.step()
    cal.start(force=True)
    assert cal.wait_idle(5)
    assert len(cal.made) == 2 and cal.status()["state"] == "done"


def test_background_loop_retries_until_the_gpu_is_free(tmp_path):
    p = prof(busy=True)
    cal = calibrator(tmp_path, profile=p, retry_s=0.01)
    cal.start()
    time.sleep(0.05)
    assert cal.status()["state"] == "waiting" and cal.made == []
    p["gpu_now"]["busy"] = False
    assert cal.wait_idle(5)
    assert cal.status()["state"] == "done" and len(cal.made) == 1
    cal.start()  # nothing to do: no new measurement
    assert cal.wait_idle(5) and len(cal.made) == 1


def test_model_pull_runs_once_and_reports_its_state():
    seen = []

    def ok(request):
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"status": "success"})
    pull = ModelPull("http://x", transport=httpx.MockTransport(ok))
    assert pull.status() == {"model": None, "state": "idle", "error": None, "completed": None, "total": None}
    pull.start(config.MODEL_DEFAULT_GPU)  # the model the page offered (the recommended one)
    assert pull.wait(5) and pull.status() == {"model": config.MODEL_DEFAULT_GPU, "state": "done", "error": None,
                                              "completed": None, "total": None}
    assert seen == [{"model": config.MODEL_DEFAULT_GPU, "stream": True}]  # streamed: progress per layer
    pull.start(config.MODEL_FAST)
    assert pull.wait(5) and pull.status()["model"] == config.MODEL_FAST and len(seen) == 2

    def down(request):
        raise httpx.ConnectError("refused", request=request)
    bad = ModelPull("http://x", transport=httpx.MockTransport(down))
    bad.start(config.MODEL_FAST)
    assert bad.wait(5) and bad.status()["state"] == "error" and bad.status()["error"]


def stream_body(*messages):
    return ("\n".join(json.dumps(m) for m in messages) + "\n").encode("utf-8")


def test_model_pull_reports_the_bytes_of_every_layer():
    body = stream_body({"status": "pulling manifest"},
                       {"status": "pulling aaa", "digest": "sha256:aaa", "total": 1000, "completed": 0},
                       {"status": "pulling aaa", "digest": "sha256:aaa", "total": 1000, "completed": 600},
                       {"status": "pulling bbb", "digest": "sha256:bbb", "total": 200, "completed": 200},
                       {"status": "pulling aaa", "digest": "sha256:aaa", "total": 1000, "completed": 1000},
                       {"status": "verifying sha256 digest"}, {"status": "success"})
    pull = ModelPull("http://x", transport=httpx.MockTransport(lambda r: httpx.Response(200, content=body)))
    pull.start(config.MODEL_DEFAULT_GPU)
    assert pull.wait(5)
    assert pull.status() == {"model": config.MODEL_DEFAULT_GPU, "state": "done", "error": None, "completed": 1200,
                             "total": 1200}


def test_model_pull_reports_an_error_line_and_a_stream_without_success():
    body = stream_body({"status": "pulling manifest"}, {"error": "pull model manifest: file does not exist"})
    bad = ModelPull("http://x", transport=httpx.MockTransport(lambda r: httpx.Response(200, content=body)))
    bad.start("nope:1b")
    assert bad.wait(5) and bad.status()["state"] == "error" and "file does not exist" in bad.status()["error"]
    cut = stream_body({"status": "pulling aaa", "digest": "sha256:aaa", "total": 1000, "completed": 10})
    short = ModelPull("http://x", transport=httpx.MockTransport(lambda r: httpx.Response(200, content=cut)))
    short.start(config.MODEL_FAST)
    assert short.wait(5) and short.status()["state"] == "error" and short.status()["completed"] == 10


def test_calibration_does_not_hold_the_model_in_memory_for_long():
    from vitranslate.calibrate import CAL_KEEP_ALIVE, make_llm
    gpu, cpu = make_llm("gpu", config.MODEL_DEFAULT_GPU, 120.0), make_llm("cpu", config.MODEL_DEFAULT_CPU, 300.0)
    try:
        assert (gpu.num_gpu, cpu.num_gpu) == (999, 0)
        assert gpu.keep_alive == cpu.keep_alive == CAL_KEEP_ALIVE == "2m"  # Ollama's default is 10 min
    finally:
        gpu.close()
        cpu.close()
