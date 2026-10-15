# PyInstaller spec of ViTranslate.app (macOS, Apple silicon, onedir app bundle, no Dock icon, not signed beyond
# PyInstaller's ad-hoc signature). Run by installer/macos/build.sh, which sets:
#   VT_HELPER   the helper/ folder of the exported commit (package vitranslate)
#   VT_STAGE    the prepared data: web/ (tools/build_site.py), registry/ (tools/build_registry.py), packs/_style/
#   VT_VERSION  config.VERSION of that commit
# Same data, hidden imports and excludes as installer/vitranslate.spec (Windows). Info.plist entries come from
# vitranslate.macos.bundle_info: LSUIElement (no Dock icon), the vitranslate:// scheme, arm64, minimum macOS.
# argv_emulation: a launch by a vitranslate:// link arrives as an Apple event; the bootloader turns it into an argument,
# so desktop.parse_args can tell it (start only) from a Finder double-click (start + open the page).
import os
import sys

from PyInstaller.utils.hooks import collect_submodules

helper = os.environ["VT_HELPER"]
stage = os.environ["VT_STAGE"]
version = os.environ["VT_VERSION"]
sys.path.insert(0, helper)
from vitranslate.macos import BUNDLE_ID, bundle_info  # noqa: E402

a = Analysis(
    [os.path.join(SPECPATH, "..", "vitranslate_app.py")],
    pathex=[helper],
    datas=[
        (os.path.join(stage, "web"), "web"),
        (os.path.join(stage, "registry"), "registry"),
        (os.path.join(stage, "packs", "_style"), os.path.join("packs", "_style")),
    ],
    hiddenimports=collect_submodules("fontTools.ttLib.tables") + collect_submodules("uvicorn")
    + ["python_multipart", "multipart"],
    excludes=["tkinter", "numpy", "pandas", "scipy", "matplotlib", "torch", "IPython", "pytest", "_pytest",
              "pygments", "setuptools", "distutils", "pkg_resources", "_distutils_hack", "wheel"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="ViTranslate", console=False, upx=False,
          argv_emulation=True, target_arch="arm64", codesign_identity=None, entitlements_file=None)
coll = COLLECT(exe, a.binaries, a.datas, name="ViTranslate", upx=False)
app = BUNDLE(coll, name="ViTranslate.app", icon=None, bundle_identifier=BUNDLE_ID, version=version,
             info_plist=bundle_info(version))
