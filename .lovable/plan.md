## Cilj
Riješiti 4 problema utvrđena u QA prolazu i ujednačiti branding na svih 10 PDF-ova.

## Problemi koje rješavamo
1. **Bold Helvetica razmaci** ("F i n a n c i j s k o") — built-in jsPDF Helvetica-Bold render bug
2. **Dijakritika & Σ** se gubi u 4 izvještaja koji ne koriste `toAscii`
3. **Formatiranje valute** — `BusinessReports` koristi `.toFixed(2)` umjesto `Intl.NumberFormat('hr-HR')`
4. **Inkonzistentan branding** — generičke boje zaglavlja (crvena/plava/siva) umjesto teal `#2DBFA3`

## Rješenje

### A) Centralni PDF helper (`src/lib/pdfBranding.ts` — novi file)
Jedna točka istine za sve PDF-ove:
- `BRAND` konstante: primary teal `#2DBFA3`, dark `#0F172A`, muted gray, success/danger HSL → hex
- `formatCurrency(amount, currency)` — `Intl.NumberFormat('hr-HR', {style:'currency'})`
- `formatDate(date)` — `dd.MM.yyyy.`
- `drawHeader(doc, {title, subtitle, logo?})` — teal banner, bijeli naslov, datum generiranja desno
- `drawFooter(doc, pageNum, totalPages)` — "V&M Balance · stranica X/Y"
- `tableTheme` — autoTable preset: teal `headStyles.fillColor`, alternateRow světle teal `#E6F7F3`, font size 9, cellPadding 4
- `safeText(str)` — wrapper koji **ne** koristi `toAscii` već registrira **Inter** ttf (čita iz `node_modules/@fontsource/inter/files/...`) preko `doc.addFileToVFS` + `doc.addFont` → puna podrška za č/ć/ž/đ/š **i** za Σ ∞ €

### B) Font fix (rješava #1 i #2 odjednom)
Embed Inter Regular + Bold preko `@fontsource/inter` (već u projektu). `pdfBranding.ts` ima `registerInterFonts(doc)` koji se zove na startu svakog PDF-a. Helvetica-Bold bug nestaje jer više ne koristimo Helvetica. `toAscii` workaround se uklanja iz svih 10 izvještaja.

### C) Refactor po izvještaju
Svih 10 PDF generatora migrira na helper:
- `src/lib/generateFinancialExpensesPDF.ts`
- `src/lib/generateFinancialIncomePDF.ts`
- `src/lib/generateProjectPnLPDF.ts`
- `src/lib/generateWorkLogPDF.ts`
- `src/lib/generateWorkRecordsPDF.ts`
- `src/components/SpendingCalendar.tsx` (inline export)
- `src/components/ItemsAnalysisTab.tsx`
- `src/components/business/BusinessReports.tsx`
- `src/components/worklog/WorkLogMonthlyOverview.tsx`
- `src/components/ai/FinancialAssistantDialog.tsx`

Svaki: `registerInterFonts` → `drawHeader` → `autoTable(doc, {...tableTheme, head, body})` → `drawFooter` na svakoj stranici. Uklanja se duplicirani styling kod.

### D) QA prolaz
Ponovo pokrenuti `scripts/render-all-reports.mjs`, konvertirati pdftoppm → vizualna provjera svih 10 PDF-ova. Lista provjera:
- Č/ć/ž/đ/š/Σ/€ ispravno renderirani
- Bold naslovi bez razmaka među slovima
- Teal banner + footer na svim stranicama
- Iznosi formatirani kao "12.400,00 €"
- Tablice — alternirajući redovi, teal header, bez clippinga

## Što NE diramo
- Excel/CSV exporti (nisu u scope-u — samo PDF)
- Realne komponente koje renderiraju in-app UI (radimo samo na PDF generator funkcijama)
- Mock skripta `scripts/render-all-reports.mjs` — ostaje za buduće QA
- Logika izvještaja, sortiranje, agregati (samo prezentacija)

## Tehnički detalji
- Inter font (cca 80KB Regular + 80KB Bold base64) — load sync na startu generatora, ne utječe na bundle (lazy-loaded zajedno s PDF route-om)
- Boje izvedene iz postojećih `index.css` HSL varijabli (`--primary`, `--success`, `--destructive`) konvertirane u hex jer jsPDF ne razumije HSL
- `Intl.NumberFormat` radi i u Node-u (za QA skriptu) i u browseru
