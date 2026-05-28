# Plan: Recovery artikala s ovog uređaja

Uređaj je isti onaj na kojem si pregledavao račune → lokalni cache (`receipt_cache_*`, IndexedDB, auto-backup) bi trebao još uvijek sadržavati artikle koji nikad nisu stigli u cloud.

Bez nagađanja: prvo čitamo, pokazujemo, ti potvrđuješ, tek onda pišemo.

## Koraci

### 1. Read-only inventura na uređaju (NIŠTA se ne piše)
- Nova privremena stranica `/recovery/receipt-items` (skrivena, samo za tebe)
- Skenira:
  - `localStorage` ključeve koji počinju s `receipt_cache_`, `receipt_scan_`, `pending_receipt_`
  - Capacitor `Preferences` (native key/value)
  - IndexedDB (`receipt-cache`, `lovable-cache`, sve baze koje aplikacija koristi)
  - Auto-backup ključeve ako postoje
- Za svaki nađeni zapis prikazuje: timestamp, merchant, iznos, broj artikala, prvih par naziva
- **Ništa ne briše, ništa ne uploada**

### 2. Match s cloud transakcijama (read-only)
- Za svaki lokalni zapis traži kandidat u `expenses` po:
  - `user_id` (tvoj)
  - `ai_extracted=true`
  - datum ±1 dan
  - iznos točno (±0.01)
  - merchant (case-insensitive contains)
- Prikazuje tablicu: `lokalni zapis → kandidat transakcija → postoji li već items? (DA/NE)`
- Označava SAMO transakcije bez artikala kao "safe to restore"

### 3. Tvoja eksplicitna potvrda
- Vidiš listu parova prije ičega
- Checkbox po retku
- Gumb "Vrati artikle za odabrane" tek nakon što označiš

### 4. Safe restore (samo za potvrđene)
- Insert u `receipt_items` SAMO za transakcije gdje `receipt_items` ima 0 redaka
- Bez diranja: balansa, iznosa transakcije, projekata, budžeta, kategorija
- Po svakom uspjehu: log u `app_diagnostics_logs` (recovery audit trail)
- Po neuspjehu: prikaz greške, NE pretvaranje da je prošlo

### 5. Verifikacija fixa write-patha
- Fix u `Index.tsx` + `useExpenseCRUD.ts` već je deployan
- Testni račun: skeniraj jedan novi račun, provjeri da artikli stignu u `receipt_items`
- Ako stignu → write-path je sređen, ovakva situacija se ne ponavlja
- Ako ne stignu → diagnostic log će pokazati točan razlog (više nije silent)

### 6. Cleanup
- Recovery stranica ostaje skrivena dok ne potvrdimo da je sve OK
- Nakon potvrde: stranica se makne, lokalni cache se ostavlja netaknut (ne brišemo dok ne budeš 100% siguran)

## Što se NE radi
- Nema migracija
- Nema bulk operacija
- Nema diranja balansa, projekata, budžeta
- Nema brisanja podataka (ni cloud ni lokalno)
- Nema RLS/GRANT promjena
- Nema dodirivanja drugih korisnika

## Tehničke datoteke
- `src/pages/RecoveryReceiptItems.tsx` (nova, lazy-loaded ruta)
- `src/lib/receiptRecovery.ts` (čitanje lokalnih izvora + matching logika)
- ruta dodana u `App.tsx` lazy-loaded
- i18n ključevi `recovery.*` (HR/EN/DE)

Potvrdi i krećem s implementacijom koraka 1+2 (samo read-only inventura i prikaz parova). Korak 4 (write) tek nakon što vidiš listu i klikneš.
