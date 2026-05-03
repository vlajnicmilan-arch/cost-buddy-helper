#!/usr/bin/env bash
# ============================================================
#  V&M Balance - One-click Android Debug APK build (macOS/Linux)
# ============================================================
set -e

echo ""
echo "========================================"
echo "  V&M Balance - Build APK"
echo "========================================"
echo ""

echo "[1/5] npm install..."
npm install --legacy-peer-deps

echo ""
echo "[2/5] Vite build..."
npm run build

echo ""
echo "[3/5] Capacitor sync (android)..."
npx cap sync android

echo ""
echo "[4/5] Gradle clean + assembleDebug..."
cd android
./gradlew clean assembleDebug
cd ..

echo ""
echo "[5/5] Copying APK to project root..."
APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK_SRC" ]; then
  echo "APK not found at $APK_SRC"
  exit 1
fi
STAMP=$(date +%Y%m%d-%H%M)
cp "$APK_SRC" "vmbalance-debug-${STAMP}.apk"

echo ""
echo "========================================"
echo "  DONE: vmbalance-debug-${STAMP}.apk"
echo "========================================"
