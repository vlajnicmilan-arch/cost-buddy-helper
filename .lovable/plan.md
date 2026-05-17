
# Earned Value & Margin-aware Health Score

Odluke korisnika: zadržati `contract_value`, auto-fill iz estimate-a samo ako prazan, alert kad marža padne ispod 10% ugovora.

## 1. Schema / data flow
- **Bez nove kolone.** `contract_value` ostaje single source of truth.
- U `useProjectEstimates.acceptEstimate`: ako je `project.contract_value` null/0, postavi ga na `estimate.total`. Inače ne dirati.

## 2. `src/lib/projectHealthScore.ts` — Margin komponenta
- Nova `calculateMarginScore(contract, spent)`:
  - margin% = (contract − spent) / contract × 100
  - ≥30 → 100, 15–30 → 80, 5–15 → 50, 0–5 → 25, <0 → 0
- Težine kad `contract > 0`: **40% Margin + 30% Budget + 20% Timeline + 10% Milestone**
- Fallback kad `contract = 0`: stara formula 40/35/25 + `marginUnknown: true`
- Pragovi level-a (80/50) ostaju. `reason` može vratiti 'margin'.
- Vraćamo nova polja: `marginPct`, `marginAmount`, `eac`, `marginUnknown`.
- **EAC** = `timeProgressPct > 5` ? `spent / (timeProgressPct/100)` : `spent` (bez projekcije kad nemamo timeline).

## 3. UI — `ProjectCard.tsx` (treća metrika)
- Pored cashflow i health badge-a dodati **"Marža: X%"** badge s `getHealthBgClass(level)` bojom.
- Ako `marginUnknown` → "Marža: —" (neutralna boja) + tooltip "Unesite ugovoreni iznos za točniju analizu".

## 4. `ActiveProjectsStrip.tsx` — uskladiti s health helperom
- Sad ima vlastiti margin/health compute (10%/30%) — zamijeniti pozivom na `calculateProjectHealth` (uklanja duplikaciju, priority rule #3). Vizualni izgled (chip + traffic light) ostaje isti.

## 5. ProjectFullScreenView — Earned Value sekcija
- Nova komponenta `ProjectEarnedValueCard.tsx`:
  - Ugovoreno / Trošak / Marža € / Marža % / EAC / Status badge (zdravo/rizik/gubitak)
- Ako `contract_value` nije postavljen → prikaži prompt karticu s gumbom "Unesi ugovoreni iznos" koja otvara `ProjectDialog` fokusirano na to polje.

## 6. Push alert "Zona gubitka"
- Novi hook/util koji se okida nakon mutacija expense-a (kroz postojeću TanStack Query invalidation u `useExpenseCRUD`):
  - Uvjet: `contract_value > 0` AND `spent >= 0.9 * contract_value` (marža pala ispod 10%)
  - Throttle: provjeriti `notifications` tablicu — nema istog `type='project_loss_zone'` za isti `project_id` u zadnja 24h
  - Šalje preko postojeće `notifyHelper` / `notifyProjectActivity` infrastrukture (in-app + push prema `notification_preferences.projects_enabled`)
- i18n: `projects.alerts.lossZone` = "Projekt {{name}} ulazi u zonu gubitka — preostalo samo {{pct}}% marže"

## 7. i18n (HR/EN/DE)
Novi ključevi pod `projects.*`:
- `health.marginUnknown`
- `earnedValue.title`, `.contracted`, `.spent`, `.marginAmount`, `.marginPct`, `.eac`, `.eacHint`
- `earnedValue.status.healthy | risk | loss`
- `earnedValue.promptTitle`, `.promptDesc`, `.promptCta`
- `alerts.lossZone`

## 8. PDF (`projectReportExport.ts`)
Dodati Earned Value blok (Ugovoreno / Trošak / Marža € / Marža % / EAC / Status), HR+EN+DE.

## Težine — sažetak

```text
┌──────────────┬─────────┬──────────────────────────┐
│ Komponenta   │ Težina  │ Aktivna kada             │
├──────────────┼─────────┼──────────────────────────┤
│ Margin       │  40%    │ contract_value > 0       │
│ Budget       │  30%    │ total_budget > 0         │
│ Timeline     │  20%    │ end_date postavljen      │
│ Milestone    │  10%    │ milestones.length > 0    │
└──────────────┴─────────┴──────────────────────────┘
Fallback (bez contract_value): 0 / 40 / 35 / 25
```

## Što NE diram
- `contract_value` naziv kolone, postojeću P&L logiku, personal mode projekata, pragove level-a (80/50), izgled traffic-light badgeova.

## Redoslijed implementacije
1. `projectHealthScore.ts` (margin + EAC + fallback težine) + test
2. `useProjectEstimates.acceptEstimate` auto-fill
3. `ProjectCard` treći badge
4. `ActiveProjectsStrip` migracija na isti helper
5. `ProjectEarnedValueCard` + ugradnja u `ProjectFullScreenView`
6. Loss-zone alert (hook + throttle)
7. i18n + PDF
