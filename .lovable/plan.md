U pravu si. Pregledao sam stvarne datoteke i problem nije “dojam” nego konkretna regresija: nema runtime crasha, ali su i18n i wiring promjene polovično spojene, pa je UI razbijen.

## Što je potvrđeno pokvareno

1. `src/i18n/locales/hr.json`, `en.json`, `de.json`
- na dnu su dodani DRUGI top-level objekti `summary` i `onboarding`
- kod JSON objekata zadnji ključ pobjeđuje, pa su postojeći prijevodi za `summary.balance`, `summary.netWorth`, `summary.totalIncome`, `summary.recurring` i svi stari `onboarding.*` ključevi praktično prebrisani
- zato na početnoj vidiš raw ključeve tipa `summary.balance`

2. `src/hooks/useExpenses.ts`
- prethodna pretpostavka da je `dashboardExpenses` “user-filtered” bila pogrešna
- stvarni UI filteri se primjenjuju tek kasnije u `src/pages/Index.tsx` preko `applyFilters(...)`
- zato trend NE treba koristiti sirovi `expenses`, nego `dashboardExpenses`, jer on poštuje business/personal kontekst i access pravila za shared payment sources

3. `src/pages/Index.tsx`
- `prevMonthIncome`, `prevMonthExpenses`, `curMonthIncome`, `curMonthExpenses` se uopće ne destructuriraju iz `useExpenses()`
- rezultat: trend podaci nikad ne dođu do `SummarySection`

4. `src/components/add-expense/ManualExpenseForm.tsx`
- dodani su `showAdvanced`, `Collapsible` importi i ikona, ali nema stvarnog triggera ni collapsible sekcije
- dakle “Više opcija” nije implementirano; ostao je samo mrtav kod

## Plan popravka

### 1. Sanirati locale datoteke
U sva 3 locale fajla:
- spojiti nove ključeve u POSTOJEĆE `summary` i `onboarding` objekte
- ukloniti duplicirane top-level `summary` i `onboarding` blokove
- zadržati `form.moreOptions` / `form.lessOptions`
- dodati `summary.vsLastMonth` u postojeći `summary` blok da trend ima jasan kontekst

### 2. Ispraviti trend logiku
U `src/hooks/useExpenses.ts`:
- računati current/previous month trend iz `dashboardExpenses`, ne iz `expenses`
- zadržati izuzeće `expense_nature === 'correction'`
- ne prikazivati trend kad je prethodni mjesec 0

### 3. Stvarno proslijediti trend podatke
U `src/pages/Index.tsx`:
- destructurirati 4 trend vrijednosti iz `useExpenses()`
- proslijediti ih kroz `sharedDialogProps`
- postojeći propovi u `PersonalModeView` i `BusinessModeView` su već pripremljeni, pa tu trebaju samo minimalne korekcije ako budu potrebne

### 4. Završiti Summary UI
U `src/components/home/SummarySection.tsx`:
- zamijeniti inline `+12% ↑` / `-5% ↓` sa `t('summary.trendUp')` i `t('summary.trendDown')`
- ispod badgea prikazati `t('summary.vsLastMonth')`
- zadržati ispravnu boju:
  - prihod raste = zeleno
  - trošak pada = zeleno

### 5. Stvarno implementirati “Više opcija”
U `src/components/add-expense/ManualExpenseForm.tsx`:
- uvesti pravi `Collapsible` s triggerom
- u collapsible staviti:
  - Installments
  - Project
  - Budget
  - Expense nature
  - Location
- uvijek vidljivo ostaviti:
  - receipt capture
  - type
  - merchant
  - payment source / transfer flow
  - date
  - items
  - amount
  - description
  - category
  - note
  - save receipt
- usput lokalizirati preostale hardkodirane stringove u transfer destination dijelu

## Datoteke
- `src/i18n/locales/hr.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/de.json`
- `src/hooks/useExpenses.ts`
- `src/pages/Index.tsx`
- `src/components/home/SummarySection.tsx`
- `src/components/add-expense/ManualExpenseForm.tsx`

## QA nakon popravka
- `/index` na 384px: nema više raw ključeva `summary.*`
- onboarding ekran: nema raw ključeva `onboarding.*`
- add expense: “Više opcija” stvarno otvara/zatvara napredna polja bez gubitka unosa
- trend badge pokazuje smislen rezultat i skriva se kad nema prošlog mjeseca
- provjera u osobnom i poslovnom modu