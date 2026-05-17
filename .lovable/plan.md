
# Sustav avansa za suradnike projekta

## Cilj

Omogućiti praćenje avansa isplaćenih suradnicima projekta i automatsko netiranje pri unosu konačnog računa, tako da se izbjegne dvostruko brojanje troška u milestone/projekt obračunu.

## Pravila (potvrđena s korisnikom)

- Avans se unosi **samo kroz transakcije projekta** (ne globalno)
- Avans se može vezati **samo na suradnika** (`project_collaborators`), ne na worker (radnika po satu)
- Pri unosu avansa: dropdown postojećih suradnika projekta + gumb "Dodaj novog suradnika"
- Konvencija: **konačni račun je bruto iznos** (uključuje već isplaćene avanse). Sistem oduzima sumu povezanih avansa.
- **1 avans → 1 konačni račun** (avans se ne dijeli)
- **1 konačni račun → može povući više avansa istog suradnika** (npr. 500 + 300 → konačni 3640)
- Ako je konačni račun **manji** od sume avansa → automatski se kreira zapis u `business_debts` kao "potraživanje od suradnika"

## Promjene u bazi

**Migracija — proširiti `expenses`:**
- `collaborator_id uuid` — FK na `project_collaborators(id)` (nullable, ON DELETE SET NULL)
- `is_advance boolean DEFAULT false` — označava da je transakcija avans
- `linked_advance_ids uuid[]` — na konačnom računu drži ID-jeve povezanih avansa
- Index na `(collaborator_id, is_advance)` za brzo dohvaćanje nepovezanih avansa
- RLS: postojeće policies pokrivaju (filter po `project_id` → user)

**Constraint:** parcijalni unique index osigurava da se isti avans (`is_advance=true`) ne može pojaviti u `linked_advance_ids` na dva različita konačna računa — implementirano preko trigger funkcije `validate_advance_links()`.

## Promjene u kodu

### Tipovi
- `src/types/expense.ts` — dodati `collaborator_id?`, `is_advance?`, `linked_advance_ids?`
- `src/types/projectCollaborator.ts` — već postoji, dodati helper tip `CollaboratorWithBalance` (suradnik + nepovezani avansi + ukupno isplaćeno)

### Hook
- `src/hooks/useCollaboratorAdvances.ts` (novi):
  - `getUnlinkedAdvances(collaboratorId)` → vraća avanse bez `linked_advance_ids` koji ih reference
  - `getCollaboratorBalance(collaboratorId, expenses)` → ukupno isplaćeno / dug
  - `linkAdvancesToInvoice(invoiceId, advanceIds[])` → ažurira `linked_advance_ids`

### Calculations
- `src/lib/projectCalculations.ts` — dodati:
  - `calculateNetExpenseAmount(expense, allExpenses)` — ako ima `linked_advance_ids`, oduzima sumu avansa (cap na 0; višak ide u debt)
  - `calculateProjectSpent` — koristi `calculateNetExpenseAmount` umjesto sirovog `amount` da izbjegne dupli broj
  - `calculateMilestoneActual(milestoneId, expenses)` — net suma po milestoneu

### UI — Unos transakcije u projektu
- `src/components/add-expense/ManualExpenseForm.tsx` — kad je `project_id` postavljen i `type === 'expense'`:
  - Novi checkbox "Ovo je avans suradniku" (gore, vidljiv samo unutar projekta)
  - Ako checked → polje "Suradnik" (dropdown iz `useProjectCollaborators(projectId)`) + gumb "+ Dodaj novog" (otvara mini-formu inline: ime, prezime, opis usluge)
  - Ako NIJE avans, ali je odabran `collaborator_id` → prikaz "Nepovezani avansi za [suradnik]: 500 €, 300 €" s checkboxima za vezanje na ovaj konačni račun
  - Live preview: "Bruto: 3640 €, oduzeto avansa: 800 €, neto knjiženo: 2840 €"

### UI — Prikaz transakcije
- Avans dobiva Badge "Avans" (žuti) + status "Povezan na: [naziv konačnog]" ili "Nepovezan"
- Konačni račun s vezanim avansima prikazuje: "od čega 800 € avans (Parketar Ivan)" + link na te avanse
- Brisanje avansa koji je vezan → blokirano s upozorenjem (prvo treba urediti konačni račun)
- Brisanje konačnog računa → avansi se automatski "odvezuju" (vraćaju u pool)

### UI — Suradnik
- `src/components/projects/ProjectCollaboratorsList.tsx` (postoji) — dodati:
  - Sažetak po suradniku: ukupno avansa, ukupno konačnih, neto isplaćeno, saldo
  - Alarm "Nepovezani avansi stariji od 60 dana"

### Milestone overview
- U `ProjectMilestonesTab` (postojeća, traži se u prethodnoj fazi): prikaz Plan vs Stvarno (net) po milestoneu

## Edge slučaj: konačni < avans

Kad korisnik unese konačni račun manji od sume avansa, prije spremanja:
1. Prikaže se dijalog: "Suradnik vam duguje X €. Kreirati potraživanje?"
2. Po potvrdi → INSERT u `business_debts` (debt_type='receivable', counterparty=collaborator naziv, amount=razlika, project_id, note="Višak avansa nakon konačnog računa")
3. Konačni račun se sprema s neto = 0 (a ne negativan)

## i18n

Novi ključevi u `hr.json`, `en.json`, `de.json` pod `projects.advances.*`:
- `isAdvance`, `selectCollaborator`, `addNewCollaborator`, `unlinkedAdvances`, `linkToInvoice`, `netAfterAdvances`, `advanceBadge`, `linkedTo`, `surplusToDebt`, `cannotDeleteLinked`

## Što NE radimo u ovoj fazi

- Avansi za workers (radnike po satu) — eksplicitno isključeno
- Globalni vendor sustav — pokriva se kroz collaborators
- Automatski prijedlozi po opisu (npr. "Avans za parketara" → auto-link) — to ide u Fazu 2 zajedno s milestone auto-linkom iz prethodnog plana

## Backfill postojećih podataka

Ne radi se automatski. Korisnik može retroaktivno otvoriti postojeću transakciju "Avans za parketara" (500 €), ručno označiti kao avans + odabrati suradnika, zatim otvoriti "postavljanje parketa" (3640 €) i vezati avans. Sistem će preračunati spent na projektu/milestoneu.

## Redoslijed implementacije

1. Migracija (`collaborator_id`, `is_advance`, `linked_advance_ids` + trigger)
2. Calculations helpers + unit testovi
3. Hook `useCollaboratorAdvances`
4. UI u `ManualExpenseForm` (checkbox, dropdown, link-selector, neto preview)
5. Badge + display u listama transakcija
6. Edge-case dijalog (konačni < avans → business_debts)
7. Sažetak po suradniku + alarm nepovezanih
8. i18n (HR/EN/DE)
9. Memory zapis (`mem://features/collaborator-advances`)
