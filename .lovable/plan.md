## Plan: Strogi duplicate check za ručni unos

### Cilj
Smanjiti false-positive upozorenja na duplikate pri ručnom dodavanju transakcije. CSV import logika ostaje netaknuta.

### Promjena

**Datoteka:** `src/hooks/useExpenses.ts` → funkcija `checkDuplicate` (linije 166-194)

Nova logika — upozorenje **samo** kad postoje SVI uvjeti istovremeno:
- isti iznos (egzaktno, ne ±1%)
- isti tip (`expense`/`income`/`transfer`)
- **isti kalendarski dan** (ne ±5 dana)
- isti merchant (preko `areMerchantsSimilar`) ILI gotovo identičan opis (case-insensitive trim equality, ili jedan sadrži drugi nakon trim-a)

Bez scoringa — sve mora biti zadovoljeno. Vraća prvi pronađeni match ili `null`.

**Što ostaje:**
- `findDuplicates` (CSV import) — netaknuto, i dalje 2-od-3
- `scoreDuplicate` helper — netaknuto (koristi ga import)
- `DuplicateWarningDialog` UI — netaknuto
- Pozivi iz `AddExpenseDialog` (linije 584, 864) — netaknuti, koriste isti potpis

### Memory update
`mem://features/transaction-duplicate-detection-v2`:
> Manualni check (`checkDuplicate`) traži ALL: egzaktan iznos + isti tip + isti dan + isti merchant/opis. CSV import (`findDuplicates`) ostaje 2-od-3 scoring.

### Što NE radimo
- Ne diramo CSV/import flow
- Ne dodajemo Settings toggle
- Ne uvodimo "ignore for 24h" memo (može kasnije ako i dalje smeta)
- Ne mijenjamo i18n (poruke ostaju iste)

### Verifikacija
- Ručno dodaj transakciju s istim iznosom kao postojeća, +2 dana, isti merchant → **ne pita** (prije: pitalo)
- Ručno dodaj duplikat istog dana, isti iznos, isti merchant → **pita** (kao i prije)
- CSV import s 2-od-3 podudaranjima → ponašanje nepromijenjeno
