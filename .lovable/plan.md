# Dnevni sažetak potrošnje + poboljšanja

## DB migracija

**`profiles`**
- `timezone TEXT DEFAULT 'Europe/Zagreb'`
- `preferred_language TEXT` (samo ako ne postoji — provjerit ću prije migracije)

**`notification_preferences`**
- `daily_summary_enabled BOOLEAN DEFAULT true`
- `daily_summary_weekend_enabled BOOLEAN DEFAULT true`
- `daily_summary_last_sent_on DATE`
- `daily_summary_paused_until DATE` — auto-pauza nakon 7 dana neotvaranja
- `daily_summary_unopened_streak INT DEFAULT 0`

**`is_push_category_enabled`** — dodati granu `'daily_summary'`.

---

## Edge funkcija `send-daily-summary`

Cron: `0 * * * *` (svakih sat). Za svaku TZ izračunaj lokalno vrijeme; obradi samo gdje je sada `21:00`.

**Filteri korisnika:**
- `daily_summary_enabled = true`
- vikend → `daily_summary_weekend_enabled = true`
- `daily_summary_paused_until IS NULL OR < today`
- `daily_summary_last_sent_on ≠ lokalni_danas`
- ima aktivan push token

**Po korisniku:**
1. `todaySpend` = SUM `expenses` (type=expense, nature ≠ transfer/correction, date=lokalni_danas, personal scope)
2. Ako 0 → preskoči
3. `monthSpend`, `monthBudget`, `remainingBudget`, `weeklyAvg` (prosjek dnevne potrošnje u zadnjih 7 dana, isključujući danas)
4. Odredi varijantu (rotacija po `dayOfMonth % 3`):
   - **A potrošnja**: `"Danas X € · ovaj mjesec ukupno Y €"`
   - **B preostali budžet** (ako postoji): `"Danas X € · ostalo Z € do kraja mjeseca"`
   - **C napredak** (ako postoji): `"Danas X € · iskorišteno N% mjesečnog budžeta"`
5. **Streak override**: ako 3+ dana zaredom ispod `monthBudget/30` → `"3. dan zaredom unutar budžeta 👍"`
6. **Adaptivni ton** (poboljšanje):
   - `todaySpend < 0.7 × weeklyAvg` → prefix 👍 + "ispod tvog tjednog prosjeka"
   - `todaySpend > 1.5 × weeklyAvg` → suptilno "iznad prosjeka"
7. **Quiet guard**: preskoči ako `auth.users.last_sign_in_at` u zadnjih 30 min (već je u appu).
8. Pošalji preko `send-push` (kategorija `daily_summary`, deeplink `/index`).
9. Zabilježi `daily_summary_last_sent_on` i upiši push log s `kind='daily_summary'`.

**Anti-spam (poboljšanje 6):**
- Funkcija `process-daily-summary-engagement` se zove iz fronta (ili checkano u istoj funkciji): ako je prošli sažetak poslan a korisnik nije otvorio app u sljedećih 24h → `daily_summary_unopened_streak += 1`. Ako otvorio → reset na 0.
- Kad streak ≥ 7 → set `daily_summary_paused_until = today + 30`, pošalji jednu in-app poruku next login: *"Pauzirali smo dnevni sažetak na 30 dana jer ga nisi otvarao."*

**Lokalizacija**: 3 jezika preko mape u edge funkciji, ključ `profiles.preferred_language` (fallback `hr`).

**Cron**: postavlja se preko `supabase--insert` (ne migracija) jer sadrži anon key.

---

## Frontend

**`SettingsDialog` → sekcija "Obavijesti"** nova kartica:
- Toggle **"Dnevni sažetak"** (`daily_summary_enabled`)
- Toggle **"Šalji i vikendom"** (disabled kad je glavni off)
- Helper: *"Svaki dan u 21:00 ako si imao transakcija."*
- Gumb **"Pošalji testnu obavijest"** → invokes `send-daily-summary` s `{ test: true, userId }` (poboljšanje 5)

**`AppStateContext`**: na loginu ako `profiles.timezone` je null → setiraj `Intl.DateTimeFormat().resolvedOptions().timeZone`.

**i18n** ključevi: `notifications.dailySummary.*` (HR/EN/DE).

---

## Datoteke

- nova migracija (kolone + funkcija update)
- `supabase/functions/send-daily-summary/index.ts`
- cron preko `supabase--insert`
- `src/components/settings/...` (notification toggles)
- `src/contexts/AppStateContext.tsx` (TZ setter)
- `src/i18n/locales/{hr,en,de}.json`
- memory: nova `mem://features/daily-summary-push`

---

## Uključena poboljšanja
✅ 1 Quiet hours guard (last_sign_in_at < 30min)
✅ 2 Adaptivni ton (vs 7d prosjek)
✅ 3 Streak detection (3+ dana unutar budžeta)
✅ 5 "Pošalji testnu obavijest" gumb
✅ 6 Anti-spam auto-pauza nakon 7 dana ignoriranja

❌ 4 Tjedni recap nedjeljom — preskačem da ne miješam dva flowa; mogu dodati naknadno ako želiš.
