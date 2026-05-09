# Cilj

U business modu, nakon snimanja računa, prikaz pregleda puca jer fetch `custom_payment_sources` baci grešku tijekom WebView suspend/resume oko native kamere. Toast "Greška pri dohvaćanju prilagođenih izvora plaćanja" se prikaže, a `ScannedDataPreview` se nikad ne otvori. Korisnik je to potvrdio.

## Što mijenjam

### 1. `src/hooks/useCustomPaymentSources.ts` — graceful degrade
- U `catch` bloku unutar `fetchCustomPaymentSources` proširiti detekciju "tranzijentnih" grešaka (network, fetch failed, timed out, AbortError, PostgREST 5xx) uz postojeći auth/401 handler.
- Za tranzijentne greške: **NE** pozivati `showError` (nema toasta), samo `console.warn` + `logDiagnostic('payment_sources_fetch_transient_error', {...})`. Zadržati prethodni `customPaymentSources` state (ne brisati ga).
- Tihi background retry kroz `setTimeout(fetch, 800)` jednom — bez UI feedbacka.
- Toast/`showError` samo kod stvarnih, perzistentnih grešaka (npr. PostgREST 4xx ≠ 401, ili nakon retry-a još uvijek pukne).

### 2. `src/hooks/useReceiptScanner.ts` — dodatna diagnostika
- Dodati `logDiagnostic('receipt_scan_preview_pre_render', { sources_count, has_business_profile, is_business })` neposredno prije `setParsedData(result)` na success path (poziv treba čitati count iz `customPaymentSources` argumenta — već je dostupan).
- To nam daje tvrdi dokaz da scan flow završi i da je preview state postavljen, čak i ako UI render padne kasnije.

### 3. `src/components/add-expense/AddExpenseDialog.tsx` — preview guard (minimalan)
- Pri otvaranju `ScannedDataPreview`, ako je `customPaymentSources.length === 0` u business modu, **ne blokirati** preview — samo logirati `logDiagnostic('preview_opened_with_empty_sources', { is_business: !!activeBusinessProfileId })` i pustiti korisnika da nastavi (može odabrati gotovinu/banku ili kasnije promijeniti).
- Bez UI promjena, bez novih dijaloga.

## Što NE mijenjam

- `parse-receipt` edge function (radi ispravno).
- `ScannedDataPreview.tsx` validaciju i UX.
- Dashboard fetch izvora plaćanja (drugi code-path).
- Personal mode flow (već radi).
- i18n ključeve (nema novih UI stringova).

## Verifikacija nakon implementacije

1. Korisnik ponovo skenira račun u business modu na Android APK-u.
2. U `app_diagnostics_logs` očekujem: `receipt_scan_success` → `receipt_scan_preview_pre_render` (s `is_business: true`) → `receipt_scan_preview_shown` → `receipt_scan_accept_attempt`.
3. U logovima **ne smije** biti toasta `errors.fetch.sources` tijekom scan flow-a.
4. Ako se i dalje preview ne otvori, novi `payment_sources_fetch_transient_error` log će dati točan razlog (status, message), pa idemo targeted fix.

## Rizici

- Tihi retry može maskirati pravu grešku — zato ostavljamo `logDiagnostic` da je možemo vidjeti.
- Drugi pozivatelji `useCustomPaymentSources` (npr. Wallet, AddExpenseDialog) više neće dobiti toast za tranzijentne greške; to je željeno ponašanje (ionako su bili buni i remetili UX).

## Procjena

~25 redaka koda u 3 datoteke, bez DB migracija, bez i18n promjena.
