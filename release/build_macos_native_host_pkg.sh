#!/bin/zsh
set -euo pipefail
export COPYFILE_DISABLE=1

# =============================================================================
# CONFIGURATION
# =============================================================================

HOST_NAME="com.codex.apple_notes_webclipper"
PKG_ID="com.codex.apple-notes-webclipper.native-host"

# Detect platform
PLATFORM="$(uname -s)"
IS_MACOS="$([ "$PLATFORM" = "Darwin" ] && echo "true" || echo "false")"

# Default values
SIGN_PACKAGE="${SIGN_PACKAGE:-false}"
NOTARIZE_PACKAGE="${NOTARIZE_PACKAGE:-false}"
STAPLE_TICKET="${STAPLE_TICKET:-false}"
CERTIFICATE_IDENTITY="${DEVELOPER_ID_CERTIFICATE:-}"
APPLE_ID="${APPLE_ID:-}"
APP_SPECIFIC_PASSWORD="${APP_SPECIFIC_PASSWORD:-}"
TEAM_ID="${TEAM_ID:-}"

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================

log_info() {
    echo "[INFO] $*"
}

log_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $*"
}

log_warning() {
    echo -e "\033[0;33m[WARNING]\033[0m $*" >&2
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $*" >&2
}

# =============================================================================
# USAGE / HELP
# =============================================================================

# Get script name once at script level (zsh-compatible)
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

show_help() {
    cat << EOF
Usage: ${SCRIPT_NAME} [OPTIONS] <CHROME_EXTENSION_ID>

Build macOS native host package with optional code signing and notarization.

Arguments:
  CHROME_EXTENSION_ID    Chrome extension ID (32 characters)

Options:
  --sign              Enable code signing (requires DEVELOPER_ID_CERTIFICATE)
  --notarize          Enable notarization (requires APPLE_ID and APP_SPECIFIC_PASSWORD)
  --staple            Staple notarization ticket to package
  --identity ID       Specify certificate identity (default: auto-detect)
  --team-id ID        Specify Apple Developer Team ID
  --skip-sign         Skip code signing even if certificate available
  --help              Show this help message

Environment Variables:
  DEVELOPER_ID_CERTIFICATE   - Name of Developer ID Application certificate
  APPLE_ID                   - Apple ID for notarization
  APP_SPECIFIC_PASSWORD      - App-specific password for notarization
  TEAM_ID                    - Apple Developer Team ID (optional)

Examples:
  # Build without signing
  ${SCRIPT_NAME} abcdefghijklmnopqrstuvwxyzabcdef

  # Build with signing only
  ${SCRIPT_NAME} --sign abcdefghijklmnopqrstuvwxyzabcdef

  # Build with signing, notarization, and stapling
  APPLE_ID="user@example.com" \\
  APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \\
  ${SCRIPT_NAME} --sign --notarize --staple abcdefghijklmnopqrstuvwxyzabcdef

  # Build with specific certificate
  ${SCRIPT_NAME} --sign --identity "Developer ID Application: Your Name (TEAMID)" \\
      abcdefghijklmnopqrstuvwxyzabcdef
EOF
}

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

parse_arguments() {
    EXT_ID=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --sign)
                SIGN_PACKAGE=true
                shift
                ;;
            --notarize)
                NOTARIZE_PACKAGE=true
                shift
                ;;
            --staple)
                STAPLE_TICKET=true
                shift
                ;;
            --identity)
                CERTIFICATE_IDENTITY="$2"
                shift 2
                ;;
            --team-id)
                TEAM_ID="$2"
                shift 2
                ;;
            --skip-sign)
                SIGN_PACKAGE=false
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
            *)
                if [[ -z "$EXT_ID" ]]; then
                    EXT_ID="$1"
                else
                    log_error "Unexpected argument: $1"
                    show_help
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$EXT_ID" ]]; then
        log_error "CHROME_EXTENSION_ID is required"
        echo ""
        show_help
        exit 1
    fi

    # Validate extension ID format (32 characters)
    if [[ ! "$EXT_ID" =~ ^[a-z]{32}$ ]]; then
        log_warning "Extension ID should be 32 lowercase letters, got: $EXT_ID"
    fi
}

# =============================================================================
# PLATFORM DETECTION
# =============================================================================

check_platform() {
    if [ "$IS_MACOS" != "true" ]; then
        log_warning "Not running on macOS ($PLATFORM). Code signing and notarization will be skipped."
        SIGN_PACKAGE=false
        NOTARIZE_PACKAGE=false
        STAPLE_TICKET=false
        return 1
    fi
    return 0
}

# =============================================================================
# CERTIFICATE DETECTION
# =============================================================================

