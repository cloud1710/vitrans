"""Ollama chat client with an explicit device on every request, and a scripted fake for tests.

The device must always be explicit: without `num_gpu` Ollama reuses whatever runner is loaded (the 2026-10-13 spike
measured a 'GPU' run that silently ran on the CPU).

CPU speed-up (measured 2026-10-14, i5-13500, qwen3.5:9b, 12 real segments: 29.9 -> 11.9 s per segment). Qwen 3.5 is a
hybrid (recurrent) model, so Ollama's llama-server can resume a cached prompt only from a saved context checkpoint, and
it saves those n_batch tokens before the end of each prompt and at its end. With the default n_batch of 1024, every
segment re-read ~960 tokens of the ~1140-token system prompt that all segments of a job share: prefill was 71% of the
CPU time. Two CPU-only measures fix this:
- a smaller n_batch (CPU_NUM_BATCH) moves those checkpoints into the shared prefix;
- one raw request per system prompt whose whole prompt IS the shared prefix (the chat rendering up to the user text)
  leaves a checkpoint at its end, so each segment then reads only its own tokens. Best effort: a failed or mismatched
  prime only costs that one request, and the batch size alone still gives most of the gain.
The GPU path is unchanged (prefill there is fast).
The prime is Qwen's chat rendering, so it is sent for Qwen 3.5 only (PRIME_MODELS): Gemma 4 (the GPU default and the
fast draft, spec Amendment E) is never primed, also on the CPU, where it is not measured yet. Every request sends
"think": false: Gemma 4 E2B / E4B otherwise spend num_predict on thinking and answer empty (G1, 2026-10-14).
"""
import httpx

CPU_NUM_BATCH = 256
# Ollama's rendering of [system, user] for these models, up to the first token of the user text (checked 2026-10-14:
# a raw request with this rendering + user + assistant header hits the chat request's cache on every token)
PRIME_MODELS = ("qwen3.5",)
PRIME_START, PRIME_END = "<|im_start|>system\n", "<|im_end|>\n<|im_start|>user\n"


class LLMError(Exception):
    """Ollama could not answer."""


class OllamaLLM:
    def __init__(self, base_url, model, num_gpu, num_ctx=8192, timeout=900.0, keep_alive="10m", transport=None):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.num_gpu = num_gpu
        self.num_ctx = num_ctx
        self.keep_alive = keep_alive
        self.last_stats = {}
        self._primed = None
        self._client = httpx.Client(timeout=httpx.Timeout(timeout, connect=5.0), transport=transport)

    def _options(self, num_predict):
        options = {"temperature": 0, "num_ctx": self.num_ctx, "num_gpu": self.num_gpu, "num_predict": num_predict}
        if self.num_gpu == 0:
            options["num_batch"] = CPU_NUM_BATCH
        return options

    def _prime(self, system):
        """CPU only, once per system prompt: cache the shared prefix (see the module notes). Never raises."""
        if self.num_gpu != 0 or system == self._primed or not self.model.startswith(PRIME_MODELS):
            return
        self._primed = system
        body = {"model": self.model, "prompt": PRIME_START + system + PRIME_END, "raw": True, "stream": False,
                "keep_alive": self.keep_alive, "options": self._options(1)}
        try:
            self._client.post(self.base_url + "/api/generate", json=body)
        except httpx.HTTPError:
            pass  # the segments then read the whole prompt, as without priming

    def chat(self, system, user):
        self._prime(system)
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False,
            "think": False,
            "keep_alive": self.keep_alive,
            "options": self._options(min(4096, 64 + 2 * len(user))),
        }
        try:
            resp = self._client.post(self.base_url + "/api/chat", json=body)
        except httpx.HTTPError as exc:
            raise LLMError(str(exc)) from exc
        if resp.status_code >= 400:
            raise LLMError("HTTP %d: %s" % (resp.status_code, resp.text[:300]))
        try:
            data = resp.json()
            content = data["message"]["content"]
        except (ValueError, KeyError, TypeError) as exc:
            raise LLMError("bad Ollama reply: %s" % resp.text[:300]) from exc
        self.last_stats = {k: data.get(k, 0) for k in ("eval_count", "eval_duration", "prompt_eval_count",
                                                        "prompt_eval_duration")}
        if data.get("done_reason") == "length":
            return ""  # cut off at num_predict: unusable, the caller treats empty as a failure
        return content or ""

    def close(self):
        self._client.close()


def list_models(base_url, timeout=5.0, transport=None):
    """Model names known to Ollama, or None when Ollama is unreachable."""
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            resp = client.get(base_url.rstrip("/") + "/api/tags")
            resp.raise_for_status()
            models = resp.json().get("models") or []
            return [m.get("name", "") for m in models]
    except (httpx.HTTPError, ValueError, AttributeError, TypeError):
        return None


class FakeLLM:
    """Scripted replies (in order) or a reply function; records every call."""

    def __init__(self, replies=None, fn=None):
        self.replies = list(replies or [])
        self.fn = fn
        self.calls = []
        self.model = "fake"

    def chat(self, system, user):
        self.calls.append((system, user))
        if self.fn is not None:
            return self.fn(system, user)
        return self.replies.pop(0)
