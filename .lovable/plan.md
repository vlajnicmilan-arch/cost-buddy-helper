## Problem

Klikom na "Uvezi X transakcija" baca generičku `import.importError`. Postgres logovi pokazuju pravi razlog:

```
ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

## Root cause

`importFromCSV` u `src/hooks/useExpenseCRUD.ts` (linije 506–509) radi:

```ts
supabase.from('expenses')
  .upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true })
```

Index `uniq_expenses_user_bank_tx` postoji, ali je **parcijalan**:

```
CREATE UNIQUE INDEX uniq_expenses_user_bank_tx
  ON public.expenses (user_id, bank_transaction_id)
  WHERE (bank_transaction_id IS NOT NULL);
```

PostgreSQL za ON CONFLICT na parcijalnom indexu zahtijeva da query sadrži isti `WHERE` predikat. Supabase JS klijent ne podržava slanje tog predikata — pa baza ne pronalazi odgovarajući constraint i baca grešku. Svaki uvoz (i CSV i PDF) trenutno puca na ovom koraku.

Ovo nije bilo uzrokovano današnjim bulk-delete fixom — fingerprint upsert flow je stariji, ali greška je postala vidljivijia jer korisnik sad ponovno pokušava uvoz.

## Fix

Migracija: zamijeniti parcijalni unique index običnim (bez WHERE klauzule). PostgreSQL i dalje dozvoljava više `NULL` vrijednosti u unique indexu po defaultu, pa povijesni redovi bez `bank_transaction_id` ostaju ispravni; novi redovi (svi imaju fingerprint) i dalje su deduplicirani po `(user_id, bank_transaction_id)`.

```sql
DROP INDEX IF EXISTS public.uniq_expenses_user_bank_tx;

CREATE UNIQUE INDEX uniq_expenses_user_bank_tx
  ON public.expenses (user_id, bank_transaction_id);
```

Nije potrebna promjena u app kodu — `onConflict: 'user_id,bank_transaction_id'` će raditi s običnim unique indexom.

## Verifikacija

1. Ponoviti isti PDF uvoz (Aircash izvod, 48 transakcija).
2. Provjeriti da se dijalog zatvori s "Uvezeno N transakcija".
3. Drugi put uvesti isti PDF → očekivati "Nema novih transakcija — svih N već postoji."
4. Provjeriti da je saldo izvora plaćanja ažuriran za točan zbroj prihoda/rashoda novih transakcija.
5. Postgres logovi ne smiju više sadržavati `there is no unique or exclusion constraint`.

## Što se NE mijenja

- `importFromCSV` logika ostaje ista.
- Fingerprint izračun ostaje isti.
- Soft-delete RLS, bulk delete serijalizacija, `useBalanceUpdater` — netaknuto.
