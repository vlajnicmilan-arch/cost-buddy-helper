
Problem

Tvoj trenutni problem više nije Git niti APK timestamp, nego konkretan Android build error:

```text
getDefaultProguardFile('proguard-android.txt') is no longer supported
```

To znači da je lokalni Android projekt u Android Studiju nadograđen na noviji Android Gradle Plugin, ali barem jedan `build.gradle` još koristi staru ProGuard postavku. Zato build puca prije nego se novi APK uopće napravi.

Što sam potvrdio iz projekta

- `capacitor.config.ts` i dalje koristi live web:
  - `https://vmbalance.com?forceHideBadge=true`
- `package.json` koristi Capacitor 8 pakete
- u web kodu već postoji runtime dijagnostika i dinamička verzija (`APP_VERSION`)
- screenshot pokazuje da build puca u lokalnom `android/app/build.gradle`
- u ovom repo snapshotu nema `android/` mape, pa je problem u tvom lokalno generiranom Android projektu, ne u React dijelu repo-a

Root cause

Imaš 2 odvojena problema koji se preklapaju:

1. Android build trenutno ne prolazi
- zbog zastarjele Gradle/ProGuard konfiguracije u lokalnoj `android` mapi

2. Čak i kad build prođe, app koristi remote web preko `server.url`
- zato bez objave najnovije web verzije APK može otvoriti stariji sadržaj

Plan popravka

1. Popraviti lokalni Android build
- U lokalnom `android/app/build.gradle` zamijeniti:
  ```gradle
  getDefaultProguardFile('proguard-android.txt')
  ```
  sa:
  ```gradle
  getDefaultProguardFile('proguard-android-optimize.txt')
  ```
- Provjeriti postoji li ista stara vrijednost i u plugin modulima ako build nakon toga i dalje puca

2. Izbjeći ručno krpanje ako je Android projekt zastario
- Najsigurniji pristup je regenerirati `android` platformu iz roota projekta:
  ```text
  npx cap add android
  npx cap sync android
  ```
- To je posebno važno jer screenshot pokazuje da lokalni native projekt vjerojatno nije potpuno usklađen s trenutnim npm paketima

3. Uskladiti native projekt s trenutnim Capacitor paketima
- Provjeriti da lokalni Android projekt stvarno povlači aktualne pluginove:
  - biometric auth
  - camera
  - push notifications
  - haptics
  - secure/native storage povezane module
- Ako ne, novi APK opet neće odražavati zadnje native promjene

4. Zadržati svijest o live-sync ponašanju
- Pošto `capacitor.config.ts` ima `server.url`, APK će i dalje učitavati objavljeni web
- Zato za vidljive UI promjene treba i:
  - objaviti novu web verziju
- Za nove native pluginove treba i:
  - sync Android projekta
  - novi APK build

5. Provjera nakon popravka
- U aplikaciji otvoriti Runtime dijagnostiku i provjeriti:
  - `Runtime = Native`
  - `APP_VERSION`
  - `Origin`
  - remote verziju
- Time ćeš odmah znati gleda li APK novi native shell i koju web verziju učitava

Datoteke / mjesta koja treba dirati

- Lokalno na računalu:
  - `android/app/build.gradle`
  - po potrebi i drugi lokalni `android/*/build.gradle` moduli ako isti error ostane
- U repo logici već relevantno:
  - `capacitor.config.ts`
  - `src/components/update/RuntimeDiagnostics.tsx`
  - `src/components/update/updateUtils.ts`
  - `src/components/SettingsDialog.tsx`

Napomena o implementaciji

Pošto sam sada u read-only modu i `android/` mapa nije prisutna u ovom snapshotu, ne mogu direktno izmijeniti lokalni Gradle file. Kad odobriš implementaciju u normalnom modu, ispravan smjer je:
- ili promijeniti plan tako da app koristi bundled `dist` za release build
- ili ostaviti live-sync, ali jasno odvojiti:
  - web publish korak
  - native sync/build korak
