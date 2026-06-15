---
name: PDF Import Internal Transfer Reclassification
description: pdfPostProcess.ts safety net pretvara i income i expense u transfer kad opis matcha isInternalTransfer (Aircash/Revolut top-up, ATM, prijenosi na vlastiti račun)
type: feature
---

`src/lib/pdfPostProcess.ts` → `reclassifyInternalTransfers()`:

- Primjenjuje se nakon AI PDF/HTML/photo parsera, prije inserta u `expenses`.
- Za svaki redak: ako je `type` `income` ILI `expense` i `isInternalTransfer(description)` (iz `src/lib/csvParsers.ts`) vraća true → postaje `transfer`.
- `transfer` ostaje netaknut.
- Ostali tipovi (npr. `correction`) ostaju netaknuti.

Pokriva slučajeve koje je AI prije znao pogrešno klasificirati:
- Income side: "Uplata gotovine na Aircash Tisak", "Revolut top up via Visa".
- Expense side (dodano nakon Aircash svibanj/lipanj 2026 bug-a): "Uplata gotovine na Aircash INA/Tisak", "Uplata na Aircash - Visa *** 7262", "Bankomat podizanje".

Testovi: `src/lib/__tests__/pdfPostProcess.test.ts` (12 testova, oba smjera + ne-mutiranje ulaza).

Pozivatelj: `src/hooks/usePDFParser.ts` (oba mjesta gdje se procesira AI output).
