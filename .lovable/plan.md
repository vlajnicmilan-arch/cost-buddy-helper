## Korekcija decision seta — semantika `issued_at_label_present`

### Što se mijenja u okviru

Dvije korekcije ulaze zajedno (prethodna + ova):

1. **JIR / `fiscal_marker_present` izlazi** iz C1 odluke (ostaje samo telemetrija).
2. **`issued_at_label_present` mijenja značenje** — više ne znači "doslovno piše Vrijeme izdavanja", nego "model je jasno prepoznao primarni timestamp događaja s nedvosmislenim labelom".

Prihvatljivi labeli (non-exhaustive, model odlučuje semantički):
- "Vrijeme izdavanja"
- "Datum/vrijeme"
- "Datum i vrijeme"
- "Izdano"
- ekvivalentne DE/EN varijante ("Ausgestellt", "Datum/Uhrzeit", "Issued at", "Date/Time")

Odbacuje se (→ C3):
- više različitih vremenskih polja bez jasnog prioriteta (npr. "Vrijeme dolaska" + "Vrijeme naplate" bez jasnog koji je glavni)
- generičko vrijeme bez ikakvog labela ("samo neki HH:MM negdje na računu")
- label koji ne označava vrijeme događaja (npr. "Vrijeme tiskanja kopije", "Sat blagajne", "Vrijeme smjene")

Ostali zaključani uvjeti za C1 (nepromijenjeni):
- `userEditedDateOrTime === false`
- `issued_at_iso` validan ISO datetime s HH:MM
- `issued_at_raw` sadrži HH:MM iz `issued_at_iso`
- `issued_at_iso` unutar +1h / -7d od `now`

### Gdje pada odluka

Semantika labela je **AI odgovornost** (parse-receipt), ne TS helpera. TS helper i dalje vidi samo boolean `issued_at_label_present` i ne pokušava parsirati label tekst. To čuva `decideScanTier` kao SSOT za tier odluku bez da uvodi listu stringova koja bi se silently divergirala od prompta.

### Konkretne izmjene (build pass kad odobriš)

**1. `supabase/functions/parse-receipt/index.ts`**
- Prompt: proširiti definiciju `issued_at_label_present` s primjerima prihvatljivih i odbačenih labela (HR + DE/EN ekvivalenti, eksplicitno isključiti "vrijeme tiskanja", "kopija", "smjena").
- Dodati pravilo: ako račun ima više vremena bez jasnog prioriteta → `issued_at_label_present=false`.
- JSON schema **nepromijenjena** (i dalje boolean).

**2. `src/lib/balance/decideScanTier.ts`**
- Ukloniti granu `fiscal_marker_present` (prethodna korekcija).
- Ukloniti `'no_fiscal_marker'` iz `reason` union tipa.
- Header komentar: pravilo 3 prepisati iz "explicit 'vrijeme izdavanja' label" u "model has identified a single primary event timestamp with an unambiguous label".
- Logika ostaje identična (i dalje čita boolean).

**3. `src/lib/balance/decideScanTier.test.ts`**
- T3 (`no_time_label`) ostaje, ali komentar/naslov prepisati da odražava novu semantiku.
- T4 (`no_fiscal_marker`) flip → potvrđuje da `fiscal_marker_present=false` uz sve ostalo = C1.
- Dodati T11: dva vremena bez prioriteta = simulacija `issued_at_label_present=false` → C3 (čisto za dokumentaciju namjere).

**4. `src/components/add-expense/AddExpenseDialog.tsx`**
- Bez promjene. `scan_tier_decision` log već nosi sve signale.

### Što se NE mijenja

- TS helper API i tipovi (osim uklanjanja jedne `reason` vrijednosti).
- Write-path, DB, anchor engine, UI, i18n.
- Sanity range i raw↔iso check.

### Posljedice

- C1 hit-rate bi trebao porasti: računi koji nose "Datum/vrijeme: ..." (vrlo čest format na HR POS-evima) sada prolaze gate, dok ranije nisu jer prompt je tražio strogo "Vrijeme izdavanja".
- Rizik false-C1 ostaje ograničen jer: (a) raw↔iso mismatch hvata model halucinacije, (b) sanity range hvata pogrešno parsirane godine, (c) ručna izmjena uvijek ruši na C3.
- Retroaktivni audit nije potreban — `app_diagnostics_logs` zadržava povijest s prethodnom strožom semantikom.

### Status

Decision set zaključan. Build pass mehanički: 1 prompt update, 1 grana out u TS-u, 2 test izmjene + 1 novi test, 1 komentar. Bez migracije, UI ili i18n promjena.
