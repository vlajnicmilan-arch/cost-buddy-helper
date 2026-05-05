## Problem

Kada se na dashboardu klikne chip tvrtke, `WalletViewModeContext.setMode('business:<id>')` postavlja `businessModeEnabled = true` + `activeBusinessProfileId = id`. `Index.tsx` zatim na temelju `isBusinessMode` renderira potpuno odvojeni `BusinessModeView` (sa svojim bottom navom, dashboard/transakcije/projekti tabovima). To je "novi ekran" koji ne želiš.

Želiš: jedan glavni dashboard (`PersonalModeView`), chipovi samo prebacuju **kontekst filtriranja** (Osobno vs. tvrtka X) — kartice, saldo, transakcije i izvori se filtriraju kroz već postojeću logiku u `useExpenseFetch` / `useCustomPaymentSources` koja gleda `activeBusinessProfileId`.

## Promjene

### 1. `src/contexts/WalletViewModeContext.tsx`
Decoupling od `businessModeEnabled`:
- `mode` se derivira **samo** iz `activeBusinessProfileId` (ako je `null` → `'personal'`, inače `business:<id>`).
- `setMode('personal')` postavlja samo `setActiveBusinessProfileId(null)` — **ne dira** `businessModeEnabled`.
- `setMode('business:<id>')` postavlja samo `setActiveBusinessProfileId(id)` — **ne dira** `businessModeEnabled`.

Time chip postaje čisti kontekstualni filter, u skladu s memory pravilom *"business_profile = samo kontekstualni filter"*.

### 2. `src/pages/Index.tsx`
- Ukloniti granu `if (isBusinessMode) return <BusinessModeView .../>;`. Uvijek se renderira `PersonalModeView`.
- Ukloniti `businessTab` state, `useBackButton` za business tab, `onBackToPersonal` callback i učitavanje `businessProfile` (nije više potrebno za routing; ako trebamo prikazati naziv tvrtke u headeru, čitamo iz `useBusinessProfiles` po `activeBusinessProfileId`).
- Ukloniti import `BusinessModeView`.
- `isBusinessMode` koji se prosljeđuje `PersonalModeView` postaje `!!activeBusinessProfileId` (samo informativno za UI poput naslova "Posloval kontekst: X").

### 3. Filtriranje podataka — bez izmjena
- `useExpenseFetch` već filtrira `expenses`/`dashboardExpenses` po `WalletViewMode` preko `expenseBusinessProfileId`.
- `useCustomPaymentSources` već filtrira po `activeBusinessProfileId`.
- Saldo, novčanici, prihodi/rashodi, transakcije — sve koristi te hook-ove → automatski reagira na chip.

### 4. Što s ostalim mjestima koja koriste `businessModeEnabled`?
Ostavljamo netaknuto. `businessModeEnabled` ostaje globalna postavka iz Settings (uključuje business modul: tab Projekti, BusinessModeGuard, business sekcije u postavkama, itd.). Chipovi je više ne dodiruju — što je i ispravno semantički.

## QA scenariji (viewport 384x709)
1. Otvori dashboard → vidi se PersonalModeView s chipovima Osobno + tvrtke.
2. Klik na "Osobno" → ostaje na istom ekranu, prikazani samo osobni izvori/transakcije/saldo.
3. Klik na chip tvrtke → **ostaje na istom ekranu** (ne otvara se BusinessModeView), kartice/saldo/transakcije pokazuju samo podatke te tvrtke.
4. Klik natrag na "Osobno" → sve se vraća na osobni kontekst, bez treperenja.
5. Settings → "Poslovni modul" toggle i dalje funkcionira neovisno (utječe samo na vidljivost projekata/poslovnih sekcija, ne na chipove).
