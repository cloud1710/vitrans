"""The helper's sentence-level routes POST /api/v1/classify and POST /api/v1/translate (sentence_api.py): the cloud
API's request and response JSON (functions/_lib/api.js) without the session and quota fields, run by the helper's own
core with the local model. Parity with the cloud goes through tests/functions/fixtures/helper_parity.json: the cloud's
parity test replays it through the Functions, this file through the helper's routes."""
import hashlib
import json

import pytest
from fastapi.testclient import TestClient

from packutil import REAL_PACKS, build
from vitranslate.config import REPO_ROOT
from vitranslate.device import Device
from vitranslate.llm import LLMError
from vitranslate.registry import Registry
from vitranslate.server import create_app
from test_server import FakeCalibrator, FakePull, FakeScanner

FIX = json.loads((REPO_ROOT / "tests" / "functions" / "fixtures" / "helper_parity.json").read_text(encoding="utf-8"))
RESULT_KEYS = {"id", "text", "level", "flags", "fixes", "cached", "reduced", "spans"}  # functions/_lib/engine.js
EVENT_KEYS = {"stage", "offline", "unavailable", "packs", "candidates"}
GPU = Device("gpu", "RTX", 14000, 999)
ORIGIN = "https://vitrans.pages.dev"


@pytest.fixture(scope="session")
def real_registry(tmp_path_factory):
    """A registry of every committed non-draft pack, as tests/functions/export_helper_parity.py builds it."""
    root = tmp_path_factory.mktemp("real-registry")
    build(REAL_PACKS, root / "registry")
    return root / "registry"


class Replay:
    """A model replaying the parity fixture: per segment source, its scripted replies in call order, then its default
    answer; every call kept (system, user)."""

    def __init__(self, doc):
        self.by_src = {s["tagged"]: {"replies": list(s["replies"]), "default": s["default"], "n": 0}
                       for s in doc["segments"]}
        self.calls = []

    def source(self, user):
        return user.rsplit("Translate:\n", 1)[1]

    def chat(self, system, user):
        self.calls.append((system, user))
        st = self.by_src[self.source(user)]
        reply = st["replies"][st["n"]] if st["n"] < len(st["replies"]) else st["default"]
        st["n"] += 1
        return reply


class Scripted:
    def __init__(self, fn):
        self.fn, self.calls = fn, []

    def chat(self, system, user):
        self.calls.append((system, user))
        return self.fn(system, user)


def app_client(tmp_path, registry_dir, llm=None, models=lambda: ["gemma4:e4b", "qwen3.5:9b"]):
    web = tmp_path / "web"
    web.mkdir(exist_ok=True)
    (web / "index.html").write_text("<!doctype html><title>t</title>", encoding="utf-8")
    made = []

    def factory(dev, model):
        made.append((dev.kind, model))
        return llm

    app = create_app(web_root=web, probe=lambda: GPU, models=models,
                     registry=Registry(registry_dir, tmp_path / "home"), refresh_every=None,
                     scanner=FakeScanner(), calibrator=FakeCalibrator(), pull=FakePull(), start_hardware=False,
                     llm_factory=factory)
    c = TestClient(app, base_url="http://127.0.0.1")
    c.made = made
    return c


