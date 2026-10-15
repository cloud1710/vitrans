#!/bin/bash
# Uninstall ViTranslate on macOS (double-click in the disk image; Terminal opens it).
# Stops the helper and its own Ollama, then removes the app, its LaunchAgent (start at login), its data (the Ollama
# copy, the models pulled there, jobs, packs) and its logs. An Ollama the user installed (Ollama.app, Homebrew) and
# its models are never touched.
set -u

APP="/Applications/ViTranslate.app"
SUPPORT="$HOME/Library/Application Support/ViTranslate"
LOGS="$HOME/Library/Logs/ViTranslate"
LABEL="io.github.cloud1710.vitranslate.helper"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Go cai dat ViTranslate / Uninstall ViTranslate"
echo "Se xoa / will remove:"
echo "  $APP"
echo "  $SUPPORT"
echo "  $LOGS"
echo "  $AGENT"
printf "Go \"y\" roi Enter de tiep tuc / type y and Enter to continue: "
read -r answer
if [ "$answer" != "y" ]; then
  echo "Da huy / cancelled."
  exit 0
fi

# stop the helper and every process started from its own Ollama folder (by path, never another Ollama)
pkill -f "/ViTranslate.app/Contents/MacOS/ViTranslate" 2>/dev/null
pkill -f "$SUPPORT/ollama/" 2>/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
sleep 2
pkill -9 -f "$SUPPORT/ollama/" 2>/dev/null

rm -f "$AGENT"
rm -rf "$SUPPORT" "$LOGS"
if ! rm -rf "$APP" 2>/dev/null || [ -e "$APP" ]; then
  echo "Khong xoa duoc $APP: hay keo no vao Thung rac / could not remove it: drag it to the Trash."
fi
echo "Xong / done."
