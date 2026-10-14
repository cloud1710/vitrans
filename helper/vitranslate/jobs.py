"""One worker thread runs jobs in order; every job keeps its progress events for the SSE stream."""
import io
import json
import os
import queue
import re
import shutil
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from . import config
from .llm import LLMError
from .ooxml.package import UnsupportedFile
from .pipeline import JobError, run_job


class TooLarge(Exception):
    pass


def clean_name(filename, limit=120):
    """Display/storage name: no path, no reserved or control characters, capped length."""
    base = re.split(r"[\\/]", filename or "")[-1]
    base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", base).strip(" .")
    stem, dot, ext = base.rpartition(".")
    if not dot:
        stem, ext = base, ""
    stem = stem.strip(" .") or "input"
    return stem[: max(1, limit - len(ext) - 1)] + ("." + ext if ext else "")


JOB_MAX_AGE = 24 * 3600  # job folders older than this are removed at startup


@dataclass
class Job:
    id: str
    name: str   # display name: the output / download name derives from it
    dir: Path
    options: object
    state: str = "queued"
    events: list = field(default_factory=list)
    output: Path = None
    report: dict = None
    error: str = ""
    src: Path = None  # the stored upload (input<ext>), deleted when the job ends


class JobManager:
    def __init__(self, home=None, runner=run_job):
        self.home = Path(home or config.app_home()) / "jobs"
        self.home.mkdir(parents=True, exist_ok=True)
        self.runner = runner
        self.jobs = {}
        self._queue = queue.Queue()
        self._cond = threading.Condition()
        self._prune_old()
        threading.Thread(target=self._loop, daemon=True).start()

    def _prune_old(self):
        cutoff = time.time() - JOB_MAX_AGE
        for p in self.home.iterdir():
            try:
                if p.is_dir() and p.stat().st_mtime < cutoff:
                    shutil.rmtree(p, ignore_errors=True)
            except OSError:
                pass

    def active(self):
        """True while a job is queued or running (background work such as calibration waits)."""
        with self._cond:
            return any(j.state in ("queued", "running") for j in self.jobs.values())

    def delete(self, jid):
        """Remove a finished job (folder and memory). KeyError: unknown; ValueError: queued or running."""
        with self._cond:
            job = self.jobs[jid]
            if job.state not in ("done", "error"):
                raise ValueError("job is not finished")
            del self.jobs[jid]
        shutil.rmtree(job.dir, ignore_errors=True)

    def submit(self, filename, source, options, max_bytes=None):
        """source: bytes or a binary file object (copied in 1 MB chunks; TooLarge beyond max_bytes)."""
        jid = uuid.uuid4().hex[:12]
        d = self.home / jid
        d.mkdir(parents=True)
        name = clean_name(filename)
        src = d / ("input" + os.path.splitext(name)[1].lower())  # short fixed name: no long-path failures
        try:
            with open(src, "wb") as out:
                if isinstance(source, (bytes, bytearray)):
                    source = io.BytesIO(source)
                total = 0
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if max_bytes is not None and total > max_bytes:
                        raise TooLarge()
                    out.write(chunk)
        except BaseException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        job = Job(jid, name, d, options, src=src)
        with self._cond:
            self.jobs[jid] = job
        self._event(job, {"stage": "queued"})
        self._queue.put(jid)
        return job

    def _event(self, job, event):
        with self._cond:
            job.events.append(dict(event, t=round(time.time(), 1)))
            self._cond.notify_all()

    def _finish(self, job, state, event):
        with self._cond:
            job.state = state
            job.events.append(dict(event, t=round(time.time(), 1)))
            self._cond.notify_all()

    def wait_events(self, job, since, timeout=15.0):
        with self._cond:
            if len(job.events) <= since and job.state not in ("done", "error"):
                self._cond.wait(timeout)
            return list(job.events[since:])

    @staticmethod
    def _remove_input(job):
        try:
            job.src.unlink(missing_ok=True)
        except OSError:
            pass

    @staticmethod
    def _named(job, output):
        """Rename the pipeline output (input_vi.ext) to <display name>_vi.ext."""
        target = output.with_name(Path(job.name).stem + "_vi" + output.suffix)
        if target == output:
            return output
        try:
            os.replace(output, target)
            return target
        except OSError:
            return output

    def _loop(self):
        while True:
            job = self.jobs[self._queue.get()]
            job.state = "running"
            try:
                res = self.runner(job.src, job.dir / "out", job.options,
                                  progress=lambda ev, job=job: self._event(job, ev))
                job.output, job.report = self._named(job, res.output), res.report
                if isinstance(job.report, dict) and "output" in job.report:
                    job.report = dict(job.report, output=job.output.name, file=job.name)
                (job.dir / "report.json").write_text(json.dumps(job.report, ensure_ascii=False, indent=1),
                                                     encoding="utf-8")
                self._remove_input(job)
                self._finish(job, "done", {"stage": "finished"})
            except JobError as exc:
                self._remove_input(job)
                job.error, job.report = str(exc), exc.report
                (job.dir / "report.json").write_text(json.dumps(job.report, ensure_ascii=False, indent=1),
                                                     encoding="utf-8")
                self._finish(job, "error", {"stage": "error", "message": job.error, "code": "output_invalid"})
            except (UnsupportedFile, LLMError) as exc:
                self._remove_input(job)
                job.error = str(exc)
                code = "unsupported_file" if isinstance(exc, UnsupportedFile) else "ollama_unavailable"
                self._finish(job, "error", {"stage": "error", "message": job.error, "code": code})
            except Exception as exc:  # keep the worker alive; full traceback kept next to the job
                self._remove_input(job)
                job.error = "%s: %s" % (type(exc).__name__, exc)
                (job.dir / "error.txt").write_text(traceback.format_exc(), encoding="utf-8")
                self._finish(job, "error", {"stage": "error", "message": job.error, "code": "internal"})
