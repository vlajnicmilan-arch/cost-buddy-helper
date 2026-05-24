# Popravak detekcije duplikata kod uvoza izvoda — koraci A–E

Cilj: ponovni upload istog ili sličnog PDF/CSV izvoda mora prepoznati već unesene transakcije i ne kreirati duplikate. Korisnik u preview-u jasno vidi što je novo, što je već postojeće (potvrđeno bankom), a što suspicious.

Redoslijed je važan: A i B su brzi UX/logički popravci koji odmah rješavaju glavnu pritužbu. C i D dodaju "hard" obranu na razini cijelog fajla. E čisti zatečeno stanje.

---

## Korak A — Preview UI: `suspicious` se tretira kao duplikat

**Problem (verificirano):** `findDuplicates` već vraća `suspiciousDuplicates`, ali `ImportPreviewDialog` ih trpa u "unique" bucket pa korisnik vidi 36 "novih" umjesto 27 detektiranih.

**Što radim:**
- U `ImportPreviewDialog` (i HTML/PDF varijantama) `suspicious` retke prikazati u istoj sekciji kao `fuzzyDuplicates`, sa zasebnom oznakom "Vjerojatno postoji" (žuto) vs "Pronađen duplikat" (crveno).
- Defaultno **isključene** iz importa (checkbox unchecked), kao i fuzzy.
- Brojač "X od Y bit će uvezeno" mora odgovarati stvarnoj selekciji.
- i18n: `import.preview.suspicious.*`.

**Bez DB izmjena.**

---

## Korak B — Stabilan per-row fingerprint (merchant, ne description)

**Problem (verificirano):** `computeImportFingerprint` koristi `description` koji AI parser na drugom uploadu ispisuje drugačije ("CAFFE BAR ABC" vs "Caffe bar ABC 1234 Zagreb"), pa hash više ne pogađa.

**Što radim:**
- U `src/lib/importFingerprint.ts`: prioritet **`merchant_name`** (normalizirano: lower + unaccent + trim + sažeti whitespace, bez brojeva > 3 znamenke i grada na kraju). Fallback na `description` samo ako merchant nedostaje.
- Isti normalizator koristiti u `findDuplicates` (`duplicateDetection.ts`) za "merchant overlap" provjeru, da fuzzy razina također radi nad istim normaliziranim merchantom (rješava korisnikovu primjedbu da app gleda opis a ne trgovca).
- Dodati vitest pokrivenost (slijedi pravilo "bug → ekstrahiraj helper → test"): isti merchant u 3 varijante mora dati isti fingerprint.

**Bez DB izmjena.** Stari hashovi ostaju funkcionalni (`bank_transaction_id` LIKE prefix se ne lomi); novi uploadi proizvode stabilnije hashove.

---

## Korak C — File hash (hard dedup na razini cijelog fajla)

**Problem (verificirano):** Svi `imported_statements.file_hash` su NULL — kod nikad ne računa SHA-256 fajla u stvarnom flow-u.

**Što radim:**
- U `GlobalPDFImportHost` i CSV import host: prije parsiranja izračunati SHA-256 sadržaja fajla (Web Crypto `crypto.subtle.digest`), spremiti u `fileHashRef`.
- Prije pokretanja parsea: query `imported_statements` za `(user_id, file_hash)`. Ako postoji → preview pokazuje "Ovaj izvod je već uvezen DD.MM.YYYY (X transakcija). Želiš li svejedno nastaviti?" s gumbom "Prikaži postojeći batch" i "Nastavi svejedno".
- Pri završnom inserte upisati `file_hash` u `imported_statements`.

**DB:** nema migracije — kolona `file_hash` već postoji. Dodaje se samo partial index za brzu pretragu:
```sql
CREATE INDEX IF NOT EXISTS idx_imported_statements_user_filehash
  ON imported_statements(user_id, file_hash) WHERE file_hash IS NOT NULL;
```

---

## Korak D — Fuzzy match izvoda po sadržaju (content_hash)

**Problem:** Korisnik downloada isti izvod 5 dana kasnije — fajl je novi (drugačiji timestamp/metadata u PDF-u) pa file hash ne pogađa, ali sadržaj (90%+ transakcija) je isti.

**Što radim:**
- Nakon parsea, prije insertea: izračunati `content_hash` = SHA-256 sortiranih per-row fingerprintova (isti princip koji već koristi `backfill_import_fingerprints`).
- Query `imported_statements` za isti `(user_id, payment_source_id, content_hash)`. Ako postoji → ista UX poruka kao u C.
- Dodatno: ako se 80%+ fingerprintova preklapa s nekim postojećim batchom (čak i kad content_hash nije identičan), pokaži warning "X od Y transakcija već postoji u izvodu od DD.MM.YYYY".

**DB:** `content_hash` već postoji. Dodaje se index:
```sql
CREATE INDEX IF NOT EXISTS idx_imported_statements_user_contenthash
  ON imported_statements(user_id, content_hash);
```

---

## Korak E — Data cleanup (jednokratna migracija)

**Problem (verificirano):** mnogi postojeći redci već imaju `bank_transaction_id` ali `bank_match_status='manual'` (nedosljedno).

**Što radim:**
- Migracija koja izvrti `backfill_import_fingerprints()` (već postoji) — popunjava fingerprintove na starim manual unosima.
- Dodatni UPDATE: za sve retke s `bank_transaction_id IS NOT NULL AND bank_match_status='manual' AND import_batch_id IS NOT NULL` → postavi `bank_match_status='confirmed'`.
- Sve unutar jedne migracije, idempotentno.

---

## Što NE diramo

- AI parser/Gemini prompt — nedeterminizam ostaje, ali B+C+D ga čine bezopasnim.
- `ignoreSameDayDuplicateGuard` ostaje `true` (legitimne 2× kava istog dana). Korak A rješava UX.
- `unmerge_import_row` RPC i postojeća manual-merge logika ostaju netaknute.

---

## Tehnički detalji (sažeto)

**Datoteke koje se mijenjaju:**
- `src/lib/importFingerprint.ts` — merchant-first normalizacija (+ test)
- `src/lib/duplicateDetection.ts` — isti normalizator za merchant overlap (+ test)
- `src/components/ImportPreviewDialog.tsx` — suspicious bucket
- `src/components/GlobalPDFImportHost.tsx` + CSV pandan — file hash + content hash check
- `src/contexts/PdfImportContext.tsx` — preview stanje za "već uvezen" upozorenje
- `src/i18n/locales/{hr,en,de}.ts` — `import.preview.suspicious.*`, `import.preview.alreadyImported.*`
- 1 migracija (2 indeksa + backfill + status fix)

**Rizici:**
- Korak B mijenja semantiku fingerprinta → mogući false-negative dedup između starih (description-based) i novih (merchant-based) redaka. Mitigacija: korak E backfill izračuna nove hashove na starim podacima.
- Korak C/D upozorenje smije imati "Nastavi svejedno" da korisnik nije nikad blokiran ako stvarno treba re-import.

---

## Redoslijed izvođenja

1. A (UI, najbrža pobjeda)
2. B (stabilan hash + testovi)
3. C (file hash)
4. D (content hash)
5. E (cleanup migracija)

Nakon svakog koraka — provjera u browseru s konkretnim PDF-om koji je već dva puta dignut.