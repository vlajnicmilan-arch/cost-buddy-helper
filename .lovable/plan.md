## Cilj

Ukloniti "Sve" (mixed personal + sve tvrtke) kao opciju iz cijele aplikacije i sinkronizirati headerski `BusinessProfileSwitcher` s `WalletViewModeContext` da bi `/dashboard`, `/wallet`, `/reports` i Globalna pretraga uvijek prikazivali brojke u skladu s onim što piše u headeru (Osobno ili konkretna tvrtka).

## Promjene

**1. `src/contexts/WalletViewModeContext.tsx`**
- `WalletViewMode` tip: ukloniti `'all'`, ostaje samo `'personal' | \`business:${string}\``.
- Default state: `'personal'` (umjesto `'all'`).
- Pri čitanju iz `localStorage`: ako je vrijednost `'all'` ili neispravna → automatski migrirati na `'personal'` i prepisati u storage (kompatibilnost za postojeće korisnike).
- `isValidMode` više ne prihvaća `'all'`.

**2. `src/components/wallet/WalletViewModeChips.tsx`**
- Ukloniti "Sve" chip i `hideAll` prop u potpunosti.
- Ostaju: "Osobno" + jedan chip po tvrtki.
- Render guard: ako korisnik nema tvrtku (samo "Osobno"), komponenta ne prikazuje ništa (već postoji `items.length <= 1` guard).

**3. `src/components/BusinessProfileSwitcher.tsx`**
- Pri kliku "Osobno" → uz postojeće `setBusinessModeEnabled(false)` i `setActiveBusinessProfileId(null)` dodati `setMode('personal')` iz `useWalletViewMode`.
- Pri kliku na tvrtku → uz postojeće `setBusinessModeEnabled(true)` i `setActiveBusinessProfileId(p.id)` dodati `setMode(\`business:${p.id}\`)`.
- Time se headerski prekidač i wallet view mode kreću kao jedan.

**4. `src/contexts/AppStateContext.tsx`** (sinkronizacija u oba smjera)
- U `setActiveBusinessProfileId` setteru (ili kroz `useEffect` koji prati `activeBusinessProfileId` + `businessModeEnabled`) odraziti promjenu na `wallet_view_mode` u `localStorage` i emitirati `wallet-view-mode-changed` event — za slučajeve kad se profil mijenja iz nekog drugog mjesta (npr. Settings).
- Alternativno (jednostavnije): dodati mali sync hook `useBusinessViewSync` mountan u `App.tsx` ispod oba providera koji sluša promjene `activeBusinessProfileId` + `businessModeEnabled` i poziva `setMode()`.
- Odluka: idemo s **sync hookom** — manje invazivno, ne dira AppState API.

**5. Novi file: `src/hooks/useBusinessViewSync.ts`**
- Mali hook koji čita `activeBusinessProfileId` + `businessModeEnabled` iz `useAppState` i `setMode` iz `useWalletViewMode`.
- `useEffect`: ako je `businessModeEnabled && activeBusinessProfileId` → `setMode(\`business:${id}\`)`, inače → `setMode('personal')`.
- Mountan unutar `WalletViewModeProvider` u `App.tsx` kao prazna komponenta `<BusinessViewSync />`.

**6. i18n cleanup**
- `src/i18n/locales/{hr,en,de}.json` → ukloniti `wallet.viewMode.all` ključ (ostaju `personal` i `business`).
- Ažurirati `wallet.ownerHint` opis iz "Sve / Osobno / Tvrtka" → "Osobno / Tvrtka" u sva tri jezika.

**7. Memorija**
- Dodati novi memo `mem://features/wallet-view-mode-unified` koji opisuje da postoji samo Osobno + tvrtka, da je `BusinessProfileSwitcher` i `WalletViewModeChips` uvijek u sinkronizaciji preko `useBusinessViewSync` hooka, i da je `'all'` mod uklonjen.

## Što se NE mijenja

- `useExpenseFetch.ts` — već radi `applyViewMode` koji za `'personal'` i `'business:<uuid>'` radi točno; samo grana `viewMode === 'all'` više nikad neće biti pogođena (ostaje kao defensive fallback ili ćemo je ukloniti — uklanjamo: `if (viewMode === 'all') return list;` se briše).
- DB schema — nema migracije.
- Reports, Wallet, Dashboard stranice — automatski prikazuju filtrirane brojke jer već koriste `useExpenseFetch`.
- BusinessModeView / PersonalModeView render switch u `Index.tsx` — ostaje vezan na `activeBusinessProfileId` (sync hook osigurava da je view mode usklađen).

## Tehnički detalji

```text
Klik u BusinessProfileSwitcher
        │
        ├─► setBusinessModeEnabled()
        ├─► setActiveBusinessProfileId()
        └─► setMode()                  ← NOVO (direktno u onClick handlerima)

useBusinessViewSync (App.tsx)
   prati AppState i osigurava sync i kad se profil mijenja izvan switchera
```

Migracija postojećih korisnika: prvi ulazak u app nakon deploya → `WalletViewModeContext` čita `'all'` iz localStorage, prepoznaje kao nevažeće, automatski sprema `'personal'`. Bez prekida, bez prompta.

## Kontrolni popis nakon implementacije

- [ ] Klik "Tactura" u headeru → `/dashboard` Bilanca/Prihodi/Rashodi prikazuju samo Tactura brojke.
- [ ] Klik "Osobno" u headeru → `/dashboard` prikazuje samo osobne brojke.
- [ ] `WalletViewModeChips` u Walletu nema više "Sve" chip.
- [ ] Postojeći korisnik s `localStorage.wallet_view_mode = 'all'` automatski završi na "Osobno" bez greške.
- [ ] `useExpenseFetch` više nema `if (viewMode === 'all') return list;` granu.
- [ ] Sva tri jezika (hr/en/de) više nemaju "Sve" string u wallet.viewMode.
