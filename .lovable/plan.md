## Faza 1 — Vratiti stare artikle (BEZ promjene koda)

Stranica `/recovery/receipt-items` već radi, samo joj treba pristup iz native appa gdje je cache. Najjednostavnije rješenje, nula novih komponenti:

1. Spoji Android telefon na računalo USB-om.
2. Na računalu otvori Chrome → `chrome://inspect/#devices`.
3. Pronađi `app.lovable.costbuddy` (V&M Balance) → klikni **"inspect"**. Otvara se DevTools nad WebView-om aplikacije.
4. U DevTools Console upišeš: `location.href = '/recovery/receipt-items'`
5. Stranica se otvori UNUTAR aplikacije, s pravim lokalnim cacheom. Vidiš listu, ručno potvrdiš restore za one koji su `safe_to_restore`.
6. Nakon završetka, `receipt_cache_*` ključevi se brišu pa cache nestane.

Ako nemaš USB kabel/računalo pri ruci, alternativa: privremeno dodam **skriveni deep link** koji se otvori tipkanjem fraze u globalnu pretragu (npr. "vrati artikle"). Briše se u Fazi 3. Reci ako želiš tu opciju.

## Faza 2 — RCA (Root Cause Analysis)

Već znam tehnički uzrok iz koda (komentar `Index.tsx:348-351`):

> *Wrapper `addExpenseWithRecurringCheck` nije proslijeđivao `items` u `addExpense`. Sve skenirane transakcije od 21.03. do 28.05.2026 ostale su bez `receipt_items`.*

Što još trebam provjeriti u bazi za potpunu sliku:

1. **Koliko je ukupno expense-ova s `ai_extracted = true` u prozoru 21.03.–28.05.2026** (svi useri vs. samo tvoj).
2. **Koliko ih NEMA nijedan red u `receipt_items`** (potvrda opsega štete).
3. **Git/commit timeline:** kad je točno wrapper izgubio `items` argument i u kojem commitu je popravljen.
4. **Funnel events:** ima li ijedan `receipt_items_insert_error` u tom periodu (Index.tsx već logira na liniji 180).

Output: kratak izvještaj — `X expense-ova bez itema u Y dana, popravak u commitu Z, regresija uvedena u commitu W`.

## Faza 3 — Prevencija regresije

Točan uzrok bila je tiha promjena potpisa funkcije: wrapper je preuzeo `(expense)` i izgubio `(expense, items, ...)`. TypeScript to nije uhvatio jer su parametri označeni `any[]`. Tri male mjere:

1. **Regresijski vitest** (`src/hooks/__tests__/addExpenseWithRecurringCheck.test.ts`): mock `addExpense`, pozovi wrapper s `items: [{...}]`, expect da je `addExpense` pozvan s istim `items` arrayom. Ako netko opet ispusti argument → CI fail. To je pravilo iz našeg `mem://architecture/testing-priorities`.
2. **Stroži tipovi**: `items?: any[]` → `items?: ExpenseItem[]`, gdje je `ExpenseItem` već definiran tip. Wrapper i caller dobiju istu signaturu pa TS prijavi mismatch.
3. **Runtime safety net u `useExpenseCRUD.addExpense`**: ako `ai_extracted === true` ali `items` undefined ili prazan, logiraj u `funnel_events` (npr. event `receipt_items_missing_warning`) prije inserta. Već imamo infrastrukturu za funnel events. Ovo NE blokira insert (ne želimo guard/timeout patch), samo daje vidljivost ako se opet pojavi.

## Što ovo NE radi

- Ne dodaje gumb u postavkama.
- Ne dodaje banner na dashboardu.
- Ne mijenja write-path logiku (samo dodaje tip + test + warning log).
- Ne mijenja recovery stranicu.
- Nema native build promjene → bez version bumpa.

## Redoslijed izvršavanja

Faza 1 prvo, jer ne ovisi o kodu i odmah daje konkretne podatke. Faza 2 čim potvrdiš da sam smio gledati tvoje expense-ove u bazi (treba mi tvoj user_id ili dopuštenje za query nad svim podacima). Faza 3 nakon što potvrdiš RCA brojke.
