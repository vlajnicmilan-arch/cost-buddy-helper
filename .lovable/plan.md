# B — Mjesečni paket za knjigovođu (PDF + Excel)

Za tvrtku s uključenim prekidačem „predajem knjigovođi" korisnik odabere mjesec i dobije
uredan pregled ulaznih računa za predaju — jednom kao PDF (za čitanje), jednom kao Excel
(za obradu) — te mjesec označi kao „predano".

## Što ulazi u paket (točan uvjet)

Račun ulazi kad vrijedi sve:

1. `isAccountingHandoverInvoice(invoice, projects, profiles) === true` (F2 pravilo, samo se čita).
2. Mjerodavna tvrtka računa = odabrana tvrtka.
3. Razdoblje po DATUMU RAČUNA: `issue_date` unutar odabranog mjeseca (plaćanje je nebitno).
   Račun bez `issue_date` ne ulazi, ali se prikazuje u odjeljku „bez datuma — provjeri".
4. Račun NIJE stigao službenim eRačun/FINA kanalom.

**Podrijetlo — potvrđeno u bazi.** Ulazne račune pune dva puta:
- eRačun XML uvoz (`src/lib/eracun/intakeBatch.ts`) — jedini upisuje `import_batch_id`
  (uuid serije) i `source_filename` (`…​.xml`). U bazi: 105 takvih redaka, svi s oba polja.
- dokumenti iz maila/skena — oba polja su `NULL` (56 redaka).

Uvjet isključenja je zato: `import_batch_id IS NULL` (eRačun serija isključena). Za sigurnost
se uz to gleda i `source_filename` koji završava na `.xml`. Oba uvjeta ide u jednu čistu
funkciju `isFinaOriginInvoice(invoice)` da postoji jedno mjesto istine.

## Sadržaj pregleda

Po računu: dobavljač + OIB, broj računa, datum računa (+ dospijeće), osnovica, PDV, ukupno,
način plaćanja, kategorija, „materijalni trošak" (izvedeno, ne sprema se), projekt (naziv).

- Osnovica i PDV po stopama iz `items[].vatPercent` / `lineAmount` (potvrđeno: stavke nose
  `vatPercent`, npr. 0 i 25). Kad stavki nema, koristi se `total_amount` i `vat_amount`, a
  stopa se vodi kao „nerazvrstano".
- Način plaćanja: iz troška povezanog kroz `paid_expense_id` (isti izvor kao značka
  „materijalni trošak"); neplaćen račun → „nije plaćeno".
- Grupirano po kategoriji; unutar „pripadnost projektu" još po projektu. Zbroj po skupini,
  rekapitulacija PDV-a po stopama i ukupno.

## Gdje u aplikaciji

Bez nove navigacije. Na postojećoj polici ulaznih računa (Poslovno → „Ulazni računi
(eRačun)", `IncomingInvoicesPanel`) dolazi traka „Predaja knjigovodstvu" s izborom mjeseca
(◀ rujan 2026 ▶), brojem računa u paketu, gumbima **PDF** i **Excel** te gumbom
**Označi kao predano** (s datumom predaje kad je već predano). Traka je vidljiva samo kad
aktivna tvrtka ima uključen prekidač.

## Kako se rade datoteke

Klijentski, bez edge funkcije i bez novih biblioteka:
- PDF: `jspdf` + `jspdf-autotable` kroz postojeći `pdfReportKit` (zaglavlje, podnožje,
  brendiranje) — isti obrazac kao `projectFinancePdfExport.ts`. Biblioteka se učitava lijeno.
- Excel: `write-excel-file` kroz isti lijeni uvoz kao `src/lib/export/excelWorkbook.ts`;
  listovi „Računi" (jedan redak po računu) i „Rekapitulacija".
- Spremanje kroz postojeći `fileExport.ts` (radi i u nativnoj ljusci).

## Status „predano"

Nova mala tablica `accounting_handover_periods`: `id`, `user_id`, `business_profile_id`,
`period` (`YYYY-MM`), `submitted_at`, `invoice_count`, `total_amount`, `created_at`;
jedinstveno po (`user_id`, `business_profile_id`, `period`). Additivno, nova tablica,
RLS `auth.uid() = user_id` + GRANT-ovi po pravilu projekta; ništa postojeće se ne mijenja.
Označavanje je upis retka; ponovni klik na već predano razdoblje pita za potvrdu (bez
dvostruke predaje). Izvoz datoteka radi neovisno o statusu.

## Greške

Pad upisa/čitanja statusa → `logDiagnostic` (radnja `accounting_handover_periods.markSubmitted`,
id tvrtke i razdoblje, doslovan `code`/`message` iz baze, build žig) + prevedena poruka kroz
`describeDbError`. Ako je upis prošao a osvježenje palo, poruka izričito kaže oboje.

## Tehnički dio

Nove datoteke:
- `src/lib/eracun/handoverPackage.ts` — čiste funkcije: `isFinaOriginInvoice`,
  `selectHandoverInvoices(invoices, projects, profiles, profileId, period)`,
  `groupHandoverInvoices` (po kategoriji/projektu), `vatRecap` (po stopama), `packageTotals`.
- `src/lib/eracun/handoverPdfExport.ts`, `src/lib/eracun/handoverExcelExport.ts` — izlazi.
- `src/hooks/useAccountingHandoverPeriods.ts` — čitanje i upis statusa.
- `src/components/business/eracun/HandoverBar.tsx` — traka s mjesecom, izvozima i statusom.
- Testovi: odabir računa (FINA isključen, razdoblje po `issue_date`, prekidač), grupiranje,
  PDV rekapitulacija po stopama, zbrojevi.

Dirano uz to: `IncomingInvoicesPanel.tsx` (umetanje trake), i18n `hr/en/de`
(`eracun.handover.*`), jedna additivna migracija.

## Izvan opsega — ne dira se

Zip originala i čišćenje slike, mail knjigovođi, F1 logika i prekidač (samo se čitaju),
motor salda i anchor, `expenses` i put spremanja troška, uvoz izvoda, dedup/otisak,
owner-loan, postojeće RLS politike, scanner tijek, atribucija troška. Ne objavljuje se.
