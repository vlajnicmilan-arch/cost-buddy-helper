## Problem (potvrđeno čitanjem koda)

U **osobnim transakcijama** gumb "Skeniraj" RADI jer je realiziran kao:

```tsx
<AddExpenseDialog autoScan triggerVariant="scan" triggerLabel="Skeniraj" />
```

Dijalog koristi **vlastiti ugrađeni trigger gumb** (Radix `DialogTrigger`). Klik → Radix interno mountira dijalog → tek onda `autoScan` useEffect okida kameru. Sve refove (`cameraActiveRef`, `useBackButton`) su već registrirani prije nego što kamera startuje.

U **poslovnim transakcijama** isti gumb NE radi jer je realiziran kao:

```tsx
<Button onClick={() => setBusinessScannerOpen(true)}>Skeniraj</Button>
<AddExpenseDialog autoScan externalOpen={...} onOpenChange={...} hideTrigger />
```

Trigger je **van dijaloga**, na roditeljskoj komponenti (`BusinessModeView.tsx`, `Business.tsx`). Kad Android prebaci na Camera activity i vrati se, popstate ili neki effect na roditeljskoj komponenti može uzrokovati re-render/odmount, što sruši dijalog s njim. Plus — state se postavlja na roditelju, dijalog se mountira tek nakon što React commit-a, što daje race s `autoScan` timerom.

## Rješenje

Pretvoriti poslovni "Skeniraj" gumb u **identičan obrazac** kao osobni — koristiti ugrađeni trigger dijaloga.

### Promjene

**1. `src/components/home/BusinessModeView.tsx`**
- Ukloniti `businessScannerOpen` state (linija ~116)
- Ukloniti zaseban `<Button onClick={() => setBusinessScannerOpen(true)}>` (linije ~290–294)
- Ukloniti zaseban `<AddExpenseDialog ... externalOpen={businessScannerOpen}>` na dnu (linije ~350–357)
- Zamijeniti scanAction da bude direktno:
  ```tsx
  scanAction={
    <AddExpenseDialog
      onAdd={props.onAddExpense}
      autoScan
      triggerVariant="scan"
      triggerLabel={t('common.scan', 'Skeniraj')}
      triggerClassName="h-9 gap-1 border-primary/30 text-primary"
      businessProfileId={activeBusinessProfileId}
    />
  }
  ```

**2. `src/pages/Business.tsx`**
- Ista preinaka: maknuti `scannerOpen` state (linija 45)
- Maknuti zaseban `<Button onClick={() => setScannerOpen(true)}>` (linije 146–154)
- Maknuti zaseban `<AddExpenseDialog ... externalOpen={scannerOpen}>` (linije 174–181)
- `scanAction` postaje ugrađeni `AddExpenseDialog` s `triggerVariant="scan"`

**3. Provjeriti `triggerVariant="scan"` u AddExpenseDialog.tsx**
Potvrditi da postoji "scan" varijanta trigger gumba. Ako ne — dodati je da prikazuje `<ScanLine>` ikonu i odgovarajući teal stil koji je već korišten u osobnim transakcijama.

### Što ovaj plan NE radi

- Ne dira `useReceiptScanner.ts` — taj kod je dokazano funkcionalan
- Ne dira logiku `parse-receipt` edge funkcije
- Ne dira `handleNativeCapture` ni `useBackButton` — radi u osobnom modu, znači radi
- Ne mijenja `autoScan` mehanizam — samo uklanja roditeljski state koji ga sabotira

### Rizici

Nema regresije za osobne transakcije (nemamo dirati taj kod). Jedini rizik je da poslovni `activeBusinessProfileId` mora biti dostupan unutar `AddExpenseDialog` — već je riješeno kroz `useBusinessMode` kontekst koji dijalog već čita (vidjeli smo `effectiveBusinessProfileId` u kodu).

### Testiranje

Nakon primjene: u poslovnom modu klikni "Skeniraj" → kamera se otvori → snimi → vrati se → dijalog mora ostati otvoren s preview rezultatima (isto kao u osobnom modu).
