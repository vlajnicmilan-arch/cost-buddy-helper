---
name: Import Fingerprint Dedup
description: Deterministic SHA-256 fingerprint per imported transaction → bank_transaction_id; DB unique index garantira idempotentni re-import
type: feature
---

`src/lib/importFingerprint.ts` — `computeImportFingerprint({userId, paymentSource, date, type, amount, description, merchantName})` → `imp:<sha256>`.

Normalizacija opisa: lowercase, NFD strip diakritike, whitespace collapse. Datum: `YYYY-MM-DD` (kalendarski dan). Iznos: `.toFixed(2)`.

`useExpenseCRUD.importFromCSV` (cloud grana) sada:
- računa fingerprint za svaki red bez `bank_transaction_id`,
- radi `.upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true }).select()`,
- balans ažurira SAMO za stvarno umetnute redove,
- prikazuje stvarno uvezen broj + skipped (`Uvezeno X novih, Y već postoji`).

Backed by postojeći index `uniq_expenses_user_bank_tx(user_id, bank_transaction_id) WHERE bank_transaction_id IS NOT NULL`.

**Zašto:** AI PDF parser vraća različite rezultate za isti izvod (npr. Aircash: 57/48/49 redaka). Bez DB dedupa svaki re-import dodaje neke nove varijante. S fingerprintom je re-import idempotentan — overlap redaka se preskače na DB razini, race condition immune.

Local grana (IndexedDB, `isLocalMode`) trenutno NE koristi fingerprint — koristi je samo offline mode bez Supabase.

Test pokrivenost: `src/lib/importFingerprint.test.ts`.
