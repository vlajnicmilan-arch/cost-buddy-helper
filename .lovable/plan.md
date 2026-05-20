## Problem

Kod brisanja transakcija javlja se greška ("greška u brisanju") i ništa se ne briše, ali odmah zatim ide "Uspješno obrisano N" jer bulk wrapper proguta pojedinačne greške i prikaže summary.

## Korijenski uzrok (potvrđeno iz Postgres logova)

`hide_soft_deleted` je **RESTRICTIVE SELECT** policy s qualom `(deleted_at IS NULL)`. Kad `softDelete()` napravi `UPDATE expenses SET deleted_at = now()`, PostgREST (supabase-js v2) traži `return=representation` (RETURNING *). Postgres tada provjeri novi red protiv SELECT policy-ja — novi red ima `deleted_at != NULL` → **WITH CHECK violation** → cijela transakcija se rollbacka. Rezultat: greška + ništa nije obrisano.

DB log potvrđuje: `new row violates row-level security policy "hide_soft_deleted" for table "expenses"` (desetci puta tijekom korisnikovog brisanja).

Bonus problem: `deleteExpense` u `useExpenseCRUD.ts` hvata grešku, prikazuje error toast, ali **NE rethrowa**. `bulkDeleteWithoutUndo` koristi `Promise.all(ids.map(deleteExpense))` koji uspijeva i zatim ide `showSuccess(...)` — odatle dva proturječna feedbacka.

## Rješenje

### 1) DB migracija — SECURITY DEFINER RPC za soft-delete

Dodati funkciju koja zaobilazi RLS RETURNING problem:

```sql
create or replace function public.soft_delete_record(
  p_table text,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_table not in ('expenses','projects','project_invoices','project_estimates','project_milestones') then
    raise exception 'invalid_table';
  end if;
  -- vlasništvo se provjerava per-tablica
  execute format(
    'update public.%I set deleted_at = now(), deleted_by = $1
       where id = $2 and deleted_at is null
         and (user_id = $1 or exists (
           select 1 from public.user_roles where user_id = $1 and role = ''admin''
         ))',
    p_table
  ) using v_uid, p_id;
end;
$$;

grant execute on function public.soft_delete_record(text, uuid) to authenticated;
```

(Za `expenses` se može proširiti provjera vlasništva preko `income_source_id`/`project_id` člana, ali za sada strogo `user_id`.)

### 2) Helper `src/lib/softDelete.ts`

Promijeniti `softDelete()` da koristi RPC umjesto direktnog UPDATE:

```ts
export async function softDelete(table: SoftDeleteTable, id: string, _userId: string) {
  const { error } = await (supabase.rpc as any)('soft_delete_record', { p_table: table, p_id: id });
  if (error) throw error;
}
```

### 3) `src/hooks/useExpenseCRUD.ts`

- U cloud grani `deleteExpense` zamijeniti raw `.update({ deleted_at })` pozivom `softDelete('expenses', id, user.id)`.
- U `catch` bloku **rethrow-ati** grešku da bulk wrapper zna da je pala (`throw error;` na kraju catcha).

### 4) `src/pages/Wallet.tsx` i `src/pages/Index.tsx`

`bulkDeleteWithoutUndo`: koristiti `Promise.allSettled` umjesto `Promise.all`, brojati uspjehe/greške i pokazati točan feedback:

```ts
const results = await Promise.allSettled(ids.map(id => deleteExpense(id, { silent: true })));
refetch();
const ok = results.filter(r => r.status === 'fulfilled').length;
const fail = results.length - ok;
if (fail === 0) showSuccess(t('transactions.bulkDeleted', { count: ok }));
else if (ok === 0) showError(t('transactions.bulkDeleteFailed', { count: fail }));
else showError(t('transactions.bulkDeletePartial', { ok, fail }));
```

(Dodati i18n ključeve `transactions.bulkDeleteFailed` i `transactions.bulkDeletePartial` u hr/en/de.)

## Što ovaj plan NE dira

- RLS `hide_soft_deleted` ostaje (zero-touch SELECT hiding radi kako treba).
- UI dijaloga za import batch ostaje isti.
- Trash/restore flow ostaje isti (već koristi RPC).
- Nema izmjena business logike, samo putanja brisanja.

## Verifikacija nakon implementacije

1. Otvoriti import batch, kliknuti delete → potvrditi → samo "Uspješno obrisano N", transakcije nestaju.
2. Provjeriti Postgres logove — nema više `hide_soft_deleted` violationa.
3. Provjeriti `/trash` da su obrisane transakcije vidljive za restore.
