# Worker = tiha rola za projektne push notifikacije

## Problem (potvrđeno u DB)

Petar Vlajnić (`fae4b087…`) je u `project_members` projekta "Duje Grčić" s ulogom `worker`. U zadnja 24h primio je 15 push poruka (transakcije + dodane/promijenjene faze) jer **edge funkcije ne filtriraju primatelje po roli**.

Stanje po edge funkciji:
- `notify-project-transaction` — šalje svim članovima ≠ pošiljatelj (uključuje workere). **Treba isključiti workere.**
- `notify-project-activity` — isto. **Treba isključiti workere.**
- `notify-note-added` — isto. **Treba isključiti workere.**
- `check-milestone-budgets` — već filtrira samo `role='manager'`. OK.
- `check-milestone-deadlines` — već filtrira samo `role='manager'`. OK.

## Rješenje

Worker dobiva **samo direktna zaduženja** (po dogovoru). Realno trenutno znači: ništa od općih projektnih push-eva. Per-milestone assignment workera ne postoji u shemi, pa nema dodatne logike za graditi sada — samo isključujemo workere iz tri broadcast funkcije.

### Promjene

1. **`supabase/functions/notify-project-transaction/index.ts`**
   - U `project_members` queryju dodati `.neq('role', 'worker')`.

2. **`supabase/functions/notify-project-activity/index.ts`**
   - Isto: `.neq('role', 'worker')` u member fetchu.

3. **`supabase/functions/notify-note-added/index.ts`**
   - Isto: `.neq('role', 'worker')`.

Owner se i dalje notificira preko zasebnog `project.user_id` puta (owner nikad nije worker svog projekta).

### Što NE diramo

- `notifications` in-app tablica — ostaje kakva je (i tako se ne piše za workere kroz transaction/activity flow, push je primarni kanal).
- `check-milestone-*` — već OK.
- RLS i `project_members` shema — ne mijenja se. Worker i dalje vidi projekt i svoj dnevnik.
- Bez retroaktivnog brisanja postojećih push logova.

## Memory

Dodati `mem://features/project-worker-notifications`: workeri (role='worker' u project_members) ne primaju notify-project-transaction / notify-project-activity / notify-note-added. Samo manager/member dobivaju broadcast.

## Verifikacija

Nakon deploya: kreirati testnu transakciju na projektu i provjeriti `push_delivery_logs` — Petar ne smije dobiti zapis.
