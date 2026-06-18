---
name: Onboarding Strategy
description: 2-step minimalni onboarding (greeting + ready), bez usage_profile/income/budget — moduli i budžet izvan ranog flowa
type: feature
---

# Onboarding Strategy

Onboarding skraćen na **2 koraka**: `greeting` + `ready`.

## Što je svjesno izvan onboardinga

- `usage_profile` (modul odluka) — moduli se aktiviraju kroz Settings ili app trigger-e, ne u onboardingu. Lokalni state ostaje radi legacy gate-ova (`projectsModuleEnabled` fallback), ali se u onboardingu šalje hardkodirani `'finance_only'`.
- `income` — premješteno u post-first-expense fazu (eventualno u WelcomeChecklist, kad / ako se vrati)
- `budget_sliders` — izvan ranog toka u potpunosti

## Default vrijednosti

Klijent zove `complete_onboarding` RPC s:
- `p_usage_profile: 'finance_only'`
- `p_income: null`
- `p_categories: []`

RPC signature je **nepromijenjena** (Opcija A) — bez migracije, postojeća telemetrija/analitika neporemećena.

## Skip path

`handleSkip` u `Onboarding.tsx`:
- `onboarding_completed = true`
- `usage_profile = 'finance_only'`
- NE postavlja `show_welcome_animation` (confetti samo na complete path)
- navigira na `/home` → tamo guided gate odlučuje `zero_data` ili `guided`

## Confetti

`WelcomeConfetti` se pokreće samo nakon `handleComplete` (preko `show_welcome_animation` localStorage flaga). Kratko traje, ne sudara se s `ZeroDataQuietState` jer su to dva uzastopna ekrana (confetti = overlay, zero_data = pozadinski layout).

## Mjesta promjene

- `src/pages/Onboarding.tsx` — `TOTAL_STEPS=2`, `STEP_NAMES = {1:'greeting', 2:'ready'}`, uklonjeni step-ovi `StepUsageProfile`/`StepIncome`/`StepBudgetSliders`
- AppStateContext zadržava `usageProfile` za legacy compat (čita se za `projectsModuleEnabled` backfill u resolveOnboarding)
