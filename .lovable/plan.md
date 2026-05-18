## Cilj
Implementirati 30-dnevni "Koš za smeće" za 4 entiteta (+ milestones u cascade), s minimalnom regresijom: postojećih 60+ SELECT call-siteova ostaje nedirnut zahvaljujući RLS-u; brisanje i restore idu kroz centralizirane hookove/RPC.

## Strategija (potvrđeno)
- **Filter**: globalni RESTRICTIVE RLS dodatak po tablici (`deleted_at IS NULL`). Postojeće permissive polise ostaju netaknute.
- **Cascade**: Postgres `AFTER UPDATE` trigger na `projects.deleted_at`.
- **UNDO**: samo na glavnim listama (Dashboard txn list, Wallet, ProjectsPanel, ProjectFundingTab invoices/estimates).
- **Milestones**: uključeni u soft-delete (cascade s projektom; nisu zasebno brisivi iz UI-ja, ne pojavljuju se kao zasebna grupa u Trashu).

---

## 1. Migracija (DB)

### 1.1 Kolone
Na `expenses`, `projects`, `project_invoices`, `project_estimates`, `project_milestones`:
- `deleted_at TIMESTAMPTZ NULL`
- `deleted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL`
- Index: `CREATE INDEX ON <t> (user_id, deleted_at) WHERE deleted_at IS NULL` (hot path) i `CREATE INDEX ON <t> (deleted_at) WHERE deleted_at IS NOT NULL` (cleanup + trash).

### 1.2 RLS — restriktivna policy
Po tablici dodati JEDNU restriktivnu policy:
```sql
CREATE POLICY "hide_soft_deleted" ON public.<t>
AS RESTRICTIVE FOR SELECT TO authenticated
USING (deleted_at IS NULL);
```
Postojeće permissive SELECT policies (owner, members, family, public-share) ostaju. Restriktivna se kombinira preko AND → svaki postojeći SELECT automatski skriva soft-obrisane redove. **Nula izmjena u 60+ call-siteova i edge funkcijama.**

Napomena: edge funkcije koje koriste `SERVICE_ROLE_KEY` zaobilaze RLS — moraju eksplicitno dodati `.is('deleted_at', null)` ili koristiti view (vidi 1.3).

### 1.3 View za service-role konzumere (sigurnosna mreža)
Dodati read-only viewe `expenses_active`, `projects_active` itd. koji uvijek filtriraju. Edge funkcije koje agregiraju (financial-assistant, generate-ai-insights, send-daily-summary, check-budget-alerts, check-milestone-budgets, check-milestone-deadlines, project-insights, get-public-project, notify-*) ažurirati da čitaju iz `_active` viewa. **Ovo je nužno za 4 edge funkcije koje koriste service role i moraju ignorirati obrisano** (auto-invoice-reminders, check-*, generate-ai-insights, send-daily-summary). Ostatak (notify-*, koji radi na trenutku INSERT-a) je nebitan jer se INSERT ne aktivira soft-deleteom.

### 1.4 Cascade trigger
```sql
CREATE FUNCTION cascade_project_soft_delete() RETURNS TRIGGER ...
-- AFTER UPDATE OF deleted_at ON projects
-- Ako NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL:
--   UPDATE expenses, project_invoices, project_estimates, project_milestones
--   SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by
--   WHERE project_id = NEW.id AND deleted_at IS NULL
-- Ako NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL:
--   UPDATE ... SET deleted_at = NULL, deleted_by = NULL
--   WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at
--   (precizno OLD.deleted_at da ne vratimo stavke obrisane ranije zasebno)
```
SECURITY DEFINER, search_path = public.

### 1.5 RPC funkcije za Trash (SECURITY DEFINER)
```
list_trash() RETURNS TABLE(entity_type text, id uuid, title text, deleted_at timestamptz, deleted_by uuid, deleter_name text)
  -- UNION ALL preko 4 tablice (milestones se NE listaju zasebno — cascade na projektu)
  -- WHERE user_id = auth.uid() AND deleted_at IS NOT NULL
  -- Za projects: dodatno members; za invoices/estimates: vezano kroz project_id

restore_trash_item(p_entity text, p_id uuid) RETURNS void
  -- Permission check (owner ili manager)
  -- UPDATE <t> SET deleted_at = NULL, deleted_by = NULL WHERE id = p_id

purge_trash_item(p_entity text, p_id uuid) RETURNS void
  -- Stvarni DELETE, FK CASCADE riješi povezano
```

### 1.6 Cleanup
SQL funkcija `purge_old_trash()`:
- Briše sve sa `deleted_at < now() - interval '30 days'` po 4 tablice.
- Vraća JSON s brojem obrisanih po tablici.
- Logira u `app_diagnostics_logs` (postoji, koristi se za diagnostics).

---

## 2. Edge function `cleanup-trash`
- Dnevni cron job (pg_cron, `0 3 * * *`).
- Poziva `purge_old_trash()`.
- Loga u `app_diagnostics_logs` (`level: 'info', source: 'cleanup-trash', message: 'Purged N items', metadata: {...}`).

