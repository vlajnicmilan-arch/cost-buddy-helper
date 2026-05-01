# Plan v2: Dnevnik = jedini unos, sati se izračunavaju iz njega

## Filozofija (po tvojim odgovorima)

1. **Strogo izoliranje** — član vidi **samo svoje** dnevnike i svoje sate. Tuđe ništa.
2. **Manager ima full kontrolu** — invite je obavezan, ručno mapiranje radnika ↔ člana, ručno odobravanje (opcionalno).
3. **Single source of truth = `project_work_logs`** — član unosi **dnevnik**, a u istom obrascu upiše i **sate koje je radio taj dan**. Sustav iz tog jednog unosa automatski generira `project_work_entries` zapis (satnica). Nema dva odvojena unosa.
4. **Bez free limita** za vlastite dnevnike — neograničeno (vlasnik plaća Pro za projekt, član je samo "izvršitelj").

## Kako to izgleda za korisnika (3 perspektive)

### A) Manager (Pro/Business, vlasnik projekta)
1. U Workers tabu doda radnika (ime, satnica, pozicija) — **kao i sad**.
2. Klik "Pozovi u app" na tom radniku → generira invite link (postojeći `generateInviteLink` flow) **ali s novim parametrom `worker_id`**. Link nosi info "ovaj invite je za radnika XY".
3. Šalje link radniku (WhatsApp, SMS, email).
4. Kad radnik prihvati, sustav ga **automatski mapira** na taj `project_workers` zapis (popuni `project_workers.user_id`). Manager ne mora ništa dodatno raditi.
5. U Workers tabu vidi badge "Povezan ✓" pored radnika.
6. U Worklog/Workers vidi sve unose svih radnika — bez promjene.

### B) Pozvani radnik (free, NEMA Pro)
1. Otvori invite link → `/join-project/:token`.
2. Vidi: "Pozvan si u projekt **[ime]** kao radnik **[ime radnika]**". Klik "Prihvati".
3. Nakon prihvaćanja landa na **suženi prikaz projekta** (employee mode):
   - Header: ikona + ime projekta + status. Bez budgeta, bez P&L.
   - Tabovi: samo **"Moj dnevnik"** (i ništa drugo).
4. "Moj dnevnik" pokazuje:
   - Lista **njegovih** dnevnih zapisa (kronološki).
   - Suma sati: "Ukupno ovaj mjesec: 152h".
   - Gumb "+ Novi zapis za danas".
5. Form za novi zapis (dnevnik+sati spojeni):
   - Datum (default: danas)
   - **Sati** (numeric, npr. 8.5) ← novo polje
   - Faza/milestone (opcionalno)
   - Vrijeme (opcionalno)
   - Što je rađeno (textarea, voice input — postojeće)
   - Napomene (opcionalno)
6. Spremi → backend istovremeno upiše u `project_work_logs` **i** u `project_work_entries` (auto-generirano iz dnevnika). Ako ne postoji `project_workers` red povezan s userom, kreira se on the fly s default `hourly_rate=0`.
7. Idući dan otvori app → ista ruta `/projects` → vidi listu projekata u koje je pozvan → tap → odmah na "Moj dnevnik".

### C) Free korisnik koji NIJE pozvan nigdje
- Ne vidi `/projects` rutu (kao i sad), dobiva `UpgradePrompt`.

## Ključna promjena: dnevnik + sati = jedan unos

Trenutno postoje dvije tablice s preklapajućom svrhom:
- `project_work_logs` (dnevnik: što je rađeno tekstualno)
- `project_work_entries` (sati po danu)

Nećemo brisati `project_work_entries` jer je već integrirana u Workers tab, izvještaje, P&L, payroll exporte. Umjesto toga:

- Dodajemo `hours` kolonu u `project_work_logs`.
- DB trigger `sync_work_log_to_entry`: na INSERT/UPDATE/DELETE u `project_work_logs`, ako log ima `user_id` mapiran na `project_workers` zapis, automatski upsert/delete u `project_work_entries` (`actual_hours = NEW.hours`, `scheduled_hours = NEW.hours`, `note = NEW.summary`).
- Ako manager ručno doda `project_work_entries` (kao sad u Workers tab) za radnika koji **nije** korisnik appa → radi kao i prije, nema dnevnika.
- Ako član obriše svoj dnevnik → trigger briše i pripadajući entry.

Ovim postižemo:
- Član ima **jedan obrazac** za sve.
- Manager dobiva **i** tekstualni dnevnik **i** točne sate kalkulirane bez dodatnog rada.
- Postojeći Workers tab, izvještaji, P&L rade dalje bez ijedne promjene jer entries i dalje postoje.

## Promjene u DB

