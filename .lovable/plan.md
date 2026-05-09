
## Cilj

Manual gumb "Dodaj" mora otvoriti **isti** AddExpenseDialog koji je već globalno mountan iznad rute (kao i Skeniraj). Tako gumb "Fotografiraj" unutar dialoga preživi Android camera Activity recreation — koja trenutno unmounta page-level dialog.

## Što ne dirati

- `useReceiptScanner`, `useNativeCamera`, `parse-receipt` edge funkcija
- `AddExpenseDialog` interna logika (form, scan flow, autoScan, capture guard)
- `ScannedDataPreview`, manual save flow
- DB, RLS, i18n, edge functions

## Promjene

### 1. `ReceiptScanContext.tsx`
- Dodati `autoScan: boolean` u state (default `false`).
- `openScan({ businessProfileId })` → `autoScan = true` (postojeće).
- Novi action: `openManualAdd({ businessProfileId })` → `autoScan = false`, `isOpen = true`.
- Izložiti `autoScan` kroz value.

### 2. `GlobalReceiptScanHost.tsx`
- Pročitati `autoScan` iz konteksta.
- Proslijediti `autoScan={autoScan}` u `AddExpenseDialog` (umjesto hardkodiranog `true`).

### 3. Novi `ManualAddTriggerButton.tsx` (uz `ScanTriggerButton.tsx`)
- Tanak gumb (~40 LOC), prima iste props kao postojeći `AddExpenseDialog` trigger (`triggerLabel`, `triggerIcon`, `triggerClassName`, `businessProfileId`).
- Klik → `openManualAdd({ businessProfileId })`.
- Vizualno identičan trenutnom Add gumbu (Plus ikona, isti style).

### 4. Zamjene inline `<AddExpenseDialog … />` triggera
Svi mjesti gdje se trenutno renderira `<AddExpenseDialog onAdd=… checkDuplicate=… businessProfileId=…/>` kao trigger:
- `src/components/home/HomeHeader.tsx:194` → `<ManualAddTriggerButton />`
- `src/components/home/BusinessModeView.tsx:193` → `<ManualAddTriggerButton businessProfileId=… />`
- `src/components/home/BusinessModeView.tsx:296` → `<ManualAddTriggerButton businessProfileId=… triggerIcon={Plus} triggerLabel="Novo" />`

`onAdd` i `checkDuplicate` se više ne prosljeđuju trigger gumbu — oni već stižu kroz već postojeću `registerHandlers()` registraciju u `PersonalModeView`/`BusinessModeView` (radi za scan, radit će i za manual jer je dialog isti).

### 5. Manual flow u `BusinessTransactions` (drugi tab-ovi)
Provjeriti dodatne lokacije gdje se renderira `AddExpenseDialog` izvan home header-a:
- `BusinessTransactions` `addAction` slot — već pokriven u koraku 4 (BusinessModeView linija 296).
- Bilo koji drugi page-level `<AddExpenseDialog>` ostaje netaknut **osim** ako služi kao trigger button. Edit dialozi (otvaraju se preko `externalOpen` za uređivanje postojećih transakcija) NE mijenjamo.

### 6. Cleanup
- Maknuti neiskorištene importe `AddExpenseDialog` iz `HomeHeader.tsx` i `BusinessModeView.tsx`.
- Diagnostic eventi: dodati `global_manual_add_open` u `openManualAdd`.

## Tehnički detalji

```text
[Trenutno]
"Dodaj" gumb → page-local AddExpenseDialog → "Fotografiraj"
                                           → camera (Activity recreation)
                                           → page remount → dialog unmounted ✗

[Cilj]
"Dodaj" gumb → openManualAdd() → globalni AddExpenseDialog (iznad rute)
                                → "Fotografiraj"
                                → camera (Activity recreation)
                                → globalni host preživi ✓
                                → preview se renda ✓
```

`autoScan` flag samo kontrolira da li `useEffect` u `AddExpenseDialog` automatski okida kameru pri otvaranju. Manual mod = `autoScan: false` znači da dialog otvara klasičnu formu, a kamera se okine tek na klik "Fotografiraj" (unutarnji `handleNativeCapture`).

## Rizici

- Edit-dialog flow koji koristi `externalOpen` (npr. EditTransactionDialog) ostaje na `AddExpenseDialog` izravno — ne miješamo se. Trigger refactor je samo za "novo dodavanje".
- Globalni host sada može sadržavati i scan i manual otvaranje istovremeno → state se mora resetirati pri svakom `openX()` (već se događa jer `closeScan` postavlja `isOpen=false` između).

## Opseg

~80 LOC izmjena u 4 datoteke + 1 nova (ManualAddTriggerButton). Bez DB, bez i18n, bez edge changes.
