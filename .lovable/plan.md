Žao mi je. Ovaj put sam provjerio konkretno stanje u repozitoriju i postoje dva provjerljiva problema:

1. APK login trenutno koristi `redirectTo: app.lovable.costbuddy://auth/callback`, ali u stvarnom toku to može ostaviti sesiju u vanjskom browseru/PWA umjesto u WebView-u APK-a. To objašnjava zašto si završio u PWA.
2. Logo nije promijenjen jer su PNG launcher ikone zamijenjene, ali su u Android resursima i dalje ostali stari adaptive-icon XML slojevi:
   - `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` još sadrži stari Capacitor Android robot.
   - `android/app/src/main/res/drawable/ic_launcher_background.xml` još sadrži stari Capacitor grid.
   - `android/app/src/main/res/values/ic_launcher_background.xml` je još bijela pozadina.
   - `mipmap-anydpi-v26/ic_launcher.xml` koristi adaptive icon sloj, pa Android 8+ može ignorirati nove PNG fallback ikone i prikazati stari XML sloj. Ovo se poklapa s tvojim screenshotom starog loga.

Plan popravka:

1. Popraviti native OAuth tok bez slanja korisnika u PWA
   - Vratiti OAuth redirect na HTTPS callback rutu koju hosting i auth provider sigurno prihvaćaju:
     `https://vmbalance.com/native-oauth/callback`
   - `NativeOAuthCallback` zadržati samo kao most koji odmah pretvara callback u native deep link:
     `app.lovable.costbuddy://auth/callback?...`
   - Gumb “Otvori V&M Balance” promijeniti na Android intent URL s package-om:
     `intent://auth/callback?...#Intent;scheme=app.lovable.costbuddy;package=app.lovable.costbuddy;end`
   - Time browser neće otvoriti `/app` PWA kao završnu destinaciju, nego će callback pokušati otvoriti instalirani APK po package name-u.

2. Pojačati Android intent-filter da hvata točan OAuth callback
   - U `AndroidManifest.xml` dodati precizniji filter uz postojeći scheme:
     - scheme: `app.lovable.costbuddy`
     - host: `auth`
     - pathPrefix: `/callback`
   - Ostaviti postojeći opći filter za kompatibilnost s drugim deep linkovima.

3. Trajno ukloniti stari Android logo iz svih native resursa
   - Zamijeniti ili ukloniti stare XML adaptive-icon slojeve koji trenutno nose Capacitor robot/grid.
   - Promijeniti `mipmap-anydpi-v26/ic_launcher.xml` i `ic_launcher_round.xml` da koriste nove bitmap drawable slojeve, ne stare XML slojeve.
   - Postaviti adaptive background na tamni slate (`#0F172A`) umjesto bijele.
   - Zadržati/generirati sve PNG launcher i splash datoteke iz provjerenog `src/assets/logo.png`.

4. Dodati provjerljiv “build marker” za APK
   - Povisiti `versionCode`/`versionName` u `android/app/build.gradle`, npr. na `versionCode 2` i `versionName "1.0.1"`, da na mobitelu bude jasno da se instalirao novi APK, a ne stari.

5. Dodati zaštitu protiv ponavljanja ovog problema
   - Dodati kratku skriptu/napomenu u projekt koja pri budućim buildovima provjerava da Android resursi ne sadrže stare Capacitor XML ikone (`M32,64`, `#26A69A`, grid path itd.).
   - Time idući put ne možemo “misliti” da je logo zamijenjen dok Android 8+ i dalje koristi stari adaptive layer.

Nakon implementacije bit će obavezno napraviti clean native build, ne samo web build:

```text
git pull
npm install --legacy-peer-deps
npm run build
npx cap sync android
```

Zatim u Android Studio:

```text
Build -> Clean Project
Build -> Rebuild Project
Build -> Build APK(s)
```

Na mobitelu prije instalacije:

```text
Deinstalirati V&M Balance
Deinstalirati PWA ikonu / Add-to-home-screen verziju ako postoji
Instalirati novi APK
```

Razlog za deinstalaciju PWA je taj što sada vidimo da Android/Samsung Browser može preusmjeravanje vezati uz PWA iskustvo na `vmbalance.com`, a ne uz APK. Nakon novog APK-a i intent URL-a to više ne bi smjelo biti primarni tok, ali za test treba ukloniti PWA da ne maskira rezultat.

Ako odobriš, u sljedećem koraku ću napraviti ove izmjene u kodu i resursima.