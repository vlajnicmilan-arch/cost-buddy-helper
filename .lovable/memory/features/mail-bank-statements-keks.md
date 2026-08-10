---
name: KEKS Pay dijalekt izvoda i identitet bez IBAN-a
description: Naslov "IZVOD PROMETA" kao jak signal, početno/završno stanje, account_number fallback, mail_statement_source_map.account_identifier
type: feature
---
- `statementSignals.ts`: novi signali — `izvod_prometa` (JAK, naslov „IZVOD PROMETA (PO RAČUNU)"), prošireno `stanje` (početno/završno/konačno), `retci_sa_saldom` hvata i (datum + iznos + tekuće stanje) bez duguje/potražuje; SLABI: `broj_racuna`, `razdoblje_zaglavlje`. Pravilo ≥2 sidra uz ≥1 jak ostaje.
- Ekstrakcija dobiva `account_number` (`Broj računa <digits>` iz prvih 25 redaka) kao identitet kad IBAN-a nema.
- Pamćenje: `mail_statement_source_map.account_identifier` (NOT NULL, unique s user_id) = IBAN kad postoji, inače broj računa. `account_iban` je sada nullable i samo informativan.
- `StatementReviewCard` prikazuje redak „Broj računa" umjesto IBAN-a kad IBAN-a nema; kvačica „Zapamti" koristi identifier.
- Čuvari: `src/test/mailStatementVeto.test.ts` (KEKS blok + FINA regresija), `mailStatementImport.test.ts`.
