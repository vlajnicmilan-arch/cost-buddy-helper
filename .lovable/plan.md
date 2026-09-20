# Dijagnoza: početna pokazuje 0 transakcija, novčanici uredni

## 1. Pretpostavka je POTVRĐENA

Lanac u `src/hooks/useExpenseFetch.ts`:

- Početni efekt (redak ~538-563):
  ```
  await snapshotHydrationRef.current;
  if (!isLocalMode && isExpensesFresh(userId)) { setLoading(false); return; }
  const { sharedIds } = await fetchOwnedSources();
  await fetchExpenses(sharedIds);
  ```
  Kad je dohvat "svjež", izlazi PRIJE `fetchOwnedSources()`. `sourceBusinessMap` te instance ostaje prazna Map.
- `isExpensesFresh`/`markExpensesFetched` (`src/lib/expensesFreshness.ts`): oznaka je modul-level `Map` u memoriji stranice, prozor 30 s, po korisniku. Nestaje samo pri potpunom gašenju aplikacije — što se točno poklapa s "restart je popravio".
- `viewModeScope.resolveSourceScope`: `custom:<uuid>` koji nije u mapi → `{ known:false }` → skriven u OBA pogleda. Standardni izvori (`cash`, `card`…) su uvijek `known:true, businessProfileId:null` → vidljivi.
- Redci se ipak prikažu jer ih hidrira snimka (sessionStorage `instantCache` ili IndexedDB), pa nema mrežnog dohvata ni greške — otuda nula `expense_fetch_failed` / `source_map_failed`.
- `useAppResume(() => fetchExpenses())` i `refetch` zovu SAMO `fetchExpenses` — `fetchOwnedSources` se nikad ne ponovi, pa mapa ostaje prazna do sljedećeg montiranja instance izvan prozora svježine ili do restarta.

Poklapanje s podacima: 261 redak poslije 16.8. su svi `custom:`; zadnji ne-`custom:` je točno 16.8. Instanca s praznom mapom prikazuje isključivo starije ne-`custom:` retke — a kartice sažetka na početnoj (Ukupni prihodi/troškovi, "Nedavno") gledaju `dashboardExpenses` / `contextFilteredExpenses`, oba kroz `applyViewMode`. Zato je početna prazna.

Zašto je Novčanik ispravan: saldo i broj računa dolaze iz `custom_payment_sources` (balansi), ne iz filtriranih transakcija.

Instance koje montiraju vlastiti `useExpenseFetch` (svaka sa svojim `sourceBusinessMap`): `Index.tsx`, `Dashboard.tsx`, `Wallet.tsx`, `Projects.tsx`, `Budgets.tsx`, `useBudgets`, `useAutoBackup`, `BusinessWallet`, `BudgetFullScreenView`, `ProjectTransactionsTab`, `AttributionSheet`, `AdvanceLinkSection`, `IncomingInvoicesPanel`, `MailReviewList`. Dovoljno je da jedna instanca odradi puni dohvat pa da sve montirane u sljedećih 30 s ostanu bez mape.

## 2. Drugi mogući uzroci istog simptoma

| Uzrok | Moguć? | Razlikovna oznaka u dijagnostici |
|---|---|---|
| Prazna mapa zbog prozora svježine (gore) | DA — poklapa se sa svime | Nema `source_map_failed`, ima uredne `expense_fetch_page`; restart popravlja |
| `source_map_failed` (upit na `custom_payment_sources` padne ili vrati 0) | Ne u ovom slučaju | Uvijek piše `source_map_failed` + prikazuje upozorenje; ovdje ga nema |
| Pogled Osobno/tvrtka zaglavio na tvrtki (`WalletViewModeContext` derive iz `activeBusinessProfileId`) | Ne | Tada bi nestali i ne-`custom:` osobni redci, a firmini bi se vidjeli; ovdje je vidljivo sve do 16.8. |
| Skriveni novčanici (`useHiddenPaymentSources`) | Ne | Utječe samo na `dashboardExpenses`, ne na `contextFilteredExpenses`; ne bi pogodilo točno sve `custom:` retke |
| Hidracija snimke bez mape (utrka snimka ⟶ mapa) | Da, ista klasa greške — kratkotrajna | Nestalo bi samo u prvoj sekundi, ne 10 minuta |
| `sharedAccessScope` filtriranje tuđih redaka | Ne | Pogađa samo tuđe retke na dijeljenim računima, ne vlastite |

## 3. Kad je nastalo

Prozor svježine (`expensesFreshness.ts`) postoji od 14.9. Tvrdo pravilo "nepoznat novčanik = skriven" (`viewModeScope.ts`) dodano je 20.9. (commit `a4622a2bb`, dorada `6b27c2927`). Prije 20.9. prazna mapa je značila "sve je osobno" pa se simptom nije vidio. Dakle: regresija od danas, nastala spojem dviju ranije neovisnih promjena.

## 4. Prijedlog popravka (bez ijednog novog indikatora na ekranu)

Načelo: prozor svježine smije preskočiti MREŽNI DOHVAT TRANSAKCIJA, ali nikad ne smije ostaviti instancu bez mape novčanika. Mapa je jeftina, mala i sigurnosno nužna.

Konkretno, u `useExpenseFetch.ts`:

1. U početnom efektu pozvati `fetchOwnedSources()` UVIJEK, prije provjere svježine; tek nakon toga, ako je dohvat svjež, preskočiti `fetchExpenses`.
2. `useAppResume` i `refetch` pozivaju `fetchOwnedSources()` uz `fetchExpenses()`, tako da povratak u fokus popravlja i eventualno praznu mapu.
3. Dodatna zaštita (dijeljena memorija): mapu novčanik→tvrtka držati u modul-level cacheu kao što se već radi za skrivene novčanike (`useHiddenPaymentSources`), pa nove instance startaju s ispravnom mapom sinkrono, bez trepćenja i bez mrežnog čekanja.
4. Regresijski test: instanca montirana unutar prozora svježine mora imati nepraznu mapu i prikazati `custom:` retke.

Ništa od toga ne dodaje poruke, spinner ni novo stanje na ekranu — mapa se puni tiho u pozadini, a redci ostaju vidljivi cijelo vrijeme.

Rizik: nizak. Jedan dodatni lagani upit po montiranju instance (odn. nula ako se uvede dijeljeni cache). Ne dira se salda/sidra, uvoz, uparivanje, sinkronizacija, RLS ni Krug.

## Napomena
Ovo je samo opis — ništa nije mijenjano, nema migracija ni objave.
