# Uvoz eRačuna (UBL 2.1 XML) — izviđanje

## 1. Postoji li danas uvoz XML-a? Ne.

Provjereni su svi `accept=` atributi u repozitoriju. Nijedno mjesto ne prima `.xml`:

| Tok | Prihvaća |
|---|---|
| `BankConnection.tsx:439,462` | `.pdf`, `.html/.htm` |
| `PaymentSourceTransactionsDialog.tsx:902,923` | `.pdf`, `.html/.htm` |
| `CSVImportDialog.tsx:460` | `.csv` |
| Skener računa (`ReceiptCaptureButtons`, `ScanCaptureRunner`) | `image/*` |
| `ProjectDocumentsTab.tsx:242` | slike, pdf, doc, xls (samo pohrana, bez parsiranja) |
| `BackupRestore`, `SettingsDialog` | `.json` (backup) |

Edge funkcije `parse-pdf-statement` i `parse-receipt` rade nad PDF-om/slikom preko AI-ja. Nema UBL/XML parsera, nema `DOMParser` uvoznog puta, nema HRFISK mapiranja.

Dodatni nalaz: tablica `invoices` (s poljima `eracun_sent`, `fiscalization_jir`, `zki`, `client_id`) postoji u bazi, ali **nijedna komponenta je ne čita ni ne piše** — nema `from('invoices')` nigdje u `src`. Modul računa koji se stvarno koristi je `project_invoices` (izlazni računi prema klijentu, `InvoiceDialog.tsx`). Dakle ulaznih računa kao entiteta danas nema.

## 2. Kako korisnik danas unese ulazni eRačun

Tri stvarna puta, svi ručna prepisivanja:

1. **Ručni unos troška** (`AddExpenseDialog` → `ManualExpenseForm`): iznos, opis, kategorija, izvor plaćanja, po želji faza projekta. Bez OIB-a, bez stavki, bez dospijeća.
2. **Skeniranje PDF-a računa kamerom/galerijom** — samo ako korisnik eRačun prvo pretvori u PDF/sliku. AI izvlači iznos, trgovca, datum, PDV, stavke. Najbliže automatizaciji, ali gubi strukturu koju XML već ima i ovisi o AI-ju.
3. **Uvoz bankovnog izvoda** kad račun bude plaćen — trošak nastane tek na dan plaćanja, bez dobavljača, bez dospijeća, bez PDV razrade.

Najmanje bolno danas: skeniranje PDF privitka eRačuna. Ali ništa ne pokriva „imam neplaćeni ulazni račun s dospijećem".

## 3. Procjena posla ako se gradi

Ukupno **6–9 radnih dana**, uz pretpostavku da ostajemo na obveznom UBL setu i ne diramo potpis.

- **Parser UBL 2.1 (1,5–2 dana).** Čisti TS modul (`src/lib/eracun/parseUbl.ts`), `DOMParser` s namespace-aware čitanjem: `cbc:ID`, `IssueDate`, `DueDate`, `AccountingSupplierParty` (naziv + `PartyTaxScheme/CompanyID` = OIB), `AccountingCustomerParty`, `InvoiceLine[]` (naziv, količina, jed. cijena, iznos), `TaxTotal/TaxSubtotal` po stopama, `LegalMonetaryTotal/PayableAmount`, `PaymentMeans/PayeeFinancialAccount/ID` = IBAN, `InvoiceTypeCode`, `DocumentCurrencyCode`. Bez vanjske biblioteke.
- **Mapiranje na model (1–1,5 dana).** Trošak u `expenses` (iznos, datum, opis, `merchant_name` = dobavljač, `business_profile_id`), stavke u `receipt_items`, izbor faze projekta preko postojećeg `MilestoneSelectRow`. OIB dobavljača, IBAN i dospijeće nemaju dom — trebaju ili nova polja ili oživljavanje tablice ulaznih računa (odluka iz točke 4).
- **Duplikati (0,5–1 dan).** Ovdje je lakše nego kod izvoda: par (OIB dobavljača + broj računa) je jedinstven po zakonu → deterministički otisak, isti obrazac kao `importFingerprint.ts` (`imp:<sha256>`) i DB unique index. Postojeći `duplicateDetection.ts` (fuzzy merchant/iznos/datum) služi kao drugi sloj za spajanje s već ručno unesenim troškom.
- **Sučelje za pregled (2–3 dana).** Ponovno se koristi arhitektura koja već postoji: `src/pages/ImportReview.tsx` (684 linija), `importReview/state.ts` reducer, `draft.ts` sessionStorage nacrt, `executor.ts` (494 linije) i `undoBatch.ts` (poništi uvoz). Redak eRačuna ulazi kao `SerializedImportedTx` s klasifikacijom `new` / `auto_merge` / `question`, pa dobiva Undo i batch besplatno. Prilagodba: prikaz stavki, PDV razrade i dobavljača u pregledu.
- **Ostalo (1 dan):** i18n hr/en/de, unos datoteke (`accept=".xml"`), testovi parsera na dva stvarna računa, regresija.

