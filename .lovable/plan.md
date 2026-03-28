
Plan: Ispravak Android APK-a koji se i dalje instalira kao "Trošak" i prikazuje bijeli ekran

1. Što je stvarni problem
- Naziv u Android installeru ne dolazi iz web aplikacije nego iz nativnog Android projekta.
- U kodu je `capacitor.config.ts` već postavljen na `appName: 'V&M Balance'`, ali to samo po sebi ne mijenja već ranije generirani lokalni Android projekt.
- U snapshotu projekta i dalje postoji `server` blok u `capacitor.config.ts`, što znači da APK još učitava remote preview URL umjesto lokalnog `dist/` builda.
- `PWAUpdatePrompt` se i dalje renderira i u nativnoj aplikaciji te pokušava raditi PWA update provjeru; toast "Provjera nije uspjela" dolazi upravo od tamo.
- Do I know what the issue is? Da: kombinacija zastarjelog native app name-a u lokalnom Android projektu + pogrešan production Capacitor config + PWA update logika aktivna u native shellu.

2. Što treba promijeniti
- `capacitor.config.ts`
  - ukloniti cijeli `server` blok za production build
  - zadržati `appName: 'V&M Balance'`
- `src/components/PWAUpdatePrompt.tsx`
  - onemogućiti PWA update provjeru na native platformi
  - u native okruženju komponenta treba vratiti `null` ili preskočiti `useRegisterSW` logiku i `fetch('/version.json')`
- Lokalni Android projekt korisnika
  - provjeriti `android/app/src/main/res/values/strings.xml`
  - osigurati da je `app_name` = `V&M Balance`
  - po potrebi provjeriti `android/app/src/main/AndroidManifest.xml` da koristi `@string/app_name`

3. Preporučeni redoslijed implementacije
- Prvo popraviti repo da production build više ne koristi remote preview i da native ne vrti PWA update check.
- Zatim uskladiti lokalni Android projekt:
  - ili ručno promijeniti `strings.xml`
  - ili regenerirati/sinkronizirati Android platformu nakon ispravnog Capacitor configa
- Nakon toga napraviti novi build APK-a.

4. Zašto se sada vidi "Trošak"
- Screenshot instalera pokazuje da je naziv već ugrađen u APK.
- To znači da lokalni Android resursi još nisu ažurirani, čak i ako je web kod već promijenjen na `V&M Balance`.

5. Zašto aplikacija “ne radi”
- Bijeli ekran uz toast "Provjera nije uspjela" pokazuje da native app izvršava PWA update mehanizam koji nije prikladan za APK build.
- Dodatno, ako `server.url` ostane aktivan, aplikacija ovisi o remote preview adresi umjesto o lokalno ugrađenim datotekama, što je pogrešno za instalirani APK.

6. Tehnički detalji
- Repo datoteke za izmjenu:
  - `capacitor.config.ts`
  - `src/components/PWAUpdatePrompt.tsx`
- Lokalne native datoteke za provjeru na korisnikovom računalu:
  - `android/app/src/main/res/values/strings.xml`
  - `android/app/src/main/AndroidManifest.xml`
- Očekivani rezultat:
  - installer prikazuje `V&M Balance`
  - aplikacija se otvara bez PWA update greške
  - APK koristi lokalni build, ne remote preview

7. Verifikacija nakon popravka
- napraviti novi APK nakon synca/builda
- provjeriti da installer više ne prikazuje `Trošak`
- otvoriti aplikaciju i potvrditi da nema toasta "Provjera nije uspjela"
- testirati cold start nakon svježe instalacije na telefonu