---

## 3. Frontend — soft delete + UNDO

### 3.1 Helper `src/lib/softDelete.ts`
```ts
softDelete(table, id, userId): Promise<void>
restore(table, id): Promise<void>
purge(table, id): Promise<void>
```
Wrapper oko Supabase `.update({ deleted_at: new Date().toISOString(), deleted_by: userId })`.

### 3.2 Izmjene u hookovima
- `useExpenseCRUD.ts` — `deleteExpense` mijenja `.delete()` u soft delete; **ne diram balance updater** jer RLS sakrije red i `useExpenseFetch` ga ne vrati → balansi se računaju samo od vidljivih.
- `useProjects.ts` — `deleteProject` → soft delete; trigger sve ostalo riješi.
- `useProjectInvoices.ts` — `deleteInvoice` → soft.
- `useProjectEstimates.ts` — `deleteEstimate` → soft.
- `useProjectMilestones.ts` — `deleteMilestone` ostaje **hard delete** (per odgovor: milestones cascade samo s projektom, samostalno se tvrdo brišu — to znači UI gumb za brisanje pojedinog milestone-a ostaje destruktivan; alternativno možemo i tu uvesti soft, javi ako želiš).

### 3.3 UNDO toast (10s) — helper `src/lib/undoToast.ts`
Koristi `sonner`:
```ts
showUndoToast({ message, onUndo, duration: 10000 })
```
Pozvati nakon soft delete-a u:
- `TransactionsList` (Dashboard/Wallet)
- `ProjectsPanel` lista
- `ProjectInvoicesPanel` / `ProjectEstimatesPanel` (u ProjectFundingTab)

Ostala mjesta brisanja (bulk actions, detail dialog) → soft delete bez UNDO, samo standardni `StatusFeedback`.

### 3.4 Balance & dashboard
Ne treba ručno čistiti — RLS skriva → `useExpenseFetch` ne vidi → balansi/projektni P&L automatski točni.

---

## 4. Trash stranica `/trash`

### 4.1 Routing
- Lazy route u `App.tsx`.
- Link iz `SettingsSection` (postoji u SettingsDialog) — nova stavka "Koš za smeće".

### 4.2 Komponente
- `src/pages/Trash.tsx` — koristi `useTrashItems` hook koji zove RPC `list_trash`.
- Grupiranje po `entity_type` (4 sekcije: Transakcije, Projekti, Fakture, Ponude).
- Po stavci: naslov/opis, `deleted_at` (formatDistanceToNow), `deleter_name` ako se razlikuje od auth usera (family scenario), gumbi **Vrati** i **Obriši trajno** (s `AlertDialog` potvrdom).
- Banner: "Stavke se automatski trajno brišu nakon 30 dana".
- Prazan state: ilustracija + tekst.

### 4.3 Mutacije
- `useRestoreTrashItem` → RPC `restore_trash_item` → invalidate sve relevantne query keys.
- `usePurgeTrashItem` → RPC `purge_trash_item` → invalidate trash.

### 4.4 i18n
Novi namespace `trash.*` u hr/en/de (naslov, grupe, gumbi, prazan state, confirm dialog).

---

## 5. Testovi

### 5.1 Unit (vitest)
`src/test/softDelete.test.ts`:
- Pure helper test: `restoreCount === deleteCount` simulira logiku kroz čisti reducer (lista → softDelete → restore → lista mora biti identična po ID-evima i redoslijedu).
- Cascade helper test: ako projekt ima N stavki, nakon `cascadeDelete` sve dobiju isti `deleted_at`; nakon `cascadeRestore` (s točnim timestampom) — vraćaju se samo stavke obrisane tim istim eventom (ne stavke obrisane ranije zasebno).

Ne testiram RLS/RPC direktno (per memory: "NE testirati edge functions/Supabase chain mocks").

---

## 6. Dokumentacija
- Novi memory file `mem://features/soft-delete-trash` (+ index entry).
- Pravilo: nova tablica koja ide u Trash → migracija + dodati u `list_trash`/`purge_old_trash` + (po potrebi) trigger.

---

## Što NE radim (ograničenje scope-a)
- Bulk actions, pending transactions, recurring transactions, budgets, family/wallet members — ne ulaze u soft-delete (per zahtjev: samo 4 tablice + milestones cascade).
- Hard delete edge funkcija za GDPR account deletion (postoji zaseban flow) ostaje hard — dodajem joj samo `WHERE TRUE` (uključuje i soft-obrisane) jer ionako briše sve.
- Native APK rebuild **nije potreban** — sve promjene su JS + DB.

## Otvoreno pitanje (odgovori prije implementacije ili odgodi)
Soft-delete pojedinačnog milestone-a (van cascade konteksta): trenutno predlažem da ostane **hard delete** jer milestones nisu u zahtjevu kao samostalan entitet u Trashu. Ako želiš da i ručno brisanje milestone-a ide u Trash kao zasebna grupa — javi i dodajem 5. grupu na /trash stranicu.
