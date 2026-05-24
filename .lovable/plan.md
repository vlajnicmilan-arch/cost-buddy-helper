## Problem (potvrđeno iz baze)

Vinkin zadnji uvoz (job `f3f7f80e...`): AI je vratio sve datume u formatu `12.03.26` umjesto `2026-03-12`. JavaScript ne prepoznaje taj format → `Invalid Date` → aplikacija puca pri prikazu liste s porukom "Invalid time value". Tebi je prošlo jer AI nije deterministički i ponekad vrati ispravan format.

## Što mijenjam (3 sloja zaštite)

### 1. Edge funkcija `parse-pdf-statement` — normalizacija
Helper `normalizeDate(s)` prepoznaje i pretvara u `YYYY-MM-DD`:
- `YYYY-MM-DD` (već dobro)
- `DD.MM.YYYY` i `DD.MM.YY` (2-znamenkasta godina → +2000)
- `DD/MM/YYYY` i `DD-MM-YYYY`
- Validacija kroz `Date.UTC` (odbacuje nemoguće datume tipa 31.02.)

Primjena na `t.date`, `t.due_date_override`, `statement_due_date`. Ako transakcija nema valjan datum nakon normalizacije → preskočim je i logiram broj odbačenih.

### 2. Klijent `usePDFParser.ts` — obrana
Helper `safeParseDate` vraća `null` ako datum nije valjan; te transakcije se filtriraju prije nego uđu u listu. Ako baš sve padne → jasna poruka korisniku umjesto crasha.

### 3. UI `GlobalPDFImportHost.tsx` — nikad crash
Zamijenim svih 5 `tx.date.toISOString()` u React `key` propovima s `tx.date.getTime()` (siguran broj). Prikaz datuma kroz `isValidDate(d) ? d.toLocaleDateString() : '—'`.

## Datoteke

- `supabase/functions/parse-pdf-statement/index.ts`
- `src/hooks/usePDFParser.ts`
- `src/components/pdf-import/GlobalPDFImportHost.tsx`
- `src/i18n/locales/{hr,en,de}.json` (1 nova poruka)

## Test

Vitest za `normalizeDate` s realnim stringovima iz Vinkinog joba (`"12.03.26"`, `"05.05.2026"`, `"31.02.26"`, prazno).

## Što NE diram

AI prompt, CSV uvoz, postojeću logiku merge-a s ručnim unosima.
