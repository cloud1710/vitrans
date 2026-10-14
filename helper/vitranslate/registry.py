"""Pack registry: manifest.json + versioned pack zips, from an https URL (production) or a local folder (development).

- The manifest carries every pack's matching profile, so choosing packs needs no download. Over http it is cached
  at <home>/registry/manifest.json (ETag / If-None-Match, at most MAX_MANIFEST_BYTES); when the registry cannot be
  reached the cache is used and `offline` is set (None until the first manifest() call); with no cache either, the
  manifest is empty (translation runs without packs). Invalid entries are dropped, an invalid manifest is never
  cached.
- `ensure(entry)` returns <home>/packs/<id>@<version>/: the cached copy when its .sha256 marker (sha256 + the file
  names of the zip) matches the manifest and every listed file is there, else the zip is fetched, checked against
  the manifest sha256 BEFORE anything is extracted (only the known pack file names, pack.json must name the same id
  and version), unpacked into a temp folder and moved into place in one step. A valid copy installed meanwhile by
  another thread or process is kept (the temp copy is discarded); only a stale or broken copy is deleted. Older
  versions of that pack and stale temp folders are removed. `last_source[id]` says "cache" or "downloaded".
  `forget(entry)` drops the marker of a copy that failed to load.
- Only plain GETs of the manifest and of pack files leave the machine; no document content is ever sent.
"""
import hashlib
import io
import json
import math
import os
import re
import shutil
import threading
import time
import uuid
import zipfile
from pathlib import Path

import httpx

