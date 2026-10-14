from types import SimpleNamespace

import httpx

from vitranslate.device import ollama_vram_mb, probe


def fake_run(stdout, code=0):
    def run(cmd, **kwargs):
        return SimpleNamespace(returncode=code, stdout=stdout)
    return run


def none():
    return 0


def test_gpu_when_enough_free_memory():
    dev = probe(run=fake_run("NVIDIA GeForce RTX 5080, 14500\n"), ps=none)
    assert (dev.kind, dev.num_gpu, dev.free_mb) == ("gpu", 999, 14500)


def test_cpu_when_gpu_busy_or_missing():
    assert probe(run=fake_run("NVIDIA GeForce RTX 5080, 2000\n"), ps=none).kind == "cpu"
    assert probe(run=fake_run("", code=9), ps=none).num_gpu == 0

    def missing(cmd, **kwargs):
        raise FileNotFoundError("nvidia-smi")
    assert probe(run=missing, ps=none).kind == "cpu"


def test_vram_held_by_ollama_counts_as_free():
    dev = probe(run=fake_run("NVIDIA GeForce RTX 5080, 2000\n"), ps=lambda: 9000)
    assert (dev.kind, dev.free_mb) == ("gpu", 11000)


def test_gpu_name_with_comma_and_ps_lookup():
    dev = probe(run=fake_run("NVIDIA RTX, Super Edition, 14500\n"), ps=none)
    assert dev.name == "NVIDIA RTX, Super Edition" and dev.free_mb == 14500

    def handler(request):
        return httpx.Response(200, json={"models": [{"size_vram": 3 * 1024 * 1024 * 1024}, {"size_vram": 0}]})
    assert ollama_vram_mb("http://x", transport=httpx.MockTransport(handler)) == 3072

    def down(request):
        raise httpx.ConnectError("down")
    assert ollama_vram_mb("http://x", transport=httpx.MockTransport(down)) == 0


def test_min_free_margin_for_other_gpu_users():
    from vitranslate.config import GPU_MIN_FREE_MB
    assert GPU_MIN_FREE_MB == 9000
    assert probe(run=fake_run("NVIDIA GeForce RTX 5080, 8500\n"), ps=none).kind == "cpu"
