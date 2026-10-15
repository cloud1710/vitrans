"""Live caption source (helper/vitranslate/live): the reader with a scripted fake UI Automation backend, the
/api/live/* endpoints (TestClient) and the SSE stream (a real uvicorn server, since TestClient buffers a whole body)."""
import json
import logging
import socket
import sys
import threading
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from vitranslate.device import Device
from vitranslate.jobs import JobManager
from vitranslate.live import sources, uia
from vitranslate.registry import Registry
from vitranslate.server import create_app

PAGE = "https://vitrans.pages.dev"


# --- fake UI Automation backend -------------------------------------------------------------------------------------

class FakeHandle:
    def __init__(self, kind, gen):
        self.kind, self.gen = kind, gen


class FakeBackend:
    """Scripted caption windows: text[kind] is the caption text, None when that window is not there. Closing and
    reopening a window makes a new element (gen), so a cached handle of the old window raises Gone."""

    def __init__(self, windows=None, chrome=None):
        self.text = {"windows": windows, "chrome": chrome}
        self.gen = {"windows": 0, "chrome": 0}
        self.changed = set()  # kinds whose window is there but has no caption element
        self.finds = {"windows": 0, "chrome": 0}
        self.reads = {"windows": 0, "chrome": 0}

    def set(self, kind, text):
        if (self.text[kind] is None) != (text is None):
            self.gen[kind] += 1  # the window closed or opened: any old element is gone
        self.text[kind] = text

    def find(self, kind):
        self.finds[kind] += 1
        if kind in self.changed:
            raise uia.Changed(kind)
        if self.text[kind] is None:
            return None
        return FakeHandle(kind, self.gen[kind])

    def read(self, handle):
        self.reads[handle.kind] += 1
        if self.text[handle.kind] is None or self.gen[handle.kind] != handle.gen:
            raise uia.Gone(handle.kind)
        return self.text[handle.kind]


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def reader_with(backend, **kw):
    clock = Clock()
    r = sources.LiveReader(backend_factory=lambda: backend, clock=clock, wall=lambda: 1760000000.123,
                           platform="win32", threaded=False, **kw)
    events = []
    r.subscribe(lambda kind, payload: events.append((kind, payload)))
    return r, clock, events


def captions(events):
    return [p for k, p in events if k == "caption"]


def statuses(events):
    return [p for k, p in events if k == "status"]


# --- reader: change detection, caching, sources -----------------------------------------------------------------

def test_a_caption_event_only_on_change_with_normalised_whitespace():
    fake = FakeBackend(windows="Hello  world\nthis is")
    r, clock, events = reader_with(fake)
    r.start("auto")
    r.step()
    assert captions(events) == [{"t": 1760000000123, "source": "windows", "text": "Hello world this is", "seq": 1}]
    r.step()
    fake.set("windows", " Hello world\n\nthis  is ")  # same words, other whitespace: not a change
    r.step()
    assert len(captions(events)) == 1


def test_rewrites_of_the_last_line_are_changes_with_the_full_text():
    fake = FakeBackend(windows="First line.\nthe patient has a")
    r, clock, events = reader_with(fake)
    r.start("windows")
    r.step()
    fake.set("windows", "First line.\nthe patient has a tumour")
    r.step()
    fake.set("windows", "First line.\nthe patient has two tumours.")
    r.step()
    got = captions(events)
    assert [e["seq"] for e in got] == [1, 2, 3]
    assert got[-1]["text"] == "First line. the patient has two tumours."
    assert all(set(e) == {"t", "source", "text", "seq"} for e in got)


def test_the_element_is_cached_not_searched_on_every_read():
    fake = FakeBackend(windows="x")
    r, clock, events = reader_with(fake)
    r.start("auto")
    for i in range(20):
        fake.set("windows", "x" * (i % 3 + 1))
        r.step()
        clock.now += 0.2
    assert fake.finds["windows"] == 1 and fake.reads["windows"] == 20


def test_window_closing_then_reopening_is_found_again():
    fake = FakeBackend(windows="before")
    r, clock, events = reader_with(fake)
    r.start("auto")
    r.step()
    assert r.status()["state"] == "listening" and r.status()["active"] == "windows"
    fake.set("windows", None)  # Live Captions closed
    r.step()
    st = r.status()
    assert st["state"] == "waiting" and st["code"] == "not_running" and "Win + Ctrl + L" in st["message"]
    assert statuses(events)[-1]["state"] == "waiting"
    fake.set("windows", "after")  # reopened: a new element
    r.step()  # the first search after a loss is immediate
    assert r.status()["state"] == "listening"
    assert captions(events)[-1]["text"] == "after" and captions(events)[-1]["seq"] == 2


def test_searching_while_nothing_runs_is_throttled():
    fake = FakeBackend()
    r, clock, events = reader_with(fake, refind=2.0)
    r.start("windows")
    for _ in range(10):  # 2 s of polling at 200 ms
        r.step()
        clock.now += 0.2
    assert fake.finds["windows"] == 1
    r.step()
    assert fake.finds["windows"] == 2


def test_not_running_tells_the_page_to_press_win_ctrl_l():
    r, clock, events = reader_with(FakeBackend())
    r.start("auto")
    r.step()
    st = r.status()
    assert st["state"] == "waiting" and st["code"] == "not_running" and "Win + Ctrl + L" in st["message"]
    assert st["active"] is None


def test_auto_reads_windows_first_and_never_both():
    fake = FakeBackend(windows="from windows", chrome="from chrome")
    r, clock, events = reader_with(fake)
    r.start("auto")
    for _ in range(5):
        r.step()
    assert r.status()["active"] == "windows" and fake.finds["chrome"] == 0 and fake.reads["chrome"] == 0
    assert {e["source"] for e in captions(events)} == {"windows"}


def test_auto_falls_back_to_chrome():
    fake = FakeBackend(chrome="Chrome  bubble\ntext")
    r, clock, events = reader_with(fake)
    r.start("auto")
    r.step()
    assert r.status()["active"] == "chrome"
    assert captions(events) == [{"t": 1760000000123, "source": "chrome", "text": "Chrome bubble text", "seq": 1}]


def test_a_named_source_never_reads_the_other():
    fake = FakeBackend(windows="w", chrome="c")
    r, clock, events = reader_with(fake)
    r.start("chrome")
    r.step()
    assert r.status()["active"] == "chrome" and fake.finds["windows"] == 0
    r.start("windows")
    r.step()
    assert r.status()["active"] == "windows" and captions(events)[-1]["source"] == "windows"


def test_a_window_without_the_caption_element_reports_uia_changed():
    fake = FakeBackend(windows="w")
    fake.changed.add("windows")
    r, clock, events = reader_with(fake)
    r.start("windows")
    r.step()
    st = r.status()
    assert st["state"] == "error" and st["code"] == "uia_changed"
    fake.changed.add("windows")
    r2, _, _ = reader_with(fake)
    fake.set("chrome", "c")
    r2.start("auto")  # auto goes on to Chrome
    r2.step()
    assert r2.status()["active"] == "chrome"


def test_stop_releases_the_element_and_stops_reading():
    fake = FakeBackend(windows="w")
    r, clock, events = reader_with(fake)
    r.start("auto")
    r.step()
    r.stop()
    reads = fake.reads["windows"]
    r.step()
    assert fake.reads["windows"] == reads and r.status()["state"] == "stopped" and r.status()["active"] is None
    assert statuses(events)[-1]["state"] == "stopped"
    assert r.current() is None  # no caption text is kept after a stop


def test_macos_reports_not_supported_yet():
    called = []
    r = sources.LiveReader(backend_factory=lambda: called.append(1), platform="darwin")
    r.start("auto")
    r.step()
    st = r.status()
    assert st["state"] == "error" and st["code"] == "unsupported" and "not supported on macOS yet" in st["message"]
    assert called == []


def test_missing_ui_automation_is_a_clear_error():
    def factory():
        raise uia.Unavailable("comtypes is not installed")
    r = sources.LiveReader(backend_factory=factory, platform="win32")
    r.start("auto")
    r.step()
    assert r.status()["state"] == "error" and r.status()["code"] == "uia_unavailable"


def test_a_failing_subscriber_does_not_stop_the_reader():
    fake = FakeBackend(windows="w")
    r, clock, events = reader_with(fake)

    def bad(kind, payload):
        raise RuntimeError("event loop closed")
    r.subscribe(bad)
    r.start("auto")
    r.step()
    fake.set("windows", "w2")
    r.step()
    assert [e["text"] for e in captions(events)] == ["w", "w2"]


