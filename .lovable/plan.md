## Cilj

Generirati **sve PDF izvješća iz aplikacije** s izmišljenim ali realističnim podacima, spremiti ih u `/mnt/documents/` i isporučiti kao artifakte za vizualnu provjeru fonta, sortiranja i boja.

## Popis PDF-ova (10 ukupno)

Iz `src/lib/`:
1. `generatePDFReport` — financijsko izvješće (rashodi po kategorijama)
2. `generateIncomePDFReport` — izvješće o prihodima
3. `generateProjectPDFReport` — projekt P&L
4. `generateWorkLogPDFReport` — dnevnik rada projekta
5. `generateWorkRecordsPDF` — radni sati radnika

Inline u komponentama:
6. `SpendingCalendar` → mjesečni kalendar potrošnje
7. `ItemsAnalysisTab` → analiza stavki
8. `BusinessReports` → tvrtka P&L
9. `WorkLogMonthlyOverview` → mjesečni overview rada (landscape)
10. `FinancialAssistantDialog` → AI chat tablica + tekst export (dva varijantna)

## Pristup

**Standalone Node skripta** (`scripts/render-all-reports.mjs`) koja:

- Importa svaku `generate*` funkciju iz `src/lib/` direktno
- Za inline komponente: izvuče njihovu PDF logiku u privremene `src/lib/__previews__/*.ts` wrappere (čisti refaktor, bez promjene ponašanja u appu) — ili kopira blok u skriptu ako je manji
- Hrani ih ručno složenim mock objektima koji pokrivaju:
  - 15-30 transakcija raspoređenih po 6+ kategorija
  - prihode iz 3 izvora
  - 1 projekt s 4 milestonea, budžet, troškove, prihode, 5 work entryja
  - 2 radnika, 20 worker hours unosa kroz mjesec
- Patcha `fileExport.ts` save() tako da umjesto downloada zapiše PDF na disk (`mode: 'save'` → presretne u Node okruženju preko env flaga `REPORTS_PREVIEW_DIR`)

Output:
```
/mnt/documents/reports-preview/
  01-financial-expenses.pdf
  02-financial-income.pdf
  03-project-summary.pdf
  04-project-worklog.pdf
  05-work-records.pdf
  06-spending-calendar.pdf
  07-items-analysis.pdf
  08-business-pl.pdf
  09-worklog-monthly.pdf
  10-ai-assistant-table.pdf
```

## QA korak (obavezan)

Za svaki PDF: `pdftoppm -jpeg -r 150` → vizualni pregled svake stranice. Tražim:
- font fallback (□ kvadratići umjesto č/ć/š/ž/đ — poznata bolna točka jsPDF-a s helveticom)
- sortiranje tablica (datum desc? abeceda? po iznosu?)
- boje (teal brand? semantic green/red za income/expense?)
- preklapanja, odsječen tekst, footer pozicija

Rezultat QA prijavljujem u poruci uz svaki artifact tag, **bez uljepšavanja** — ako nešto puca, to ti i kažem.

## Što NEĆU dirati

- Stvarni produkcijski kod izvoznih funkcija (samo wrapperi za inline blokove ako je nužno)
- DB
- UI komponente

## Tehnički detalji

- Skripta se izvršava preko `bun scripts/render-all-reports.mjs`
- jsPDF radi u Node-u (jsdom shim ako zatreba za autoTable)
- Mock podaci hardkodirani u skripti — jedan izvor istine, ponovljivo
- Skripta i wrapperi ostaju u repou pod `scripts/` i `src/lib/__previews__/` za buduće QA prolaze — možeš ih obrisati kad ne trebaš

## Isporuka

10 PDF-ova u chatu kao `<presentation-artifact>` tagovi + kratki sažetak nalaza po svakom (font OK / problem X, sortiranje, boje).