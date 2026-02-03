# Building macOS Native Host Package

This guide explains how to build, sign, and notarize the macOS native host package for Apple Notes Web Clipper.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Getting Certificates](#getting-certificates)
- [Code Signing](#code-signing)
- [Notarization](#notarization)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required

- **macOS 10.13 or later**
- **Xcode Command Line Tools** - Install with `xcode-select --install`
- **Swift compiler** - Comes with Xcode Command Line Tools
- **Node.js/npm** - For building the extension

### Optional (for signing and notarization)

- **Apple Developer Account** - For code signing certificates
- **Developer ID Application Certificate** - For signing binaries
- **App-Specific Password** - For notarization

## Quick Start

### Basic Build (No Signing)

This creates an unsigned package suitable for local development:

```bash
./release/build_macos_native_host_pkg.sh abcdefghijklmnopqrstuvwxyzabcdef
```

The package will be created at `release/out/AppleNotesWebClipperNativeHost-<version>.pkg`

**Note**: Unsigned packages may show security warnings on macOS 15+ and require manual approval to install.

### Finding Your Extension ID

To get your Chrome extension ID:

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Find your extension and copy its ID (32 lowercase letters)

## Getting Certificates

### 1. Developer ID Application Certificate

This certificate is required for code signing binaries and packages.

**How to get it:**

1. Open **Xcode**
2. Go to **Xcode > Preferences > Accounts**
3. Select your **Apple ID**
4. Click **Manage Certificates...**
5. Click the **+** button
6. Select **Developer ID Application**
7. Click **Done**

**Verify installation:**

```bash
./scripts/check_certificate.sh
```

Or manually:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

### 2. App-Specific Password for Notarization

This password is required for submitting packages to Apple's notarization service.

**How to generate it:**

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in with your Apple ID
3. Go to **Security** section
4. Click **App-Specific Passwords**
5. Click **+** or **Generate Password**
6. Enter a label (e.g., "Notarization")
7. Copy the generated password (format: `abcd-efgh-ijkl-mnop`)

**Important:** Store this password securely. You'll only see it once!

## Code Signing

### Sign with Auto-Detected Certificate

If you have a Developer ID Application certificate installed, it will be auto-detected:

```bash
./release/build_macos_native_host_pkg.sh --sign abcdefghijklmnopqrstuvwxyzabcdef
```

### Sign with Specific Certificate

To use a specific certificate:

```bash
./release/build_macos_native_host_pkg.sh --sign \
  --identity "Developer ID Application: Your Name (TEAMID)" \
  abcdefghijklmnopqrstuvwxyzabcdef
```

### Sign with Environment Variable

Set the certificate identity as an environment variable:

```bash
export DEVELOPER_ID_CERTIFICATE="Developer ID Application: Your Name (TEAMID)"
./release/build_macos_native_host_pkg.sh --sign abcdefghijklmnopqrstuvwxyzabcdef
```

### What Gets Signed

When you use `--sign`:

1. **Binary** - The `notes_bridge` executable is signed with hardened runtime
2. **Package** - The `.pkg` file is signed for distribution

### Verify Signature

To verify a signed package:

```bash
pkgutil --check-signature release/out/AppleNotesWebClipperNativeHost-*.pkg
```

## Notarization

Notarization is required for smooth installation on macOS 15+.

### Full Notarization Workflow

This signs, notarizes, and staples the package:

```bash
export APPLE_ID="your-apple-id@example.com"
export APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"

./release/build_macos_native_host_pkg.sh \
  --sign --notarize --staple \
  abcdefghijklmnopqrstuvwxyzabcdef
```

### What Happens During Notarization

1. **Sign** - Binary and package are signed
2. **Submit** - Package is uploaded to Apple's notarization service
3. **Wait** - Script waits for Apple to process (typically 1-3 minutes)
4. **Staple** - Notarization ticket is attached to the package

### With Team ID

If you're part of multiple developer teams:

```bash
export APPLE_ID="your-apple-id@example.com"
export APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export TEAM_ID="YOUR_TEAM_ID"

./release/build_macos_native_host_pkg.sh \
  --sign --notarize --staple \
  abcdefghijklmnopqrstuvwxyzabcdef
```

### Verify Notarization

To check if a package has a valid notarization ticket:

```bash
xcrun stapler validate release/out/AppleNotesWebClipperNativeHost-*.pkg
```

To view notarization history:

```bash
xcrun notarytool history
```

## Build Options

### Command-Line Options

```
Usage: ./release/build_macos_native_host_pkg.sh [OPTIONS] <CHROME_EXTENSION_ID>

Options:
  --sign              Enable code signing
  --notarize          Enable notarization
  --staple            Staple notarization ticket
  --identity ID       Specify certificate identity
  --team-id ID        Specify Apple Developer Team ID
  --skip-sign         Skip code signing
  --help              Show help message
```

### Environment Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `DEVELOPER_ID_CERTIFICATE` | Certificate identity | Signing |
| `APPLE_ID` | Your Apple ID email | Notarization |
| `APP_SPECIFIC_PASSWORD` | App-specific password | Notarization |
| `TEAM_ID` | Apple Developer Team ID | Notarization (optional) |

## Examples

### Development Build

```bash
./release/build_macos_native_host_pkg.sh abcdefghijklmnopqrstuvwxyzabcdef
```

### Signed Build for Distribution

```bash
./release/build_macos_native_host_pkg.sh --sign abcdefghijklmnopqrstuvwxyzabcdef
```

### Full Production Build

```bash
export APPLE_ID="you@example.com"
export APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"

./release/build_macos_native_host_pkg.sh \
  --sign --notarize --staple \
  abcdefghijklmnopqrstuvwxyzabcdef
```

### CI/CD Build (GitHub Actions)

```yaml
- name: Build macOS Package
  env:
    DEVELOPER_ID_CERTIFICATE: ${{ secrets.DEVELOPER_ID_CERTIFICATE }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APP_SPECIFIC_PASSWORD: ${{ secrets.APP_SPECIFIC_PASSWORD }}
  run: |
    ./release/build_macos_native_host_pkg.sh \
      --sign --notarize --staple \
      ${{ env.EXTENSION_ID }}
```

## Troubleshooting

### "No suitable certificate found"

**Cause:** No Developer ID Application certificate installed.

**Solution:**
1. Run `./scripts/check_certificate.sh` to verify
2. Install certificate via Xcode (see [Getting Certificates](#getting-certificates))

### "Certificate does not exist"

**Cause:** The specified certificate identity doesn't match installed certificates.

**Solution:**
```bash
# List all certificates
security find-identity -v -p codesigning

# Copy the exact identity string and use it:
./release/build_macos_native_host_pkg.sh --sign \
  --identity "Exact identity from above" \
  abcdefghijklmnopqrstuvwxyzabcdef
```

### Notarization Fails

**Cause:** Invalid credentials or network issues.

**Solution:**
1. Verify your Apple ID is correct
2. Generate a new app-specific password
3. Check internet connection
4. View notarization history: `xcrun notarytool history`

### "User canceled the prompt"

**Cause:** Keychain access denied during signing.

**Solution:**
```bash
# Unlock keychain
security unlock-keychain ~/Library/Keychains/login.keychain-db

# Or add certificate to system keychain
```

### Build Fails on Linux

**Cause:** Code signing only works on macOS.

**Solution:** The script will automatically skip signing/notarization on non-macOS platforms. This is expected behavior.

### Package Installation Blocked

**Cause:** Unsigned or unnotarized package on macOS 15+.

**Solution:**
1. Build with `--sign --notarize --staple` flags
2. Or manually allow installation in System Settings > Privacy & Security

## Cross-Platform Builds

The build script works on non-macOS platforms with graceful degradation:

```bash
# On Linux
./release/build_macos_native_host_pkg.sh abcdefghijklmnopqrstuvwxyzabcdef
# Output: [WARNING] Not running on macOS. Skipping signing/notarization.
# Result: Unsigned package is built successfully
```

## Security Notes

### Credential Handling

- **Never hardcode credentials** in scripts or source code
- **Use environment variables** for sensitive data
- **Add `.env` to `.gitignore`** if using environment files
- **Use CI/CD secrets** for automated builds

### Certificate Security

- Keep your Developer ID certificates secure
- Don't share certificate .p12 files
- Use strong passwords for certificate export
- Revoke compromised certificates immediately

## Additional Resources

- [Apple Code Signing Guide](https://developer.apple.com/support/code-signing/)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Notarytool Documentation](https://developer.apple.com/documentation/security/notarytool)

## Bug Fixes Included

This build script includes a fix for the `.swift-module-cache` bug where build artifacts were being included in the package. The module cache is now created in a temporary directory outside the staging area.
