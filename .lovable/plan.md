Razumijem. Krećemo od temelja, bez nagađanja i bez kozmetike.

Što je sada jasno iz provjere:
- Kod za kameru postoji: `useNativeCamera` otvara Capacitor kameru i vraća sliku kao base64.
- Kod za AI analizu postoji: `useReceiptScanner` šalje sliku u backend funkciju `parse-receipt`.
- AI veza radi: backend logovi pokazuju da AI vraća stvarne podatke računa, npr. 72,89 € i 6,44 € s artiklima.
- Kod za dijalog nakon skeniranja postoji: `ScannedDataPreview` se prikazuje nakon `applyScannedResult`.
- Poveznica za popunjavanje podataka postoji djelomično: `applyScannedResult` puni `scannedData`, a kod za spremanje iz `scannedData` postoji.

Zaključak: problem najvjerojatnije nije u AI-u ni u čitanju računa. Temeljni problem je u životnom ciklusu dijaloga i stanju nakon povratka iz kamere, posebno u poslovnom modu. Drugim riječima: rezultat dođe, ali UI/otvoreni dijalog ga ne prikazuje ili se pogrešno resetira.

Plan popravka:

1. Napraviti jedan jasan, jedinstven tok skeniranja
   - Ukloniti dva paralelna načina otvaranja poslovnog skenera gdje god postoje.
   - Skeniranje u osobnim i poslovnim financijama mora koristiti isti `AddExpenseDialog` i isti `autoScan` tok.
   - Poslovni gumb neće imati poseban “hack” tok, nego će pozivati isti stabilni mehanizam kao osobni gumb.

2. Dodati eksplicitna stanja skenera u dijalog
   - Umjesto da se oslanjamo samo na `scanning`, `showScannedPreview` i nekoliko boolean varijabli, uvesti jasan flow:

```text
idle -> camera_opening -> image_received -> ai_analyzing -> preview_ready -> saving -> done
                                      \-> error
```

   - Svaka faza će imati vidljiv status korisniku.
   - Ako AI vrati rezultat, dijalog se ne smije zatvoriti dok korisnik ne vidi pregled i ne odluči što dalje.

3. Spriječiti resetiranje rezultata nakon skeniranja
   - `onOpenChange`, `resetForm`, promjena taba i Android back/popstate više ne smiju obrisati rezultat dok je skeniranje ili pregled u tijeku.
   - Reset se smije dogoditi samo kada korisnik izričito zatvori/odbije pregled ili nakon uspješnog spremanja.

4. Popraviti popunjavanje podataka iz AI rezultata
   - Kad AI vrati rezultat, odmah sinkronizirati ključna polja forme:
     - iznos
     - opis
     - trgovac/partner
     - datum
     - kategorija
     - izvor plaćanja/kartica
     - artikli
   - Time pregled i forma više neće ovisiti o odvojenim podacima koji mogu otići izvan sinkronizacije.

5. Dodati vidljive greške i dijagnostiku bez skrivanja problema
   - Ako kamera vrati null, korisnik dobiva jasnu poruku.
   - Ako AI ne vrati JSON, prikazuje se stvarna korisna poruka.
   - Ako rezultat dođe, ali preview nije prikazan, to će se logirati kao posebna greška.
   - Dodati logove za:
     - kamera otvorena
     - slika primljena
     - AI pozvan
     - AI rezultat primljen
     - preview prikazan
     - spremanje pokušano
     - spremanje uspješno/neuspješno

6. U poslovnom modu vezati skeniranu transakciju uz aktivnu firmu
   - Provjeriti da `activeBusinessProfileId` postoji prije spremanja.
   - Ako ga nema, prikazati jasnu grešku umjesto tihog neuspjeha.
   - Osigurati da spremljena poslovna transakcija dobije `business_profile_id`.

7. Testirati stvarni lanac, ne samo TypeScript
   - Provjeriti da build/TypeScript prolazi.
   - Provjeriti backend funkciju `parse-receipt` kroz test poziv gdje je moguće.
   - Provjeriti dijagnostičke zapise nakon pokušaja skeniranja.
   - U završnom odgovoru navesti točno što je potvrđeno: kamera, AI, preview, spremanje.

Datoteke koje ću dirati nakon odobrenja:
- `src/components/add-expense/AddExpenseDialog.tsx`
- `src/hooks/useReceiptScanner.ts`
- `src/hooks/useNativeCamera.ts` samo ako treba dodati dijagnostiku/bolju grešku
- `src/components/home/BusinessModeView.tsx`
- `src/pages/Business.tsx`
- po potrebi i18n prijevodi u `src/i18n/locales/hr.json`, `en.json`, `de.json`

Neću dirati:
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `.env`

Cilj ove izmjene nije “još jedan pokušaj”, nego uklanjanje nejasnog toka i postavljanje jednog provjerljivog lanca:

```text
Gumb Skeniraj
  -> Kamera
  -> Slika
  -> AI analiza
  -> Pregled rezultata u dijalogu
  -> Popunjeni podaci
  -> Spremanje poslovne transakcije
```

Nakon odobrenja idem direktno na ovu temeljnu stabilizaciju.