
# Dijagnoza: automatski raspored bank-sync (read-only)

Sve tvrdnje ispod potvrđene su čitanjem `cron.job`, `supabase/functions/bank-sync-transactions/index.ts` i `src/components/OpenBankingPanel.tsx`. Ništa nije mijenjano.

## 1. Postoji li cron za bank-sync?

**Ne.** `cron.job` sadrži ~15 aktivnih jobova (trial-reminder, check-reminders, milestone-deadlines, monitor-app-health, activation-nudge, process-pending-deletions, cleanup-stale-push-tokens, send-daily-summary itd.). **Nijedan ne zove `bank-sync-transactions` ni bilo koji `bank-*` endpoint.** Filter `jobname ILIKE '%bank%' OR command ILIKE '%bank-sync%'` vratio je 0 redova.

## 2. Kako se `bank-sync-transactions` pokreće?

**Samo ručno, iz UI-a.** Jedini pozivatelj u repou je `OpenBankingPanel.tsx` → `handleSync(acc)` → `supabase.functions.invoke('bank-sync-transactions', { body: { bank_account_id: acc.id } })`.

- Prima **`bank_account_id`** (jedan račun po pozivu).
- **Ne** postoji "sync sve" endpoint — UI ima gumb "Osvježi" po pojedinom računu.
- Funkcija zahtijeva JWT (user token), pa je iz crona pozvati nije trivijalno (treba service role ili synthetic token).

## 3. Rate limit — po računu ili po konekciji?

**Ne može se utvrditi iz našeg koda.** Kod samo prosljeđuje HTTP poziv Enable Bankingu (`ebFetch('/accounts/{account_uid}/transactions?...')`) i pri 429 vraća `fetch_failed_429`. Nema logike koja bi otkrila je li limit per-account ili per-session/consent.

Danas viđena poruka: `ASPSP_RATE_LIMIT_EXCEEDED` — to je limit **ASPSP-a (banke)**, ne EB-a. PSD2 regulativa (RTS on SCA, čl. 10) definira **4 dohvata podataka po računu / 24h** kad korisnik nije prisutan (unattended). Kad je korisnik prisutan (SCA unutar 90 dana), nema limita. Većina hrvatskih banaka (Erste uključujući) taj limit tumači **per-account per-24h**, ali to treba **potvrditi u Erste/EB dokumentaciji** — ne izvodim to iz koda.

Praktični worst case za planiranje: **4 poziva po računu dnevno**.

## 4. Troši li ručni "Osvježi" istu kvotu?

**Da.** Ručni i automatski poziv idu istim putem (`ebFetch → GET /accounts/{uid}/transactions`). ASPSP broji HTTP pozive, ne razlikuje "user pressed refresh" od "cron ran". Milanovih 4+ ručnih klika danas potrošilo je dnevnu kvotu.

## 5. Koliko EB poziva jedan sync napravi?

**≥ 1 po računu, moguće više zbog paginacije.** Petlja `do { ebFetch(...) } while (continuation_key && safety < 20)` — svaka stranica je jedan poziv. Za normalan sync (posljednji `last_synced_at`, malo novih transakcija) tipično **1 poziv**. Za prvi sync (90 dana povijesti) može biti više stranica.

Milan ima Erste (5 računa) + Revolut (0 računa) = **5 računa × ~1 poziv = ~5 EB poziva po "sync sve" ako bi netko sve odjednom vrtio**. Kvota po računu je neovisna, pa "sync sve" ne troši quotu jednog računa 5×.

## 6. Ima li throttle u kodu?

**Ne.** Funkcija nema:
- provjere "koliko je prošlo od `last_synced_at`",
- brojača dnevnih poziva,
- cooldowna nakon 429.

Slijepo zove EB pri svakom triggeru. Jedina "zaštita" je `last_sync_error` koji se upisuje nakon neuspjeha, ali ne blokira sljedeći poziv.

## Zaključak

| Pitanje | Odgovor |
|---|---|
| Cron za bank-sync | **Ne postoji** |
| Trigger | Ručno, per account, iz `OpenBankingPanel` |
| Parametri | `bank_account_id` (jedan račun) |
| EB poziva po sync | 1 (obično), do 20 (paginacija) |
| Rate limit | PSD2: 4/dan/račun (potrebno potvrditi kod Erste/EB) |
| Ručni vs auto | Ista kvota |
| Throttle u kodu | **Nema** |

**Značajno za daljnju odluku (zastajem prije bilo kakve gradnje):**

1. **`bank-sync-transactions` traži JWT usera** — cron ne može direktno zvati funkciju kao Milan bez service-role bypassa ili refactora funkcije da prihvati service-role poziv s `user_id` parametrom. To je arhitektonska odluka koja mijenja auth model.
2. **Nema "sync svi računi"** — cron bi morao iterirati `bank_accounts` (koje? sve u sustavu? samo aktivne?) i zvati funkciju N puta. Multi-tenant efekt (svi useri, ne samo Milan).
3. **PSD2 limit treba potvrditi** prije odabira rasporeda (4/dan = svakih 6h; ako je manje, treba veće razmake).
4. **Throttle je preduvjet** za auto-sync — bez njega bi cron + ručni klikovi zajedno vjerojatno opet udarali u 429.

Čekam Milanovu odluku o smjeru (auth model, opseg multi-tenant, potvrđivanje EB/Erste limita) prije bilo kakvog plana implementacije.
