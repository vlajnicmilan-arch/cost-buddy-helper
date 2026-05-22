## Cilj

Omogućiti da ponovni upload starih bankovnih izvoda (poput siječanjskog Aircash PDF-a) bude prepoznat kao već uvezen, isto kao što već radi za sve uvoze nakon ~9.4.2026.

## Što je trenutno problem

Provjerio sam tvoju bazu:

- **Veljača/ožujak (139 transakcija)** — imaju `import_batch_id` ali **nemaju `bank_transaction_id`** (fingerprint), i nemaju zapis u `imported_statements`.
- **Siječanj (26 transakcija na izvoru `385b0fe5…`)** — **nemaju ni `import_batch_id` ni fingerprint**. Vjerojatno uvezene još starijim flowom ili kombinacijom ručnih unosa.
- `imported_statements` ima 5 zapisa, svi `file_hash = NULL`, zadnji 9.4.2026.

Dva guarda postoje:

1. **Statement-level** (`file_hash` / `content_hash` u `imported_statements`) — guard koji si vidio danas. Nije pronašao siječanj jer nema zapisa.
2. **Row-level** (`bank_transaction_id` UNIQUE) — drugi sloj zaštite. Ne radi za siječanj jer postojeći redovi imaju `NULL` u toj koloni → svi novi redovi bi prošli kao "novi".

Bez popravka, ponovni upload siječanjskog PDF-a bi **dodao 26 duplikata u bazu i duplo udario po saldu**.

## Plan

### 1. Migracija — backfill funkcija

Napravim PL/pgSQL funkciju `backfill_import_fingerprints(p_user_id uuid)` koja:

- Za svaki `expenses` red bez `bank_transaction_id`, koji ima `payment_source` (custom: ili income source) i datum, izračuna deterministički fingerprint `imp:<sha256>` po istoj formuli kao `src/lib/importFingerprint.ts` (`user|source|YYYY-MM-DD|type|amount.toFixed(2)|normalized_description`).
- Normalizacija opisa u SQL-u: `lower(regexp_replace(unaccent(coalesce(description,'')), '\s+', ' ', 'g'))`.
- Upiše ga u `bank_transaction_id`. Ako bi nastao konflikt s postojećim UNIQUE indexom (rijetko — dva identična reda u istom danu), drugom redu doda suffix `#2`, `#3`… (već postojeća logika iz `csvParsers.ts` se reflektira).

Pokrene se odmah za sve korisnike kao jednokratni `SELECT backfill_import_fingerprints(user_id) FROM …`. Idempotentno — preskače redove koji već imaju fingerprint.

### 2. Migracija — zapis u `imported_statements`

Za svaku grupu `(user_id, payment_source, import_batch_id)`:

- Izračuna `content_hash = sha256(sorted(bank_transaction_id) joined with '|')` (ista formula kao `statementFingerprint.ts`).
- Upsert u `imported_statements` s `content_hash`, `transactions_count`, `import_batch_id`, `imported_at = MIN(date_of_entry)`. `file_hash` ostaje NULL (legacy).

Za siječanjske transakcije bez batch ID-a:

- Grupiraj po `(user_id, payment_source, ime_mjeseca = to_char(date,'YYYY-MM'))` i tretiraj kao sintetički batch.
- Generiraj novi `import_batch_id` (gen_random_uuid), upiši na te redove, te kreiraj `imported_statements` zapis za njih.

Ovo je glavni korak — nakon ovoga, ponovni upload siječanjskog PDF-a će:

- **Content hash match** → `findExistingStatement` vraća pogodak → guard radi.
- Ako korisnik svejedno klikne "Uvezi ponovno" → row-level dedup po `bank_transaction_id` preskoči sve duplikate.

### 3. Bez izmjena u frontend kodu

Postojeća `findExistingStatement` + `recordImportedStatement` + `useExpenseCRUD.importFromCSV` već rade ispravno. Ne treba mijenjati TypeScript kod.

### 4. Testovi

Dodam regresijski test u `src/lib/importFingerprint.test.ts` koji potvrđuje da SQL normalizacija opisa (lowercase + unaccent + collapse whitespace) daje identičan hash kao TS verzija za par realnih primjera. (Test ostaje pure — ne udara u bazu, samo dokumentira ugovor.)

## Sigurnost i rollback

- Sve promjene su backfill (postavljanje NULL → vrijednost). Nema brisanja, nema izmjene iznosa, nema promjene saldova.
- Ako nešto pođe po zlu, rollback je `UPDATE expenses SET bank_transaction_id = NULL WHERE bank_transaction_id LIKE 'imp:%' AND created_at < '<cutoff>'` — fingerprint je jasno označen prefiksom.
- Funkcija je idempotentna i siguran je `re-run`.

## Što NE dirajmo (potvrđeno već radi)

- Statement upload flow (`GlobalPDFImportHost`, `CSVImportDialog`) — ne mijenjamo.
- `importFromCSV` upsert logika — radi kako treba.
- `unmerge_import_row` RPC i merge logika — neovisno o ovome.

## Pitanje za potvrdu prije migracije

Hoćeš li da backfill izvršim **samo za tebe** (`user_id = 3213303b-6267-4188-8dc9-2bb2a5c3c672`) kao test, pa tek nakon što potvrdiš da Aircash siječanj sad odbija ponovni upload — pokrenemo za sve korisnike? Ili odmah za sve?
