---
name: Usage Profile Onboarding
description: Korisnik pri onboardingu bira "samo financije" ili "financije + projekti"; finance_only sakriva Projekti tab iz BottomNav-a i ActiveProjectsStrip s Home view-a
type: feature
---

## Pregled

Drugi korak onboardinga (`step === 2`) pita korisnika **što želi pratiti**:
- `finance_only` — samo osobne financije (Projekti tab je SAKRIVEN)
- `finance_projects` — financije + projekti (puna aplikacija)

Ako odabere `finance_projects`, ispod se prikaže usporedba planova **Free / Pro / Business** (samo soft prikaz; "Aktiviraj odabrani plan" otvara `/paywall` u novoj kartici da se onboarding ne prekine).

## Pohrana

- localStorage ključ: `usage_profile` (`'finance_only' | 'finance_projects'`)
- Context: `useAppState().usageProfile` + `setUsageProfile()` u `src/contexts/AppStateContext.tsx`
- TypeScript tip: `UsageProfile = 'finance_only' | 'finance_projects' | null`

## Postojeći korisnici (legacy)

- `usageProfile === null` znači **legacy** — korisnik je završio onboarding prije ove značajke
- Tretiraju se kao "show everything" (Projekti tab vidljiv, kao prije)
- NIKAD ne postavljati profil retroaktivno za njih
- U Settings sekciji (`UsageProfileSection`) `null` se prikazuje kao da je odabrao `finance_projects` (jer to mirrors legacy ponašanje)

## Filter mjesta (gdje se sakriva sadržaj za `finance_only`)

1. **`src/components/BottomNav.tsx`** — filter za `item.path === '/projects'`:
   `usageProfile !== 'finance_only'`
2. **`src/components/home/PersonalModeView.tsx`** — `<ActiveProjectsStrip>` skriven kad `projectsHidden`

> Note: Projekti **nisu obrisani** — tab je samo skriven iz nav. Korisnik može vratiti modul preko Postavki.

## Promjena u Postavkama

`src/components/settings/UsageProfileSection.tsx` — dva clickable carda. Pri prelasku na `finance_only` traži potvrdu (AlertDialog) jer se UI mijenja.

## Funnel tracking

`onboarding_complete` event (`src/lib/funnelTracking.ts`) sada ima dodatne polja u `metadata`:
- `usage_profile`: `'finance_only' | 'finance_projects'`
- `plan_choice`: `'free' | 'pro' | 'business'`

## i18n ključevi

- `onboarding.usageProfile.*` (title, subtitle, required, financeOnly.*, financeProjects.*, plan.*)
- `settings.usageProfile.*` (title, subtitle, financeOnly, financeOnlyDesc, financeProjects, financeProjectsDesc, enabled, disabled, confirmTitle, confirmDesc, confirmHide)