def test_no_caption_text_in_logs(caplog):
    caplog.set_level(logging.DEBUG)
    fake = FakeBackend(windows="SECRET-PATIENT-NAME")
    r, clock, events = reader_with(fake)
    r.start("auto")
    r.step()
    fake.set("windows", None)
    r.step()
    assert "SECRET" not in caplog.text


# --- reader thread: interval and CPU ------------------------------------------------------------------------------

def test_the_default_poll_interval_is_150_to_250_ms():
    assert 0.15 <= sources.POLL_SECONDS <= 0.25


def test_the_thread_polls_at_the_interval_and_uses_little_cpu():
    fake = FakeBackend(windows="w")
    r = sources.LiveReader(backend_factory=lambda: fake, platform="win32")
    try:
        r.start("auto")
        time.sleep(0.1)
        cpu0, wall0, reads0 = time.process_time(), time.monotonic(), fake.reads["windows"]
        time.sleep(2.0)
        cpu, wall = time.process_time() - cpu0, time.monotonic() - wall0
        reads = fake.reads["windows"] - reads0
    finally:
        r.close()
    assert 2.0 / 0.25 - 2 <= reads <= 2.0 / 0.15 + 2  # one read per interval, no busy loop
    assert cpu / wall <= 0.02  # <= 2 % of one core (whole test process, so an upper bound)


def test_close_ends_the_thread():
    r = sources.LiveReader(backend_factory=lambda: FakeBackend(), platform="win32")
    r.start("auto")
    r.close()
    assert not r.thread_alive()


# --- API ----------------------------------------------------------------------------------------------------------

class _Scanner:
    ready = False

    def profile(self, fresh=False):
        return {}


class _Calibrator:
    def start(self, force=False):
        pass


def make_app(tmp_path, reader, keepalive=15.0):
    return create_app(manager=JobManager(home=tmp_path, runner=None), web_root=tmp_path / "nope",
                      probe=lambda: Device("cpu", "c", 0, 0), models=lambda: [],
                      registry=Registry(None, tmp_path / "home"), refresh_every=0, start_hardware=False,
                      scanner=_Scanner(), calibrator=_Calibrator(), pull=object(), live=reader,
                      live_keepalive=keepalive)


@pytest.fixture
def live_reader():
    fake = FakeBackend()
    r = sources.LiveReader(backend_factory=lambda: fake, platform="win32", interval=0.05)
    r.fake = fake
    yield r
    r.close()


def test_status_start_stop(tmp_path, live_reader):
    c = TestClient(make_app(tmp_path, live_reader), base_url="http://127.0.0.1")
    assert c.get("/api/live/status").json()["state"] == "stopped"
    body = c.post("/api/live/start", json={"source": "windows"}, headers={"Origin": PAGE}).json()
    assert body["source"] == "windows" and body["state"] in ("starting", "waiting")
    assert c.post("/api/live/stop", headers={"Origin": PAGE}).json()["state"] == "stopped"
    assert c.post("/api/live/start").json()["source"] == "auto"  # no body: auto


def test_start_rejects_an_unknown_source(tmp_path, live_reader):
    c = TestClient(make_app(tmp_path, live_reader), base_url="http://127.0.0.1")
    assert c.post("/api/live/start", json={"source": "zoom"}).status_code == 400
    assert c.post("/api/live/start", json=["auto"]).status_code == 400


def test_foreign_origins_are_refused(tmp_path, live_reader):
    c = TestClient(make_app(tmp_path, live_reader), base_url="http://127.0.0.1")
    evil = {"Origin": "https://evil.example"}
    assert c.post("/api/live/start", json={"source": "auto"}, headers=evil).status_code == 403
    assert c.get("/api/live/status", headers=evil).status_code == 403
    assert c.get("/api/live/stream", headers=evil).status_code == 403
    assert live_reader.status()["state"] == "stopped"


def test_cors_and_local_network_access_for_the_page(tmp_path, live_reader):
    c = TestClient(make_app(tmp_path, live_reader), base_url="http://127.0.0.1")
    r = c.get("/api/live/status", headers={"Origin": PAGE})
    assert r.headers["access-control-allow-origin"] == PAGE
    pre = c.options("/api/live/start", headers={"Origin": PAGE, "Access-Control-Request-Method": "POST",
                                                "Access-Control-Request-Headers": "content-type",
                                                "Access-Control-Request-Private-Network": "true"})
    assert pre.status_code == 200 and pre.headers["access-control-allow-private-network"] == "true"
    assert pre.headers["access-control-allow-origin"] == PAGE


