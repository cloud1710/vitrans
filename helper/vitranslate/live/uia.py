"""Minimal UI Automation access for the live caption sources (Windows only, through comtypes).

Backend interface used by sources.LiveReader (tests use a scripted fake with the same two methods):
  find(kind) -> Handle | None   kind "windows" or "chrome"; None when that caption window is not there;
                                raises Changed when the window is there but its caption element is not
  read(handle) -> str           the caption text now; raises Gone when the cached element can no longer be read
Handle.hwnd is the source's top-level window.
Rules (spec 4.1, 14): the element is searched once and cached (searching the tree on every read made LiveCaptions.exe
grow to about 2 GB); this module only reads the source windows. Since 2026-10-15 window.py may make the Windows Live
Captions window transparent and click-through while it is read (start hide=true; put back on stop), or close a Live
Captions the helper started itself; no source window is ever minimised (UIA then loses its text), moved or killed,
and Chrome's bubble is never touched. UIA calls time out after about 1 s so a hung source cannot hang the helper; no
caption text is logged."""
import logging
import os
import sys
import time

log = logging.getLogger("vitranslate.live")

WINDOWS_CLASS = "LiveCaptionsDesktopWindow"
# AutomationId of the caption text (LiveCaptions-Translator, get-livecaptions); the scroll viewer as a fallback
WINDOWS_IDS = ("CaptionsTextBlock", "CaptionsScrollViewer")
# before the first caption the window only has this placeholder ("Ready to caption ..."; seen on build 26300): the
# source is there and listening, the caption element appears with the first words
WINDOWS_READY_ID = "ReadyToCaptionTextBlock"
READY_SEARCH_SECONDS = 1.0  # while only the placeholder is there, look for the caption element at most this often
CHROME_EXES = ("chrome.exe",)
# accessible title of Chrome's caption bubble in the UI languages we expect (English, Vietnamese)
CHROME_TITLES = ("Live Caption", "Live captions", "Ph\u1ee5 \u0111\u1ec1 tr\u1ef1c ti\u1ebfp")
CHROME_MAX_PX = (1600, 1000)  # the bubble is at most 536 dip wide and a few lines high: skip big browser windows

UIA_CONTROL_TYPE = 30003
UIA_AUTOMATION_ID = 30011
UIA_DOCUMENT = 50030
UIA_TEXT = 50020
SCOPE_DESCENDANTS = 4
TIMEOUT_MS = 1000
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


class Gone(Exception):
    """The cached caption element cannot be read any more (window closed, bubble hidden, element destroyed)."""


class Changed(Exception):
    """The caption window is there but its caption element is not (the source changed its UI)."""


class Unavailable(Exception):
    """UI Automation cannot be used here (not Windows, or comtypes missing)."""


class Handle:
    """element: the cached caption element; None while Live Captions only shows its placeholder (root is then
    searched again for the caption element, at most every READY_SEARCH_SECONDS)."""
    __slots__ = ("kind", "hwnd", "element", "root", "searched")

    def __init__(self, kind, hwnd, element, root=None, searched=0.0):
        self.kind, self.hwnd, self.element, self.root, self.searched = kind, hwnd, element, root, searched


def _module(comtypes_client):
    """The comtypes wrapper of UIAutomationCore: pre-generated in the frozen build, generated once otherwise."""
    try:
        from comtypes.gen import UIAutomationClient
        return UIAutomationClient
    except ImportError:
        return comtypes_client.GetModule("UIAutomationCore.dll")


def _user32():
    import ctypes
    from ctypes import wintypes
    u = ctypes.WinDLL("user32", use_last_error=True)
    u.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
    u.FindWindowW.restype = wintypes.HWND
    for name in ("IsWindow", "IsWindowVisible"):
        getattr(u, name).argtypes = [wintypes.HWND]
        getattr(u, name).restype = wintypes.BOOL
    u.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    u.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    u.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    u.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM), wintypes.LPARAM]
    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    k.OpenProcess.restype = wintypes.HANDLE
    k.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR,
                                             ctypes.POINTER(wintypes.DWORD)]
    k.CloseHandle.argtypes = [wintypes.HANDLE]
    return ctypes, wintypes, u, k


