"""Paths, ports and defaults.

Overridable by environment variable: app home (VITRANSLATE_HOME), Ollama URL (VITRANSLATE_OLLAMA), pack registry
(VITRANSLATE_REGISTRY: https URL or local folder), bundled style pack (VITRANSLATE_STYLE) and web dir
(VITRANSLATE_WEB). Everything else here (ports, model names, limits) is a constant.
"""
import os
import sys
from pathlib import Path

APP_NAME = "ViTranslate"
VERSION = "0.1.0"
PORTS = tuple(range(47831, 47836))
REPO_ROOT = Path(__file__).resolve().parents[2]
# Model roles (spec Amendment E, G1 evaluation docs/eval/2026-10-14-gemma4-vs-qwen35.md): Gemma 4 E4B when the GPU
# fits it, Qwen 3.5 9B on the CPU until Gemma is measured there, Gemma 4 E2B as the fast draft on either device.
# Thinking is always off (llm.py); the translation memory key includes the model.
MODEL_DEFAULT_GPU = "gemma4:e4b"
MODEL_DEFAULT_CPU = "qwen3.5:9b"
MODEL_FAST = "gemma4:e2b"
MODELS = (MODEL_DEFAULT_GPU, MODEL_DEFAULT_CPU, MODEL_FAST)
# set for the 9b (6.6 GB + KV cache + 1.5 GB margin: another GPU application may hold ~8 GB of a 16 GB GPU); kept for
# gemma4:e4b (4.9 GB loaded with an 8k context, G1), so it errs on the safe side until a smaller GPU is measured
GPU_MIN_FREE_MB = 9000
MAX_UPLOAD_MB = 200
# the published page (production deployment only; preview deployments get other hostnames and are not allowed)
WEB_ORIGIN = "https://vitrans.pages.dev"

ALLOWED_ORIGINS = (
    ["http://127.0.0.1:%d" % p for p in PORTS]
    + ["http://localhost:%d" % p for p in PORTS]
    + [WEB_ORIGIN]
)


def default_model(kind) -> str:
    """The model a job uses on a device ("gpu" / "cpu") without the fast-draft option."""
    return MODEL_DEFAULT_GPU if kind == "gpu" else MODEL_DEFAULT_CPU


def default_home(platform=None, environ=None, user_home=None) -> Path:
    """VITRANSLATE_HOME, else %LOCALAPPDATA%\\ViTranslate (Windows) or ~/Library/Application Support/ViTranslate
    (macOS)."""
    platform = sys.platform if platform is None else platform
    environ = os.environ if environ is None else environ
    user_home = Path.home() if user_home is None else Path(user_home)
    base = environ.get("VITRANSLATE_HOME")
    if base:
        return Path(base)
    if platform == "darwin":
        return user_home / "Library" / "Application Support" / APP_NAME
    return Path(os.path.join(environ.get("LOCALAPPDATA", str(user_home)), APP_NAME))


def app_home() -> Path:
    home = default_home()
    home.mkdir(parents=True, exist_ok=True)
    return home


def logs_dir(home, platform=None, environ=None, user_home=None) -> Path:
    """<home>/logs; on macOS ~/Library/Logs/ViTranslate (Console.app shows it) unless VITRANSLATE_HOME is set."""
    platform = sys.platform if platform is None else platform
    environ = os.environ if environ is None else environ
    if platform == "darwin" and not environ.get("VITRANSLATE_HOME"):
        return (Path.home() if user_home is None else Path(user_home)) / "Library" / "Logs" / APP_NAME
    return Path(home) / "logs"


_ollama_override = None  # set by the installed helper's setup (setup.py): the system Ollama or its portable copy


def set_ollama_url(url):
    global _ollama_override
    _ollama_override = url


def ollama_url() -> str:
    """VITRANSLATE_OLLAMA when set, else the Ollama the setup chose, else the standard local port."""
    return os.environ.get("VITRANSLATE_OLLAMA") or _ollama_override or "http://127.0.0.1:11434"


def registry_source():
    """Pack registry: env, else the dev registry built by tools/build_registry.py when present, else None (offline,
    no network). There is deliberately no default remote registry yet: phase 5 adds one together with a signed
    manifest, so that content fetched from an unverified host can never reach the prompts."""
    env = os.environ.get("VITRANSLATE_REGISTRY")
    if env:
        return env
    dev = REPO_ROOT / "out" / "registry"
    return str(dev) if dev.is_dir() else None


def style_dir() -> Path:
    """The bundled writing-style pack (the only pack the base helper ships)."""
    return Path(os.environ.get("VITRANSLATE_STYLE", str(REPO_ROOT / "packs" / "_style")))


def web_dir() -> Path:
    return Path(os.environ.get("VITRANSLATE_WEB", str(REPO_ROOT / "web")))
