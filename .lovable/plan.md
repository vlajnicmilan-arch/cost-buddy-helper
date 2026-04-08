

## Spremanje slika računa: lokalno na uređaj + dijeljenje u vlastiti cloud

### Koncept

Slike računa spremaju se **uvijek lokalno na uređaj**. Korisnik dodatno može podijeliti/spremiti sliku u **vlastiti cloud** (Google Drive, iCloud, OneDrive) putem nativnog Share dijaloga — bez ikakvog troška za aplikaciju.

```text
Korisnik fotografira račun
       ↓
  AI parsira podatke (privremeno, cloud)
       ↓
  Slika se sprema LOKALNO na uređaj (automatski)
       ↓
  Korisnik može:
    [Pregledaj]  →  prikazuje sliku iz uređaja
    [Spremi u oblak]  →  otvara nativni Share dialog
                         (Google Drive, iCloud, OneDrive, email...)
```

### Koraci implementacije

**1. `useReceiptScanner.ts` — ukloniti cloud upload, koristiti samo lokalno**
- Zamijeniti `uploadReceiptImage` da uvijek koristi `LocalFileCache.saveReceiptImage()`
- Na nativnoj platformi: sprema u `@capacitor/filesystem` (receipts mapa)
- Na webu/PWA: sprema u IndexedDB kao base64
- `receipt_url` format: `local:receipts/receipt_123.jpg`

**2. `TransactionDetailDialog.tsx` — prikaz lokalne slike + gumb "Spremi u oblak"**
- Prepoznati `local:` prefix → učitati base64 s uređaja putem `LocalFileCache.readReceiptImage()`
- Dodati gumb "Spremi u oblak" koji koristi postojeći `useNativeShare` hook
- Share šalje sliku kao file attachment → korisnik bira odredište (Drive, iCloud, itd.)
- Na webu: fallback na download datoteke

**3. `useExpenseCRUD.ts` — brisanje lokalne slike pri brisanju transakcije**
- Provjeriti `local:` prefix na `receipt_url`
- Obrisati datoteku s uređaja putem `LocalFileCache.deleteReceiptImage()`

**4. Postavke — opcija za čišćenje cache-a slika**
- U `SettingsDialog.tsx` dodati "Očisti spremljene slike računa" s prikazom zauzetog prostora

### Što se NE mijenja
- AI skeniranje i parsiranje ostaje identično
- Nema novih tablica, migracija ni Stripe proizvoda
- Postojeći `receipts` storage bucket ostaje za legacy podatke

### Tehnički detalji

Koriste se već postojeći hookovi:
- `useLocalFileCache.ts` — Capacitor Filesystem za native
- `useNativeShare.ts` — nativni Share dialog za dijeljenje u cloud
- `useLocalStorage.ts` — IndexedDB/Preferences za web fallback

