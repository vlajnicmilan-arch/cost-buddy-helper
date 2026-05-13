# Fix: kad se uključi business feature, restoriraj i business mode

## Problem
`setBusinessFeatureEnabled(true)` u `AppStateContext` (line 228-237) ne resetira `businessModeEnabled` natrag na `true`. Posljedica: nakon off→on ciklusa, chip ostaje skriven jer `WalletViewModeChips` zahtijeva `businessModeEnabled=true`.

## Promjena

`src/contexts/AppStateContext.tsx`, funkcija `setBusinessFeatureEnabled`:

```ts
const setBusinessFeatureEnabled = useCallback((enabled: boolean) => {
  setBusinessFeatureEnabledState(enabled);
  localStorage.setItem('business_feature_enabled', enabled.toString());
  if (!enabled) {
    setBusinessModeEnabledState(false);
    localStorage.setItem('business_mode_enabled', 'false');
  } else {
    // Restore business view when feature is re-enabled
    setBusinessModeEnabledState(true);
    localStorage.setItem('business_mode_enabled', 'true');
  }
}, []);
```

## Verifikacija
- Toggle off → chip nestaje, view = personal ✓ (već radi)
- Toggle on → `businessModeEnabled` se vraća na `true`, chipovi se vrate, posljednja aktivna tvrtka se vrati (jer `activeBusinessProfileId` nikad nije obrisan)
