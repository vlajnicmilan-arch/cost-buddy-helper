## Cilj
Da se "AI skenirani račun → spremljen bez `receipt_items`" bug nikad ne ponovi, te da očistimo privremenu recovery infrastrukturu sad kad je posao gotov.

Root cause regresije (21.03.–28.05.2026): `addExpense` ima 4 pozicijska argumenta (`expense, items?, isPending?, entrySource?`). Wrapper u `Index.tsx` u jednom je trenutku proslijeđivao samo prvi argument, pa su `items` tiho padali u `undefined`. TypeScript to nije uhvatio jer su svi opcionalni.

---

## 1. Strukturna prevencija — opcijski objekt umjesto pozicija

`src/hooks/useExpenseCRUD.ts`:
- Zadržati `addExpense(expense, items?, isPending?, entrySource?)` kao thin shim radi kompatibilnosti, ali interno odmah pakirati u objekt.
- Dodati novi primarni potpis:
  ```ts
  addExpense(payload: { expense, items?, isPendingMemberTransaction?, entrySource? })
  ```
  Overload tako da prvi argument može biti ili `Expense` ili `payload` objekt. Stari pozivi rade dalje.
- `Index.tsx` `addExpenseWithRecurringCheck` prebaciti na objekt-formu i sam primati `payload` objekt. Time je nemoguće "izgubiti" `items` na razini wrappera.

Rezultat: novi wrapperi koji forwardaju samo `expense` exploudaju u TypeScriptu, ne tiho.

## 2. Runtime warning + diagnostički log

U `useExpenseCRUD.addExpense`, prije inserta:
- Ako `expense.ai_extracted === true` i (`!items || items.length === 0`) → `console.warn('[ExpenseCRUD] ai_extracted=true bez items — sumnja na regresiju write-patha')` i upis u `app_diagnostics_logs` s eventom `receipt_items_missing_on_ai_scan` (severity=warning, details: caller route, expense.merchant_name).
- Ovo nije blokirajuće (user možda namjerno briše stavke), ali ako se pojavi u logovima znamo odmah.

## 3. Regresijski test (vitest)

`src/hooks/__tests__/useExpenseCRUD.items.test.ts`:
- Mock `supabase.from('expenses').insert(...).select().single()` da vrati `{id:'x'}`.
- Mock `supabase.from('receipt_items').insert(...)` spy.
- Pozvati `addExpense({ expense: aiScanFixture, items: [{...}, {...}] })`.
- Assert da je `receipt_items.insert` pozvan s točno 2 retka i `expense_id='x'`.
- Drugi test: `addExpense({ expense: aiScanFixture })` (bez items) → assert da `receipt_items.insert` NIJE pozvan, ali `app_diagnostics_logs` jest s `receipt_items_missing_on_ai_scan`.
- Treći test: ako `receipt_items.insert` vrati error → `addExpense` mora throwati (ne smije tiho proći).

Time pokrivamo all 3 reprize iste klase buga.

## 4. Uklanjanje recovery infrastrukture

Sad kad je user vratio sve što mu treba i potvrdio da ostali nisu bitni:
- Obrisati `src/components/ReceiptRecoveryBanner.tsx` i unmount iz `Index.tsx`.
- Obrisati rutu `/recovery/receipt-items` iz `App.tsx` i lazy import.
- Obrisati `src/pages/RecoveryReceiptItems.tsx`.
- Obrisati `src/lib/receiptRecovery.ts`.
- Obrisati i18n ključeve `recovery.banner.*` i `recovery.*` iz hr/en/de.
- Ostavi `receipt_cache_*` u localStorageu na miru (čisti se prirodno; nije više linkano nigdje).

## 5. Memory update

Dodaj memo `mem://features/receipt-items-write-path-hardening` (description: "addExpense koristi opcijski objekt, AI scan bez items emitira warning + diagnostic log, regresijski vitest pokriva sve 3 putanje") i u index.md.

## 6. Bez native bumpa

Sve čisti JS/TS, bez Capacitor promjena → `public/version.json` i `build.gradle` ostaju.

---

## Što ovo NE radi
- Ne dira `useReceiptScanner` flow — scan je OK, bug je bio u kasnijem propagiranju.
- Ne mijenja DB shemu (`receipt_items` ostaje kakav je).
- Ne dira write-path za ručno unesene transakcije.
- Ne čisti stare orphane u DB-u (422 starih `ai_extracted=true` bez items ostaje — nije bitno per user).