detect_certificate() {
    if [ -z "$CERTIFICATE_IDENTITY" ]; then
        # Try to auto-detect Developer ID Application certificate
        CERTIFICATE_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null | \
            grep "Developer ID Application" | \
            head -1 | \
            sed 's/.*"\(.*\)".*/\1/')
    fi

    if [ -n "$CERTIFICATE_IDENTITY" ]; then
        log_info "Using certificate: $CERTIFICATE_IDENTITY"
        return 0
    else
        log_warning "No Developer ID certificate found. Binary will use ad-hoc signature."
        return 1
    fi
}

# =============================================================================
# CODE SIGNING
# =============================================================================

sign_binary() {
    local binary_path="$1"

    if [ "$SIGN_PACKAGE" != "true" ]; then
        log_info "Skipping code signing (--sign not specified)"
        return 0
    fi

    if [ "$IS_MACOS" != "true" ]; then
        log_warning "Cannot sign binary: not running on macOS"
        return 1
    fi

    if ! detect_certificate; then
        log_warning "Cannot sign binary: no certificate available"
        return 1
    fi

    log_info "Signing binary: $binary_path"

    # Sign the binary with hardened runtime
    codesign --force \
             --deep \
             --sign "$CERTIFICATE_IDENTITY" \
             --options runtime \
             --timestamp \
             "$binary_path" || {
        log_error "Failed to sign binary"
        return 1
    }

    # Verify signature
    codesign --verify --verbose "$binary_path" || {
        log_error "Signature verification failed"
        return 1
    }

    log_success "Binary signed successfully"
    return 0
}

sign_package() {
    local pkg_path="$1"
    local temp_pkg="${pkg_path}.unsigned"

    if [ "$SIGN_PACKAGE" != "true" ]; then
        log_info "Skipping package signing (--sign not specified)"
        return 0
    fi

    if [ "$IS_MACOS" != "true" ]; then
        log_warning "Cannot sign package: not running on macOS"
        return 1
    fi

    if ! detect_certificate; then
        log_warning "Cannot sign package: no certificate available"
        return 1
    fi

    log_info "Signing package: $pkg_path"

    # Move original to temp
    mv "$pkg_path" "$temp_pkg"

    # Sign the package
    productsign --sign "$CERTIFICATE_IDENTITY" "$temp_pkg" "$pkg_path" || {
        log_error "Failed to sign package"
        mv "$temp_pkg" "$pkg_path"
        return 1
    }

    # Remove temp
    rm "$temp_pkg"

    # Verify signature
    pkgutil --check-signature "$pkg_path" > /dev/null 2>&1 || {
        log_error "Package signature verification failed"
        return 1
    }

    log_success "Package signed successfully"
    return 0
}

# =============================================================================
# NOTARIZATION
# =============================================================================

