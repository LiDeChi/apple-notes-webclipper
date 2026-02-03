#!/usr/bin/env bash
set -euo pipefail

PATH="/usr/bin:/bin:/usr/sbin:/sbin"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST="$ROOT_DIR/native_host/notes_bridge.sh"

encode_ping() {
  /usr/bin/python3 -c 'import json,struct,sys; msg=json.dumps({"action":"ping"}).encode("utf-8"); sys.stdout.buffer.write(struct.pack("<I",len(msg))); sys.stdout.buffer.write(msg)'
}

decode_ok() {
  /usr/bin/python3 -c 'import json,struct,sys; header=sys.stdin.buffer.read(4); (len(header)==4) or sys.exit("no native host response (missing 4-byte header)"); length=struct.unpack("<I",header)[0]; body=sys.stdin.buffer.read(length); (len(body)==length) or sys.exit(f"truncated native host response (expected {length} bytes, got {len(body)})"); obj=json.loads(body.decode("utf-8")); (obj.get("ok") is True) or sys.exit(f"unexpected response: {obj!r}"); print("ok")'
}

run_ping() {
  local label="$1"
  shift
  echo "==> $label"
  if [[ $# -eq 0 ]]; then
    encode_ping | "$HOST" | decode_ok
  else
    encode_ping | "$@" "$HOST" | decode_ok
  fi
}

run_ping "default env"

TMP_DIR="$(/usr/bin/mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

cat >"$TMP_DIR/python3" <<'SH'
#!/bin/sh
echo "broken python3 shim invoked" >&2
exit 127
SH
chmod +x "$TMP_DIR/python3"

# Simulate a GUI-launched environment where PATH resolves python3 to a broken shim.
run_ping "PATH has broken python3 shim" env PATH="$TMP_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
