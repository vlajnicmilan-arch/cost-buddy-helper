
# Faza 2 — Family modul: Proporcionalna podjela troškova  ✅ DOVRŠENO (1.6.2026)

Cilj: omogućiti obiteljima da dijele troškove proporcionalno prihodu, s privacy kontrolom, eksplicitnim pristankom i transparentnim "tko kome duguje". Real-time obračun, override kroz badge (ne push), audit trail.

## Princip

- **Real-time obračun** (live) + tooltip "projekcija na kraj mjeseca"
- **Override = badge u feedu**, nikad push notifikacija
- **Smart prompting odgođen** (čeka 3-6 mjeseci podataka)
- **Snapshot cache** umjesto RPC-per-transaction (computational sanity)
- **Currency-aware** (Marko €, Ana CHF → konverzija prije omjera)
- **Audit trail** (`family_split_audit`) za sve override-e i promjene modela

---

## Korak 1 — Schema + pure helperi + RPC (bez UI)

### DB migracija

**`expenses`:**
- `is_private` boolean DEFAULT false (parcijalni indeks `(user_id) WHERE is_private=true`)
- `split_overrides` jsonb (per-transaction override: `{userId: ratio}`)

**`family_members`:**
- `income_share_consent` boolean DEFAULT false
- `income_share_consent_at` timestamptz
- `declared_monthly_income` numeric
- `declared_income_currency` text DEFAULT 'EUR'
- `monthly_contribution` numeric (stipendija, džeparac)

**`family_groups`:**
- `split_mode` text CHECK in (`equal`,`proportional_income`,`manual`) DEFAULT `equal`
- `split_income_source` text CHECK in (`auto_3m`,`declared`,`hybrid`) DEFAULT `hybrid`
- `shared_categories` text[]
- `currency` text DEFAULT 'EUR'

**Nove tablice:**
- `family_settlements` — period, dugovnik, vjerovnik, iznos, status, payment_expense_id
- `family_split_audit` — group_id, user_id, action, before/after jsonb
- `family_split_snapshots` — materijalizirani cache (group_id, period, member_id, shared_total, owed, paid)

Sve s GRANT-ovima (authenticated + service_role), RLS, policies vezane na `is_family_member`/`is_family_owner`.

### Pure helperi (vitest)

`src/lib/familySplit.ts`:
- `computeIncomeRatio(members, incomes, currency, exchangeRates)` — currency-aware
- `applyConsent(members, ratios)` — pending članovi izvan podjele
- `excludeZeroIncome(members)`
- `applyMonthlyContribution(members)`
- `projectMonthEnd(spent, daysElapsed, daysInMonth)` — linearni trend

`src/lib/familySettlements.ts`:
- `computeSettlements(snapshot)` — netting algoritam
- `generateIBANDeepLink(creditor, amount, reference)` — HR Pay

### RPC (SECURITY DEFINER)

- `compute_family_income_ratio(group_id, source)`
- `refresh_family_split_snapshot(group_id, period_start, period_end)`
- `compute_family_settlements(group_id, period_start, period_end)`
- `record_settlement(settlement_id, payment_source_id)`
- `apply_split_override(expense_id, overrides)` — upiše override + audit

### Triggeri

- `expenses` insert/update/delete na shared sourceu → debounce refresh snapshot (5s)
- `family_members` role/consent change → audit
- `family_groups` split_mode change → audit

---

## Korak 2 — Privacy + per-transaction override (UI)

- **`PrivacyToggle`** u `AddExpenseDialog` i `EditTransactionDialog`
- **`SplitOverrideDialog`** iz `TransactionDetailDialog` (0-100% per član, suma=100%)
- **`OverrideBadge`** u `TransactionListItem` kad postoji `split_overrides`
- **Hookovi:** `useFamilySplit(groupId, period)`, `useFamilyIncomeRatio(groupId)`

Privatne transakcije na shared sourceu: drugi članovi vide row kao "Transakcija (privatno)" bez iznosa, ali saldo se računa.

---

## Korak 3 — Settings, Consent, Settlements tab

### `FamilySplitSettings` (u "Pregled" tabu)

- Mode picker (equal/proportional/manual)
- Income source (auto_3m/declared/hybrid) kad je proporcionalan
- Shared categories multi-select
- Per-member tablica: prihod, valuta, dodatak, consent status

### Consent flow

- `FamilyInvitationConsent` — 2. korak u `JoinFamily` ("Pristajem na proporcionalnu podjelu / Odbij — ostani 50/50")
- Retroaktivni banner za postojeće članove kad vlasnik uključi proporcionalan mod

### `FamilySettlementsTab` — novi tab "Obračun"

- Period selector (ovaj/prošli/custom)
- Live status: "Marko duguje 60€ Ani"
- Tooltip projekcije kraja mjeseca
- "Označi plaćeno" → dialog s payment source + IBAN deep link
- Audit timeline (collapsible)

### Member exit

- Modal s preostalim saldom, opcija obračuna prije izlaska, history ostaje, audit zapis

---

## Tehnički detalji

- **Currency:** `useExchangeRates` već postoji, snapshot u group currency
- **Real-time:** snapshot iz cachea, projekcija = linearni trend (bez ML)
- **Performance:** debounce 5s, snapshot TTL 90 dana, jedan SELECT za period
- **i18n:** novi namespace `family.split.*` (hr/en/de) — mode, privacy, override, consent, settlements, audit, memberExit
- **RLS:** privatne txn maskirane kroz view `family_shared_feed`; settlements vidljive članovima; audit vidljiv članovima (transparentnost), upis samo kroz RPC

---

## Explicitno odgođeno (Faza 3)

Smart prompting, push za override, monthly settlement PDF, Cashflow Forecast integracija, relationship tagovi, reakcije/komentari.

---

## Procjena i rizici

- ~3 dana fokusiranog rada (migracija + helperi + RPC + 3 koraka UI + i18n)
- Retroaktivni consent: pending članovi koriste equal split kao fallback
- Snapshot drift: "Osvježi" gumb + nightly cron full-refresh
- Audit rast: particioniranje po mjesecu nakon 1 godine

Krećemo s **Korakom 1** — DB migracija + pure helperi + RPC. UI dolazi tek u Koraku 2.
