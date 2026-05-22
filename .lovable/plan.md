
# Plan: Ujednačeni dizajn ispisa — Varijanta B + brendiranje

## Cilj
Svi PDF/HTML ispisi dobivaju isti vizualni jezik (Varijanta B — "Dashboard": teal-tinted header card, mali KPI cards, alternating rows, chip section labels), plus: logo, ime vlasnika u eyebrowu, opcionalna oznaka povjerljivosti, ime u nazivu fajla.

## Što se mijenja (high level)

1. **Dijeljeni dizajn-sustav za izvještaje** (novi fajlovi)
   - `src/lib/reportDesign.ts` — tokeni (boje, tipografija, spacing, radii) za Varijantu B
   - `src/lib/pdfReportKit.ts` — jsPDF helperi: header card, KPI strip, section chip, data table, footer (page X / Y), watermark
   - `src/lib/printHtmlTemplate.ts` — HTML pandan s istim CSS varijablama, embeddani Inter font (base64) za Capacitor WebView

2. **Logo komponenta**
   - `src/assets/report-logo.png` (ili .svg) — korisnikov logo
   - Helper `drawLogo(doc, x, y, h)` u `pdfReportKit.ts` koji renderira sliku u PDF; HTML inačica koristi `<img>` s base64 data URI-jem
   - Fallback ako logo nije dostupan: tekstualni "V&M Balance" wordmark u teal

3. **Header layout (svi izvještaji)**
   ```text
   ┌───────────────────────────────────────────────────────┐
   │ [LOGO]  MILAN HORVAT · 22.05.2026          [BADGE]    │  ← eyebrow + opcionalni confidentiality badge
   │                                                       │
   │ Izvješće o transakcijama                              │  ← H1
   │ Svibanj 2026 · Glavni račun                           │  ← podnaslov (period/scope)
   └───────────────────────────────────────────────────────┘
   ```
   - Eyebrow ime se dohvaća iz `profiles.full_name` → fallback `auth.user.email` lokalni dio → fallback prazno
   - Datum lokaliziran (`hr-HR` itd.)

4. **Toggle povjerljivosti — 3 razine**
   - Nova komponenta `ConfidentialityPicker` (radio: Bez oznake / Interno / Povjerljivo)
   - Integrira se u: `PaymentSourceTransactionsDialog`, `ProjectTransactionsTab` (gumb Ispiši/PDF), `ProjectReportsDialog`, `ProjectFinanceReportsDialog`, `ReportsDialog`, `WorkRecordsExportDialog`, `InvoicePreview`/`EstimatePreview` (export)
   - Persistencija zadnjeg izbora po korisniku → `localStorage` (`vm:lastConfidentiality`)
   - Vizualno:
     - **Bez oznake**: ništa
     - **Interno**: slate badge gore desno u headeru, footer linija "Interno — namijenjeno: {ime}"
     - **Povjerljivo**: teal badge gore desno + diagonalni watermark "POVJERLJIVO" (~8% opacity) na svakoj stranici + footer "Povjerljivo — namijenjeno: {ime}"

5. **Naziv datoteke s imenom**
   - Helper `buildReportFileName({type, owner, period, ext})` → `transakcije-milan-horvat-2026-05.pdf`
   - Imena se sanitiziraju (lowercase, dijakritike → ASCII, razmaci → `-`)

6. **Migracija postojećih exporta na novi sustav** (bez promjene API-ja prema komponentama)
   - `reportExport.ts`
   - `projectReportExport.ts`
   - `projectFinancePdfExport.ts`
   - `invoicePdf.ts`
   - `estimatePdf.ts`
   - `workRecordsExport.ts`
   - inline HTML builderi u `PaymentSourceTransactionsDialog.tsx` i `ProjectTransactionsTab.tsx`

7. **i18n ključevi (novi)**
   - `report.confidentiality.none|internal|confidential`
   - `report.confidentiality.intendedFor`
   - `report.confidentiality.watermark`
   - `report.eyebrow.preparedBy`
   - `report.footer.pageXofY`
   - Sve dodano u `hr.json`, `en.json`, `de.json`

## Što se NE mijenja
- API izvoznih funkcija prema komponentama ostaje isti (samo dobivaju opcionalni `confidentiality` i `owner` argument s defaultima)
- Logika izračuna brojki, filteri, RLS, balansi — ništa
- Native save / share / open flow (FileSavedDialog) — ostaje kakav je

## Tehnički detalji

**Tipografija u PDF-u**: Inter nije bundlean u jsPDF defaultu. Koristim ugrađeni Helvetica za brojke (tabular by default), a naslove crtam preko `doc.setFont('helvetica', 'bold')` s povećanim spacingom — vizualno blisko Inter Tightu. Ako kasnije zatreba pravi Inter, dodajemo `Inter-Regular.ttf` + `Inter-Bold.ttf` preko `doc.addFileToVFS` (~250 KB).

**Watermark**: `doc.saveGraphicsState() → setGState(opacity 0.08) → text rotiran 45°` u `didDrawPage` hook autoTablea (i ručno na non-table stranicama).

**HTML print**: ista vizualna pravila kroz CSS varijable; Inter učitan iz Google Fonts za web, ali za Capacitor build ugrađujem WOFF2 kao base64 u `<style>` (oko 80 KB gz).

**Logo dimenzioniranje**: target visina 28 px @ 72 DPI u PDF-u (proporcionalno širina). U HTML-u `height: 28px`.

## Procesni redoslijed implementacije
1. Tokeni + kit (`reportDesign.ts`, `pdfReportKit.ts`, `printHtmlTemplate.ts`)
2. `ConfidentialityPicker` + i18n ključevi
3. Migracija `reportExport.ts` (referentni primjer) + vizualna QA na uzorku
4. Migracija ostalih 7 exporta (paralelno gdje moguće)
5. Integracija pickera u sve export dijaloge
6. Vizualna QA: generiram po jedan PDF svakog tipa, konvertiram u sliku, pregledam (po PDF skill checklist)

## Pretpostavke / pitanja koja čekaju potvrdu prije builda
- **Logo fajl**: pošalji PNG (prozirna pozadina, min 256px visina) ili SVG. Ako ne stigne do starta builda, krećem s tekstualnim wordmarkom "V&M Balance" u teal i swapnem ga čim stigne.
- **Vlasnik na projektnim izvještajima**: koristim trenutno prijavljenog korisnika (onaj koji klika "Ispiši"), ne kreatora projekta. Reci ako želiš drugačije.
- **Watermark samo za "Povjerljivo"** (ne za "Interno") — kao što sam predložio.

## Rizici
- jsPDF + custom font povećava bundle (~250 KB). Mitigacija: lazy import u export helperima (već tako rade).
- HTML print u Capacitor WebView ne učitava remote fontove → embeddani base64 (potvrđeno radi).
- Ako logo stigne kao kompleksan SVG, jsPDF ga ne renderira nativno — konvertiram u PNG @2x build-time skriptom ili koristim `svg2pdf.js` (dodatna ovisnost, ~40 KB).
