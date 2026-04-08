

## Problem

1. Checkbox "Spremi sliku računa" ne govori korisniku GDJE se slika sprema — nema oznake da je to lokalno na uređaju
2. Slika sa screenshota otvara se na `fzalxjretvtvokiotvkf.supabase.co` — to je stari račun spremljen u cloud prije promjene koda. Novi kod koristi `local:` prefix i sprema lokalno, ali korisnik nema tu informaciju u UI-ju

## Promjene

### 1. Ažurirati label checkboxa u `AddExpenseDialog.tsx`

Na oba mjesta gdje se prikazuje checkbox (linija ~1256 i ~2225), dodati napomenu da se slika sprema lokalno na uređaj:

- Label: `"Spremi sliku računa (na uređaj)"` umjesto samo `"Spremi sliku računa"`
- Dodati mali tekst ispod checkboxa: `"Slika ostaje samo na ovom uređaju"`

### 2. Ažurirati prijevode u `hr.json`, `en.json`, `de.json`

- `scanner.saveImage` → `"Spremi sliku na uređaj"` / `"Save image to device"` / `"Bild auf Gerät speichern"`
- Dodati novi ključ `scanner.saveImageHint` → `"Slika ostaje samo na ovom uređaju"` / `"Image stays only on this device"` / `"Bild bleibt nur auf diesem Gerät"`

### 3. Dodati vizualnu oznaku u `AddExpenseDialog.tsx`

Uz checkbox dodati ikonu `Smartphone` kako bi bilo jasno da je to lokalna pohrana, ne cloud.

### Što se NE mijenja
- `useReceiptScanner.ts` — logika spremanja je već ispravna (lokalno)
- `TransactionDetailDialog.tsx` — prikaz i gumbi "Spremi u oblak" / "Spremi na uređaj" su već implementirani
- Stari cloud receipti nastavljaju raditi (legacy podrška ostaje)

