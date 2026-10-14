from pathlib import Path

from vitranslate import config


def test_app_home_uses_env(tmp_path, monkeypatch):
    monkeypatch.setenv("VITRANSLATE_HOME", str(tmp_path / "home"))
    home = config.app_home()
    assert home == tmp_path / "home"
    assert home.is_dir()


def test_defaults():
    # spec Amendment E: Gemma 4 E4B with a GPU, Qwen 3.5 9B on the CPU until Gemma is measured there, Gemma 4 E2B draft
    assert config.MODEL_DEFAULT_GPU == "gemma4:e4b"
    assert config.MODEL_DEFAULT_CPU == "qwen3.5:9b"
    assert config.MODEL_FAST == "gemma4:e2b"
    assert config.default_model("gpu") == "gemma4:e4b" and config.default_model("cpu") == "qwen3.5:9b"
    assert config.MODELS == ("gemma4:e4b", "qwen3.5:9b", "gemma4:e2b")
    assert config.PORTS[0] == 47831 and len(config.PORTS) == 5
    assert (config.REPO_ROOT / "helper" / "vitranslate").is_dir()


def test_style_dir_follows_env(tmp_path, monkeypatch):
    monkeypatch.delenv("VITRANSLATE_STYLE", raising=False)
    assert config.style_dir() == config.REPO_ROOT / "packs" / "_style"
    assert (config.style_dir() / "pack.json").is_file()
    monkeypatch.setenv("VITRANSLATE_STYLE", str(tmp_path))
    assert config.style_dir() == Path(tmp_path)


def test_registry_source(tmp_path, monkeypatch):
    monkeypatch.delenv("VITRANSLATE_REGISTRY", raising=False)
    monkeypatch.setattr(config, "REPO_ROOT", tmp_path)
    assert config.registry_source() is None  # no remote registry until phase 5 (signed manifest)
    (tmp_path / "out" / "registry").mkdir(parents=True)
    assert config.registry_source() == str(tmp_path / "out" / "registry")  # dev registry built from packs/
    monkeypatch.setenv("VITRANSLATE_REGISTRY", "https://example.org/reg")
    assert config.registry_source() == "https://example.org/reg"
