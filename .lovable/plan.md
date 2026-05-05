## Što sam zatekao u kodu (činjenice, ne pretpostavke)

Na glavnom ekranu (`/`, `src/pages/Index.tsx`) postoje **dva odvojena prebacivača** koji se međusobno NE sinkroniziraju:

1. **`BusinessProfileSwitcher`** (u headeru) — mijenja `activeBusinessProfileId` + `businessModeEnabled` u `AppStateContext`.
2. **`WalletViewModeChips`** (u `PersonalModeView`) — mijenja `mode` u `WalletViewModeContext` (`'all' | 'personal' | 'business:<uuid>'`), spremljeno u `localStorage` ključ `wallet_view_mode`.

### Posljedice koje korisnik vidi

- **Saldo / Neto vrijednost / Novčanik kartice** se računaju iz `customPaymentSources` (`src/hooks/useCustomPaymentSources.ts`). Taj hook gleda **samo `activeBusinessProfileId`**, NE gleda `WalletViewMode`. Zato klik na chip "Osobno"/"Tvrtka" u `WalletViewModeChips` ne mijenja popis izvora ni saldo.
- **Transakcije** (`useExpenseFetch.ts` → `dashboardExpenses`) se filtriraju **po `WalletViewMode`**, a ne po `activeBusinessProfileId`. Zato lista transakcija reagira na chip, ali kartice iznad ne.
- Rezultat: dva chipa koja izgledaju isto rade dvije različite stvari, dio UI reagira a dio ne → korisnik vidi nekonzistentnost.

Memorija `wallet-view-mode-unified` opisuje stanje koje **nije implementirano** u kodu (`'all'` mod još postoji, `BusinessViewSync` hook ne postoji). Prošli pokušaj koji je srušio app vjerojatno je pokušao upravo ovo bez stabilnog mjesta za hookove — pa ćemo to riješiti drugačije.

---

## Plan rješenja (jedan izvor istine)

**Princip:** `activeBusinessProfileId` (iz `AppStateContext`) postaje JEDINI izvor istine. `WalletViewModeContext` postaje tanki adapter nad njim — bez vlastitog `localStorage`, bez vlastitog state-a koji može desinkronizirati.

### Korak 1 — `WalletViewModeContext` postaje derivat `AppStateContext`
- Ukloniti vlastiti `useState` i `localStorage` u `WalletViewModeContext.tsx`.
- `mode` se izvodi iz `activeBusinessProfileId` + `businessModeEnabled`:
  - `businessModeEnabled && activeBusinessProfileId` → `business:<uuid>`
  - inače → `personal`
- `setMode(m)` poziva `setActiveBusinessProfileId` + `setBusinessModeEnabled` iz `AppStateContext`.
- Ukloniti opciju `'all'` (sukladno memoriji `wallet-view-mode-unified`); `WalletViewModeChips` već prima `hideAll`, samo postavimo default na skriveno i očistimo tip.
- Migracija: ako u `localStorage` postoji `wallet_view_mode`, **ignoriraj ga** (samo obriši pri prvom učitavanju). Ne čitamo, ne pišemo više taj ključ.

### Korak 2 — `useCustomPaymentSources` već radi ispravno
Hook već filtrira po `activeBusinessProfileId`. Kad Korak 1 sinkronizira chip → `activeBusinessProfileId` se mijenja → hook automatski refetcha → saldo, broj izvora, neto vrijednost se mijenjaju. **Ne treba nikakva promjena u tom hooku.**

### Korak 3 — `useExpenseFetch` ostaje funkcionalno isti
Već filtrira `dashboardExpenses` po `WalletViewMode`. Pošto je `WalletViewMode` sad derivat `activeBusinessProfileId`, transakcije i kartice će se mijenjati zajedno. **Logika filtriranja se ne mijenja**, samo izvor `mode` vrijednosti.

### Korak 4 — `netWorth` u `Index.tsx` (linija 241–251)
Već se računa iz `customPaymentSources` + `installmentPlans`. Pošto se `customPaymentSources` mijenja po `activeBusinessProfileId`, `netWorth` će pratiti automatski. **Ne treba promjena.**

### Korak 5 — Dashboard stranica `/dashboard` (`src/pages/Dashboard.tsx`)
Koristi `useExpenses` → `dashboardExpenses` koji već poštuje view mode. Nakon Koraka 1 reagirat će na bilo koji od dva prebacivača (jer su sad isti).

---

## Sigurnosna mjera protiv crasha

Prošli put se app srušio jer je promjena vjerojatno mijenjala redoslijed hookova. Ovaj put:

- **Nijedan novi `useEffect`/`useState`/`useMemo` se ne dodaje iznad postojećih return-guarda** u izmijenjenim datotekama.
- `WalletViewModeContext` postaje "pure derivation" iz drugog konteksta — nema novih hookova ovisnih o uvjetima.
- Bez novih guard-ova, timeout-ova ili workaround flag-ova (sukladno pravilu #1 iz Project Knowledge).
- Datoteke koje mijenjamo: **samo 2** — `src/contexts/WalletViewModeContext.tsx` i `src/components/wallet/WalletViewModeChips.tsx` (ukloniti `'all'` chip + `hideAll` prop postaje suvišan).

---

## Što korisnik dobiva nakon promjene

- Klik na "Osobno" ili "Tvrtka" (bilo gdje — u headeru ili chip ispod) **mijenja sve istovremeno**:
  - broj i popis izvora plaćanja u Novčaniku,
  - ukupan saldo,
  - Neto vrijednost,
  - Prihodi/Rashodi/Transferi kartice,
  - listu transakcija,
  - grafove na `/dashboard`.
- Nema više opcije "Sve" (svejedno je nikad nije bilo smisleno miješati osobno + tvrtka u jedan saldo).
- Jedan izvor istine → nemoguće desinkronizirati.

---

## Datoteke koje mijenjam

```text
src/contexts/WalletViewModeContext.tsx   (refaktor — derivat AppState-a)
src/components/wallet/WalletViewModeChips.tsx   (uklanjanje 'all' chipa)
```

Sve ostalo (`useExpenseFetch`, `useCustomPaymentSources`, `Index.tsx`, `Dashboard.tsx`, `PersonalModeView`) ostaje **netaknuto** — samo automatski počinje raditi ispravno jer dijeli isti izvor.