# --- SSE over a real server ---------------------------------------------------------------------------------------

def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def server(tmp_path, live_reader):
    import uvicorn
    port = _free_port()
    app = make_app(tmp_path, live_reader, keepalive=0.3)
    srv = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_config=None, access_log=False,
                                        log_level="warning"))
    t = threading.Thread(target=srv.run, daemon=True)
    t.start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    yield "http://127.0.0.1:%d" % port
    srv.should_exit = True
    t.join(5)


def _events(lines):
    """Parse an SSE line iterator into (event, data, id) tuples and comment lines."""
    ev = {}
    for line in lines:
        if line.startswith(":"):
            yield ("comment", line, None)
        elif line == "":
            if "data" in ev:  # as EventSource: a block without data (e.g. retry) dispatches nothing
                yield (ev.get("event", "message"), ev.get("data"), ev.get("id"))
            ev = {}
        else:
            key, _, value = line.partition(":")
            ev[key] = value[1:] if value.startswith(" ") else value


def test_sse_streams_status_and_captions_on_change_with_keep_alive(server, live_reader):
    fake = live_reader.fake
    got = []
    with httpx.Client(timeout=10) as http:
        with http.stream("GET", server + "/api/live/stream", headers={"Origin": PAGE}) as resp:
            assert resp.status_code == 200 and resp.headers["content-type"].startswith("text/event-stream")
            assert resp.headers["access-control-allow-origin"] == PAGE
            it = _events(resp.iter_lines())
            first = next(it)
            assert first[0] == "status" and json.loads(first[1])["state"] == "stopped"
            http.post(server + "/api/live/start", json={"source": "auto"}, headers={"Origin": PAGE})
            fake.set("windows", "one")
            for kind, data, eid in it:
                if kind != "message":
                    continue
                got.append((json.loads(data), eid))
                if len(got) == 1:
                    fake.set("windows", "one two")
                elif len(got) == 2:
                    time.sleep(0.3)  # several polls of the same text: no event
                    fake.set("windows", "one  two three")
                else:
                    break
            keep = [k for k, _, _ in _take(it, 6) if k == "comment"]
    texts = [g[0]["text"] for g in got]
    assert texts == ["one", "one two", "one two three"]
    assert [g[0]["seq"] for g in got] == [1, 2, 3] and [g[1] for g in got] == ["1", "2", "3"]
    assert all(g[0]["source"] == "windows" and isinstance(g[0]["t"], int) for g in got)
    assert keep  # idle stream: keep-alive comments
    for _ in range(50):  # the client went away: the stream ends and unsubscribes
        if live_reader.subscribers() == 0:
            break
        time.sleep(0.1)
    assert live_reader.subscribers() == 0


def _take(it, n):
    out = []
    for item in it:
        out.append(item)
        if len(out) >= n or item[0] == "comment":
            break
    return out


def test_sse_sends_the_current_caption_on_connect(server, live_reader):
    live_reader.fake.set("windows", "already  here")
    with httpx.Client(timeout=10) as http:
        http.post(server + "/api/live/start", json={"source": "windows"}, headers={"Origin": PAGE})
        for _ in range(50):
            if live_reader.status()["seq"] >= 1:
                break
            time.sleep(0.05)
        with http.stream("GET", server + "/api/live/stream") as resp:
            it = _events(resp.iter_lines())
            first, second = next(it), next(it)
    assert first[0] == "status" and json.loads(first[1])["state"] == "listening"
    assert second[0] == "message" and json.loads(second[1])["text"] == "already here"


# --- real UI Automation (this PC; reads only) ---------------------------------------------------------------------

@pytest.mark.skipif(sys.platform != "win32", reason="UI Automation is Windows only")
def test_the_real_backend_searches_without_error():
    pytest.importorskip("comtypes")
    result = {}

    def run():  # its own thread, as in the reader (COM apartment)
        try:
            b = uia.ComBackend()
            result["windows"] = b.find("windows")
            result["chrome"] = b.find("chrome")
            b.close()
        except Exception as exc:  # reported below
            result["error"] = exc
    t = threading.Thread(target=run)
    t.start()
    t.join(30)
    assert "error" not in result, result.get("error")


