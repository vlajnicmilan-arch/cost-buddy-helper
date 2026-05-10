## Cilj

Omogućiti da se **radnik** (`project_workers`, ima cijenu sata) poveže s **članom projekta** (`project_members`, ima račun u aplikaciji) tako da se sati koje član sam upiše automatski obračunaju × cijena u P&L.

## Što se mijenja

### 1. ProjectWorkersTab — kartica radnika

Na svakoj kartici radnika dodaje se:
- **Badge stanja**:
  - Zeleni: "Povezan: {ime člana}"
  - Sivi: "Bez računa (samo evidencija)"
- **Akcija "Poveži s članom"** (kad nije povezan) → otvara mali dialog s listom članova projekta koji još nisu povezani s nekim workerom
- **Akcija "Ukloni vezu"** (kad jest povezan)

Spremanje: `UPDATE project_workers SET user_id = ? WHERE id = ?`

### 2. AddWorkerDialog (kreiranje novog radnika)

Na vrh forme dodaje se opcionalno polje:
- **"Već je član projekta?"** → dropdown članova projekta koji još nisu workeri
- Kad se odabere član → ime/prezime se auto-popune iz njegovog profila, `user_id` postavi
- Kad se ostavi prazno → standardni unos kao i sad (npr. vanjski podizvođač)

### 3. Backfill postojećih sati (jednokratno, samo za Petra)

Nakon povezivanja Petrov worker ↔ Petrov user, postojeći zapisi u `project_work_logs` (3 zapisa) trebaju "okinuti" trigger `sync_work_log_to_entry` da kreira `project_work_entries`.

Dvije opcije — odabire se **B** jer je generička:

- **A** Ručno: jednokratni `UPDATE project_work_logs SET updated_at = now() WHERE worker povezan i nema entry`
- **B** Generički, bolje: kad korisnik klikne "Poveži s članom" → backend automatski potraži sve postojeće work_logs tog usera na tom projektu bez entry-ja i napravi `UPDATE updated_at` → trigger sve obradi.

### 4. i18n ključevi

Pod `projects.workers.link.*`:
- `linkToMember`, `linkedTo`, `noAccount`, `unlink`, `selectMember`, `noMembersAvailable`, `alreadyMemberQuestion`

## Datoteke

- `src/components/projects/ProjectWorkersTab.tsx` — badge + akcije
- `src/components/projects/AddWorkerDialog.tsx` (ili gdje se dodaju radnici) — opcionalno polje "već je član"
- novi `src/components/projects/LinkWorkerToMemberDialog.tsx` — mali izbornik
- `src/hooks/useProjectWorkers.ts` — `linkWorkerToMember(workerId, userId)` + auto-backfill mutacija
- `src/i18n/locales/{hr,en,de}.ts` — novi ključevi

## Što se NE dira

- `WorkLogDialog` (ostaje kao i sad — nikakav novi izbornik)
- Trigger `sync_work_log_to_entry` (već radi ispravno čim worker.user_id postoji)
- `useProjectProfitLoss` (sam će pokupiti entries)
- Personal mode

## Rizici

Praktički nikakvi:
- Veza se može ukloniti
- Backfill je deterministički (samo logovi tog jednog usera bez postojećeg entry-a)
- Bez schema migracije (kolona `user_id` već postoji u `project_workers`)

## Krajnji rezultat

1. Klikneš "Poveži s članom" na Petrovoj kartici → odabereš Petra
2. Petrova 3 stara dana automatski uđu u P&L kao 7 h × 6 € = 42 €
3. Svi budući dani koje Petar upiše obračunavaju se automatski
4. Kad sljedeći put dodaješ radnika koji je već član → biraš ga iz dropdowna i sve je odmah povezano