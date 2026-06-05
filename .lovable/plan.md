# Onboarding dokumentacija – finalni plan

Samo dokumentacija. Bez izmjena koda, migracija ili implementacije.

## 1. `docs/ONBOARDING.md` (novi fajl)

### Struktura

**1. Temeljna filozofija onboardinga**
- Onboarding nije edukacija svih funkcionalnosti
- Onboarding služi postizanju prve vrijednosti što je brže moguće
- Time-to-first-value važniji je od potpunosti profila
- Korisnik ne mora razumjeti cijelu aplikaciju da bi je počeo koristiti
- Svaki novi onboarding korak mora opravdati svoje postojanje (smanjenje churna, povećanje aktivacije, mjerljiva korist)
- Default-i > pitanja; pitanja > prazna polja
- Onboarding mora biti reverzibilan (sve postavke promjenjive kasnije)

**2. Trenutno stanje (verificirano iz koda — `src/pages/Onboarding.tsx`)**
- 5 koraka, `TOTAL_STEPS = 5`:
  1. `StepGreeting` — display name (jedino obavezno polje za nastavak)
  2. `StepUsageProfile` — `finance_only | finance_projects`, auto-advance 220 ms
  3. `StepIncome` — mjesečni prihod (opcionalno)
  4. `StepBudgetSliders` — postoci po kategorijama (rent/food/car/utilities/other), opcionalno
  5. `StepReady` — sažetak + "Uđi u aplikaciju"
- "Završi kasnije" gumb prisutan na koracima 1–4, postavlja `usage_profile = 'finance_only'` ako nije odabran
- Progress: step dots + tanka traka 0.5px
- Header: logo + V&M Balance text
- Footer: Natrag + Dalje/Završi, 44px min-height
- Persistencija na završetku: `profiles.upsert` + opcionalno `budget_plans` + `budget_categories` (samo ako prihod > 0 i ≥1 kategorija)
- localStorage: `onboarding_completed`, `show_welcome_animation`, `usage_profile`, `user_display_name`
- Telemetrija: jedan `funnel_events` event `onboarding_complete` na samom kraju (s `usage_profile`, `has_income`, `expense_categories`)
- i18n: namespace `onboardingV3.*` + `common.back/next`; ima fallback stringove u `t(key, 'fallback')` pozivima
- Haptics: `lightTap` na navigaciji, `successVibration` na završetku
- Komponente: `src/components/onboarding/steps/` (5 step komponenti) + `OnboardingPaymentSourceCard`, `CardScannerDialog`, `OnboardingUsageProfileStep` (ovaj zadnji nije u live flowu — postoji u kodu)

**3. Ocjena: 6.5/10** — kratko obrazloženje (solidna baza, ali nedostaje TTFV, telemetrija po koraku, neke A11y/i18n higijene)

**4. Što radi dobro**
- i18n pokrivenost (HR/EN/DE) preko `t()`
- Usage profile gating (skrije Projekti tab ako `finance_only`)
- Reverzibilnost (sve postavke kasnije promjenjive)
- Mobile-first, 44px touch targets
- "Završi kasnije" izlaz na svakom koraku osim posljednjem
- Funnel event na završetku (postoji `onboarding_complete`)
- Haptics integracija

**5. Identificirani problemi**
- Hardcoded color string `'hsl(172 66% 40%)'` u `budget_plans.color` (umjesto semantic token reference)
- Fallback stringovi u `t(key, 'fallback')` rasuti po fajlu (i18n higijena)
- Nema per-step telemetrije (samo finalni event) → ne znamo gdje korisnici padaju
- Nema atomic DB inserta (profile + budget + categories u 3 odvojena poziva, parcijalni fail moguć)
- Nema sample data / demo state → prazan dashboard nakon onboardinga
- Nema bank import / CSV uvoz koraka
- Nema currency / region step (default valuta nije postavljena u onboardingu)
- Nema language Step 0 (jezik se nasljeđuje iz browsera, nema eksplicitnog izbora)
- Nema "preview" rezultata prije završetka (Step 5 je tekstualni sažetak, ne vizual)
- Nema post-completion guided empty state (WelcomeChecklist postoji ali nije povezan s onboarding flowom)
- A11y: step dots nemaju `aria-label` / `role`, progress traka nije `role="progressbar"`
- Nema A/B testing infrastrukture za onboarding varijante
- `OnboardingUsageProfileStep.tsx` postoji ali nije korišten u live flowu (dead code risk)
- `setTimeout(220ms)` auto-advance u Step 2 — magic number bez konstante
- `parseFloat(income) || 0` — bez validacije unosa / locale-aware parsiranja

