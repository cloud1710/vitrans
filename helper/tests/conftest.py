import pytest


@pytest.fixture
def home(tmp_path, monkeypatch):
    """Isolated app home for every test that touches app state."""
    monkeypatch.setenv("VITRANSLATE_HOME", str(tmp_path / "apphome"))
    return tmp_path / "apphome"


@pytest.fixture(autouse=True)
def isolated_app_home(tmp_path_factory, monkeypatch):
    """No test creates or writes the real per-user ViTranslate app folder: the default home is a throw-away folder."""
    monkeypatch.setenv("VITRANSLATE_HOME", str(tmp_path_factory.mktemp("default-home")))


@pytest.fixture(autouse=True)
def no_real_ollama(monkeypatch):
    """No test reaches the Ollama of the machine running the tests (a closed local port refuses at once)."""
    monkeypatch.setenv("VITRANSLATE_OLLAMA", "http://127.0.0.1:9")


@pytest.fixture(autouse=True)
def no_network_registry(tmp_path_factory, monkeypatch):
    """No test reaches the real pack registry: unless a test sets its own, the source is a missing local folder."""
    monkeypatch.setenv("VITRANSLATE_REGISTRY", str(tmp_path_factory.getbasetemp() / "no-registry"))


@pytest.fixture(scope="session")
def pathology_registry(tmp_path_factory):
    """A registry folder built from a copy of the real packs/pathology (never from draft folders)."""
    from packutil import build, copy_real
    root = tmp_path_factory.mktemp("pathology-registry")
    build(copy_real(root / "packs", "pathology"), root / "registry")
    return root / "registry"
