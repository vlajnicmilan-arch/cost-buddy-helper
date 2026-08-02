# eRačun (UBL 2.1 XML) — v1, najmanji korisni krug

## Odgovor na pitanje: `pending` NIJE dobro rješenje

Provjerio sam živu definiciju i cron. Dvije tvrde prepreke, ne samo semantika:

1. **`auto_reject_expired_pending_expenses(p_older_than default '24:00:00')`** — svaki `pending` red stariji od 24 h prelazi u `rejected` s razlogom `auto_reject_expired`. Cron `auto-reject-pending-hourly-dryrun` vrti se svaki sat (trenutno `dry_run=true`, ali je to prekidač, ne dizajn). Ulazni račun s dospijećem za 30 dana bio bi odbijen prvi dan.
2. **Nema mjesta za potvrdu.** `usePendingTransactions` filtrira po `income_source_id`, `useProjectPendingTransactions` po `project_id`. Ulazni račun dobavljača nema ni jedno ni drugo → red bi bio nevidljiv, bez ekrana na kojem ga se odobrava.

Uz to je i pojmovno miješanje: `pending` = „čeka odluku vlasnika o tuđem unosu", ne „čeka plaćanje".

**Najjeftinija ispravna alternativa: jedna nova tablica `incoming_invoices`.** Ne dira `expenses`, znači nula rizika za saldo, anchor, reconciliation i sve zbrojeve — po konstrukciji. Kad se račun plati, gumb „Plaćeno" kreira trošak kroz postojeći put s datumom plaćanja. **Dodatni trošak: ~1 dan** (migracija + GRANT + RLS + jednostavan popis). Jeftinije je od pokušaja da se `expenses` nauči razlikovati obvezu od izdatka.

## Opseg v1

- Unos jedne ili više `.xml` datoteka odjednom.
- Parser UBL 2.1 (`src/lib/eracun/parseUbl.ts`, čisti TS + `DOMParser`, bez biblioteke): dobavljač + OIB, kupac + OIB, broj računa, datum izdavanja, dospijeće, stavke, porezna razrada, ukupno, IBAN, `InvoiceTypeCode`, valuta.
- Tipovi: **380 i 394 prolaze kao trošak**, **381 kao negativan**, ostalo odbijeno s jasnom porukom.
- Valuta: samo EUR; ostalo odbijeno s porukom.
- Potpis se ne provjerava (zapisati kao svjesnu odluku).
- Otisak protiv duplikata: `sha256(OIB dobavljača + broj računa)`, DB unique index — deterministički, isti obrazac kao `importFingerprint.ts`.
- Rezultat ide kroz **postojeći ImportReview** (`src/pages/ImportReview.tsx` + `importReview/{state,draft,executor,undoBatch}.ts`) → pregled prije spremanja, batch, Undo besplatno.
- Spremanje: red u `incoming_invoices` (neplaćen). Gumb „Plaćeno" → postojeći put unosa troška, datum = datum plaćanja.

## Procjena: 6–8 dana

| Dio | Dana |
|---|---|
| Parser UBL + testovi na dva stvarna računa | 2 |
| Tablica `incoming_invoices` + RLS/GRANT + dedup index | 1 |
| Uklapanje u ImportReview (unos, klasifikacija, executor grana) | 2 |
| Popis ulaznih računa + „Plaćeno" → trošak | 1,5 |
| i18n hr/en/de, regresija | 0,5–1,5 |

## Svjesno u drugi krug

- Provjera digitalnog potpisa.
- Automatsko spajanje s uvozom izvoda (v1: ručno „Plaćeno"; auto-match duplira rizik dvostrukog knjiženja).
- Valute osim EUR.
- Tipovi 383/384/386 (ispravci, avansi).
- Prijenos stavki u `receipt_items` i razrada PDV-a po stopama u izvještajima.
- Podsjetnici na dospijeće i mail uvoz.

## Tehnički sažetak

Nove datoteke: `src/lib/eracun/{parseUbl,types,fingerprint}.ts` + testovi s dva XML fixtura. Jedna migracija: `incoming_invoices` (supplier_name, supplier_oib, invoice_number, issue_date, due_date, total_amount, vat_amount, currency, iban, doc_type, items jsonb, business_profile_id, paid_expense_id) + GRANT + RLS scoped na `auth.uid()` + `unique(user_id, supplier_oib, invoice_number)`. Ponovna upotreba: ImportReview stack, `duplicateDetection.ts`. `expenses` se ne mijenja.
