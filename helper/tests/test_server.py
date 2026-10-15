import json
import time

import pytest
from fastapi.testclient import TestClient

from fixtures import make_docx
from packutil import build, make_pack
from vitranslate import config
from vitranslate.device import Device
from vitranslate.jobs import JobManager
from vitranslate.pipeline import JobResult
from vitranslate.registry import Registry
from vitranslate.server import create_app


def fake_runner(src, out_dir, options, progress):
    out_dir.mkdir(parents=True, exist_ok=True)
    progress({"stage": "extract"})
    progress({"stage": "translate", "done": 1, "total": 1})
    out = out_dir / (src.stem + "_vi" + src.suffix)
    out.write_bytes(src.read_bytes())
    progress({"stage": "done", "flagged": 0})
    return JobResult(out, {"counts": {"segments": 1}, "fast": options.fast, "domain": options.domain,
                           "polish": options.polish})


MEASURED = {"gpu": {"overhead_s": 0.2, "word_s": 0.03, "start_s": 4.0, "prefill_tps": 2500.0, "decode_tps": 80.0,
                    "model": "gemma4:e4b", "at": "2026-10-14T15:00:00"}}
PROFILE = {"os": {"system": "Windows", "release": "11", "build": "10.0.26300", "machine": "AMD64"},
           "cpu": {"model": "Intel(R) Core(TM) i5-13500", "cores": 14, "threads": 20, "performance_cores": 6,
                   "efficiency_cores": 8},
           "ram": {"total_mb": 65314, "free_mb": 40000},
           "gpus": [{"vendor": "NVIDIA", "name": "NVIDIA GeForce RTX 5080", "vram_total_mb": 16303,
                     "vram_free_mb": 14500, "vram_used_mb": 1800, "util_pct": 2, "backend": "CUDA"}],
           "gpu_now": {"present": True, "name": "NVIDIA GeForce RTX 5080", "total_mb": 16303, "free_mb": 14500,
                       "foreign_mb": 1800, "util_pct": 2, "usable": True, "busy": False},
           "ollama": {"reachable": True, "version": "0.40.3", "models": ["gemma4:e4b", "qwen3.5:9b"], "model_gpu": True,
                      "model_cpu": True, "model_fast": False, "vram_mb": 0,
                      "digests": {"gemma4:e4b": "dc35e8d9c606", "qwen3.5:9b": "56671c000000"}},
           "disk": {"free_mb": 120000}}


class FakeScanner:
    def __init__(self, profile=None, ready=True):
        self.p, self.ready, self.calls = profile or PROFILE, ready, 0

    def profile(self, fresh=False):
        self.calls += 1
        return self.p

    def start(self):
        pass


class FakeCalibrator:
    def __init__(self, results=None):
        self.starts, self.res = [], MEASURED if results is None else results

    def start(self, force=False):
        self.starts.append(force)

    def results(self, profile=None):
        return self.res

    def status(self, profile=None):
        return {"state": "done" if self.res else "missing", "device": "gpu", "results": self.res}


class FakePull:
    def __init__(self):
        self.started, self.model = 0, None

    def start(self, model):
        self.started += 1
        self.model = model

    def status(self):
        return {"model": self.model, "state": "running" if self.started else "idle", "error": None}


def hw(**kw):
    return dict({"scanner": FakeScanner(), "calibrator": FakeCalibrator(), "pull": FakePull()}, **kw)


GPU = Device("gpu", "RTX", 14000, 999)


def client(tmp_path, web=None, registry=None, probe=lambda: GPU, models=lambda: ["gemma4:e4b", "qwen3.5:9b"], **kw):
    web = web or tmp_path / "web"
    web.mkdir(exist_ok=True)
    (web / "index.html").write_text("<!doctype html><title>t</title>", encoding="utf-8")
    manager = JobManager(home=tmp_path, runner=fake_runner)
    app = create_app(manager=manager, web_root=web, probe=probe, models=models,
                     registry=registry or Registry(tmp_path / "no-registry", tmp_path / "home"), refresh_every=None,
                     **hw(**kw))
    return TestClient(app, base_url="http://127.0.0.1")


