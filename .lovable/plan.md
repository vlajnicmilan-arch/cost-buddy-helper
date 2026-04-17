
Cilj: ukloniti “mrtvi” setup ekran u APK-u tako da odabir pohrane i nastavak rade pouzdano na Androidu.

1. Što sam utvrdio
- Problem više nije u tome da je gumb skriven. U trenutnom kodu `StorageSetup` prikazuje CTA, ali svi interaktivni elementi imaju i `onClick` i `onTouchEnd` koji rade `preventDefault()` + `stopPropagation()`.
- To je vrlo vjerojatan uzrok da Android WebView/Samsung Internet proguta dodir i da ekran izgleda kao da “ne reagira”.
- Objavljena `/setup` stranica već pokazuje noviji UI, pa ovo nije samo problem stare verzije APK-a, nego stvarni touch problem na setup ekranu.
- APK učitava `https://vmbalance.com` iz `capacitor.config.ts`, pa frontend popravak mora biti objavljen da bi ga instalirana aplikacija povukla.

2. Plan popravka
- `src/pages/StorageSetup.tsx`
  - maknuti sve custom `onTouchEnd` handlere i helper s `preventDefault/stopPropagation`
  - maknuti `motion.div` wrapper i ostaviti maksimalno jednostavan, statičan ekran
  - pojednostaviti flow: dostupne opcije (`Lokalno`, `Cloud`) postaju direktne akcije velikim gumbima/karticama, bez oslanjanja na “odaberi pa nastavi”
  - ostaviti disabled opcije samo kao informaciju (“Uskoro”)
  - dodati jasan inline loading i error prikaz ako lokalna inicijalizacija padne
- `src/App.tsx`
  - izdvojiti `/setup` kao minimalan ekran bez globalnih overlaya koji mogu presresti dodir
  - na toj ruti ne renderati `LockScreen`, `TutorialOverlay`, `PWAUpdatePrompt`, `OfflineBanner`, `StatusFeedback` ni banner za privatnost
- `src/i18n/locales/hr.json`, `src/i18n/locales/en.json`, `src/i18n/locales/de.json`
  - dodati sve nove tekstove kroz `t()` ključeve, bez hardcoded stringova

3. Tehnički detalji
- Najsumnjiviji pattern je ovaj:
  `onTouchEnd -> preventDefault() -> stopPropagation() -> action()`
- Umjesto toga koristit ću obične React `onClick` evente na standardnim `<button>` elementima.
- Trenutni “Nastavi” je sekundarni problem: ne radi jer se selekcijski state često ni ne postavi. Zato ću ukloniti taj dodatni korak i svesti ekran na direktan izbor.
- Time setup postaje first-run ekran s najmanje moguće logike i bez slojeva iz ostatka aplikacije.

4. Kako ću provjeriti
- provjeriti da “Lokalno” odmah spremi način pohrane i vodi dalje
- provjeriti da “Cloud” odmah vodi na registraciju/prijavu
- provjeriti da ekran nema overlay koji blokira dodir
- provjeriti flow na mobilnom layoutu 384px
- nakon toga treba kliknuti `Update` u Publish dijalogu, jer APK čita objavljenu verziju s `vmbalance.com`
