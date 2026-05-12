## Cilj

Klik na **Skeniraj** (osobni i tvrtka) odmah otvara nativnu kameru spremnu za slikanje. Forma transakcije / preview se prikazuje **tek nakon** što je fotka obrađena.

## Trenutno stanje (provjereno)

- `ScanTriggerButton` poziva `useReceiptScan().openScan({ businessProfileId })`.
- `GlobalReceiptScanHost` montira **cijeli** `AddExpenseDialog` s `autoScan=true`.
- `AddExpenseDialog` u `useEffect` (s 150ms timeoutom + čekanjem `customPaymentSourcesLoading`) zove `handleNativeCapture('camera')`.
- Posljedica: prazna forma se na ~150ms+ pojavi, pa se kamera otvara. U business modu kašnjenje je veće jer se čeka učitavanje payment sources/projekata, što izgleda kao "ne otvara kameru".

Oba moda već koriste **isti** `ScanTriggerButton` → flow je isti, razlika je samo u kašnjenju zbog poslovnih podataka.

## Promjena

Razdvojiti **akviziciju fotke** od **forme za unos**:

1. **`ReceiptScanContext`** dobiva novo stanje `phase: 'idle' | 'capturing' | 'editing'`.
   - `openScan()` postavlja `phase='capturing'`, **ne** otvara dialog.
   - Nakon što fotka stigne (ili korisnik odustane), prelazi u `editing` (otvara dialog s već uhvaćenom slikom) ili `idle` (cancel).

2. **Novi `ScanCaptureRunner`** komponenta (montirana u `GlobalReceiptScanHost` umjesto trenutnog dialoga kad je `phase==='capturing'`):
   - Bez ikakvog UI-a (ili minimalni full-screen spinner overlay).
   - Pri mountu odmah zove `useNativeCamera.takePhoto()` (native) ili klikne hidden `<input capture>` (web).
   - Po uspjehu šalje `base64` u kontekst (`completeCapture(base64)`), po cancelu zove `closeScan()`.
   - **Ne** ovisi o `customPaymentSources` – kamera kreće odmah.

3. **`AddExpenseDialog`** se montira tek kad `phase==='editing'`, s novim propom `initialReceiptImage`. Postojeća `autoScan` grana (i `setTimeout(150)` + guard za `customPaymentSourcesLoading`) se uklanja – više nije potrebna.

4. **Procesiranje slike** (`processImageBase64` / `scanReceipt`) preseliti u kontekst ili u `ScanCaptureRunner` kako bi i AI poziv mogao krenuti odmah dok forma još nije montirana. Rezultat se predaje dialogu kao `initialScannedData`.

5. **Web fallback**: kontekst drži skriveni `<input type="file" accept="image/*" capture="environment">` koji `ScanCaptureRunner` aktivira programatski.

6. **Lifecycle-safe** (Android camera Activity recreation): `phase` i `base64` žive u `ReceiptScanContext` (iznad route trea), kao što sada živi `isOpen`. `GlobalReceiptScanHost` ostaje mount point.

## Što ostaje isto

- Svi `ScanTriggerButton` pozivi i `openScan()` API – nema promjena u pozivnim mjestima (`HomeHeader`, `BusinessModeView`, `BusinessTransactions`, itd.).
- Logika spremanja transakcije (`onAdd`, `checkDuplicate`, registracija handlera).
- i18n ključevi.
- `useNativeCamera`, `useReceiptScanner` – nepromijenjeni.

## Datoteke

- `src/contexts/ReceiptScanContext.tsx` – dodati `phase`, `capturedImage`, `completeCapture`, `cancelCapture`.
- `src/components/add-expense/GlobalReceiptScanHost.tsx` – grananje na `phase`.
- `src/components/add-expense/ScanCaptureRunner.tsx` – **nova** komponenta.
- `src/components/add-expense/AddExpenseDialog.tsx` – ukloniti `autoScan` useEffect (linije ~338–365), dodati `initialReceiptImage` / `initialScannedData` prop, preskočiti capture korak.

## Verifikacija

- Web (osobni + tvrtka): klik **Skeniraj** → odmah file picker s kamerom, bez prikaza forme.
- Native APK (osobni + tvrtka): klik **Skeniraj** → odmah Camera Activity, bez flasha forme. Po povratku iz kamere AddExpenseDialog se montira s već učitanom slikom + scan rezultatom.
- Cancel u kameri zatvara flow bez praznog dialoga.
- TypeScript build clean.

## Bez promjene verzije

UI/flow refactor – ne dira native plugine, nije potrebna nova APK verzija ako se ne mijenja Capacitor sloj. Postojeći `useNativeCamera` se reuza.
