

# Plan: Iznos kao obavezan kriterij za duplikate (ručni unos)

## Problem
Funkcija `checkDuplicate` (ručni unos) i dalje koristi čisti "2-od-3" sustav. Vinka je dobila lažno upozorenje jer su se poklopili datum i dio opisa ("Marino"), ali iznosi su bili potpuno različiti (7,23€ vs 50€).

## Promjena

**Datoteka:** `src/hooks/useExpenses.ts`, linije 186-187

Zamijeniti:
```typescript
// Return match if score >= 2 (2-of-3 criteria met)
return bestScore >= 2 ? bestMatch : null;
```

S:
```typescript
// Amount match is mandatory — without it, no duplicate warning
if (bestScore >= 2 && bestMatch) {
  const amountDiff = Math.abs(Number(bestMatch.amount) - transaction.amount) / Math.max(Math.abs(transaction.amount), 0.01);
  const sameType = bestMatch.type === transaction.type;
  if (!sameType || amountDiff > 0.01) return null;
}
return bestScore >= 2 ? bestMatch : null;
```

`findDuplicates` (CSV import) ostaje nepromijenjen — tamo batch pregled ima smisla s 2-od-3.

| Datoteka | Promjena |
|---|---|
| `src/hooks/useExpenses.ts` | Dodati provjeru iznosa kao obavezan uvjet u `checkDuplicate` |

