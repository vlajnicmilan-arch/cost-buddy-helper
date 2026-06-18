---
name: Guided Home State
description: Per-user server-side guided/0-data home stanje preko profiles.guided_home_exited_at + GUIDED_EXPENSE_THRESHOLD=3
type: feature
---

# Guided Home

`/home` ima 3 stanja:
- `zero_data` — onboarding završen ili skip-an, 0 stvarnih unosa → ZeroDataQuietState (pozdrav + 1 rečenica + 1 CTA + tekstualni "preskoči")
- `guided` — 1..2 stvarnih unosa → GuidedHomeView (week strip 7 mjesta, zadnji unos, "Dodaj još jedan" CTA)
- `standard` — postojeći PersonalModeView layout (sve sekcije)

## Source of truth

`profiles.guided_home_exited_at timestamptz NULL` — per-user, cross-device.
`localStorage` (`guided_home_exited_at:<userId>`) je samo read-through cache za prvi render; server uvijek pobjeđuje pri prvom fetchu.

## Auto-exit pravila

Status računa `src/lib/guidedMode.ts`:
- `guided_home_exited_at` postavljen → `standard`
- `expenseCount >= GUIDED_EXPENSE_THRESHOLD (3)` → `standard` (hook poziva RPC `mark_guided_home_exited()` jednom, idempotentno)
- `expenseCount === 0` → `zero_data`
- inače → `guided`

`GUIDED_EXPENSE_THRESHOLD` je klijentska konstanta (3). Promjena ne traži migraciju.

## Postojeći korisnici

Migracija je backfill-ala `guided_home_exited_at = now()` za sve s `onboarding_completed = true`, tako da legacy useri ne ulaze retroaktivno u guided.

## Dismiss

`useGuidedMode().exit('manual_dismiss')` poziva RPC. Idempotentno. Postavlja `guided_home_exited_at` samo ako je `NULL`.

## Files

- `src/lib/guidedMode.ts` — pure logic, threshold, helperi
- `src/hooks/useGuidedMode.ts` — server fetch, cache, exit, telemetrija
- `src/components/home/ZeroDataQuietState.tsx`
- `src/components/home/GuidedHomeView.tsx`
- `src/components/home/PersonalModeView.tsx` — gate
- DB: `profiles.guided_home_exited_at`, RPC `public.mark_guided_home_exited()`

## Funnel events

- `guided_home_entered` (substate: `zero_data` | `guided`)
- `guided_home_exited` (reason: `threshold_reached` | `manual_dismiss`)
