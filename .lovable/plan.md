## Val 4 — uklanjanje past-window guarda iz scan-tier odluke

### Zaključana odluka

`C1/C3` mjeri pouzdanost očitanog vremena, NE udaljenost od `now`. Starost računa je posao anchor / hybrid engine sloja preko `event_at`, ne tier sloja. Stari račun s pouzdano očitanim datumom i vremenom smije biti `C1`; ako mu `event_at` padne prije anchora izvora, hybrid engine ga svejedno neće uračunati.

### Pre-build provjere (gotovo)

1. **Gdje živi `>7 dana => C3`** — isključivo `src/lib/balance/decideScanTier.ts:96` (`SEVEN_DAYS_MS` granica). Test pokriva `decideScanTier.test.ts` T7.
2. **Postoji li drugdje** — `rg` po cijelom `src/lib/balance/`, `supabase/functions/parse-receipt/` i write-pathu (`AddExpenseDialog`, `ScannedDataPreview`, `writerIntent`, `tierMerge`, `useExpenseCRUD`) ne pokazuje drugu past-window granu. JIR/ZKI/fiscal_marker već su izvan odluke (Val 4 prethodna korekcija).
3. **Future guard ostaje** — `isoMs > nowMs + ONE_HOUR_MS → out_of_range` (linija 95). Smislen je: budući timestamp na izdanom računu je halucinacija ili pogrešno parsirana godina; +1h tolerancija pokriva TZ skew. Zadržava se.
4. **Utjecaj na hybrid engine** — nikakav. Engine čita `event_at` + `time_confidence` iz baze; promjena odluke utječe samo na to koji novi scan dobiva C1 umjesto C3, što hybrid samostalno tretira po pravilima `day_cut` / `precise_cut`. Nema schema, RPC ili SQL izmjena.

### Što se mijenja

**`src/lib/balance/decideScanTier.ts`**
- Ukloniti red `if (isoMs < nowMs - SEVEN_DAYS_MS) return fallback('out_of_range');`
- Ukloniti konstantu `SEVEN_DAYS_MS`.
- Header komentar (pravilo 5) prepisati: "future >1h → C3 (anti-halucinacija/krivo parsirana godina). Past-window guard ne postoji — starost računa nije tier signal."
- `reason` union ostaje (`out_of_range` se i dalje koristi za future grane).

**`src/lib/balance/decideScanTier.test.ts`**
- T7 obrnuti: stari račun (npr. 30 ili 365 dana u prošlosti) s validnim signalima sada mora vratiti **C1**. Naslov: "T7 — stari račun s pouzdano očitanim vremenom → C1 (starost nije tier signal)".
- T6 (future >1h → C3 / out_of_range) ostaje nepromijenjen.
- Ostali testovi (T1–T5, T8–T11) nepromijenjeni.

**Bez promjena:**
- `parse-receipt` prompt i JSON shema
- `writerIntent.ts`, `tierMerge.ts`, `useExpenseCRUD.ts`
- `AddExpenseDialog.tsx`, `ScannedDataPreview.tsx`
- anchor / hybrid engine (`anchorBalance.ts`, RPC, `app_settings`)
- DB schema, migracije, backfill, UI, i18n

### Zaštite koje OSTAJU

- `userEditedDateOrTime === true` → C3 (`user_edited`)
- `issued_at_iso` mora biti validan ISO datetime s HH:MM (`iso_invalid`)
- `issued_at_raw` mora sadržavati HH:MM iz `issued_at_iso` (`raw_iso_mismatch`)
- `issued_at_label_present === false` → C3 (`no_time_label`); pokriva multi-time konflikt bez primata, sekundarne timestampove (vrijeme tiska, kopija, smjena, slip-vrijeme) — semantika je u parse-receipt promptu
- Future >1h → C3 (`out_of_range`)

### Verifikacija nakon builda

1. Dirani fileovi: točno 2 (`decideScanTier.ts`, `decideScanTier.test.ts`).
2. Past-window grana fizički uklonjena (grep za `SEVEN_DAYS_MS` mora biti prazan u `src/lib/balance/`).
3. JIR/ZKI/fiscal_marker i dalje nigdje ne ulaze u odluku (grep `fiscal_marker_present` u `decideScanTier.ts` mora vratiti samo `ScanSignals` tip i komentar "ignored").
4. Test runner: svi testovi prolaze, T7 sada zelen kao C1 case.
5. Konkretan acceptance scenarij (T7 rewrite): `now = 2025-01-20`, `issued_at_iso = 2024-12-20T15:30:00+01:00` (31 dan stariji), `issued_at_raw = "20.12.2024 15:30"`, `issued_at_label_present = true`, `userEditedDateOrTime = false` → očekivano `tier='C1'`, `reason='c1_ok'`.

### Skriveni rizici (eksplicitno)

- **Halucinacija stare godine:** model krivo pročita "2025" kao "2024" → C1 s pogrešnim `event_at`. Ublažavanje: raw↔iso HH:MM mismatch hvata većinu, ali ne sve. Prihvaćamo: stvarna posljedica je da hybrid engine eventualno ne uračuna trošak u trenutni saldo (jer je `event_at` prije anchora) — što je *manje* štetno nego trenutno stanje gdje stari račun degradira na C3 i automatski upada u SUM nakon anchora preko fallback `date` derivacije. Net: rizik se smanjuje, ne povećava.
- **Bez novog skrivenog pravila:** ne uvodi se "ako stari i nema JIR", "ako stari i model nije siguran" — ništa od toga.

Ako se slažeš, prelazim u build.
