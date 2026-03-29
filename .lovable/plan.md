

## Problem

When you tap "Check for updates" in the native app, the version check fails because it tries to fetch `version.json` from the old Lovable domain (`cost-buddy-helper.lovable.app`), but the WebView is now loaded from `vmbalance.com`. This causes a CORS (cross-origin) error and the fetch fails.

## Fix

**File: `src/components/PWAUpdatePrompt.tsx`**

Change `LIVE_APP_ORIGIN` from `https://cost-buddy-helper.lovable.app` to `https://vmbalance.com` so the version check fetches from the same domain the app is running on.

This is a one-line change. After publishing, the native app will automatically pick up the fix (since it uses Live Sync) — no APK rebuild needed.