**6. Definition of 10/10 (aspiracijski ciljevi, validacija nakon prikupljanja stvarnih podataka)**
- TTFV < 60 s (cilj, mjerenje predstoji)
- Onboarding completion rate ≥ 80% (cilj)
- Day-1 retention ≥ 40% (cilj)
- Day-7 retention ≥ 25% (cilj)
- 0 hardcoded UI stringova / boja
- Per-step funnel telemetry (`funnel_events` po koraku)
- A11y AA na cijelom flowu
- Atomic DB write (transakcija ili idempotentna RPC)
- Fully reversible (već zadovoljeno)
- Smjer "Sample Data vs Guided Empty State" validiran kroz product reviziju
- A/B test infrastruktura aktivna

> Napomena: brojčani targeti su aspiracijski. Konkretni pragovi se zaključavaju tek nakon što imamo stvarne baseline podatke iz `funnel_events` (~30 dana produkcije).

**7. Prijedlozi poboljšanja (ROADMAP)**

- **#1 Sample Data vs Guided Empty State** — dvije konkurentne hipoteze:
  > a) Sample data injection (predpopulirane demo transakcije za instant "aha")
  > b) Guided empty state bez umjetnih podataka (CTA + tooltip flow)
  > Smjer se NE zaključava dok ne prođe product reviziju.

- #2 Per-step funnel telemetry (`onboarding_step_view` / `onboarding_step_complete`)
- #3 Atomic DB write (RPC `complete_onboarding`)
- #4 i18n cleanup — ukloniti `t(key, 'fallback')` pattern, vrednovati postojanje ključeva
- #5 Language Step 0 (eksplicitan izbor HR/EN/DE)
- #6 Currency / region step
- #7 Bank import / CSV uvoz step (opcionalno, Step 4.5)
- #8 A11y polish — `aria-label` na step dots, `role="progressbar"`, focus management
- #9 Post-completion guided empty state (poveži s `WelcomeChecklist`)
- #10 Preview rezultata u Step 5 (vizualni mock dashboarda umjesto teksta)
- #11 A/B testing infrastruktura za varijante onboardinga
- #12 Semantic color tokens umjesto hardcoded HSL
- #13 Locale-aware income parser (decimal separator HR vs EN)
- #14 Ukloniti / dokumentirati `OnboardingUsageProfileStep.tsx` (dead code)
- #15 Konstanta za auto-advance delay (umjesto magic 220 ms)
- #16 Reduced-motion respect na AnimatePresence tranzicijama

Svi prijedlozi ostaju **ROADMAP**, bez LOCK NOW.

**8. Ne-ciljevi**
- Uklanjanje StepBudgetSliders (ostaje u trenutnom flowu dok ne odluči revizija)
- Novi state manager (Redux/Zustand)
- Višestrani wizard preko 7+ koraka
- Route guard koji blokira app dok onboarding nije gotov (trenutni "Završi kasnije" se zadržava)
- Fiskalizacija / eRačun integracije u onboardingu

## 2. `mem://features/onboarding-strategy` (novi memory fajl)

Frontmatter `type: feature`, sažetak:
- 5 koraka (Greeting/UsageProfile/Income/BudgetSliders/Ready)
- Ocjena 6.5/10
- Filozofija: TTFV first, default > pitanje, reverzibilnost
- 16 ROADMAP prijedloga; Sample Data vs Guided Empty State nezaključano
- 10/10 ciljevi su aspiracijski dok ne prikupimo baseline
- Ne-ciljevi
- Link na `docs/ONBOARDING.md`
- Reference: `usage-profile-onboarding`, `project-activation-funnel-and-nudges`, `acquisition-funnel-events`

## 3. `mem://index.md`

Dodati pod `## Memories` (zadržati sve postojeće retke):
`- [Onboarding Strategy](mem://features/onboarding-strategy) — 5 koraka (Greeting/UsageProfile/Income/BudgetSliders/Ready), 6.5/10, TTFV-first filozofija, 16 ROADMAP, Sample Data vs Guided Empty State nezaključano; 10/10 ciljevi aspiracijski`

## Out of scope
Bez izmjena koda, komponenti, DB migracija ni implementacije prijedloga. Sljedeći korak: zasebna product revizija.