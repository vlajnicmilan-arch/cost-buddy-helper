# Sljedeći koraci (unutar scopea)

## 1. Zatvoriti PR-A rep
- Dodati `20260707080136` i `20260707081138` u `supabase/tests/balance/BALANCE_MIGRATIONS.txt` (drift-check).
- SQL P1–P6: blokirano jer `baseline.sql` nema `projects`/`project_workers`. Dvije opcije:
  - (a) stub tablice u `bootstrap.sql` sada (brzo, izolirano)
  - (b) odgoda do zasebnog Infra PR-a (rizik: PR-B/C landaju bez SQL gatea)

## 2. PR-B — UI sloj (plan 2.4)
- `WorkerDetail` sekcija "Isplate"
- `CreatePayoutDialog` (period picker, edit, lock checkbox, warning ako je hourly_rate mijenjan u periodu)
- `WorkerPayoutList` + status badge
- Calendar lock ikone + audit
- Project card "Preostalo radnicima"
- `UnlockEntryDialog` (owner-only)
- `canManageWorkerPayouts` u `useProjectWriteGuard`
- i18n hr/en/de
- Vitest: permission matrix

## 3. PR-C — Extras (plan 2.7 koraci 9–10 + P7)
- Push radniku pri kreiranju payouta (reuse FCM)
- CSV export payouta (reuse `fileExport.ts`)
- P7 RLS SQL scenarij

## Pitanje
SQL P1–P6 gate: (a) stub sada, ili (b) odgoda? Whitelist txt idem odmah bez obzira na odgovor.
