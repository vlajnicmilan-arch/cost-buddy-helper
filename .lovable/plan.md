

## Plan: Validacija datuma + auto-zatvaranje kalendara

### Pravila po tipu datuma

| Tip | Min | Max |
|---|---|---|
| Datum transakcije (trošak) | danas - 10g | **danas** |
| Datum prihoda | danas - 10g | **danas + 1 mjesec** |
| Sljedeća rata / Recurring | danas - 1g | **danas + 5g** |
| Rok plaćanja duga | danas | **danas + 10g** |
| Ciljni datum štednje | danas | **danas + 20g** |
| Početak/kraj budžeta | danas - 1g | **danas + 5g** |
| Datum događaja kalendara | danas - 1g | danas + 5g |
| Vrijedi do (estimate) | danas | danas + 5g |
| Custom raspon (izvješća) | 1900 | danas |

### 1. Centralna logika
Stvaram `src/lib/dateValidation.ts`:
```ts
export const DATE_LIMITS = {
  expense: { minYearsAgo: 10, maxDaysAhead: 0 },
  income: { minYearsAgo: 10, maxDaysAhead: 30 },
  recurring: { minYearsAgo: 1, maxYearsAhead: 5 },
  debt: { minDaysAgo: 0, maxYearsAhead: 10 },
  savings: { minDaysAgo: 0, maxYearsAhead: 20 },
  budget: { minYearsAgo: 1, maxYearsAhead: 5 },
  event: { minYearsAgo: 1, maxYearsAhead: 5 },
  estimate: { minDaysAgo: 0, maxYearsAhead: 5 },
} as const;

export const getDateRange = (type) => ({ min: ..., max: ... });
export const clampDate = (date, type) => ...;
```

**Posebno za transakcije**: pravila se mijenjaju ovisno o `type` polju (`expense` vs `income`) — kad korisnik prebaci na "Prihod", max postaje danas+30 dana.

### 2. Auto-zatvaranje kalendara
Sve `Popover` + `Calendar` komponente prelaze na controlled state:
```tsx
const [open, setOpen] = useState(false);
<Popover open={open} onOpenChange={setOpen}>
  <Calendar onSelect={(d) => { setDate(d); setOpen(false); }} />
</Popover>
```
Za `mode="range"`: zatvori tek kad postoje oba datuma.

### 3. Native `<input type="date">`
Dodajem `min` / `max` atribute + on-blur clamp koji vraća na zadnji važeći + StatusFeedback poruku.

### 4. Datoteke koje mijenjam

**Calendar popover (auto-close + disabled):**
- `EditTransactionDialog.tsx` (dinamički prema type)
- `ProjectDialog.tsx`, `ProjectMilestonesTab.tsx`, `ProjectTransactionsTab.tsx`
- `WorkerScheduleDialog.tsx`, `WeeklyWorkEntryForm.tsx`
- `TransactionFilters.tsx` (range mode)

**Native date input (min/max):**
- `add-expense/ManualExpenseForm.tsx` (dinamički expense/income)
- `calendar/CalendarEventDialog.tsx`
- `budget/BudgetDialog.tsx` (start + end, end ≥ start)
- `savings/SavingsGoalDialog.tsx`
- `recurring/RecurringTransactionDialog.tsx`
- `business/BusinessDebtTracker.tsx`
- `projects/EstimateDialog.tsx`
- `installments/InstallmentToggle.tsx`
- `reports/ReportsDialog.tsx`

**i18n:** Dodajem `validation.dateOutOfRange`, `validation.dateInFuture`, `validation.dateTooFar` u `hr.json`, `en.json`, `de.json`.

### Što NE diram
Bazu, RLS, edge funkcije, sortiranje, postojeće zapise (CAKE SYMPHONY 2028 ostaje — korisnik ga ručno editira). Pregledne kalendare na stranicama (Calendar.tsx).

