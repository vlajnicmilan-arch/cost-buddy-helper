---
name: Onboarding Strategy
description: 2-step minimalni onboarding (greeting + ready), bez usage_profile/income/budget — moduli i budžet izvan ranog flowa; Step 2 ne slavi setup koji se nije dogodio; jedan confetti samo kroz WelcomeConfetti
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

## Copy lock (Step 1 — Greeting)

Sadrži točno:
- Pozdrav (`title` / `titleNamed`)
- Kratki intro o tome što app radi (`intro`)
- **Brevity hint** (`brevityHint`) — eksplicitan signal da je flow kratak; obavezan
- Pitanje za ime (`askName`) + input

Ne dodavati dodatne odluke, izbornike, kartice ili korake bez ažuriranja ove memorije.

## Copy lock (Step 2 — Ready)

Korak je **most prema guided home**, ne trijumf završetka setupa. Pravila:

- Naslov mora reći "spremni smo" / "we're ready" — **NE** "tvoja aplikacija je spremna", **NE** "sve je postavljeno"
- Podnaslov mora signalizirati da se ostalo namješta usput i pozvati na prvi trošak
- **Bez checklist itema** (`budget`, `cats`, `income` ključevi su deprecated u JSON-u; ne renderiraju se)
- **Bez confettija u Step 2** — `react-confetti` se ne smije importati u `StepReady`
- Ikona: `Rocket` (ili nešto mirno smjer-orijentirano), ne `PartyPopper`

**Razlog:** onboarding ne setupa ništa osim imena. Bilo kakvo slavlje "setupa" je laž koja podriva povjerenje u prvih 5 sekundi.

## Celebration layer

Tri ekrana u nizu Auth → Onboarding → Home. **Samo jedan smije pucati confetti:**

- `WelcomeConfetti` (Auth, post-signup) — **jedini onboarding-faza confetti**
- `StepReady` (Onboarding) — **bez confettija**
- Guided home payoff (post-first-expense) — drugi, **nezavisan** event, dolazi nakon stvarne akcije

Pravilo: "Aplikacija ne slavi ništa što korisnik nije aktivno učinio."

## Mjesta promjene

- `src/pages/Onboarding.tsx` — `TOTAL_STEPS=2`, `STEP_NAMES = {1:'greeting', 2:'ready'}`, uklonjeni step-ovi `StepUsageProfile`/`StepIncome`/`StepBudgetSliders` (fajlovi obrisani)
- `src/components/onboarding/steps/StepGreeting.tsx` — sadrži `brevityHint`
- `src/components/onboarding/steps/StepReady.tsx` — bez confettija, bez checklista, samo displayName prop
- AppStateContext zadržava `usageProfile` za legacy compat (čita se za `projectsModuleEnabled` backfill u resolveOnboarding)
- `src/test/onboardingCopy.test.ts` — regresijski test koji hvata vraćanje confettija / checklista u Step 2
