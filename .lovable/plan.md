
## Plan: Pravi popravak izvoza iz izvještaja u mobilnoj aplikaciji

### Što je stvarni problem
Ovo više nije problem samog `jsPDF`-a. Screenshot pokazuje da se problem događa u Android aplikaciji (native WebView), a tamo ni `doc.save()` ni `Blob + <a download>` nisu pouzdani jer se i dalje oslanjaju na browser download mehanizam.

Drugim riječima: prethodni fix je zamijenio jedan browser-only način drugim browser-only načinom, pa zato i dalje vidiš toast “PDF izvješće generirano!”, ali se datoteka ne pojavi.

**Do I know what the issue is? Yes.**

### Gdje je problem
Screenshot odgovara glavnom export bloku u:
- `src/components/reports/ReportsDialog.tsx`

Taj ekran koristi:
- `src/lib/reportExport.ts` → `generatePDFReport`
- `src/lib/reportExport.ts` → `generateIncomePDFReport`

Isti uzorak postoji i na drugim export gumbima, pa mogu imati isti kvar u appu:
- `src/components/business/BusinessReports.tsx`
- `src/components/reports/ItemsAnalysisTab.tsx`
- `src/components/FinancialAssistantDialog.tsx`
- `src/components/SpendingCalendar.tsx`
- `src/lib/projectReportExport.ts`
- `src/lib/workRecordsExport.ts`
- `src/components/BackupRestore.tsx`
- `src/components/SettingsDialog.tsx`
- `src/lib/icsExport.ts`

### Rješenje
1. Uvesti centralni helper za izvoz datoteka, npr. `src/lib/fileExport.ts`
   - **Web:** ostaviti `Blob + object URL + anchor`
   - **Native app:** ne koristiti browser download, nego:
     - spremiti datoteku preko `@capacitor/filesystem`
     - dohvatiti lokalni `file://` URI
     - otvoriti native share/save dijalog preko `@capacitor/share`

2. Prebaciti report PDF exporte na taj helper
   - `generatePDFReport`
   - `generateIncomePDFReport`
   - `BusinessReports.exportPDF`
   - `ItemsAnalysisTab.handleExportPDF`
   - ostale PDF funkcije koje još koriste `doc.save()`

3. Prebaciti i CSV/JSON/ICS exporte na isti helper
   - da i “ostali gumbi” rade u native aplikaciji, ne samo PDF

4. Popraviti poruke korisniku
   - na webu: “datoteka preuzeta”
   - u appu: “datoteka je spremna, odaberi gdje je želiš spremiti/podijeliti”
   - više ne prikazivati lažni uspjeh bez stvarnog izlaza

5. Usput očistiti sitne greške
   - u `src/lib/reportExport.ts` naziv datoteke trenutno završava s dvostrukim `.pdf`
   - ujednačiti cleanup i naming kroz sve exporte

### Datoteke za izmjenu
- Novi helper: `src/lib/fileExport.ts`
- Glavni reports flow:
  - `src/lib/reportExport.ts`
  - `src/components/reports/ReportsDialog.tsx`
- Ostali exporti:
  - `src/components/business/BusinessReports.tsx`
  - `src/components/reports/ItemsAnalysisTab.tsx`
  - `src/components/FinancialAssistantDialog.tsx`
  - `src/components/SpendingCalendar.tsx`
  - `src/lib/projectReportExport.ts`
  - `src/lib/workRecordsExport.ts`
  - `src/components/BackupRestore.tsx`
  - `src/components/SettingsDialog.tsx`
  - `src/lib/icsExport.ts`

### Tehnički detalji
Paketi za native rješenje su već prisutni u projektu (`@capacitor/filesystem`, `@capacitor/share`), pa nije potreban novi servis ni backend.

```text
Web:
  jsPDF/CSV/JSON -> Blob -> objectURL -> <a download>

Native app:
  jsPDF/CSV/JSON -> Blob/base64
  -> Filesystem.writeFile(Directory.Cache)
  -> Filesystem.getUri()
  -> Share.share({ files: [uri] })
```

### Rezultat
- PDF izvoz iz izvještaja radi u objavljenoj mobilnoj aplikaciji
- i ostali export gumbi koriste isti pouzdani native flow
- korisnik više ne dobiva “generirano” bez stvarne datoteke
