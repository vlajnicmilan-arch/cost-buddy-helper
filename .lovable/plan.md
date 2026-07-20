# Korak 4 — executeDecisions(decisions)

Prvi korak koji stvarno piše u `expenses`. Cilj: idempotentno, atomično-po-retku, s jasnim izvještajem i tragom za rollback.

## 1. Ulaz
`ImportDecisions` iz review ekrana + `ImportReviewPayload` (rows + fingerprinti + manualCandidates).
Filtriranje prije izvršenja:
- Preskoči redove s `classification.kind === 'new' && existsByFingerprint` (FP-hit — već u bazi).
- Preskoči `newRows[index] === false` i `autoMerge[index] === false`.
- Za `question` uzmi `questions[index]` (merge → manualId; new → insert; null → BLOKIRAJ izvršenje, gate iz 3b to već sprječava).
- Pending rows: filtrirani još u Koraku 3b (`GlobalPDFImportHost` prije `classifyImport`) — potvrđeno, executor ih ne vidi.

## 2. Izvršenje po kanti

Jedan `import_batch_id = crypto.randomUUID()` za cijeli run.

**MERGE** (auto-spoji + question→merge):
- `UPDATE expenses SET bank_transaction_id=<fp>, bank_match_status='confirmed', import_batch_id=<batch>, merchant_name=COALESCE(<bank_merchant>, merchant_name) WHERE id=<manualId> AND user_id=<uid> AND bank_transaction_id IS NULL`
- **AMOUNT SE NE DIRA.** Ni `date`, ni `type`, ni `category`, ni `payment_source`.
- Race-guard `.is('bank_transaction_id', null)` — ako je 0 redaka pogođeno, tretiraj kao "već spojeno" (skipped_merged, ne error).

**NEW** (question→new + newRows):
- Batch `upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true }).select('id')` — isti pattern kao postojeći `importFromCSV` cloud path.
- `bank_transaction_id = fingerprint`, `bank_match_status = 'imported'`, `import_batch_id = batch`.
- Broj vraćenih redaka = stvarno insertano; razlika prema poslanom = skipped_duplicate (UNIQUE brava).

Izvršava se sekvencijalno: MERGE prvi (per-row), zatim NEW (bulk upsert). Nema DB transakcije preko network granice — oslanjamo se na idempotenciju (točka 3).

## 3. Atomičnost / prekid mreže — **odgovor**

Nema prave transakcije (edge → PostgREST je per-request). Umjesto toga: **idempotentnost je ugovor**.

- Ista `decisions` + isti PDF → isti fingerprinti → ponovni upsert preskače sve što je već upisano (UNIQUE `(user_id, bank_transaction_id)`).
- Merge race-guard `bank_transaction_id IS NULL` znači: red koji je već spojen u prvom pokušaju drugi put vraća 0 pogođenih → tretira se kao skipped_merged, ne greška.
- Draft (sessionStorage) ostaje živ dok korisnik ne dobije "success" izvještaj. Ako executor pukne na pola:
  - Prikaži djelomični izvještaj (X uspješno, Y neuspješno + error) + gumb "Pokušaj ponovno".
  - Ponovno pokretanje s istim `decisions` je sigurno — završava samo ono što je preostalo.
- **Isti `import_batch_id` kroz retryje** (spremi u draft nakon prvog pokušaja) → cijeli logički uvoz ima jedan trag u bazi.

## 4. Izvještaj korisniku

Nakon završetka: `StatusFeedback` toast + kratki summary dialog:
- ✅ Spojeno: `merged` (X ručnih unosa označeno kao provjereno bankom)
- ➕ Novo: `inserted`
- ⏭️ Preskočeno (već postoji): `skipped_duplicate + skipped_merged`
- Trajanje: `Xs`
- `import_batch_id` (za support)

Koristimo postojeći `ImportMeta` pattern (`onMeta` callback u `_runImport`) — proširiti s `skipped_merged` i `durationMs`.

## 5. IMPORT_FROZEN — kirurško otključavanje — **odgovor**

**Uklanjam globalni flag, uvodim per-path guardove** (čišće od jedne zastavice s iznimkama):

- Obriši `IMPORT_FROZEN` konstantu i `_runImport` guard u `PdfImportContext`.
- `ImportReview.tsx` "Potvrdi uvoz" — zove `executeDecisions` (novi path), briše frozen granu.
- `CSVImportDialog.tsx:279` — zamijeni `IMPORT_FROZEN` provjeru s lokalnim `CSV_IMPORT_ENABLED = false` (isti UX, ali eksplicitno vezano samo za CSV).
- `useManualBankMerge.ts:27` — isti pattern: `MANUAL_MERGE_ENABLED = false`.
- Toast poruke za CSV/merge ostaju iste ("privremeno onemogućeno"), ali korisnik razumije da PDF/HTML rade.

Kad CSV/merge dobiju svoj review flow (buduće korake), samo se flipa lokalna zastavica.

## 7. Rollback priča — **odgovor**

Puni "Undo import" gumb je van opsega Koraka 4 (velik: treba re-created state manualnih redaka prije mergea + soft-delete integracija + UI). **Minimalno u ovom koraku:**

- Svaki dirnut red ima `import_batch_id` → ručni SQL rollback je 2 upita:
  - `UPDATE expenses SET bank_transaction_id=NULL, bank_match_status=NULL, import_batch_id=NULL WHERE import_batch_id=<X> AND bank_match_status='confirmed'` (un-merge)
  - `DELETE FROM expenses WHERE import_batch_id=<X> AND bank_match_status='imported'` (novi redovi)
- `import_batch_id` prikazan korisniku u summary dialogu → može ga poslati supportu.
- U diagnostici (`import_executed` event) batch_id je uvijek prisutan.

Puni Undo UI → zaseban korak nakon što potvrdimo da executor radi stabilno u produkciji.

## 6. Telemetrija
`logDiagnostic('import_executed', { batch_id, source_id, merged, inserted, skipped_duplicate, skipped_merged, duration_ms, decisions_total })`. Uz postojeće `global_pdf_import_*` evente.

## 8. Testovi
- **Unit** (`executeDecisions.test.ts`):
  - MERGE ne dira `amount/date/type/category/payment_source`.
  - MERGE race-guard: drugi poziv na isti red vraća skipped_merged, ne error.
  - NEW koristi fingerprint iz decisions (ne izračunava ga ponovno).
  - Idempotentnost: dvostruki poziv s istim `decisions` → drugi poziv 0 inserted, 0 merged, sve skipped.
  - FP-hit new stavke se preskaču bez network poziva.
- **Integracijski** (`importExecutorFlow.test.tsx`):
  - Mock Supabase → simuliraj review payload s 2 merge + 3 new + 1 FP-hit → executor izvrši → provjeri poziv counts i `ImportMeta`.
  - Simuliraj network fail nakon 1. merge → retry završi ostatak.

Cilj: `npx vitest run` → EXIT 0.

## Redoslijed implementacije (kad Milan potvrdi)
1. `src/lib/importReview/executor.ts` — čista funkcija (supabase client + decisions + payload → `ImportMeta`).
2. Unit testovi executora (TDD).
3. Wiring u `ImportReview.tsx` "Potvrdi uvoz".
4. Uklanjanje `IMPORT_FROZEN` + per-path guardovi (CSV/merge).
5. Integracijski test + ažuriranje `pdfImportContextFreeze.test.tsx`.
6. Deploy verifikacija (nema edge changes — sve klijentski).

Čekam OK.