```sql
-- 1) Mapping radnik ↔ user
ALTER TABLE public.project_workers
  ADD COLUMN user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX project_workers_project_user_uniq
  ON public.project_workers(project_id, user_id)
  WHERE user_id IS NOT NULL;

-- 2) Sati direktno u dnevniku
ALTER TABLE public.project_work_logs
  ADD COLUMN hours numeric NULL CHECK (hours IS NULL OR (hours >= 0 AND hours <= 24));

-- 3) Worker_id u invitation za auto-mapping nakon prihvata
ALTER TABLE public.project_invitations
  ADD COLUMN worker_id uuid NULL REFERENCES public.project_workers(id) ON DELETE SET NULL;

-- 4) Trigger: dnevnik → entry sync
CREATE OR REPLACE FUNCTION public.sync_work_log_to_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_worker_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT id INTO v_worker_id FROM project_workers
      WHERE project_id = OLD.project_id AND user_id = OLD.user_id LIMIT 1;
    IF v_worker_id IS NOT NULL THEN
      DELETE FROM project_work_entries
        WHERE worker_id = v_worker_id AND work_date = OLD.log_date
          AND project_id = OLD.project_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.hours IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_worker_id FROM project_workers
    WHERE project_id = NEW.project_id AND user_id = NEW.user_id LIMIT 1;
  IF v_worker_id IS NULL THEN RETURN NEW; END IF;  -- nije mapiran, ne sinkroniziraj

  INSERT INTO project_work_entries (worker_id, project_id, work_date,
    scheduled_hours, actual_hours, note, milestone_ids)
  VALUES (v_worker_id, NEW.project_id, NEW.log_date,
    NEW.hours, NEW.hours, NEW.summary,
    CASE WHEN NEW.milestone_id IS NULL THEN NULL ELSE ARRAY[NEW.milestone_id] END)
  ON CONFLICT (worker_id, work_date) DO UPDATE
    SET actual_hours = EXCLUDED.actual_hours,
        scheduled_hours = EXCLUDED.scheduled_hours,
        note = EXCLUDED.note,
        milestone_ids = EXCLUDED.milestone_ids,
        updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_work_log_to_entry
  AFTER INSERT OR UPDATE OR DELETE ON public.project_work_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_work_log_to_entry();

-- (Treba i unique constraint na project_work_entries(worker_id, work_date) ako ne postoji.)

-- 5) Stroga RLS izolacija za free člana
DROP POLICY "Members can view project work logs" ON public.project_work_logs;
CREATE POLICY "Owners see all logs, members see only own"
  ON public.project_work_logs FOR SELECT
  USING (
    is_project_owner(project_id, auth.uid())
    OR auth.uid() = user_id
  );

DROP POLICY "Project members can view work entries" ON public.project_work_entries;
CREATE POLICY "Owners see all entries, members see only own"
  ON public.project_work_entries FOR SELECT
  USING (
    is_project_owner(project_id, auth.uid())
    OR EXISTS (SELECT 1 FROM project_workers w
               WHERE w.id = project_work_entries.worker_id
                 AND w.user_id = auth.uid())
  );

DROP POLICY "Project members can view workers" ON public.project_workers;
CREATE POLICY "Owners see all workers, members see only own row"
  ON public.project_workers FOR SELECT
  USING (
    is_project_owner(project_id, auth.uid())
    OR user_id = auth.uid()
  );
```

## Promjene na frontendu

### `src/pages/Projects.tsx`
Umjesto tvrdog `hasAccess('projects')` gatea: ako user nema pristup ali **ima ≥1 članstvo gdje nije manager**, pokaži panel; inače `UpgradePrompt`.

### `src/components/projects/ProjectsPanel.tsx`
- Free član vidi samo projekte u koje je pozvan.
- Sakriti "+ Novi projekt" CTA i sve manage akcije ako `!hasAccess('projects')`.

### `src/components/projects/ProjectFullScreenView.tsx`
- Nova grana: ako `!hasAccess('projects') && !isManager` → renderiraj `EmployeeProjectView` (novi minimalni component) umjesto kompletnog tab seta.
- `EmployeeProjectView`: header (ikona + ime + status), jedan tab "Moj dnevnik" = `ProjectWorkLogTab` u "myOnly" modu.

### `src/components/projects/WorkLogDialog.tsx`
- Dodati polje **Sati** (numeric input, korak 0.25, max 24).
- Dodati u `ProjectWorkLogInput` tipove `hours?: number | null`.
- Tooltip: "Sati se automatski upisuju i u tvoju mjesečnu satnicu."

### `src/components/projects/ProjectWorkLogTab.tsx`
- Novi prop `myOnly?: boolean`. Ako true:
  - Sakriti listu tuđih dnevnika (RLS to ionako filtrira, ali UI poliranje).
  - Sakriti `hoursByDate` summary (to je manager view).
  - Header pokazuje "Ukupno ovaj mjesec: Xh" za vlastite unose.
  - Sakriti filter "Sve faze + svi članovi" (ostavlja samo month filter).

