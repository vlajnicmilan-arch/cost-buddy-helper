---
name: Bankovni izvodi mailom
description: Veto klasifikacije `izvod`, kartica izvoda, most na postojeći uvoz izvoda, pamćenje IBAN → novčanik
type: feature
---
- **Veto (korak 2b)**: `supabase/functions/_shared/mailImport/statementSignals.ts` (`classifyAsStatement`) trči u `classify.ts` PRIJE determinističke heuristike. ≥2 sidrena signala uz barem 1 JAK → `classification='izvod'`. `iban_zaglavlje` je SLAB signal (ima ga svaki račun) — sam ne stvara ni sumnju. Točno 1 jak signal → `nepoznato` + warning `mozda_izvod` (nikad tiho `racun`).
- Izvod NIKAD ne troši AI dopunu: `needsAiEnrichment(..., classification)` vraća false za `izvod`. Ekstrakcija nosi samo bank_name/account_iban/statement_number/period_from/period_to/closing_balance — nikad polja računa.
- `document_ingest_items` NEMA CHECK na `classification` (samo status/source/scope_type), pa `izvod` ne traži migraciju sheme.
- **Kartica**: `src/components/mail/StatementReviewCard.tsx` (grana u `MailReviewList` prije polja računa). Nema „Potvrdi" u eRačune — samo izbor novčanika i „Uvezi izvod".
- **Most**: `src/hooks/useStatementImport.ts` preuzme privitak iz buketa `inbound-mail`, zamota u `File` i preda POSTOJEĆEM `startPdfImport`. Nikakvo novo parsiranje. Otisak (`findExistingStatement`) provjerava se PRIJE otvaranja uvoza; „Uvezi ipak" šalje `forceImport`.
- Završetak uvoza javlja `GlobalPDFImportHost` kroz CustomEvent `vm:pdf-import-completed` (iz `persistStatementRecord`); kartica tada stavku prebacuje u status `povezan`.
- **Pamćenje**: tablica `mail_statement_source_map` (user_id + account_iban unique). Pravilo nastaje SAMO uz izričitu kvačicu. Prijedlog: `bank_accounts.linked_payment_source_id` ima prednost nad ručnim pamćenjem. Zaborav: Postavke → Uvoz iz e-maila → „Računi s izvoda" (`StatementSourcesSection`, sekcija `statementSources`).
- Čuvari: `src/test/mailStatementVeto.test.ts`, `src/test/mailStatementImport.test.ts`.
- **Zatvaranje kruga (kolovoz 2026)**: veza kartica → uvoz živi u localStorage (`src/lib/mail/statementImportLink.ts`, TTL 24 h) i razrješava je GLOBALNI `useStatementLinkResolver` (montiran u `MailRealtimeHost`) na `vm:pdf-import-completed` → status `povezan`. Preživljava navigaciju, pad i nastavak skice; pad/odustajanje ne označavaju ništa. Čuvari: `src/test/mailStatementLink.test.ts`, `src/test/mailStatementLinkResolver.test.tsx`.
- „Moji izdavatelji" i „Računi s izvoda" su `CollapsibleSection` (zatvoreno, broj u naslovu). IBAN novčanika prikazuje `WalletAccountIdentifier` na kartici izvora.
