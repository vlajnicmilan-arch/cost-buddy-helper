---
name: Zona izdavatelja na izvodima
description: Identitet izvoda (banka, IBAN, broj računa, razdoblje, saldo) samo iz zaglavlja; prazno umjesto krivog; IBAN svih zemalja
type: feature
---
- `issuerZone(lines)` u `supabase/functions/_shared/mailImport/statementSignals.ts` reže tekst PRIJE prvog retka prometa (zaglavlje tablice ili datum+iznos). Fallback 25 redaka, strop 60. Sva ekstrakcija identiteta čita SAMO tu zonu — protustrana iz retka („Primatelj: Pbz7bauhaus") više ne može postati banka.
- `detectBankName(zoneText, subject?)`: rječnik poznatih banaka; naslov e-maila je SAMO razrješavatelj višeznačnosti (dva kandidata u zoni), nikad samostalni izvor. Bez pogotka → `null`. Prazno je ispravan ishod, pogađanje nije.
- IBAN: `findValidIbans` hvata IBAN bilo koje zemlje (`[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}`, BEZ `i` flaga — mala slova su rečenica oko IBAN-a, ne IBAN). Mod-97 je jedini sudac. `detectHeaderIban` gleda zonu + blokove označene „IBAN"/„BIC" (Revolut ga tiska u zasebnom bloku niže).
- Hrvatski datumi s imenom mjeseca: `parseCroatianWordDate` („2. srpnja 2025.", „10. kol 2026."). `detectPeriodRange` (izričito „od … do …" ili „dd.mm.gggg. - dd.mm.gggg.") ima prednost nad rasponom svih datuma.
- Završni saldo: `detectSummaryClosingBalance` čita redak „Ukupno"/„Račun" iz „Sažetka salda" pod stupcem „Završni saldo" prije općeg traženja.
- Čuvari: `src/test/mailStatementIssuerZone.test.ts` (doslovni tekst iz baze u `src/test/fixtures/revolutStatementHeader.ts`), uz postojeći `mailStatementVeto.test.ts`.
