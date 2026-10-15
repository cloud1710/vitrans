"""The installed helper's entry point: arguments, single instance, bundled paths, logs, stop."""
import logging
import os
import subprocess
import sys
import uuid

import httpx
import pytest

from vitranslate import desktop


def test_arguments_of_the_start_menu_the_stop_entry_and_the_protocol():
    assert desktop.parse_args([]) == {"open": False, "stop": False}
    assert desktop.parse_args(["--open"]) == {"open": True, "stop": False}  # Start Menu: start + open the page
    assert desktop.parse_args(["--stop"]) == {"open": False, "stop": True}  # uninstaller / "Dung ViTranslate"
    # vitranslate://start from the web page only starts the helper: no new tab, and a page can never stop it
    for url in ("vitranslate://start", "vitranslate://start/", "VITRANSLATE://open", "vitranslate://stop",
                "vitranslate:--stop", 'vitranslate://%00x"; calc'):
        assert desktop.parse_args([url]) == {"open": False, "stop": False}


@pytest.mark.skipif(os.name != "nt", reason="Windows named mutex")
def test_only_one_helper_holds_the_instance_lock():
    name = "Local\\ViTranslate.Test." + uuid.uuid4().hex
    first = desktop.acquire_instance(name)
    assert first is not None
    assert desktop.acquire_instance(name) is None  # a second start
    desktop.release_instance(first)
    again = desktop.acquire_instance(name)
    assert again is not None
    desktop.release_instance(again)


def test_find_running_asks_each_port_for_a_vitranslate_health():
    asked = []

    def handler(request):
        asked.append(request.url.port)
        if request.url.port == 47831:
            return httpx.Response(200, json={"app": "Other"})
        if request.url.port == 47832:
            return httpx.Response(200, json={"app": "ViTranslate", "version": "0.1.0"})
        raise httpx.ConnectError("refused", request=request)
    assert desktop.find_running(transport=httpx.MockTransport(handler)) == 47832 and asked == [47831, 47832]

    def refused(request):
        raise httpx.ConnectError("refused", request=request)
    assert desktop.find_running(transport=httpx.MockTransport(refused)) is None


def test_bundle_paths_point_the_helper_at_its_bundled_files(tmp_path):
    for d in ("web", "registry", "packs/_style"):
        (tmp_path / d).mkdir(parents=True)
    env = {}
    desktop.bundle_paths(tmp_path, env)
    assert env == {"VITRANSLATE_WEB": str(tmp_path / "web"), "VITRANSLATE_REGISTRY": str(tmp_path / "registry"),
                   "VITRANSLATE_STYLE": str(tmp_path / "packs" / "_style")}
    env = {"VITRANSLATE_REGISTRY": "https://reg.example"}
    desktop.bundle_paths(tmp_path, env)
    assert env["VITRANSLATE_REGISTRY"] == "https://reg.example"  # an explicit configuration wins


def test_logs_go_to_the_logs_folder_even_without_a_console(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "stdout", None)  # a windowed exe has no console streams
    monkeypatch.setattr(sys, "stderr", None)
    for name in ("httpx", "httpcore"):
        monkeypatch.setattr(logging.getLogger(name), "level", logging.NOTSET)  # restored after the test
    logger = logging.getLogger("vitranslate-test-" + uuid.uuid4().hex)
    path = desktop.setup_logging(tmp_path, logger=logger)
    try:
        logger.warning("hello from the helper")
        print("printed line")
        sys.stderr.write("a traceback line\n")
        for h in logger.handlers:
            h.flush()
        sys.stdout.flush()
        assert path == tmp_path / "logs" / "helper.log"
        assert "hello from the helper" in path.read_text(encoding="utf-8")
        console = (tmp_path / "logs" / "console.log").read_text(encoding="utf-8")
        assert "printed line" in console and "a traceback line" in console
        # the page polls the helper every few seconds: no log line per HTTP request to Ollama
        assert logging.getLogger("httpx").level == logging.getLogger("httpcore").level == logging.WARNING
    finally:
        for h in list(logger.handlers):
            logger.removeHandler(h)
            h.close()
        sys.stdout.close()


def test_stop_ends_other_helpers_and_only_our_portable_ollama(tmp_path):
    calls = []

    def run(args, **kw):
        calls.append((args, kw))
        return subprocess.CompletedProcess(args, 0, "", "")
    home = tmp_path / "O'Brien" / "ViTranslate"
    desktop.stop_running(home, run=run, pid=4321)
    (args, kw), = calls
    assert args[0] == "powershell" and "-NonInteractive" in args
    script = args[-1]
    assert "ViTranslate" in script and "4321" in script
    assert str(home / "ollama").replace("'", "''") + os.sep in script  # by folder: the user's own Ollama is spared
    assert "11434" not in script and "Stop-Process" in script and "Wait-Process" in script
    if os.name == "nt":
        assert kw["creationflags"] & 0x08000000


def test_a_second_start_exits_and_only_the_start_menu_opens_the_page(tmp_path, monkeypatch):
    served, opened = [], []
    monkeypatch.setattr(desktop, "acquire_instance", lambda name=desktop.MUTEX_NAME: None)
    monkeypatch.setattr(desktop, "find_running", lambda **kw: 47831)
    monkeypatch.setattr(desktop, "serve", lambda home, open_page: served.append(open_page))
    monkeypatch.setattr(desktop, "setup_logging", lambda home, logger=None: home / "logs" / "helper.log")
    monkeypatch.setattr(desktop.webbrowser, "open", opened.append)
    assert desktop.main(["vitranslate://start"], home=tmp_path) == 0 and opened == [] and served == []
    assert desktop.main(["--open"], home=tmp_path) == 0 and opened == ["http://127.0.0.1:47831/"] and served == []


def test_the_first_start_serves(tmp_path, monkeypatch):
    served = []
    monkeypatch.setattr(desktop, "acquire_instance", lambda name=desktop.MUTEX_NAME: object())
    monkeypatch.setattr(desktop, "find_running", lambda **kw: None)
    monkeypatch.setattr(desktop, "serve", lambda home, open_page: served.append((home, open_page)))
    monkeypatch.setattr(desktop, "setup_logging", lambda home, logger=None: home / "logs" / "helper.log")
    assert desktop.main(["--open"], home=tmp_path) == 0 and served == [(tmp_path, True)]


def test_stop_does_not_serve(tmp_path, monkeypatch):
    stopped, served = [], []
    monkeypatch.setattr(desktop, "stop_running", lambda home: stopped.append(home))
    monkeypatch.setattr(desktop, "stop_live", lambda: None)
    monkeypatch.setattr(desktop, "serve", lambda home, open_page: served.append(home))
    monkeypatch.setattr(desktop, "setup_logging", lambda home, logger=None: home / "logs" / "helper.log")
    assert desktop.main(["--stop"], home=tmp_path) == 0 and stopped == [tmp_path] and served == []
