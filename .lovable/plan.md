## Cilj
Kad korisnik zatvori i ponovo otvori aplikaciju, business mode (i odabrana tvrtka) ostaju aktivni — kao i svaka druga postavka.

## Promjena
Jedan file: `src/contexts/AppStateContext.tsx`, linije 73–88.

Ukloniti `sessionStorage` "cold start sentinel" koji prisilno gasi business mode na svakom svježem pokretanju. `businessModeEnabled` se čita direktno iz `localStorage` (kao `activeBusinessProfileId`, `family_mode_enabled`, `usage_profile` itd.).

```ts
const [businessModeEnabled, setBusinessModeEnabledState] = useState<boolean>(
  () => localStorage.getItem('business_mode_enabled') === 'true'
);
```

Ažurirati komentar iznad da odražava novo ponašanje.

## Što se NE mijenja
- `setBusinessModeEnabled` setter — već piše u localStorage.
- `BusinessProfileSwitcher`, `WalletViewModeChips`, `useBusinessViewSync` — ostaju isti.
- `business_feature_enabled` (master switch u Postavkama) — nepromijenjen.
- DB, RLS, edge funkcije — ništa.
- Native (Capacitor) — nema promjene, **bez version bumpa**, jer je to čista web/JS izmjena koja radi i kroz Live Sync.

## Memorija
Ažurirati `mem://features/wallet-view-mode-unified` — maknuti implicitnu pretpostavku o session resetu (ako je ima); zabilježiti da business mode persista kroz cold start.

## Verifikacija
1. Uključi tvrtku u Postavkama → reload preview → ostaje na tvrtki.
2. Prebaci chip na Osobno → reload → ostaje Osobno.
3. Master switch OFF u Postavkama → reload → ostaje OFF (i chip skriven).
