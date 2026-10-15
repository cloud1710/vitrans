"""/api/live/* routes of the helper (127.0.0.1 only): the caption source for the /live/ page.

  GET  /api/live/status                     reader state (sources.LiveReader.status)
  POST /api/live/start {source: auto|windows|chrome, hide: bool}   (no body: auto; hide, default true: Windows Live
                                            Captions started if needed and kept hidden, sources.py)
  POST /api/live/stop
  GET  /api/live/stream                     SSE: on connect "retry", one status event and the current caption (if
                                            any); then caption events (unnamed, "id: <seq>", data {t, source, text,
                                            seq}) only on change, "event: status" on state changes, ": keep-alive"
                                            comments while idle; ends when the client disconnects.
POSTs pass the Origin guard of server.py; the GETs refuse foreign origins here too (CORS and Chrome's Local Network
Access headers come from server.py's CORSMiddleware)."""
import asyncio
import json
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse

from .sources import SOURCES

KEEPALIVE_SECONDS = 15.0


def _sse(payload, event=None, eid=None):
    head = ("event: %s\n" % event if event else "") + ("id: %d\n" % eid if eid is not None else "")
    return head + "data: %s\n\n" % json.dumps(payload, ensure_ascii=False)


def router(reader, origins, keepalive=KEEPALIVE_SECONDS):
    r = APIRouter(prefix="/api/live")

    def check_origin(request):
        origin = request.headers.get("origin")
        if origin is not None and origin not in origins:
            raise HTTPException(403, "forbidden_origin")

    @r.get("/status")
    def status(request: Request):
        check_origin(request)
        return reader.status()

    @r.post("/start")
    def start(payload: Any = Body(None)):
        payload = {} if payload is None else payload
        if not isinstance(payload, dict) or payload.get("source", "auto") not in SOURCES:
            raise HTTPException(400, "bad_source")
        if not isinstance(payload.get("hide", True), bool):
            raise HTTPException(400, "bad_hide")
        return reader.start(payload.get("source", "auto"), hide=payload.get("hide", True))

    @r.post("/stop")
    def stop():
        return reader.stop()

    @r.get("/stream")
    async def stream(request: Request):
        check_origin(request)
        loop = asyncio.get_running_loop()

        async def events():
            queue = asyncio.Queue()
            token = reader.subscribe(lambda kind, payload: loop.call_soon_threadsafe(queue.put_nowait,
                                                                                      (kind, payload)))
            try:
                yield "retry: 2000\n\n"
                yield _sse(reader.status(), "status")
                last = 0
                cur = reader.current()
                if cur:
                    last = cur["seq"]
                    yield _sse(cur, eid=cur["seq"])
                while True:
                    try:
                        kind, payload = await asyncio.wait_for(queue.get(), keepalive)
                    except asyncio.TimeoutError:
                        yield ": keep-alive\n\n"
                        continue
                    if kind == "caption":
                        if payload["seq"] <= last:  # already sent as the current caption
                            continue
                        last = payload["seq"]
                        yield _sse(payload, eid=payload["seq"])
                    else:
                        yield _sse(payload, "status")
            finally:
                reader.unsubscribe(token)

        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return r
