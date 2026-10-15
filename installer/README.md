# Windows installer of the local helper ("Dịch trên máy")

## What it installs

- `ViTranslate.exe`: the helper frozen with PyInstaller (onedir, no console window), per user, no administrator
  rights, in `%LOCALAPPDATA%\Programs\ViTranslate`. It bundles the page (built by `tools/build_site.py`), the pack
  registry (`tools/build_registry.py`, no drafts) and the `_style` pack. Listens on `127.0.0.1:47831` (first free of
  47831-47835). One instance: a second start exits (Start Menu: it opens the running helper's page).
- Start Menu: **ViTranslate** (`--open`: start it and open `http://127.0.0.1:<port>/`) and **Dừng ViTranslate**
  (`--stop`: end the helper and its own Ollama).
- `vitranslate://` under `HKCU\Software\Classes`: the page's `vitranslate://start` link starts a stopped helper. A
  link can only start it (every other argument is ignored).
- Optional, unchecked: **Khởi động cùng Windows** (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).
- Logs: `%LOCALAPPDATA%\ViTranslate\logs\helper.log` (rotated), `console.log`, `ollama.log` (portable Ollama).

## First start (`helper/vitranslate/setup.py`)

Progress: `GET /api/setup` (state, step, mode, download bytes, model pull bytes) and `setup` in `/api/health`;
`POST /api/setup/start` runs the steps again now. Run again at every start, so a crash or a reboot resumes.

1. An Ollama answering on `127.0.0.1:11434` is reused as it is (never started, stopped or changed).
2. An Ollama installed but not running (its tray app may start after us at logon): wait up to 45 s for it.
3. Otherwise its own copy: Ollama **0.35.1** `ollama-windows-amd64.zip` (1.47 GB; SHA-256
   `dc50b9ca7f9023c86525012632cd1615b093d0407987444a7f62ecab617e8e93`) from the official GitHub release, downloaded
   with HTTP range resume to `%LOCALAPPDATA%\ViTranslate\downloads`, checked before it is unpacked (1.9 GB) into
   `%LOCALAPPDATA%\ViTranslate\ollama`, started hidden as `ollama serve` on `127.0.0.1:11435` with
   `OLLAMA_MODELS=%LOCALAPPDATA%\ViTranslate\models`, inside a kill-on-close job object (it ends with the helper,
   also after a crash; it is started again if it exits). To move to a newer Ollama, change the pinned version, size and
   SHA-256 in `setup.py` (take a release at least two weeks old; the hash from its `sha256sum.txt`).
4. The recommended model for this device when Ollama lacks it (`recommend.py`: `gemma4:e4b` with a usable NVIDIA GPU,
   `qwen3.5:9b` on the CPU, `gemma4:e2b` below 12 GB RAM; 4.6-6.6 GB), pulled through Ollama (resumable).

`VITRANSLATE_OLLAMA` set: that Ollama is used and nothing is installed.

## Uninstall

Settings > Apps > ViTranslate (silent: `"%LOCALAPPDATA%\Programs\ViTranslate\unins000.exe" /VERYSILENT
/SUPPRESSMSGBOXES`). It runs `ViTranslate.exe --stop` (ends the helper and every process started from
`%LOCALAPPDATA%\ViTranslate\ollama`, by folder), then removes the app folder, the registry entries and
`%LOCALAPPDATA%\ViTranslate` (jobs, logs, packs, its Ollama and the models pulled there). The confirmation says so.
An Ollama the user installed, and the models in it, are not touched.

## Build

Once: Inno Setup 6 (`winget install JRSoftware.InnoSetup --scope user`; 6.7.3 used) and, in the helper's Python env,
`pip install pyinstaller==6.22.3 pyinstaller-hooks-contrib==2026.8`.

```powershell
powershell -ExecutionPolicy Bypass -File installer\build.ps1 -Python <python of the helper env>
```

Freezes the committed HEAD (`-WorkTree`: helper, packs, tools and installer from the working tree, for test builds
only; the page is always HEAD's), compiles `installer\vitranslate.iss` with the version of
`helper/vitranslate/config.py`, and writes to `out\installer\` (git-ignored): `ViTranslate-Setup-<version>.exe`,
`ViTranslate-Setup.exe` (same bytes, the stable name the page links to), `SHA256SUMS.txt`,
`ViTranslate-Setup.exe.sha256`. Intermediate files: `-WorkDir` (default `%TEMP%\vitranslate-build`).

## Test before a release

1. `cd helper && <python> -m pytest` (setup, download / resume / checksum against a fake server, single instance,
   protocol arguments; no network).
2. Silent install on a test account or PC: `ViTranslate-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES`; start it
   (`start vitranslate://start` or the Start Menu); `http://127.0.0.1:47831/api/health` answers and `/api/setup`
   reaches `ready`; translate a DOCX and a PPTX on <https://vitrans.pages.dev> in local mode ("Dịch trên máy").
3. Once per Ollama version, on a PC without Ollama: the portable download, unpack, start on 11435 and model pull
   (~8-10 GB of downloads).
4. Uninstall silently; `%LOCALAPPDATA%\Programs\ViTranslate` and `%LOCALAPPDATA%\ViTranslate` are gone, the
   `vitranslate` key under `HKCU\Software\Classes` too, and a system Ollama still answers on 11434.

## Release

Upload `ViTranslate-Setup.exe` and `SHA256SUMS.txt` to a GitHub release of `github.com/cloud1710/vitrans`; the page
links `https://github.com/cloud1710/vitrans/releases/latest/download/ViTranslate-Setup.exe`. The installer is not
code-signed, so SmartScreen warns until it has reputation:
"Windows protected your PC" -> "More info" -> "Run anyway". Signing would need a code-signing certificate (cost).

## macOS

Apple-silicon Macs only (M1 or later; macOS 14+, the minimum of the Ollama macOS build). Unsigned, built on GitHub
Actions (`.github/workflows/macos-installer.yml`, free macOS runners of the public repo).

**What it installs.** `ViTranslate-macOS.dmg` holds `ViTranslate.app` (PyInstaller app bundle, arm64, ad-hoc
signature only; `installer/macos/vitranslate-macos.spec`), a link to `/Applications`, `Uninstall
ViTranslate.command` and `READ ME FIRST.txt`. Info.plist: `LSUIElement` (no Dock icon) and `CFBundleURLTypes`
`vitranslate` (the page's `vitranslate://start` link launches the app; it only starts the helper). Opening the app
from Finder starts the helper and opens its page; a second open only opens the page. App data:
`~/Library/Application Support/ViTranslate`; logs: `~/Library/Logs/ViTranslate` (`helper.log`, `console.log`,
`ollama.log`). Start at login: asked once at the first open from Finder (default: no); it writes
`~/Library/LaunchAgents/io.github.cloud1710.vitranslate.helper.plist` (runs the app with `--login`: start only).
Change later: `/Applications/ViTranslate.app/Contents/MacOS/ViTranslate --autostart on` (or `off`).

**First start** (`setup.py`, same steps as Windows): an Ollama on `127.0.0.1:11434` (Ollama.app, Homebrew) is reused;
an installed but stopped one gets 45 s; else `ollama-darwin.tgz` of the same pinned Ollama **0.35.1** (159,625,239
bytes; SHA-256 `3137dbf28948ee844e0fb3e584d9b5de6879d73d9f0cb7eff3ad64930601d307`), range-resumed, checked, unpacked
(bsdtar, after every entry is checked) into `~/Library/Application Support/ViTranslate/ollama`, started as
`ollama serve` on `127.0.0.1:11435` with `OLLAMA_MODELS` in that folder; it ends when the helper exits. Model:
Ollama runs every layer on the GPU through Metal; the budget is the GPU's share of the unified memory (2/3 of RAM up
to 36 GB): 16 GB or more -> `gemma4:e4b`, 8 GB -> the fast `gemma4:e2b`.

**First open (unsigned app).** macOS blocks it once: "Apple could not verify ViTranslate" -> Done; then System
Settings -> Privacy & Security -> Security: "ViTranslate was blocked..." -> **Open Anyway** -> password -> **Open
Anyway**. Tiếng Việt: lần đầu macOS chặn ứng dụng chưa ký số: bấm Done (Xong), mở System Settings (Cài đặt hệ
thống) -> Privacy & Security (Quyền riêng tư & Bảo mật) -> mục Security: "ViTranslate was blocked..." -> bấm
**Open Anyway** (Vẫn mở) -> nhập mật khẩu -> **Open Anyway**. Chỉ cần làm một lần.

**Uninstall.** Double-click `Uninstall ViTranslate.command` in the disk image (it stops the helper and its Ollama,
removes the app, the LaunchAgent, the app data and the logs), or drag ViTranslate.app to the Trash and run:

```sh
pkill -f ViTranslate.app; pkill -f "Application Support/ViTranslate/ollama"; rm -rf "$HOME/Library/Application Support/ViTranslate" "$HOME/Library/Logs/ViTranslate" "$HOME/Library/LaunchAgents/io.github.cloud1710.vitranslate.helper.plist"
```

Gỡ cài đặt: bấm đúp `Uninstall ViTranslate.command` trong file dmg, hoặc kéo ViTranslate.app vào Thùng rác rồi chạy
lệnh trên trong Terminal. Ollama.app bạn tự cài và các mô hình của nó không bị đụng tới.

**Build.** On a Mac (Apple silicon, Python 3.11 arm64 with the helper's dependencies + `pyinstaller==6.22.3`):
`bash installer/macos/build.sh --python python3` -> `out/installer/ViTranslate-macOS-<version>.dmg`,
`ViTranslate-macOS.dmg` (stable name) and `SHA256SUMS-macOS.txt`; `bash installer/macos/smoke.sh
out/installer/ViTranslate-macOS.dmg` mounts it, starts the app headless, checks `/api/health` and `/api/setup`, and
stops it. In the public repo the workflow does both on `macos-14` after the darwin tests (including a real download,
unpack and start of the pinned Ollama darwin build) and keeps the image as the run's artifact.

**Release.** Publish the GitHub release (with the Windows `ViTranslate-Setup.exe` attached as before): the workflow
attaches `ViTranslate-macOS.dmg` and `SHA256SUMS-macOS.txt` to it. For an existing release: Actions -> macOS
installer -> Run workflow with `release_tag`. The workflow never creates a release, so
`releases/latest/download/ViTranslate-Setup.exe` keeps working. The page links
`https://github.com/cloud1710/vitrans/releases/latest/download/ViTranslate-macOS.dmg`.

## Licences of the bundled parts

- ViTranslate helper and page: AGPL-3.0 (repo `LICENSE`).
- Python 3.11 runtime: PSF License; with OpenSSL 3 (Apache-2.0), SQLite (public domain), libffi (MIT), zlib (zlib),
  bzip2 (bzip2 licence), xz / liblzma (0BSD / public domain), expat (MIT); MSVC runtime DLLs (Microsoft
  redistributable).
- Python packages: FastAPI, pydantic, pydantic-core, annotated-types, annotated-doc, typing-inspection, anyio, h11,
  python-docx, python-pptx, fontTools (MIT); Starlette, uvicorn, httpx, httpcore, idna, click, lxml (BSD-3-Clause;
  lxml bundles libxml2 / libxslt, MIT); XlsxWriter (BSD-2-Clause); Pillow (MIT-CMU); python-multipart,
  opentelemetry-api (Apache-2.0); typing-extensions (PSF-2.0); certifi (MPL-2.0).
- PyInstaller bootloader: GPL-2.0 with the bootloader exception (the bundled program keeps its own licence).
- Inno Setup setup / uninstaller stubs: Inno Setup License. `installer/lang/Vietnamese.isl`: the unofficial
  Vietnamese translation (Memecoder) from `jrsoftware/issrc` tag `is-6_7_3`, `Files/Languages/Unofficial`
  (BOM added).
- Not bundled, downloaded on first start: Ollama (MIT); models Gemma 4 E4B / E2B and Qwen 3.5 9B (Apache-2.0).
