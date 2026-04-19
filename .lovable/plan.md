

## Plan: Knjiženje poslovnih troškova s osobnih računa kao "pozajmica vlasnika tvrtki"

### Koncept
Kada vlasnik plati poslovni trošak iz **osobnog** računa (npr. privatnom karticom), aplikacija to knjiži kao:
1. **Poslovni rashod** (kako i treba — vidljiv u poslovnom izvještaju)
2. **Saldo osobnog računa** se umanjuje (kao i kod osobnog troška)
3. **Automatski se kreira `business_debts` zapis tipa `payable`** — tvrtka duguje vlasniku iznos te transakcije

To je standardni računovodstveni pristup ("pozajmica vlasnika" / *owner loan to company*) i točno odgovara zahtjevu.

---

### Promjene

#### 1. Mješoviti izbor izvora plaćanja u poslovnom modu
**Datoteke**: `useCustomPaymentSources.ts`, `PaymentSourceSelector.tsx`

- Dodati novi parametar/varijantu hooke `useCustomPaymentSources({ includePersonal: true })` koja u poslovnom modu vraća **i** poslovne **i** osobne izvore tog korisnika.
- U `PaymentSourceSelector` razdvojiti opcije u dvije grupe (`SelectGroup` + `SelectLabel`):
  - **"Poslovni računi"** (default, prvo)
  - **"Osobni računi (pozajmica)"** s vizualnom oznakom (badge `Pozajmica` + ikona 🪙)
- Vrijednosti ostaju standardne `custom:{uuid}` — bez promjene formata u bazi.

#### 2. Detekcija "cross-mode" transakcije i auto-kreiranje pozajmice
**Datoteke**: novi helper `src/lib/ownerLoanLogic.ts`, integracija u `useExpenseCRUD.ts` i `ProjectTransactionsTab.tsx`

Nakon uspješnog INSERT-a poslovnog troška (`business_profile_id` postavljen) provjeriti:
- Ima li `payment_source` referencu na izvor čiji `business_profile_id` **NIJE** isti (ili je `null` = osobni)?
- Ako da → automatski:
  ```ts
  await supabase.from('business_debts').insert({
    user_id, business_profile_id,
    type: 'payable',
    contact_name: 'Vlasnik (pozajmica)',
    description: `Plaćeno iz osobnog računa: ${expense.description}`,
    amount: expense.amount,
    paid_amount: 0,
    status: 'active',
    // novi opcionalni link na expense:
    source_expense_id: expense.id,
  });
  ```
- Saldo osobnog računa se umanjuje normalno (postojeći `useBalanceUpdater` to već radi).

#### 3. Mali schema dodatak — link između trošak i pozajmica
**Migracija**:
- `business_debts` dobiva opcionalnu kolonu `source_expense_id uuid` (nullable, FK na `expenses.id` ON DELETE SET NULL)
- Razlog: ako se izvorni trošak obriše ili izmijeni, znamo koju pozajmicu ažurirati / obrisati. Također omogućuje grupiranje "Auto pozajmice" vs "Ručno unesene".

#### 4. UI prikaz na transakciji
**Datoteke**: `TransactionItem.tsx` ili `TransactionDetailDialog.tsx`

- Ako je trošak knjižen u poslovnom kontekstu, ali iz osobnog izvora → prikazati mali badge **"Pozajmica vlasnika"** (žuto/teal).
- U detalju transakcije link/info "Kreirana pozajmica u iznosu X €" s gumbom "Otvori".

#### 5. Otplata pozajmice → smanjuje dug
Već postoji `markAsPaid` u `BusinessDebtTracker`. Dodatno:
- Kad korisnik označi pozajmicu kao plaćenu (ili djelomično), prikazati hint: *"Stvorite transfer iz poslovnog računa na osobni za stvarnu otplatu"* — opcionalno, kasnije.
- Za sada: ručno otpisivanje preko postojećeg sučelja je dovoljno.

#### 6. Lokalizacija
HR/EN/DE ključevi:
- `business.payment.personalAccountsGroup` → "Osobni računi (pozajmica)"
- `business.payment.businessAccountsGroup` → "Poslovni računi"
- `business.debt.ownerLoanContact` → "Vlasnik (pozajmica)"
- `business.debt.autoCreatedFromPersonal` → "Automatski iz osobnog plaćanja"
- `transactions.ownerLoanBadge` → "Pozajmica vlasnika"

---

### Što NE diram
- RLS politike (postojeće `expenses` i `business_debts` policy već dozvoljavaju ovaj scenarij — `user_id = auth.uid()` u oba slučaja)
- Saldo logiku (`useBalanceUpdater` radi ispravno bez izmjena)
- Format `custom:{uuid}` za payment_source
- Osobni mod — tamo se osobni izvori koriste kao i prije, bez ikakve "pozajmica" logike

---

### Datoteke
- **Migracija**: `business_debts` + `source_expense_id` kolona
- **Izmjena**: `src/hooks/useCustomPaymentSources.ts` — opcioni `includePersonal` flag
- **Izmjena**: `src/components/add-expense/PaymentSourceSelector.tsx` — grupirani prikaz
- **Izmjena**: `src/components/add-expense/AddExpenseDialog.tsx` — proslijediti `includePersonal` u poslovnom modu
- **Izmjena**: `src/components/projects/ProjectTransactionsTab.tsx` — isto + auto loan
- **Nova**: `src/lib/ownerLoanLogic.ts` — `createOwnerLoanIfCrossMode(expense)` helper
- **Izmjena**: `src/hooks/useExpenseCRUD.ts` — pozvati helper nakon INSERT/UPDATE/DELETE poslovnog troška
- **Izmjena**: `src/components/TransactionItem.tsx` ili detalj — badge "Pozajmica vlasnika"
- **Izmjena**: `src/i18n/locales/{hr,en,de}.json`

### Test plan nakon implementacije
1. Aktivirati poslovni profil
2. Dodati trošak (npr. 50 €), izabrati osobni račun iz nove grupe "Osobni računi (pozajmica)"
3. Provjeriti: poslovni izvještaj prikazuje trošak; osobni saldo umanjen za 50 €; u "Dugovanja" tabu nova `payable` stavka 50 € s kontaktom "Vlasnik"
4. Obrisati izvorni trošak → vezana pozajmica se briše/označava kao otkazana
5. Označiti pozajmicu kao plaćenu → status `paid`

