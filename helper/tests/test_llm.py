import json

import httpx
import pytest

from vitranslate.llm import CPU_NUM_BATCH, FakeLLM, LLMError, OllamaLLM, list_models


def test_ollama_chat_sends_explicit_device_and_no_thinking():
    seen = {}

    def handler(request):
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "xin ch\u00e0o"}, "eval_count": 3,
                                         "eval_duration": 1000})

    llm = OllamaLLM("http://x", "qwen3.5:9b", num_gpu=0, transport=httpx.MockTransport(handler))
    assert llm.chat("sys", "user") == "xin ch\u00e0o"
    assert seen["think"] is False and seen["stream"] is False
    assert seen["options"]["num_gpu"] == 0 and seen["options"]["temperature"] == 0
    assert [m["role"] for m in seen["messages"]] == ["system", "user"]


def test_ollama_error_is_wrapped():
    llm = OllamaLLM("http://x", "m", num_gpu=999,
                    transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    with pytest.raises(LLMError):
        llm.chat("s", "u")


def test_list_models():
    def handler(request):
        return httpx.Response(200, json={"models": [{"name": "qwen3.5:9b"}, {"name": "qwen3.5:4b"}]})
    assert list_models("http://x", transport=httpx.MockTransport(handler)) == ["qwen3.5:9b", "qwen3.5:4b"]
    def down(request):
        raise httpx.ConnectError("down")
    assert list_models("http://x", transport=httpx.MockTransport(down)) is None


def test_fake_llm():
    fake = FakeLLM(["a", "b"])
    assert fake.chat("s", "u1") == "a" and fake.chat("s", "u2") == "b"
    assert fake.calls[1] == ("s", "u2")
    assert FakeLLM(fn=lambda s, u: u.upper()).chat("s", "x") == "X"


def _llm(handler, **kw):
    return OllamaLLM("http://x", "m", num_gpu=0, transport=httpx.MockTransport(handler), **kw)


def test_num_predict_is_capped_estimate_and_length_returns_empty():
    seen = {}

    def handler(request):
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "partial"}, "done_reason": "length"})

    llm = _llm(handler)
    assert llm.chat("s" * 30, "u" * 30) == ""
    assert seen["options"]["num_predict"] == 64 + 2 * 30
    llm.chat("s" * 9000, "u")
    assert seen["options"]["num_predict"] == 66
    llm.chat("s", "u" * 3000)
    assert seen["options"]["num_predict"] == 4096


def test_bad_json_and_null_message_are_llm_errors():
    with pytest.raises(LLMError):
        _llm(lambda r: httpx.Response(200, text="not json")).chat("s", "u")
    with pytest.raises(LLMError):
        _llm(lambda r: httpx.Response(200, json={"message": None})).chat("s", "u")
    with pytest.raises(LLMError) as exc:
        _llm(lambda r: httpx.Response(404, json={"error": "model 'x' not found"})).chat("s", "u")
    assert "not found" in str(exc.value)


def test_last_stats_carry_prompt_and_answer_token_counts():
    reply = {"message": {"content": "a"}, "eval_count": 7, "eval_duration": 70, "prompt_eval_count": 120,
             "prompt_eval_duration": 30}
    llm = _llm(lambda r: httpx.Response(200, json=reply))
    llm.chat("s", "u")
    assert llm.last_stats == {"eval_count": 7, "eval_duration": 70, "prompt_eval_count": 120,
                              "prompt_eval_duration": 30}


def test_close():
    llm = _llm(lambda r: httpx.Response(200, json={"message": {"content": "a"}}))
    llm.close()


def _recorder(reply=None):
    calls = []

    def handler(request):
        calls.append((request.url.path, json.loads(request.content)))
        if reply is not None:
            return reply(request)
        return httpx.Response(200, json={"message": {"content": "xin chao"}, "response": "x"})
    return calls, handler


