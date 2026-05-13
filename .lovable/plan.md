## Open Banking — mapiranje računa + auto-sync transakcija

### 1. DB migracija
- `bank_accounts.linked_payment_source_id` (uuid, FK na `custom_payment_sources`, ON DELETE SET NULL, indeks)
- `expenses.bank_transaction_id` (text, nullable, indeks za dedup)
- `expenses.bank_account_id` (uuid, FK na `bank_accounts`, nullable, indeks)
- `bank_accounts.last_synced_at` (timestamptz, nullable)
- `bank_accounts.last_sync_error` (text, nullable)
- Unique constraint: `(user_id, bank_transaction_id)` na `expenses` — sprječava duplikate
- RLS već postoji na `expenses` i `bank_accounts`, ne diramo

### 2. Edge function `bank-link-account`
Body: `{ bank_account_id, payment_source_id | null, create_new?: { name, currency } }`
- Provjeri vlasništvo računa (auth)
- Ako `create_new`: insert u `custom_payment_sources` s istim `business_profile_id` kao bank_account, vrati novi id
- Update `bank_accounts.linked_payment_source_id`
- Vrati updated row

### 3. Edge function `bank-sync-transactions`
Body: `{ bank_account_id }` (ili bez za "sync sve")
- Auth check
- Dohvat Enable Banking session token iz `bank_connections.access_token`
- Provjera valid_until — ako istekao, postavi `last_sync_error`, vrati 410
- GET `/accounts/{account_uid}/transactions?date_from=<last_synced_at ?? -90d>` 
- Za svaku transakciju:
  - Skip ako već postoji `expenses` row s istim `bank_transaction_id` (unique constraint hvata race)
  - Mapiraj: amount, currency, date, description (remittance info), type (income/expense iz credit_debit_indicator)
  - `payment_source_id` = `custom:{linked_payment_source_id}` (ako mapiran), inače skip transakciju s warningom
  - `business_profile_id` = iz bank_accounta
  - `user_id` = auth.uid()
  - `category_id` = null (auto-kategorizacija u zasebnom koraku, opcionalno)
- Update `bank_accounts.last_synced_at` i očisti `last_sync_error`
- Vrati `{ imported, skipped, errors }`

### 4. UI — `OpenBankingPanel`
Po računu (ispod imena):
- **Ako nije mapiran**: dropdown "Poveži s izvorom" (filtrirano po kontekstu) + "Kreiraj novi izvor" gumb
- **Ako je mapiran**: badge s imenom izvora + "Sinkroniziraj" gumb + "Zadnja sinkronizacija: …"
- Loading state tijekom syncа, StatusFeedback po završetku
- Ako `last_sync_error`: crveni inline prikaz s "Reconnect" gumbom (briše konekciju, traži novo spajanje)

### 5. Hook `useBankAccountActions`
Wrapper oko `bank-link-account` i `bank-sync-transactions` s React Query mutations + invalidacija `useBankConnections`, `useExpenses`, `useCustomPaymentSources`.

### 6. i18n ključevi (HR/EN/DE)
`openBanking.linkSource`, `linkSourcePlaceholder`, `createNewSource`, `sync`, `syncing`, `lastSync`, `syncSuccess` (s count), `syncError`, `reconnect`, `sessionExpired`, `notMapped`, `mappedTo`

### 7. Tehnički detalji (ne za korisnika)
- Enable Banking API endpoint: `https://api.enablebanking.com/accounts/{uid}/transactions`
- Croatian Enable Banking format: `transaction_amount.amount` (string), `transaction_amount.currency`, `booking_date`, `credit_debit_indicator: 'CRDT'|'DBIT'`, `entry_reference` ili `transaction_id` kao stable ID, `remittance_information[].content` za opis
- Pagination preko `continuation_key`
- Format `payment_source_id` u `expenses`: prefix `custom:` + UUID (postojeći standard, mem://architecture/balance-sync-and-security)

### Što NIJE u ovom planu
- Auto-sync cron (kasnije)
- AI auto-kategorizacija (kasnije, postojeća kuka)
- Multi-currency konverzija (banka već vraća amount u svojoj valuti, koristi postojeći ECB sustav po prikazu)
- Brisanje obrisanih transakcija u banci (bank API ne podržava reliable delete signal)

### Otvoreno pitanje
Kad korisnik klikne "Sinkroniziraj" za novomapirani račun — koliko unatrag povući?
- **A)** 90 dana (Enable Banking standardni max bez nove autorizacije)
- **B)** Pitati korisnika u dialogu (7d / 30d / 90d)
- **C)** Samo od trenutka mapiranja (najmanje šuma, ali propušta povijest)

Predlažem **A** — jednostavno, automatski, korisnik ne mora ništa odabirati.
