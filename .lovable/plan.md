

## Problem Analysis

The StorageSetup page (`/setup`) loads correctly, but on a fresh APK install, two issues likely combine to make it seem like "nothing happens":

1. **GDPR Cookie Consent Banner blocks the Continue button**: On fresh install, `CookieConsentBanner` appears at `z-[9999]` fixed to the bottom of the screen. The StorageSetup page has the "Nastavi" (Continue) button near the bottom. The banner overlays and blocks the button, making it untappable.

2. **Subtle selection feedback**: When a user taps a storage option, only a small checkmark and border color change occur. If the Continue button is hidden behind the GDPR banner, the user has no way to proceed, making it feel like "nothing works."

## Fix Plan

### 1. Hide GDPR banner on StorageSetup page
- In `CookieConsentBanner.tsx`, check the current route. If on `/setup`, don't render the banner (or delay it until the user leaves setup).

### 2. Adjust StorageSetup layout for small screens  
- Add bottom padding (`pb-24`) to the StorageSetup container so the Continue button isn't hidden behind any overlapping elements.
- Ensure the page scrolls properly on small devices (`overflow-y-auto` instead of centering everything with `justify-center` which can clip content).

### 3. Add console.log for debugging
- Add a temporary `console.log` in the storage option `onClick` handler to confirm taps are registering, in case the issue persists.

### Files to modify
- `src/components/CookieConsentBanner.tsx` — suppress on `/setup` route
- `src/pages/StorageSetup.tsx` — fix layout for small screens with bottom padding

