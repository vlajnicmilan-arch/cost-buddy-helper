# Fix: Artikli se ne vide pri otvaranju transakcije

## Root cause

Tablica `public.receipt_items` ima ispravne RLS policies (SELECT/INSERT/UPDATE/DELETE ograničene na vlasnika expense-a), ali **nema niti jedan GRANT** ni za `authenticated`, `anon` ni `service_role` rolu. Bez granta PostgREST (Supabase Data API) odbija sve upite — `loadReceiptItems()` u `TransactionDetailDialog.tsx:243` i `TransactionItemsExpander.tsx:43` tiho vrate praznu listu (greška ide samo u `console.error`, UI prikaže "Nema artikala").

Potvrđeno upitima:
- `SELECT COUNT(*) FROM receipt_items` → 981 zapisa kroz 323 transakcije (podaci postoje)
- `information_schema.role_table_grants` za `receipt_items` → 0 redaka

## Što treba napraviti

Jedna migracija koja dodaje standardne grantove (anon ne treba jer su sve policies vezane na `auth.uid()`):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_items TO authenticated;
GRANT ALL ON public.receipt_items TO service_role;
```

## Što NE treba

- Nikakve izmjene koda u `TransactionDetailDialog.tsx`, `TransactionItemsExpander.tsx`, `ItemsAnalysisTab.tsx`, `BackupRestore.tsx` ili bilo gdje drugdje — fetch logika je već ispravna.
- Nikakve izmjene RLS policy-ja — već su točne.

## Verifikacija nakon migracije

1. Otvoriti transakciju koja ima skenirani račun (npr. iz one od 323 koje imaju zapise u `receipt_items`).
2. Sekcija "Artikli" treba se pojaviti s listom umjesto "Nema artikala".
3. Provjeriti i ItemsAnalysisTab u Izvještajima — trebao bi pokazati podatke umjesto praznog stanja.
