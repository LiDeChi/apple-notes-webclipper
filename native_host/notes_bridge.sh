#!/bin/bash
set -euo pipefail

# Chrome/Chromium may launch the native host with a very different PATH than your shell,
# and user-defined shims can cause python resolution to break. Use a stable PATH and
# prefer system Python when available.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LOG_DIR="${HOME:-/tmp}/Library/Logs/AppleNotesWebClipper"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="$LOG_DIR/native-host.log"
exec 2>>"$LOG_FILE"

PYTHON_BIN=""
if [[ -x "/usr/bin/python3" ]]; then
  PYTHON_BIN="/usr/bin/python3"
elif [[ -x "/opt/homebrew/bin/python3" ]]; then
  PYTHON_BIN="/opt/homebrew/bin/python3"
elif [[ -x "/usr/local/bin/python3" ]]; then
  PYTHON_BIN="/usr/local/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
fi

if [[ -z "$PYTHON_BIN" ]]; then
  echo "[apple-notes-webclipper] python3 not found; PATH=$PATH" >&2
  exit 127
fi

exec "$PYTHON_BIN" "$SCRIPT_DIR/notes_bridge.py"