# --- packaging ----------------------------------------------------------------------------------------------------

def test_the_frozen_windows_build_bundles_the_live_module_and_the_uia_wrapper():
    from vitranslate import config
    spec = (config.REPO_ROOT / "installer" / "vitranslate.spec").read_text(encoding="utf-8")
    for mod in ("vitranslate.live", "vitranslate.live.api", "vitranslate.live.sources", "vitranslate.live.uia"):
        assert '"%s"' % mod in spec, mod
    assert 'collect_submodules("comtypes")' in spec
    assert 'GetModule("UIAutomationCore.dll")' in spec  # comtypes.gen.UIAutomationClient exists before the analysis


def test_comtypes_is_a_windows_only_dependency_and_the_mac_build_does_not_need_it():
    from vitranslate import config
    pyproject = (config.REPO_ROOT / "helper" / "pyproject.toml").read_text(encoding="utf-8")
    assert "\"comtypes>=1.4; sys_platform == 'win32'\"" in pyproject
    mac = (config.REPO_ROOT / "installer" / "macos" / "vitranslate-macos.spec").read_text(encoding="utf-8")
    assert "comtypes" not in mac


def test_the_helper_imports_and_reports_macos_without_comtypes():
    import subprocess
    code = ("import sys; sys.modules['comtypes'] = None; "
            "from vitranslate.server import create_app; from vitranslate.live import sources; "
            "r = sources.LiveReader(platform='darwin', threaded=False); r.start('auto'); r.step(); "
            "print(r.status()['code'])")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=60,
                         cwd=str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == "unsupported"


# --- the real backend's logic on a duck-typed UIA tree (shape seen on this PC, build 26300, before any audio) ------

class TreeEl:
    def __init__(self, aid, name="", children=()):
        self.aid, self.CurrentName, self.children = aid, name, list(children)
        self.searches = 0

    def FindFirst(self, scope, cond):
        self.searches += 1
        prop, value = cond
        stack = list(self.children)
        while stack:
            el = stack.pop(0)
            if el.aid == value:
                return el
            stack.extend(el.children)
        return None


class TreeUIA:
    def __init__(self, root):
        self.root = root

    def ElementFromHandle(self, hwnd):
        return self.root

    def CreatePropertyCondition(self, prop, value):
        return (prop, value)


class TreeUser32:
    def __init__(self):
        self.open = True

    def FindWindowW(self, cls, title):
        return 77 if self.open and cls == uia.WINDOWS_CLASS else None

    def IsWindow(self, hwnd):
        return self.open


def tree_backend(root, clock):
    b = object.__new__(uia.ComBackend)  # no COM: the search / read logic only
    b.uia, b._u, b._com_error, b._clock = TreeUIA(root), TreeUser32(), OSError, clock
    b._ids = [b.uia.CreatePropertyCondition(uia.UIA_AUTOMATION_ID, i) for i in uia.WINDOWS_IDS]
    b._ready = b.uia.CreatePropertyCondition(uia.UIA_AUTOMATION_ID, uia.WINDOWS_READY_ID)
    return b


def test_ready_to_caption_is_listening_with_empty_text_not_uia_changed():
    site = TreeEl("", children=[TreeEl("ReadyToCaptionTextBlock", "Ready to caption, ..."),
                                TreeEl("SettingsButton"), TreeEl("CloseButton")])
    root = TreeEl("", children=[site])
    clock = Clock()
    b = tree_backend(root, clock)
    h = b.find("windows")
    assert h is not None and b.read(h) == ""  # the placeholder is not caption text
    searches = root.searches
    for _ in range(4):  # polls within a second: no new tree search
        clock.now += 0.2
        assert b.read(h) == ""
    assert root.searches == searches
    site.children.append(TreeEl("CaptionsScrollViewer", children=[TreeEl("CaptionsTextBlock", "Hello there")]))
    clock.now += 0.3
    assert b.read(h) == "Hello there"
    n = root.searches
    for _ in range(10):  # found: read the cached element, never search again
        clock.now += 0.2
        b.read(h)
    assert root.searches == n


def test_a_window_with_neither_element_is_uia_changed():
    b = tree_backend(TreeEl("", children=[TreeEl("SettingsButton")]), Clock())
    with pytest.raises(uia.Changed):
        b.find("windows")
