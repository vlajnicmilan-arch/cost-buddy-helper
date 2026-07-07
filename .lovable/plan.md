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

### TODO (Slice 3)
- Calendar day-level lock indikator (mali lock overlay na danima s locked unosima).
- Project card "Preostalo radnicima" KPI (`useProjectStats` extension).
- Warning ako je `hourly_rate` mijenjan unutar odabranog perioda (payout create form).

## PR-C — Extras (plan 2.7 koraci 9–10 + P7)
- Push radniku pri kreiranju payouta (reuse FCM).
- CSV export payouta (reuse `fileExport.ts`).
- P7 RLS SQL scenarij.

## Otvoreno
- CI Balance SQL suite: zadnji run (6h ago) failao je prije nego što je baseline stubao `public.projects`. Sljedeći push bi trebao biti zelen. Verifikacija odgođena.
