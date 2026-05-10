## Cilj

Kad bilo koji član projekta (npr. Petar) napravi akciju na projektu — upiše dnevnik, doda/promijeni transakciju, mijenja milestone ili ostavi bilješku — svi ostali članovi (vlasnik + ostali) dobiju push obavijest **u app + na uređaj**, grupirano da nema spama (max 1 push / 5 min po istom paru korisnik+projekt+tip).

## Što već postoji (reuse, ne dupliciram)

| Funkcija | Što radi danas | Status |
|---|---|---|
| `notify-project-transaction` | Push svim članovima + ownerovi za nove/izmijenjene transakcije, kategorija `transactions` | **Već radi** |
| `notify-note-added` | Push za bilješke na transakcijama | **Već radi** |
| `useNotificationPreferences` | Per-user toggle po kategorijama (`projects`, `transactions`, …) | **Već radi** |
| `_shared/sendPushNotification.ts` | Best-effort dispatch + delivery logging | **Već radi** |
| `is_push_category_enabled()` RPC | Server-side check preferenci | **Već radi** |

## Što nedostaje i što gradim

### 1. Nova edge funkcija `notify-project-activity`
Generička funkcija za **work_log** i **milestone** događaje (transakcije i note već imaju svoje).

Input:
```ts
{
  project_id: string,
  activity_type: 'work_log_added' | 'work_log_updated' | 'work_log_deleted'
                | 'milestone_added' | 'milestone_status_changed' | 'milestone_deleted',
  ref_id: string,         // id work_loga ili milestonea
  meta?: { date?, hours?, milestone_name?, status? }
}
```

Logika (mirror `notify-project-transaction`):
- Validiraj JWT, dohvati `userId` (akter)
- Učitaj projekt + ime aktera iz `profiles`
- Skupi `usersToNotify` = svi `project_members.user_id` + `projects.user_id`, **bez aktera**
- Provjeri throttle (vidi #2)
- Insert u `notifications` (in-app zvono) + `sendPushNotificationToMany` s `category: 'projects'`
- Naslov/tekst lokaliziran prema `activity_type` (HR/EN/DE rješava klijent kroz `data.i18n_key`; tijelo se gradi server-side na hr kao i postojeći `notify-project-transaction`)

### 2. Throttle / grupiranje (5 min po useru)
Nova mala tablica:
```sql
project_activity_push_throttle (
  user_id uuid, project_id uuid, activity_bucket text,
  last_sent_at timestamptz, pending_count int,
  PRIMARY KEY (user_id, project_id, activity_bucket)
)
```
`activity_bucket` = `work_log | milestone | transaction | note`.

Pravilo u edge funkciji prije slanja:
- Ako `last_sent_at > now() - interval '5 minutes'` → **ne šalji push**, samo `pending_count += 1` i upiši in-app `notification` (zvono ostaje točno).
- Inače → pošalji push, postavi `last_sent_at = now()`, `pending_count = 0`.
- Tijelo poruke uključuje `pending_count` ako > 0 (npr. „Petar i još 3 promjene u projektu X").

Throttle koristi i postojeći `notify-project-transaction` i `notify-note-added` (mali patch — samo dodavanje throttle helpera, bez mijenjanja behavioura inače).

Helper se izdvaja u `supabase/functions/_shared/projectActivityThrottle.ts`.

### 3. Pozivi iz klijenta
- `src/hooks/useProjectWorkLogs.ts` — nakon uspješnog `create / update / remove` pozvati `supabase.functions.invoke('notify-project-activity', { body: { project_id, activity_type: 'work_log_*', ref_id, meta } })`. Best-effort, errori se logiraju ali ne blokiraju UI (isti pattern kao `useExpenseCRUD`).
- `src/hooks/useProjectMilestones.ts` — isti pattern za add / status change / delete.
- Transakcije i bilješke već zovu svoje funkcije — **ne diram**.

### 4. UI prefe rence
`useNotificationPreferences` već ima `projects_enabled`. Dodatno u **Postavke → Notifikacije** ne treba ništa novo — kategorija „Projekti" pokriva work_log + milestone. Transakcije i bilješke već imaju vlastite toggle (`transactions`, ostaje pod `projects` za bilješke u projekt-kontekstu).

## i18n
Nove ključne stringe (HR/EN/DE) za naslove i tijelo notifikacija:
- `notifications.projectActivity.workLogAdded` — „{name} je upisao/la dnevnik ({date}, {hours}h)"
- `notifications.projectActivity.workLogUpdated` / `Deleted`
- `notifications.projectActivity.milestoneAdded` / `StatusChanged` / `Deleted`
- `notifications.projectActivity.grouped` — „{name} i još {n} promjena u projektu „{project}"

## Što NE diram
- `notify-project-transaction` (osim opcionalnog throttle helper poziva)
- `notify-note-added` (isto)
- `sync_work_log_to_entry` trigger
- RLS na `project_work_logs` / `project_milestones`
- Postojeći Petar link-worker flow

## Datoteke (sažeto)
**Nove:**
- `supabase/functions/notify-project-activity/index.ts`
- `supabase/functions/_shared/projectActivityThrottle.ts`
- migracija: tablica `project_activity_push_throttle` + RLS (samo service role)

**Izmjene (mali dodatci poziva):**
- `src/hooks/useProjectWorkLogs.ts`
- `src/hooks/useProjectMilestones.ts`
- `src/i18n/locales/hr.json`, `en.json`, `de.json`

## Rizici
- Praktički nikakvi: push je „best-effort", ako padne edge funkcija UI flow nastavlja normalno (postojeći pattern).
- Throttle tablica je per (user, project, bucket) — bez race uvjeta, koristim `INSERT … ON CONFLICT DO UPDATE`.

## Krajnji rezultat
Kad Petar upiše dnevnik → ti dobiješ push „Petar je upisao dnevnik (10.5., 7h) u projektu X". Ako u sljedećih 5 min upiše još 3 dnevnika → bez novog pusha, ali zvono u appu pokazuje sve. Nakon 5 min sljedeća promjena dolazi kao „Petar i još 3 promjene u projektu X". Isto vrijedi za milestone, transakcije i bilješke.
