# PyInstaller spec of ViTranslate.exe (onedir, no console window). Run by installer/build.ps1, which sets:
#   VT_HELPER  the helper/ folder of the exported commit (package vitranslate)
#   VT_STAGE   the prepared data: web/ (tools/build_site.py), registry/ (tools/build_registry.py), packs/_style/
import os

from PyInstaller.utils.hooks import collect_submodules

helper = os.environ["VT_HELPER"]
stage = os.environ["VT_STAGE"]

# live captions (vitranslate/live/uia.py): generate the comtypes wrapper of UIAutomationCore now, so that
# comtypes.gen.UIAutomationClient is bundled and the frozen app never generates code at run time
import comtypes.client  # noqa: E402

comtypes.client.GetModule("UIAutomationCore.dll")

a = Analysis(
    [os.path.join(SPECPATH, "vitranslate_app.py")],
    pathex=[helper],
    datas=[
        (os.path.join(stage, "web"), "web"),
        (os.path.join(stage, "registry"), "registry"),
        (os.path.join(stage, "packs", "_style"), os.path.join("packs", "_style")),
    ],
    # fontTools loads its table modules by name; FastAPI imports python-multipart only when a form route exists
    hiddenimports=collect_submodules("fontTools.ttLib.tables") + collect_submodules("uvicorn")
    + ["python_multipart", "multipart"]
    + ["vitranslate.live", "vitranslate.live.api", "vitranslate.live.sources", "vitranslate.live.uia",
       "vitranslate.live.window"]
    + collect_submodules("comtypes"),
    # not used by the helper (pulled in by optional imports of the env): smaller bundle, no setuptools runtime hook.
    # python-docx / python-pptx (and Pillow, which python-pptx imports) stay: pipeline.py re-opens every output.
    excludes=["tkinter", "numpy", "pandas", "scipy", "matplotlib", "torch", "IPython", "pytest", "_pytest",
              "pygments", "setuptools", "distutils", "pkg_resources", "_distutils_hack", "wheel"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="ViTranslate", console=False, upx=False, icon="NONE")
coll = COLLECT(exe, a.binaries, a.datas, name="ViTranslate", upx=False)
