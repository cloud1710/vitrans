"""Shared bits of the acceptance tools: repo path setup, the --fake LLM, the --device override, pack loading."""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "helper"))

from vitranslate import config, qa  # noqa: E402
from vitranslate import device as device_mod  # noqa: E402
from vitranslate.llm import FakeLLM, OllamaLLM  # noqa: E402
from vitranslate.packs import load_pack, merge_packs  # noqa: E402
from vitranslate.polish import EDITOR_HEAD  # noqa: E402
from vitranslate.registry import PackUnavailable, Registry  # noqa: E402
from vitranslate.tags import strip_tags  # noqa: E402

_SAME_OK = ("unchanged", "kept_code", "kept_english", "kept_reference", "english_left")


def _plain(tagged):
    return strip_tags(re.sub(r"<x\d+/>", " ", tagged))


def _squash(tagged):
    return re.sub(r"[\W_]+", "", _plain(tagged)).lower()


def is_silent_english(src_tagged, out_text, flags):
    """Output equals the source (case / space / punctuation insensitive, tags stripped) or carries English words
    copied from it (qa.english_copies: "Spleen, upper pole, partial resection --- <Vietnamese>",
    "Hepatocyte <Vietnamese>"), and no flag says so."""
    if any(f.split(":", 1)[0] in _SAME_OK for f in flags):
        return False
    s = _squash(src_tagged)
    return (s == _squash(out_text) and any(ch.isalnum() for ch in s)) \
        or bool(qa.english_copies(_plain(src_tagged), _plain(out_text)))


MARKER = " [fake]"
_TRANSLATE = "Translate:\n"
_EDITOR_START = EDITOR_HEAD.split("(")[0]


def _is_editor(system):
    return system.startswith(_EDITOR_START)


class CallRecorder:
    """Wraps an LLM: per call, the phase (translate / polish, from the system prompt), characters sent and received
    and Ollama's token counts and durations (0 for a fake)."""

    def __init__(self, llm):
        self.llm = llm
        self.calls = []

    def chat(self, system, user):
        t0 = time.time()
        answer = self.llm.chat(system, user)
        stats = getattr(self.llm, "last_stats", {}) or {}
        self.calls.append({"phase": "polish" if _is_editor(system) else "translate", "user_chars": len(user),
                           "answer_chars": len(answer), "prompt_tokens": stats.get("prompt_eval_count", 0),
                           "answer_tokens": stats.get("eval_count", 0),
                           "prompt_ns": stats.get("prompt_eval_duration", 0), "answer_ns": stats.get("eval_duration", 0),
                           "seconds": time.time() - t0})
        return answer

    def totals(self):
        out = {}
        for call in self.calls:
            t = out.setdefault(call["phase"], {"calls": 0, "user_chars": 0, "answer_chars": 0, "prompt_tokens": 0,
                                               "answer_tokens": 0, "prompt_ns": 0, "answer_ns": 0, "seconds": 0.0})
            t["calls"] += 1
            for k in ("user_chars", "answer_chars", "prompt_tokens", "answer_tokens", "prompt_ns", "answer_ns",
                      "seconds"):
                t[k] += call[k]
        return out

    def close(self):
        if hasattr(self.llm, "close"):
            self.llm.close()


def fake_reply(system, user):
    """Echo of the segment text (what follows 'Translate:' or the span-phrase prompt) plus a marker; for the editor
    pass, every VI draft back unchanged."""
    if _is_editor(system):
        out, n = [], 0
        for line in user.splitlines():
            m = re.match(r"\[(\d+)\] EN: ", line)
            if m:
                n = int(m.group(1))
            elif line.startswith("VI: ") and n:
                out.append("[%d] %s" % (n, line[4:]))
        return "\n".join(out)
    if _TRANSLATE in user:
        text = user.rsplit(_TRANSLATE, 1)[1]
    else:
        text = user.split("\n", 1)[1] if "\n" in user else user
    return text.rstrip() + MARKER


def make_fake():
    return FakeLLM(fn=fake_reply)


def pick_device(mode):
    """auto = probe (nvidia-smi + Ollama VRAM); cpu / gpu force the choice."""
    if mode == "cpu":
        return device_mod.Device("cpu", "CPU (forced)", 0, 0)
    if mode == "gpu":
        return device_mod.Device("gpu", "GPU (forced)", 0, 999)
    return device_mod.probe()


def make_llm(fake, dev, model):
    if fake:
        return make_fake()
    return OllamaLLM(config.ollama_url(), model, num_gpu=dev.num_gpu)


def _load_one(pack_id, from_dir, log):
    """(Pack, source text, parent id) of one pack, registry first unless from_dir."""
    if not from_dir:
        reg = Registry(config.registry_source(), config.app_home())
        entry = next((e for e in reg.manifest()["packs"] if e.get("id") == pack_id), None)
        if entry is not None:
            try:
                return (load_pack(reg.ensure(entry)), "registry %s (%s)" % (reg.source, entry.get("version")),
                        entry.get("parent"))
            except PackUnavailable as exc:
                log("registry pack unavailable (%s); falling back to packs/%s" % (exc, pack_id))
    meta = json.loads((ROOT / "packs" / pack_id / "pack.json").read_text(encoding="utf-8"))
    return load_pack(ROOT / "packs", pack_id), "dir packs/%s" % pack_id, meta.get("parent")


def load_domain_pack(pack_id, from_dir=False, log=print, family=False):
    """(Pack, source text): from the registry (dev registry out/registry or VITRANSLATE_REGISTRY) when it lists the
    id, else directly from packs/<id>. from_dir forces packs/<id>. family: the pack merged with its parent chain,
    child first -- the merge order of a job (matching.families) -- so a child's tests see the parent's rows and term
    fixes; the merged tests are the child's, then the parent's."""
    pack, source, parent = _load_one(pack_id, from_dir, log)
    if not family:
        return pack, source
    packs, sources, seen = [pack], [source], {pack_id}
    while parent and parent not in seen:
        seen.add(parent)
        p, s, parent_next = _load_one(parent, from_dir, log)
        packs.append(p)
        sources.append(s)
        parent = parent_next
    return merge_packs(packs), " + ".join(sources)
