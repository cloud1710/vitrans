#!/usr/bin/env bash
# Build the macOS installer of the local helper in one command (Apple silicon, unsigned):
# freeze the helper (PyInstaller app bundle ViTranslate.app) -> disk image (hdiutil) -> SHA-256.
#
#   bash installer/macos/build.sh [--python PY] [--worktree] [--workdir DIR]
#
# - Sources: the committed HEAD (git archive), so a build is one commit; --worktree takes helper, packs, tools and
#   installer from the working tree instead (local test builds only, never a release; the page stays HEAD's).
# - The page comes from tools/build_site.py (its private-data scans need private/publish_patterns.txt; in the public
#   repo, which tools/export_public.py already scanned, an empty pattern list is used), the pack registry from
#   tools/build_registry.py (no drafts), plus the _style pack.
# - Output in out/installer/ (git-ignored): ViTranslate-macOS-<version>.dmg, ViTranslate-macOS.dmg (same bytes: the
#   stable asset name the page links to) and SHA256SUMS-macOS.txt. The image holds ViTranslate.app, a link to
#   /Applications, "Uninstall ViTranslate.command" and "READ ME FIRST.txt" (Open Anyway, in Vietnamese and English).
# - Intermediate files in --workdir (default $TMPDIR/vitranslate-build-macos), replaced on every run.
# Needs: macOS on Apple silicon, git, a Python 3.11 (arm64) with the helper's dependencies + pyinstaller==6.22.3.
set -euo pipefail

PYTHON="${VITRANSLATE_PY:-python3}"
WORKTREE=0
WORKDIR="${TMPDIR:-/tmp}"
WORKDIR="${WORKDIR%/}/vitranslate-build-macos"
MARKER=".vitranslate-build"

die() { echo "build.sh: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --python) PYTHON="$2"; shift 2 ;;
    --worktree) WORKTREE=1; shift ;;
    --workdir) WORKDIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || die "runs on macOS only (PyInstaller app bundle, hdiutil)"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$REPO/out/installer"

# work folder: only a folder this script created (marker file) is ever cleared
if [ -e "$WORKDIR" ]; then
  [ -f "$WORKDIR/$MARKER" ] || die "workdir $WORKDIR exists and is not a build folder"
  rm -rf "$WORKDIR"
fi
mkdir -p "$WORKDIR" "$OUT"
echo "ViTranslate macOS build folder" > "$WORKDIR/$MARKER"
SRC="$WORKDIR/src"
STAGE="$WORKDIR/stage"
SITE="$WORKDIR/site"
mkdir -p "$SRC" "$STAGE"

# private-data scan of the page: the private patterns in the development repo, an empty list in the public export
SCAN=()
if [ ! -f "$REPO/private/publish_patterns.txt" ]; then
  : > "$WORKDIR/no-patterns.txt"
  SCAN=(--patterns "$WORKDIR/no-patterns.txt")
  echo "No private/publish_patterns.txt (public checkout, already scanned by tools/export_public.py)"
fi

# 1. sources
COMMIT="$(git -C "$REPO" rev-parse HEAD)"
if [ "$WORKTREE" = 1 ]; then
  echo "Sources: working tree (test build, not for release)"
  mkdir -p "$SRC/helper"
  cp -R "$REPO/helper/vitranslate" "$SRC/helper/vitranslate"
  for d in packs tools installer; do cp -R "$REPO/$d" "$SRC/$d"; done
  find "$SRC" -type d -name __pycache__ -prune -exec rm -rf {} +
  # the page is always the committed one (it has its own owners and deploys)
  "$PYTHON" "$REPO/tools/build_site.py" "$SITE" --commit "$COMMIT" ${SCAN[@]+"${SCAN[@]}"}
else
  if [ -n "$(git -C "$REPO" status --porcelain -- helper packs tools installer web)" ]; then
    echo "WARNING: uncommitted changes are NOT in this build (it is HEAD $COMMIT)" >&2
  fi
  echo "Sources: commit $COMMIT"
  git -C "$REPO" archive --format=tar "$COMMIT" helper/vitranslate packs tools installer | tar -xf - -C "$SRC"
  "$PYTHON" "$SRC/tools/build_site.py" "$SITE" --commit "$COMMIT" --repo "$REPO" ${SCAN[@]+"${SCAN[@]}"}
fi
VERSION="$(sed -n 's/^VERSION = "\([0-9][0-9.]*\)"$/\1/p' "$SRC/helper/vitranslate/config.py")"
[ -n "$VERSION" ] || die "VERSION not found in helper/vitranslate/config.py"
echo "Version: $VERSION"

# 2. data bundled with the helper: page, pack registry, style pack
cp -R "$SITE/web" "$STAGE/web"
"$PYTHON" "$SRC/tools/build_registry.py" "$SRC/packs" "$STAGE/registry"
mkdir -p "$STAGE/packs"
cp -R "$SRC/packs/_style" "$STAGE/packs/_style"

# 3. freeze (PyInstaller signs every binary ad hoc; Apple silicon runs nothing unsigned)
export VT_HELPER="$SRC/helper" VT_STAGE="$STAGE" VT_VERSION="$VERSION"
"$PYTHON" -m PyInstaller --noconfirm --clean --log-level WARN --distpath "$WORKDIR/dist" \
  --workpath "$WORKDIR/pyi" "$SRC/installer/macos/vitranslate-macos.spec"
APP="$WORKDIR/dist/ViTranslate.app"
[ -x "$APP/Contents/MacOS/ViTranslate" ] || die "PyInstaller did not produce ViTranslate.app"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

# 4. disk image: the app, a link to /Applications, the uninstall script and the first-open note
DMG_SRC="$WORKDIR/dmg"
mkdir -p "$DMG_SRC"
cp -R "$APP" "$DMG_SRC/ViTranslate.app"
ln -s /Applications "$DMG_SRC/Applications"
cp "$SRC/installer/macos/uninstall.command" "$DMG_SRC/Uninstall ViTranslate.command"
chmod 755 "$DMG_SRC/Uninstall ViTranslate.command"
cp "$SRC/installer/macos/READ-ME-FIRST.txt" "$DMG_SRC/READ ME FIRST.txt"
VERSIONED="$OUT/ViTranslate-macOS-$VERSION.dmg"
STABLE="$OUT/ViTranslate-macOS.dmg"
rm -f "$VERSIONED" "$STABLE"
hdiutil create -volname "ViTranslate" -srcfolder "$DMG_SRC" -fs HFS+ -format UDZO -ov "$VERSIONED"
cp "$VERSIONED" "$STABLE"

# 5. checksums (published next to the file)
(cd "$OUT" && shasum -a 256 "ViTranslate-macOS-$VERSION.dmg" "ViTranslate-macOS.dmg" > SHA256SUMS-macOS.txt)
SIZE_MB="$(du -m "$STABLE" | cut -f1)"
if [ "$WORKTREE" = 1 ]; then FROM="the working tree"; else FROM="$COMMIT"; fi
echo "Built $STABLE (${SIZE_MB} MB) from $FROM"
cat "$OUT/SHA256SUMS-macOS.txt"
