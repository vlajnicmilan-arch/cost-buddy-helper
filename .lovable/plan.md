# Minimalistički redizajn kartica u ActiveProjectsStrip

Mijenja se **samo** `src/components/home/ActiveProjectsStrip.tsx` + dodaju se i18n ključevi.

## Nova struktura kartice

```
┌──────────────────────────────┐
│ 📁  Naziv projekta        🟢 │
│                              │
│            42%               │
│       STVARNA MARŽA          │
│                              │
│ Naplaćeno         12.000 €   │
│ Potrošeno          7.000 €   │
│ Profit            +5.000 €   │
└──────────────────────────────┘
```

### Header (jedan red)
- Ikona projekta (`project.icon || '📁'`)
- Naziv (`truncate`, `font-semibold text-sm`)
- Mali kružić semafora desno (~10 px, jedna boja po health-u, blagi glow)

### Centerpiece
- Postotak marže — `text-3xl font-bold tabular-nums`, boja po health-u (`text-income` / `text-warning` / `text-destructive`)
- Label ispod — `text-[10px] uppercase tracking-wider text-muted-foreground`

### Footer (3 linije)
Svaka: label lijevo (muted), iznos desno (tabular-nums). Iznosi formatirani preko `formatAmount`.

## Logika

```ts
const income = entry?.income ?? 0;
const spent  = entry?.spent  ?? 0;
const budget = project.total_budget || 0;

if (income > 0) {
  // SLUČAJ A — naplaćen
  margin = (income - spent) / income;
  label  = t('projects.card.realMargin');           // "STVARNA MARŽA"
  lines  = [
    { label: t('projects.card.collected'),  value: income          },  // "Naplaćeno"
    { label: t('projects.card.spent'),      value: spent           },
    { label: t('projects.card.profit'),     value: income - spent, signed: true },
  ];
} else if (budget > 0) {
  // SLUČAJ B — još nije naplaćen
  margin = (budget - spent) / budget;
  label  = t('projects.card.expectedMargin');       // "PREDVIĐENA MARŽA"
  lines  = [
    { label: t('projects.card.contracted'), value: budget          },  // "Ugovoreno"
    { label: t('projects.card.spent'),      value: spent           },
    { label: t('projects.card.remaining'),  value: budget - spent, signed: true },
  ];
} else {
  // SLUČAJ C — fallback CTA
  margin = null;
}
```

### Semafor
- `margin >= 0.30` → zeleno (`hsl(var(--income))`)
- `0.10 <= margin < 0.30` → žuto (`hsl(var(--warning))`)
- `margin < 0.10` → crveno (`hsl(var(--destructive))`)
- Nema marže (slučaj C) → neutralno sivo

### Signed line (Profit / Preostalo)
- `value >= 0` → `text-income`, prefix `+`
- `value < 0`  → `text-destructive`, prefix `−` (apsolutna vrijednost u `formatAmount`)

### Slučaj C — CTA umjesto centerpiece-a
- Tekst gumba: `t('projects.card.setBudget')` — "Postavi budžet projekta"
- Klik na karticu i dalje vodi na detalj projekta (`openProjectId`); CTA je vizualni hint, ne zaseban handler.
- Footer linije se sakriju.

## Klikabilnost
Cijela `motion.button` ostaje klikabilna → `handleNav('/projects', { openProjectId: project.id, from: '/home' })` (postojeće ponašanje).

`aria-label`:
- Slučaj A: `"{name}: stvarna marža {pct}%, {trafficLabel}"`
- Slučaj B: `"{name}: predviđena marža {pct}%, {trafficLabel}"`
- Slučaj C: `"{name}: postavi budžet projekta"`

## Što se uklanja iz komponente
- `BigTrafficLight` (multi-dot pill) → zamijenjen malim kružićem inline u headeru
- `renderProfitBlock` (KPI varijante profit/loss/remaining/overBudget/items)
- `renderAiWarning` (žuti/crveni footer poruka)
- `renderStatusLine` + import `getProjectStatusLine`, `STATUS_ICON_MAP`
- Expected-profit / awaiting-payment downgrade-panic logika (contract_value override)
- Polja u `ProjectCardData`: `kpiKind`, `kpiValue`, `statusLine`, `expectedProfit`, `expectedMargin`, `profit`, `remaining`
- Importi koji više nisu potrebni: `AlertTriangle, AlertOctagon, Sparkles, Clock, Pause, Info, AlertCircle`, `getProjectStatusLine`

`src/lib/projectStatusLine.ts` ostaje u repo-u (nedirano) ali se ne importa ovdje.

## Dimenzije
- Širina kartice ostaje `min-w-[200px] max-w-[220px]`
- Visina raste s `min-h-[170px]` na ~`min-h-[210px]` zbog 3-line footer-a
- Loading skeleton se prilagodi istoj visini

## i18n — novi ključevi (HR / EN / DE) pod `projects.card.*`
- `realMargin` — "STVARNA MARŽA" / "ACTUAL MARGIN" / "TATSÄCHLICHE MARGE"
- `expectedMargin` — "PREDVIĐENA MARŽA" / "EXPECTED MARGIN" / "ERWARTETE MARGE"
- `collected` — "Naplaćeno" / "Collected" / "Eingenommen"
- `contracted` — "Ugovoreno" / "Contracted" / "Vereinbart"
- `spent` — "Potrošeno" / "Spent" / "Ausgegeben"
- `profit` — "Profit" / "Profit" / "Gewinn"
- `remaining` — "Preostalo" / "Remaining" / "Verbleibend"
- `setBudget` — "Postavi budžet projekta" / "Set project budget" / "Projektbudget festlegen"
- `ariaRealMargin`, `ariaExpectedMargin` — za screen-reader labele

Postojeći `projects.health.trafficLight.{green|yellow|red}` se reuse-a za aria-label kružića.

## Što NE diramo
- `ProjectCard.tsx` (koristi se na /projects stranici, ima drugačiju namjenu)
- `useActiveProjectsSummary`, `projectHealthScore.ts`, `projectStatusLine.ts`
- Empty state ("Kreiraj prvi projekt") i "Add new project" CTA kartica na kraju strip-a
- Header strip-a ("Aktivni projekti" + "Pogledaj sve")
- Margin pragovi (30% / 10%)
- Logika koji projekti se prikazuju (active/draft, top 5)
