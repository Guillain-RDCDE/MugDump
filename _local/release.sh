#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DMG DarkRoom — local macOS release script
#
# Usage:
#   ./_local/release.sh           → build + sign + notarize
#   ./_local/release.sh --no-sign → build only (for testing)
#
# Requirements:
#   - Node.js + npm
#   - Xcode Command Line Tools (for codesign / notarytool)
#   - Developer ID Application: Stephen McLeod Blythe (2N9AC8M66C)
#   - Notarisation keychain profile: LOOPSAB_NOTARY
#     (create with: xcrun notarytool store-credentials LOOPSAB_NOTARY ...)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

SIGN="${1:-}"

echo "╔══════════════════════════════════════╗"
echo "║  DMG DarkRoom — release.sh           ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Check version ──────────────────────────────────────────────────────────
VERSION=$(node -p "require('./package.json').version")
echo "▶ Building v${VERSION}..."
echo ""

# ── Sync docs/ (web app uses symlinks, but verify they're intact) ───────────
echo "▶ Checking docs/ symlinks..."
for f in js/gbcam.js js/palettes.js js/app.js css/style.css; do
  if [ ! -e "docs/$f" ]; then
    echo "  ⚠ docs/$f missing — re-linking..."
    case "$f" in
      js/gbcam.js)    ln -sf ../../renderer/js/gbcam.js    docs/js/gbcam.js ;;
      js/palettes.js) ln -sf ../../renderer/js/palettes.js docs/js/palettes.js ;;
      js/app.js)      ln -sf ../../renderer/js/app.js      docs/js/app.js ;;
      css/style.css)  ln -sf ../../renderer/css/style.css  docs/css/style.css ;;
    esac
  fi
done
echo ""

# ── Install deps ────────────────────────────────────────────────────────────
echo "▶ Installing dependencies..."
npm install
echo ""

# ── Build ───────────────────────────────────────────────────────────────────
echo "▶ Running electron-builder (universal macOS)..."
npx electron-builder --mac --x64 --arm64 \
  --config.mac.identity="Developer ID Application: Stephen McLeod Blythe (2N9AC8M66C)"
echo ""

if [[ "$SIGN" == "--no-sign" ]]; then
  echo "▶ Skipping notarization (--no-sign)"
  echo ""
  echo "✓ Build complete. DMG is in dist/"
  exit 0
fi

# ── Notarize ────────────────────────────────────────────────────────────────
DMG=$(ls dist/*.dmg 2>/dev/null | head -1)
if [[ -z "$DMG" ]]; then
  echo "✗ No .dmg found in dist/ — build may have failed"
  exit 1
fi

echo "▶ Notarizing: $(basename "$DMG")..."
xcrun notarytool submit "$DMG" \
  --keychain-profile "LOOPSAB_NOTARY" \
  --wait
echo ""

echo "▶ Stapling..."
xcrun stapler staple "$DMG"
echo ""

echo "✓ Done: $DMG"
echo "  Version: $VERSION"
open dist/
