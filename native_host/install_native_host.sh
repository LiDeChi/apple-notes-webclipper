#!/bin/zsh
set -euo pipefail

HOST_NAME="com.codex.apple_notes_webclipper"

if [[ "${1:-}" == "" ]]; then
  echo "Usage: $0 <CHROME_EXTENSION_ID>"
  echo "Example: $0 abcdefghijklmnopqrstuvwxyzabcdef"
  exit 1
fi

EXT_ID="$1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST_DIR="$ROOT_DIR/native_host"
HOST_BIN="$HOST_DIR/notes_bridge.sh"

if [[ ! -x "$HOST_BIN" ]]; then
  chmod +x "$HOST_BIN"
fi

MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$MANIFEST_DIR"

MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"

cat > "$MANIFEST_PATH" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Apple Notes Web Clipper Native Host",
  "path": "$HOST_BIN",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
JSON

echo "✅ Installed Native Host manifest:"
echo "  $MANIFEST_PATH"
echo ""
echo "Next:"
echo "  1) Reload extension in chrome://extensions"
echo "  2) Open extension Options → click “测试连接”"