notarize_package() {
    local pkg_path="$1"

    if [ "$NOTARIZE_PACKAGE" != "true" ]; then
        log_info "Skipping notarization (--notarize not specified)"
        return 0
    fi

    if [ "$IS_MACOS" != "true" ]; then
        log_warning "Cannot notarize package: not running on macOS"
        return 1
    fi

    if [ -z "$APPLE_ID" ] || [ -z "$APP_SPECIFIC_PASSWORD" ]; then
        log_error "Notarization requires APPLE_ID and APP_SPECIFIC_PASSWORD environment variables"
        return 1
    fi

    log_info "Submitting package for notarization..."

    # Build notarytool command
    local notary_cmd=(xcrun notarytool submit "$pkg_path"
        --apple-id "$APPLE_ID"
        --password "$APP_SPECIFIC_PASSWORD"
        --wait
        --output-format json)

    if [ -n "$TEAM_ID" ]; then
        notary_cmd+=(--team-id "$TEAM_ID")
    fi

    # Submit for notarization
    local result
    result=$("${notary_cmd[@]}" 2>&1) || {
        log_error "Failed to submit package for notarization"
        echo "$result"
        return 1
    }

    # Check status from result
    local status
    status=$(echo "$result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

    if [ "$status" = "Accepted" ]; then
        log_success "Package notarization successful"
        return 0
    else
        log_error "Package notarization failed with status: $status"
        echo "$result"
        return 1
    fi
}

# =============================================================================
# STAPLING
# =============================================================================

staple_ticket() {
    local pkg_path="$1"

    if [ "$STAPLE_TICKET" != "true" ]; then
        log_info "Skipping ticket stapling (--staple not specified)"
        return 0
    fi

    if [ "$IS_MACOS" != "true" ]; then
        log_warning "Cannot staple ticket: not running on macOS"
        return 1
    fi

    log_info "Stapling notarization ticket to package..."

    xcrun stapler staple "$pkg_path" || {
        log_error "Failed to staple ticket to package"
        return 1
    }

    # Verify staple
    xcrun stapler validate "$pkg_path" > /dev/null 2>&1 || {
        log_error "Staple validation failed"
        return 1
    }

    log_success "Notarization ticket stapled successfully"
    return 0
}

# =============================================================================
# CLEANUP HANDLER
# =============================================================================

cleanup_on_error() {
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        log_info "Cleaning up after error..."

        # Remove unsigned package if signed version failed
        if [ -n "${PKG_PATH:-}" ] && [ -f "${PKG_PATH}.unsigned" ]; then
            rm -f "${PKG_PATH}.unsigned"
        fi
    fi

    exit $exit_code
}

trap cleanup_on_error EXIT

# =============================================================================
# MAIN BUILD PROCESS
# =============================================================================

main() {
    # Parse arguments
    parse_arguments "$@"

    # Check platform
    check_platform

    # Get version
    VERSION="$(node -p 'require("./package.json").version')"
    ROOT_DIR="$PROJECT_ROOT"
    OUT_DIR="$ROOT_DIR/release/out"
    mkdir -p "$OUT_DIR"

    # Setup stage directory
    STAGE_DIR="$(mktemp -d)"
    trap 'rm -rf "$STAGE_DIR"' EXIT

    # BUG FIX: Create Swift module cache OUTSIDE of STAGE_DIR
    # This prevents the module cache from being included in the package
    SWIFT_MODULE_CACHE_DIR="$(mktemp -d)"
    trap 'rm -rf "$SWIFT_MODULE_CACHE_DIR"' EXIT

    # Create package structure
    APP_DIR="$STAGE_DIR/Library/Application Support/AppleNotesWebClipper"
    SCRIPTS_DIR="$APP_DIR/scripts"
    HOSTS_DIR="$STAGE_DIR/Library/Google/Chrome/NativeMessagingHosts"
    mkdir -p "$SCRIPTS_DIR" "$HOSTS_DIR"

    # Build native host binary
    echo ""
    log_info "Building native host (Swift)…"
    swiftc -O \
           -module-cache-path "$SWIFT_MODULE_CACHE_DIR" \
           "$ROOT_DIR/native_host_macos/NotesBridge.swift" \
           -o "$APP_DIR/notes_bridge"
    chmod 755 "$APP_DIR/notes_bridge"

    # Copy scripts
    cp "$ROOT_DIR/native_host/scripts/create_note.applescript" "$SCRIPTS_DIR/create_note.applescript"

    # Create Chrome native messaging host manifest
    cat > "$HOSTS_DIR/$HOST_NAME.json" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Apple Notes Web Clipper Native Host",
  "path": "/Library/Application Support/AppleNotesWebClipper/notes_bridge",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
JSON

    # Sign binary
    echo ""
    sign_binary "$APP_DIR/notes_bridge"

    # Clean up metadata files
    find "$STAGE_DIR" -name '._*' -delete || true
    xattr -cr "$STAGE_DIR" 2>/dev/null || true

    # Build package
    PKG_PATH="$OUT_DIR/AppleNotesWebClipperNativeHost-$VERSION.pkg"
    echo ""
    log_info "Building pkg…"
    pkgbuild \
        --root "$STAGE_DIR" \
        --filter '(^|/)\\.svn(/|$)' \
        --filter '(^|/)CVS(/|$)' \
        --filter '(^|/)\\.DS_Store$' \
        --filter '(^|/)\\._' \
        --identifier "$PKG_ID" \
        --version "$VERSION" \
        --install-location "/" \
        "$PKG_PATH"

    # Sign package
    echo ""
    sign_package "$PKG_PATH"

    # Notarize package
    echo ""
    notarize_package "$PKG_PATH"

    # Staple ticket
    echo ""
    staple_ticket "$PKG_PATH"

    # Success
    echo ""
    log_success "Built: $PKG_PATH"

    # Show package info
    if [ "$IS_MACOS" = "true" ]; then
        echo ""
        log_info "Package Information:"
        pkgutil --info "$PKG_PATH" 2>/dev/null || true

        if [ "$SIGN_PACKAGE" = "true" ]; then
            echo ""
            log_info "Signature:"
            pkgutil --check-signature "$PKG_PATH" 2>/dev/null || true
        fi

        if [ "$STAPLE_TICKET" = "true" ]; then
            echo ""
            if xcrun stapler validate "$PKG_PATH" >/dev/null 2>&1; then
                log_success "Notarization ticket: Valid"
            else
                log_warning "Notarization ticket: Not found"
            fi
        fi
    fi
}

main "$@"
