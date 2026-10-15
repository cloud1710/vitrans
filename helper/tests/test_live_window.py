"""Live Captions kept out of sight (helper/vitranslate/live/window.py): hidden once the reader has found it in its
normal state, put back on stop / shutdown, closed when the helper started it; with a scripted fake Win32 layer, so
these run on any platform. The real layer is only exercised read-only on Windows."""
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

from test_live import PAGE, Clock, FakeBackend, FakeHandle, make_app
from vitranslate import desktop
from vitranslate.live import sources, uia, window

FLOATING = (887, 795, 1698, 901)
MONITOR = (0, 0, 1707, 960)
WORK = (0, 0, 1707, 912)
ORIGINAL_EX = 0x80108  # Live Captions on this PC: WS_EX_LAYERED | WS_EX_WINDOWEDGE | WS_EX_TOPMOST


class FakeWin:
    """One Live Captions window (hwnd) at a time, or none. launch() runs on_launch (default: nothing appears)."""

    def __init__(self, hwnd=77, exstyle=ORIGINAL_EX, alpha=None):
        self.hwnd = hwnd
        self.windows = {hwnd: {"ex": exstyle, "alpha": alpha}} if hwnd else {}
        self.rect, self.monitor, self.work = FLOATING, MONITOR, WORK
        self.launched, self.closed, self.calls = [], [], []
        self.on_launch = None
        self.fail = None  # a method name that raises OSError

    def _call(self, name, *args):
        self.calls.append((name,) + args)
        if name == self.fail:
            raise OSError(name)

    def open(self, hwnd, exstyle=ORIGINAL_EX):
        """Live Captions (re)creates its window."""
        self.windows.pop(self.hwnd, None)
        self.hwnd = hwnd
        self.windows[hwnd] = {"ex": exstyle, "alpha": None}

    def find(self):
        self._call("find")
        return self.hwnd

    def is_window(self, hwnd):
        self._call("is_window", hwnd)
        return hwnd in self.windows

    def exstyle(self, hwnd):
        self._call("exstyle", hwnd)
        return self.windows[hwnd]["ex"]

    def set_exstyle(self, hwnd, value):
        self._call("set_exstyle", hwnd, value)
        self.windows[hwnd]["ex"] = value

    def alpha(self, hwnd):
        self._call("alpha", hwnd)
        return self.windows[hwnd]["alpha"]

    def set_alpha(self, hwnd, value):
        self._call("set_alpha", hwnd, value)
        self.windows[hwnd]["alpha"] = value

    def refresh(self, hwnd):
        self._call("refresh", hwnd)

    def rects(self, hwnd):
        self._call("rects", hwnd)
        return self.rect, self.monitor, self.work

    def launch(self, exe):
        self._call("launch", exe)
        self.launched.append(exe)
        if self.on_launch:
            self.on_launch()

    def close(self, hwnd):
        self._call("close", hwnd)
        self.closed.append(hwnd)

    def hidden(self, hwnd):
        w = self.windows[hwnd]
        return (w["alpha"] == 0 and w["ex"] & window.WS_EX_TRANSPARENT and w["ex"] & window.WS_EX_TOOLWINDOW
                and w["ex"] & window.WS_EX_LAYERED and not w["ex"] & window.WS_EX_APPWINDOW)

    def visible(self, hwnd):
        w = self.windows[hwnd]
        return w["alpha"] in (None, 255) and not w["ex"] & window.WS_EX_TRANSPARENT


class WinBackend(FakeBackend):
    """The UIA fake whose Live Captions window is FakeWin's: handles carry its hwnd."""

    def __init__(self, win, windows="", chrome=None):
        super().__init__(windows=windows if win.hwnd else None, chrome=chrome)
        self.win = win

    def find(self, kind):
        h = super().find(kind)
        if h is not None and kind == "windows":
            h.hwnd = self.win.hwnd
        return h


def reader_on(win, backend=None, subscribe=True, **kw):
    backend = backend or WinBackend(win)
    clock = Clock()
    r = sources.LiveReader(backend_factory=lambda: backend, window_factory=lambda: window.CaptionWindow(
        win, exe="C:/Windows/System32/LiveCaptions.exe"), clock=clock, wall=lambda: 1760000000.0, platform="win32",
        threaded=False, **kw)
    events = []
    if subscribe:
        r.subscribe(lambda kind, payload: events.append((kind, payload)))
    return r, backend, clock, events


