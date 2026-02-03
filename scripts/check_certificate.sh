#!/bin/bash
# Helper script to check for available code signing certificates

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo "Checking for code signing certificates..."
echo ""

# Find all code signing certificates
certificates=$(security find-identity -v -p codesigning 2>/dev/null || true)

if [ -z "$certificates" ]; then
    echo -e "${RED}✗ No code signing certificates found${NC}"
    echo ""
    echo "To get a Developer ID certificate:"
    echo "1. Open Xcode"
    echo "2. Go to Xcode > Preferences > Accounts"
    echo "3. Select your Apple ID"
    echo "4. Click 'Manage Certificates...'"
    echo "5. Click '+' and select 'Developer ID Application'"
    echo ""
    echo "Note: You need an Apple Developer Account for this."
    exit 1
fi

echo "Available certificates:"
echo ""

has_developer_id=false
has_developer_id_installer=false

while IFS= read -r line; do
    if echo "$line" | grep -q "Developer ID Application"; then
        echo -e "${GREEN}✓ $line${NC}"
        has_developer_id=true
    elif echo "$line" | grep -q "Developer ID Installer"; then
        echo -e "${GREEN}✓ $line${NC}"
        has_developer_id_installer=true
    elif echo "$line" | grep -q "Apple Development"; then
        echo -e "${YELLOW}  $line (for development only)${NC}"
    else
        echo "  $line"
    fi
done <<< "$certificates"

echo ""

if [ "$has_developer_id" = true ]; then
    echo -e "${GREEN}✓ Developer ID Application certificate found${NC}"
    echo "  This certificate can be used for code signing binaries."
fi

if [ "$has_developer_id_installer" = true ]; then
    echo -e "${GREEN}✓ Developer ID Installer certificate found${NC}"
    echo "  This certificate can be used for signing packages."
fi

if [ "$has_developer_id" = false ] && [ "$has_developer_id_installer" = false ]; then
    echo -e "${YELLOW}⚠ No Developer ID certificates found${NC}"
    echo "  Only development certificates are available."
    echo "  For distribution, you need a Developer ID certificate."
    echo ""
    echo "To get a Developer ID certificate:"
    echo "1. Open Xcode"
    echo "2. Go to Xcode > Preferences > Accounts"
    echo "3. Select your Apple ID"
    echo "4. Click 'Manage Certificates...'"
    echo "5. Click '+' and select 'Developer ID Application'"
fi

echo ""
echo "Using certificates with build script:"
echo "  # Auto-detect certificate (uses first Developer ID Application)"
echo "  ./release/build_macos_native_host_pkg.sh --sign <EXTENSION_ID>"
echo ""
echo "  # Specify certificate explicitly"
echo "  ./release/build_macos_native_host_pkg.sh --sign --identity \"Certificate Name\" <EXTENSION_ID>"
echo ""
echo "  # Or use environment variable"
echo "  export DEVELOPER_ID_CERTIFICATE=\"Certificate Name\""
echo "  ./release/build_macos_native_host_pkg.sh --sign <EXTENSION_ID>"
