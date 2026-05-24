## Cilj

Korisnik više ne smije biti uplašen žutim "Vjerojatno postoji" upozorenjem za redove koje će sustav ionako tiho i sigurno spojiti. Dijalog mora jasno reći: "ovo je već riješeno, ne brini" vs "ovdje stvarno trebam tvoju odluku".

## Što se trenutno događa (potvrđeno iz koda)

- `findDuplicates` (`src/lib/duplicateDetection.ts`) → puni žute "Vjerojatno postoji" sekcije.
- `matchManualToImported` (`src/lib/manualMatchForImport.ts`) → pokreće se TEK nakon klika "Uvezi" i tiho spaja izvod-red u postojeći ručni unos po vrlo strogim kriterijima: isti payment_source + isti type + isti iznos + ±1 dan + točno 1 kandidat.

Ta dva sustava ne razgovaraju. Zato korisnik vidi `BIO&BIO Split` kao "vjerojatni duplikat" iako će se on automatski spojiti u njegov `Kupovina namirnica` unos.

## Prijedlog UX-a (najjednostavniji za korisnika)

Dijalog "Pronađeni duplikati" dobiva **3 sekcije** umjesto današnje 2:

```text
┌─────────────────────────────────────────────┐
│ 28 transakcija već postoji u bazi           │
│ 8 novih transakcija je spremno za uvoz      │
├─────────────────────────────────────────────┤
│ ✅ Automatski spojeno s tvojim unosima (N)  │  ← NOVO, zeleno, collapsed
│    "Ove ćemo tiho pripojiti tvojim ručnim   │
│    unosima — iznos, datum i račun se        │
│    poklapaju."                              │
│    [Prikaži popis ▾]                        │
├─────────────────────────────────────────────┤
│ 🚫 Sigurni duplikati (isti datum i iznos)   │  ← postojeće, ali samo PRAVI duplikati
│    (samo ako već postoji bank_only red s    │
│    istim fingerprintom — neće biti merge-an)│
├─────────────────────────────────────────────┤
│ ❓ Trebamo tvoju odluku (M)                  │  ← postojeće "Vjerojatno postoji"
│    Ovdje ima više kandidata ili se račun    │
│    ne poklapa — ti odluči.                  │
└─────────────────────────────────────────────┘
```

Ključno:
- Auto-merge sekcija je **bez checkboxa** — to nije izbor, to je informacija.
- Žuta sekcija sadrži SAMO redove koje `matchManualToImported` označi kao `ambiguous` (2+ kandidata) ili koje `findDuplicates` označi kao fuzzy ali nemaju 1:1 manual match (npr. drugi račun).
- Crvena "Sigurni duplikati" sekcija ostaje samo za redove koji se već nalaze u bazi kao `bank_only` (tj. bivši izvod već uvezen).

## Tehnička izvedba

1. **`CSVImportDialog.tsx`** — prije renderiranja:
   - Pozovi `matchManualToImported({ imported, manualCandidates: existingExpenses.filter(manual/pending_bank), maxDayDiff: 1 })`.
   - Dobiveni `matches` → grupa `autoMerge`.
   - Iz postojećih `duplicates` / `fuzzyDuplicates` izbaci sve indekse koji su u `autoMerge.matches.importedIndex` (oni će biti riješeni tihim merge-om, nema potrebe za alarmom).
   - `ambiguous` indekse stavi u žutu sekciju (pravo mjesto za odluku korisnika).
2. **UI sekcija "Automatski spojeno"**:
   - Collapsed by default, zeleni `Link2` ikona, ekspandira se na klik.
   - Svaki red prikazuje par: lijevo postojeći ručni unos (opis + datum), desno novi izvod-red (merchant + iznos), s `→` između.
3. **Brojač "8 novih transakcija je spremno za uvoz"** ostaje točan jer auto-merge ne kreira novi red — već update-a postojeći. Treba ga preimenovati u nešto poput: `"8 novih + N spojenih = 8+N obrađenih redova"`.
4. **Nema promjene** u `useExpenseCRUD.importFromCSV` — auto-merge već radi točno to što treba; samo dodajemo UI vidljivost prije klika.
5. **i18n** ključevi pod `import.duplicates.autoMerge.*` (HR/EN/DE).

## Što NE radimo

- Ne diramo `duplicateDetection.ts` scoring (radi ispravno).
- Ne diramo `manualMatchForImport.ts` kriterije (već su konzervativni i sigurni).
- Ne kreiramo nove DB kolone, RPC-ove ni migracije.
- Ne diramo postojeću `Link2 "Spojeno"` značku u `ImportBatchDialog` (post-import view).

## Datoteke koje mijenjam

- `src/components/CSVImportDialog.tsx` — nova sekcija + pre-compute auto-merge grupe.
- `src/contexts/PdfImportContext.tsx` — isti dijalog se koristi i za PDF, treba proslijediti `existingExpenses` ako već nije.
- `src/i18n/locales/{hr,en,de}.json` — novi ključevi.

## Rizici

- Ako se `payment_source` razlikuje (npr. korisnik je ručni unos stavio pod `cash` a izvod ide na bankovni račun), auto-merge se NEĆE dogoditi i red će ostati u žutoj sekciji s napomenom "drugi račun" — to je ispravno, jer takav merge može maskirati grešku unosa.
- Performance: `matchManualToImported` je pure i O(imported × candidates); za tipičan mjesečni izvod (≤100 redova) zanemarivo.
