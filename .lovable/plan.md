# Sljedeći koraci (unutar scopea)

## PR-B — UI sloj: STANJE

### DONE (Slice 1)
- `useWorkerPayouts` hook (fetch/create/void) + `buildCreatePayoutRpcArgs` pure helper.
- `WorkerPayoutsDialog` (list + inline "Nova isplata" forma + void confirm).
- `useProjectWriteGuard` proširen s `canManageWorkerPayouts` (owner_subscriber only).
- Wire u `ProjectWorkersTab`: Wallet ikona u actions area po redu radnika.
- i18n hr/en/de (`workers.payouts.*`).
- Vitest: 6 novih testova (RPC arg contract). Suite 871/871 zeleno.

### DONE (Slice 2)
- `UnlockEntryDialog` (owner-only, poziva `unlock_work_entry` RPC uz obavezan razlog).
- `WorkCalendarOverview` fetcha `payout_id`, prikazuje "Zaključano" badge na entry karticama, mijenja Trash → Unlock ikonu za locked unose (samo `owner_subscriber`).
- Edit locked entry: prikazuje amber hint, disable-a scheduled_hours/milestones, prikazuje "Razlog izmjene" polje i poziva `update_locked_work_entry` RPC. Ostali unosi idu klasičnim update-om.
- Delete locked entry blokiran s toast porukom (mora se prvo otključati).

### DONE (Slice 3)
- Calendar day-level lock indikator: dani s bar jednim locked unosom dobiju narančasti prsten (outline) + legend hint ispod kalendara.
- "Preostalo radnicima" KPI u `ProjectWorkersTab` summary kartici: `useProjectWorkers` prošireno s `totalRemainingCost`/`totalRemainingHours` (sum unpaid entries × current rate).

### BLOCKER (odgođeno)
- Warning "hourly_rate mijenjan unutar perioda" — nema audit historije za `hourly_rate` na `project_workers`. Bez `worker_rate_history` tablice ne mogu detektirati promjene. Zahtijeva zasebnu migraciju (PR-C+).

## PR-C — Extras (plan 2.7 koraci 9–10 + P7)
- Push radniku pri kreiranju payouta (reuse FCM).
- CSV export payouta (reuse `fileExport.ts`).
- P7 RLS SQL scenarij.

## Otvoreno
- CI Balance SQL suite: zadnji run (6h ago) failao je prije nego što je baseline stubao `public.projects`. Sljedeći push bi trebao biti zelen. Verifikacija odgođena.
