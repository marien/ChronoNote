#!/usr/bin/env bash
# Builds a release APK for 64-bit ARM phones (every current Samsung/Pixel),
# aligns and signs it with the release key, and verifies the result.
#
# Secrets live OUTSIDE the repo and outside OneDrive:
#   $CHRONONOTE_SIGNING_DIR/chrononote-release.jks   the keystore
#   $CHRONONOTE_SIGNING_DIR/release.properties       storeFile / keyAlias / passwords
# (default dir: ~/.chrononote-signing). BACK BOTH UP: every future update of an
# app installed from this build — and any store listing — must be signed with
# this same key, and it cannot be recreated.
#
# Output: $CHRONONOTE_RELEASE_DIR/ChronoNote_<version>_arm64.apk
# (default dir: ~/.chrononote-android-release). Install with
#   adb install -r <apk>      or copy it to the phone and open it.
#
# Usage:  scripts/android-release.sh
# Needs:  Node, Rust (with the aarch64-linux-android target — for the pinned
#         1.95.0 toolchain: `rustup +1.95.0 target add aarch64-linux-android`),
#         the Android SDK (ANDROID_HOME, NDK_HOME) and a JDK (JAVA_HOME).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIGN_DIR="${CHRONONOTE_SIGNING_DIR:-$HOME/.chrononote-signing}"
OUT_DIR="${CHRONONOTE_RELEASE_DIR:-$HOME/.chrononote-android-release}"
PROPS="$SIGN_DIR/release.properties"
ABI_TARGET="${CHRONONOTE_ABI:-aarch64}"

[ -f "$PROPS" ] || { echo "Missing $PROPS — create the keystore first (see the header of this script)." >&2; exit 1; }
prop() { grep "^$1=" "$PROPS" | head -1 | cut -d= -f2-; }
KEYSTORE="$(prop storeFile)"; ALIAS="$(prop keyAlias)"
[ -f "$KEYSTORE" ] || { echo "Keystore not found: $KEYSTORE" >&2; exit 1; }

: "${ANDROID_HOME:=${LOCALAPPDATA:-$HOME}/Android/Sdk}"
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
ZIPALIGN="$BUILD_TOOLS/zipalign"; APKSIGNER="$BUILD_TOOLS/apksigner.bat"
[ -f "$APKSIGNER" ] || APKSIGNER="$BUILD_TOOLS/apksigner"
AAPT="$BUILD_TOOLS/aapt"

# Keeps the Rust build out of the (OneDrive-synced) checkout: Gradle's Rust
# plugin ignores src-tauri/.cargo/config.toml, so without this every build
# writes GBs into src-tauri/target.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cargo-target/chrononote-android-1950}"

if [ "${CHRONONOTE_SKIP_BUILD:-}" = "1" ]; then
  echo "==> Skipping the build (CHRONONOTE_SKIP_BUILD=1) — signing the newest existing release APK."
else
  echo "==> Building the release APK ($ABI_TARGET)…"
  (cd "$ROOT" && npx tauri android build --apk --target "$ABI_TARGET")
fi

# Gradle output is redirected outside the repo by ~/.gradle/init.d on the
# maintainer's machine; fall back to the in-repo location elsewhere.
# (`|| true`: find exits nonzero when one of the two folders doesn't exist,
# which `set -e` + `pipefail` would otherwise turn into a silent abort.)
UNSIGNED="$( { find "$HOME/.gradle-build" "$ROOT/src-tauri/gen/android/app/build" \
  -name '*release-unsigned.apk' -printf '%T@ %p\n' 2>/dev/null || true; } | sort -n | tail -1 | cut -d' ' -f2-)"
[ -n "$UNSIGNED" ] || { echo "Couldn't find the unsigned release APK." >&2; exit 1; }
echo "==> Unsigned APK: $UNSIGNED"

VERSION="$(grep -m1 '"version"' "$ROOT/package.json" | sed -E 's/.*"version": *"([^"]+)".*/\1/')"
mkdir -p "$OUT_DIR"
ALIGNED="$OUT_DIR/.aligned.apk"
case "$ABI_TARGET" in aarch64) ABI_NAME=arm64 ;; *) ABI_NAME="$ABI_TARGET" ;; esac
FINAL="$OUT_DIR/ChronoNote_${VERSION}_${ABI_NAME}.apk"
rm -f "$ALIGNED" "$FINAL"

echo "==> Aligning and signing…"
"$ZIPALIGN" -p -f 4 "$UNSIGNED" "$ALIGNED"
# Passwords go through the environment, not the command line.
KS_PASS="$(prop storePassword)" KEY_PASS="$(prop keyPassword)" \
  "$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias "$ALIAS" \
  --ks-pass env:KS_PASS --key-pass env:KEY_PASS --out "$FINAL" "$ALIGNED"
rm -f "$ALIGNED" "$FINAL.idsig"

echo "==> Verifying…"
"$APKSIGNER" verify --verbose --print-certs "$FINAL" | grep -E "Verifies|Verified using|certificate SHA-256|Number of signers"
"$AAPT" dump badging "$FINAL" | grep -E "^package:|^native-code:|^sdkVersion:|^targetSdkVersion:"
echo
echo "Signed APK: $FINAL"
echo "SHA-256:    $(sha256sum "$FINAL" | cut -d' ' -f1)"
ls -lh "$FINAL" | awk '{print "Size:       " $5}'
