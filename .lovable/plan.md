## Cilj

Na glavnom dashboardu, kad korisnik klikne chip "Osobno" ili tvrtku, sve metrike (Saldo, Novčanici, Slobodno, Neto vrijednost, Prihodi/Rashodi) prikazuju **samo taj kontekst**.

## Što sam provjerio u kodu

- `useCustomPaymentSources` već filtrira `custom_payment_sources` po `activeBusinessProfileId` (linije 69–78). Saldo, lista novčanika i "Slobodno" će se automatski prefiltrirati čim se ID promijeni.
- `useExpenses` → `useExpenseFetch` već vraća `dashboardExpenses` filtrirane po `WalletViewMode` (linije 300–307). Mjesečni Prihodi/Rashodi već reagiraju na chip.
- `WalletViewMode` (chips) i `activeBusinessProfileId` (AppState) **nisu spojeni** — chips mijenja samo transakcije, AppState mijenja samo novčanike. Memorija spominje `BusinessViewSync` hook, ali on **ne postoji** u kodu.
- `useInstallments` ne filtrira po business kontekstu — to je razlog za odluku ispod.

## Izmjene

### 1. Novi hook `useBusinessViewSync` (`src/hooks/useBusinessViewSync.ts`)

Spaja `WalletViewMode` ↔ `AppState.activeBusinessProfileId` u oba smjera:
- `personal` → `setActiveBusinessProfileId(null)`
- `business:<uuid>` → `setActiveBusinessProfileId(uuid)`
- Na mountu, ako je `activeBusinessProfileId` već postavljen a mode neusklađen, postavi mode na odgovarajuću vrijednost (čuva legacy ekrane koji još koriste `BusinessProfileSwitcher`).

Mountira se jednom u `Index.tsx`.

### 2. `WalletViewModeContext` — ukloniti `'all'`

- Tip skupiti na `'personal' | \`business:${string}\``.
- Init: legacy `'all'` iz `localStorage` → mapirati na `'personal'`.
- Default kad nema ničeg: `'personal'`.

### 3. `WalletViewModeChips.tsx`

- Ukloniti `Sve` opciju i prop `hideAll` (sve točke poziva ionako šalju `hideAll` ili je nemaju potrebnu).
- Prikazivati samo `Osobno` + jedan chip po poslovnom profilu.

### 4. `useExpenseFetch.ts`

- Ukloniti granu `if (viewMode === 'all') return list` (postaje nedostižna).

### 5. `Index.tsx` — `netWorth` (opcija B)

Ne diramo `useInstallments`. Mijenjamo formulu tako da **rate odbijamo samo u osobnom modu**:

```ts
const netWorth = useMemo(() => {
  const totalAccountBalances = customPaymentSources.reduce(...); // već filtrirano
  const obligations = activeBusinessProfileId
    ? 0  // poslovni mod: neto = samo zbroj salda poslovnih računa
    : installmentPlans.reduce((s, p) => s + (p.remainingAmount || 0), 0);
  return totalAccountBalances - obligations;
}, [customPaymentSources, installmentPlans, activeBusinessProfileId, ...]);
```

To je svjesno pojednostavljenje (dokumentirano u memoriji): poslovni neto = likvidnost na poslovnim računima, bez dugova po ratama. Kad se kasnije doda business kontekst na rate, lako se proširi.

## Što ne dirati

- Bez DB migracija.
- Bez izmjena u `useInstallments`, `useExpenses`, `useCustomPaymentSources` (osim što već reagiraju na `activeBusinessProfileId`).
- `BusinessProfileSwitcher` u `HomeHeader` — ostaje zabranjen (po memoriji). Sinkronizacija je dvosmjerna pa preostali ekrani koji ga koriste (npr. neki settings) i dalje rade.
- Bez novih guardova/timeouta.
- Sav novi tekst kroz postojeće i18n ključeve.

## Memorija nakon promjene

Ažurirat ću `mem://features/wallet-view-mode-unified` da odražava da je `BusinessViewSync` sad stvarno implementiran i da je `'all'` u potpunosti uklonjen, te dodati napomenu uz `mem://finance/dashboard-balance-logic` da je `netWorth` u poslovnom modu = samo zbroj salda (bez rata).

## Očekivani rezultat

- Chip "Osobno" → Saldo/Novčanici/Slobodno = osobni računi; Neto = osobni računi − osobne rate; Prihodi/Rashodi = osobne transakcije mjeseca.
- Chip s tvrtkom → Saldo/Novčanici/Slobodno = računi te tvrtke; Neto = zbroj salda te tvrtke; Prihodi/Rashodi = transakcije te tvrtke.
- Projekti, recurring, kalendar, AI assistant — i dalje rade jer i dalje čitaju `activeBusinessProfileId` koji je sad u sinkronu.