
# Plan: Sakrivanje mrtvih HRK bank računa iz Walleta

## 1. Gdje filtrirati — **Opcija A (UI filter)**

Filtrirati u prezentacijskom sloju, ne pri sync/link upisu.

**Zašto A, ne B:**
- B (guard u `bank-sync-transactions` / `bank-link-account`) dira produkcijsku sync logiku koju smo upravo throttleali — nepotreban rizik.
- Ako EB jednog dana vrati stvarni HRK račun, B bi ga tiho progutao. A ga samo sakrije uz jasan uvjet i lako je vratiti.
- Baza ostaje istinit odraz onoga što EB javlja — dobro za buduće revizije.

**Konkretno mjesto filtra:** `src/hooks/useBankConnections.ts`, `accountsQuery` selector — vrati filtriran niz. Time je jedna točka istine za sve komponente koje čitaju hook (`OpenBankingPanel`, i buduće). Ne diramo `OpenBankingPanel.tsx` po jsx granama.

## 2. Uvjet za skrivanje

```
currency = 'HRK'
AND balance = 0
AND last_synced_at IS NULL
AND linked_payment_source_id IS NULL
```

Sva četiri uvjeta zajedno. `last_synced_at IS NULL` i `linked_payment_source_id IS NULL` su zaštitni pojasi: ako korisnik račun ikad linkao na payment source ili je EB ikad povukao transakcije, ne diramo ga bez obzira što je valuta HRK.

## 3. Provjera rizika false-hide (read-only nalaz)

Milanova `bank_accounts` (5 redova, sve Erste, sve `active`):

| Currency | Balance | last_synced_at | linked_ps | Sakriti? |
|---|---|---|---|---|
| EUR 57.34 | linked → "Tekući zaštićeni" | sinkroniziran | da | **NE** |
| EUR −3.00 | linked → drugi source | sinkroniziran | da | **NE** |
| EUR 0.00 | nesink., nelinked | — | — | **NE** (EUR, izvan opsega) |
| HRK 0.00 | nesink., nelinked | — | — | **DA** |
| HRK 0.00 | nesink., nelinked | — | — | **DA** |

Nijedan HRK račun s prometom, saldom ≠ 0, ili linkom ne postoji. Uvjet ne pogađa niti jedan aktivan račun. Napomena: postoji jedan **EUR** račun s 0.00 i bez sync-a (`d3782fc0…`) — nije predmet ovog filtra, ostaje vidljiv.

## 4. Utjecaj na balance

Nula. Ti HRK redovi imaju `linked_payment_source_id = NULL`, znači nisu spojeni ni na jedan `custom_payment_sources` red pa ne ulaze u balance engine. Filtriramo samo prikaz u Wallet listi bank računa.

## 5. Reverzibilnost

Potpuno. Filter je 4-uvjetni `Array.filter` u jednom hooku. Uklanjanje = maknuti taj poziv. Baza netaknuta, sync netaknut, RLS netaknut.

## Opseg izmjene (kad Milan odobri build)

Jedan file: `src/hooks/useBankConnections.ts` — dodati filter u `accountsQuery.queryFn` return. ~5 linija. Bez migracije, bez i18n, bez UI komponenti.

## Ne dira

- ❌ `bank-sync-transactions` (upravo dobio throttle, ne diramo)
- ❌ `bank-link-account`
- ❌ bazu (nema migracije, nema DELETE)
- ❌ balance/anchor engine
- ❌ RLS

## Otvoreno pitanje

Uvjet uključuje `currency = 'HRK'` doslovno. Ako EB ikad vrati stariju šifru poput `'HRK '` s razmakom ili `'191'` (ISO numeric), promakla bi. Predlažem striktno `'HRK'` — jednostavno, i pokriva sve Milanove trenutne redove. OK?
