
# Pametnije večernje obavijesti (21:00)

Trenutno `send-daily-summary` šalje 3-4 statične formulacije + streak override → osjeća se kao šablona. Ti hoćeš da push **primijeti nešto konkretno o današnjem danu** i to spomene.

## Ideja

Umjesto fiksnih varijanti, edge funkcija prije slanja izračuna **mali set "zapažanja" o današnjem danu** i odabere najjače jedno. Push tekst se gradi oko tog zapažanja, a streak/budžet ostaje kao sekundarna informacija (ili izostane ako je zapažanje jače).

## Zapažanja koja se računaju (sve iz `expenses`, bez novih tablica)

Za svako se vraća tuple `{type, strength, payload}`. Bira se ono s najvećim `strength`.

1. **`quiet_day`** — danas ukupno < 50% prosjeka zadnjih 14 dana radnih/vikend dana (odvojeno).
   → "Danas si potrošio {X} – skoro {Y}% manje nego inače."
2. **`big_spike`** — danas > 150% prosjeka.
   → "Danas {X} – znatno više od uobičajenog."
3. **`outlier_transaction`** — jedna transakcija ≥ 3× medijan transakcija tog merchanta zadnjih 90d (ili ≥ 2× ako merchant nema dovoljno povijesti, ali iznos > top 10% svih dnevnih transakcija).
   → "Današnjih {iznos} u {merchant} je iznimka – inače tu trošiš oko {medijan}."
4. **`new_merchant`** — danas prva transakcija kod merchanta kojeg nikad nisi imao.
   → "Prvi put trošiš u {merchant} ({iznos})."
5. **`category_shift`** — kategorija koja danas dominira (>40% dnevnog troška) nije među top 3 zadnjih 30d.
   → "Danas je dan za {kategorija} – {X} od {ukupno}."
6. **`zero_spend`** — 0 transakcija danas.
   → "Danas nula transakcija. Rijetko."
7. **`streak_milestone`** — samo na okruglim brojevima (7, 14, 30, 60, 100) ili kad streak **prekine**.
   → "30 dana zaredom unutar budžeta." / "Streak prekinut nakon {N} dana."
8. **`budget_ok_quiet`** (fallback) — kad ništa zanimljivo, kratka neutralna varijanta s 5+ rotirajućih formulacija, **uvijek s konkretnim brojem dana**.

## Logika odabira

```
candidates = [compute each observation]
filter strength >= threshold
if empty → fallback (budget_ok_quiet, rotacija po dayOfYear % N)
else → pick max strength, tie-break: outlier_transaction > new_merchant > spike > quiet > shift
```

Streak se spominje **samo** ako je milestone ili ako fallback path. Inače je u tihoj pozadini (jednom tjedno se može dodati sufiks "(i dalje unutar budžeta)").

## Anti-ponavljanje

Mali kursor u `profiles` (ili novom JSONB `daily_summary_state`):
- `last_observation_type`
- `last_observation_date`
- `last_merchant_mentioned`

Pravilo: ne šalji isti `type` 2 dana zaredom osim ako je strength jako velik. Ne spominji isti merchant 2 dana zaredom.

## i18n

Sve formulacije u edge funkciji kao mape `{ hr: [...], en: [...], de: [...] }` po tipu zapažanja, 3-5 varijanti po tipu za prirodnu rotaciju. Format helper `formatAmount(amount, currency, locale)`.

## Što se NE mijenja

- Cron raspored, quiet hours, auto-pauza nakon 7 neotvaranja, TZ/jezik sync, test gumb u NotificationsSection.
- Push payload struktura (i dalje `daily_summary` tip).
- Klijent (NotificationsDropdown itd.).

## Testiranje

Test gumb u Settings → forsira računanje svih kandidata i u response vraća listu s `strength` vrijednostima i odabranim. Tako se vidi varira li realno na pravim podacima.

## Verifikacija prije završetka

Pokrenuti test 5-6× s različitim simuliranim danima (insertom dummy expenses pa rollback nije potrebno – samo na pravim podacima kroz nekoliko dana) i potvrditi:
- različiti `type` se pojavljuju
- isti merchant se ne spominje 2 dana zaredom
- fallback se koristi rijetko (< 30% dana kod aktivnog korisnika)

## Tehnički sažetak

- File: `supabase/functions/send-daily-summary/index.ts` — refactor: izvuć́i `computeObservations(userExpenses, today, history)` pure helper + `pickObservation(candidates, state)` + `renderMessage(observation, locale)`.
- Novi pure helperi → `supabase/functions/_shared/dailySummaryObservations.ts` (testabilno vitestom prema memory pravilu "bug → ekstrahiraj helper → test").
- Vitest pokrivenost za computeObservations (quiet/spike/outlier/new merchant/category shift/zero/streak) i pickObservation (anti-ponavljanje, tie-break).
- Migracija: dodati `daily_summary_state JSONB DEFAULT '{}'::jsonb` na `profiles` (ili koristiti postojeću ako postoji – provjeriti prije).
- Bez novih dependencyja, bez promjena na klijentu.
