
Zaključak

- Na screenshotu se vidi bedž "Na uređaju", što znači da je ovaj račun već spremljen lokalno. Dakle, problem nije da se trajno sprema u Lovable Cloud, nego da su akcije oko slike loše složene i nepouzdane.
- Trenutno su dodane 3 odvojene ideje odjednom: klik na preview za pregled, "Spremi u oblak", "Spremi na uređaj". To je previše za jednu stvar i zato je UX postao zbunjujuć.
- Po kodu se vidi i zašto puca:
  - eksplicitni gumb gore postoji samo za stare/cloud slike (`!isLocalReceipt`), pa lokalne slike ostaju bez jasnog gumba za pregled
  - pregled je vezan na nested `Dialog` unutar `TransactionDetailDialog`, što je krhko na mobitelu
  - "Spremi u oblak" koristi `navigator.share(files)` direktno u komponenti
  - "Spremi na uređaj" koristi `<a download>` na data/blob URL-u, što često ne radi u Android/Samsung Internet/Capacitor okruženju

Što stvarno treba zadržati

1. Pouzdan pregled slike
2. Jednu jasnu export/share akciju

Što nije nužno

- Poseban gumb "Spremi na uređaj" za lokalne slike, jer su one već na uređaju
- Poseban gumb "Spremi u oblak", jer to zvuči kao da aplikacija sprema u svoj cloud, a zapravo je ideja samo ručni export u korisnikove aplikacije

Predloženi plan

1. Pojednostaviti akcije u `TransactionDetailDialog.tsx`
- Vratiti jasan gumb `Pregledaj` iznad slike za sve receiptove, i lokalne i stare cloud receiptove
- Ukloniti dva trenutna gumba ispod slike
- Zamijeniti ih jednim gumbom, npr. `Podijeli / Spremi drugdje`

2. Popraviti pregled slike
- Maknuti oslanjanje samo na klik na thumbnail
- Zamijeniti nested fullscreen `Dialog` jednostavnijim stabilnim overlay prikazom ili jednim modal-state pristupom, bez `Dialog` unutar `Dialog`
- Time se vraća pouzdan "otvori sliku" flow na mobitelu

3. Popraviti export logiku
- Ne koristiti više direktno `navigator.share` ni `<a download>` iz `TransactionDetailDialog`
- Iskoristiti postojeći `src/lib/fileExport.ts`, jer već ima ispravan native/web fallback:
  - native: napiše datoteku privremeno i otvori nativni share sheet
  - web/PWA: napravi normalan download
- Iz `freshReceiptUrl` napraviti `Blob` i slati sve kroz isti helper

4. Zadržati lokalni model pohrane bez promjene
- `useReceiptScanner.ts` ostaje local-first
- bedž `Na uređaju` ostaje
- stari cloud receiptovi i dalje se samo prikazuju/exportaju radi kompatibilnosti

Tehnički detalji

- `TransactionDetailDialog.tsx`
  - dodati eksplicitni `Pregledaj` button za sve slike
  - ukloniti `Spremi u oblak` + `Spremi na uređaj`
  - zamijeniti ih jednim `Podijeli / Spremi drugdje`
  - refaktorirati fullscreen viewer da ne bude nested Radix dialog

- `src/lib/fileExport.ts`
  - koristiti kao jedini izlaz za export slike
  - ako treba, samo proširiti MIME/file-name handling za JPG receipt slike

- `useNativeShare.ts`
  - nije dobar centralni izbor za receipt slike u sadašnjem obliku jer radi tekst/url share, ne pravi stabilan file-export flow za ovu potrebu
  - zato ga ne bih forsirao ovdje

Što će korisnik dobiti nakon ove promjene

```text
Slika računa
[Pregledaj]   [Podijeli / Spremi drugdje]
```

- `Pregledaj` uvijek otvara sliku
- `Podijeli / Spremi drugdje` otvara siguran export/share flow
- nema više lažnog dojma da aplikacija sprema u svoj cloud
- nema redundantnog gumba "Spremi na uređaj" za nešto što je već spremljeno na uređaju

Provjera nakon implementacije

- novi lokalni račun: Pregledaj radi
- novi lokalni račun: Podijeli/Spremi drugdje radi na Androidu
- stari cloud račun: Pregledaj radi
- stari cloud račun: export radi
- Samsung Internet / mobilni preview: nema "mrtvih" gumba ni nejasnih akcija

Ovo bih smatrao najboljim smjerom: ne popravljati sva 3 trenutna ponašanja odjednom, nego vratiti 2 jasne i pouzdane akcije.
