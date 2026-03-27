

# AI Asistent: Podsjetnici i Kalendar Integracija

## Pregled
Dodati sustav podsjetnika koji AI asistent može kreirati iz razgovora. Korisnik dobiva obavijesti kad podsjetnik dođe na red, a može i exportirati događaje kao `.ics` datoteku za Google/Apple/Outlook kalendar.

## Promjene

### 1. Nova tablica `reminders` (migracija)
```sql
CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_profile_id uuid,
  title text NOT NULL,
  description text,
  remind_at timestamptz NOT NULL,
  type text DEFAULT 'custom',
  is_completed boolean DEFAULT false,
  notified boolean DEFAULT false,
  related_entity_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
-- RLS: korisnici upravljaju samo svojim podsjetnicima
-- Realtime enabled za live update
```

### 2. Tri nova AI alata u edge funkciji
**Datoteka: `supabase/functions/financial-assistant/index.ts`**

- **`create_reminder`** — parametri: `title`, `remind_at`, `description`, `type` (payment/goal/review/custom). AI kreira podsjetnik i potvrdi korisniku.
- **`get_reminders`** — dohvaća aktivne podsjetnike sortirane po datumu. AI ih može prikazati i komentirati.
- **`complete_reminder`** — označava podsjetnik kao završen po `reminder_id`.

System prompt se proširuje sekcijom za podsjetnike — AI nudi podsjetnik kad se dogovore rokovi ili plaćanja.

### 3. Cron edge funkcija `check-reminders`
**Nova datoteka: `supabase/functions/check-reminders/index.ts`**

- Svakih 15 min (poziva se putem pg_cron ili externog schedulera)
- Pronalazi podsjetnike gdje je `remind_at <= now()` i `notified = false` i `is_completed = false`
- Kreira zapis u `notifications` tablici (postojeći sustav)
- Označava podsjetnik kao `notified = true`

### 4. ICS export na klijentu
**Nova datoteka: `src/lib/icsExport.ts`**

Utility funkcija koja iz reminder podataka generira `.ics` string i nudi download. Koristi se kad AI predloži "Dodaj u kalendar".

### 5. Prikaz podsjetnika u NotificationsDropdown
**Datoteka: `src/components/NotificationsDropdown.tsx`**

Dodati ikonu za tip `reminder` u `getNotificationIcon`. Ništa više — postojeći sustav obavijesti automatski prikazuje reminder notifikacije.

## Tehnički detalji

```text
Tablica: reminders
  id, user_id, business_profile_id, title, description,
  remind_at, type, is_completed, notified, related_entity_id, created_at

AI toolovi (u executeTool):
  create_reminder  → INSERT INTO reminders (s mode filterom)
  get_reminders    → SELECT WHERE is_completed=false, sortirano po remind_at
  complete_reminder → UPDATE SET is_completed=true

check-reminders edge fn:
  SELECT reminders WHERE remind_at <= now() AND notified=false AND is_completed=false
  → INSERT INTO notifications (user_id, title, message, type='reminder')
  → UPDATE reminders SET notified=true

ICS format:
  VCALENDAR → VEVENT s DTSTART, SUMMARY, DESCRIPTION
  Download kao blob
```

Datoteke za promjenu:
- Nova migracija za `reminders` tablicu + RLS
- `supabase/functions/financial-assistant/index.ts` — 3 nova toola + system prompt
- `supabase/functions/check-reminders/index.ts` — nova edge funkcija
- `src/lib/icsExport.ts` — ICS generator
- `src/components/NotificationsDropdown.tsx` — ikona za reminder tip

