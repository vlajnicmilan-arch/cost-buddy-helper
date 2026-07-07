# Sljedeći koraci (unutar scopea)

## PR-B — UI sloj: STANJE

### DONE (Slice 1)
- `useWorkerPayouts` hook (fetch/create/void) + `buildCreatePayoutRpcArgs` pure helper.
- `WorkerPayoutsDialog` (list + inline "Nova isplata" forma + void confirm).
- `useProjectWriteGuard` proširen s `canManageWorkerPayouts` (owner_subscriber only).
- Wire u `ProjectWorkersTab`: Wallet ikona u actions area po redu radnika.
- i18n hr/en/de (`workers.payouts.*`).
- Vitest: 6 novih testova (RPC arg contract). Suite 871/871 zeleno.

### TODO (Slice 2 — sljedeći PR-B nastavak)
- Calendar lock ikone + audit (WorkCalendarOverview): prikaz `payout_id` na entry, "zaključan" badge.
- `UnlockEntryDialog` (owner-only, poziva `unlock_work_entry` RPC).
- `update_locked_work_entry` UI: inline edit locked entry s obaveznim razlogom.
- Project card "Preostalo radnicima" KPI (`useProjectStats` extension).
- Warning ako je `hourly_rate` mijenjan unutar odabranog perioda (create form).

## PR-C — Extras (plan 2.7 koraci 9–10 + P7)
- Push radniku pri kreiranju payouta (reuse FCM).
- CSV export payouta (reuse `fileExport.ts`).
- P7 RLS SQL scenarij.

## Otvoreno
- CI Balance SQL suite: zadnji run (6h ago) failao je prije nego što je baseline stubao `public.projects`. Sljedeći push bi trebao biti zelen. Verifikacija odgođena.
