"""Sentence-level routes of the helper (127.0.0.1 only), shaped like the cloud API (functions/_lib/api.js) so that every
tool of the page changes only its base URL in the "Tren may" mode:

  POST /api/v1/classify  {text, domain?: [pack ids], profile?: file | photo}
       -> the classify event (stage, offline, unavailable, packs (each with its version), candidates)
          + {setup: {packs: [{id, version}], hits: [glossary English keys]}, setup_id}
  POST /api/v1/translate {job_id, setup, setup_id?, profile?: file | photo | live, segments: [{id, tagged,
       essential?, prev?, nxt?, where?}] (<= 20)}
       -> {results: [{id, text, level, flags, fixes, cached, reduced, spans}]}

The cloud's request and response JSON without the session and quota fields (nothing to count on the user's own
machine; a request that carries a session is refused, so the page never sends its cloud token here). Same checks and
error codes as the cloud ({code, message}: 400 bad_request, 409 packs_changed, 413 too_large, 502 model_error) plus
503 ollama_unavailable / model_missing. The helper's own core runs it: pipeline.choose_packs / load_packs /
glossary_hits and translate.Translator, as run_job calls them, with the local model of this device
(config.default_model) and no translation memory (nothing of the text is kept, as on the cloud). Profile "live" runs
the same Translator (no term repair here). One request translates at a time (one local model).
"""
import hashlib
import json
import re
import threading
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import config
from .llm import LLMError
from .matching import count_terms, select_packs
from .ooxml.codec import Segment, Span
from .packs import allowed_words, glossary_hits, load_pack
from .pipeline import RETRY_DELAY, choose_packs, load_packs, top_candidates
from .translate import Translator, build_system

