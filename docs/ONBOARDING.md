# Onboarding strategija

Verzija: 1.0 (5.6.2026)
Status: dokumentacija prije product revizije. Bez zaključanih implementacijskih odluka osim eksplicitno označenih ne-ciljeva.

---

## 1. Temeljna filozofija onboardinga

- Onboarding **nije edukacija svih funkcionalnosti**.
- Onboarding služi **postizanju prve vrijednosti što je brže moguće**.
- **Time-to-first-value (TTFV)** važniji je od potpunosti profila.
- Korisnik **ne mora razumjeti cijelu aplikaciju** da bi je počeo koristiti.
- Svaki novi onboarding korak mora **opravdati svoje postojanje** (smanjenje churna, povećanje aktivacije, mjerljiva korist).
- **Default-i > pitanja; pitanja > prazna polja.**
- Onboarding mora biti **reverzibilan** — svaka postavka promjenjiva kasnije u Postavkama.

---

## 2. Trenutno stanje

Verificirano iz koda (`src/pages/Onboarding.tsx`, `src/components/onboarding/steps/`).

### Tijek (5 koraka, `TOTAL_STEPS = 5`)

| # | Komponenta | Sadržaj | Obavezno? |
|---|---|---|---|
| 1 | `StepGreeting` | Display name | Da (za Dalje) |
| 2 | `StepUsageProfile` | `finance_only` ili `finance_projects`; auto-advance 220 ms | Da |
| 3 | `StepIncome` | Mjesečni prihod | Ne |
| 4 | `StepBudgetSliders` | Postoci po kategorijama (rent/food/car/utilities/other) | Ne |
| 5 | `StepReady` | Tekstualni sažetak + "Uđi u aplikaciju" | — |

### Mehanika

- **"Završi kasnije"** gumb prisutan na koracima 1–4. Postavlja `usage_profile = 'finance_only'` ako nije odabran.
- **Progress indikator**: step dots u headeru + tanka traka (0.5px) ispod headera.
- **Footer**: Natrag + Dalje/Završi, min-height 44px.
- **Header**: logo + "V&M Balance" tekst.

### Persistencija (završetak)

1. `profiles.upsert` (`display_name`, `onboarding_completed`, `updated_at`).
2. Opcionalno `budget_plans.insert` + `budget_categories.insert` — **samo ako** `income > 0` **i** ≥1 kategorija s postotkom > 0.
3. localStorage: `onboarding_completed`, `show_welcome_animation`, `usage_profile`, `user_display_name`.
4. Funnel event `onboarding_complete` s `{ usage_profile, has_income, expense_categories }`.

### Postojeća infrastruktura

- **i18n**: namespace `onboardingV3.*` + `common.back/next`. Sadrži fallback stringove u `t(key, 'fallback')` pozivima.
- **Haptics**: `lightTap` na navigaciji, `successVibration` na završetku.
- **Komponente**: `src/components/onboarding/steps/` (5 step komponenti) + `OnboardingPaymentSourceCard`, `CardScannerDialog`, `OnboardingUsageProfileStep` (zadnji **nije u live flowu** — postoji u kodu).

---

## 3. Ocjena: 6.5/10

Solidna baza s jasnim mobile-first flowom i osnovnom telemetrijom, ali nedostaje TTFV optimizacija, granularna telemetrija po koraku te nekoliko A11y i i18n higijenskih sitnica. Demo/empty-state strategija nije definirana, što ostavlja korisnika pred praznim dashboardom nakon završetka.

---

## 4. Što radi dobro

- i18n pokrivenost (HR/EN/DE) preko `t()`.
- **Usage profile gating** — `finance_only` skriva Projekti tab i ActiveProjectsStrip.
- **Reverzibilnost** — sve postavke promjenjive kasnije u Postavkama.
- Mobile-first, 44px touch targets.
- **"Završi kasnije"** izlaz na svakom koraku osim posljednjem.
- Funnel event na završetku (`onboarding_complete` u `funnel_events`).
- Haptics integracija.

---

## 5. Identificirani problemi

