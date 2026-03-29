

## Plan: Popravak filtriranja izvora plaćanja u izvješćima

### Problem

Transakcije pohranjuju izvor plaćanja u formatu `custom:UUID` (npr. `custom:abc-123`), ali lista izvora u izvješćima koristi samo `UUID` (`abc-123`). Kada korisnik isključi izvor, filter uspoređuje `custom:abc-123` s `abc-123` — nikad se ne poklapaju, pa se troškovi ne mijenjaju.

### Rješenje

**Datoteka:** `src/components/reports/ReportsDialog.tsx`

Dva moguća pristupa — koristit ću najjednostavniji:

1. **U `uniquePaymentSources`** — dodati `custom:` prefix na ID svake custom stavke, tako da odgovara formatu u transakcijama:
   ```
   id: `custom:${cs.id}`
   ```

2. **U `txCountMap`** — isti ključevi se koriste za brojanje transakcija pa se automatski poklapaju.

3. **U `filteredExpenses`** — `excludedPaymentSources.has(e.payment_source || 'cash')` — sad će raditi jer su ID-ovi usklađeni.

### Promjena je minimalna
- Samo jedna linija u `uniquePaymentSources` useMemo: `id: cs.id` → `id: \`custom:${cs.id}\``

