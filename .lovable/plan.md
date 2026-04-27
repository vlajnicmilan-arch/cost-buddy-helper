## Problem

Kartica "Duje Grčić" na Home ekranu pokazuje **28.825,52 € preostalo**, dok stranica Projekti za isti projekt pokazuje **16.978,69 € preostalo** (potrošeno 13.021,31 € od 30.000 €).

**Uzrok:** `ActiveProjectsStrip` koristi `allExpenses` iz `useExpenses()` hooka koji dohvaća transakcije s **paginacijom** (Dashboard ne učita sve transakcije iz baze). Stranica Projekti pak koristi `useProjectStats` koji eksplicitno dohvaća **sve** transakcije za zadani projekt iz baze. Zato su sume na Home stripu nepotpune i krive.

## Rješenje

Napraviti novi hook `useActiveProjectsSummary` koji za listu aktivnih projekata dohvaća **sažete sume troškova/prihoda direktno iz baze** (jedan upit po renderu, ne po projektu) i koristiti te brojke u `ActiveProjectsStrip`-u umjesto filtriranja `allExpenses`.

### 1. Novi hook: `src/hooks/useActiveProjectsSummary.ts`

- Ulaz: lista `projectIds` (samo aktivni/draft projekti, max 5).
- Izlaz: `Map<projectId, { spent: number; income: number; txCount: number }>`.
- Implementacija:
  - **Jedan** Supabase upit: `SELECT project_id, type, amount, expense_nature, status FROM expenses WHERE project_id = ANY(...) AND status = 'approved'`.
  - Paginacija (`range`) ako rezultata bude > 1000 — isti pattern kao u `useProjectStats`.
  - Lokalna agregacija u memoriji: filter po pravilima iz `projectCalculations.ts` (ignoriraj `transfer`, `correction`).
  - Vraća `{ summary: Map, loading, refetch }`.
- Ovisnosti: re-fetch kad se promijeni lista `projectIds` (stringified, sortirano) ili `user.id`.

### 2. Izmjena `src/components/home/ActiveProjectsStrip.tsx`

- Ukloniti prop `allExpenses` (više nije potreban).
- Pozvati novi `useActiveProjectsSummary(activeIds)` **iznad** svih early returna (Rules of Hooks).
- U `useMemo`-u koji gradi `ProjectCardData`, umjesto `calculateProjectSpent(projectExpenses)` koristiti `summary.get(p.id)?.spent ?? 0` itd.
- Dok `loading === true`, prikazati postojeći skeleton (već imamo).
- Sva ostala logika (semafor, KPI: profit/loss/remaining/overBudget/items) ostaje **identična**.

### 3. Izmjena pozivatelja

Pronaći mjesto gdje se `ActiveProjectsStrip` renderira (vjerojatno `src/pages/Index.tsx` ili `src/pages/Dashboard.tsx`) i ukloniti prosljeđivanje `allExpenses`.

## Što korisnik vidi nakon promjene

- Na Home ekranu kartica "Duje Grčić" će ispravno pokazati **+16.978,69 € PREOSTALO** (umjesto 28.825,52 €) — identično stranici Projekti.
- "Lucija i Mate" ostaje **29.700,00 € PREOSTALO** (nema transakcija).
- Semafor i KPI logika ostaju iste.
- Pri prvom učitavanju Home ekrana doda se **jedan** dodatni upit prema bazi (zanemariv utjecaj na performanse jer je već paginirano i ograničeno na max 5 projekata).

## Što NE diramo

- `useExpenses` hook, Dashboard liste transakcija, paginacija — sve ostaje kako jest.
- Logika izračuna na stranici Projekti (`ProjectsPanel`, `useProjectStats`) — ostaje izvor istine.
- Funkcije iz `src/lib/projectCalculations.ts` — koriste se i u novom hooku.
- i18n ključevi (`profit`, `loss`, `remaining`, `overBudget`, `items`) — već su dodani.

## Tehnički detalji

- **Upit:** `.in('project_id', projectIds)` umjesto pojedinačnih po projektu — 1 round-trip na bazu.
- **Filtriranje:** koristimo postojeće `calculateProjectSpent` / `calculateProjectIncomeFromTransactions` na nizu po projektu (već dobro testirano, ignorira transfere i korekcije).
- **Realtime/refetch:** ako kasnije bude potrebno, hook izlaže `refetch` koji se može vezati na isti event kao `useExpenses.refetch`.
- **Tipovi:** koristimo postojeći `RawProjectExpense` interface iz `projectCalculations.ts`.
