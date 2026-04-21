
## Razumijem — bez novog APK-a

Imaš pravo. Kamera je radila prije, znači problem nije u nativnom Capacitor sloju (taj kod već postoji u instaliranom APK-u i ne trebamo ga dirati). Problem je nastao u **web kodu** koji se učitava preko Live Sync — i to mogu popraviti bez ikakvog rebuilda.

## Gdje je nastao problem

Trebam pogledati git/file povijest ovih fileova da nađem točno koji je commit pokvario stvar:

1. **`src/components/add-expense/AddExpenseDialog.tsx`** — `handleNativeCapture` funkcija (poziva nativnu kameru i šalje na `parse-receipt`)
2. **`src/hooks/useReceiptScanner.ts`** — `scanReceipt` funkcija (radi fetch na edge funkciju)
3. **`src/components/add-expense/ReceiptCaptureButtons.tsx`** — gumbi koji okidaju snimanje

Ključni dokaz: u Supabase logovima `parse-receipt` edge funkcije **nema poziva** od kad si prijavio problem. Znači slika ni ne kreće s uređaja prema serveru. Pad je u web JS kodu, prije fetcha — i to nakon neke nedavne izmjene koju ću pronaći čitanjem trenutnog stanja tih fileova i usporedbom s logikom koja je nekad radila.

## Što ću točno napraviti (samo web izmjene)

### Korak 1: Forenzika
Pročitati trenutno stanje `useNativeCamera.ts`, `AddExpenseDialog.tsx`, `useReceiptScanner.ts` — utvrditi:
- vraća li `useNativeCamera` strukturirani objekt ili string (ako je nedavno mijenjano, možda pozivatelj još očekuje string i tihi pad uništava tijek)
- gađa li `scanReceipt` točno endpoint `parse-receipt` s ispravnim payloadom
- postoji li negdje `early return` koji proguta sliku

### Korak 2: Vraćanje na poznato dobro ponašanje
- Vratiti `useNativeCamera` na **jednostavni return tipa string** (`data:image/jpeg;base64,...` ili `null`) — kako je radilo prije, da pozivatelj ne treba mijenjati interface
- Zadržati `CameraResultType.Base64` ako je to bilo originalno (ili `DataUrl` — što god je bilo u verziji koja je radila)
- Ukloniti svaki novi permission `request` koji nije bio tamo prije (nativni APK već ima dozvole; novi web kod ih ne treba ponovno tražiti)

### Korak 3: Ponovno spojiti s `scanReceipt`
- Osigurati da `handleNativeCapture` proslijedi `dataUrl` direktno u `scanReceipt`
- Dodati 3 mala `console.warn` markera (📸 capture start, 📸 got image size=X, 📤 sending to parse-receipt) **samo radi sljedeće dijagnostike** — bez logičkih izmjena
- Bez `try/catch` koji proguta grešku bez prikaza

### Korak 4: Verifikacija u logovima
Nakon izmjene, ti probaš slikati račun i ja u sljedećoj poruci provjerim:
- console logove iz preview-a (vidim li "📸 got image")
- `parse-receipt` edge logove (vidim li poziv)

Ako poziv stigne na server → kamera + slanje rade, ostalo je serverska logika.
Ako poziv ne stigne → još imam log točke i znam točno gdje je puklo.

## Što se NE dira
- Nativni Android kod / Capacitor plugini → **bez `cap sync`, bez novog APK-a**
- `parse-receipt` edge funkcija
- `useReceiptScanner` interna logika
- Bilo što izvan ova 3 web file-a

## Datoteke za izmjenu (samo web, Live Sync ih dohvaća automatski)
- `src/hooks/useNativeCamera.ts` — vratiti na jednostavni interface koji je radio
- `src/components/add-expense/AddExpenseDialog.tsx` — uskladiti `handleNativeCapture` s tim interfaceom
- (po potrebi) `src/components/add-expense/ReceiptCaptureButtons.tsx` — ako tamo postoji nedavna izmjena koja blokira okidanje

## Rezultat
- Otvoriš app na telefonu (postojeći APK, bez ažuriranja)
- Live Sync povuče novi web kod
- Skeniranje računa ponovno radi kao prije
- Bez nikakvog `git pull`, `npm install`, `cap sync`, niti rebuilda APK-a