MANIFEST_TIMEOUT = 5.0
PACK_TIMEOUT = 60.0
MAX_MANIFEST_BYTES = 5 * 1024 * 1024
MAX_PACK_BYTES = 50 * 1024 * 1024
MAX_UNPACKED_BYTES = 200 * 1024 * 1024
MAX_ZIP_ENTRIES = 16
TMP_MAX_AGE = 3600  # seconds: a younger .tmp-* folder may belong to an install running right now
MARKER = ".sha256"
PACK_FILES = frozenset({"pack.json", "prompt.md", "glossary.csv", "rules.json", "tests.jsonl", "sources.md"})
ID_RE = re.compile(r"^[a-z0-9_-]+$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@-]*\.zip$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


class PackUnavailable(Exception):
    """A selected pack could not be fetched, verified or unpacked."""


class _TooLarge(ValueError):
    pass


def _empty():
    return {"packs": [], "idf": {}}


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _str(value, pattern=None):
    return isinstance(value, str) and (pattern is None or pattern.fullmatch(value) is not None)


def _valid_entry(e):
    if not isinstance(e, dict):
        return False
    if not (_str(e.get("id"), ID_RE) and _str(e.get("name")) and _str(e.get("version"), VERSION_RE)
            and _str(e.get("file"), FILE_RE) and _str(e.get("sha256"), SHA_RE)):
        return False
    size, profile, detect, parent = e.get("size"), e.get("profile"), e.get("detect", []), e.get("parent")
    if not (isinstance(size, int) and not isinstance(size, bool) and size >= 0):
        return False
    if not isinstance(profile, dict) or not all(isinstance(t, str) and _finite(w) for t, w in profile.items()):
        return False
    if not isinstance(detect, list) or not all(isinstance(t, str) for t in detect):
        return False
    return parent is None or _str(parent, ID_RE)


def _parse(data):
    """The manifest with invalid pack entries (and duplicate ids) and invalid idf values dropped; ValueError when the
    document itself is not a manifest."""
    m = json.loads(data.decode("utf-8"))
    if not isinstance(m, dict) or not isinstance(m.get("packs"), list):
        raise ValueError("not a pack manifest")
    packs, seen = [], set()
    for e in m["packs"]:
        if _valid_entry(e) and e["id"] not in seen:
            seen.add(e["id"])
            packs.append(e)
    idf = m.get("idf") if isinstance(m.get("idf"), dict) else {}
    return dict(m, packs=packs, idf={t: w for t, w in idf.items() if _finite(w)})


def _read_manifest(path):
    try:
        return _parse(Path(path).read_bytes())
    except (OSError, ValueError):
        return None


def _read_capped(resp, cap):
    chunks, total = [], 0
    for chunk in resp.iter_bytes():
        total += len(chunk)
        if total > cap:
            raise _TooLarge("larger than %d bytes" % cap)
        chunks.append(chunk)
    return b"".join(chunks)


def _extract(data, target):
    """Unpack a pack zip (only the known pack file names, each once) into target, which must not exist yet."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos = z.infolist()
        names = [i.filename for i in infos]
        if len(infos) > MAX_ZIP_ENTRIES or len(set(names)) != len(names) or not set(names) <= PACK_FILES:
            raise ValueError("unexpected zip entries %r" % names[:MAX_ZIP_ENTRIES])
        if sum(i.file_size for i in infos) > MAX_UNPACKED_BYTES:
            raise ValueError("pack too large when unpacked")
        target.mkdir()
        for info in infos:
            (target / info.filename).write_bytes(z.read(info))
    return names


_LOCKS = {}
_LOCKS_GUARD = threading.Lock()


def _install_lock(dest):
    """One lock per install folder: threads of this process install a pack one at a time (re-entrant: an install
    reached again from the same thread must not deadlock)."""
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(str(dest), threading.RLock())


def _vtuple(version):
    return tuple(int(x) for x in version.split("."))


class Registry:
    def __init__(self, source, home, transport=None):
        self.source = None if source is None else str(source)  # None: no registry configured (offline, no I/O)
        self.home = Path(home)
        self.is_http = bool(self.source) and self.source.startswith(("http://", "https://"))
        self.transport = transport
        self.offline = None  # unknown until manifest() runs
        self.last_source = {}

    def _url(self, name):
        return self.source.rstrip("/") + "/" + name

    def _client(self, timeout):
        return httpx.Client(timeout=timeout, transport=self.transport, follow_redirects=True)

    def manifest(self):
        if self.source is None:
            self.offline = True
            return _empty()
        if not self.is_http:
            m = _read_manifest(Path(self.source) / "manifest.json")
            self.offline = m is None
            return m or _empty()
        cache_dir = self.home / "registry"
        cache, etag_file = cache_dir / "manifest.json", cache_dir / "manifest.etag"
        cached = _read_manifest(cache)
        headers = {}
        if cached is not None and etag_file.is_file():
            headers["If-None-Match"] = etag_file.read_text(encoding="ascii", errors="replace").strip()
        try:
            with self._client(MANIFEST_TIMEOUT) as client, \
                    client.stream("GET", self._url("manifest.json"), headers=headers) as resp:
                if resp.status_code == 304 and cached is not None:
                    self.offline = False
                    return cached
                resp.raise_for_status()
                body = _read_capped(resp, MAX_MANIFEST_BYTES)
                etag = resp.headers.get("etag")
            m = _parse(body)
        except (httpx.HTTPError, ValueError):
            self.offline = True
            return cached or _empty()
        self.offline = False
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
            tmp = cache_dir / ("manifest.%s.tmp" % uuid.uuid4().hex)
            tmp.write_bytes(body)
            os.replace(tmp, cache)
            if etag and etag.isascii():
                etag_file.write_text(etag, encoding="ascii")
            else:
                etag_file.unlink(missing_ok=True)
        except OSError:
            pass  # a cache that cannot be written only costs a download next time
        return m

    def _fetch(self, fname):
        if self.source is None:
            raise PackUnavailable("pack file %s: no pack registry is configured" % fname)
        if not self.is_http:
            try:
                data = (Path(self.source) / fname).read_bytes()
            except OSError as exc:
                raise PackUnavailable("pack file %s not found in the registry (%s)" % (fname, type(exc).__name__))
            return data
        try:
            with self._client(PACK_TIMEOUT) as client, client.stream("GET", self._url(fname)) as resp:
                resp.raise_for_status()
                return _read_capped(resp, MAX_PACK_BYTES)
        except _TooLarge:
            raise PackUnavailable("pack file %s is larger than %d bytes" % (fname, MAX_PACK_BYTES))
        except httpx.HTTPError as exc:
            raise PackUnavailable("pack file %s could not be downloaded (%s)" % (fname, type(exc).__name__))

    def _dest(self, entry):
        pid, version, fname, sha = (entry.get(k) for k in ("id", "version", "file", "sha256"))
        if not (_str(pid, ID_RE) and _str(version, VERSION_RE) and _str(fname, FILE_RE) and _str(sha, SHA_RE)):
            raise PackUnavailable("pack %r: unsafe or incomplete manifest entry" % (pid,))
        return self.home / "packs" / ("%s@%s" % (pid, version))

    @staticmethod
    def _ready(dest, sha):
        """A valid installed copy: the marker names this sha256 and the files of the zip, and all of them exist."""
        try:
            parts = (dest / MARKER).read_text(encoding="ascii").split()
        except (OSError, ValueError):
            return False
        names = parts[1:]
        return (bool(parts) and parts[0] == sha and "pack.json" in names and set(names) <= PACK_FILES
                and all((dest / n).is_file() for n in names))

    def ensure(self, entry):
        dest = self._dest(entry)
        pid, version, sha = entry["id"], entry["version"], entry["sha256"]
        if self._ready(dest, sha):
            self.last_source[pid] = "cache"
            return dest
        data = self._fetch(entry["file"])
        if hashlib.sha256(data).hexdigest() != sha:
            raise PackUnavailable("pack %s: sha256 mismatch, the download was refused" % pid)
        packs = dest.parent
        packs.mkdir(parents=True, exist_ok=True)
        self._clean_tmp(packs)
        tmp = packs / (".tmp-%s" % uuid.uuid4().hex)
        try:
            names = _extract(data, tmp)
            meta = json.loads((tmp / "pack.json").read_text(encoding="utf-8"))
            if not isinstance(meta, dict) or meta.get("id") != pid or meta.get("version") != version:
                raise PackUnavailable("pack %s: pack.json does not name %s@%s" % (pid, pid, version))
            (tmp / MARKER).write_text("\n".join([sha] + sorted(names)) + "\n", encoding="ascii")
            with _install_lock(dest):
                # installed meanwhile by another thread or process? keep it: a valid copy is never deleted
                if not self._ready(dest, sha):
                    if dest.exists():
                        shutil.rmtree(dest)  # a stale or broken copy
                    try:
                        os.replace(tmp, dest)
                    except OSError:
                        if not self._ready(dest, sha):  # not installed by another process either: a real failure
                            raise
        except PackUnavailable:
            raise
        except (zipfile.BadZipFile, OSError, ValueError) as exc:
            raise PackUnavailable("pack %s could not be unpacked (%s)" % (pid, type(exc).__name__))
        finally:
            if tmp.exists():
                shutil.rmtree(tmp, ignore_errors=True)
        self._prune(packs, pid, version)
        self.last_source[pid] = "downloaded"
        return dest

    def forget(self, entry):
        """Drop the marker of an unpacked copy (e.g. one that failed to load): the next ensure() downloads again."""
        try:
            (self._dest(entry) / MARKER).unlink(missing_ok=True)
        except (PackUnavailable, OSError):
            pass

    @staticmethod
    def _clean_tmp(packs):
        now = time.time()
        for p in packs.iterdir():
            try:
                if p.name.startswith(".tmp-") and p.is_dir() and now - p.stat().st_mtime > TMP_MAX_AGE:
                    shutil.rmtree(p, ignore_errors=True)
            except OSError:
                pass

    @staticmethod
    def _prune(packs, pid, version):
        """Remove the older versions of pack pid (newer ones stay: the registry may have rolled back)."""
        current = _vtuple(version)
        for p in packs.iterdir():
            name = p.name
            if p.is_dir() and name.startswith(pid + "@"):
                v = name[len(pid) + 1:]
                if VERSION_RE.fullmatch(v) and _vtuple(v) < current:
                    shutil.rmtree(p, ignore_errors=True)

    def installed(self):
        d = self.home / "packs"
        if not d.is_dir():
            return []
        return sorted(p.name for p in d.iterdir()
                      if p.is_dir() and "@" in p.name and not p.name.startswith(".") and (p / MARKER).is_file())