def test_cpu_requests_use_small_batches_gpu_requests_do_not():
    calls, handler = _recorder()
    _llm(handler).chat("s", "u")
    assert calls[-1][0] == "/api/chat" and calls[-1][1]["options"]["num_batch"] == CPU_NUM_BATCH == 256
    calls.clear()
    OllamaLLM("http://x", "qwen3.5:9b", num_gpu=999, transport=httpx.MockTransport(handler)).chat("s", "u")
    assert [path for path, _ in calls] == ["/api/chat"] and "num_batch" not in calls[0][1]["options"]


def test_cpu_primes_the_shared_system_prefix_once_per_system_prompt():
    calls, handler = _recorder()
    llm = OllamaLLM("http://x", "qwen3.5:9b", num_gpu=0, transport=httpx.MockTransport(handler))
    assert llm.chat("SYS", "u1") == "xin chao"
    llm.chat("SYS", "u2")
    llm.chat("OTHER", "u3")
    assert [path for path, _ in calls] == ["/api/generate", "/api/chat", "/api/chat", "/api/generate", "/api/chat"]
    prime, chat = calls[0][1], calls[1][1]
    assert prime["raw"] is True and prime["stream"] is False and "think" not in prime
    assert prime["prompt"] == "<|im_start|>system\nSYS<|im_end|>\n<|im_start|>user\n"
    assert calls[3][1]["prompt"] == "<|im_start|>system\nOTHER<|im_end|>\n<|im_start|>user\n"
    # the load-time options match the chat requests (any difference would reload the model); one token to generate
    assert {k: v for k, v in prime["options"].items() if k != "num_predict"} == \
        {k: v for k, v in chat["options"].items() if k != "num_predict"}
    assert prime["options"]["num_predict"] == 1
    assert prime["keep_alive"] == chat["keep_alive"] and prime["model"] == chat["model"] == "qwen3.5:9b"


def test_gpu_and_unverified_templates_are_never_primed():
    calls, handler = _recorder()
    OllamaLLM("http://x", "qwen3.5:9b", num_gpu=999, transport=httpx.MockTransport(handler)).chat("s", "u")
    OllamaLLM("http://x", "llama3:8b", num_gpu=0, transport=httpx.MockTransport(handler)).chat("s", "u")
    assert [path for path, _ in calls] == ["/api/chat", "/api/chat"]


def test_gemma_is_never_primed_even_on_the_cpu_and_thinking_is_always_off():
    from vitranslate import config
    calls, handler = _recorder()
    for model in (config.MODEL_DEFAULT_GPU, config.MODEL_FAST):  # gemma4:e4b, gemma4:e2b
        OllamaLLM("http://x", model, num_gpu=0, transport=httpx.MockTransport(handler)).chat("s", "u")
    assert [path for path, _ in calls] == ["/api/chat", "/api/chat"]  # the prime is Qwen's chat rendering
    assert [body["model"] for _, body in calls] == ["gemma4:e4b", "gemma4:e2b"]
    assert all(body["think"] is False for _, body in calls)  # Gemma 4 thinks by default and then answers empty


def test_a_failed_prime_never_fails_the_translation_and_is_not_repeated():
    def reply(request):
        if request.url.path == "/api/generate":
            return httpx.Response(500, text="boom")
        return httpx.Response(200, json={"message": {"content": "a"}})
    calls, handler = _recorder(reply)
    llm = OllamaLLM("http://x", "qwen3.5:4b", num_gpu=0, transport=httpx.MockTransport(handler))
    assert llm.chat("s", "u") == "a" and llm.chat("s", "u2") == "a"
    assert [path for path, _ in calls] == ["/api/generate", "/api/chat", "/api/chat"]

    def slow(request):
        if request.url.path == "/api/generate":
            raise httpx.ReadTimeout("slow")
        return httpx.Response(200, json={"message": {"content": "b"}})
    assert OllamaLLM("http://x", "qwen3.5:9b", num_gpu=0, transport=httpx.MockTransport(slow)).chat("s", "u") == "b"


def test_list_models_null_and_bad_json():
    assert list_models("http://x", transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"models": None}))) == []
    assert list_models("http://x", transport=httpx.MockTransport(lambda r: httpx.Response(200, text="<html>"))) is None
