
## Uzrok problema (potvrđen u bazi)

Migracija **`20260522182756_4d7f45a2-c0f8-459a-bc20-debb6c8be011.sql`** je na kraju izvršila `SELECT public.backfill_import_fingerprints();` — funkcija koja je:

1. **Postavila lažni `bank_transaction_id` = `'imp:<sha256>'`** na SVAKI ručno unesen expense koji ga nije imao (1415 od 1417 redova u bazi)
2. **Generirala lažni `import_batch_id` (gen_random_uuid)** po grupi (user × payment_source × mjesec) — 1415 redova
3. **Insertala lažne `imported_statements` zapise** s `file_name = '[legacy backfill]'` — **136 nepostojećih izvoda**

Posljedica: UI smatra sve te transakcije "spojenima s bankom" (1386 ih ima `bank_match_status='confirmed'` iz ranijih import flowova ili pripadnog koda), prikazuje markere uvoza koji nikad nisu uvezeni, a `unmerge_import_row` se ne može pozvati jer su to ručni unosi koje korisnik nikad nije uvozio.

## Trenutno stanje (verificirano upitima):
- `expenses.bank_transaction_id LIKE 'imp:%'` → **1415**
- `expenses.import_batch_id IS NOT NULL` (svi pripadaju ovome) → **1415**
- `imported_statements.file_name = '[legacy backfill]'` → **136**

## Plan popravka

### Korak 1 — Rollback migracija (kritično, prvo)

Jedna migracija koja u transakciji čisti sve tragove backfill-a:

```sql
-- 1) Vrati ručne unose u izvorno stanje
UPDATE public.expenses
   SET bank_transaction_id = NULL,
       import_batch_id     = NULL,
       bank_match_status   = 'manual'
 WHERE bank_transaction_id LIKE 'imp:%';

-- 2) Obriši lažne markere uvoza
DELETE FROM public.imported_statements
 WHERE file_name = '[legacy backfill]';

-- 3) Ukloni funkciju da se NIKAD više ne može slučajno pozvati
DROP FUNCTION IF EXISTS public.backfill_import_fingerprints();
```

`bank_match_status='manual'` je siguran default — pravi bank-only/confirmed redovi (oni s pravim `bank_transaction_id` koji NE počinje s `imp:`) se ne diraju.

### Korak 2 — Verifikacija nakon migracije

Read-only provjera da:
- 0 redova s `bank_transaction_id LIKE 'imp:%'`
- 0 redova s `file_name = '[legacy backfill]'`
- Pravi bank uvozi i dalje stoje (npr. `izvod3803303.pdf`, `transactions_report_*.pdf`)
- Saldo izvora plaćanja se NE mijenja (ovo briše samo metapodatke, ne expense iznose)

### Korak 3 — Sprječavanje regresije

- Funkcija `backfill_import_fingerprints` ostaje obrisana
- Pregled `useExpenseCRUD.ts` (linija ~512–567) gdje import flow postavlja `bank_match_status='confirmed'` — to je legitimno samo za stvarne CSV/PDF uvoze i ne treba ga dirati u ovom popravku
- Postojeća logika u `src/lib/bankMatchStatus.ts` i `bank-sync-transactions` edge funkciji ostaje netaknuta

### Što se NE mijenja
- Iznosi, kategorije, opisi, datumi, payment_source — sve ostaje
- Stvarni uvozi (s pravim file_name i pravim `bank_transaction_id` iz `bank-sync-transactions`) ostaju netaknuti
- Saldo izvora plaćanja ostaje isti (jer brišemo samo bank-match metapodatke, ne expense)

## Tehnički detalji

**Sigurnost rollbacka:** `imp:` prefiks je deterministički znak da je redak došao iz backfill funkcije — pravi bank uvozi koriste ID-eve iz Enable Banking API-ja (numerički ili UUID format), nikad ne počinju s `imp:`. Filter `LIKE 'imp:%'` je 100% selektivan za štetu.

**Atomicnost:** Sva tri UPDATE/DELETE/DROP se izvršavaju u jednoj migraciji (jedna transakcija) — ili sve uspije ili ništa.

**Reverzibilnost:** Nije potrebna — backfill je bio neispravan po dizajnu (lažirao je izvore podataka), pa "vraćanje" lažnih podataka nema smisla.
