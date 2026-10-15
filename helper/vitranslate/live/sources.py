"""Caption reader: one background thread polls the chosen caption source through a UIA backend (uia.py) and tells
subscribers when the text changes.

Sources: "windows" (Windows Live Captions), "chrome" (Chrome's Live Caption bubble), "auto" (Windows first, Chrome
when Windows Live Captions is not there; one source at a time, never both). The caption element is cached and only
searched again after it is lost, at most every `refind` seconds. Events to subscribers, fn(kind, payload):
  "caption"  {t, source, text, seq}  text = the whole caption text now, whitespace normalised; only on change
  "status"   {state, source, active, code, message, seq}  on every state change
States: stopped, starting, waiting (no caption window: code not_running), listening (code docked: see below), error
(code uia_changed, uia_unavailable, unsupported). Caption text is never logged and never stored beyond the last text.

start(source, hide=True) with source windows / auto and a window layer (window_factory -> window.CaptionWindow; the
helper's server passes one, tests a fake): Live Captions is started once when its window is not there, and its
window is hidden once found in its normal state (caption element or "Ready to caption"; never on Changed, which may
be its first-run screen), a recreated window too; docked Live Captions -> listening with code docked. stop() and
close() put it back (or close the Live Captions the helper started). A session no stream listens to for
ORPHAN_SECONDS (the page closed without a stop) stops itself."""
import logging
import sys
import threading
import time

from . import uia

log = logging.getLogger("vitranslate.live")

SOURCES = ("auto", "windows", "chrome")
POLL_SECONDS = 0.2
REFIND_SECONDS = 2.0

NOT_RUNNING = {
    "windows": "Windows Live Captions is not running. Press Win + Ctrl + L to turn it on.",
    "chrome": "Chrome Live Caption is not showing. Turn it on in Chrome (Settings > Accessibility > Live Caption); "
              "the caption box appears while audio plays.",
    "auto": "No live captions found. Press Win + Ctrl + L to turn on Windows Live Captions "
            "(or turn on Live Caption in Chrome).",
}
UIA_CHANGED = ("Live Captions is open but its caption text was not found: this Windows version changed its layout. "
               "Try Live Caption in Chrome.")
DOCKED = ("Live Captions is docked to the screen edge: set Position > Floating in its settings to hide it "
          "completely.")
ORPHAN_SECONDS = 30.0
MACOS = "Live captions are not supported on macOS yet."


def normalise(text):
    return " ".join((text or "").split())


def _default_backend():
    return uia.ComBackend()


