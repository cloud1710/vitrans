#!/usr/bin/env bash
# Smoke test of the built disk image (CI, macOS): mount it read-only, check the bundle (Info.plist: no Dock icon,
# vitranslate:// scheme; arm64; signature), start the app binary headless (--login: no page, no first-run question)
# with an empty app home and an Ollama URL that does not answer (nothing is downloaded), wait for /api/health, read
# /api/setup until it reports "waiting" for Ollama, stop it with --stop, unmount.
#
#   bash installer/macos/smoke.sh out/installer/ViTranslate-macOS.dmg
set -euo pipefail

DMG="${1:?usage: smoke.sh <dmg>}"
MNT="$(mktemp -d)"
APP_HOME="$(mktemp -d)"
PID=""
export VITRANSLATE_HOME="$APP_HOME"
export VITRANSLATE_OLLAMA="http://127.0.0.1:9"

cleanup() {
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then kill "$PID" 2>/dev/null || true; fi
  hdiutil detach "$MNT" -force >/dev/null 2>&1 || true
}
fail() {
  echo "smoke: $*" >&2
  for f in "$APP_HOME"/logs/*.log; do [ -f "$f" ] && { echo "--- $f" >&2; tail -n 60 "$f" >&2; }; done
  exit 1
}
trap cleanup EXIT

hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$DMG" >/dev/null
APP="$MNT/ViTranslate.app"
BIN="$APP/Contents/MacOS/ViTranslate"
[ -x "$BIN" ] || fail "no $BIN"
[ -L "$MNT/Applications" ] || fail "no /Applications link"
[ -x "$MNT/Uninstall ViTranslate.command" ] || fail "no uninstall script"
[ -f "$MNT/READ ME FIRST.txt" ] || fail "no first-open note"
[ "$(plutil -extract LSUIElement raw "$APP/Contents/Info.plist")" = "true" ] || fail "LSUIElement is not set"
[ "$(plutil -extract CFBundleURLTypes.0.CFBundleURLSchemes.0 raw "$APP/Contents/Info.plist")" = "vitranslate" ] \
  || fail "vitranslate:// is not registered"
lipo -archs "$BIN" | grep -qw arm64 || fail "not an arm64 binary"
codesign --verify --deep --strict "$APP" || fail "bad signature"

"$BIN" --login &
PID=$!
PORT=""
for _ in $(seq 1 90); do
  for p in 47831 47832 47833 47834 47835; do
    if curl -fsS "http://127.0.0.1:$p/api/health" -o "$APP_HOME/health.json" 2>/dev/null \
        && grep -q '"app":"ViTranslate"' "$APP_HOME/health.json"; then
      PORT="$p"
      break 2
    fi
  done
  kill -0 "$PID" 2>/dev/null || fail "the app exited"
  sleep 1
done
[ -n "$PORT" ] || fail "no /api/health after 90 s"
echo "health: $(cat "$APP_HOME/health.json")"

STATE=""
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/api/setup" -o "$APP_HOME/setup.json"
  if grep -q '"state":"waiting"' "$APP_HOME/setup.json"; then STATE="waiting"; break; fi
  sleep 1
done
echo "setup: $(cat "$APP_HOME/setup.json")"
[ "$STATE" = "waiting" ] || fail "setup did not report waiting for Ollama"
grep -q '"mode":null' "$APP_HOME/setup.json" || fail "setup installed something"

"$BIN" --stop
for _ in $(seq 1 20); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 1
done
if kill -0 "$PID" 2>/dev/null; then fail "--stop did not end the helper"; fi
PID=""
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then fail "still answering after --stop"; fi
echo "smoke test passed (port $PORT)"
