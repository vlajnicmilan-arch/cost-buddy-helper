## Cilj
Uvesti stvarne datume po fazi (`actual_start_date`, `actual_end_date`) kao izvor istine za kašnjenja. `due_date`/`start_date` ostaju planirani datumi, `completed_at` ostaje samo audit timestamp.

## Promjene

### 1. DB migracija (`project_milestones`)
- Dodati `actual_start_date DATE` i `actual_end_date DATE` (nullable).
- **Backfill jednokratno**: `actual_end_date = completed_at::date` za sve već dovršene faze (gdje je `status='completed'` i `actual_end_date IS NULL`). Time vraćamo postojeću povijest koliko je još moguće.
- Bez CHECK constrainta (Postgres immutable pravilo); validaciju radimo u kodu.

### 2. Fix bug u `useProjectMilestones.ts` (linija ~138)
Trenutno se pri svakom UPDATE-u na već dovršenoj fazi `completed_at` postavlja na `now()`. To briše povijest.
- `completed_at` se postavlja **samo** kad faza prelazi iz ne-completed u completed.
- Ne dira se na ostale UPDATE-ove.
- `actual_end_date` se **auto-popunjava na `today()`** prilikom prvog prijelaza u completed (opcija B), ali se kasnije može ručno mijenjati i NIKAD se više ne prepisuje automatski.
- Analogno: `actual_start_date` se auto-popunjava na `today()` kad faza prvi put pređe u `in_progress` (ako je još NULL); kasnije ručno editabilno.

### 3. UI – uređivanje faza
U dialogu za uređivanje milestone-a (`MilestoneEditDialog` ili ekvivalent) dodati dva nova polja:
- "Stvarni početak" (`actual_start_date`) – DatePicker, opcionalno
- "Stvarni završetak" (`actual_end_date`) – DatePicker, opcionalno, vidljivo samo kad je faza dovršena (ili uvijek, korisnik može unaprijed unijeti)

Postojeća polja "Planirani početak" i "Planirani završetak" ostaju nepromijenjena.

### 4. Helper za kašnjenje
Novi pure helper `src/lib/projectMilestoneDelay.ts`:
```
getMilestoneDelay(milestone) → { status: 'on_time'|'late'|'in_progress_late'|'pending', days: number }
```
Logika:
- Dovršena faza: usporedi `actual_end_date` (ili fallback `completed_at::date`) vs `due_date`
- U tijeku: usporedi danas vs `due_date`
- Nije počela i prošao planirani početak: usporedi danas vs `start_date`

Vitest pokrivenost (po pravilu "bug → helper → test").

### 5. UI prikaz kašnjenja
- **Timeline tab** i **Phases tab** u `ProjectFullScreenView`: koristiti novi helper umjesto trenutne ad-hoc logike.
- Za dovršene faze prikazati badge: "Kasnilo X dana" ili "U roku" (boja teal/orange/red).
- Faze koje su dovršene prije planiranog datuma → "Završeno X dana ranije".

### 6. i18n
Novi ključevi u `hr/en/de`:
- `projects.milestones.actualStart`, `projects.milestones.actualEnd`
- `projects.milestones.delay.onTime`, `delay.lateDays`, `delay.earlyDays`, `delay.inProgressLate`

## Što NE radimo
- Nema `baseline_due_date` ni revision log-a (overkill za current scope).
- Ne diramo `completed_at` semantiku — ostaje audit polje.
- Ne mijenjamo postojeću logiku u `ProjectWorkLogTab` ni radničke prikaze.

## Tehnički detalji
- Migracija je aditivna, sigurna; backfill iz `completed_at` jednom.
- Update hook mora se osigurati da NE šalje `completed_at` u `update()` payload osim pri tranziciji statusa.
- Update memorije (`mem://features/comprehensive-project-management`) nakon implementacije s napomenom o actual_* poljima.
