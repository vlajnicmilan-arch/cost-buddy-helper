# Auto-kapitalizacija teksta — prijedlog izvedbe

## 1. Centralno rješenje (DA — postoji)

Cijeli projekt koristi zajednički `src/components/ui/input.tsx` (89 potrošača) i `src/components/ui/textarea.tsx` (28 potrošača) — shadcn wrapperi. Ovo je idealno mjesto za centralnu logiku umjesto polje-po-polje.

**Prijedlog:** dodati novi opt-in prop `sentenceCase?: boolean` na oba wrappera (Input, Textarea). Kad je `true`:
- Postavlja native atribut `autoCapitalize="sentences"` (mobilna tipkovnica na iOS/Android/Capacitor to poštuje).
- Dodaje lagani JS sloj za desktop web (gdje native atribut ne radi).

**Zašto opt-in a ne opt-out:** siguran rollout, ne razbija postojeća polja (email, iznosi, kodovi) koja moraju eksplicitno biti isključena. Nakon što se stabilizira, može se raspravljati o defaultu.

## 2. Preporučeni pristup — hibrid (najmekši)

**Sloj A — native `autoCapitalize="sentences"`:**
- Radi automatski na mobilnim tipkovnicama (Capacitor Android/iOS + PWA).
- Nula rizika za controlled input, cursor, paste — browser ne mijenja value.
- Korisnik može odmah otipkati malo slovo → nema borbe.

**Sloj B — minimalni JS (samo za desktop web + fallback):**
- Radi SAMO u dvije situacije, i to ne-agresivno:
  1. **Prvi znak polja** je slovo → uppercase.
  2. Znak upisan **odmah nakon `. ` / `! ` / `? `** (točka/uskličnik/upitnik + razmak) → uppercase.
- Detekcija: u `onChange` usporedimo `previousValue` i `newValue`; kapitaliziramo **samo novo dodani znak na kraju umetka**, ne cijeli string.
- **Anti-borba pravilo:** ako je `newValue.length < previousValue.length` (brisanje) ili ako korisnik override-a već kapitalizirano slovo malim (druga izmjena iste pozicije) → NE re-kapitaliziramo. Skladištimo `lastAutoCappedIndex` u ref i preskačemo tu poziciju ako se vrati na nju.
- **Cursor:** koristi `String.prototype.replace` samo na jednom znaku iste dužine → cursor pozicija ostaje ista, ne trebamo ručno restore.
- **Paste:** ako paste unese >1 znak odjednom, samo prvi znak (ako je početak polja) postaje veliki, ostatak ostaje netaknut.

**Hrvatski dijakritici:**
- `String.prototype.toLocaleUpperCase('hr-HR')` ispravno radi za č→Č, ć→Ć, š→Š, đ→Đ, ž→Ž.
- Detekcija "je li slovo": regex `/\p{L}/u` (Unicode property, hvata sva slova uklj. dijakritike). Ne koristimo `/[a-z]/i`.

**Kratice / sredina riječi:** logika triggerira SAMO na (a) index 0, ili (b) nakon `[.!?]\s`. Ne dira sredinu riječi, ne dira `npr.`, `itd.` jer nakon njih obično nema razmaka+slova kao nova rečenica u istom polju (a i ako ima, to je legitiman novi početak).

## 3. Polja U OPSEGU (sentenceCase=true)

**Slobodni tekst / rečenice:**
- Nova/uređena **faza** projekta — naziv, opis
- **Bilješke** (notes) svugdje — projekt, milestone, decision, expense
- **Opis projekta**, opis troška, opis transakcije, opis budžeta
- **Krug** — naziv Kruga, opis Kruga, poruka pri poravnanju
- **Decision** — naslov, initial_description, komentari, obrazloženje
- **Bug report** — naslov, opis
- **Calendar event** — naslov, opis
- **Feedback** dialog — poruka
- **Naziv projekta**, naziv budžeta, naziv izvora plaćanja (payment source), naziv kategorije
- **Naziv radnika**, opis worklog stavke
- **Ime/prezime** u profilu, onboarding "Kako da te zovem" (prvo slovo veliko je prirodno)
- **Naziv poduzeća** (osim ako se povlači iz API-ja — ondje ne diramo)

## 4. Polja VAN OPSEGA (bez sentenceCase, ili eksplicitno `autoCapitalize="none"`)

- **Email** (login, invite, kontakt)
- **Password / PIN / OTP kod**
- **URL / share link / IBAN / OIB / broj računa**
- **Iznosi, brojevi, postoci** (override %, quantity, tečaj) — već `inputMode="decimal"`
- **Šifre, tagovi, slug, kodovi** (npr. promo kod, referral, verifikacijski kod)
- **Kategorije koje su enum vrijednosti** (ako se biraju kroz Select — nije input)
- **Search polja** — sporno, ali preporuka: NE diramo (search je najčešće lowercase-friendly)
- **Voice input rezultati** — ne diramo (Web Speech API već isporučuje pravilno interpunkciju)

## 5. Rizici i mitigacije

| Rizik | Mitigacija |
|---|---|
| Razbija controlled input | Wrapper prosljeđuje `onChange` s modificiranom vrijednošću PRIJE poziva parent handlera → parent i dalje kontrolira state |
| Cursor skoči na kraj | Zamjena jednog znaka iste dužine → browser čuva cursor. Za sigurnost: ako mora, `requestAnimationFrame` + `setSelectionRange` |
| Paste ubija clipboard sadržaj | JS logika radi samo na prvom znaku polja; paste u sredini se ne dira |
| Validacija (npr. Zod) očekuje sirov unos | Modifikacija je samo case-change, ne mijenja duljinu/format → validacije prolaze isto |
| Bori se s korisnikom | `lastAutoCappedIndex` ref: ako korisnik pozicionira i vrati malo slovo, ne re-kapitaliziramo |
| IME/kompozicija (kineski, japanski) | Preskačemo tijekom `compositionstart` → `compositionend` (event listeneri na inputu) |
| React re-render tijekom tipkanja | Logika je O(1) — usporedba zadnjeg znaka; nema mjerljivog utjecaja |

## Tehnički detalji

**API na Input/Textarea:**
```ts
sentenceCase?: boolean;  // opt-in, default false
```

**Implementacija (skica, ne konačna):**
- Novi util `src/lib/textCase.ts` s `capitalizeNewChar(prev, next, lastCappedIdx): { value, cappedIdx }`.
- Wrapperi `Input`/`Textarea` koriste util samo ako je `sentenceCase` postavljen.
- Native atribut `autoCapitalize` postavlja se automatski (`sentences` ako je `sentenceCase`, `none` ako je tip `email`/`password`/`url` — već browser default).

**Rollout:**
- Faza 1: dodaj prop, ne uključi nigdje → nula regresija.
- Faza 2: uključi na dogovorenim poljima (točka 3) u jednom PR-u po grupi (projekt, Krug, decision, itd.).
- Faza 3: opcionalno, testovi za `textCase.ts` (unit) + jedan integracijski (RTL) na jednom polju.

**Nula dodira:** balance/settlement logike, migracija, RPC-ova, edge fn.

## Otvorena pitanja za Milana

1. **Rollout tempo:** sve u jednom PR-u ili faza po faza (npr. samo Krug + decision + projekti u prvom PR-u)?
2. **Search polja:** ostaviti bez kapitalizacije (moja preporuka) ili uključiti?
3. **Ime/prezime u profilu:** `sentenceCase` (prvo slovo veliko), ili posebna "Title Case" logika (svaka riječ veliko)? Preporuka: `sentenceCase` je dovoljna, ne pretjerujmo.
