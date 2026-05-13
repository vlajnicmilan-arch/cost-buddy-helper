# Sakrij tvrtku na dashboardu kad je poslovni način isključen

## Problem
`WalletViewModeChips` (chipovi Osobno/Tvrtka) provjerava samo `profiles.length > 0`, ne i `businessModeEnabled`. Zato tvrtka ostaje vidljiva i kad je u Postavkama isključen poslovni način.

## Promjene

**1. `src/components/wallet/WalletViewModeChips.tsx`**
- Dodati `useAppState()` i čitati `businessModeEnabled`
- `if (!businessModeEnabled || profiles.length === 0) return null;`

**2. `src/contexts/AppStateContext.tsx` (`setBusinessModeEnabled`, line 239)**
- Kad se `enabled === false`, emitirati event ili pisati `wallet_view_mode = 'personal'` u localStorage da `WalletViewModeContext` resetira filter (inače dashboard ostane u "tvrtka X" view-u dok ne refresha)
- Provjeriti postojeći `useBusinessViewSync` — možda već reagira na promjenu; ako da, samo se osloniti na njega

**3. Verifikacija**
- Provjera da nigdje drugdje na dashboardu (HomeHeader, PersonalModeView) nema dodatnog business UI-a koji ovisi samo o profilima
- Quick smoke test: toggle u Postavkama → dashboard, chipovi nestaju i view se vraća na 'personal'

## Što se NE mijenja
- Aktivan `business_profile_id` se i dalje čuva (tako da kad ponovno uključiš, vraća se na zadnju tvrtku)
- Postojeća logika u AppStateContext za `setBusinessFeatureEnabled` (master switch) ostaje
- Ostale stranice (Wallet, Projects, Reports) — nije u opsegu ovog zadatka
