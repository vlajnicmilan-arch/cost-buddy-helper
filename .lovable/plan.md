# Vizualna oznaka triala za projekte

Mali chip koji jasno govori da je pristup projektima privremen (tijekom 14-dnevnog probnog perioda) i koliko dana je ostalo. Bez promjene logike pristupa.

## Što se mijenja

1. **Nova komponenta** `src/components/TrialFeatureChip.tsx` (~70 linija)
   - Props: `feature: Feature`, `className?`
   - Prikazuje se samo kad: `storageMode === 'cloud'` && `trialActive` && `!subscribed` && `getRequiredTier(feature) !== 'free'`
   - Sadržaj: ikona Sparkles + `Probni period · 12 dana` (ili `1 dan` / `zadnji dan`)
   - Boja: teal (primary) kad >2 dana, destructive tint kad ≤2 (konzistentno s `TrialBanner`)
   - Klik → `/paywall`
   - `<button>` element (a11y native, focus-visible ring), `aria-label` + `title`

2. **`src/components/home/ActiveProjectsStrip.tsx`**
   - Pored `<h2>Aktivni projekti</h2>` u headeru dodaje se `<TrialFeatureChip feature="projects" />`
   - Layout: `flex items-center gap-2` (chip do naslova, gumb "Pogledaj sve" ostaje desno)

3. **`src/pages/Projects.tsx`**
   - Ispod `<PageHeader>`, iznad `<ProjectsPanel>` / `<UpgradePrompt>` dodaje se `<TrialFeatureChip feature="projects" className="mb-3" />`
   - Korisnik koji uđe u Projekte odmah vidi da je značajka u trialu

## i18n ključevi (HR / EN / DE)

Novi blok `trial.featureChip` u sva 3 locale fajla:
- `label` → `Probni period` / `Trial` / `Probezeit`
- `daysLeft` → `{{count}} dana` / `{{count}} days` / `{{count}} Tage`
- `oneDay` → `1 dan` / `1 day` / `1 Tag`
- `lastDay` → `zadnji dan` / `last day` / `letzter Tag`
- `aria` → puna rečenica za screen reader

## Tehnički detalji

- Bez DB izmjena, bez novih hookova, bez migracija
- Bez promjena u `useFeatureAccess`, `SubscriptionContext`, `Projects.tsx` access logici
- Postojeći `TrialBanner` na Dashboardu ostaje netaknut (puni banner s gumbom)
- Reuse: `useSubscription`, `useFeatureAccess`, `useStorage`, `cn`
- Komponenta je generička — može se kasnije ubaciti i pored Reports/Family/Recurring naslova bez ikakve promjene
