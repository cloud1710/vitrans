# Open every .pptx / .docx in a folder with PowerPoint / Word (read-only) and export the first slides to PNG.
# A file that throws on open, or that opens empty, counts as a failure; exit code = number of failures.
# Usage: powershell -NoProfile -File tools/com_open_check.ps1 -Dir out/e2e [-Slides 6] [-Originals]
# -Originals also renders the first slides of the original decks listed in private/corpus.txt into out/orig_png/
# (opened read-only, never saved; the originals are not touched).
#
# Safety: PowerPoint is single-instance, so New-Object may attach to the user's own session. The script records
# whether POWERPNT / WINWORD were running before it started; it calls Quit() only on an application it started
# itself, and otherwise only Close()s the one file it opened. Other open documents are never touched.
# "No repair prompt": Word is opened with OpenAndRepair = false (a damaged file throws instead of being silently
# repaired), then the document must have text and paragraphs; PowerPoint must open with at least one slide.
param([string]$Dir = "out/e2e", [int]$Slides = 6, [switch]$Originals)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($Dir)) { $Dir = Join-Path $root $Dir }
$files = @(Get-ChildItem -Path $Dir -File | Where-Object { $_.Extension -in ".pptx", ".docx" -and $_.Name -notlike "*.partial.*" })
$origFiles = @()
if ($Originals) {
  $listing = Join-Path $root "private/corpus.txt"
  foreach ($line in Get-Content -Path $listing -Encoding UTF8) {
    $p = $line.Trim()
    if ($p -and ([System.IO.Path]::GetExtension($p) -eq ".pptx") -and (Test-Path -LiteralPath $p)) { $origFiles += Get-Item -LiteralPath $p }
  }
}
$pptWasRunning = [bool](Get-Process -Name POWERPNT -ErrorAction SilentlyContinue)
$wordWasRunning = [bool](Get-Process -Name WINWORD -ErrorAction SilentlyContinue)
$fail = 0
$ppt = $null
$word = $null
$wordAlerts = $null
$missing = [Type]::Missing

function Export-Deck($f, $pngDir) {
  $p = $script:ppt.Presentations.Open($f.FullName, $true, $false, $false)   # ReadOnly, untitled=false, window=false
  try {
    if ($p.Slides.Count -lt 1) { throw "presentation opened with no slides" }
    New-Item -ItemType Directory -Force $pngDir | Out-Null
    $n = [Math]::Min($Slides, $p.Slides.Count)
    for ($i = 1; $i -le $n; $i++) {
      $p.Slides.Item($i).Export((Join-Path $pngDir ("slide{0}.png" -f $i)), "PNG", 1280, 720)
    }
  } finally { $p.Close() }
}

foreach ($f in $files) {
  try {
    if ($f.Extension -eq ".pptx") {
      if (-not $ppt) { $ppt = New-Object -ComObject PowerPoint.Application }
      Export-Deck $f (Join-Path $f.DirectoryName ($f.BaseName + "_png"))
    } else {
      if (-not $word) {
        $word = New-Object -ComObject Word.Application
        $wordAlerts = $word.DisplayAlerts
        $word.DisplayAlerts = 0
        if (-not $wordWasRunning) { $word.Visible = $false }
      }
      # Open(FileName, ConfirmConversions, ReadOnly, AddToRecent, PwDoc, PwTpl, Revert, WritePwDoc, WritePwTpl,
      #      Format, Encoding, Visible, OpenAndRepair)
      $d = $word.Documents.Open($f.FullName, $false, $true, $false, $missing, $missing, $missing, $missing, $missing, $missing, $missing, $false, $false)
      try {
        if ($d.Content.Text.Trim().Length -lt 1 -or $d.Paragraphs.Count -lt 1) { throw "document opened empty (silent repair?)" }
      } finally { $d.Close($false) }
    }
    "OK   " + $f.Name
  } catch {
    $fail++
    "FAIL " + $f.Name + " :: " + $_.Exception.Message
  }
}

foreach ($f in $origFiles) {
  try {
    if (-not $ppt) { $ppt = New-Object -ComObject PowerPoint.Application }
    Export-Deck $f (Join-Path $root ("out/orig_png/" + $f.BaseName + "_png"))
    "ORIG " + $f.Name
  } catch {
    $fail++
    "FAIL (original) " + $f.Name + " :: " + $_.Exception.Message
  }
}

if ($word) {
  try { $word.DisplayAlerts = $wordAlerts } catch {}
  if (-not $wordWasRunning) { try { $word.Quit() } catch {} }
}
if ($ppt -and -not $pptWasRunning) { try { $ppt.Quit() } catch {} }
"files: " + $files.Count + ", originals: " + $origFiles.Count + " (PowerPoint was running: $pptWasRunning, Word: $wordWasRunning)"
"failures: $fail"
exit $fail