1. Hardcoded color string `'hsl(172 66% 40%)'` u `budget_plans.color` (umjesto semantic token reference).
2. Fallback stringovi `t(key, 'fallback')` rasuti po fajlu — i18n higijena.
3. **Nema per-step telemetrije** — samo finalni event, ne znamo gdje korisnici padaju.
4. **Nema atomic DB inserta** — profile + budget + categories u 3 odvojena poziva, parcijalni fail moguć.
5. **Nema sample data / demo state** — prazan dashboard nakon završetka.
6. Nema bank import / CSV uvoz koraka.
7. Nema currency / region step (default valuta nije postavljena u onboardingu).
8. Nema language Step 0 (jezik se nasljeđuje iz browsera).
9. Step 5 je tekstualni sažetak, nema vizualnog preview rezultata.
10. `WelcomeChecklist` postoji ali nije povezan s onboarding flowom — nema guided empty state nakon završetka.
11. A11y: step dots bez `aria-label`/`role`, progress traka nije `role="progressbar"`.
12. Nema A/B testing infrastrukture za onboarding varijante.
13. `OnboardingUsageProfileStep.tsx` postoji ali nije korišten — dead code risk.
14. `setTimeout(220ms)` auto-advance u Step 2 — magic number bez konstante.
15. `parseFloat(income) || 0` — bez validacije unosa / locale-aware parsiranja (HR decimal separator).
16. Nema reduced-motion respect na AnimatePresence tranzicijama.

---

## 6. Definition of 10/10 (aspiracijski)

**Napomena:** brojčani targeti su **aspiracijski** dok ne prikupimo stvarne baseline podatke iz `funnel_events` (~30 dana produkcije). Konkretni pragovi zaključavaju se tek nakon revizije.

- TTFV < 60 s (cilj, mjerenje predstoji)
- Onboarding completion rate ≥ 80% (cilj)
- Day-1 retention ≥ 40% (cilj)
- Day-7 retention ≥ 25% (cilj)
- 0 hardcoded UI stringova / boja u onboarding kodu
- Per-step funnel telemetry u `funnel_events`
- A11y AA na cijelom flowu
- Atomic DB write (transakcija ili idempotentna RPC)
- Fully reversible (već zadovoljeno)
- Smjer "Sample Data vs Guided Empty State" validiran kroz product reviziju
- A/B test infrastruktura aktivna

---

## 7. Prijedlozi poboljšanja (ROADMAP)

Svi prijedlozi su **ROADMAP**, bez LOCK NOW. Smjer se zaključava tek nakon zasebne product revizije.

### #1 Sample Data vs Guided Empty State

Postoje dvije konkurentne hipoteze:

- **a) Sample data injection** — predpopulirane demo transakcije za instant "aha" trenutak; korisnik odmah vidi popunjen dashboard, grafove, kategorije.
- **b) Guided empty state** — bez umjetnih podataka; CTA + tooltip flow vodi korisnika kroz prvi vlastiti unos.

Smjer se **ne zaključava** dok ne prođe product reviziju.

### Ostali prijedlozi

- **#2** Per-step funnel telemetry (`onboarding_step_view` / `onboarding_step_complete` po koraku).
- **#3** Atomic DB write (RPC `complete_onboarding` koji sve radi u jednoj transakciji).
- **#4** i18n cleanup — ukloniti `t(key, 'fallback')` pattern, vrednovati postojanje ključeva u sva 3 locale fajla.
- **#5** Language Step 0 — eksplicitan izbor HR/EN/DE prije svega ostalog.
- **#6** Currency / region step.
- **#7** Bank import / CSV uvoz step (opcionalno, Step 4.5).
- **#8** A11y polish — `aria-label` na step dots, `role="progressbar"`, focus management između koraka.
- **#9** Post-completion guided empty state — povezati `WelcomeChecklist` s onboarding flowom.
- **#10** Preview rezultata u Step 5 — vizualni mock dashboarda umjesto teksta.
- **#11** A/B testing infrastruktura za onboarding varijante.
- **#12** Semantic color tokens umjesto hardcoded HSL.
- **#13** Locale-aware income parser (decimal separator HR `,` vs EN `.`).
- **#14** Ukloniti ili dokumentirati `OnboardingUsageProfileStep.tsx` (dead code).
- **#15** Konstanta za auto-advance delay umjesto magic 220 ms.
- **#16** Reduced-motion respect na AnimatePresence tranzicijama.

---

## 8. Ne-ciljevi

Eksplicitno **izvan dosega** onboardinga:

- Uklanjanje `StepBudgetSliders` — ostaje u trenutnom flowu dok ne odluči revizija.
- Novi state manager (Redux/Zustand/MobX).
- Višestrani wizard preko 7+ koraka.
- Route guard koji blokira app dok onboarding nije gotov — trenutni "Završi kasnije" izlaz se zadržava.
- Fiskalizacija / eRačun / JOPPD integracije u onboardingu.

---

## 9. Sljedeći korak

Zasebna **product revizija** koja:

1. Odabire smjer za #1 (Sample Data vs Guided Empty State).
2. Prioritizira ROADMAP prijedloge (#2–#16).
3. Zaključava brojčane pragove iz Definition of 10/10 nakon prikupljanja baseline podataka.

Tek nakon revizije se otvara implementacijski tiket.
