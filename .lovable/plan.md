## Cilj

Kada prijavljeni korisnik na projektu ima ulogu radnika (postoji `project_workers` red s `user_id = auth.uid()`), u tabu "Dnevnik rada" pokazati mu malu osobnu karticu:

- dogovorena satnica (`hourly_rate`)
- ukupno odrađeni sati u odabranom razdoblju (zbroj `actual_hours`)
- automatski izračun isplate = sati × satnica
- valuta projekta

Vlasnik/menadžer ne vidi ovu karticu (oni imaju pregled u `ProjectWorkersTab`). Bez liste po danima.

## Što treba napraviti (samo frontend)

### 1. `src/components/projects/ProjectWorkLogTab.tsx`

- Dohvatiti `workers` preko postojećeg `useProjectWorkers(projectId)`.
- `myWorker = workers.find(w => w.user_id === user?.id)`.
- Ako `myWorker` postoji i `!isManager`:
  - Ekstrahirati helper `isDateInPeriod(date, monthFilter)` iz postojeće `filteredLogs` logike (reuse, bez duplikata).
  - Zbrojiti `actual_hours` iz `hoursByDate` samo za `myWorker.id` i samo za datume u trenutnom `monthFilter` periodu.
  - `payout = hours * myWorker.hourly_rate`.
  - Renderirati `MyWorkerPayCard` iznad filtera (ispod View toggle), s labelom razdoblja prema `monthFilter`.

### 2. Nova komponenta `src/components/projects/MyWorkerPayCard.tsx`

- Card s primary akcentom, 3 reda: satnica, sati u razdoblju, za isplatu.
- Props: `hourlyRate`, `hours`, `payout`, `currency`, `periodLabel`.
- Iznose formatirati istim helperom koji već koristi `ProjectWorkersTab` (provjeriti i reuse).
- Ako `hourly_rate === 0` → prikazati poruku "Vlasnik projekta još nije postavio satnicu" umjesto iznosa.

### 3. Valuta projekta

- Dodati `currency` prop u `ProjectWorkLogTab` i proslijediti iz `ProjectFullScreenView` (već zna projekt). Proslijediti u `MyWorkerPayCard`.

### 4. i18n (`src/i18n/locales/{hr,en,de}.json`)

Pod `workLog.myPay.*`:
- `title` ("Moja zarada na projektu" / "My project earnings" / "Mein Projektverdienst")
- `hourlyRate` ("Satnica" / "Hourly rate" / "Stundensatz")
- `hoursInPeriod` ("Sati u razdoblju" / "Hours in period" / "Stunden im Zeitraum")
- `payout` ("Za isplatu" / "Payout" / "Auszahlung")
- `noRateSet` ("Vlasnik projekta još nije postavio satnicu" / ... / ...)

## Što NE treba

- Bez DB migracija — `project_workers.hourly_rate` i `project_work_entries.actual_hours` postoje; RLS već dozvoljava radniku čitanje vlastitog reda (`user_id = auth.uid()`).
- Bez promjena na `ProjectWorkersTab`.
- Bez paywalla.
- Bez liste po danima.
- Bez promjena na transakcijama, budžetu ili isplatama (ovo je samo prikaz, ne kreira expense).
