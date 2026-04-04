

## Plan: Završne native popravke prije novog builda

### Preostali problemi

3 mjesta još koriste browser-only download umjesto centralnog `fileExport.ts` helpera:

1. **`src/components/SpendingCalendar.tsx`** (linija 152) — `doc.save()` za PDF
2. **`src/components/BackupRestore.tsx`** (linije 160-168) — `Blob + anchor` za JSON backup
3. **`src/components/SettingsDialog.tsx`** (linije 277-285) — `Blob + anchor` za JSON backup

### Rješenje

Na sva 3 mjesta zamijeniti browser-only pristup s postojećim helperima:

- **SpendingCalendar**: zamijeniti `doc.save(fileName)` s `await exportPDFDoc(doc, fileName)`
- **BackupRestore**: zamijeniti 8 linija Blob/anchor koda s `await exportTextFile(jsonData, fileName, 'application/json')`
- **SettingsDialog**: isto kao BackupRestore

### Datoteke za izmjenu
- `src/components/SpendingCalendar.tsx`
- `src/components/BackupRestore.tsx`
- `src/components/SettingsDialog.tsx`

### Rezultat
Svi izvozi u cijeloj aplikaciji prolaze kroz native-aware helper — PDF, CSV, JSON, ICS. Jedan git pull + `npx cap sync` + build pokriva sve.