def wait_done(c, jid):
    for _ in range(100):
        state = c.get("/api/jobs/" + jid).json()["state"]
        if state in ("done", "error"):
            return state
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_health(tmp_path):
    body = client(tmp_path).get("/api/health").json()
    assert body["app"] == "ViTranslate" and body["device"]["kind"] == "gpu"
    assert body["ollama"] is True and body["model_ready"] is True
    assert body["packs_installed"] == [] and body["registry_offline"] is None  # unknown: health does no I/O


def test_health_lists_installed_packs(tmp_path):
    make_pack(tmp_path / "packs", "alpha", detect=["tumor"])
    build(tmp_path / "packs", tmp_path / "reg")
    reg = Registry(tmp_path / "reg", tmp_path / "home")
    reg.ensure(reg.manifest()["packs"][0])
    body = client(tmp_path, registry=reg).get("/api/health").json()
    assert body["packs_installed"] == ["alpha@1.0.0"] and body["registry_offline"] is False


def test_health_does_no_network_io(tmp_path):
    import httpx
    seen = []

    def down(request):
        seen.append(request)
        raise httpx.ConnectError("no network", request=request)

    reg = Registry("https://reg.example/registry", tmp_path / "home", transport=httpx.MockTransport(down))
    c = client(tmp_path, registry=reg)
    assert c.get("/api/health").json()["registry_offline"] is None
    assert c.get("/api/health").json()["registry_offline"] is None and seen == []
    reg.manifest()  # a job start (or the background refresh) learns the registry is unreachable
    assert len(seen) == 1 and c.get("/api/health").json()["registry_offline"] is True  # last known state, live


def test_refresh_loop_calls_manifest_until_stopped():
    import threading
    from vitranslate.server import refresh_registry
    stop = threading.Event()

    class Counting:
        calls = 0

        def manifest(self):
            Counting.calls += 1
            if Counting.calls == 3:
                stop.set()
            if Counting.calls == 2:
                raise RuntimeError("a failing refresh must not end the loop")

    refresh_registry(Counting(), 0.001, stop)
    assert Counting.calls == 3


def test_default_job_manager_shares_the_registry(tmp_path, home):
    reg = Registry(tmp_path / "no-registry", tmp_path / "home2")
    app = create_app(web_root=tmp_path / "nope", probe=lambda: Device("cpu", "c", 0, 0), models=lambda: [],
                     registry=reg, refresh_every=None, **hw())
    assert app.state.registry is reg and app.state.manager.runner.keywords["registry"] is reg


def test_job_lifecycle_and_sse(tmp_path):
    c = client(tmp_path)
    data = make_docx(tmp_path / "a.docx").read_bytes()
    r = c.post("/api/jobs", files={"file": ("a.docx", data)}, data={"options": json.dumps({"fast": True})})
    assert r.status_code == 200
    jid = r.json()["id"]
    assert wait_done(c, jid) == "done"
    with c.stream("GET", "/api/jobs/%s/events" % jid) as s:
        lines = [line for line in s.iter_lines() if line.startswith("data: ")]
    stages = [json.loads(line[6:])["stage"] for line in lines]
    assert stages[0] == "queued" and "translate" in stages and stages[-1] == "finished"
    res = c.get("/api/jobs/%s/result" % jid)
    assert res.status_code == 200 and res.content == data
    assert "a_vi.docx" in res.headers["content-disposition"]
    assert c.get("/api/jobs/%s/report" % jid).json()["fast"] is True


def test_rejects_pdf_unknown_and_missing(tmp_path):
    c = client(tmp_path)
    r = c.post("/api/jobs", files={"file": ("a.pdf", b"%PDF-1.4")})
    assert r.status_code == 415 and r.json()["detail"] == "pdf_phase2"
    assert c.post("/api/jobs", files={"file": ("a.txt", b"x")}).status_code == 415
    assert c.get("/api/jobs/nope").status_code == 404