Što se **ne** dodaje: nova edge funkcija (parsiranje je lokalno, XML je deterministički), AI trošak (nula).

## 4. Gdje bi sjelo

Preporuka: **ulazni računi kao vlastiti entitet u biznis modulu**, s uvozom kroz postojeći Import Review ekran.

Razlog: eRačun nije transakcija — on je obveza koja postoji prije plaćanja. Ako ga se odmah upiše kao trošak, saldo novčanika ide u minus na dan izdavanja, a to ruši anchor/reconciliation logiku koja je upravo stabilizirana. Ispravan tok: XML → ulazni račun (neplaćen, s dospijećem) → kad se plati (ručno ili preko uvoza izvoda) → poveže se s troškom.

Alternativa s manje posla: uvoz odmah kao trošak s datumom izdavanja, bez pojma obveze. Brže za ~2 dana, ali gubi dospijeće i pravi razlog zbog kojeg majstor želi eRačune.

## 5. Teško i rizično

- **Digitalni potpis:** predlažem ga **ignorirati** i to izričito zapisati. Provjera XAdES potpisa u pregledniku traži lanac certifikata i FINA root store — to je zaseban projekt. Račun stiže korisniku već filtriran kroz njegovog informacijskog posrednika. Rizik je prihvatljiv jer korisnik ručno bira datoteku.
- **Varijante izdavatelja:** obvezni UBL set je stabilan, ali razlike postoje u tome gdje je OIB (`PartyTaxScheme` vs `PartyLegalEntity/CompanyID`), u zaokruživanju i u tome piše li se popust na razini stavke ili dokumenta. Parser mora čitati po redoslijedu fallbackova i **odbiti tiho pogađanje** — ako `PayableAmount` ne odgovara zbroju stavki, red ide u pitanja, ne u auto.
- **Stavke bez šifri:** nije problem, `receipt_items` ionako ne traži šifru; koristi se `Item/Name`.
- **Valuta ≠ EUR:** `DocumentCurrencyCode` treba čitati i, ako nije EUR, poštovati postojeći multi-currency model (valuta je fiksna po izvoru). Prvi krug: podržati samo EUR, ostalo odbiti s jasnom porukom — bolje nego krivi iznos.
- **Tip dokumenta:** 380 = račun, 381 = odobrenje (negativan predznak), 384/394 = ispravak/avans. Prvi krug: 380 prolazi, 381 prolazi kao negativan, ostalo se odbija uz poruku. Tiho tretiranje storna kao običnog računa je najgori mogući ishod jer duplira trošak.
- **Najveći stvarni rizik:** dvostruko knjiženje kad isti trošak dođe i kao eRačun i kasnije kroz uvoz izvoda. Zato spajanje s izvodom mora ići kroz isti `ImportReview` mehanizam pitanja, ne automatski.

## Tehnički sažetak

Nove datoteke ako se krene: `src/lib/eracun/parseUbl.ts`, `eracunFingerprint.ts`, `eracun/types.ts`, testovi s dva stvarna XML fixtura. Ponovna upotreba: `ImportReview.tsx`, `importReview/{state,draft,executor,undoBatch}.ts`, `duplicateDetection.ts`, `MilestoneSelectRow.tsx`, `receipt_items`. Migracija baze potrebna samo za varijantu s ulaznim računima (tablica + GRANT + RLS + unique index na `(user_id, supplier_oib, invoice_number)`).
