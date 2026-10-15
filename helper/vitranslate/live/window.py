"""Keep the Windows Live Captions window out of sight while the helper reads it (his request 2026-10-15: Live Captions
hidden, the translation in the page only).

Hidden = fully transparent (layered, alpha 0), click-through (WS_EX_TRANSPARENT) and off the taskbar (WS_EX_TOOLWINDOW,
no WS_EX_APPWINDOW); never minimised (UI Automation then loses the text: -32000 coordinates) and never moved, so
UIA reads it as before. The original extended style and alpha are saved per window and put back on stop and at
helper shutdown (alpha 255 when it had none). A Live Captions the helper started itself is closed instead (WM_CLOSE,
as its own Close button; made visible first, so a window that ignores it is never left invisible).

Docked Live Captions (Position: top / bottom) is an appbar: hidden, it still reserves its band of the screen, so
hide() reports it (docked()) and the page asks for Position > Floating.

All Win32 calls go through Win32 below; tests pass a fake with the same methods."""
import logging
import os
import subprocess
import sys

from .uia import WINDOWS_CLASS

log = logging.getLogger("vitranslate.live")

GWL_EXSTYLE = -20
WS_EX_TRANSPARENT, WS_EX_TOOLWINDOW, WS_EX_LAYERED, WS_EX_APPWINDOW = 0x20, 0x80, 0x80000, 0x40000
HIDDEN_ON = WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW
LWA_ALPHA = 2
SWP_NOSIZE, SWP_NOMOVE, SWP_NOZORDER, SWP_NOACTIVATE, SWP_FRAMECHANGED = 0x1, 0x2, 0x4, 0x10, 0x20
WM_CLOSE = 0x10
MONITOR_DEFAULTTONEAREST = 2
CREATE_NO_WINDOW = 0x08000000
BAND_SLACK = 2  # px: a docked window lies outside the work area, give or take a border


def live_captions_exe(environ=None):
    environ = os.environ if environ is None else environ
    return os.path.join(environ.get("SystemRoot") or "C:/Windows", "System32", "LiveCaptions.exe")


def docked(rect, monitor, work):
    """True when the window spans the work area's width in a band the work area leaves out (an appbar at the top or
    bottom edge). rect, monitor, work: (left, top, right, bottom)."""
    left, top, right, bottom = rect
    if left > work[0] or right < work[2]:
        return False
    return (top <= monitor[1] or bottom >= monitor[3] or bottom <= work[1] + BAND_SLACK
            or top >= work[3] - BAND_SLACK)


class CaptionWindow:
    """The Live Captions window of one reader: launch(), hide(hwnd), keep(hwnd) on every poll, restore(close)."""

    def __init__(self, win=None, exe=None):
        self.win = win if win is not None else Win32()
        self.exe = exe or live_captions_exe()
        self.saved = {}  # hwnd -> (exstyle, alpha) before it was hidden
        self.started = False  # this helper started Live Captions (closed again by restore)

    def launch(self):
        """Start Live Captions when its window is not there; True when it was started now."""
        if self.win.find():
            return False
        try:
            self.win.launch(self.exe)
        except OSError as exc:
            log.warning("live: could not start Live Captions: %s", exc)
            return False
        self.started = True
        log.info("live: started Live Captions")
        return True

    def hide(self, hwnd):
        """Hide the window (its first state is saved, later calls re-apply); True when it is docked."""
        ex = self.win.exstyle(hwnd)
        if hwnd not in self.saved:
            alpha = self.win.alpha(hwnd)
            if ex & WS_EX_TRANSPARENT:  # left hidden before (no normal exit): never put that state back
                ex_orig, alpha = ex & ~(WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW), None
            else:
                ex_orig = ex
            self.saved[hwnd] = (ex_orig, alpha if alpha else 255)
        new = (ex | HIDDEN_ON) & ~WS_EX_APPWINDOW
        if new != ex:
            self.win.set_exstyle(hwnd, new)
        self.win.set_alpha(hwnd, 0)
        self.win.refresh(hwnd)
        return docked(*self.win.rects(hwnd))

    def keep(self, hwnd):
        """Hidden still? Live Captions puts its own opacity back (seen after the frame refresh, alpha 234 on this PC):
        alpha 0 again. One read per call; True when it had to be set again."""
        if hwnd not in self.saved or self.win.alpha(hwnd) == 0:
            return False
        self.win.set_alpha(hwnd, 0)
        return True

    def restore(self, close=True):
        """Put every hidden window back; with close, end a Live Captions this helper started."""
        saved, self.saved = self.saved, {}
        for hwnd, (ex, alpha) in saved.items():
            if self.win.is_window(hwnd):
                self.win.set_alpha(hwnd, alpha)
                self.win.set_exstyle(hwnd, ex)
                self.win.refresh(hwnd)
        if close and self.started:
            self.started = False
            hwnd = self.win.find()
            if hwnd:
                self.win.close(hwnd)
                log.info("live: closed the Live Captions it started")


