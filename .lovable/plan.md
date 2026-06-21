## Cilj

Ukloniti drift između `mem://features/onboarding-strategy` (2 koraka, ništa se ne setupa u onboardingu) i stvarnog izgleda ekrana (Step 2 i dalje slavi "Sve je postavljeno" i pokazuje šuplji setup checklist). Zatvoriti temu jednom.

## Scope (uski)

1. **Step 2 copy + payoff** — preraditi da ton odgovara "tek smo te upoznali, ostalo radimo usput"
2. **Confetti konsolidacija** — ukloniti confetti iz `StepReady`, zadržati samo `WelcomeConfetti` (post-onboarding) i guided home payoff (post-first-expense)
3. **Mrtav kod** — obrisati `StepUsageProfile.tsx`, `StepIncome.tsx`, `StepBudgetSliders.tsx` (već se ne importaju)
4. **Step 1 sitni dodatak** — signal brevity ("dva pitanja, gotovi smo")
5. **Memorija** — proširiti `onboarding-strategy` doc da pokriva copy zadnjeg koraka i celebration layer pravilo

## Detalji

### Step 2 (`StepReady.tsx`)

Trenutno:
- Naslov: "Tvoja aplikacija je spremna!"
- Podnaslov: "Sve je postavljeno. Krenimo."
- Checklist `budget/cats/income` (uvijek prazan jer su koraci izbačeni)
- `PartyPopper` ikona + `react-confetti` 3.5s

Novo:
- Naslov: "{name}, spremni smo." (ili "Spremni smo." bez imena)
- Podnaslov: nešto u smjeru "Sve ostalo namještamo zajedno dok koristiš aplikaciju — kreni s prvim troškom."
- **Bez checklista** (uklanjamo `items` blok i propse `hasIncome`, `expenseCategoriesCount`)
- **Bez confettija** (uklanjamo `Confetti` lazy import + render)
- Ikona ostaje (`PartyPopper` ili nešto mirnije — `Rocket`/`ArrowRight`; predlažem `Rocket`)
- Tipke i navigacija ostaju kako jesu

### Step 1 (`StepGreeting.tsx`)

Dodati jedan mali signal kratkoće. Npr. iznad `askName` ili kao caption ispod intro paragrafa:
- "Samo jedno pitanje i krećemo."

Bez drugih promjena.

### Onboarding.tsx

- Ukloniti `hasIncome`/`expenseCategoriesCount` proslijeđivanje u `StepReady` (više se ne koristi)
- `handleComplete` ostaje isti (RPC poziv, defaulti, navigacija) — to je već po doc-u

### Mrtav kod

Obrisati:
- `src/components/onboarding/steps/StepUsageProfile.tsx`
- `src/components/onboarding/steps/StepIncome.tsx`
- `src/components/onboarding/steps/StepBudgetSliders.tsx`

Provjeriti da nigdje drugdje nisu importirani (rg pretraga prije brisanja).

### i18n

Dodati / ažurirati ključeve u `hr.json`, `en.json`, `de.json`:
- `onboardingV3.greeting.brevityHint` ("Samo jedno pitanje i krećemo.")
- `onboardingV3.ready.title` / `ready.titleNamed` — novi tekst
- `onboardingV3.ready.subtitle` — novi tekst

Stari ključevi (`ready.budget`, `ready.cats`, `ready.income`) — ostavljam u JSON-u jedno čišćenje dalje; nisu više korišteni, ali brisanje ide u zaseban sweep da ne miješam i18n cleanup s ovim passom.

### Memorija

Update `mem://features/onboarding-strategy`:
- Eksplicitno locknuti copy Step 2 (naslov + podnaslov + "bez checklista")
- Pravilo: "Onboarding ne slavi setup koji se nije dogodio."
- Pravilo: "Celebration layer — `WelcomeConfetti` je jedini confetti u toku Auth→Onboarding→Home. Guided home payoff je drugi, nezavisan. Step 2 onboardinga nema confetti."

### Test (lagani)

Dodati u `src/test/` jedan vitest koji ne ovisi o renderiranju:
- Statičan assert: `StepReady.tsx` ne importa `react-confetti`
- Statičan assert: `StepReady.tsx` ne sadrži stringove `budget`, `income`, `cats` u JSX kontekstu (ili lakše — provjera da prop interface više nema `hasIncome`/`expenseCategoriesCount`)

Cilj: tonalni drift na ovom mjestu hvata CI prije nego stigne u preview.

## Fileovi koji se diraju

- `src/components/onboarding/steps/StepGreeting.tsx`
- `src/components/onboarding/steps/StepReady.tsx`
- `src/pages/Onboarding.tsx`
- `src/i18n/locales/hr.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/de.json`
- `.lovable/memory/features/onboarding-strategy.md`
- `src/test/onboardingCopy.test.ts` (novi)
- **Brisanje:** `src/components/onboarding/steps/StepUsageProfile.tsx`, `StepIncome.tsx`, `StepBudgetSliders.tsx`

## Izvan scope-a

- `WelcomeConfetti` u `Auth.tsx` — ostaje netaknut
- Guided home payoff — ostaje netaknut
- Cleanup neiskorištenih i18n ključeva (`ready.budget/cats/income`) — zaseban sweep
- Promjena RPC signature `complete_onboarding` — ostaje (Opcija A iz doc-a)

## Verifikacija

1. Vitest prolazi (uključujući novi `onboardingCopy.test.ts`)
2. Build prolazi
3. Manual: ponovo proći kroz onboarding (već si resetiran u DB-u) → Step 2 ne smije reći "sve je postavljeno" i ne smije pucati confetti
