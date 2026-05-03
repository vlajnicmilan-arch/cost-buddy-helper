## Promjena verzije aplikacije na 1.2.0

Ovo je probni test cijelog lanca: Lovable → vmbalance.com → admin lista u APK-u (preko Live Sync).

### Promjena
- `public/version.json`: `"version": "1.3.10"` → `"version": "1.2.0"`

### Što se događa nakon
- Vite pri buildu čita `public/version.json` i ubacuje vrijednost u `__APP_VERSION__` koja se koristi kroz `src/lib/version.ts`.
- Lovable preview se osvježi odmah; nakon publisha `vmbalance.com` također.
- Postojeći APK-ovi koji učitavaju `vmbalance.com` (Live Sync iz `capacitor.config.ts`) prikazat će `v1.2.0` u admin listi nakon sljedećeg ulaska u app.
- Native dio se ne dira — `android/app/build.gradle` ostaje `versionName "1.0.2"`, novi APK build nije potreban.

### Što ne radimo
- Nema izmjena u `android/`, nema GitHub Actions buildova.
- Nema migracija ni edge funkcija.