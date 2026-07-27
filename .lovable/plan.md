## CI run 30289169040 — samo izvješće

**Nije zahtjev za izmjenom.** Ovaj plan zapisuje nalaz i mogućnosti; Milan odlučuje.

### Nalaz

- **Workflow:** `Tests` (vitest), NE Balance SQL Regression Suite.
- **Commit:** `85904188` — "Dodao SQL invariant template" (C4 push).
- **Conclusion:** failure. Pao korak `Run vitest`.
- **Zeleni:** svi balance/krug/settlement unit setovi (balanceRegression 18/18, anchorBalance 19/19, krugSettlement 14/14, krugSettlementPdf 8/8, itd.).
- **Pali:** 2 testa u `src/i18n/__tests__/untranslatedLocales.test.ts`:
  - `en.json` identical-to-HR: `krug.settlement.pdf.filenameBase`, `.fxStatus`, `.statusLabel`, `.col.status`
  - `de.json` identical-to-HR: `krug.settlement.pdf.filenameBase`, `.statusLabel`, `.col.date`, `.col.status`

### Klasifikacija: (c) i18n lint regresija iz C3

- (a) balance regression — NE. Balance/settlement invarijante zelene; balance-sql-suite nije ni triggeran (C4 datoteka je van njegovih path filtera).
- (b) CI bootstrap/replay drift — NE. Vitest, ne PG replay.
- (c) i18n lint: C3 patch je dodao `krug.settlement.pdf.*` prijevode; linter detektira EN/DE vrijednosti identične HR-u a nisu u `untranslatedLocaleWhitelist.ts`. Riječi su prirodno iste (brand `krug-settlement`, univerzalno `Status`, `FX status`, `Datum`).

### Opcije (za Milanovu odluku — NE izvodim ništa dok ne kaže)

1. **Whitelist:** dodati 8 ključeva u `untranslatedLocaleWhitelist.ts` uz obrazloženje po ključu. Minimalno, konzistentno s postojećim obrascem (npr. `settings.notifKrug` brand slučaj).
2. **Stvarni prijevodi:** promijeniti EN/DE vrijednosti gdje ima smisla (npr. EN `col.date` = `Date`, DE `col.status` = `Status` je već isti u DE). Filename ostaje brand.
3. **Kombinirano:** brand/univerzalne u whitelist, ostalo prevesti.

### Ograničenja

- Nula dodira balance/settlement logike.
- Nula migracija, nula edge fn, nula RPC-ova.
- `touches_balance=false`.
- Milan bira opciju prije nego što išta pipnem.
