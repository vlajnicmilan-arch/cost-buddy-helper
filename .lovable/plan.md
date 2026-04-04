

## Plan: Popravak PDF izvoza u izvještajima

### Problem
`doc.save()` iz jsPDF ne radi pouzdano na mobilnim preglednicima — toast prikazuje "PDF kreiran" ali datoteka se nikad ne pojavi. Isti problem postoji na **3 mjesta**:
1. `src/lib/reportExport.ts` — `generatePDFReport` (linija 166)
2. `src/lib/reportExport.ts` — `generateIncomePDFReport` (linija 334)
3. `src/components/business/BusinessReports.tsx` — `exportPDF` (linija ~70)

CSV i JSON izvoz već koriste ispravan `Blob` + `URL.createObjectURL` pristup i rade dobro.

### Rješenje
Zamijeniti `doc.save(fileName)` s pouzdanijim Blob pristupom na sva 3 mjesta:

```typescript
const blob = doc.output('blob');
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = fileName;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

### Datoteke za izmjenu
- **`src/lib/reportExport.ts`** — 2 zamjene (`generatePDFReport` i `generateIncomePDFReport`)
- **`src/components/business/BusinessReports.tsx`** — 1 zamjena (`exportPDF`)

### Rezultat
PDF preuzimanje radi pouzdano na svim preglednicima, uključujući mobilne (Chrome Android, Samsung Internet, Safari iOS).

