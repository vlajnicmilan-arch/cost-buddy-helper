---
name: Kartični izvod + pravilo tišine
description: Charge-kartični mjesečni izvod prolazi lijevak (doc_type izvod_kartica); niska sigurnost s IBAN+iznosima nikad ne završi u tihom nije_za_nas; obavijest i na prijelaz u na_pregledu
type: feature
---
- `cardStatementSignals(lines)` u `supabase/functions/_shared/mailImport/statementSignals.ts`: signali zaglavlja (`kartica_obavijest_naslov`, `datum_terecenja`, `odobreni_limit`, `racun_namirenja`, `broj_kartice`) broje se ISKLJUČIVO uz ≥3 retka troška (`/dd.mm/EUR/iznos`). Promidžbena kartična poruka bez tablice ne dobiva nijedan signal → ostaje van lijevka.
- Pogodak → `classifyAsStatement().isCardStatement` → `classify.ts` vraća `classification='izvod'`, `docType = CARD_STATEMENT_DOC_TYPE ('izvod_kartica')`. UI grana po `classification='izvod'` (StatementReviewCard), pa nema klijentske posebne obrade.
- PRAVILO TIŠINE: AI odluka „nije za nas" uz `confidence='niska'` NAD tekstom s financijskom supstancom (`carriesFinancialSubstance`: labav IBAN uzorak + ≥3 iznosa) → `nepoznato` + `needsHumanChoice` + warning `mozda_izvod` → status `na_pregledu`. Visoka/srednja sigurnost i dalje smije tiho odbaciti.
- `upsertIngestItem` vraća `previousStatus`; `mail-process` šalje obavijest i push i kad ponovna obrada PODIGNE stavku iz `nije_za_nas` u `na_pregledu` (prije samo `inserted`).
- Čuvar: `src/test/mailCardStatement.test.ts` s doslovnim tekstom iz baze (`src/test/fixtures/otpChargeCardStatement.ts`, anonimizirano samo ime/adresa vlasnika).
