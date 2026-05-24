## Cilj
Prikazati bank-match bedževe (`pending_bank`, `confirmed`, `bank_only`) u dialogu **Transakcije izvora plaćanja** (`PaymentSourceTransactionsDialog`), gdje trenutno nedostaju jer komponenta koristi vlastiti render umjesto `TransactionItem`.

## Stanje
- Bedževi već postoje u svim ostalim listama (glavna lista, projekti, budžeti, kategorije, business) jer one koriste `TransactionItem.tsx` (linije 284–313).
- `PaymentSourceTransactionsDialog.tsx` ima custom inline JSX za svaki red (oko linije 1141+) i ne renderira nikakvu bank-match ikonu.

## Promjena
U `src/components/PaymentSourceTransactionsDialog.tsx`, u redu prikaza opisa transakcije (uz `merchant_name || description`, oko linije 1198), dodati isti set ikona kao u `TransactionItem`:
- `Clock` (muted) → `pending_bank`
- `CheckCircle2` (primary) → `confirmed`
- `Landmark` (muted) → `bank_only`

Svaka ikona u `Tooltip` s postojećim i18n ključevima (`bankMatch.pendingBank`, `bankMatch.confirmed`, `bankMatch.bankOnly`) — nema novih stringova.

## Gotovina
Bez posebne logike — bedž se ionako prikazuje samo ako `bank_match_status` nije `manual`/null. Gotovinske transakcije po defaultu nemaju status pa neće dobiti bedž; ako ga jednom dobiju (npr. ručno spojene), prikazat će se normalno.

## Datoteke
- `src/components/PaymentSourceTransactionsDialog.tsx` — dodati ikone u red opisa
- (po potrebi) import `Clock, CheckCircle2, Landmark` iz `lucide-react` i `Tooltip` komponenti

## Bez utjecaja
- Bez izmjena DB, hookova, i18n datoteka, ostalih lista.
- Bez utjecaja na logiku brisanja, merge, balansa.