

## Plan: 7 nativnih značajki (bez OTA)

### 1. Push obavijesti (FCM)
- Instalirati `@capacitor/push-notifications`
- Novi hook `src/hooks/usePushNotifications.ts` — registracija tokena, slušanje notifikacija, spremanje tokena u bazu
- DB migracija: nova tablica `push_tokens` (id, user_id, token, platform, created_at)
- Nova edge funkcija `supabase/functions/send-push/index.ts` — šalje FCM prema tokenima
- Nadograditi `src/hooks/useNotificationSound.ts` — na native koristiti push umjesto browser Notification API
- Nadograditi `src/components/SettingsDialog.tsx` — push toggle poziva native registraciju
- **Korisnik mora**: dodati `google-services.json` u `android/app/` iz Firebase Console

### 2. Biometrija (pravi plugin)
- Instalirati `@aparajita/capacitor-biometric-auth`
- Nadograditi `src/contexts/AppLockContext.tsx` — zamijeniti `(window as any).BiometricAuth` s pravim importom, dodati `checkBiometry()` za detekciju hardvera
- Nadograditi `src/components/LockScreen.tsx` — dinamička ikona (Fingerprint vs ScanFace)
- Nadograditi `src/components/SettingsDialog.tsx` — biometric toggle s provjerom dostupnosti

### 3. Haptic feedback
- Instalirati `@capacitor/haptics`
- Novi hook `src/hooks/useHaptics.ts` — `lightTap()`, `mediumTap()`, `successVibration()`, `errorVibration()` (web: no-op)
- Integrirati u:
  - `AddExpenseDialog.tsx` — nakon dodavanja troška
  - `TransactionItem.tsx` — na swipe delete
  - `BottomNav.tsx` — tap na navigaciju
  - `LockScreen.tsx` / `SetPinDialog.tsx` — PIN feedback

### 4. Secure Storage
- Instalirati `capacitor-secure-storage-plugin`
- Novi helper `src/lib/secureStorage.ts` — Keychain/Keystore za PIN i tokene, web fallback na localStorage
- Nadograditi `src/contexts/AppLockContext.tsx` — koristiti secure storage za PIN hash (async API, dodati loading state)

### 5. Deep Linking
- Instalirati `@capacitor/app` (možda već dostupan s core)
- Novi hook `src/hooks/useDeepLinks.ts` — sluša `appUrlOpen`, parsira path, navigira React Routerom
- Integrirati u `src/App.tsx`
- Podržane rute: `/join-family/:id`, `/join-budget/:id`, `/join-project/:id`
- **Korisnik mora**: dodati intent filter u `AndroidManifest.xml` + `assetlinks.json` na vmbalance.com

### 6. In-App Review
- Instalirati `capacitor-rate-app`
- Novi hook `src/hooks/useInAppReview.ts` — prati broj transakcija, nakon 20. poziva native review dijalog (max 1x/60 dana)
- Integrirati u `AddExpenseDialog.tsx`

### 7. GPS lokacija na transakcijama
- Instalirati `@capacitor/geolocation`
- Novi hook `src/hooks/useLocation.ts` — `getCurrentLocation()` + reverse geocoding (Nominatim API)
- DB migracija: dodati `location_name` (text, nullable) i `location_coords` (text, nullable) na `expenses` tablicu
- Nadograditi `AddExpenseDialog.tsx` — toggle "Dodaj lokaciju"
- Nadograditi `TransactionDetailDialog.tsx` — prikaz lokacije

---

### Datoteke za izmjenu/kreiranje

| Akcija | Datoteka |
|--------|----------|
| Novi | `src/hooks/usePushNotifications.ts` |
| Novi | `src/hooks/useHaptics.ts` |
| Novi | `src/hooks/useInAppReview.ts` |
| Novi | `src/hooks/useDeepLinks.ts` |
| Novi | `src/hooks/useLocation.ts` |
| Novi | `src/lib/secureStorage.ts` |
| Novi | `supabase/functions/send-push/index.ts` |
| Migracija | `push_tokens` tablica |
| Migracija | `expenses` — location stupci |
| Izmjena | `src/contexts/AppLockContext.tsx` |
| Izmjena | `src/components/LockScreen.tsx` |
| Izmjena | `src/components/SetPinDialog.tsx` |
| Izmjena | `src/hooks/useNotificationSound.ts` |
| Izmjena | `src/components/SettingsDialog.tsx` |
| Izmjena | `src/components/AddExpenseDialog.tsx` |
| Izmjena | `src/components/TransactionItem.tsx` |
| Izmjena | `src/components/BottomNav.tsx` |
| Izmjena | `src/components/TransactionDetailDialog.tsx` |
| Izmjena | `src/App.tsx` |
| Izmjena | `capacitor.config.ts` |
| Izmjena | `package.json` |

### Novi npm paketi
```
@capacitor/push-notifications
@aparajita/capacitor-biometric-auth
@capacitor/haptics
capacitor-rate-app
capacitor-secure-storage-plugin
@capacitor/app
@capacitor/geolocation
```

### Nakon implementacije
1. `git pull` + `npm install`
2. Za push: dodati `google-services.json` u `android/app/`
3. Za deep linking: intent filter u `AndroidManifest.xml` + `assetlinks.json` na hosting
4. `npx cap sync android` + novi APK build