# --- the reader hides, restores, closes ------------------------------------------------------------------------------

def test_live_captions_is_hidden_once_found():
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    st = r.status()
    assert st["state"] == "listening" and st["active"] == "windows" and st["code"] is None
    assert win.hidden(77) and win.launched == []  # already running: not started again


def test_hide_is_the_default_of_a_start():
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("windows")
    r.step()
    assert win.hidden(77)


def test_not_hidden_while_the_window_is_not_in_its_normal_state():
    win = FakeWin()
    backend = WinBackend(win)
    backend.changed.add("windows")  # e.g. the first-run setup screen: the user must see it
    r, backend, clock, events = reader_on(win, backend)
    r.start("windows")
    r.step()
    assert r.status()["code"] == "uia_changed" and win.visible(77)
    assert not [c for c in win.calls if c[0] in ("set_exstyle", "set_alpha")]


def test_stop_puts_the_window_back():
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    r.stop()
    assert win.windows[77] == {"ex": ORIGINAL_EX, "alpha": 255} and win.closed == []
    assert r.status()["state"] == "stopped"


def test_close_puts_the_window_back_too():
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    r.close()
    assert win.visible(77) and win.windows[77]["ex"] == ORIGINAL_EX


def test_the_original_alpha_is_kept_when_the_window_had_one():
    win = FakeWin(alpha=230)
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    r.stop()
    assert win.windows[77]["alpha"] == 230


def test_a_window_left_hidden_before_comes_back_visible():
    # a helper that did not exit normally (or a probe) left it transparent: that state is never the one put back
    hidden_ex = (ORIGINAL_EX | window.WS_EX_TRANSPARENT | window.WS_EX_TOOLWINDOW)
    win = FakeWin(exstyle=hidden_ex, alpha=0)
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    assert win.hidden(77)
    r.stop()
    assert win.windows[77] == {"ex": ORIGINAL_EX, "alpha": 255}


def test_live_captions_is_started_when_not_running_and_closed_on_stop():
    win = FakeWin(hwnd=None)
    backend = WinBackend(win)

    def appear():
        win.open(90)
        backend.set("windows", "")
    win.on_launch = appear
    r, backend, clock, events = reader_on(win, backend, refind=2.0)
    r.start("auto")
    r.step()
    assert win.launched == ["C:/Windows/System32/LiveCaptions.exe"]
    assert r.status()["state"] == "starting"  # the new window gets a moment before the first search
    clock.now += 2.0
    r.step()
    assert r.status()["state"] == "listening" and win.hidden(90)
    r.stop()
    assert win.closed == [90] and win.visible(90)  # made visible first: never left invisible if it ignores WM_CLOSE


def test_live_captions_is_started_once_per_start():
    win = FakeWin(hwnd=None)
    r, backend, clock, events = reader_on(win, refind=2.0)
    r.start("windows")
    for _ in range(30):
        r.step()
        clock.now += 0.5
    assert len(win.launched) == 1 and r.status()["state"] == "waiting"
    r.stop()
    assert win.closed == []  # it never appeared: nothing to close
    r.start("windows")
    r.step()
    assert len(win.launched) == 2


def test_a_live_captions_already_running_is_never_closed():
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    r.stop()
    r.close()
    assert win.closed == [] and win.launched == []


def test_a_recreated_window_is_hidden_too():
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    backend.set("windows", None)  # Live Captions closed ...
    win.open(78)
    r.step()
    assert r.status()["state"] == "waiting"
    backend.set("windows", "again")  # ... and opened again: a new window
    r.step()
    assert r.status()["state"] == "listening" and win.hidden(78)
    r.stop()
    assert win.visible(78) and 77 not in win.windows


def test_live_captions_putting_its_own_opacity_back_is_hidden_again_on_the_next_poll():
    # seen on this PC: after the frame refresh Live Captions sets its alpha back to 234 (its opacity setting)
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    win.windows[77]["alpha"] = 234
    r.step()
    assert win.hidden(77)
    sets = len([c for c in win.calls if c[0] == "set_alpha"])
    for _ in range(5):  # still hidden: only read, nothing set
        r.step()
    assert len([c for c in win.calls if c[0] == "set_alpha"]) == sets
    r.stop()
    assert win.visible(77)