MAX_SEGMENTS = 20
MAX_SEGMENT_CHARS = 10000
MAX_WHERE = 300
MAX_ESSENTIAL = 1000
MAX_DOMAIN = 6
MAX_PACKS = 6
MAX_HITS = 80
MAX_PHOTO_PACKS = 3
PROFILES = ("file", "photo", "live")
JOB_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
PACK_ID_RE = re.compile(r"^[a-z0-9_-]+$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
ESSENTIAL = object()  # Span.container of an essential span sent by the page: translate.is_essential keeps it


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def bad(message):
    return ApiError(400, "bad_request", message)


def setup_id_of(setup):
    """sha256 of the wire setup, as functions/_lib/engine.js setupIdOf (JSON.stringify of packs as [id, version])."""
    canon = json.dumps({"packs": [[p["id"], p["version"]] for p in setup["packs"]], "hits": setup["hits"]},
                       separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def wire_segment(tagged, essential):
    """A codec Segment from the page's plain data: its tagged text and the ids of its essential spans (the same spans,
    reduction and plain text as the OOXML codec's, as web/engine/translate.js TaggedSegment)."""
    keep = set(essential)
    spans = {}
    for m in re.finditer(r"<g(\d+)>", tagged):
        n = int(m.group(1))
        if n not in spans:
            spans[n] = Span(None, ESSENTIAL if n in keep else None, "")
    return Segment("wire", tagged, Span(None, None, ""), spans)


def _is_obj(v):
    return isinstance(v, dict)


def _only(obj, allowed):
    if not all(k in allowed for k in obj):
        raise bad("The request has a field it may not have.")


def _text(v):
    return isinstance(v, str)


def _int_id(v):
    return isinstance(v, int) and not isinstance(v, bool) and abs(v) <= 2 ** 53 - 1


def check_segments(lst):
    if not isinstance(lst, list) or not 1 <= len(lst) <= MAX_SEGMENTS:
        raise bad("segments must hold 1 to %d segments." % MAX_SEGMENTS)
    ids, out = set(), []
    for s in lst:
        if not _is_obj(s):
            raise bad("Each segment must be an object.")
        _only(s, ("id", "tagged", "essential", "prev", "nxt", "where"))
        sid = s.get("id")
        if not ((_text(sid) and 1 <= len(sid) <= 64) or _int_id(sid)) or str(sid) in ids:
            raise bad("Each segment needs its own id (text or an integer).")
        ids.add(str(sid))
        if not _text(s.get("tagged")):
            raise bad("A segment's tagged text is missing.")
        for k in ("prev", "nxt", "where"):
            if k in s and not _text(s[k]):
                raise bad("A segment's %s must be text." % k)
        if len(s.get("where", "")) > MAX_WHERE:
            raise bad("A segment's where label is too long.")
        if any(len(t) > MAX_SEGMENT_CHARS for t in (s["tagged"], s.get("prev", ""), s.get("nxt", ""))):
            raise ApiError(413, "too_large", "A segment or its context is longer than %d characters."
                           % MAX_SEGMENT_CHARS)
        ess = s.get("essential", [])
        if not isinstance(ess, list) or len(ess) > MAX_ESSENTIAL or \
                not all(isinstance(n, int) and not isinstance(n, bool) and 0 <= n <= 10 ** 6 for n in ess):
            raise bad("A segment's essential list must hold span numbers.")
        out.append({"id": sid, "tagged": s["tagged"], "essential": ess, "prev": s.get("prev", ""),
                     "nxt": s.get("nxt", ""), "where": s.get("where", "")})
    return out


def photo_packs(text, manifest):
    """functions/_lib/engine.js photoPacks: the packs whose detect keywords or id words occur in a photo's short text,
    most occurrences first, at most MAX_PHOTO_PACKS; a pack whose child is among them comes as the child's parent."""
    entries = (manifest or {}).get("packs") or []
    found = []
    for e in entries:
        counts = count_terms(text, list(e.get("detect") or []) + [" ".join(str(e.get("id")).split("-"))])
        n = sum(counts.values())
        if n:
            found.append((e, n))
    by_id = {e.get("id"): e for e in entries}

    def ancestor_of_found(pid):
        for e, _ in found:
            p, k = e.get("parent"), 0
            while p and k < 16:
                if p == pid:
                    return True
                p, k = (by_id[p].get("parent") if p in by_id else None), k + 1
        return False

    kept = [(e, n) for e, n in found if not ancestor_of_found(e.get("id"))]
    kept.sort(key=lambda en: (-en[1], en[0].get("id")))
    return [e.get("id") for e, _ in kept[:MAX_PHOTO_PACKS]]


def router(registry, probe, models, llm_factory):
    """registry: the helper's pack registry; probe() -> Device; models() -> Ollama's model names or None (not
    running); llm_factory(device, model) -> an object with chat(system, user)."""
    r = APIRouter(prefix="/api/v1")
    lock = threading.Lock()  # one local model: one request translates at a time
    bases = {}  # pack list key -> (style, merged pack, rows {en: vi}, scope)
    style_box = {}

    def style():
        if "style" not in style_box:
            style_box["style"] = load_pack(config.style_dir())
        return style_box["style"]

    def entry_of(manifest, pid):
        return next((e for e in manifest.get("packs") or [] if e.get("id") == pid), None)

    def base_for(packs):
        key = "+".join("%s@%s" % (p["id"], p["version"]) for p in packs)
        if key not in bases:
            manifest = registry.manifest()
            matches = []
            for p in packs:
                e = entry_of(manifest, p["id"])
                if e is None or e.get("version") != p["version"]:
                    raise ApiError(409, "packs_changed", "The glossary packs changed; start the translation again.")
                matches.append(_Match(e))
            pack, _rows, missing, pack_key = load_packs(matches, registry)
            if missing:
                raise ApiError(503, "packs_unavailable", "A glossary pack could not be loaded.")
            rows = {}
            for en, vi, _ in pack.glossary:
                if en.lower() not in {k.lower() for k in rows}:
                    rows[en] = vi
            st = style()
            bases[key] = (st, pack, rows, pack_key + "+" + st.key() + "+" + config.VERSION)
        return bases[key]

    def check_setup(setup, sid):
        if not _is_obj(setup) or set(setup) != {"packs", "hits"}:
            raise bad("setup must be {packs, hits} as /api/v1/classify returned it.")
        packs = setup["packs"]
        if not isinstance(packs, list) or len(packs) > MAX_PACKS:
            raise bad("setup.packs must be a list of at most %d {id, version}." % MAX_PACKS)
        seen = set()
        for p in packs:
            if not _is_obj(p) or set(p) != {"id", "version"} or not _text(p["id"]) or not PACK_ID_RE.match(p["id"]) \
                    or not _text(p["version"]) or not VERSION_RE.match(p["version"]) or p["id"] in seen:
                raise bad("setup.packs must hold distinct {id, version} entries.")
            seen.add(p["id"])
        hits = setup["hits"]
        if not isinstance(hits, list) or len(hits) > MAX_HITS or not all(_text(h) and h for h in hits):
            raise bad("setup.hits must be a list of at most %d glossary terms." % MAX_HITS)
        if len({h.lower() for h in hits}) != len(hits):
            raise bad("setup.hits lists a term twice.")
        clean = {"packs": [{"id": p["id"], "version": p["version"]} for p in packs], "hits": list(hits)}
        if sid is not None and (not _text(sid) or sid != setup_id_of(clean)):
            raise bad("setup_id does not match the setup.")
        base = base_for(clean["packs"])
        if not all(h in base[2] for h in hits):
            raise bad("setup.hits has a term that is not in the packs' glossary.")
        return clean, base

    async def body_of(request):
        try:
            body = await request.json()
        except ValueError:
            raise bad("The body must be JSON.")
        if not _is_obj(body):
            raise bad("The body must be a JSON object.")
        return body

    def answer(fn):
        async def handler(request: Request):
            try:
                return JSONResponse(await run_in_threadpool(fn, await body_of(request)))
            except ApiError as e:
                return JSONResponse({"code": e.code, "message": e.message}, status_code=e.status)
        return handler

    def classify(body):
        _only(body, ("text", "domain", "profile"))
        if not _text(body.get("text")):
            raise bad("text must be the document's text.")
        profile = body.get("profile", "file")
        if profile not in ("file", "photo"):
            raise bad("profile must be file or photo.")
        domain = body.get("domain", [])
        if not isinstance(domain, list) or len(domain) > MAX_DOMAIN or \
                not all(_text(d) and PACK_ID_RE.match(d) for d in domain):
            raise bad("domain must be a list of at most %d pack ids." % MAX_DOMAIN)
        text = body["text"]
        manifest = registry.manifest()
        detected = []
        if profile == "photo" and not domain and not select_packs(text, manifest):
            detected = photo_packs(text, manifest)
            domain = detected
        matches, unknown = choose_packs(text, ",".join(domain), manifest)
        pack, rows, missing, _ = load_packs(matches, registry)
        unavailable_names = unknown + [e.get("name") or e["id"] for e in missing]
        hits = glossary_hits(text, pack.glossary)

        def reason(r):
            return "detect" if r["reason"] == "user" and r["id"] in detected else r["reason"]
        event = {"stage": "classify", "offline": registry.offline, "unavailable": unavailable_names,
                 "packs": [dict({k: r[k] for k in ("id", "name", "score", "matched")}, reason=reason(r),
                                version=r["version"]) for r in rows],
                 "candidates": top_candidates(text, manifest, {m.entry.get("id") for m in matches})}
        setup = {"packs": [{"id": r["id"], "version": r["version"]} for r in rows], "hits": [en for en, _ in hits]}
        return dict(event, setup=setup, setup_id=setup_id_of(setup))

    def translate(body):
        _only(body, ("job_id", "setup", "setup_id", "segments", "profile"))
        if not _text(body.get("job_id")) or not JOB_RE.match(body["job_id"]):
            raise bad("job_id must be 1 to 64 letters, digits, - or _.")
        if "setup" not in body:
            raise bad("setup is required (as /api/v1/classify returned it).")
        if body.get("profile", "file") not in PROFILES:
            raise bad("profile must be one of %s." % ", ".join(PROFILES))
        segments = check_segments(body.get("segments"))
        setup, (st, pack, rows, scope) = check_setup(body["setup"], body.get("setup_id"))
        names = models()
        if names is None:
            raise ApiError(503, "ollama_unavailable", "Ollama is not running on this machine.")
        dev = probe()
        model = config.default_model(dev.kind)
        if model not in names:
            raise ApiError(503, "model_missing", "The model %s is not installed." % model)
        hits = [(en, rows[en]) for en in setup["hits"]]
        system = build_system(st.prompt, pack, hits)
        with lock:
            llm = llm_factory(dev, model)
            try:
                translator = Translator(llm, system, model, scope, pack.term_fixes, hits, None,
                                        allowed=allowed_words(pack))
                results = [one(translator, s) for s in segments]
            finally:
                if hasattr(llm, "close"):
                    llm.close()
        return {"results": results}

    def one(translator, s):
        seg = wire_segment(s["tagged"], s["essential"])
        for attempt in (0, 1):
            try:
                out = translator.translate(seg, s["prev"], s["nxt"])
                break
            except LLMError:
                if attempt:
                    raise ApiError(502, "model_error", "The local model did not answer; try again shortly.")
                _sleep(RETRY_DELAY)
        return {"id": s["id"], "text": out.text, "level": out.level, "flags": list(out.flags),
                "fixes": list(out.fixes), "cached": bool(out.cached), "reduced": out.segment is not seg,
                "spans": list(out.segment.spans)}

    r.add_api_route("/classify", answer(classify), methods=["POST"])
    r.add_api_route("/translate", answer(translate), methods=["POST"])
    return r


def _sleep(seconds):
    threading.Event().wait(seconds)


class _Match:
    """A chosen pack for pipeline.load_packs (matching.Match fields it reads), reason "user"."""

    def __init__(self, entry):
        self.entry, self.score, self.matched, self.reason = entry, 0.0, [], "user"