class Win32:
    """user32 through ctypes (Windows only). Plain window calls: any thread may use them."""

    def __init__(self):
        if sys.platform != "win32":
            raise OSError("Win32 only")
        import ctypes
        from ctypes import wintypes
        u = ctypes.WinDLL("user32", use_last_error=True)
        u.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
        u.FindWindowW.restype = wintypes.HWND
        u.IsWindow.argtypes = [wintypes.HWND]
        u.IsWindow.restype = wintypes.BOOL
        u.GetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int]
        u.GetWindowLongPtrW.restype = ctypes.c_ssize_t
        u.SetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
        u.SetWindowLongPtrW.restype = ctypes.c_ssize_t
        u.GetLayeredWindowAttributes.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD),
                                                 ctypes.POINTER(ctypes.c_ubyte), ctypes.POINTER(wintypes.DWORD)]
        u.GetLayeredWindowAttributes.restype = wintypes.BOOL
        u.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_ubyte, wintypes.DWORD]
        u.SetLayeredWindowAttributes.restype = wintypes.BOOL
        u.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                   ctypes.c_int, wintypes.UINT]
        u.SetWindowPos.restype = wintypes.BOOL
        u.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        u.MonitorFromWindow.argtypes = [wintypes.HWND, wintypes.DWORD]
        u.MonitorFromWindow.restype = wintypes.HMONITOR

        class MONITORINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT), ("rcWork", wintypes.RECT),
                        ("dwFlags", wintypes.DWORD)]
        u.GetMonitorInfoW.argtypes = [wintypes.HMONITOR, ctypes.POINTER(MONITORINFO)]
        u.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
        u.PostMessageW.restype = wintypes.BOOL
        self._ct, self._wt, self._u, self._info = ctypes, wintypes, u, MONITORINFO

    def _check(self, ok, name):
        if not ok:
            raise OSError("%s failed (%d)" % (name, self._ct.get_last_error()))

    def find(self):
        return self._u.FindWindowW(WINDOWS_CLASS, None) or None

    def is_window(self, hwnd):
        return bool(hwnd) and bool(self._u.IsWindow(hwnd))

    def exstyle(self, hwnd):
        return self._u.GetWindowLongPtrW(hwnd, GWL_EXSTYLE) & 0xFFFFFFFF

    def set_exstyle(self, hwnd, value):
        self._ct.set_last_error(0)
        if not self._u.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, value) and self._ct.get_last_error():
            raise OSError("SetWindowLongPtrW failed (%d)" % self._ct.get_last_error())

    def alpha(self, hwnd):
        """The layered alpha set with SetLayeredWindowAttributes, None when there is none."""
        key, a, flags = self._wt.DWORD(), self._ct.c_ubyte(), self._wt.DWORD()
        if not self._u.GetLayeredWindowAttributes(hwnd, self._ct.byref(key), self._ct.byref(a), self._ct.byref(flags)):
            return None
        return a.value if flags.value & LWA_ALPHA else None

    def set_alpha(self, hwnd, value):
        self._check(self._u.SetLayeredWindowAttributes(hwnd, 0, value, LWA_ALPHA), "SetLayeredWindowAttributes")

    def refresh(self, hwnd):
        self._u.SetWindowPos(hwnd, None, 0, 0, 0, 0,
                             SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED)

    def rects(self, hwnd):
        """(window, monitor, work area) of the monitor nearest the window, each (left, top, right, bottom)."""
        r = self._wt.RECT()
        self._u.GetWindowRect(hwnd, self._ct.byref(r))
        info = self._info()
        info.cbSize = self._ct.sizeof(self._info)
        self._check(self._u.GetMonitorInfoW(self._u.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST),
                                            self._ct.byref(info)), "GetMonitorInfoW")
        box = lambda x: (x.left, x.top, x.right, x.bottom)  # noqa: E731
        return box(r), box(info.rcMonitor), box(info.rcWork)

    def launch(self, exe):
        subprocess.Popen([exe], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         close_fds=True, creationflags=CREATE_NO_WINDOW)

    def close(self, hwnd):
        self._u.PostMessageW(hwnd, WM_CLOSE, 0, 0)