def test_docked_live_captions_is_hidden_and_reported():
    win = FakeWin()
    win.rect, win.work = (0, 812, 1707, 912), (0, 0, 1707, 812)  # docked at the bottom, above the taskbar
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    st = r.status()
    assert win.hidden(77) and st["state"] == "listening" and st["code"] == "docked"
    assert "Floating" in st["message"]
    assert [s for s in (p for k, p in events if k == "status") if s.get("code") == "docked"]


@pytest.mark.parametrize("rect, work, docked", [
    ((0, 812, 1707, 912), (0, 0, 1707, 812), True),     # bottom, above the taskbar
    ((0, 0, 1707, 100), (0, 100, 1707, 912), True),     # top
    ((48, 0, 1707, 100), (48, 100, 1707, 960), True),   # top, taskbar on the left
    (FLOATING, WORK, False),                            # floating
    ((0, 800, 1707, 912), WORK, False),                 # floating, stretched to the full width at the bottom
    ((0, 300, 1707, 400), WORK, False),                 # floating, full width in the middle
])
def test_docked_means_full_width_in_a_reserved_band(rect, work, docked):
    assert window.docked(rect, MONITOR, work) is docked


def test_hide_false_leaves_the_window_alone():
    win = FakeWin(hwnd=None)
    r, backend, clock, events = reader_on(win)
    r.start("auto", hide=False)
    r.step()
    win.open(77)
    backend.set("windows", "text")
    clock.now += 5
    r.step()
    r.stop()
    assert r.status()["state"] == "stopped" and win.calls == []


def test_a_start_without_hide_shows_a_window_hidden_before():
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    r.step()
    r.start("windows", hide=False)
    assert win.visible(77)
    r.step()
    assert win.visible(77)


def test_the_chrome_source_never_touches_live_captions():
    win = FakeWin()
    backend = WinBackend(win, windows="w", chrome="c")
    r, backend, clock, events = reader_on(win, backend)
    r.start("chrome")
    r.step()
    r.stop()
    assert r.status()["active"] is None and win.calls == []


def test_auto_reading_chrome_does_not_hide_anything():
    win = FakeWin(hwnd=None)
    backend = WinBackend(win, chrome="bubble")
    r, backend, clock, events = reader_on(win, backend)
    r.start("auto")
    r.step()  # Live Captions is started (auto prefers it) ...
    clock.now += 5
    r.step()  # ... it did not appear: Chrome is read
    assert r.status()["active"] == "chrome"
    assert not [c for c in win.calls if c[0] in ("set_exstyle", "set_alpha")]


def test_a_failing_hide_does_not_stop_the_captions():
    win = FakeWin()
    win.fail = "set_exstyle"
    backend = WinBackend(win, windows="hello")
    r, backend, clock, events = reader_on(win, backend)
    r.start("auto")
    r.step()
    assert r.status()["state"] == "listening" and [p["text"] for k, p in events if k == "caption"] == ["hello"]
    r.stop()  # nor does a failing restore stop the stop
    assert r.status()["state"] == "stopped"


def test_a_session_nobody_listens_to_stops_and_shows_the_window():
    win = FakeWin()
    r, backend, clock, events = reader_on(win, subscribe=False)
    r.start("auto")
    r.step()
    assert win.hidden(77)
    clock.now += sources.ORPHAN_SECONDS - 1
    r.step()
    assert r.status()["state"] == "listening"
    clock.now += 2
    r.step()
    assert r.status()["state"] == "stopped" and win.visible(77)


def test_a_session_with_a_listener_goes_on():
    win = FakeWin()
    r, backend, clock, events = reader_on(win)
    r.start("auto")
    for _ in range(5):
        r.step()
        clock.now += sources.ORPHAN_SECONDS
    assert r.status()["state"] == "listening" and win.hidden(77)