### `src/components/projects/ProjectWorkerDialog.tsx` (manager view)
- Dodati gumb "Pozovi radnika u app" pored existing fields.
- Klik → generira invite link s `worker_id` parametrom.
- Ako je radnik već povezan → badge "Povezan ✓" + display_name korisnika.

### `src/hooks/useProjectMembers.ts`
- `generateInviteLink` proširen s opcionalnim `workerId` parametrom.

### `supabase/functions/accept-project-invitation/index.ts`
- Nakon `consume_invitation_token` i kreiranja member zapisa: ako invitation ima `worker_id`, upsert `project_workers.user_id = user.id` za taj redak.
- Ako `worker_id` ne postoji → ponašaj se kao i prije (običan member invite, npr. supruga koja gleda projekt).

### i18n ključevi (HR/EN/DE)
```
workLog.hours = "Sati"
workLog.hoursPlaceholder = "npr. 8"
workLog.hoursHint = "Tvoji sati će se automatski zbrojiti u mjesečnu satnicu."
workLog.totalThisMonth = "Ukupno ovaj mjesec"
projects.employeeMode = "Radnički prikaz"
projects.myWorkLog = "Moj dnevnik"
projects.invitedAsWorker = "Pozvan/a si kao radnik"
projects.workerLinked = "Povezan"
projects.inviteWorkerToApp = "Pozovi u aplikaciju"
projects.workerNotLinked = "Radnik još nije u aplikaciji"
```

## Edge case-ovi i koji su pokriveni

| Slučaj | Ponašanje |
|---|---|
| Manager ručno doda entry u Workers tab za radnika koji JE u appu | Trigger se ne triggera (jer pišemo u entries, ne u logs). Entry se vidi normalno, član ga vidi (RLS ga propušta jer ima isti `worker_id`). Manager rješava ako želi razdvojiti. |
| Član obriše svoj dnevnik | Trigger briše i odgovarajući entry. Sati nestaju iz mjesečne sume. |
| Član izmijeni sate u postojećem dnevniku | Trigger upsert-a entry s novim brojem. |
| Član uđe u dva dnevnika za isti dan | Postojeći unique constraint `(project_id, user_id, log_date)` na work_logs (ako postoji — provjeriti) ili dodati. Ako ne postoji, dva loga = drugi nadjača prvi entry kroz upsert. Predlažem unique constraint. |
| Više faza istog dana | Trenutno `project_work_logs` ima jedan `milestone_id` po zapisu. Ako je radnik radio na 2 faze isti dan → mora unijeti 2 dnevnika. Treba dropnuti unique-by-day constraint i prepustiti zbrajanje sati. (Odluka pri implementaciji.) |
| Član nije mapiran na worker (legacy) | Dnevnik se sprema, ali entry se ne kreira. Nema crash-a. Manager u Workers tab-u može retroaktivno kliknuti "Poveži s userom" pa od tog trenutka dnevnici stvaraju entries. |
| Radnik mijenja Pro u toku rada | Ništa se ne mijenja — entries i logs ostaju, samo dobiva pristup ostalim tabovima. |

## Sigurnosna razmatranja

- `hourly_rate` se NE prikazuje free članu (RLS na `project_workers` ga ograničava na vlastiti red, ali rate stoji u istom redu — UI mora taj field sakriti u employee modu, ili još bolje: stvoriti view `project_workers_self` bez rate). **Predlažem view bez `hourly_rate` koji koristi employee UI** — sigurnije od UI hide-a.
- Trigger `SECURITY DEFINER` mora imati zaključan `search_path` (već je u predlošku).
- Audit: postojeći `log_project_activity` trigger će automatski logirati nove dnevnike pod current user — to je dovoljno za auditabilnost.

## Plan rollouta

1. **Migracija** — kolone, trigger, RLS politike (bez breaking change na postojeći data).
2. **Backend** — update `accept-project-invitation` za `worker_id` mapping.
3. **WorkLogDialog** — dodati polje `hours`.
4. **ProjectWorkLogTab** — `myOnly` mode.
5. **EmployeeProjectView** — novi minimalni screen.
6. **Projects.tsx + ProjectsPanel** — otvoriti članovima.
7. **ProjectWorkerDialog** — gumb "Pozovi u app".
8. **i18n + memory entry** — dokumentirati novi pattern.

## Što ostaje za buduću iteraciju (ne sad)

- Push notifikacija manageru kad član preda dnevnik.
- "Approval" workflow gdje manager mora potvrditi sate prije nego uđu u payroll.
- Push notifikacija članu "ne zaboravi unijeti dnevnik" u 18:00.

Reci ako se slažeš s ovim modelom (jedan unos = dnevnik + sati, auto-sync u entries) ili želiš još koju promjenu prije nego krenem.
