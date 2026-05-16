
# Dual P&L View + Contract Value

Cilj: projekti pokazuju **dva paralelna stanja** — trenutni cash flow i očekivani profit po ugovoru. Dodaje se novo polje `contract_value` (ugovorena vrijednost s kupcem).

---

## 1. Baza (migracija)

`projects` tablica — dodati:
- `contract_value NUMERIC` (nullable, default NULL)

Bez RLS promjena, bez triggera. Fallback logika u kodu: `contract_value ?? total_budget`.

---

## 2. Logika računanja (`src/lib/projectCalculations.ts`)

Dodati nove pure funkcije pored postojećih (ne dirati postojeće):

```text
calculateContractValue(project)        → contract_value ?? total_budget ?? 0
calculateExpectedProfit(project, exp)  → contractValue − totalCosts
calculateCollectionProgress(project)   → income / contractValue (%)
```

Postojeće `calculateProjectSpent / Income / Balance` ostaju netaknute (cash basis).

`useProjectProfitLoss.ts` proširiti returnom:
- `contractValue: number`
- `expectedProfit: number` (contract − svi troškovi)
- `expectedMargin: number` (%)
- `collectedPercentage: number` (income / contract × 100)
- `remainingToCollect: number` (contract − income)

---

## 3. UI prikaz (Dual View)

### A) Forma za projekt (`AddProjectDialog` / `EditProjectDialog`)
Novo polje **"Ugovorena vrijednost (opcionalno)"** ispod `total_budget`, s hint tekstom: "Ako ostaviš prazno, koristi se ukupan budžet."

### B) `ProjectFullScreenView` — P&L sekcija
Umjesto jednog "Net Profit" reda, prikazati **dva bloka**:

```text
┌─────────────────────────┬─────────────────────────┐
│ TRENUTNO STANJE         │ OČEKIVANO (UGOVOR)      │
│ (gotovina)              │                         │
├─────────────────────────┼─────────────────────────┤
│ Naplaćeno:    5.000 €   │ Ugovoreno:   20.000 €   │
│ Potrošeno:    8.000 €   │ Svi troškovi: 8.000 €   │
│ ─────────────────────   │ ─────────────────────   │
│ Saldo:       −3.000 €   │ Profit:      12.000 €   │
│                         │ Marža:           60%    │
│ Za naplatu:  15.000 €   │                         │
└─────────────────────────┴─────────────────────────┘
```

### C) Kartica projekta u `ActiveProjectsStrip` / `ProjectsPanel`
- Glavni broj ostaje cash balance (kao sad), ali u boji koja **više nije crvena** ako je očekivani profit pozitivan
- Mali sekundarni red ispod: "Očekivani profit: 12.000 € (60%)"
- Health score logika: ako je cash u minusu ali ugovor pozitivan → **yellow** umjesto **red** (manja panika)

### D) `getProjectStatusLine` (`src/lib/projectStatusLine.ts`)
Dodati novu varijantu kad je cash < 0 a expected > 0: "Čeka se naplata — projekt profitabilan."

---

## 4. PDF Izvještaji

Tri PDF-a koja prikazuju projekte (`projectReportExport.ts`, `BusinessReports.tsx` projekt-sekcija, glavni summary) trebaju **proširenu tablicu**:

Trenutno: `Naziv | Budžet | Potrošeno | Prihod | Saldo`
Novo:     `Naziv | Ugovoreno | Naplaćeno | Potrošeno | Cash saldo | Oček. profit`

Plus novi summary blok na vrhu Project Report PDF-a:
```text
Ugovoreno:        20.000,00 €
Naplaćeno:         5.000,00 € (25%)
Za naplatu:       15.000,00 €
─────────────────────────────
Ukupni troškovi:   8.000,00 €
  • Materijal:     3.500,00 €
  • Radnici:       4.500,00 €
─────────────────────────────
Trenutni saldo:   −3.000,00 € (cash)
Očekivani profit: 12.000,00 € (60% marža)
```

Koristi postojeći `pdfBranding.ts` (`brandAutoTable`, `formatBrandCurrency`) — bez novih helpera.

---

## 5. i18n (HR / EN / DE)

Novi ključevi pod `projects.profitLoss.*`:

| Ključ | HR | EN | DE |
|---|---|---|---|
| `contractValue` | Ugovorena vrijednost | Contract value | Vertragswert |
| `contractValueHint` | Ako prazno, koristi se ukupan budžet | If empty, total budget is used | Falls leer wird das Gesamtbudget verwendet |
| `currentState` | Trenutno stanje (gotovina) | Current state (cash) | Aktueller Stand (Bargeld) |
| `expected` | Očekivano (ugovor) | Expected (contract) | Erwartet (Vertrag) |
| `collected` | Naplaćeno | Collected | Eingenommen |
| `remainingToCollect` | Za naplatu | To be collected | Noch einzunehmen |
| `expectedProfit` | Očekivani profit | Expected profit | Erwarteter Gewinn |
| `expectedMargin` | Očekivana marža | Expected margin | Erwartete Marge |
| `cashBalance` | Cash saldo | Cash balance | Kassenstand |
| `statusLineProfitable` | Čeka se naplata — projekt profitabilan | Awaiting payment — project profitable | Wartet auf Zahlung — Projekt profitabel |

Svi prevodi ulaze u `src/i18n/locales/{hr,en,de}.json` istovremeno.

---

## 6. Što NE diramo

- `expenses` tablica, RLS, triggeri
- `project_funding` logika (ostaje kao izvor income transakcija)
- Dashboard balance, transferi, korekcije
- `useActiveProjectsSummary` (nastavlja vraćati cash brojeve — proširimo samo ako bude tip-safe)
- Postojeći `useProjectProfitLoss` field-ovi (samo proširenje, ne mijenjamo postojeće)

---

## 7. Redoslijed implementacije

1. Migracija `contract_value` na `projects`
2. `projectCalculations.ts` — nove pure funkcije + testovi
3. `useProjectProfitLoss.ts` — proširiti return
4. `AddProjectDialog` + `EditProjectDialog` — novo polje
5. i18n ključevi (sva 3 jezika)
6. `ProjectFullScreenView` P&L sekcija — dual view UI
7. `ActiveProjectsStrip` / `ProjectsPanel` kartice — sekundarni red
8. `projectHealthScore` + `projectStatusLine` — nova logika
9. PDF generatori (3 datoteke)
10. QA: pokrenuti `scripts/render-all-reports.mjs`, vizualno provjeriti sve PDF-ove (pdftoppm)

---

## 8. Rizik

**Nizak.** Sve promjene su aditivne — postojeće funkcije i prikazi rade isto kao prije ako je `contract_value = NULL`. Migracija je samo `ADD COLUMN nullable`. Ako se nešto pokvari u UI-u, fallback na `total_budget` čuva backward compatibility.
