"""The only sanctioned way for pack miners to download corpus files (K10 of docs/packs/2026-10-14-pack-roadmap.md).
The GI miner sent ~800 requests against a cap of 120 and the head-neck miner hit a 429: a rule in a prompt is not
enough, so every rule below is enforced here.

Usage: python tools/corpus_fetch.py [URL ...] [--urls FILE] [--corpus DIR] [--run NAME]
                                    [--max-per-host 40] [--max-total 175] [--delay 3]
  FILE: one URL per line, blank lines and "#" comments ignored. Console output is ASCII.
  Exit 0 = done; 2 = a cap left URLs out; 3 = the run is stopped (now or earlier) or another fetch holds the lock.

- Deny list (DENY: tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com, icd.kcb.vn and their subdomains): never
  requested.
- Cache: a URL already saved with status 200 whose file is still there is answered from the corpus, no request.
- Caps per run (a run = one mining wave, --run, default "default"): at most --max-per-host requests to one host and
  --max-total in all. The counts live in <corpus>/counter.json, so they hold across invocations of this tool; a new
  wave starts with a new --run name.
- Pace: at least --delay seconds (HOST_DELAY may ask more: VJOL 5 s) between two requests to one host, measured from
  the end of the previous request, also across invocations (counter.json "last"). One request at a time, one process
  at a time (<corpus>/.lock; a lock older than STALE_LOCK seconds is taken over).
- Stop: the first 429, 403 or transport error (connection reset / refused, timeout) stops the run: nothing more is
  requested under that run name (counter.json runs.<run>.stopped), and the host goes into counter.json "blocked",
  refused by every later run until removed by hand.
- Redirects are not followed: a 3xx is logged with its Location; fetch that URL explicitly so the rules apply to it.
- Every request is logged in <corpus>/manifest.jsonl: url, host, status, sha256, size, date (UTC), path, run, and
  location / error when there is one. Files: <corpus>/raw/<host>/<sha1(url)><ext>.
Not done here: robots.txt (check it by hand for a new host) and text extraction (PyMuPDF, a later step).
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections import namedtuple
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import httpx

DEFAULT_CORPUS = "D:/vitranslate-corpus"
MAX_PER_HOST = 40
MAX_TOTAL = 175
DELAY = 3.0
HOST_DELAY = {"vjol.info.vn": 5.0, "vjol.vista.gov.vn": 5.0}
DENY = ("tapchiyhocvietnam.vn", "thuvienphapluat.vn", "msdmanuals.com", "icd.kcb.vn")
STOP_STATUS = (403, 429)
STALE_LOCK = 2 * 3600
TIMEOUT = 30.0
MAX_BYTES = 100 * 1024 * 1024
USER_AGENT = "ViTranslate-corpus-fetch/0.1 (term-frequency research; one request at a time)"
TYPE_EXT = {"application/pdf": ".pdf", "text/html": ".html", "text/plain": ".txt", "application/zip": ".zip",
            "application/xml": ".xml", "text/xml": ".xml"}
EXT_RE = re.compile(r"^\.[a-z0-9]{1,5}$")

Result = namedtuple("Result", "url status path")


class Stop(Exception):
    """The run must stop: nothing more is requested under this run name."""


def host_of(url):
    return (urlsplit(url).hostname or "").lower()


def denied(url):
    host = host_of(url)
    return any(host == d or host.endswith("." + d) for d in DENY)


def _ascii(s):
    return str(s).encode("ascii", "replace").decode("ascii")


class Fetcher:
    def __init__(self, corpus, run="default", max_per_host=MAX_PER_HOST, max_total=MAX_TOTAL, delay=DELAY,
                 transport=None, clock=time.time, sleep=time.sleep, log=print):
        self.corpus, self.run_name = Path(corpus), run
        self.max_per_host, self.max_total, self.delay = max_per_host, max_total, delay
        self.transport, self.clock, self.sleep, self.log = transport, clock, sleep, log
        self.corpus.mkdir(parents=True, exist_ok=True)
        self.counter_path, self.manifest_path = self.corpus / "counter.json", self.corpus / "manifest.jsonl"
        self.counter = self._read_counter()
        self.state = self.counter["runs"].setdefault(run, {"total": 0, "hosts": {}, "stopped": None})
        self.saved = self._read_saved()

    # -- persistent state
    def _read_counter(self):
        if self.counter_path.is_file():
            c = json.loads(self.counter_path.read_text(encoding="utf-8"))
        else:
            c = {}
        for k in ("runs", "last", "blocked"):
            c.setdefault(k, {})
        return c

    def _write_counter(self):
        tmp = self.counter_path.with_name("counter.json.tmp")
        tmp.write_text(json.dumps(self.counter, indent=1, sort_keys=True), encoding="utf-8")
        os.replace(tmp, self.counter_path)

    def _read_saved(self):
        saved = {}
        if self.manifest_path.is_file():
            for line in self.manifest_path.read_text(encoding="utf-8").splitlines():
                rec = json.loads(line) if line.strip() else {}
                if rec.get("status") == 200 and rec.get("path"):
                    saved[rec["url"]] = rec["path"]
        return saved

    def _log_request(self, rec):
        with self.manifest_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    def _date(self):
        return datetime.fromtimestamp(self.clock(), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # -- one URL
    def fetch(self, url):
        if self.state.get("stopped"):
            raise Stop("run %s was stopped: %s" % (self.run_name, self.state["stopped"]))
        if url in self.saved and (self.corpus / self.saved[url]).is_file():
            return Result(url, "cached", self.saved[url])
        if denied(url):
            return Result(url, "denied", None)
        host = host_of(url)
        if not host:
            return Result(url, "bad_url", None)
        if host in self.counter["blocked"]:
            return Result(url, "blocked", None)
        if self.state["total"] >= self.max_total or self.state["hosts"].get(host, 0) >= self.max_per_host:
            return Result(url, "capped", None)
        wait = self.counter["last"].get(host, float("-inf")) + max(self.delay, HOST_DELAY.get(host, 0.0)) \
            - self.clock()
        if wait > 0:
            self.sleep(wait)
        self.state["total"] += 1
        self.state["hosts"][host] = self.state["hosts"].get(host, 0) + 1
        rec = {"url": url, "host": host, "run": self.run_name, "date": self._date(), "status": None,
               "sha256": None, "size": None, "path": None}
        trouble = None
        try:
            with httpx.Client(transport=self.transport, timeout=TIMEOUT, follow_redirects=False,
                              headers={"User-Agent": USER_AGENT}) as client, client.stream("GET", url) as resp:
                rec["status"] = resp.status_code
                if resp.status_code in STOP_STATUS:
                    trouble = "HTTP %d" % resp.status_code
                elif 300 <= resp.status_code < 400:
                    rec["location"] = resp.headers.get("location")
                elif resp.status_code == 200:
                    data = self._read(resp)
                    if data is None:
                        rec["error"] = "larger than %d bytes" % MAX_BYTES
                    else:
                        rec.update(self._save(url, host, data, resp.headers.get("content-type", "")))
        except httpx.TransportError as exc:
            rec["error"] = "%s: %s" % (type(exc).__name__, exc)
            trouble = rec["error"]
        finally:
            self.counter["last"][host] = self.clock()
        self._log_request(rec)
        if trouble:
            self.state["stopped"] = "%s on %s" % (trouble, url)
            self.counter["blocked"][host] = {"reason": trouble, "url": url, "date": rec["date"], "run": self.run_name}
        self._write_counter()
        if trouble:
            raise Stop("%s from %s (%s)" % (trouble, host, url))
        return Result(url, "ok" if rec["path"] else "http_%s" % rec["status"], rec["path"])

    @staticmethod
    def _read(resp):
        chunks, total = [], 0
        for chunk in resp.iter_bytes():
            total += len(chunk)
            if total > MAX_BYTES:
                return None
            chunks.append(chunk)
        return b"".join(chunks)

    def _save(self, url, host, data, content_type):
        ext = os.path.splitext(urlsplit(url).path)[1].lower()
        if not EXT_RE.fullmatch(ext):
            ext = TYPE_EXT.get(content_type.split(";")[0].strip().lower(), ".bin")
        rel = "raw/%s/%s%s" % (host, hashlib.sha1(url.encode("utf-8")).hexdigest(), ext)
        dest = self.corpus / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(dest.name + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, dest)
        self.saved[url] = rel
        return {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data), "path": rel}

    # -- a list of URLs, under the lock
    def _lock(self):
        path = self.corpus / ".lock"
        for _ in range(2):
            try:
                fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except FileExistsError:
                try:
                    since = float(path.read_text(encoding="ascii").split()[1])
                except (OSError, ValueError, IndexError):
                    since = float("-inf")
                if self.clock() - since <= STALE_LOCK:
                    return None
                path.unlink(missing_ok=True)  # left by a crashed run
                continue
            with os.fdopen(fd, "w", encoding="ascii") as f:
                f.write("%d %f\n" % (os.getpid(), self.clock()))
            return path
        return None

    def run(self, urls):
        lock = self._lock()
        if lock is None:
            self.log("STOP: another corpus_fetch holds %s (remove it if no fetch is running)" % (self.corpus / ".lock"))
            return 3
        capped = False
        try:
            for url in urls:
                try:
                    res = self.fetch(url)
                except Stop as exc:
                    self.log(_ascii("STOP: %s. Nothing more is requested in run %r; look at the host before a new "
                                    "run (blocked hosts: %s)." % (exc, self.run_name, self.counter_path)))
                    return 3
                capped = capped or res.status == "capped"
                self.log(_ascii("%-8s %s%s" % (res.status, url, " -> " + res.path if res.path else "")))
        finally:
            lock.unlink(missing_ok=True)
        h = self.state["hosts"]
        self.log(_ascii("run %s: %d / %d requests; per host (cap %d): %s" % (
            self.run_name, self.state["total"], self.max_total, self.max_per_host,
            ", ".join("%s %d" % kv for kv in sorted(h.items())) or "-")))
        return 2 if capped else 0


def main(argv=None, transport=None, clock=time.time, sleep=time.sleep):
    ap = argparse.ArgumentParser(description="Counted, paced, cached corpus downloads for pack mining.")
    ap.add_argument("url", nargs="*")
    ap.add_argument("--urls", help="file with one URL per line")
    ap.add_argument("--corpus", default=DEFAULT_CORPUS)
    ap.add_argument("--run", default="default", help="mining wave name; caps count per run")
    ap.add_argument("--max-per-host", type=int, default=MAX_PER_HOST)
    ap.add_argument("--max-total", type=int, default=MAX_TOTAL)
    ap.add_argument("--delay", type=float, default=DELAY, help="seconds between two requests to one host (>= 3)")
    args = ap.parse_args(argv)
    if args.delay < DELAY:
        ap.error("--delay must be at least %g seconds" % DELAY)
    urls = list(args.url)
    if args.urls:
        urls += [line.strip() for line in Path(args.urls).read_text(encoding="utf-8").splitlines()
                 if line.strip() and not line.strip().startswith("#")]
    f = Fetcher(args.corpus, args.run, args.max_per_host, args.max_total, args.delay, transport=transport,
                clock=clock, sleep=sleep)
    return f.run(urls)


if __name__ == "__main__":
    sys.exit(main())
