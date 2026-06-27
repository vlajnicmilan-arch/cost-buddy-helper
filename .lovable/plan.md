## Odluka
Preview crash alerts → severity `info`. Postojećih 58 zapisa ostaje. Prod/APK netaknuti.

## Promjene
1. `supabase/functions/monitor-app-health/index.ts` — ako `environment === 'preview'`, forsirati `severity = 'info'` za `previous_boot_crashed`.
2. `src/main.tsx` — `import.meta.hot` guard: u HMR reloadu ne upisivati boot watchdog flag.
3. Admin Pulse badge — verifikacija da `info` ima neutralnu boju.

## Ne diram
Prod/APK watchdog, postojećih 58 zapisa, RLS, strukturu tablica.

## Verifikacija
HMR reload u previewu → nema novih `error` zapisa. Build auto.
