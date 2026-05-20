## Cilj

Spriječiti ponavljanje cijelog parse pipeline-a (PDF→base64→edge job→AI→preview dialog) kad korisnik odabere izvod koji je već uvozio. Detekcija se događa **prije** slanja na parser.

## Strategija

Dvoslojni hash izračunat u browseru:
1. **File hash** (SHA-256 sirovih bytes) — instant, hvata identične downloade.
2. **Content hash** (SHA-256 normaliziranog teksta nakon PDF/HTML ekstrakcije) — fallback, hvata iste izvode s različitim PDF metadatima.

Provjera ide redom: file hash → ako miss, parse → content hash → ako miss, nastavi normalno.

Pri pogotku: **soft warning** dialog s podacima starog importa (datum, broj transakcija) i opcijom "Ipak nastavi" koja preskače guard.

## DB promjene (migracija)

Nova tablica `imported_statements`:
- `user_id`, `payment_source_id`
- `file_hash` text, `content_hash` text (oba nullable, jedan UNIQUE per user)
- `file_name`, `file_size`, `mime_type`
- `transactions_count`, `import_batch_id` (FK ka prvom expenseu tog batcha, soft)
- `imported_at`

Indeksi: `UNIQUE (user_id, file_hash)` partial WHERE file_hash IS NOT NULL, isto za `content_hash`. RLS: vlastiti redovi (`auth.uid() = user_id`).

## Backfill

SQL migracija za postojeće `expenses` s `import_batch_id IS NOT NULL`:
- Grupiranje po `(user_id, import_batch_id)`.
- Pseudo-content-hash = SHA-256 sortiranog spoja `fingerprint`-ova (već postoje od ranije) ili `bank_transaction_id`-jeva.
- INSERT u `imported_statements` s `file_hash = NULL`, `content_hash = <pseudo>`, `imported_at = MIN(created_at)`.

Aproksimacija je dovoljna jer pri novom uploadu izračunamo content_hash iste forme nakon parsiranja i match-amo na to.

## Frontend promjene

**Novi helper** `src/lib/statementFingerprint.ts`:
- `computeFileHash(file: File): Promise<string>` — `crypto.subtle.digest('SHA-256', arrayBuffer)`.
- `computeContentHash(transactions: ParsedTransaction[]): Promise<string>` — sortirani join `date|amount|type|normalizedDesc`, pa SHA-256. Identično formuli koju koristi backfill.
- `findExistingStatement(userId, sourceId, { fileHash?, contentHash? })` — query `imported_statements`.

**`GlobalPDFImportHost.tsx`** (oba grana, PDF i HTML):
1. Prije `startPDFParseJob` / `parseHTML`: izračunaj file hash, pozovi `findExistingStatement`. Ako hit i nije set "force" flag → otvori `DuplicateStatementDialog`, prekini.
2. Nakon successful parse (prije `_setPreview`): izračunaj content hash, ponovi check. Ako hit → isti dialog.
3. Pri stvarnoj kreaciji transakcija (`importFromCSV` callsite) — INSERT u `imported_statements` s oba hash-a i počistii `force` flag.

**Novi komponent** `DuplicateStatementDialog.tsx`:
- Naslov: `statementDuplicate.title`
- Body: "Ovaj izvod je već uvezen DD.MM.YYYY (N transakcija). Želite li ponovo uvesti?"
- Akcije: `Otkaži` (default), `Ipak nastavi` (postavlja `forceImport` u context, ponovo trigger pendingPdf flow).

**`PdfImportContext`** dobiva `forceImport: boolean` flag koji guard preskače pri sljedećem pokušaju, resetira se nakon completion.

## i18n

Novi ključevi pod `statementDuplicate.*` u `hr/en/de`:
- `title`, `descriptionWithCount`, `cancel`, `continueAnyway`, `previouslyImportedOn`.

## Tehnički detalji

```text
File selected
  │
  ├─ computeFileHash(file)
  ├─ findExistingStatement(userId, sourceId, fileHash)
  │    └─ HIT → DuplicateStatementDialog → cancel / force
  │
  ├─ startPDFParseJob(base64) ──> edge function
  │
  ├─ result received
  ├─ computeContentHash(result.transactions)
  ├─ findExistingStatement(userId, sourceId, contentHash)
  │    └─ HIT → DuplicateStatementDialog → cancel / force
  │
  ├─ _setPreview → korisnik klikne "Uvezi N"
  ├─ importFromCSV (postojeća logika + row-level fingerprint dedup ostaje)
  └─ INSERT imported_statements (fileHash, contentHash, count, batchId)
```

Row-level fingerprint dedup u `importFromCSV` **ostaje netaknut** kao druga linija obrane (npr. za pojedinačne CSV-ove ili force-ane importe).

## Što ostaje nepromijenjeno

- `importFromCSV`, `computeImportFingerprint`, `uniq_expenses_user_bank_tx`.
- Edge funkcija za PDF parsing.
- UI tijek odabira payment sourcea i preview dialog.

## Test scope (vitest)

- `computeContentHash` — determinističnost (isti unos u različitom redoslijedu → isti hash), normalizacija opisa, stabilnost preko 3 jezika.
- Backfill SQL kao manual SQL spec u migraciji (komentar).
