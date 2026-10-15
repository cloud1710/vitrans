"""Static checks of the Windows installer sources (installer/): per-user only, the decided entries, encodings."""
import re

from vitranslate import config

INSTALLER = config.REPO_ROOT / "installer"


def iss():
    raw = (INSTALLER / "vitranslate.iss").read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf")  # UTF-8 with BOM: Inno Setup reads the Vietnamese text correctly
    # CRLF lines on every checkout, as Inno Setup writes its own scripts (.gitattributes: eol=crlf)
    assert raw.count(b"\n") == raw.count(b"\r\n") > 0
    return raw.decode("utf-8-sig").replace("\r\n", "\n")


def test_the_installer_is_per_user_and_never_writes_machine_wide():
    text = iss()
    assert re.search(r"^PrivilegesRequired=lowest$", text, re.M)
    assert re.search(r"^DefaultDirName=\{autopf\}\\ViTranslate$", text, re.M)  # = %LOCALAPPDATA%\Programs
    assert "HKLM" not in text and "HKA" not in text and "{commonpf}" not in text
    assert re.search(r"^DisableWelcomePage=no$", text, re.M)  # the welcome page carries the consent text


def test_protocol_autostart_and_uninstall_entries():
    text = iss()
    assert 'Subkey: "Software\\Classes\\vitranslate"' in text and '"URL Protocol"' in text
    assert '"""{app}\\ViTranslate.exe"" ""%1"""' in text  # vitranslate://start -> ViTranslate.exe "<link>"
    task = re.search(r'^Name: "autostart";.*$', text, re.M).group(0)
    assert "Flags: unchecked" in task  # "Khoi dong cung Windows" is opt-in
    assert "CurrentVersion\\Run" in text and "Tasks: autostart" in text
    assert re.search(r'^Filename: "\{app\}\\ViTranslate\.exe"; Parameters: "--stop"; Flags: runhidden '
                     r'waituntilterminated', text, re.M)
    assert 'Type: filesandordirs; Name: "{localappdata}\\ViTranslate"' in text


def test_vietnamese_and_english_wizard_texts():
    text = iss()
    assert 'Name: "vietnamese"; MessagesFile: "compiler:Default.isl,lang\\Vietnamese.isl"' in text
    assert 'Name: "english"; MessagesFile: "compiler:Default.isl"' in text
    for key in ("WelcomeLabel2", "ConfirmUninstall"):
        assert "vietnamese.%s=" % key in text and "english.%s=" % key in text
    assert "Run anyway" in text  # the SmartScreen explanation
    isl = (INSTALLER / "lang" / "Vietnamese.isl").read_bytes()
    assert isl.startswith(b"\xef\xbb\xbf") and "LanguageID=$042A" in isl.decode("utf-8-sig")
    assert isl.count(b"\n") == isl.count(b"\r\n") > 0  # CRLF like Inno Setup's own Default.isl


def test_the_frozen_build_bundles_what_the_helper_reads():
    spec = (INSTALLER / "vitranslate.spec").read_text(encoding="utf-8")
    for data in ('"web"', '"registry"', '"_style"'):
        assert data in spec
    assert "console=False" in spec
    excludes = re.search(r"excludes=\[(.*?)\]", spec, re.S).group(1)
    for needed in ("docx", "pptx", "PIL"):  # pipeline.reopen loads every output with python-docx / python-pptx
        assert '"%s"' % needed not in excludes
