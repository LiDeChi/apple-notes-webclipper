#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/release/out"
mkdir -p "$OUT_DIR"

VERSION="$(node -p 'require("./package.json").version')"

echo "Building extension (release)…"
cd "$ROOT_DIR"
node scripts/build.mjs --release

ZIP_PATH="$OUT_DIR/AppleNotesWebClipperExtension-$VERSION.zip"

echo "Zipping…"
rm -f "$ZIP_PATH"
cd "$ROOT_DIR/dist/extension"
zip -qr "$ZIP_PATH" .

echo ""
echo "✅ Built:"
echo "  $ZIP_PATH"
