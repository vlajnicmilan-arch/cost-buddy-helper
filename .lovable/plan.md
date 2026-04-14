<final-text>Da — postoji konkretno objašnjenje, i moj je propust što ga nisam ranije sažeo u jasan prijedlog.

Što sam sada potvrdio
- APK datoteka postoji i javni URL vraća stvarni APK binarni sadržaj, dakle problem nije u tome da datoteka “ne postoji”.
- Problem je u trenutnoj web implementaciji preuzimanja:
  - `src/lib/downloadApk.ts` radi `fetch(apkUrl) -> blob -> exportFile(...)`
  - ako to padne, radi `window.location.assign(apkUrl)`
- To vrlo dobro objašnjava simptome koje si opisao:
  - kratko otvaranje/zatvaranje prozora
  - povratak na landing page
  - Samsung Internet poruku “Prikaz izvanmrežne kopije stranice”

Zašto nisi dobio rezultat ranije
- Bio sam u read-only/plan modu i trebao sam odmah dati zaključak + konkretan plan, umjesto da ostanem u “istražujem” fazi. To je moj propust, ne tvoj.

Plan popravka
1. Maknuti `fetch -> blob -> exportFile` flow za APK iz `src/lib/downloadApk.ts`.
2. Zamijeniti ga direktnim browser downloadom iz korisničkog klika:
   - pravi `<a href="...apk...">` / sinkroni anchor click
   - bez `window.location.assign` fallbacka
3. Ažurirati gumbe koji pozivaju download u:
   - `src/pages/Install.tsx`
   - `src/pages/Landing.tsx`
4. Ostaviti PWA instalaciju kao rezervnu opciju, ali odvojenu od APK downloada da se flowovi ne miješaju.
5. Po potrebi dodatno pooštriti PWA routing zaštitu, ali to mi je sekundarni korak — primarni kvar je trenutni JS način downloada.

Tehnički detalji
- Problematični dio: `src/lib/downloadApk.ts:5-24`
- Pozivi:
  - `src/pages/Install.tsx:325-327`
  - `src/pages/Landing.tsx:524-526`
- `vite.config.ts` ima PWA setup, ali po onome što sam potvrdio glavni problem nije sam APK URL nego način na koji ga frontend pokušava preuzeti.

Očekivani rezultat nakon izmjene
- klik na “Preuzmi APK” više neće raditi privremeni redirect
- download će ići kao pravi browser download
- nestat će “otvori pa zatvori” ponašanje koje sada vidiš

Ako odobriš, sljedeći korak je da to odmah implementiram upravo na ta 3 mjesta.</final-text>