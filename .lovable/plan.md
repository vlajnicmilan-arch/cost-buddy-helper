## Preostale faze hibridnog bank-first modela

F1 (migracija), F2 (helper + testovi), F3a (CSV/PDF → `bank_only`), F3b (manual/OCR helper) — **gotovo**.

Ostaje 3 koraka, bez utjecaja na trenutni UI dok nema žive bank konekcije.

---

### Korak 1 — Recurring transakcije ostaju `manual`

**Fajl:** `src/hooks/useRecurringTransactions.ts` (funkcija `processDueTransactions`)

- Auto-generirane transakcije iz recurring templatea uvijek dobivaju `bank_match_status: 'manual'`, čak i ako je payment_source vezan na banku.
- Razlog: recurring je predviđanje, ne potvrda. Banka će ih kasnije matchati.
- Match logika (Korak 2) će ih sama prebaciti u `confirmed` kad stigne pravi izvod.

---

### Korak 2 — Match logika u `bank-sync-transactions` (dormant)

**Fajl:** `supabase/functions/bank-sync-transactions/index.ts`

Za svaku novu bank transakciju iz Enable Banking API-ja:

1. Query kandidata: `expenses` istog `user_id`, isti `payment_source` (`custom:UUID`), `amount` ±0.01, `bank_transaction_id IS NULL`, `bank_match_status IN ('pending_bank','bank_only','manual')`, `deleted_at IS NULL`.
2. Vremenski prozor: <10€ strict (isti dan), 10–50€ ±1 dan, >50€ ±3 dana.
3. Odluka:
   - **0 kandidata** → INSERT novi expense, `bank_only`, sa `bank_transaction_id` + `bank_account_id`.
   - **1 kandidat** → UPDATE postojeći: dodaj `bank_transaction_id`+`bank_account_id`, `bank_match_status = 'confirmed'`. Pokriva i CSV/PDF (`bank_only`) i karticu (`pending_bank`) i ručno (`manual`).
   - **>1 ili nesiguran** → INSERT novi `bank_only` + `possible_duplicate_of = <id najbližeg kandidata>`. Fallback samo za stvarno dvojbene slučajeve.

Dormant jer se cron sync aktivira tek kad bude prava banka — sandbox sad ima numeričke reference koje ionako ne matchaju.

---

### Korak 3 — UI badge + "Možda duplikat" sheet

**Fajl:** `src/components/TransactionListItem.tsx` + novi `BankDuplicateSheet.tsx`

- Conditional badge:
  - `pending_bank` → ⏳ ikona (mali, muted, tooltip "Čeka potvrdu banke")
  - `confirmed` → ✅ ikona (teal, tooltip "Potvrđeno bankom")
  - `bank_only`, `manual` → ništa (zero visual noise)
- `possible_duplicate_of` postavljen → "Možda duplikat" badge (amber); klik otvara bottom sheet s usporedbom dvije transakcije + akcije "Spoji" (UPDATE matched → confirmed, DELETE bank_only) / "Nisu isto" (clear `possible_duplicate_of`).
- i18n: `bankMatch.pendingBank`, `bankMatch.confirmed`, `bankMatch.maybeDuplicate`, `bankMatch.merge`, `bankMatch.notSame` (hr/en/de).

---

### Završno

- Update `mem://features/bank-sync-roadmap` da reflektira novi status.
- Bez version bumpa (nema native promjene).
- Bez utjecaja na cashflow, balance, dashboard, recurring matching, soft delete, receipt scanner.

Krećem?