def test_without_a_window_layer_nothing_is_hidden():
    fake = FakeBackend(windows="w")
    r = sources.LiveReader(backend_factory=lambda: fake, platform="win32", threaded=False)
    r.start("auto")
    r.step()  # the plain fake's handles have no hwnd: nothing asks for one
    assert r.status()["state"] == "listening" and not hasattr(FakeHandle("windows", 0), "hwnd")
    r.stop()
    assert r.status()["state"] == "stopped"


# --- API and shutdown ------------------------------------------------------------------------------------------------

class SpyReader(sources.LiveReader):
    def __init__(self):
        super().__init__(backend_factory=lambda: FakeBackend(), platform="win32", threaded=False)
        self.starts, self.closed = [], 0

    def start(self, source="auto", hide=True):
        self.starts.append((source, hide))
        return super().start(source, hide)

    def close(self):
        self.closed += 1
        super().close()


def test_start_takes_hide_true_by_default(tmp_path):
    spy = SpyReader()
    c = TestClient(make_app(tmp_path, spy), base_url="http://127.0.0.1")
    c.post("/api/live/start", json={"source": "windows"}, headers={"Origin": PAGE})
    c.post("/api/live/start", json={"source": "auto", "hide": False}, headers={"Origin": PAGE})
    c.post("/api/live/start")
    assert spy.starts == [("windows", True), ("auto", False), ("auto", True)]
    assert c.post("/api/live/start", json={"source": "auto", "hide": "no"}).status_code == 400


def test_helper_shutdown_closes_the_reader(tmp_path):
    spy = SpyReader()
    with TestClient(make_app(tmp_path, spy), base_url="http://127.0.0.1") as c:
        assert c.get("/api/live/status").status_code == 200
        assert spy.closed == 0
    assert spy.closed == 1


def test_the_installed_helper_stop_entry_ends_the_live_session_first(tmp_path, monkeypatch):
    order = []
    monkeypatch.setattr(desktop, "stop_live", lambda: order.append("live"))
    monkeypatch.setattr(desktop, "stop_running", lambda home: order.append("kill"))
    monkeypatch.setattr(desktop, "setup_logging", lambda home, logger=None: home / "logs" / "helper.log")
    assert desktop.main(["--stop"], home=tmp_path) == 0 and order == ["live", "kill"]


def test_stop_live_posts_to_the_running_helper():
    asked = []

    def handler(request):
        asked.append((request.method, request.url.port, request.url.path))
        if request.url.path == "/api/health":
            if request.url.port != 47832:
                raise httpx.ConnectError("refused")
            return httpx.Response(200, json={"app": "ViTranslate"})
        return httpx.Response(200, json={"state": "stopped"})
    assert desktop.stop_live(transport=httpx.MockTransport(handler)) is True
    assert asked[-1] == ("POST", 47832, "/api/live/stop")


def test_stop_live_without_a_helper_is_quiet():
    def refused(request):
        raise httpx.ConnectError("refused")
    assert desktop.stop_live(transport=httpx.MockTransport(refused)) is False


# --- packaging and the real Win32 layer -------------------------------------------------------------------------------

def test_the_frozen_build_bundles_the_window_module():
    from vitranslate import config
    spec = (config.REPO_ROOT / "installer" / "vitranslate.spec").read_text(encoding="utf-8")
    assert '"vitranslate.live.window"' in spec


def test_live_captions_path_comes_from_systemroot():
    assert window.live_captions_exe({"SystemRoot": "D:/Win"}).replace("\\", "/") == "D:/Win/System32/LiveCaptions.exe"
    assert window.live_captions_exe({}).replace("\\", "/").lower() == "c:/windows/system32/livecaptions.exe"


@pytest.mark.skipif(sys.platform != "win32", reason="Win32 only")
def test_the_real_win32_layer_reads_without_changing_anything():
    w = window.Win32()
    hwnd = w.find()
    if hwnd:
        before = (w.exstyle(hwnd), w.alpha(hwnd))
        rect, monitor, work = w.rects(hwnd)
        assert rect[2] > rect[0] and monitor[2] > monitor[0] and work[2] > work[0]
        assert w.is_window(hwnd) and (w.exstyle(hwnd), w.alpha(hwnd)) == before
    assert not w.is_window(0)


def test_the_uia_handle_carries_the_window_handle():
    h = uia.Handle("windows", 1234, None)
    assert h.hwnd == 1234