class LiveReader:
    def __init__(self, backend_factory=_default_backend, interval=POLL_SECONDS, refind=REFIND_SECONDS,
                 platform=None, clock=time.monotonic, wall=time.time, threaded=True, window_factory=None):
        """threaded=False: no thread, the caller runs step() (tests). window_factory: the Live Captions window layer
        (made with the backend; None: windows are never hidden or started)."""
        self.interval, self.refind, self._threaded = interval, refind, threaded
        self._factory, self._platform = backend_factory, platform or sys.platform
        self._window_factory, self._window = window_factory, None
        self._hide, self._launch, self._orphan_since = False, False, None
        self._clock, self._wall = clock, wall
        self._lock = threading.RLock()  # held for a whole step: start / stop wait for a running read (<= ~1 s)
        self._wake = threading.Event()
        self._subs, self._next_sub = {}, 0
        self._thread, self._closing = None, False
        self._backend = None
        self._running, self._source = False, "auto"
        self._handle, self._active, self._last_find = None, None, None
        self._text, self._seq, self._caption = None, 0, None
        self._state = {"state": "stopped", "code": None, "message": None}

    # --- control (any thread) ---

    def start(self, source="auto", hide=True):
        if source not in SOURCES:
            raise ValueError(source)
        with self._lock:
            self._running, self._source = True, source
            self._handle, self._active, self._last_find = None, None, None
            self._text = None  # the first read after a start is always sent
            self._hide = self._launch = bool(hide) and source != "chrome"
            self._orphan_since = None
            if not self._hide:  # a window hidden by an earlier session shows again (Live Captions stays open)
                self._restore(close=False)
            self._set_state("starting")
        self._ensure_thread()
        self._wake.set()
        return self.status()

    def stop(self):
        with self._lock:
            self._running = False
            self._handle, self._active = None, None  # the cached element is released
            self._text, self._caption = None, None  # no caption text is kept after a stop
            self._hide = self._launch = False
            self._restore(close=True)
            self._set_state("stopped")
        self._wake.set()
        return self.status()

    def close(self):
        """Stop and end the thread (helper shutdown, tests)."""
        self.stop()
        self._closing = True
        self._wake.set()
        t = self._thread
        if t is not None:
            t.join(5)

    def thread_alive(self):
        return self._thread is not None and self._thread.is_alive()

    def status(self):
        with self._lock:
            return dict(self._state, source=self._source, active=self._active, seq=self._seq,
                        interval_ms=int(self.interval * 1000))

    def current(self):
        """The last caption event (None before the first one)."""
        with self._lock:
            return dict(self._caption) if self._caption else None

    def subscribe(self, fn):
        with self._lock:
            self._next_sub += 1
            self._subs[self._next_sub] = fn
            return self._next_sub

    def unsubscribe(self, token):
        with self._lock:
            self._subs.pop(token, None)

    def subscribers(self):
        with self._lock:
            return len(self._subs)

    # --- polling ---

    def _ensure_thread(self):
        with self._lock:
            if self._threaded and (self._thread is None or not self._thread.is_alive()):
                self._closing = False
                self._thread = threading.Thread(target=self._run, name="live-captions", daemon=True)
                self._thread.start()

    def _run(self):
        try:
            while not self._closing:
                if self._running:
                    self.step()
                    self._wake.wait(self.interval)
                else:
                    self._wake.wait()
                self._wake.clear()
        finally:
            backend, self._backend = self._backend, None
            self._handle = None
            if backend is not None and hasattr(backend, "close"):
                try:
                    backend.close()
                except Exception:
                    pass

    def step(self):
        """One poll: read the cached element, or search for a source when none is cached."""
        with self._lock:
            if not self._running or (self._state["state"] == "error" and self._state["code"] in (
                    "unsupported", "uia_unavailable")):
                return
            if self._orphaned() or not self._ensure_backend():
                return
            if self._launch:  # once per start: Live Captions is started when its window is not there
                self._launch = False
                if self._window is not None and self._try(self._window.launch):
                    self._last_find = self._clock()  # the new window gets a moment before the first search
            if self._handle is None and not self._search():
                return
            try:
                text = normalise(self._backend.read(self._handle))
            except uia.Gone:
                log.info("live: %s caption window lost", self._active)
                self._handle, self._active, self._last_find = None, None, None
                self._waiting()
                return
            if self._hide and self._active == "windows" and self._window is not None:
                self._try(self._window.keep, self._handle.hwnd)  # Live Captions may put its opacity back
            if self._state["state"] != "listening":
                self._set_state("listening")
            if text != self._text:
                self._text = text
                self._seq += 1
                self._caption = {"t": int(self._wall() * 1000), "source": self._active, "text": text,
                                 "seq": self._seq}
                self._publish("caption", dict(self._caption))

    def _ensure_backend(self):
        if self._backend is not None:
            return True
        if self._platform == "darwin":
            self._set_state("error", "unsupported", MACOS)
            return False
        if self._platform != "win32":
            self._set_state("error", "unsupported", "Live captions need Windows 11 (or Chrome on Windows).")
            return False
        try:
            self._backend = self._factory()
        except uia.Unavailable as exc:
            log.warning("live: UI Automation unavailable: %s", exc)
            self._set_state("error", "uia_unavailable", "UI Automation is not available: %s" % exc)
            return False
        if self._window_factory is not None and self._window is None:
            try:
                self._window = self._window_factory()
            except Exception as exc:  # captions are still read, the window just stays as it is
                log.warning("live: no window layer: %s", exc)
        return True

    def _orphaned(self):
        """True (and stopped) when no stream has listened for ORPHAN_SECONDS: the page went away without a stop."""
        if self._subs:
            self._orphan_since = None
            return False
        now = self._clock()
        if self._orphan_since is None:
            self._orphan_since = now
        elif now - self._orphan_since >= ORPHAN_SECONDS:
            log.info("live: nobody listens: stopping")
            self.stop()
            return True
        return False

    def _try(self, fn, *args):
        """A window call; a failure is logged and never stops the captions."""
        try:
            return fn(*args)
        except Exception as exc:
            log.warning("live: window %s failed: %s", fn.__name__, exc)
            return None

    def _restore(self, close):
        if self._window is not None:
            self._try(self._window.restore, close)

    def _search(self):
        now = self._clock()
        if self._last_find is not None and now - self._last_find < self.refind:
            return False
        self._last_find = now
        kinds = ("windows", "chrome") if self._source == "auto" else (self._source,)
        changed = False
        for kind in kinds:
            try:
                handle = self._backend.find(kind)
            except uia.Changed:
                changed = True
                continue
            if handle is not None:
                self._handle, self._active = handle, kind
                log.info("live: reading %s captions", kind)
                if kind == "windows" and self._hide and self._window is not None:  # found = its normal state
                    if self._try(self._window.hide, handle.hwnd):
                        self._set_state("listening", "docked", DOCKED)
                return True
        if changed and self._source != "chrome":
            self._set_state("error", "uia_changed", UIA_CHANGED)
        else:
            self._waiting()
        return False

    def _waiting(self):
        self._set_state("waiting", "not_running", NOT_RUNNING[self._source])

    def _set_state(self, state, code=None, message=None):
        new = {"state": state, "code": code, "message": message}
        if new == self._state:
            return
        self._state = new
        log.info("live: state %s%s", state, " (%s)" % code if code else "")
        self._publish("status", dict(new, source=self._source, active=self._active, seq=self._seq))

    def _publish(self, kind, payload):
        for fn in list(self._subs.values()):
            try:
                fn(kind, payload)
            except Exception:  # a closed SSE loop must not stop the reader
                pass
