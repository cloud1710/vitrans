"""FastAPI app for the local helper: health, jobs, SSE progress, results and the static UI (127.0.0.1 only)."""
import functools
import json
import logging
import os
import re
import threading
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

import httpx
from fastapi import Body, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import config
from . import device as device_mod
from . import hardware as hardware_mod
from .calibrate import CalibrationStore, Calibrator, ModelPull
from .jobs import JobManager, TooLarge
from .llm import list_models
from .pipeline import Options, run_job
from .recommend import job_estimate, rates, recommend
from .registry import Registry

log = logging.getLogger("vitranslate")

ACCEPTED = (".docx", ".pptx")
DOMAIN_RE = re.compile(r"^[a-z0-9_-]+$")  # one pack id; options.domain = comma-separated ids
CACHE_SECONDS = 5.0
REFRESH_SECONDS = 600.0  # background refresh of the registry manifest; jobs also refresh it when they start


def _origins():
    extra = [o.strip() for o in os.environ.get("VITRANSLATE_ORIGINS", "").split(",") if o.strip()]
    return config.ALLOWED_ORIGINS + extra


def _models():
    return list_models(config.ollama_url(), timeout=httpx.Timeout(5.0, connect=1.0))


def _strict_bool(value, default):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if value in ("true", "false"):
        return value == "true"
    raise HTTPException(400, "bad_options")


def _parse_options(raw):
    try:
        opts = json.loads(raw or "{}")
    except ValueError:
        raise HTTPException(400, "bad_options")
    if not isinstance(opts, dict):
        raise HTTPException(400, "bad_options")
    domain = opts.get("domain", "")
    if not isinstance(domain, str):
        raise HTTPException(400, "bad_domain")
    # shape only: whether a pack exists is decided by the pipeline (unknown ids are reported as unavailable)
    if domain:
        ids = [d.strip(" ") for d in domain.split(",")]  # "pathology, breast" is fine
        if not all(DOMAIN_RE.fullmatch(d) for d in ids):
            raise HTTPException(400, "bad_domain")
        domain = ",".join(ids)
    return Options(fast=_strict_bool(opts.get("fast"), False), notes=_strict_bool(opts.get("notes"), True),
                   comments=_strict_bool(opts.get("comments"), False), domain=domain,
                   polish=_strict_bool(opts.get("polish"), None))  # absent / null: automatic (on with a GPU)


def refresh_registry(registry, every, stop):
    """Refresh the registry manifest (and with it `registry.offline`) now and then every `every` seconds until
    `stop` is set; a failing refresh is logged and the loop goes on."""
    while True:
        try:
            registry.manifest()
        except Exception as exc:  # the loop must outlive any registry problem
            log.warning("registry refresh failed: %s", exc)
        if stop.wait(every):
            return


