# Cilj

Riješiti pravi uzrok: `AddExpenseDialog` (i njegov `scannedData`) umre kad Android tijekom kamere uništi Activity → preview se nikad ne renderira, a kvačica se pojavi jer je `StatusFeedback` već globalan.

Logovi (18:34) potvrđuju: `home_header_unmounted` i `add_expense_dialog_unmounted` se dogode **između** `receipt_scan_start` i `receipt_scan_success`. `setShowScannedPreview(true)` se izvrši na već unmountanoj komponenti i nestane.

Rješenje: scan flow koji koristi **istu** `AddExpenseDialog` komponentu se ne dira u manualnoj grani. Auto-scan se seli iznad rute u globalni sloj koji **ne može umrijeti**.

# Arhitektura

```text
App.tsx
 └─ <ReceiptScanProvider>          ← novi context, mountan jednom
     ├─ <RouteAwareGlobalOverlays>
     │   └─ <ReceiptScanOverlay/>  ← novi globalni overlay s preview-om
     └─ <AppRoutes>
         └─ HomeHeader / BusinessModeView
             └─ <ScanTriggerButton/>  ← thin gumb, poziva context.startScan()
```

**Manualni "Add Expense" flow** (klik na "Dodaj") ostaje **netaknut** — `AddExpenseDialog` bez `autoScan` propa radi kao i prije.

# Koraci

## 1. Novi `src/contexts/ReceiptScanContext.tsx`

State u stabilnom sloju iznad rute:
- `scanning: boolean`
- `scannedData: ScannedReceipt | null`
- `pendingImageBase64: string | null` (za "spremi sliku računa")
- `businessProfileId: string | null` (predan iz `startScan`)

Akcije:
- `startScan({ businessProfileId, source?: 'camera' | 'gallery' })` — interno koristi postojeći `useNativeCamera` + `useReceiptScanner` (bez izmjena u tim hookovima).
- `cancelScan()` — odbaci preview i sliku.
- `acceptScan(overrides)` — proxy prema registriranom `onAddExpense` handleru.
- `registerAddHandler(fn)` — `Index`/`Wallet`/`Dashboard` se registriraju s ovog handlerom u `useEffect` (cleanup pri unmount).

Provider drži `useNativeCamera`, `useReceiptScanner`, `useCustomPaymentSources`, `useCustomCategories` interno — sve to je sad bezbroj puta instancirano, ovdje postaje jedna instanca koja ne umire.

## 2. Novi `src/components/add-expense/ReceiptScanOverlay.tsx`

Mountan u `RouteAwareGlobalOverlays` u `App.tsx`. Sadržaj:
- `<ScanningOverlay/>` (već postoji) kad `scanning && !scannedData`.
- `<Dialog>` s `<ScannedDataPreview/>` (već postoji) kad `scannedData !== null`.
- Pozove `acceptScan` / `cancelScan` na korisničku akciju.

`ScannedDataPreview` već prima sav potreban props — samo se sad puni iz konteksta.

## 3. `AddExpenseDialog.tsx` — ukloni `autoScan` granu

Konkretno briše se:
- `autoScanTriggeredRef` + `useEffect` na linijama 317–343.
- `handleNativeCapture`, `processImageBase64`, `handleImageCapture`, `applyScannedResult`, `scanReceipt` poziv u `processImageBase64`, `cameraInputRef`, `galleryInputRef`, sav capture-guard kod (172 redaka).
- `scannedData`, `showScannedPreview`, `scannedPreviewActiveRef`, `scanInProgressRef`, `cameraActiveRef`.
- `<ScannedDataPreview/>` render unutar dialoga.
- `autoScan` prop iz interface-a.

Manualni put (form polja, kategorija, spremanje) ostaje 100% isti. Dialog postaje ~700 redaka umjesto ~1187.

## 4. Novi `src/components/add-expense/ScanTriggerButton.tsx`

Mali gumb (~40 redaka) koji zamijeni `<AddExpenseDialog autoScan triggerVariant="scan" .../>` na 2 mjesta:

```tsx
const { startScan } = useReceiptScan();
return (
  <Button onClick={() => startScan({ businessProfileId })} className={...}>
    <ScanLine/> {triggerLabel}
  </Button>
);
```

Promjene:
- `HomeHeader.tsx:199` — zamjena.
- `BusinessModeView.tsx:297` — zamjena.

Ostali `<AddExpenseDialog/>` use-sites (manualni Dodaj) ostaju isti.

## 5. Registracija `onAdd` handlera

`Index.tsx` i `BusinessModeView.tsx` već imaju `onAddExpense` callback. Dodati `useEffect` koji ga registrira u kontekst:

```ts
const { registerAddHandler } = useReceiptScan();
useEffect(() => registerAddHandler(handleAddExpense), [handleAddExpense, registerAddHandler]);
```

Kad se ruta promijeni, novi handler se registrira. Context drži samo zadnji.

## 6. Cleanup dijagnostike

Maknuti privremene logove iz prošlog loopa:
- `home_header_mounted/unmounted` u `HomeHeader.tsx`.
- `add_expense_dialog_unmounted` i `add_expense_dialog_open_change` u `AddExpenseDialog.tsx`.
- `scanned_preview_mounted/unmounted` u `ScannedDataPreview.tsx`.

Dodati nove iz konteksta:
- `receipt_scan_overlay_mounted` (jednom, info).
- `receipt_scan_overlay_preview_visible` (info, kad preview uđe u DOM).
- `receipt_scan_handler_registered/unregistered` (info, route trace).

# Što se ne dira

- `useReceiptScanner.ts` — interna logika, HTTP, edge funkcija.
- `useNativeCamera.ts`.
- `parse-receipt` edge funkcija.
- `ScannedDataPreview.tsx` — ostaje ista komponenta, samo se mounta s drugog mjesta.
- `ScanningOverlay.tsx`.
- DB, RLS, migracije, i18n keys.
- Stilovi, dizajn, layouti.
- Manualni "Dodaj" flow.

# Verifikacija

Nakon implementacije korisnik skenira račun u business modu u APK buildu. Očekivano u logovima:

```
receipt_scan_start
home_header_unmounted          ← može se i dalje dogoditi, NIJE bitno
receipt_scan_success
receipt_scan_overlay_preview_visible   ← preview živi u stabilnom sloju
[korisnik vizualno vidi preview, klika "Spremi"]
receipt_scan_accept_attempt
expense_create_success
```

Ako se `receipt_scan_overlay_preview_visible` pojavi i preview je vidljiv → fix radi i u osobnom i u business modu.

# Procjena

- 1 novi context (~150 redaka)
- 1 novi overlay (~80 redaka)
- 1 novi trigger gumb (~40 redaka)
- `App.tsx`: provider + overlay (~5 redaka)
- `AddExpenseDialog.tsx`: brisanje ~170 redaka, bez novog koda
- `HomeHeader.tsx` / `BusinessModeView.tsx`: zamjena 2 use-sites
- `Index.tsx` / `BusinessModeView.tsx`: 1 useEffect za registraciju handlera

Bez DB migracija. Bez i18n promjena. Bez novih edge funkcija. Bez dizajn promjena.

JEDAN scan tok ostaje, samo živi iznad rute umjesto unutar krhke komponente.
