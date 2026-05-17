# Refaktor "Pregled budžeta" — Posao tab (ProjectFullScreenView)

## 1. Metrike (4 kartice umjesto 3)

U `ProjectFullScreenView.tsx` (linije ~383–412) zamijeniti postojeću 3-kartice grid s 4-kartice grid (`grid-cols-2 sm:grid-cols-4`):

- **Ugovoreno** — `project.total_budget`
- **Primljeno** — `income` + ispod brojke mali tekst `"X% od ugovorenog"` (income/total_budget)
- **Potrošeno** — `spent`
- **Marža** — postotak kao glavni element + status pill ispod (🟢 Zdrav / 🟡 Pažnja / 🔴 Kritično)

**Marža formula** (identična ActiveProjectsStrip-u): `(total_budget - spent) / total_budget × 100`
Pragovi: ≥30% zelena, 10–30% žuta, <10% crvena.

**Izvor brojki** — koristiti `calculateProjectIncome(expenses, funding)` i `calculateProjectSpent(expenses)` iz `src/lib/projectCalculations.ts` (jedinstveni helperi koje koristi i ostatak app-a). Tako garantiramo konzistentnost s home karticom.

## 2. Progress barovi (2 umjesto 1)

Ispod metrika dva odvojena `Progress`:

- **Trošak**: `spent / total_budget %` — boja prati status marže (zelena/žuta/crvena)
- **Naplata**: `income / total_budget %` — uvijek `bg-primary` (tirkizna)

Svaki bar ima label red iznad: `naziv · X% · (iznos / total_budget)`.

## 3. Alarmi (2 nezavisna)

Ukloniti postojeći `budgetWarning` (linija 200: `budgetUsedPercentage = spent/totalAllocated`) i Badge u headeru (linije 375–380). Zamijeniti s dva neovisna `Alert`-a ispod barova:

- **Alarm A** (`spent/total_budget ≥ 80%`): ⚠️ `t('projects.alerts.budgetHigh', 'Potrošio si {{pct}}% ugovorenog budžeta')`
- **Alarm B** (`income/total_budget < 50%` **I** `daysSince(start_date) > 30`): 💰 `t('projects.alerts.collectionLow', 'Naplaćeno samo {{pct}}%. Razmisli o podsjetniku klijentu.')`

Oba se izračunavaju samo ako `total_budget > 0`.

## 4. Nova komponenta `ProjectForecastCard`

Nova datoteka `src/components/projects/ProjectForecastCard.tsx`. Props:
```ts
{ totalBudget: number; spent: number; milestones: ProjectMilestone[] }
```

Logika:
- `completionPct = completedMilestones / totalMilestones × 100`
- `eac = spent / (completionPct/100)`
- `forecastMargin€ = totalBudget - eac`
- `forecastMargin% = (totalBudget - eac) / totalBudget × 100`

Prikaz (kartica s naslovom 🔮 `t('projects.forecast.title', 'Prognoza — po trenutnom tempu')`):
- Ako `milestones.length === 0` → `t('projects.forecast.noMilestones', 'Dodaj faze projekta da vidiš prognozu')`
- Ako `completionPct < 10` → `t('projects.forecast.tooEarly', 'Prognoza dostupna nakon 10% dovršenosti projekta')`
- Inače dvije linije: `Predviđeni finalni trošak: X €` i `Predviđena marža: Y% (Z €)` sa status pill-om (isti pragovi 30/10).

Komponenta strukturirana s `Metric` helperom i jasnim mjestom za buduće CPI/SPI/EAC analizu (komentar `// future: CPI/SPI/EAC variance`). Mountati u `ProjectFullScreenView` odmah ispod sekcije Pregled budžeta.

## 5. Preimenovanja / čišćenje

- Ukloniti karticu/koncept "preostalo (totalAllocated - totalSpent)" iz Pregleda budžeta — više nije dio glavnih 4 metrike.
- Dodati novi i18n key `projects.currentBalance` ("Trenutni saldo") i koristiti ga gdje god postojeći "preostalo" treba značiti `income − spent` (zadržati samo ako je već prikazan negdje drugdje; u ovoj sekciji ga ne treba).
- Ostavljen `t('projects.remaining')` se NE briše globalno (može biti korišten drugdje), samo se uklanja njegovo korištenje ovdje.

## 6. i18n ključevi (hr/en/de)

Dodati pod `projects.*`:
- `contracted`, `received`, `receivedOfContract` ("{{pct}}% od ugovorenog"), `margin`, `marginStatus.healthy|attention|critical`
- `progress.cost`, `progress.collection`
- `alerts.budgetHigh`, `alerts.collectionLow`
- `currentBalance`
- `forecast.title`, `forecast.eac`, `forecast.predictedMargin`, `forecast.tooEarly`, `forecast.noMilestones`

## 7. Konzistentnost s home karticom

`ActiveProjectsStrip` već koristi `(total_budget - spent) / total_budget`. Ovaj refaktor koristi identičnu formulu i iste pragove (30/10) → marža na home kartici i detalju projekta uvijek jednake.

## Tehnički detalji

- Helper funkcija `marginStatus(pct) → 'healthy' | 'attention' | 'critical' | 'neutral'` lokalno u `ProjectFullScreenView` (ili u `src/lib/projectHealthScore.ts` ako se već koristi slično — provjeriti i reuseati ako jest).
- Tailwind klase preko semantic tokena: `text-income`, `text-warning`, `text-destructive`, `bg-primary`, `bg-muted/50`. Bez hardcode boja.
- Mobile-first: 384px breakpoint → na malim ekranima `grid-cols-2`, na sm+ `grid-cols-4`.
- Sve novo prek `t()`, bez hardcoded UI texta.

## Što se NE dira

- `useProjectStats`, `useProjectMilestones`, RLS, druge tabove (Ljudi, Novac).
- `ActiveProjectsStrip` ostaje kakav je — samo verifikujemo da formula match-a.
- `ProjectEarnedValueCard` (postoji već, ali se ne koristi ovdje) — ne dirati.