class ComBackend:
    """Real backend. Create, use and close it on one thread (the reader thread: COM multithreaded apartment)."""

    def __init__(self):
        if sys.platform != "win32":
            raise Unavailable("UI Automation is Windows only")
        if "comtypes" not in sys.modules:
            sys.coinit_flags = 0  # COINIT_MULTITHREADED for the thread that imports comtypes first (this one)
        try:
            import comtypes
            import comtypes.client
        except ImportError as exc:
            raise Unavailable("comtypes is not installed") from exc
        try:
            comtypes.CoInitializeEx(comtypes.COINIT_MULTITHREADED)
        except OSError:  # this thread already has an apartment
            pass
        self._com_error = comtypes.COMError
        m = _module(comtypes.client)
        try:  # IUIAutomation2: connection / transaction timeouts
            self.uia = comtypes.client.CreateObject(m.CUIAutomation8, interface=m.IUIAutomation2)
            self.uia.ConnectionTimeout = TIMEOUT_MS
            self.uia.TransactionTimeout = TIMEOUT_MS
        except (AttributeError, OSError, comtypes.COMError):
            self.uia = comtypes.client.CreateObject(m.CUIAutomation, interface=m.IUIAutomation)
        self._ids = [self.uia.CreatePropertyCondition(UIA_AUTOMATION_ID, i) for i in WINDOWS_IDS]
        self._ready = self.uia.CreatePropertyCondition(UIA_AUTOMATION_ID, WINDOWS_READY_ID)
        self._clock = time.monotonic
        self._document = self.uia.CreatePropertyCondition(UIA_CONTROL_TYPE, UIA_DOCUMENT)
        self._text = self.uia.CreatePropertyCondition(UIA_CONTROL_TYPE, UIA_TEXT)
        self._ct, self._wt, self._u, self._k = _user32()

    def close(self):
        self._ids = self._ready = self._document = self._text = self.uia = None

    # --- search (only when nothing is cached) ---

    def find(self, kind):
        return self._find_windows() if kind == "windows" else self._find_chrome()

    def _find_windows(self):
        hwnd = self._u.FindWindowW(WINDOWS_CLASS, None)
        if not hwnd:
            return None
        try:
            root = self.uia.ElementFromHandle(hwnd)
            el = self._caption_element(root)
            if el:
                return Handle("windows", hwnd, el)
            if root.FindFirst(SCOPE_DESCENDANTS, self._ready):
                return Handle("windows", hwnd, None, root, self._clock())
        except self._com_error:
            return None  # the window is going away
        raise Changed("windows")

    def _caption_element(self, root):
        for cond in self._ids:
            el = root.FindFirst(SCOPE_DESCENDANTS, cond)
            if el:
                return el
        return None

    def _find_chrome(self):
        for hwnd in self._chrome_windows():
            try:
                root = self.uia.ElementFromHandle(hwnd)
                if self._title(hwnd) not in CHROME_TITLES and (root.CurrentName or "") not in CHROME_TITLES:
                    continue
                doc = root.FindFirst(SCOPE_DESCENDANTS, self._document)
            except self._com_error:
                continue
            if doc:
                return Handle("chrome", hwnd, doc)
        return None

    def _chrome_windows(self):
        ct, wt, u = self._ct, self._wt, self._u
        found = []

        def visit(hwnd, _):
            if u.IsWindowVisible(hwnd) and self._class(hwnd).startswith("Chrome_WidgetWin"):
                rect = wt.RECT()
                u.GetWindowRect(hwnd, ct.byref(rect))
                if rect.right - rect.left <= CHROME_MAX_PX[0] and rect.bottom - rect.top <= CHROME_MAX_PX[1]:
                    found.append(hwnd)
            return True
        u.EnumWindows(ct.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)(visit), 0)
        return [h for h in found if self._exe(h) in CHROME_EXES]

    def _class(self, hwnd):
        buf = self._ct.create_unicode_buffer(256)
        self._u.GetClassNameW(hwnd, buf, 256)
        return buf.value

    def _title(self, hwnd):
        buf = self._ct.create_unicode_buffer(256)
        self._u.GetWindowTextW(hwnd, buf, 256)
        return buf.value

    def _exe(self, hwnd):
        ct, wt = self._ct, self._wt
        pid = wt.DWORD()
        self._u.GetWindowThreadProcessId(hwnd, ct.byref(pid))
        proc = self._k.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
        if not proc:
            return ""
        try:
            buf, size = ct.create_unicode_buffer(1024), wt.DWORD(1024)
            if not self._k.QueryFullProcessImageNameW(proc, 0, buf, ct.byref(size)):
                return ""
            return os.path.basename(buf.value).lower()
        finally:
            self._k.CloseHandle(proc)

    # --- read (every poll, cached element only) ---

    def read(self, handle):
        if not self._u.IsWindow(handle.hwnd):
            raise Gone(handle.kind)
        try:
            if handle.kind == "windows":
                if handle.element is None:  # placeholder only: no caption text yet
                    now = self._clock()
                    if now - handle.searched < READY_SEARCH_SECONDS:
                        return ""
                    handle.searched = now
                    handle.element = self._caption_element(handle.root) or None
                    if handle.element is None:
                        return ""
                    handle.root = None
                return handle.element.CurrentName or ""
            if not self._u.IsWindowVisible(handle.hwnd):  # the bubble hides when there is no text
                raise Gone(handle.kind)
            lines = handle.element.FindAll(SCOPE_DESCENDANTS, self._text)
            return " ".join(lines.GetElement(i).CurrentName or "" for i in range(lines.Length))
        except self._com_error as exc:
            raise Gone(handle.kind) from exc
