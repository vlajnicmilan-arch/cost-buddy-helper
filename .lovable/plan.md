# Cilj

Nemamo dokaz **što** točno zatvara/skriva preview u business modu. Logovi pokazuju da je `showScannedPreview=true` postavljen, ali korisnik vizualno ne vidi preview. Treba 4 tihe diagnostičke točke koje će pri sljedećem skeniranju jednoznačno pokazati uzrok — bez ijednog "fixa" ili guarda.

# Što mijenjam

## 1. `src/components/add-expense/AddExpenseDialog.tsx` — Dialog onOpenChange log

U postojeći `onOpenChange` (≈ linija 916), prije `if (!isOpen && (...)) return;`, dodati:
```ts
logDiagnostic('add_expense_dialog_open_change', {
  next_open: isOpen,
  scanning, scan_in_progress: scanInProgressRef.current,
  show_scanned_preview: showScannedPreview,
  scanned_preview_active: scannedPreviewActiveRef.current,
  is_saving: isSaving, camera_active: cameraActiveRef.current,
  blocked_by_guard: !isOpen && (scanning || scanInProgressRef.current || showScannedPreview || scannedPreviewActiveRef.current || isSaving || cameraActiveRef.current),
});
```
Pokazat će je li Radix poslao close event nakon povratka iz kamere.

## 2. `src/components/add-expense/AddExpenseDialog.tsx` — unmount cijelog dialoga

Dodati top-level:
```ts
useEffect(() => () => {
  logDiagnostic({
    event: 'add_expense_dialog_unmounted',
    severity: 'warning',
    details: { had_preview: scannedPreviewActiveRef.current, route: window.location.pathname },
  });
}, []);
```
Ako se ovo pojavi između `receipt_scan_start` i `receipt_scan_preview_shown` — roditelj re-mounta cijelu komponentu.

## 3. `src/components/add-expense/ScannedDataPreview.tsx` — mount/unmount preview-a

Dodati u komponentu:
```ts
useEffect(() => {
  logDiagnostic('scanned_preview_mounted', {
    has_amount: !!scannedData?.amount,
    sources_count: customPaymentSources?.length ?? 0,
    business: !!activeBusinessProfileId,
  });
  return () => logDiagnostic('scanned_preview_unmounted', {});
}, []);
```
Definitivan signal je li ScannedDataPreview uopće stigao do DOM-a i koliko je živ.

## 4. `src/components/home/HomeHeader.tsx` — wrapper remount log

Iznad `<AddExpenseDialog autoScan ...>`, u host komponenti dodati:
```ts
useEffect(() => { logDiagnostic('home_header_mounted', {}); return () => logDiagnostic('home_header_unmounted', {}); }, []);
```
Ako HomeHeader unmounta tijekom kamere → zna se da Dialog umire s roditeljem.

# Što NE mijenjam

- Bez novih guarda, timeouta, uvjetnih grana ili pretpostavljenih "fixova".
- Bez izmjena `useReceiptScanner.ts`, edge funkcije, RLS-a, DB-a, i18n-a, UI stila.
- Bez izmjena postojećih `logDiagnostic` poziva.

# Verifikacija (korisnikov korak)

Korisnik nakon implementacije ponovo skenira račun u business modu. Iz logova ćemo dobiti **jedan od tri jasna obrasca**:

- **A — Radix zatvara Dialog**: `receipt_scan_preview_shown` → `add_expense_dialog_open_change` s `next_open:false` (i `blocked_by_guard:false` ili `true`). Fix: pojačati guard ili izvor zatvaranja.
- **B — Roditelj re-mounta**: `home_header_unmounted` ili `add_expense_dialog_unmounted` između `receipt_scan_start` i `receipt_scan_preview_shown`. Fix: stabilizirati scan flow van komponente koja umire (već poznat anti-pattern iz Project Knowledge §8).
- **C — Preview ipak živ**: `scanned_preview_mounted` se pojavi i ostane. Fix: vizualno (z-index/visina kontejnera/StatusFeedback overlay).

Tek nakon obrasca radimo arhitektonski fix u sljedećem loopu.

# Procjena

~25 redaka u 3 datoteke. Bez DB migracija, bez i18n, bez UI promjena.
