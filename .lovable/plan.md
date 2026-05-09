## Cilj

Cross-mode trošak (poslovni trošak plaćen iz osobnog izvora) treba biti vidljiv i u **Osobnim** i u **Tvrtkinim** transakcijama, bez duplog brojanja salda. Brisanje pripadne pozajmice dobiva 3 jasne opcije s odgovarajućim posljedicama na knjiženje transakcije.

## Princip (jedan red u bazi, dva ortogonalna filtera)

```text
Osobni view  = source.business_profile_id IS NULL
               (drainao je osobni saldo → tu pripada za balance/cashflow)

Tvrtka view  = expense.business_profile_id = <aktivna tvrtka>
               (knjigovodstveno tvrtkin trošak → tu pripada za P&L)

Cross-mode   = zadovoljava OBA → vidi se na obje strane, jedan red u DB
```

Saldo i dalje radi kao danas — vezan je za izvor plaćanja, pa se tvrtkin saldo ne dira.

## 1. Filter logika (`src/hooks/useExpenseFetch.ts`)

Promjena `applyViewMode`:
- **Personal view:** `source.business_profile_id === null` (kao danas, ali eksplicitno preko helpera).
- **Business view:** `expense.business_profile_id === viewBusinessProfileId` (umjesto `source.business_profile_id`).

Dodati helper `isCrossModeExpense(e)` koji vraća `true` kad source je personal a expense ima business_profile_id — koristi se za badgeve i opcionalno isključivanje iz osobnih izvještaja.

## 2. Vizualni badgevi

Postojeća `TransactionItem`/`TransactionList` komponenta dobiva mali badge:
- U **Osobnim:** "↗ Pozajmica tvrtki [Naziv]" (teal outline)
- U **Tvrtkinim:** "← Plaćeno iz osobnog" (amber outline)

Klik na badge otvara dijalog s detaljima pozajmice (postojeći `BusinessDebtTracker` filtriran na taj `source_expense_id`).

i18n ključevi: `transactions.crossMode.loanToCompany`, `transactions.crossMode.paidFromPersonal`.

## 3. Brisanje pozajmice → 3 opcije (`BusinessDebtTracker.tsx`)

Trenutni "Obriši" gumb zamijenjen s **"Riješi"** koji otvara mali dijalog. Ponašanje ovisno o tome ima li pozajmica `source_expense_id`:

**Ako ima `source_expense_id`:**
1. **Otpiši pozajmicu** — `status='cancelled'`, transakcija ostaje na obje strane. Semantika: vlasnik je donirao tvrtki.
2. **Promijeni izvor plaćanja transakcije** — otvara mali select s tvrtkinim izvorima; nakon spremanja `syncOwnerLoanForExpense` automatski makne pozajmicu (jer više nije cross-mode), trošak nestaje iz Osobnih.
3. **Obriši zapis pozajmice (zadrži transakciju)** — samo briše `business_debts` red. Za rijetke slučajeve (npr. pogrešno auto-prepoznato).

**Ako nema `source_expense_id`** (ručno dodano ili zombie zapis):
- Samo opcija 3 ("Obriši zapis").

Svaka opcija ima kratki opis posljedice ispod naslova.

## 4. Izvještaji — sprečavanje dvostrukog brojanja

- **Tvrtkin P&L / `BusinessReports`:** uključuje cross-mode (poželjno — to JE tvrtkin trošak). Bez izmjena.
- **Osobni mjesečni izvještaj / `Reports`:** dodati toggle "Uključi pozajmice tvrtki" (default: **isključeno**). Bez togglea, cross-mode se isključuje iz osobne potrošnje da se izbjegne dojam da je vlasnik osobno potrošio taj novac (formalno jest, ali je odmah pretvoreno u potraživanje).
- **Cashflow forecast:** ostaje vezan na izvor plaćanja, bez izmjena.
- **Budgeti:** vezani na `budget_id` direktno, bez izmjena.

## 5. Dashboard saldo

Bez izmjena. Saldo se i dalje računa po izvorima plaćanja:
- Osobni izvor: smanjen za iznos cross-mode troška (točno).
- Tvrtkin izvor: nedirnuti (točno — novac nije izašao iz tvrtke).
- `business_debts` se ne uključuje u saldo, samo u "Otvoreni računi".

## 6. Memorija

Ažurirati postojeću memoriju **Debt Tracking** — dodati napomenu o cross-mode dual-view modelu i 3-opcijskom brisanju.

## Tehnički detalji

- Filter promjena u `useExpenseFetch.ts:289-306` (mali, ortogonalan refactor).
- Novi helper `isCrossModeExpense(expense)` u istom hooku, exposed kroz return value.
- `ownerLoanLogic.ts` već ima `syncOwnerLoanForExpense` — koristi se u opciji 2.
- Novi helper `forgiveOwnerLoan(id)` u `ownerLoanLogic.ts` — wrapper oko `update({status:'cancelled'})`.
- Novi `LoanResolveDialog.tsx` u `src/components/business/` (3-opcijski dijalog).
- Bez DB migracije.

## Što NE radimo (svjesno izostavljeno)

- Mirror-zapisi (dvije expense rows) — odbačeno zbog sync rizika.
- Promjena `business_debts` strukture — postojeći `source_expense_id` je dovoljan.
- Promjena dashboard salda — već radi ispravno.
- Diranje budgeta i cashflow forecasta — već su izolirani po vlastitim FK-ima.

## Redoslijed implementacije

1. Filter refactor + `isCrossModeExpense` helper.
2. Badgevi u `TransactionItem` + i18n ključevi (HR/EN/DE).
3. `LoanResolveDialog` + `forgiveOwnerLoan` helper.
4. Toggle u osobnom izvještaju.
5. QA: provjera da cross-mode trošak ne narušava postojeće tokove (transferi, recurring, projekti, budgeti).
6. Update memorije.