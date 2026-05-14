Utvrđeno stanje:
- Lokalno je `public/version.json` već na `2.0.5`.
- Ali stvarno objavljeni URL-ovi još vraćaju `2.0.4`:
  - `https://cost-buddy-helper.lovable.app/version.json`
  - `https://www.vmbalance.com/version.json`
- APK `vmbalance-2.0.5.apk` postoji i vraća HTTP 200.
- Zato aplikacija i dalje ne prikazuje notifikaciju: instalirana verzija i objavljeni manifest koji app čita nisu u stanju `remote > installed`.

Plan popravka:
1. Ugraditi stabilniji izvor manifest-a
   - Update checker će prvo čitati `version.json` s objavljenog web URL-a kao i sada.
   - Dodati fallback na Lovable Cloud storage manifest ako web publish kasni ili ostane star.
   - Time nova APK datoteka neće ovisiti samo o tome je li frontend publish već osvježio `/version.json`.

2. Dodati jasniji debug logging
   - Logirati sve pokušane manifest URL-ove.
   - Logirati instaliranu verziju, remote verziju, `minSupportedVersion`, `apkUrl` i razlog zašto dialog nije prikazan.
   - To će omogućiti da se ubuduće odmah vidi je li problem manifest, cache, dismiss flag ili verzijska usporedba.

3. Provjeriti manual check flow
   - `checkForNativeUpdates()` trenutno samo dispatch-a event ako postoji update.
   - Uskladiti ga da koristi isti manifest/fallback flow i da ručna provjera ne završi lažno s “ažurno” dok postoji noviji APK.

4. Version bump jer je native/update ponašanje dio APK-a
   - Budući da promjena utječe na native app update flow, napraviti obavezni bump:
     - `public/version.json` na sljedeću verziju
     - `android/app/build.gradle` `versionCode +1` i `versionName`
   - To je u skladu s novim pravilom: svaka native promjena mora imati version bump.

5. Verifikacija prije završetka
   - Ponovno dohvatiti objavljeni `version.json` i APK URL.
   - Provjeriti da novi APK URL postoji.
   - Provjeriti da logika verzijske usporedbe za instaliranu stariju verziju vraća update available.