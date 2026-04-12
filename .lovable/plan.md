

# Plan: Ikona računa na transakciji

## Što se radi

Dodati malu ikonu fotoaparata (📷) uz naslov transakcije koja označava da postoji spremljena slika računa (`receipt_url` polje).

## Promjene

### `src/components/TransactionItem.tsx`

1. Importati `Camera` ikonu iz lucide-react
2. Nakon postojećih badge-ova u Title Row (linija 231-243, iza `expense.note` tooltipa), dodati novi tooltip s `Camera` ikonom — prikazuje se samo kad `expense.receipt_url` postoji
3. Dodati `receipt_url` u memo comparison (linija 336-357) da se komponenta rerenderira kad se slika doda/ukloni

### Vizualni dizajn

- Ikona: `Camera` iz lucide-react, veličina `w-3 h-3`
- Boja: `text-emerald-500` (zelena — pozitivna oznaka da slika postoji)
- Tooltip: "Slika računa" (i18n ključ)
- Pozicija: u redu s ostalim ikonama (AI sparkles, note, installment)

### i18n

Dodati ključ `transactions.hasReceipt` u hr/en/de locale datoteke.

## Datoteke za promjenu

| Datoteka | Promjena |
|---|---|
| `src/components/TransactionItem.tsx` | Camera ikona + tooltip + memo update |
| `src/i18n/locales/hr.json` | `transactions.hasReceipt` |
| `src/i18n/locales/en.json` | `transactions.hasReceipt` |
| `src/i18n/locales/de.json` | `transactions.hasReceipt` |

