"""tools/corpus_fetch.py (K10): the counted, paced, cached downloader for pack miners. No real network: every test
passes an httpx.MockTransport and a fake clock."""
import hashlib
import json

import httpx
import pytest

from packutil import build_registry  # noqa: F401  (puts tools/ on sys.path)

import corpus_fetch

PDF = b"%PDF-1.4 test"


class Clock:
    """Fake wall clock; sleep() advances it and records the waits."""

    def __init__(self, t=1_000_000.0):
        self.t, self.waits = t, []

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.waits.append(round(s, 3))
        self.t += s


class Server:
    """MockTransport handler: status per URL (default 200 + PDF), every request recorded."""

    def __init__(self, status=None, raise_for=None):
        self.status, self.raise_for, self.seen = status or {}, raise_for or {}, []

    def __call__(self, request):
        url = str(request.url)
        self.seen.append(url)
        if url in self.raise_for:
            raise self.raise_for[url]
        code = self.status.get(url, 200)
        if code in (301, 302):
            return httpx.Response(code, headers={"location": url + "/moved"})
        return httpx.Response(code, content=PDF if code == 200 else b"no",
                              headers={"content-type": "application/pdf"})


def fetcher(tmp_path, server, clock=None, **kw):
    clock = clock or Clock()
    return corpus_fetch.Fetcher(tmp_path / "corpus", transport=httpx.MockTransport(server), clock=clock,
                                sleep=clock.sleep, log=lambda line: None, **kw)


def manifest(tmp_path):
    lines = (tmp_path / "corpus" / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines]


def test_fetch_saves_the_file_and_logs_it(tmp_path):
    server = Server()
    url = "https://tapchinghiencuuyhoc.vn/index.php/a/download/1.pdf"
    assert fetcher(tmp_path, server).run([url]) == 0
    (rec,) = manifest(tmp_path)
    path = tmp_path / "corpus" / rec["path"]
    assert path.read_bytes() == PDF and path.parent.name == "tapchinghiencuuyhoc.vn" and path.suffix == ".pdf"
    assert path.stem == hashlib.sha1(url.encode("utf-8")).hexdigest()
    assert rec["url"] == url and rec["status"] == 200 and rec["size"] == len(PDF)
    assert rec["sha256"] == hashlib.sha256(PDF).hexdigest() and rec["date"] and rec["run"] == "default"
    counter = json.loads((tmp_path / "corpus" / "counter.json").read_text(encoding="utf-8"))
    assert counter["runs"]["default"]["total"] == 1
    assert counter["runs"]["default"]["hosts"] == {"tapchinghiencuuyhoc.vn": 1}


def test_cache_hit_makes_no_request(tmp_path):
    server = Server()
    url = "https://vjs.ac.vn/a.pdf"
    fetcher(tmp_path, server).run([url])
    f = fetcher(tmp_path, server)
    assert f.fetch(url).status == "cached" and server.seen == [url]  # also from a new invocation
    assert len(manifest(tmp_path)) == 1


def test_three_seconds_between_requests_to_one_host_also_across_runs(tmp_path):
    clock, server = Clock(), Server()
    f = fetcher(tmp_path, server, clock=clock)
    f.run(["https://a.vn/1.pdf", "https://b.vn/1.pdf", "https://a.vn/2.pdf"])
    assert clock.waits == [3.0]  # b.vn needed no wait; a.vn waited for its own previous request
    clock.t += 1.0
    fetcher(tmp_path, server, clock=clock).run(["https://a.vn/3.pdf"])  # a new invocation one second later
    assert clock.waits == [3.0, 2.0]
    fetcher(tmp_path, server, clock=clock).run(["https://vjol.info.vn/x.pdf", "https://vjol.info.vn/y.pdf"])
    assert clock.waits[-1] == 5.0  # VJOL asks for 5 s


def test_per_host_cap_skips_the_host_and_persists(tmp_path):
    server = Server()
    urls = ["https://a.vn/%d.pdf" % i for i in range(3)] + ["https://b.vn/1.pdf"]
    assert fetcher(tmp_path, server, max_per_host=2).run(urls) == 2
    assert server.seen == urls[:2] + urls[3:]
    assert fetcher(tmp_path, server, max_per_host=2).run(["https://a.vn/9.pdf"]) == 2  # counts persist in the run
    assert fetcher(tmp_path, server, max_per_host=2, run="wave2").run(["https://a.vn/9.pdf"]) == 0
    assert server.seen[-1] == "https://a.vn/9.pdf"


def test_global_cap_per_run(tmp_path):
    server = Server()
    urls = ["https://a.vn/1.pdf", "https://b.vn/1.pdf", "https://c.vn/1.pdf"]
    assert fetcher(tmp_path, server, max_total=2).run(urls) == 2
    assert server.seen == urls[:2]


