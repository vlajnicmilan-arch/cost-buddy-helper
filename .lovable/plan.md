

## Plan: Filtriranje izvora plaćanja u izvješćima

Dodati u ReportsDialog opciju za uključivanje/isključivanje pojedinačnih izvora plaćanja, slično postojećim preklopnicima za projekte i budžete.

### Kako radi

U sekciji "Uključi u obračun" (pored postojećih toggleova za projekte/budžete) dodaje se nova sekcija s listom svih izvora plaćanja koji se pojavljuju u transakcijama za odabrani period. Svaki izvor ima checkbox/switch. Isključivanje izvora uklanja sve njegove transakcije iz izvješća — utječe na sve kalkulacije, grafove i exportove.

### Promjene

| Datoteka | Promjena |
|---|---|
| `src/components/reports/ReportsDialog.tsx` | 1) Novi state: `excludedPaymentSources: Set<string>` (prazno = svi uključeni). 2) Izračunati listu svih unikatnih payment source-ova iz expenses. 3) Dodati UI sekciju s checkboxovima za svaki izvor plaćanja (ime + ikona). 4) Dodati filter u `filteredExpenses` useMemo — isključiti transakcije čiji je `payment_source` u excluded setu. 5) Isti filter primijeniti i na comparison expenses (`compareExpenses1`, `compareExpenses2`). |

### UI dizajn

Ispod postojećih toggleova "Projektne transakcije" i "Budžetske transakcije" dodaje se:
- Separator
- Label "Izvori plaćanja"
- Collapsible lista s checkboxovima (default: svi uključeni)
- "Odaberi sve / Poništi sve" link
- Prikazuje ikonu + ime izvora + broj transakcija

Za custom payment source-ove koristi se `useCustomPaymentSources` hook za dohvat imena i ikona. Za ugrađene izvore koristi se `getPaymentSourceInfo()`.

### Tehnički detalji
- Filter se dodaje u postojeći `filteredExpenses` useMemo (linija 297-320) s uvjetom: `if (excludedPaymentSources.has(e.payment_source || 'cash')) return false`
- Isti uvjet se dodaje u `compareExpenses1` i `compareExpenses2` useMemo blokove
- Budući da `filteredExpenses` utječe na `stats`, `chartData`, `incomeTransactions` i export funkcije — sve se automatski ažurira
- Collapsible se koristi za kompaktnost (ne zauzima previše prostora kad je zatvoreno)

