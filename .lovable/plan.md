# Popravak crash-a kod uključenih push notifikacija

## Uzrok (potvrđen)

- `android/app/google-services.json` je prazan (0 bajtova)
- `android/app/build.gradle` (linije 62-67) **uvjetno** aplicira `com.google.gms.google-services` plugin samo ako file ima sadržaj
- Trenutno plugin **nije aktivan** → Firebase nije inicijaliziran u APK-u → `PushNotifications.register()` puca u native sloju čim FCM pokuša dohvatiti token
- Zato se u telemetriji vidi `push_listeners_attached`, ali NIKAD `push_native_register_called` (cijeli proces se sruši prije)

## Što treba napraviti

### 1. Upisati Firebase konfiguraciju
Zapisati dostavljeni JSON u `android/app/google-services.json` (project: `vm-balance`, package: `app.lovable.costbuddy` — odgovara appID-u u `capacitor.config.ts`).

### 2. Dodati `POST_NOTIFICATIONS` permission
U `android/app/src/main/AndroidManifest.xml` (uz postojeći `INTERNET`):
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```
Bez ovoga Android 13+ neće prikazati native dialog za dopuštenje.

### 3. Bump verzije aplikacije
- `android/app/build.gradle`: `versionCode` +1, `versionName` → `2.0.3`
- `public/version.json`: `latestVersion: "2.0.3"`, `apkUrl` → `vmbalance-2.0.3.apk`
- `minSupportedVersion` ostaje na trenutnoj vrijednosti (ne forsiramo 2.0.3 dok ne potvrdimo update flow)

### 4. Build i upload APK (radi korisnik)
```
npm install --legacy-peer-deps
npx cap sync android
cd android && ./gradlew assembleRelease
```
Upload `app-release.apk` u Storage kao `releases/vmbalance-2.0.3.apk`.

### 5. Rollout postojećim korisnicima
- Vinka i ostali zaglavljeni na 2.0.2: poslati direktan link na novi APK preko WhatsAppa, instalacija preko postojeće verzije (isti potpis, podaci ostaju)
- Nakon što 5-10 korisnika uspješno pređe na 2.0.3 i u telemetriji vidimo `push_register_token_received`, postaviti `minSupportedVersion: "2.0.3"`

## Što NE diramo

- `src/lib/nativePush.ts` — već ima kompletan try/catch + diagnostic trail (`push_register_start` → `push_perm_checked` → `push_listeners_attached` → `push_native_register_called` → `push_native_register_returned` / `push_register_exception`)
- Capacitor verzije — usklađene (core/android/push-notifications svi v8)
- `apkInstaller.ts` — multi-strategy fallback je već implementiran u prošloj iteraciji

## Verifikacija nakon builda

U `app_diagnostics_logs` mora se pojaviti:
- `push_native_register_called` **i** `push_native_register_returned` (a ne samo prvo s tihim crash-om)
- `push_register_token_received` s `token_prefix`

Ako se umjesto toga loga `push_register_exception`, imamo pravi error iz native sloja (a ne tihi crash) i znamo dalje gdje gledati.

## Datoteke koje će se mijenjati

- `android/app/google-services.json` (popunjavanje)
- `android/app/src/main/AndroidManifest.xml` (jedan novi `<uses-permission>`)
- `android/app/build.gradle` (versionCode, versionName)
- `public/version.json` (latestVersion, apkUrl)

Bez DB migracija, bez izmjena u src/.