def setup_id(setup):
    canon = json.dumps({"packs": [[p["id"], p["version"]] for p in setup["packs"]], "hits": setup["hits"]},
                       separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


@pytest.mark.parametrize("doc", FIX["documents"], ids=[d["name"] for d in FIX["documents"]])
def test_parity_with_the_fixture_through_the_routes(tmp_path, real_registry, doc):
    llm = Replay(doc)
    c = app_client(tmp_path, real_registry, llm)
    r = c.post("/api/v1/classify", json={"text": doc["full_text"]})
    assert r.status_code == 200, r.text
    body = r.json()
    setup, sid = body.pop("setup"), body.pop("setup_id")
    assert set(body) == EVENT_KEYS
    assert all(isinstance(p["version"], str) for p in body["packs"])  # each pack with its version, as the cloud's
    assert dict(body, packs=[{k: v for k, v in p.items() if k != "version"} for p in body["packs"]]) == doc["classify"]
    assert setup["hits"] == [h[0] for h in doc["hits"]]
    assert setup["packs"] == [{"id": p["id"], "version": p["version"]} for p in body["packs"]]
    assert sid == setup_id(setup)
    segs = [{"id": s["id"], "tagged": s["tagged"], "essential": s["essential"], "prev": s["prev"], "nxt": s["nxt"],
             "where": s["where"]} for s in doc["segments"]]
    batches = [segs[:4], segs[4:]] if len(segs) > 4 else [segs]
    results = []
    for batch in batches:
        r = c.post("/api/v1/translate", json={"job_id": "parity", "setup": setup, "setup_id": sid, "segments": batch})
        assert r.status_code == 200, r.text
        assert set(r.json()) == {"results"}  # no usage / quota on the machine
        results += r.json()["results"]
    assert all(system == doc["system"] for system, _ in llm.calls)
    assert [u for _, u in llm.calls] == [k["user"] for s in doc["segments"] for k in s["calls"]]
    for res, s in zip(results, doc["segments"]):
        assert set(res) == RESULT_KEYS
        assert res["id"] == s["id"]
        want = s["result"]
        assert (res["text"], res["level"], res["flags"], res["fixes"], res["reduced"]) == \
            (want["text"], want["level"], want["flags"], want["fixes"], want["reduced"])
        assert res["cached"] is False  # no translation memory: nothing of the text is kept
    assert c.made and c.made[0] == ("gpu", "gemma4:e4b")  # the local model of this device


def test_setup_id_is_the_clouds():
    # functions/_lib/engine.js setupIdOf gives this value for this setup (tests/functions/engine.test.mjs checks it)
    from vitranslate.sentence_api import setup_id_of
    setup = {"packs": [{"id": "pathology", "version": "0.2.0"}], "hits": ["margin", "lymph node", "u\u1ed1ng"]}
    assert setup_id_of(setup) == "07eb82859996fe827bba19842d289ff6f8294961f0369958a7c8a42086887dfe"


def test_classify_photo_names_its_pack(tmp_path, real_registry):
    c = app_client(tmp_path, real_registry, Scripted(lambda s, u: "x"))
    text = "DIGITAL PATHOLOGY\nScanner calibration"
    file_ = c.post("/api/v1/classify", json={"text": text}).json()
    photo = c.post("/api/v1/classify", json={"text": text, "profile": "photo"}).json()
    assert file_["setup"]["packs"] == []
    assert [p["id"] for p in photo["setup"]["packs"]][:1] == ["pathology"]
    assert photo["packs"][0]["reason"] == "detect"


def test_classify_domain_and_shape_checks(tmp_path, real_registry):
    c = app_client(tmp_path, real_registry, Scripted(lambda s, u: "x"))
    r = c.post("/api/v1/classify", json={"text": "Short text.", "domain": ["pathology"]})
    assert r.status_code == 200 and r.json()["packs"][0]["reason"] == "user"
    for body in ({"text": "a", "session": "token"},  # no session on the machine: the page never sends one here
                 {"text": 3}, {"text": "a", "domain": ["Bad Id"]}, {"text": "a", "profile": "live"}, [1]):
        r = c.post("/api/v1/classify", json=body)
        assert r.status_code == 400 and r.json()["code"] == "bad_request", body


def wire_setup(c, text="The tumour shows a clear margin and a lymph node."):
    body = c.post("/api/v1/classify", json={"text": text}).json()
    return body["setup"], body["setup_id"]


def test_translate_checks_like_the_cloud(tmp_path, real_registry):
    c = app_client(tmp_path, real_registry, Scripted(lambda s, u: "Ban dich."))
    setup, sid = wire_setup(c)
    seg = {"id": 1, "tagged": "The margin is clear."}
    ok = {"job_id": "j1", "setup": setup, "segments": [seg]}
    assert c.post("/api/v1/translate", json=ok).status_code == 200
    bad = [dict(ok, session="t"), dict(ok, job_id="bad id!"), dict(ok, setup_id="0" * 64),
           dict(ok, segments=[seg] * 2), dict(ok, segments=[dict(seg, id=k) for k in range(21)]),
           dict(ok, segments=[dict(seg, extra=1)]), dict(ok, profile="other"), {k: v for k, v in ok.items() if k != "setup"},
           dict(ok, setup={"packs": setup["packs"], "hits": ["not a glossary key"]})]
    for body in bad:
        r = c.post("/api/v1/translate", json=body)
        assert r.status_code == 400 and r.json()["code"] == "bad_request", body
    r = c.post("/api/v1/translate", json=dict(ok, setup={"packs": [{"id": "pathology", "version": "9.9.9"}], "hits": []}))
    assert r.status_code == 409 and r.json()["code"] == "packs_changed"
    r = c.post("/api/v1/translate", json=dict(ok, segments=[dict(seg, tagged="x" * 10001)]))
    assert r.status_code == 413 and r.json()["code"] == "too_large"
    # the live profile: sentences with the previous one as context (no term repair on the machine)
    r = c.post("/api/v1/translate", json={"job_id": "live-abc", "profile": "live", "setup": {"packs": [], "hits": []},
                                          "segments": [{"id": "s1", "tagged": "Good morning everyone.", "prev": "Hi."}]})
    assert r.status_code == 200 and r.json()["results"][0]["text"] == "Ban dich."


def test_translate_reduces_essential_spans_from_the_wire(tmp_path, real_registry):
    calls = []

    def answer(system, user):
        calls.append(user)
        return "Mot <g2>hai</g2> ba."  # keeps only the essential span: right for the reduced text

    c = app_client(tmp_path, real_registry, Scripted(answer))
    tagged = "<g1>" + "One</g1> <g2>two</g2> three." + "".join(" <g%d>w</g%d>" % (n, n) for n in range(3, 15))
    r = c.post("/api/v1/translate", json={"job_id": "j", "setup": {"packs": [], "hits": []},
                                          "segments": [{"id": "a", "tagged": tagged, "essential": [2]}]})
    res = r.json()["results"][0]
    assert res["reduced"] is True and res["spans"] == [2] and res["level"] == 3


def test_model_failure_and_missing_model(tmp_path, real_registry, monkeypatch):
    from vitranslate import sentence_api
    monkeypatch.setattr(sentence_api, "RETRY_DELAY", 0)  # one retry after RETRY_DELAY, as run_job

    def fail(system, user):
        raise LLMError("boom")

    c = app_client(tmp_path, real_registry, Scripted(fail))
    body = {"job_id": "j", "setup": {"packs": [], "hits": []},
            "segments": [{"id": 1, "tagged": "The margin is clear and the tumour is small."}]}
    r = c.post("/api/v1/translate", json=body)
    assert r.status_code == 502 and r.json()["code"] == "model_error"
    c = app_client(tmp_path, real_registry, Scripted(lambda s, u: "x"), models=lambda: None)
    r = c.post("/api/v1/translate", json=body)
    assert r.status_code == 503 and r.json()["code"] == "ollama_unavailable"
    c = app_client(tmp_path, real_registry, Scripted(lambda s, u: "x"), models=lambda: ["qwen3.5:9b"])
    r = c.post("/api/v1/translate", json=body)
    assert r.status_code == 503 and r.json()["code"] == "model_missing"


def test_origin_guard_and_cors(tmp_path, real_registry):
    c = app_client(tmp_path, real_registry, Scripted(lambda s, u: "Ban dich."))
    r = c.post("/api/v1/classify", json={"text": "a"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    r = c.post("/api/v1/classify", json={"text": "a"}, headers={"Origin": ORIGIN})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == ORIGIN
    r = c.options("/api/v1/translate", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST",
                                               "Access-Control-Request-Headers": "content-type",
                                               "Access-Control-Request-Private-Network": "true"})
    assert r.status_code == 200 and r.headers.get("access-control-allow-private-network") == "true"
    r = c.options("/api/v1/translate", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers
