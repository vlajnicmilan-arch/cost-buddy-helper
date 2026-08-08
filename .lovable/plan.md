# Nalaz: Krug chip u dijalogu troška ne reagira

## Simptom
U dijalogu za dodavanje troška (osobni mod) klik na Krug chip ne otvara ništa. Projekt i Smjer rade.

## Točan uzrok (potvrđen čitanjem koda)

`AttachmentBar` (`src/components/add-expense/AttachmentBar.tsx:369`) otvara Krug popover isključivo kroz gate:

```
onOpenChange={(o) => { if (!o) {...} requestModule('krug', { onGranted: () => setOpenChip('krug') }); }}
```

`requestModule` dolazi iz `useModuleGate()`. Taj hook ima fallback (`src/hooks/useModuleGate.tsx:88-96`): ako `ModuleGateContext` nije prisutan, vraća **tihi no-op** koji poziva samo `onDismiss` — `onGranted` se NIKAD ne pozove, popover se ne otvori, dijalog za upgrade se ne otvori, greške nema.

`ModuleGateProvider` je u `src/App.tsx:396` i omata samo `<AppRoutes />`. Ali globalni `AddExpenseDialog` mounta se preko `<GlobalReceiptScanHost />` na `src/App.tsx:388` — **iznad** providera. Manual i scan ulaz oba idu kroz taj globalni host (`ManualAddTriggerButton`, `ScanTriggerButton`). Dakle dijalog je izvan React podstabla providera → fallback no-op → mrtav chip.

Projekt i Smjer chip ne prolaze kroz gate, pa rade — točno kako korisnik opisuje.

## Zašto nije entitlement
Gate se nikad ni ne izvrši; entitlement (`user_entitlements`) je irelevantan za ovaj simptom. Da provider postoji a prava nema, otvorio bi se `ModuleUpgradeDialog` — ne bi bilo „ništa se ne dogodi".

## Veza s današnjim isporukama
Nema. Današnji radovi (serverski i18n katalog, `notify-krug-event`, `krug_emit_notification` overload) ne diraju ovaj put. Riječ je o pogrešnom mjestu mounta providera u odnosu na globalni host.

## Prijedlog popravka (ne izvršen)

1. Premjestiti `ModuleGateProvider` iznad globalnih hostova u `src/App.tsx` — odmah unutar `BackButtonProvider`, tako da omata i `GlobalReceiptScanHost`, `GlobalPDFImportHost`, `GlobalDecisionCaptureHost` i `AppRoutes`. Jedina izmjena: pomak dva JSX taga.
2. Ojačati fallback u `useModuleGate` da u dev/build logira `console.warn` kad se koristi bez providera (tihi no-op ostaje za testove), da se ista klasa kvara više ne pojavi nijemo.
3. Regresijski test: render `AttachmentBar` s `showKrug` unutar `ModuleGateProvider` + smoke test koji tvrdi da su globalni hostovi u `App.tsx` unutar `ModuleGateProvider` (source-level guard, po uzoru na postojeće guardove).

Nakon popravka: klik na Krug chip otvara picker za korisnike s pravom, odnosno `ModuleUpgradeDialog` za one bez prava.
