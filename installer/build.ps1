<#
.SYNOPSIS
Build the ViTranslate installer in one command: freeze the helper (PyInstaller onedir) -> compile (Inno Setup) ->
SHA-256.

.DESCRIPTION
From the repo root:
  powershell -ExecutionPolicy Bypass -File installer\build.ps1 -Python <python of the helper env>
- Sources: the committed HEAD (git archive), so a build is one commit; -WorkTree takes helper, packs, tools and
  installer from the working tree instead (local test builds only, never a release; the UI stays HEAD's).
- The UI comes from tools/build_site.py (same files as the deployed page, private-data scans included), the pack
  registry from tools/build_registry.py (no drafts), plus the _style pack.
- Output in out\installer\ (git-ignored): ViTranslate-Setup-<version>.exe, ViTranslate-Setup.exe (same bytes: the
  stable asset name the page links to), SHA256SUMS.txt and ViTranslate-Setup.exe.sha256.
- Intermediate files in -WorkDir (default %TEMP%\vitranslate-build), replaced on every run.
Needs: Python env with the helper's dependencies + pyinstaller==6.22.3, Inno Setup 6 (winget install
JRSoftware.InnoSetup --scope user), git.
#>
param(
  [string]$Python = $env:VITRANSLATE_PY,
  [string]$Iscc = "",
  [string]$WorkDir = (Join-Path $env:TEMP "vitranslate-build"),
  [switch]$WorkTree
)
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Repo "out\installer"
$Marker = ".vitranslate-build"

function Invoke-Native([string]$Exe, [string[]]$Argv) {
  $saved = $ErrorActionPreference
  $ErrorActionPreference = "Continue"  # native tools log to stderr; only the exit code decides
  try { & $Exe @Argv } finally { $ErrorActionPreference = $saved }
  if ($LASTEXITCODE -ne 0) { throw ("{0} failed with exit code {1}" -f $Exe, $LASTEXITCODE) }
}

if (-not $Python) { $Python = "python" }
if (-not $Iscc) {
  $found = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  $candidates = @()
  if ($found) { $candidates += $found.Source }
  $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
  $candidates += (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe")
  $candidates += (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
  $Iscc = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $Iscc) { throw "Inno Setup 6 not found: winget install JRSoftware.InnoSetup --scope user" }
}

# work folder: only a folder this script created (marker file) is ever cleared
$WorkDir = [System.IO.Path]::GetFullPath($WorkDir)
if (Test-Path $WorkDir) {
  if (-not (Test-Path (Join-Path $WorkDir $Marker))) { throw "WorkDir $WorkDir exists and is not a build folder" }
  Remove-Item -Recurse -Force $WorkDir
}
New-Item -ItemType Directory -Force $WorkDir | Out-Null
Set-Content -Encoding ascii (Join-Path $WorkDir $Marker) "ViTranslate installer build folder"
$Src = Join-Path $WorkDir "src"
$Stage = Join-Path $WorkDir "stage"
$Site = Join-Path $WorkDir "site"
New-Item -ItemType Directory -Force $Src, $Stage, $Out | Out-Null

# 1. sources
$Commit = (& git -C $Repo rev-parse HEAD).Trim()
if ($WorkTree) {
  Write-Host "Sources: working tree (test build, not for release)"
  New-Item -ItemType Directory -Force (Join-Path $Src "helper") | Out-Null
  Copy-Item -Recurse (Join-Path $Repo "helper\vitranslate") (Join-Path $Src "helper\vitranslate")
  foreach ($d in "packs", "tools", "installer") { Copy-Item -Recurse (Join-Path $Repo $d) (Join-Path $Src $d) }
  Get-ChildItem -Path $Src -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
  # the UI is always the committed one (the page has its own owners and deploys; work in progress stays out)
  Invoke-Native $Python @((Join-Path $Repo "tools\build_site.py"), $Site, "--commit", $Commit)
} else {
  $dirty = & git -C $Repo status --porcelain -- helper packs tools installer web
  if ($dirty) { Write-Warning "Uncommitted changes are NOT in this build (it is HEAD $Commit)" }
  Write-Host "Sources: commit $Commit"
  $tar = Join-Path $WorkDir "src.tar"
  Invoke-Native git @("-C", $Repo, "archive", "--format=tar", "-o", $tar, $Commit, "helper/vitranslate", "packs",
                      "tools", "installer")
  Invoke-Native (Join-Path $env:SystemRoot "System32\tar.exe") @("-xf", $tar, "-C", $Src)
  Invoke-Native $Python @((Join-Path $Src "tools\build_site.py"), $Site, "--commit", $Commit, "--repo", $Repo)
}
$cfg = Get-Content -Raw (Join-Path $Src "helper\vitranslate\config.py")
if ($cfg -notmatch '(?m)^VERSION = "(\d+\.\d+\.\d+)"') { throw "VERSION not found in helper/vitranslate/config.py" }
$Version = $Matches[1]
Write-Host "Version: $Version"

# 2. data bundled with the helper: UI, pack registry, style pack
Copy-Item -Recurse (Join-Path $Site "web") (Join-Path $Stage "web")
Invoke-Native $Python @((Join-Path $Src "tools\build_registry.py"), (Join-Path $Src "packs"),
                        (Join-Path $Stage "registry"))
New-Item -ItemType Directory -Force (Join-Path $Stage "packs") | Out-Null
Copy-Item -Recurse (Join-Path $Src "packs\_style") (Join-Path $Stage "packs\_style")

# 3. freeze
$env:VT_HELPER = Join-Path $Src "helper"
$env:VT_STAGE = $Stage
Invoke-Native $Python @("-m", "PyInstaller", "--noconfirm", "--clean", "--log-level", "WARN", "--distpath",
                        (Join-Path $WorkDir "dist"), "--workpath", (Join-Path $WorkDir "pyi"),
                        (Join-Path $Src "installer\vitranslate.spec"))
$Dist = Join-Path $WorkDir "dist\ViTranslate"
if (-not (Test-Path (Join-Path $Dist "ViTranslate.exe"))) { throw "PyInstaller did not produce ViTranslate.exe" }

# 4. compile
Invoke-Native $Iscc @("/Q", "/DAppVersion=$Version", "/DDistDir=$Dist", "/DOutputDir=$Out",
                      (Join-Path $Src "installer\vitranslate.iss"))
$Versioned = Join-Path $Out "ViTranslate-Setup-$Version.exe"
$Stable = Join-Path $Out "ViTranslate-Setup.exe"
Copy-Item -Force $Versioned $Stable

# 5. checksums (published next to the file)
$lines = foreach ($f in @($Versioned, $Stable)) {
  "{0}  {1}" -f (Get-FileHash -Algorithm SHA256 $f).Hash.ToLower(), (Split-Path -Leaf $f)
}
Set-Content -Encoding ascii (Join-Path $Out "SHA256SUMS.txt") $lines
Set-Content -Encoding ascii "$Stable.sha256" $lines[1]
$size = (Get-Item $Stable).Length
Write-Host ("Built {0} ({1:N1} MB) from {2}" -f $Stable, ($size / 1MB), $(if ($WorkTree) { "the working tree" } else { $Commit }))
Write-Host $lines[1]
