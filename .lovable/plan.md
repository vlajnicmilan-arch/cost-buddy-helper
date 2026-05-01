## Audit nalazi (verificirano čitanjem koda)

### Trenutno stanje poslovnog skenera (nakon prošle izmjene)

**1. `Business.tsx` (/business ruta) — Dashboard tab NEMA scan gumb**
- Tab `dashboard` (linije 122-128) renderira samo `<BusinessDashboard>` koji nema nijedan scan/add UI
- Scan gumb postoji SAMO u tabu `transactions` (linije 132-163) preko `scanAction` propa s `autoScan triggerVariant="scan"`
- Dakle: ako korisnik na "Poslovanje" stranici vidi scan gumb na dashboardu — taj kod ovdje NE POSTOJI. Mora prijeći na "Transakcije" tab da bi ga uopće vidio.

**2. `BusinessModeView.tsx` (alternativni view, korišten iz `Index.tsx` Home stranice za business mode)**
- Dashboard tab IMA scan gumb interno preko `<AddExpenseDialog ... />` (linije 178-182), ali BEZ `autoScan` i BEZ `triggerVariant="scan"` — to je obični "Dodaj" gumb
- Transactions tab (linije 275-306) ima zaseban `scanAction` s `autoScan triggerVariant="scan"` — identičan onome u `Business.tsx`

**3. `AddExpenseDialog` — interno mountanje provjereno**
- `triggerVariant="scan"` POSTOJI (linije 853-861): renderira `bg-ai` (purple, HSL 262 83% 58%) gumb s `ScanLine` ikonom. CSS varijabla `--ai` definirana u `src/index.css` linije 43, 230. ✅
- `autoScan` mehanizam (linije 240-265): postavlja `autoScanTriggeredRef`, čeka 150ms nakon `open=true`, zove `handleNativeCapture('camera', false)` na native ili `cameraInputRef.current?.click()` na webu
- `useBackButton(open, handleBackClose, 10)` registriran s prioritetom 10 (linija 413) — najveći u app-u
- `handleBackClose` (linije 409-412) blokira zatvaranje dok je: scanning / scanInProgressRef / showScannedPreview / scannedPreviewActiveRef / isSaving / cameraActiveRef
- `setNativeFlowActive(true)` postavljen u `handleNativeCapture` (linija 293) i drži se 2500ms nakon povratka kamere (linija 309)
- `BackButtonContext` (linije 98-102) ako je `isNativeFlowActive() === true` ILI vidljivost <2500ms od foreground povratka → ignorira popstate i re-pusha state. ✅
- `onOpenChange` guard (linija 825) blokira zatvaranje dok je scanning/scanInProgress/showScannedPreview/scannedPreviewActive/isSaving/cameraActive
- Force-reopen safety (linije 380-390): ako stigne rezultat dok je dialog zatvoren, `setOpen(true)` ga vraća

**4. Otkriveni potencijalni problem (osobno mode RADI s istom logikom)**
Identificiran je samo JEDAN bitni razlika između osobnog i poslovnog toka u dialogu — `autoScan`. Personal flow korisnik klikne "Skeniraj" UNUTAR dialoga, dok business flow ima `autoScan=true` koji nakon 150ms automatski okida `handleNativeCapture`.

Mogući problem na nekim Android uređajima: `useEffect` koji okida `autoScan` ovisi o tome da je dialog već potpuno mountan i da je `BackButton` registriran s `open=true`. `useBackButton` poziva se prije auto-scan effecta (linija 413 vs 241), ali registracija se dešava asinkrono kroz `useEffect` u `useBackButton.ts` linija 23-25. Sinkronizacija je tijesna ali bi trebala biti OK.

### Zaključak audita

Trenutno **postoji funkcionalan kod** za business scan u oba viewa (`Business.tsx` Transactions tab i `BusinessModeView.tsx` Transactions tab + Dashboard tab). Sve infrastrukturne komponente (back button guard, native flow guard, dialog reopen safety, scanning state guards) su prisutne.

