# Prilozi u backup — brojke i prijedlog

## 1. Koliko toga ima (upit nad `storage.objects`, danas)

| Bucket | Datoteka | Veličina | Zadnja izmjena |
|---|---|---|---|
| receipts | 52 | 123 MB | 8.4.2026 |
| project-documents | 1 | 128 kB | 15.7.2026 |
| invoice-pdfs | 1 | 184 kB | 18.5.2026 |
| certificates | 0 | 0 | — |
| **Ukupno (korisnički prilozi)** | **54** | **~124 MB** | |

Za usporedbu, izvan opsega zadatka: `public-assets` 23 datoteke / 220 MB (statične slike aplikacije, ne korisnički podaci), `email-assets` 1 / 13 kB, `backups` 126 / 886 kB (postojeći CSV backupi).

Zaključak: količina je mala (~124 MB, 54 datoteke), nije riječ o gigabajtima. Puna kopija je izvediva, ali svejedno predlažem inkrementalno jer bi 8 tjedana × puna kopija = ~1 GB bez ikakve koristi (datoteke se ne mijenjaju).

## 2. Prijedlog snimanja — inkrementalno s dijeljenim spremištem

- Datoteke se spremaju u **jedno zajedničko spremište** `backups/_files/<bucket>/<put>` — jedna kopija po datoteci, ne po tjednu.
- Svaki tjedan funkcija izlista `storage.objects` po bucketu i kopira samo ono čega u spremištu **nema** ili čiji se `updated_at`/veličina razlikuje od zapisa u prošlom manifestu.
- Tjedni folder `backups/YYYY-MM-DD/` i dalje drži CSV tablice **plus** `manifest.json` koji nabraja sve datoteke tog tjedna s putanjom u spremištu. Tako je svaki tjedni snimak potpun logički popis, bez dupliciranja bajtova.
- **Retencija:** postojeće brisanje foldera starijih od 8 tjedana ostaje netaknuto za CSV-ove. Spremište `_files/` se čisti zasebno: datoteka se briše samo ako se ne pojavljuje ni u jednom manifestu unutar zadnjih 8 tjedana (tj. izvorno je obrisana prije više od 8 tjedana). Prefiks `_files` ne odgovara uzorku `YYYY-MM-DD` pa ga postojeći `pruneOldFolders` neće dirati.
- Bucketi koji se snimaju: `receipts`, `certificates`, `project-documents`, `invoice-pdfs` (iz `STORAGE_BUCKETS`). `public-assets` i `email-assets` se ne snimaju — to su statična sredstva aplikacije, ne korisnički podaci.

## 3. Vrijeme izvršavanja

Edge funkcija ima ograničenje trajanja (redoslijeda nekoliko minuta) i memorije (~150 MB), pa se cijelih 124 MB ne smije držati u memoriji. Mjere:

- Prijenos ide **datoteka po datoteka**, streamom (download → upload), nikad sve odjednom.
- **Proračun po pozivu:** funkcija radi dok ne prijeđe ~100 s zidnog vremena ili ~200 MB prenesenih bajtova, zatim staje i vraća `partial: true` s brojem preostalih datoteka. Preostalo dohvaća sljedeći poziv (sljedeći tjedan ili ručno).
- Prvi tjedan je jedini skup (~124 MB); nakon toga se kopira samo novo, obično nekoliko MB.
- Redoslijed: prvo CSV tablice (brzo, kritično), pa datoteke — ako datoteke ne stignu, tablični backup je i dalje potpun.

## 4. Manifest

Uz svaki tjedni folder nastaje `backups/YYYY-MM-DD/manifest.json`:

```text
{
  created_at, folder, partial,
  tables:  [{ table, rows, bytes, ok, error? }],        // već postoji, seli u manifest
  buckets: [{ bucket, files, bytes }],
  files:   [{ bucket, path, size, updated_at,
              sha256, stored_at, copied_this_run }],
  totals:  { tables, rows, files, bytes },
  errors:  [...]
}
```

Kontrolni zbroj: SHA-256 računa se nad bajtovima pri kopiranju (`crypto.subtle.digest`); za datoteke koje se ne kopiraju ponovno preuzima se iz prošlog manifesta. Manifest se sprema i nekomprimiran radi ručnog pregleda.

## Tehnički opseg

Mijenja se **samo** `supabase/functions/backup-weekly/index.ts`:
- import `STORAGE_BUCKETS` iz `../_shared/tablesToPurge.ts`;
- nove funkcije `listBucketObjects`, `copyFile`, `sha256Hex`, `readPreviousManifest`, `pruneOrphanFiles`;
- zapis `manifest.json`;
- proširen `app_diagnostics_logs` unos s brojem datoteka i `partial` zastavicom.

Bez izmjena podataka, politika, trigera, izračuna i sučelja. Bez migracija.
