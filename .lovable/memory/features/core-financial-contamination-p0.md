---
name: Core Financial Contamination P0 Fix
description: Server-side scope filter u useExpenseFetch i useCalendarEvents sprječava da is_project_member RLS branch leakira tuđe projektne transakcije u osobni dataset
type: feature
---

# P0 — Core Financial Contamination Fix

## Problem
RLS na `expenses` dopušta SELECT preko `is_project_member(project_id, auth.uid())`. Klijentski `useExpenseFetch` i `useCalendarEvents` su radili `select('*')` bez `user_id` filtera → tuđe projektne transakcije ulazile u osobni Dashboard, Reports, Calendar, Search, Cashflow, Active Issues svakog sudionika projekta.

## Fix (bez DB/RLS/edge promjena)
- **`src/lib/expenseScope.ts`** — pure helperi `buildExpenseScopeFilter(ctx)` i `belongsToMyScope(row, ctx)`. Scope = `user_id.eq.UID OR payment_source.in.(custom:shared…) OR income_source_id.in.(shared…)`. Shared set = owned `custom_payment_sources` ∪ `payment_source_members` rowovi za usera.
- **`useExpenseFetch`**: `fetchOwnedSources` vraća `sharedIds` direktno; `fetchExpenses(sharedIds)` ih prima kao argument (no race); `.or(orFilter)` u oba query puta (glavni + 401 retry); realtime INSERT/UPDATE handler poziva `belongsToMyScope` prije `setExpenses` (UPDATE koji izađe iz scopea uklanja red iz state-a). `sharedIdsRef` se sinkronizira iz `sharedPaymentSourceIds`. Cache key bumpan `expenses:v1:` → `expenses:v2:`.
- **`useCalendarEvents`**: dohvaća `sharedIds` inline (1 dodatni paralelni Promise) prije expenses query-ja i primjenjuje isti `.or()` filter. `select` proširen s `user_id, payment_source, income_source_id` (potrebno helperu).

## Što NIJE u scopeu
- RLS razdvajanje `is_project_member` → odgođeno za defense-in-depth sweep.
- F1–F5 financial sanitization (P&L/milestone/invoice filteri).
- F8–F10 permissions hardening (manager/worker/owner cleanup).
- Worker model A/B/C izbor.
- Projektni ekrani (`useProjectStats`/`useProjectProfitLoss`/`useProjectMilestones`/`useProjectInvoices`) — oni fetchaju sami sa `.eq('project_id', …)` i ostaju nepromijenjeni.

## Testovi
`src/lib/__tests__/expenseScope.test.ts` — 12 vitest:
- `buildExpenseScopeFilter`: null/solo/shared/branch-count
- P0 regresija: Petar worker NE vidi Milanovu projektnu transakciju (s/bez shared sourcea)
- Shared source flow ostaje: foreign expense na shared sourceu, foreign transfer s destinacijom = shared, foreign expense na nesharedanom sourceu → reject
- Vlastite transakcije uvijek prolaze; null row + null ctx → false

## Rizici / ograničenja
- PostgREST `.or()` string raste linearno sa shared sourcima — realno OK (~20 shared/user max).
- RLS sloj još uvijek dopušta SELECT preko `is_project_member`. Ako se ikad ponovo uvede generički `select('*')` na expenses bez scope filtera, curenje se vraća. Acceptance: nijedan novi konzument expenses-a ne smije zaobići `useExpenseFetch` / `useCalendarEvents` scope.
- `instantCache` v1 zapisi iz prošlosti nisu eksplicitno obrisani — samo zaboravljeni (`v2` ključ se ne preklapa). Storage budget ih očisti vremenom.
