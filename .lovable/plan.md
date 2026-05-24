## Cilj

U `PaymentSourceTransactionsDialog` lista transakcija sortirana je po datumu, pa se transakcije iz jednog uvoza (npr. Diners 7.2.–20.3.) lome u više blokova izmiješanih s ručnim unosima. Trenutno svaki "Uvoz" badge piše ukupan broj svih transakcija iz cijelog uvoza (npr. "34 tr."), što zbunjuje jer u tom bloku može biti samo npr. 5 transakcija.

Rješenje (opcija C): broj uz svaki badge prikazuje **koliko transakcija pripada baš tom susjednom bloku**. Klik na bilo koji badge i dalje otvara isti `ImportBatchDialog` (cijeli uvoz, brisanje vrijedi za sve transakcije iz tog uvoza — to već radi ispravno).

## Promjena u kodu

**Datoteka:** `src/components/PaymentSourceTransactionsDialog.tsx` (redak ~1134–1139)

Umjesto brojanja svih transakcija s istim `import_batch_id` u cijeloj listi, brojati samo **uzastopne** transakcije od trenutnog indeksa nadalje koje dijele isti `import_batch_id`:

```ts
const showBatchStart =
  expense.import_batch_id &&
  (!prevExpense || prevExpense.import_batch_id !== expense.import_batch_id);

let blockCount = 0;
if (showBatchStart) {
  for (let i = index; i < filteredSourceExpenses.length; i++) {
    if (filteredSourceExpenses[i].import_batch_id === expense.import_batch_id) blockCount++;
    else break;
  }
}
```

I zamijeniti `batchExpenseCount` s `blockCount` u prikazu badgea.

## i18n

Trenutno je u JSX-u hardkodirano `"Uvoz • {N} tr."` što krši pravilo "no hardcoded text". Dodati ključeve u `src/i18n/locales/{hr,en,de}.json` pod postojeći namespace `importBatch`:

- hr: `"badge": "Uvoz"`, `"badgeShort": "tr."`
- en: `"badge": "Import"`, `"badgeShort": "tx"`
- de: `"badge": "Import"`, `"badgeShort": "Tx."`

I koristiti `t('importBatch.badge')` + `t('importBatch.transactions')` (već postoji "transakcija") ili novi `badgeShort` za kompaktni prikaz. Predlažem `badgeShort` jer "transakcija" je predugačko za inline badge.

Render:
```tsx
{t('importBatch.badge')} • {blockCount} {t('importBatch.badgeShort')}
```

## Što se NE mijenja

- Klik na badge → otvara isti `ImportBatchDialog` (svi badgevi istog uvoza dijele `batchId`).
- Brisanje iz dialoga → i dalje briše/odljepljuje sve transakcije iz cijelog uvoza, ne samo iz bloka (to je već potvrđeno ponašanje — ručni unosi spojeni s izvodom se vraćaju u prvotno stanje preko `unmerge_import_row`).
- Nema DB migracije, nema promjene u edge funkcijama.

## Test

Vizualno provjeriti u Wallet → Diners izvor: očekujem više "Uvoz" badgeva s različitim brojevima koji se zbroje u ukupan broj iz `ImportBatchDialog` headera.

Bez novih vitest testova — promjena je čisto prezentacijska i lokalna u JSX-u (nema ekstrakcije helpera).
