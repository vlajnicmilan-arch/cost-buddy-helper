## Cilj

Zamrznuti uvoz izvoda dok ne napravimo audit i čistu re-arhitekturu. Bez ikakvih daljnjih “zakrpa” na postojećoj logici.

## Faza 1 — Feature flag “import frozen” (odmah)

- Dodati globalni flag `IMPORT_FROZEN = true` u jednoj konstanti (`src/lib/featureFlags.ts`).
- U svim ulaznim točkama uvoza (PDF, foto, HTML, CSV, manual merge gumb):
  - Sakriti/disable-ati gumbe za “Uvezi izvod”, “Spoji”, “Analiziraj PDF”.
  - Umjesto akcije prikazati lokaliziranu poruku: “Uvoz izvoda je privremeno zamrznut. Radimo na trajnom rješenju.”
- Edge funkcija `parse-pdf-statement` vraća 423 (Locked) dok je flag aktivan na klijentu — backend ostaje netaknut, samo se ne poziva.
- Svi i18n stringovi u `hr/en/de`.

Rezultat: nitko (ni ti, ni drugi korisnici) ne može više kvariti podatke uvozom.

## Faza 2 — Audit postojećeg stanja (read-only)

Bez ikakvih izmjena u bazi. Generiram ti izvještaj po `user_id`:

1. Po `import_batch_id`: ukupno, aktivno, bank_only, confirmed, manual, soft-deleted.
2. Lista “sumnjivih” redaka:
   - `type=transfer` s opisom koji izgleda kao plaćanje (npr. `Aircash Pay …`).
   - `type=expense`/`income` s opisom internog prijenosa.
   - Duplikati: isti `payment_source` + `date` + `amount` + sličan opis u istom batchu.
3. Lista `bank_only` redaka koji već imaju očiti par u ručnim transakcijama (kandidati za spajanje).

Sve ide u jedan markdown izvještaj u `/mnt/documents/import-audit.md` koji ti pošaljem.

## Faza 3 — Odluka o trajnoj arhitekturi (na temelju audita)

Nakon što vidimo brojke, biramo jedan smjer:

A. **Staging tablica**: uvezeni redovi idu prvo u `imported_statement_rows` (odvojeno od `expenses`). Korisnik ručno potvrđuje svaki red prije nego što uđe u `expenses`. Nema više “tihih” bank_only zapisa u glavnoj tablici.

B. **Strict dedupe + validacija na razini baze**: unique index na `(user_id, payment_source, date, amount, fingerprint)`, server-side validacija prije inserta, sve klasifikacijske odluke u jednom pure helperu s testovima.

C. **Vratiti na zadnju radnu verziju uvoza** (history rollback) i graditi od nule samo ono što stvarno treba.

Ne biram sad — odluka tek nakon Faze 2.

## Faza 4 — Čišćenje postojećih krivih zapisa

Tek nakon dogovorene arhitekture, na temelju liste iz audita, izvedemo ciljani SQL (UPDATE/soft-delete) s tvojim potpisom red-po-red ili batch-po-batch. Nikakve bulk operacije bez tvoje eksplicitne potvrde.

## Što SADA radim ako odobriš

Samo Faza 1 + Faza 2. Ništa drugo. Nikakve nove “heuristike”, nikakve izmjene postojećih transakcija.

## Tehnički detalji (za referencu)

- Flag: `export const IMPORT_FROZEN = true;` + helper `useImportFrozen()`.
- Točke gašenja: `GlobalPDFImportHost`, `PdfImportContext`, `useManualBankMerge`, svi “Spoji” gumbi, ulazna točka CSV importa.
- Audit upiti: agregati po `import_batch_id`, regex match na `description`, self-join na `expenses` za kandidate spajanja.
- Audit izlaz: jedan `.md` file, bez izmjena u bazi.