def create_app(manager=None, web_root=None, probe=device_mod.probe, models=_models, registry=None,
               refresh_every=REFRESH_SECONDS, scanner=None, calibrator=None, pull=None, start_hardware=True):
    registry = registry or Registry(config.registry_source(), config.app_home())

    def estimator(dev, model, words, polish):
        """Per-job time estimate from the stored calibration (defaults until this machine is measured)."""
        try:
            measured = calibrator.results() if scanner.ready else {}
        except Exception:  # an estimate must never fail a job
            measured = {}
        return job_estimate(rates(dev.kind, model, measured), dev.kind, words, polish)

    # one registry for health and jobs: /api/health reports the state the last job (or refresh) found
    manager = manager or JobManager(runner=functools.partial(run_job, registry=registry, estimator=estimator))
    scanner = scanner or hardware_mod.Scanner()
    calibrator = calibrator or Calibrator(scanner, CalibrationStore(config.app_home()), job_active=manager.active)
    pull = pull or ModelPull()
    origins = _origins()
    app = FastAPI(title="ViTranslate helper", docs_url=None, redoc_url=None, openapi_url=None)
    @app.middleware("http")
    async def guard_uploads(request, call_next):
        if request.method == "POST":  # every state-changing call: only the helper's own page and the published site
            origin = request.headers.get("origin")
            if origin is not None and origin not in origins:
                return JSONResponse({"detail": "forbidden_origin"}, status_code=403)
        if request.method == "POST" and request.url.path == "/api/jobs":
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > config.MAX_UPLOAD_MB * 1024 * 1024:
                return JSONResponse({"detail": "too_large"}, status_code=413)
        return await call_next(request)

    # CORS is added after the guard so that it wraps it: the guard's 403 / 413 answers carry CORS headers
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["*"], allow_private_network=True)
    # added last = outermost: a foreign Host header (DNS rebinding) is refused before anything else runs
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

    def get_job(jid):
        job = manager.jobs.get(jid)
        if job is None:
            raise HTTPException(404, "unknown_job")
        return job

    app.state.registry, app.state.manager = registry, manager
    app.state.scanner, app.state.calibrator, app.state.pull = scanner, calibrator, pull
    if refresh_every:
        app.state.refresh_stop = threading.Event()
        threading.Thread(target=refresh_registry, args=(registry, refresh_every, app.state.refresh_stop),
                         name="registry-refresh", daemon=True).start()
    if start_hardware:
        def boot():
            # scan in the background at startup, then calibrate once the helper is idle (calibrate.py)
            try:
                scanner.profile()
                calibrator.start()
            except Exception as exc:  # the helper works without a scan (defaults)
                log.warning("hardware scan failed: %s", exc)
        threading.Thread(target=boot, name="hardware-boot", daemon=True).start()

    cache = {"at": 0.0, "value": None}

    def probed():
        now = time.monotonic()
        if cache["value"] is None or now - cache["at"] > CACHE_SECONDS:
            cache["value"] = (probe(), models())
            cache["at"] = now
        return cache["value"]

    def hardware_state():
        prof = scanner.profile()
        cal = calibrator.status(prof)
        return prof, cal, recommend(prof, cal.get("results") or {})

    def short_recommendation():
        if not scanner.ready:
            return None
        try:
            _, cal, rec = hardware_state()
        except Exception as exc:
            log.warning("recommendation failed: %s", exc)
            return None
        out = {k: rec[k] for k in ("engine", "model", "polish_default", "fast_default", "needs_download")}
        out["calibration"] = cal.get("state")
        return out

    @app.get("/api/health")
    def health():
        device, names = probed()
        model = config.default_model(device.kind)  # the model a job would use now (GPU: Gemma 4 E4B, CPU: Qwen 9B)
        # registry: the last known state only (no network I/O here); None until a job or the refresh has looked
        return {"app": config.APP_NAME, "version": config.VERSION, "device": asdict(device),
                "ollama": names is not None, "models": names or [],
                "model_default": model, "model_fast": config.MODEL_FAST,
                "model_ready": bool(names) and model in names,
                "model_fast_ready": bool(names) and config.MODEL_FAST in names,
                "packs_installed": registry.installed(), "registry_offline": registry.offline,
                "recommendation": short_recommendation()}

    @app.get("/api/hardware")
    def hardware_info():
        """Scan (no serial numbers, user names or paths), calibration state and the recommended setup."""
        if not scanner.ready:
            return {"ready": False}
        prof, cal, rec = hardware_state()
        return {"ready": True, "profile": hardware_mod.public(prof), "calibration": cal, "recommendation": rec,
                "pull": pull.status()}

    @app.post("/api/hardware/calibrate")
    def hardware_calibrate(payload: Any = Body(None)):
        """Start the calibration if this hardware has none (no-op otherwise); {"force": true} measures again."""
        if payload is not None and not isinstance(payload, dict):
            raise HTTPException(400, "bad_options")
        calibrator.start(force=_strict_bool((payload or {}).get("force"), False))
        return calibrator.status()

    @app.post("/api/models/pull")
    @app.post("/api/models/fast/pull")  # the path of pages built before Amendment E
    def pull_model():
        """Download the recommended model when Ollama does not have it, only when the user pressed the button on the
        page (the page cannot name another model)."""
        if scanner.ready:
            _, _, rec = hardware_state()
            if rec["needs_download"]:
                pull.start(rec["model"])
        return pull.status()

    @app.post("/api/jobs")
    def create_job(file: UploadFile = File(...), options: str = Form("{}")):
        name = file.filename or "input"
        suffix = os.path.splitext(name)[1].lower()
        if suffix == ".pdf":
            raise HTTPException(415, "pdf_phase2")
        if suffix not in ACCEPTED:
            raise HTTPException(415, "unsupported_type")
        opts = _parse_options(options)
        try:
            job = manager.submit(name, file.file, opts, max_bytes=int(config.MAX_UPLOAD_MB * 1024 * 1024))
        except TooLarge:
            raise HTTPException(413, "too_large")
        except OSError:  # e.g. the job folder path is too long
            raise HTTPException(400, "cannot_store")
        return {"id": job.id}

    @app.get("/api/jobs/{jid}")
    def job_state(jid: str):
        job = get_job(jid)
        return {"id": job.id, "name": job.name, "state": job.state, "error": job.error,
                "last": job.events[-1] if job.events else None}

    @app.delete("/api/jobs/{jid}")
    def job_delete(jid: str):
        get_job(jid)
        try:
            manager.delete(jid)
        except KeyError:
            raise HTTPException(404, "unknown_job")
        except ValueError:
            raise HTTPException(409, "job_running")
        return {"deleted": jid}

    @app.get("/api/jobs/{jid}/events")
    def job_events(jid: str, last_event_id: str = Header(None)):
        job = get_job(jid)
        start = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0

        def stream():
            since = start
            while True:
                events = manager.wait_events(job, since)
                for ev in events:
                    since += 1
                    yield "id: %d\ndata: %s\n\n" % (since, json.dumps(ev, ensure_ascii=False))
                if job.state in ("done", "error") and since >= len(job.events):
                    return
                if not events:
                    yield ": keep-alive\n\n"

        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache"})

    @app.get("/api/jobs/{jid}/result")
    def job_result(jid: str):
        job = get_job(jid)
        if job.state != "done" or job.output is None:
            raise HTTPException(409, "not_ready")
        return FileResponse(job.output, filename=job.output.name)

    @app.get("/api/jobs/{jid}/report")
    def job_report(jid: str):
        job = get_job(jid)
        if job.report is None:
            raise HTTPException(409, "not_ready")
        return job.report

    root = Path(web_root or config.web_dir())
    if root.is_dir():
        app.mount("/", StaticFiles(directory=str(root), html=True), name="ui")
    else:
        log.warning("web directory %s not found: serving the API only", root)
    return app
