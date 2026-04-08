

## Problem

1. **"Spremi" i "Podijeli" rade isto** — `exportFile` na nativnom otvara share sheet, a na webu radi download. `navigator.share` također otvara share sheet. Dakle oba gumba pokreću istu stvar.
2. **Nedostaje kontekstualna akcija** — ako je slika lokalna, logično je nuditi upload u oblak. Ako je u oblaku, nuditi spremanje na uređaj.

## Rješenje

Zamijeniti dva generička gumba s **jednim kontekstualnim gumbom + "Podijeli"**:

```text
Ako je slika lokalna (isLocalReceipt = true):
  [☁️ Spremi u oblak]   [📤 Podijeli]

Ako je slika u oblaku (isLocalReceipt = false):
  [📱 Spremi na uređaj]   [📤 Podijeli]
```

### Promjene u `TransactionDetailDialog.tsx`

1. **Kontekstualni gumb umjesto generičkog "Spremi"**:
   - `isLocalReceipt = true` → "Spremi u oblak": upload u Supabase `receipts` bucket (`supabase.storage.from('receipts').upload(...)`) i ažurira `receipt_url` u expenses tablici na cloud path
   - `isLocalReceipt = false` → "Spremi na uređaj": koristi `exportFile` za web download, a na nativnom sprema kroz `LocalFileCache.saveReceiptImage` i ažurira `receipt_url` na `local:` path
   - Nakon uspješne akcije, ažurirati lokalni state (`isLocalReceipt`, badge)

2. **"Podijeli" ostaje** ali koristit će `navigator.share` s file kad je dostupno, inače fallback na URL share. Neće koristiti `exportFile` kao fallback jer to duplicira funkcionalnost.

3. **Web "Spremi na uređaj"** — na webu (ne-native) koristiti `exportFileWeb` direktno (ovo radi pravi download s `<a download>`), ne `exportFile` koji na nativnom otvara share

### Upload u oblak - logika

```typescript
const handleSaveToCloud = async () => {
  const response = await fetch(freshReceiptUrl);
  const blob = await response.blob();
  const filePath = `${user.id}/${expense.id}.jpg`;
  
  await supabase.storage.from('receipts').upload(filePath, blob, { upsert: true });
  await supabase.from('expenses').update({ receipt_url: filePath }).eq('id', expense.id);
  
  // Cleanup local copy
  LocalFileCache.deleteReceiptImage(...);
  
  setIsLocalReceipt(false);
  // Refresh URL
};
```

### Prijevodi

- `hr`: "Spremi u oblak" / "Spremi na uređaj" / "Podijeli"
- `en`: "Save to cloud" / "Save to device" / "Share"  
- `de`: "In Cloud speichern" / "Auf Gerät speichern" / "Teilen"

### Datoteke za promjenu
- `src/components/TransactionDetailDialog.tsx` — gumbi + upload/download logika
- `src/i18n/locales/hr.json`, `en.json`, `de.json` — novi ključevi

