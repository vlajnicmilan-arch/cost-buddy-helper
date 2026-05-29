## Cilj
U dijalogu dijeljenog novčanika (`PaymentSourceTransactionsDialog`) pored opisa transakcije prikazati badge s imenom korisnika koji je dodao transakciju — ali samo kad `expense.user_id !== current user`. Identičan obrazac kao već postojeći u `IncomeSourceTransactionsDialog` (siječanj 2026).

## Promjene

### 1. RLS (migracija)
Trenutna policy `Users can view profiles of shared members` na `public.profiles` pokriva income/project/budget/family članove, ali **ne i `payment_source_members`**. Bez dodavanja te grane, Petar (viewer) neće moći dohvatiti `display_name` vlasnika ni drugih članova → badge bi bio prazan.

Dodati novu granu u istu policy (DROP + CREATE):
```sql
OR EXISTS (
  SELECT 1
  FROM payment_source_members psm1
  JOIN payment_source_members psm2 ON psm1.payment_source_id = psm2.payment_source_id
  WHERE psm1.user_id = auth.uid() AND psm2.user_id = profiles.user_id
)
OR EXISTS (
  SELECT 1
  FROM custom_payment_sources cps
  JOIN payment_source_members psm ON psm.payment_source_id = cps.id
  WHERE psm.user_id = auth.uid() AND cps.user_id = profiles.user_id
)
```
(druga grana pokriva slučaj kad je vlasnik izvora — vlasnika nema u `payment_source_members`).

### 2. `src/components/PaymentSourceTransactionsDialog.tsx`
- Dodati `useEffect` koji dohvaća profile svih `user_id` iz vidljivih `expenses` (Set), poziv `supabase.from('profiles').select('user_id, display_name').in('user_id', [...])`.
- Držati `memberProfiles: Record<string, string>` u stateu.
- U render retku transakcije, pored opisa (gdje već postoje ostali badgevi), dodati:
  ```tsx
  {expense.user_id !== user?.id && memberProfiles[expense.user_id] && (
    <Badge variant="secondary" className="text-[10px]">
      {t('transactions.addedBy', { name: memberProfiles[expense.user_id] })}
    </Badge>
  )}
  ```
- Reuse `useAuth()` za trenutnog korisnika.

### 3. i18n
Dodati ključ `transactions.addedBy` u `hr.json`, `en.json`, `de.json`:
- HR: `"Dodao: {{name}}"`
- EN: `"Added by: {{name}}"`
- DE: `"Hinzugefügt von: {{name}}"`

(Provjeriti postoji li već — koristio se isti string u `IncomeSourceTransactionsDialog`; ako da, reuse.)

## Što NE diramo
- Glavna lista na dashboardu, `TransactionDetailDialog`, `EditTransactionDialog` — korisnik je tražio samo dijalog dijeljenog novčanika.
- Logiku dohvata transakcija (RLS već puštá viewerima vidjeti tuđe expense kroz `is_payment_source_member`).
- Native dio — čista web/JS promjena, bez version bumpa.

## Verifikacija
- Otvoriti dijeljeni novčanik kao viewer → badge "Dodao: …" vidljiv na tuđim transakcijama, nije na vlastitima.
- Otvoriti kao vlasnik → badge na transakcijama koje je dodao Petar.
- Provjeriti da Supabase linter ne baca novo upozorenje nakon migracije.
