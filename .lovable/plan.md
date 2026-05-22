
# Novi onboarding za V&M Balance — finalni plan

## Cilj

Zamijeniti postojeći `src/pages/Onboarding.tsx` (4 koraka, suhoparan) novim, kraćim i interaktivnijim onboardingom (5 koraka, jedan ekran = jedno pitanje).

---

## Tijek — 5 koraka

### Korak 1 — Pozdrav i ime

**Tekst (finalno usuglašen):**
> **Bok!**
> Pomoći ću ti otkriti gdje ti odlazi novac i predlagati kako njime efikasnije upravljati.
> *Kako da te zovem?*

- Jedno polje za ime, autofokus.
- Naslov se uživo mijenja u "Drago mi je, Marko!" čim korisnik počne tipkati.
- Gumb "Dalje" otključan tek kad ime ima ≥ 1 slovo.

---

### Korak 2 — Za što ćeš koristiti aplikaciju?

(Vraćamo pitanje koje trenutno postoji u kodu — `OnboardingUsageProfileStep.tsx` — ali se ne koristi.)

Dvije velike kartice:
- 💰 **Samo moje financije** — *"Pratim plaću, troškove i štednju."*
- 🧰 **Financije + projekti** — *"Imam obrt, renoviram stan, vodim klijente..."*

- Tap = odabir + odmah idemo dalje (bez dodatnog "Dalje" klika).
- Odabir se sprema u `usage_profile` (postojeća logika).
- **Plan compare panel** (Free/Pro/Business) iz postojećeg `OnboardingUsageProfileStep` se NE prikazuje ovdje — premjestit ćemo ga kasnije (po želji), ili sasvim izbaciti iz onboardinga da ne uspori tijek. Predlažem **izbaciti** — paywall i dalje postoji na `/paywall`.

---

### Korak 3 — Mjesečni prihod

**Tekst (s tvojim dodatkom):**
> *"Krenimo od onog dobrog — koliko otprilike zaradiš mjesečno?
> Ne mora biti točno — sve iznose možeš kasnije promijeniti."*

- Jedno veliko polje s € znakom.
- 4 brze tipke ispod: **700 €**, **1.000 €**, **1.500 €**, **2.500 €**.
- Mala animacija kovanice koja "padne" u virtualni novčanik kad se upiše iznos.
- Gumb "Preskoči" dolje sitno (ako preskoči, korak 4 prebacuje se u ručni unos).

---

### Korak 4 — Glavni troškovi (klizači s % od prihoda)

**Naslov:** *"Pomakni klizače na grube postotke. Lako je."*

- 5 vodoravnih klizača: 🏠 Stanovanje, 🛒 Hrana, 🚗 Auto/prijevoz, 💡 Režije, 📦 Ostalo.
- Svaki klizač pokazuje **% lijevo** i **eurski iznos desno** (računa se iz prihoda iz koraka 3).
- Ispod klizača **pita-grafikon** (recharts, već u projektu) koji se animira uživo.
- Ispod grafikona: *"Ostaje ti za štednju: 230 €"* — boja crvena ako je negativno, zelena ako pozitivno.
- Haptic vibracija kad korisnik prijeđe 100% prihoda.
- **Fallback bez prihoda** (ako je korak 3 preskočen): isti dizajn klizača, ali umjesto € pokazuje samo postotke. Iznosi se spremaju kao postotak, korisnik kasnije ručno upiše vrijednosti.

---

### Korak 5 — Sve je spremno

- Konfeta animacija (postojeća `WelcomeConfetti` komponenta).
- Naslov: *"Marko, tvoja aplikacija je spremna!"*
- 3 kartice s odgodom 0.2s:
  - ✅ *"Mjesečni budžet napravljen"*
  - ✅ *"5 kategorija troškova dodano"*
  - ✅ *"Prihod postavljen"*
- Veliki gumb: **"Uđi u aplikaciju"** → navigacija na `/home`.

---

## Što se NE mijenja

- Spremanje u bazu (`profiles`, `budget_plans`, `budget_categories`) — postojeća logika ostaje.
- Funnel event `onboarding_complete` — ostaje.
- `WelcomeChecklist` na home ekranu nakon onboardinga — ostaje (stavka "Postavi budžet" će već biti označena ✅).
- Bez novih paketa, bez DB migracija, bez native promjena (znači **bez** version bump-a).
- Bez zvuka — samo postojeći haptic.

---

## Tehnički sažetak

**Datoteke:**
- `src/pages/Onboarding.tsx` — prepisuje se (manji wrapper, ~80 linija, samo orchestrator koraka).
- `src/components/onboarding/steps/StepGreeting.tsx` — novi
- `src/components/onboarding/steps/StepUsageProfile.tsx` — novi (jednostavnija verzija postojećeg `OnboardingUsageProfileStep`, bez plan-compare panela)
- `src/components/onboarding/steps/StepIncome.tsx` — novi
- `src/components/onboarding/steps/StepBudgetSliders.tsx` — novi (glavni "wow" korak)
- `src/components/onboarding/steps/StepReady.tsx` — novi
- `src/components/onboarding/OnboardingUsageProfileStep.tsx` — može se obrisati nakon migracije (trenutno nije aktivan)

**i18n ključevi:** novi namespace `onboardingV3.*` u `src/i18n/locales/{hr,en,de}.json`. Stari `onboardingV2.*` ostaje dok ne potvrdimo da V3 radi, pa ga čistimo u zasebnom prolazu.

**Konvencije:**
- Touch target ≥ 44px, mobile-first 384px.
- Teal HSL 172 66% 40% (semantički tokeni iz `index.css`).
- `framer-motion` za prijelaze, `recharts` za pita-grafikon, `@capacitor/haptics` za vibracije — sve već u projektu.
- Lazy load zadržan u `App.tsx`.
- A11y: svi klikabilni divovi kroz `clickableProps()` helper.

**Validacija:** `npm test` mora proći (postojeći testovi). Bez novih testova jer su sve komponente UI (slijedi pravilo "ne testiraj shadcn render").