def test_cors_private_network_preflight(tmp_path):
    c = client(tmp_path)
    r = c.options("/api/health", headers={
        "Origin": "http://127.0.0.1:47831", "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true"})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-private-network") == "true"
    assert r.headers.get("access-control-allow-origin") == "http://127.0.0.1:47831"


def test_static_ui(tmp_path):
    assert "<title>t</title>" in client(tmp_path).get("/").text


def post_docx(c, tmp_path, **kw):
    data = make_docx(tmp_path / "a.docx").read_bytes()
    return c.post("/api/jobs", files={"file": ("a.docx", data)}, **kw)


def test_upload_limit_content_length_and_stream(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_MB", 0.0005)  # ~524 bytes
    c = client(tmp_path)
    r = c.post("/api/jobs", files={"file": ("a.docx", b"x" * 5000)})
    assert r.status_code == 413
    # no Content-Length check possible (chunked): the streamed copy must still abort and clean up
    before = set((tmp_path / "jobs").iterdir())
    def gen():
        yield b'--B\r\nContent-Disposition: form-data; name="file"; filename="a.docx"\r\n\r\n'
        yield b"x" * 5000
        yield b"\r\n--B--\r\n"
    r = c.post("/api/jobs", content=gen(), headers={"Content-Type": "multipart/form-data; boundary=B"})
    assert r.status_code == 413
    assert set((tmp_path / "jobs").iterdir()) == before


def test_evil_origin_and_host(tmp_path):
    c = client(tmp_path)
    assert post_docx(c, tmp_path, headers={"Origin": "https://evil.example"}).status_code == 403
    assert post_docx(c, tmp_path, headers={"Origin": "http://127.0.0.1:47831"}).status_code == 200
    assert post_docx(c, tmp_path).status_code == 200  # no Origin: same-origin / curl
    assert c.get("/api/health", headers={"Host": "attacker.example"}).status_code == 400


def test_public_site_origin(tmp_path):
    # the published page may call the helper; its preview deployments and look-alike origins may not
    c = client(tmp_path)
    site = "https://vitrans.pages.dev"
    r = c.options("/api/health", headers={
        "Origin": site, "Access-Control-Request-Method": "GET", "Access-Control-Request-Private-Network": "true"})
    assert r.status_code == 200 and r.headers.get("access-control-allow-origin") == site
    assert c.get("/api/health", headers={"Origin": site}).headers.get("access-control-allow-origin") == site
    assert post_docx(c, tmp_path, headers={"Origin": site}).status_code == 200
    for other in ("https://abc123.vitrans.pages.dev", "http://vitrans.pages.dev", "https://vitrans.pages.dev.evil.example"):
        assert post_docx(c, tmp_path, headers={"Origin": other}).status_code == 403


def test_options_validation(tmp_path):
    c = client(tmp_path)
    for bad in ("not json", "[1]", json.dumps({"fast": "maybe"}), json.dumps({"fast": 1}),
                json.dumps({"domain": "Bad Domain"}), json.dumps({"domain": "Pathology"}),
                json.dumps({"domain": "a,,b"}), json.dumps({"domain": "pathology,"}),
                json.dumps({"domain": "../x"}), json.dumps({"domain": 5}), json.dumps({"domain": "pathology\n"})):
        assert post_docx(c, tmp_path, data={"options": bad}).status_code == 400, bad
    ok = post_docx(c, tmp_path, data={"options": json.dumps({"fast": "true", "notes": False, "domain": ""})})
    assert ok.status_code == 200
    # ids are only checked for shape: existence is the pipeline's job (unknown ids are reported as unavailable)
    for good, normal in (("no_such_pack", "no_such_pack"), ("pathology,breast-v2", "pathology,breast-v2"),
                         ("pathology", "pathology"), ("pathology, breast-v2", "pathology,breast-v2")):
        r = post_docx(c, tmp_path, data={"options": json.dumps({"domain": good})})
        assert r.status_code == 200, good
        assert wait_done(c, r.json()["id"]) == "done"
        assert c.get("/api/jobs/%s/report" % r.json()["id"]).json()["domain"] == normal


def test_polish_option_is_a_strict_boolean_or_automatic(tmp_path):
    c = client(tmp_path)
    for bad in ({"polish": "maybe"}, {"polish": 1}, {"polish": "yes"}):
        assert post_docx(c, tmp_path, data={"options": json.dumps(bad)}).status_code == 400, bad
    for opts, parsed in (({"polish": True}, True), ({"polish": "false"}, False), ({}, None), ({"polish": None}, None)):
        r = post_docx(c, tmp_path, data={"options": json.dumps(opts)})
        assert r.status_code == 200 and wait_done(c, r.json()["id"]) == "done", opts
        assert c.get("/api/jobs/%s/report" % r.json()["id"]).json()["polish"] is parsed, opts


def test_display_name_cleaned(tmp_path):
    c = client(tmp_path)
    data = make_docx(tmp_path / "a.docx").read_bytes()
    r = c.post("/api/jobs", files={"file": ("C:\\x\\..\\we<i>rd?.docx", data)})
    jid = r.json()["id"]
    assert wait_done(c, jid) == "done"
    name = c.get("/api/jobs/%s/result" % jid).headers["content-disposition"]
    assert "we_i_rd_" in name and "<" not in name and ".." not in name


def test_error_code_and_sse_resume(tmp_path):
    from vitranslate.llm import LLMError
    def boom(src, out_dir, options, progress):
        raise LLMError("down")
    manager = JobManager(home=tmp_path, runner=boom)
    web = tmp_path / "web"
    web.mkdir()
    app = create_app(manager=manager, web_root=web, probe=lambda: Device("cpu", "c", 0, 0), models=lambda: [],
                     **hw())
    c = TestClient(app, base_url="http://127.0.0.1")
    jid = post_docx(c, tmp_path).json()["id"]
    assert wait_done(c, jid) == "error"
    with c.stream("GET", "/api/jobs/%s/events" % jid) as s:
        text = "".join(s.iter_text())
    assert "id: 1" in text and '"code": "ollama_unavailable"' in text
    with c.stream("GET", "/api/jobs/%s/events" % jid, headers={"Last-Event-ID": "1"}) as s:
        text = "".join(s.iter_text())
    assert '"queued"' not in text and '"error"' in text


def test_missing_web_dir_keeps_api(tmp_path):
    manager = JobManager(home=tmp_path, runner=fake_runner)
    app = create_app(manager=manager, web_root=tmp_path / "nope", probe=lambda: Device("cpu", "c", 0, 0),
                     models=lambda: [], registry=Registry(None, tmp_path / "home"), refresh_every=0, **hw())
    assert TestClient(app, base_url="http://127.0.0.1").get("/api/health").status_code == 200


def test_job_error_keeps_partial_report(tmp_path):
    from vitranslate.pipeline import JobError

    def bad(src, out_dir, options, progress):
        raise JobError("output does not reopen", {"counts": {"segments": 3}})
    manager = JobManager(home=tmp_path, runner=bad)
    web = tmp_path / "web"
    web.mkdir()
    c = TestClient(create_app(manager=manager, web_root=web, probe=lambda: Device("cpu", "c", 0, 0),
                              models=lambda: [], registry=Registry(None, tmp_path / "home"),
                              refresh_every=0, **hw()), base_url="http://127.0.0.1")
    jid = post_docx(c, tmp_path).json()["id"]
    assert wait_done(c, jid) == "error"
    assert c.get("/api/jobs/" + jid).json()["last"]["code"] == "output_invalid"
    assert c.get("/api/jobs/%s/report" % jid).json()["counts"]["segments"] == 3
    assert (manager.jobs[jid].dir / "report.json").exists()
    assert c.get("/api/jobs/%s/result" % jid).status_code == 409


def test_registry_without_source_is_offline_and_silent(tmp_path):
    reg = Registry(None, tmp_path / "home")
    assert reg.manifest() == {"packs": [], "idf": {}} and reg.offline is True
    import pytest
    from vitranslate.registry import PackUnavailable
    with pytest.raises(PackUnavailable):
        reg.ensure({"id": "a", "version": "1.0.0", "file": "a-1.0.0.zip", "sha256": "0" * 64})


def test_health_model_fast_ready(tmp_path):
    body = client(tmp_path).get("/api/health").json()
    assert body["model_fast_ready"] is False  # fake models() lists only the two defaults
    assert body["model_fast"] == "gemma4:e2b"


def test_health_names_the_model_of_the_device_a_job_would_use(tmp_path):
    body = client(tmp_path).get("/api/health").json()
    assert (body["model_default"], body["model_ready"]) == ("gemma4:e4b", True)  # GPU: Gemma 4 E4B
    cpu = client(tmp_path, probe=lambda: Device("cpu", "CPU", 0, 0), models=lambda: ["qwen3.5:9b"])
    assert cpu.get("/api/health").json()["model_default"] == "qwen3.5:9b"  # CPU: Qwen 3.5 9B
    assert cpu.get("/api/health").json()["model_ready"] is True
    # a GPU without the GPU model: not ready (the page shows the download button; nothing is pulled on its own)
    body = client(tmp_path, models=lambda: ["qwen3.5:9b"]).get("/api/health").json()
    assert (body["model_default"], body["model_ready"]) == ("gemma4:e4b", False)


def test_upload_stored_as_input_and_removed_after_job(tmp_path):
    c = client(tmp_path)
    jid = post_docx(c, tmp_path).json()["id"]
    assert wait_done(c, jid) == "done"
    d = tmp_path / "jobs" / jid
    assert not (d / "input.docx").exists()  # the uploaded document does not stay on disk
    assert c.get("/api/jobs/%s/result" % jid).status_code == 200  # the translation does


def test_input_removed_after_error_too(tmp_path):
    from vitranslate.llm import LLMError

    def boom(src, out_dir, options, progress):
        assert src.name == "input.docx"
        raise LLMError("down")
    manager = JobManager(home=tmp_path, runner=boom)
    job = manager.submit("Long Name.docx", b"x", None)
    for _ in range(100):
        if job.state == "error":
            break
        time.sleep(0.05)
    assert job.state == "error" and not (job.dir / "input.docx").exists()


def test_old_job_folders_pruned_at_startup(tmp_path):
    import os
    old, new = tmp_path / "jobs" / "old", tmp_path / "jobs" / "new"
    old.mkdir(parents=True)
    new.mkdir(parents=True)
    past = time.time() - 25 * 3600
    os.utime(old, (past, past))
    JobManager(home=tmp_path, runner=fake_runner)
    assert not old.exists() and new.exists()


def test_delete_job(tmp_path):
    import threading
    c = client(tmp_path)
    assert c.delete("/api/jobs/nope").status_code == 404
    jid = post_docx(c, tmp_path).json()["id"]
    assert wait_done(c, jid) == "done"
    assert c.delete("/api/jobs/" + jid).status_code == 200
    assert c.get("/api/jobs/" + jid).status_code == 404 and not (tmp_path / "jobs" / jid).exists()
    gate = threading.Event()

    def slow(src, out_dir, options, progress):
        gate.wait(5)
        return fake_runner(src, out_dir, options, progress)
    manager = JobManager(home=tmp_path, runner=slow)
    c2 = TestClient(create_app(manager=manager, web_root=tmp_path / "web", probe=lambda: Device("cpu", "c", 0, 0),
                               models=lambda: [], registry=Registry(None, tmp_path / "home"), refresh_every=0,
                               **hw()),
                    base_url="http://127.0.0.1")
    jid = post_docx(c2, tmp_path).json()["id"]
    assert c2.delete("/api/jobs/" + jid).status_code == 409
    gate.set()
    assert wait_done(c2, jid) == "done"


def test_413_carries_cors_headers(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_MB", 0.0005)
    c = client(tmp_path)
    r = c.post("/api/jobs", files={"file": ("a.docx", b"x" * 5000)}, headers={"Origin": "http://127.0.0.1:47831"})
    assert r.status_code == 413
    assert r.headers.get("access-control-allow-origin") == "http://127.0.0.1:47831"


def test_unstorable_upload_is_json_400(tmp_path, monkeypatch):
    c = client(tmp_path)

    def fail(*a, **k):
        raise OSError("path too long")
    monkeypatch.setattr(JobManager, "submit", fail)
    r = post_docx(c, tmp_path)
    assert r.status_code == 400 and r.json()["detail"] == "cannot_store"


def test_output_named_after_upload_and_report_matches(tmp_path):
    c = client(tmp_path)
    data = make_docx(tmp_path / "a.docx").read_bytes()
    jid = c.post("/api/jobs", files={"file": ("My Paper.docx", data)}).json()["id"]
    assert wait_done(c, jid) == "done"
    assert "My%20Paper_vi.docx" in c.get("/api/jobs/%s/result" % jid).headers["content-disposition"]
    assert c.get("/api/jobs/%s/report" % jid).json().get("output", "My Paper_vi.docx") == "My Paper_vi.docx"


def test_hardware_waits_for_the_first_scan(tmp_path):
    c = client(tmp_path, scanner=FakeScanner(ready=False))
    assert c.get("/api/hardware").json() == {"ready": False}
    assert c.get("/api/health").json()["recommendation"] is None


def test_hardware_profile_calibration_and_recommendation(tmp_path):
    body = client(tmp_path).get("/api/hardware").json()
    assert body["ready"] is True and body["profile"]["cpu"]["cores"] == 14
    assert "digests" not in body["profile"]["ollama"]
    assert body["calibration"]["state"] == "done" and body["calibration"]["results"]["gpu"]["decode_tps"] == 80.0
    rec = body["recommendation"]
    assert rec["engine"] == "helper-gpu" and rec["model"] == "gemma4:e4b" and rec["polish_default"] is True
    assert rec["estimates"]["basis"] == "measured"
    assert body["pull"] == {"model": None, "state": "idle", "error": None}


def test_health_carries_a_short_recommendation(tmp_path):
    rec = client(tmp_path).get("/api/health").json()["recommendation"]
    assert rec == {"engine": "helper-gpu", "model": "gemma4:e4b", "polish_default": True, "fast_default": False,
                   "needs_download": False, "calibration": "done"}


def test_calibrate_endpoint_starts_or_forces_and_checks_the_origin(tmp_path):
    cal = FakeCalibrator(results={})
    c = client(tmp_path, calibrator=cal)
    assert c.post("/api/hardware/calibrate").json()["state"] == "missing"
    assert c.post("/api/hardware/calibrate", json={"force": True}).status_code == 200
    assert cal.starts[-2:] == [False, True]
    assert c.post("/api/hardware/calibrate", json={"force": "yes"}).status_code == 400
    assert c.post("/api/hardware/calibrate", content=b"[1]",
                  headers={"Content-Type": "application/json"}).status_code == 400
    n = len(cal.starts)
    r = c.post("/api/hardware/calibrate", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403 and len(cal.starts) == n
    assert c.post("/api/hardware/calibrate", headers={"Origin": "https://vitrans.pages.dev"}).status_code == 200


def test_the_recommended_model_is_downloaded_only_on_request_and_origin_checked(tmp_path):
    missing = dict(PROFILE, ollama=dict(PROFILE["ollama"], models=["qwen3.5:9b"], model_gpu=False))
    pull = FakePull()
    c = client(tmp_path, pull=pull, scanner=FakeScanner(missing))
    assert pull.started == 0  # never on its own
    assert c.post("/api/models/pull", headers={"Origin": "https://evil.example"}).status_code == 403
    assert pull.started == 0
    body = c.post("/api/models/pull").json()
    assert body["state"] == "running" and pull.started == 1 and body["model"] == "gemma4:e4b"
    # pages built before Amendment E post to the old path: same action
    assert c.post("/api/models/fast/pull").json()["model"] == "gemma4:e4b" and pull.started == 2


def test_nothing_is_downloaded_when_the_recommended_model_is_installed(tmp_path):
    pull = FakePull()
    c = client(tmp_path, pull=pull)
    assert c.post("/api/models/pull").json()["state"] == "idle" and pull.started == 0


def test_startup_scans_then_starts_the_calibration(tmp_path):
    cal = FakeCalibrator(results={})
    scanner = FakeScanner()
    client(tmp_path, calibrator=cal, scanner=scanner)
    for _ in range(100):
        if cal.starts:
            break
        time.sleep(0.02)
    assert cal.starts[:1] == [False] and scanner.calls >= 1


def test_job_manager_reports_active_jobs(tmp_path):
    import threading
    gate = threading.Event()

    def slow(src, out_dir, options, progress):
        gate.wait(5)
        return fake_runner(src, out_dir, options, progress)
    manager = JobManager(home=tmp_path, runner=slow)
    assert manager.active() is False
    from vitranslate.pipeline import Options
    job = manager.submit("a.docx", make_docx(tmp_path / "a.docx").read_bytes(), Options())
    assert manager.active() is True
    gate.set()
    for _ in range(100):
        if job.state == "done":
            break
        time.sleep(0.05)
    assert job.state == "done" and manager.active() is False


def test_default_jobs_get_a_time_estimate_from_the_calibration(tmp_path, home):
    app = create_app(web_root=tmp_path / "nope", probe=lambda: Device("gpu", "g", 14000, 999), models=lambda: [],
                     registry=Registry(None, tmp_path / "home"), refresh_every=None, **hw())
    est = app.state.manager.runner.keywords["estimator"](Device("gpu", "g", 14000, 999), "gemma4:e4b", [10, 20], True)
    summary = est.summary()
    assert summary["basis"] == "measured" and summary["translate_s"] == pytest.approx(4.0 + 0.4 + 0.9)


class FakeSetup:
    def __init__(self):
        self.attached, self.starts = None, 0

    def attach(self, model_needed, pull):
        self.attached = (model_needed, pull)

    def start(self):
        self.starts += 1

    def status(self):
        return {"state": "running", "step": "download", "reason": None, "mode": "portable",
                "ollama_url": "http://127.0.0.1:11435", "ollama_version": None,
                "download": {"done": 5, "total": 10}, "error": None, "model": None}


def test_without_a_setup_the_setup_endpoints_say_off(tmp_path):
    c = client(tmp_path)  # the helper run from source: no first-run setup
    assert c.get("/api/setup").json() == {"state": "off"}
    assert c.get("/api/health").json()["setup"] == {"state": "off"}
    assert c.post("/api/setup/start").status_code == 404


def test_the_installed_helper_starts_its_setup_and_shows_its_progress(tmp_path):
    setup, pull = FakeSetup(), FakePull()
    c = client(tmp_path, setup=setup, pull=pull)
    assert setup.starts == 1 and setup.attached[1] is pull  # the page's pull and the setup's pull are one
    assert c.get("/api/setup").json()["download"] == {"done": 5, "total": 10}
    assert c.get("/api/health").json()["setup"] == {"state": "running", "step": "download", "mode": "portable",
                                                     "error": None}
    assert c.post("/api/setup/start", headers={"Origin": "https://evil.example"}).status_code == 403
    assert setup.starts == 1
    assert c.post("/api/setup/start").json()["state"] == "running" and setup.starts == 2


def test_the_setup_pulls_only_the_recommended_model_and_only_when_missing(tmp_path):
    missing = dict(PROFILE, ollama=dict(PROFILE["ollama"], models=["qwen3.5:9b"], model_gpu=False))
    setup, scanner = FakeSetup(), FakeScanner(missing)
    client(tmp_path, setup=setup, scanner=scanner)
    model_needed = setup.attached[0]
    assert model_needed() == "gemma4:e4b"
    scanner.p = PROFILE
    assert model_needed() is None
