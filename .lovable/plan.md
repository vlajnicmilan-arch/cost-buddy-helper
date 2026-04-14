

# Provjera plana — pronađeni problemi i korekcije

## Potvrđeno ispravno
- **Paginacija**: Već implementirana (useExpenseFetch.ts, linije 74-91) — `.range()` petlja. Nema promjene.
- **Onboarding preseti**: Hardkodirani na HR (linije 29-42). Plan lokalizacije je ispravan.
- **Progressive disclosure**: Polja Installments/Project/Budget/Nature/Location su između Date i Amount (linije 349-492). Collapsible wrapper NE zahtijeva reordering — čista promjena.
- **Items** već imaju vlastiti show/hide toggle (`showItems` prop) — ne treba ih stavljati u "Više opcija".

## Pronađeni problemi u prethodnom planu

### Problem 1: Trend MORA biti odvojen useMemo
Prethodni plan kaže "dodati prevMonth unutar istog useMemo". ALI:
- `totals` useMemo koristi `dashboardExpenses` (filtrirane)
- Trend mora koristiti `expenses` (raw/sve)
- **Miješanje u isti useMemo** bi značilo da se trend rekalkulira kad se filteri promijene, ali s krivim nizom

**Ispravak:** Kreirati **zasebni** `useMemo` za trend koji ovisi o `[expenses]`.

### Problem 2: `now` u useMemo — edge case ali bezopasan
`now/currentMonthStart/currentMonthEnd` su izvan useMemo (linije 196-198). Tehnički se rekreiraju na svakom renderu, ali useMemo se ne rekalkulira jer dependency je `[dashboardExpenses]`. To znači da se **ne** koriste zastarjele vrijednosti — svaki put kad se dashboardExpenses promijeni, `now` se ionako rekreira. Premještanje unutra je kozmetičko, ali ću ga napraviti radi čistoće.

### Problem 3: Collapsible u ManualExpenseForm — Note ostaje vidljiv
Note je čest input (korisnici dodaju bilješku na mnoge transakcije). Plan ga je stavio u "Više opcija" — **krivo**. Note ostaje vidljiv.

Konačno, evo što ide u collapsible:
- Installments (rate)
- Project assignment
- Budget assignment  
- Expense nature (regular/extraordinary)
- Location

Ostaje vidljivo: Receipt, Type, Merchant, Payment Source, Transfer flow, Date, Items, Amount, Description, Category, Note, Save Receipt.

---

## Finalni plan implementacije

### 1. Lokalizacija onboarding preseta
**Datoteka:** `src/pages/Onboarding.tsx`
- Pretvoriti `PRESET_SOURCES` i `INCOME_SOURCES` u funkcije `getPresetSources(t)` i `getIncomeSources(t)` koje vraćaju lokalizirane nizove
- Koristiti `t('onboarding.presets.bank')` itd.

### 2. Progressive disclosure u ManualExpenseForm
**Datoteka:** `src/components/add-expense/ManualExpenseForm.tsx`
- Dodati `showAdvanced` state
- Omotati Installments + Project + Budget + Nature + Location u `Collapsible` s toggleom "Više opcija" / "Manje opcija"
- Sve ostalo ostaje vidljivo

### 3. Trend indikator — ODVOJENI useMemo
**Datoteka:** `src/hooks/useExpenses.ts`
- Premjestiti `now/currentMonthStart/currentMonthEnd` unutar postojećeg `totals` useMemo
- Dodati NOVI `trendData` useMemo koji koristi `expenses` (raw):
```typescript
const trendData = useMemo(() => {
  const now = new Date();
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const prevMonthExpenses = expenses
    .filter(e => e.type === 'expense' && e.date >= prevStart && e.date <= prevEnd && (e.expense_nature as string) !== 'correction')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const prevMonthIncome = expenses
    .filter(e => e.type === 'income' && e.date >= prevStart && e.date <= prevEnd && (e.expense_nature as string) !== 'correction')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  return { prevMonthIncome, prevMonthExpenses };
}, [expenses]);
```
- Spread `trendData` u return objekt

**Datoteka:** `src/components/home/SummarySection.tsx`
- Dodati `prevMonthIncome` i `prevMonthExpenses` u props
- Ispod Income kartice: badge s % razlikom (zeleno ako porastao, crveno ako pao)
- Ispod Expense kartice: badge s % razlikom (zeleno ako PAO, crveno ako porastao — invertirana logika)
- Ne prikazivati badge ako je prošli mjesec 0

**Datoteke:** `PersonalModeView.tsx`, `Index.tsx`
- Proslijediti `prevMonthIncome` i `prevMonthExpenses` kroz props chain

### 4. i18n ključevi
**Datoteke:** `hr.json`, `en.json`, `de.json`
- `onboarding.presets.*` (bank, cash, savings, paypal, revolut + opisi; salary, freelance, reward, investment)
- `form.moreOptions` / `form.lessOptions`
- `summary.vsLastMonth`, `summary.trendUp`, `summary.trendDown`

## Datoteke za promjenu

| Datoteka | Promjena |
|---|---|
| `src/pages/Onboarding.tsx` | i18n preseti |
| `src/components/add-expense/ManualExpenseForm.tsx` | Progressive disclosure collapsible |
| `src/hooks/useExpenses.ts` | now u useMemo + odvojeni trendData useMemo |
| `src/components/home/SummarySection.tsx` | Trend badge |
| `src/components/home/PersonalModeView.tsx` | Props forwarding |
| `src/pages/Index.tsx` | Props forwarding |
| `src/i18n/locales/hr.json` | Novi ključevi |
| `src/i18n/locales/en.json` | Novi ključevi |
| `src/i18n/locales/de.json` | Novi ključevi |

Nema promjena baze ni backend-a.