@pytest.mark.parametrize("url", ["https://tapchiyhocvietnam.vn/index.php/vmj/article/download/1/2",
                                 "https://www.msdmanuals.com/vi/professional", "http://thuvienphapluat.vn/van-ban",
                                 "https://icd.kcb.vn/icd-10"])
def test_deny_list_is_never_requested(tmp_path, url):
    server = Server()
    f = fetcher(tmp_path, server)
    assert f.fetch(url).status == "denied" and server.seen == []
    assert not corpus_fetch.denied("https://notmsdmanuals.com/x") and corpus_fetch.denied("https://MSDManuals.com/x")


@pytest.mark.parametrize("trouble", ["429", "403", "reset", "refused", "timeout"])
def test_first_429_403_or_reset_stops_the_whole_run(tmp_path, trouble, capsys):
    bad = "https://vjol.info.vn/bad.pdf"
    errors = {"reset": httpx.ReadError("connection reset by peer"),
              "refused": httpx.ConnectError("connection refused"), "timeout": httpx.ReadTimeout("timed out")}
    server = Server(status={bad: int(trouble)} if trouble.isdigit() else {},
                    raise_for={bad: errors[trouble]} if trouble in errors else {})
    clock = Clock()
    f = corpus_fetch.Fetcher(tmp_path / "corpus", transport=httpx.MockTransport(server), clock=clock,
                             sleep=clock.sleep)
    assert f.run(["https://a.vn/1.pdf", bad, "https://b.vn/1.pdf"]) == 3
    assert server.seen == ["https://a.vn/1.pdf", bad]  # nothing after the first trouble
    out = capsys.readouterr().out
    assert out.isascii() and "STOP" in out and "vjol.info.vn" in out
    # the run stays stopped for every later invocation; a new run still refuses the blocked host
    assert fetcher(tmp_path, server).run(["https://c.vn/1.pdf"]) == 3 and "https://c.vn/1.pdf" not in server.seen
    assert fetcher(tmp_path, server, run="wave2").fetch("https://vjol.info.vn/other.pdf").status == "blocked"
    assert fetcher(tmp_path, server, run="wave2").run(["https://c.vn/1.pdf"]) == 0


def test_other_errors_are_logged_and_the_run_goes_on(tmp_path):
    server = Server(status={"https://a.vn/missing.pdf": 404, "https://a.vn/old": 302})
    assert fetcher(tmp_path, server).run(["https://a.vn/missing.pdf", "https://a.vn/old", "https://b.vn/1.pdf"]) == 0
    recs = manifest(tmp_path)
    assert [r["status"] for r in recs] == [404, 302, 200]
    assert recs[1]["location"] == "https://a.vn/old/moved" and "https://a.vn/old/moved" not in server.seen
    assert recs[0]["path"] is None and recs[0]["sha256"] is None


def test_one_process_at_a_time(tmp_path):
    clock, server = Clock(), Server()
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / ".lock").write_text("123 %f\n" % clock.t, encoding="ascii")
    assert fetcher(tmp_path, server, clock=clock).run(["https://a.vn/1.pdf"]) == 3 and server.seen == []
    clock.t += corpus_fetch.STALE_LOCK + 1  # a lock left by a crashed run is taken over after a while
    assert fetcher(tmp_path, server, clock=clock).run(["https://a.vn/1.pdf"]) == 0
    assert not (corpus / ".lock").exists()


def test_cli(tmp_path, capsys):
    urls = tmp_path / "urls.txt"
    urls.write_text("# wave 1\nhttps://a.vn/1.pdf\n\nhttps://tapchiyhocvietnam.vn/x\n", encoding="utf-8")
    server, clock = Server(), Clock()
    code = corpus_fetch.main(["--urls", str(urls), "--corpus", str(tmp_path / "c"), "--run", "wave1",
                              "--max-per-host", "5", "--max-total", "9", "--delay", "4"],
                             transport=httpx.MockTransport(server), clock=clock, sleep=clock.sleep)
    out = capsys.readouterr().out
    assert code == 0 and out.isascii() and "denied" in out and server.seen == ["https://a.vn/1.pdf"]
    assert corpus_fetch.DEFAULT_CORPUS == "D:/vitranslate-corpus"
    with pytest.raises(SystemExit):  # never faster than 3 s per host
        corpus_fetch.main(["https://a.vn/2.pdf", "--corpus", str(tmp_path / "c"), "--delay", "1"],
                          transport=httpx.MockTransport(server), clock=clock, sleep=clock.sleep)
    assert server.seen == ["https://a.vn/1.pdf"]