**Nije moguće potvrditi pravi problem bez stvarnog dijagnostičkog signala** — trebamo `diagnosticLogger` događaje iz stvarnog korisničkog pokušaja:
- `add_expense_dialog_opened` (auto_scan: true, is_business: true)
- `receipt_auto_scan_triggered`
- `receipt_scan_native_http_start` / `receipt_scan_native_http_done` ili `receipt_scan_native_http_failed`
- `receipt_scan_response_received`, `receipt_scan_success`, `receipt_scan_preview_shown`
- ILI `receipt_scan_dialog_reopened` (znači dialog je nestao i vraćen)

## Plan: Dijagnostika prije bilo kakve refaktorizacije

Korisnik je već potrošio tokene na izmjene koje nisu donijele rezultat. Sljedeći korak NE smije biti još jedna refaktorizacija "u mraku". Mora biti **uvid u stvarni tok** s trenutnim kodom.

### Korak 1 — Vizualizirati zadnje pokušaje (bez izmjena koda)
Pročitati `diagnostic_logs` tablicu za prijavljenog korisnika (`d4d31ee6-5f6b-4059-8c87-b595b394f56b`), filtrirano na `event LIKE 'receipt_%' OR event LIKE 'add_expense_%'` zadnjih 24h. Time točno vidimo:
- otvara li se dialog uopće (`add_expense_dialog_opened`)
- okida li se kamera (`receipt_auto_scan_triggered`)
- ide li request van (`receipt_scan_native_http_start` → `_done` / `_failed`)
- vraća li se uspjeh (`receipt_scan_success`)
- prikazuje li se preview (`receipt_scan_preview_shown`)
- ili dialog "nestaje" (`receipt_scan_dialog_reopened`)

### Korak 2 — Pročitati `parse-receipt` edge logove istog vremenskog okvira
Ako `receipt_scan_native_http_start` postoji ali `_done` ne, problem je mreža/timeout/native HTTP. Ako postoji `_done` i `success` ali nema `preview_shown`, problem je u UI-u (dialog se unmountao prije renderiranja preview-a).

### Korak 3 — Tek tada predložiti CILJANU akciju
Ovisno o tome što logovi pokažu. Tri scenarija:

**A) Logovi pokazuju da AI nikad nije pozvan (request ne ode van):**
Problem je da kamera ne vraća sliku ili `processImageBase64` ne biva pozvan. Akcija: pojačati `cameraActiveRef` window i logirati `processImageBase64` ulaz.

**B) Logovi pokazuju uspješan AI response ali nema `preview_shown`:**
Dialog se unmountao između `applyScannedResult` i `setShowScannedPreview(true)`. Akcija: dodati `requestIdRef` + odgoditi unmount na `open=false` dok god `scannedData` postoji u state-u.

**C) Logovi pokazuju da `add_expense_dialog_opened` nikad nije zabilježen:**
Trigger gumb se klikne ali Radix `<DialogTrigger>` ne otvara dialog na business stranici. Akcija: provjeriti da `triggerVariant="scan"` gumb iz business viewa zapravo otvara dialog (možda postoji prepreka u parent kontejneru).

### Što NE radimo u ovom planu
- Ne refaktoriramo arhitekturu naslijepo
- Ne uklanjamo `autoScan`
- Ne dodajemo nove guardove koji već postoje
- Ne mijenjamo izgled gumba

### Što ti dobivaš
Nakon odobrenja:
1. Konkretan ispis dijagnostičkih događaja iz tvojih stvarnih pokušaja s vremenskim oznakama
2. Točnu identifikaciju gdje tok pukne
3. Jedan ciljani fix (A, B ili C) — ne paket nagađanja

Bez tokena za izmjene koda u ovom koraku — samo READ operacije nad bazom i edge logovima.

### Tehnički detalji izvedbe
- `supabase--read_query` na `diagnostic_logs` filtrirano `user_id = 'd4d31ee6-5f6b-4059-8c87-b595b394f56b'`, `created_at > now() - interval '24 hours'`, `event ILIKE 'receipt_%' OR event ILIKE 'add_expense_%'`, ORDER BY created_at DESC
- `supabase--edge_function_logs` za `parse-receipt` u istom prozoru
- Output: tablica događaja s vremenskim slijedom + zaključak o pozicijama u toku
