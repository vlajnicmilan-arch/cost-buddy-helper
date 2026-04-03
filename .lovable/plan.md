

## Plan: Lokalno spremanje podataka na nativnoj aplikaciji

### Trenutno stanje
- Aplikacija koristi Capacitor s `@capacitor/camera` za skeniranje
- Svi podaci idu u cloud (Supabase)
- `localStorage` koristi se za offline queue i postavke

### Što dodati

#### 1. `@capacitor/preferences` — Lokalne postavke
Lagani key-value store za korisničke preferencije, cache kategorija, zadnje korištene postavke. Radi na svim platformama (native + web fallback na localStorage).

#### 2. `@capacitor/filesystem` — Lokalno spremanje slika
Skenirane slike računa mogu se spremiti lokalno na uređaj prije/umjesto uploada u cloud. Korisno za offline scenarije.

#### 3. Hybrid strategija (preporučeno)
- **Scan** → slika se spremi lokalno (`Filesystem`)
- **AI analiza** → kad ima internet, pošalje se na cloud
- **Rezultat** → spremi se lokalno (`Preferences`) + sync u cloud kad je dostupan
- Korisnik može pregledavati skenirane račune i offline

### Implementacija

**Nove datoteke:**
- `src/hooks/useLocalStorage.ts` — wrapper oko `@capacitor/preferences` s web fallbackom
- `src/hooks/useLocalFileCache.ts` — spremanje/čitanje slika lokalno putem `@capacitor/filesystem`

**Izmjene:**
- `src/hooks/useReceiptScanner.ts` — dodati opciju lokalnog cacheiranja skeniranih slika
- `src/components/AddExpenseDialog.tsx` — koristiti lokalni cache za prikaz slika offline
- `package.json` — dodati `@capacitor/preferences` i `@capacitor/filesystem`

### Napomena
Nakon dodavanja novih pluginova, korisnik mora pokrenuti `npx cap sync android` i napraviti novi build u Android Studiju.

