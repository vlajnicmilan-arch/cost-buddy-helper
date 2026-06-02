## Problem

U "Višestraničan račun" modu, čim korisnik doda prvu sliku (kamera ili galerija), gumb X i Android back gumb prestaju reagirati. Bez slika sve radi normalno.

## Root cause

U `src/components/add-expense/AddExpenseDialog.tsx`:

- `handleNativeCapture` i `handleImageCapture` postavljaju `scanInProgressRef.current = true` prije capture-a (legitimno — sprječava Android popstate da unmounta dialog tijekom kamera roundtripa).
- Nakon capture-a poziva se `processImageBase64(base64, multiMode=true)`.
- U `processImageBase64`, **multi-mode grana** samo doda sliku u `receiptImages` i NE resetira `scanInProgressRef.current`. Reset postoji samo u single-scan grani (`finally` blok oko `scanReceipt`).
- `releaseCaptureGuardSoon()` u finally bloku resetira samo `cameraActiveRef`, ne `scanInProgressRef`.

Rezultat: `scanInProgressRef.current` ostaje `true` zauvijek u multi modu. I `handleBackClose` (linija 557) i `onOpenChange` guard (linija 1031) provjeravaju ovaj ref pa blokiraju zatvaranje dialoga.

## Plan

### `src/components/add-expense/AddExpenseDialog.tsx`

U `processImageBase64`, multi-mode granu (linije 383–386) zamotati u try/finally koji garantirano resetira `scanInProgressRef.current = false` nakon što je slika dodana u kolekciju. Multi-mode ne pokreće stvarni scan — collector samo prikuplja slike — pa nema razloga držati guard nakon dodavanja.

```ts
if (multiMode || showMultiImageCollector) {
  try {
    setReceiptImages(prev => [...prev, base64]);
    setReceiptImage(base64);
    if (!showMultiImageCollector) setShowMultiImageCollector(true);
  } finally {
    scanInProgressRef.current = false;
  }
}
```

Ovime se rješavaju obje rute (kamera i file input) jer obje zovu isti `processImageBase64`. `cameraActiveRef` se nastavlja resetirati postojećim `releaseCaptureGuardSoon()` u finally blokovima oba capture handlera — to ostaje nepromijenjeno jer pokriva legitiman race s Android popstate.

### Što NIJE u opsegu

- Stvarni scan flow (`handleScanMultipleImages`) — radi ispravno, postojeći single-scan guard ostaje.
- `cameraActiveRef` logika i safety-net timeri — ne diramo, pokrivaju drugi scenarij.
- UI / i18n / dizajn — nema promjena.
- Bez novih guard-eva, flag-ova ili timeouta — ovo je popravak korijenskog uzroka, ne workaround.

## Verifikacija

Nakon primjene:
1. Otvori AddExpense dialog → klik "Višestraničan račun" → dodaj 1 sliku → X i back gumb moraju zatvoriti dialog odmah.
2. Single-page scan (bez multi moda) i dalje mora čekati da scan završi prije zatvaranja (guard za real scan ostaje aktivan).
