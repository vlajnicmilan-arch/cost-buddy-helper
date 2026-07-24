# P0 RLS audit — politike s `USING (true)` / `WITH CHECK (true)`

Read-only ispitivanje `pg_policies` (public schema). Nalaz je **znatno manji od očekivanog** — vanjski audit je preuveličao rizik.

## 1. Popis svih permisivnih politika

Ukupno 9 politika u `public` s `qual='true'` ili `with_check='true'`. Grupirano po namjeni:

### A) Service-role only (NIZAK / NAMJERAN)
Ograničene na `service_role` — klijent (anon/authenticated JWT) nikad ne pogađa `service_role`, ove politike su nedostupne s frontenda.

| Tablica | Politika | Cmd |
|---|---|---|
| `email_send_log` | Only service_role can access | ALL |
| `email_unsubscribe_tokens` | Only service_role can access | ALL |
| `suppressed_emails` | Only service_role can access | ALL |

Status: **OK, ne dirati.** Edge funkcije s service_role ključem legitimno pišu.

### B) Javna referentna tablica — SELECT (NIZAK / NAMJERAN)

| Tablica | Politika | Rizik |
|---|---|---|
| `app_settings` | Anyone can read (authenticated) | Sadrži samo runtime kill-switche (`entitlements_mode`, feature flags). Nema PII/financija. **OK.** |
| `paddle_price_map` | readable by authenticated | Javne cijene i mapping module→price_id. **OK.** |
| `ai_route_costs` | authenticated read | Cijene po ruti (unit_cost_eur). Bezopasno. **OK.** |

Status: **OK.** SELECT `true` je namjeran za katalog-tip tablica bez osjetljivih stupaca.

### C) Anonymous/authenticated INSERT s `WITH CHECK (true)` — jedini pravi nalaz

| Tablica | Politika | Roles | Rizik |
|---|---|---|---|
| `app_diagnostics_logs` | Anyone can insert diagnostic logs | anon, authenticated | **SREDNJI** |
| `support_tickets` | Anyone can create support tickets | public | **SREDNJI** |

Oba su **insert-only telemetrija/inbox** — dizajnirano da radi bez sesije (crash na login screenu, kontakt forma iz landing stranice).

**Realne rupe:**
- **Spam/flooding**: bilo tko s anon ključem može pumpati tisuće redova → napuhavanje troška baze i šum u alarmima. Ublažavanje: već postoji `notify-crash` edge fn s IP rate-limitom (20/h), ali direktni PostgREST INSERT na `app_diagnostics_logs` **ne prolazi kroz taj rate-limit**.
- **User-ID spoofing na `app_diagnostics_logs`**: `user_id` je nullable i `WITH CHECK (true)` **ne validira** da odgovara `auth.uid()`. Napadač može podmetnuti tuđi `user_id` u dijagnostiku → truje admin dashboard i telemetriju krivim atribucijama. Nije data breach, ali je audit-log tampering.
- **`support_tickets`**: `email` polje slobodno, ne validira da je vlasnika JWT-a. Napadač može otvoriti tiket "u ime" žrtve; odgovor auto-respondera ide na taj email pa je limitirani phishing/joe-job vektor moguć.

### D) Denial politike (informativno, ne rizik)
`company_lookup_cache`, `notifications` (prevent direct insert), `project_activity_push_throttle` — sve `qual=false` / `with_check=false` za klijente. To je **whitelist zatvaranja**, ne rupa.

## 2. Što NIJE nađeno (dobre vijesti)

- Nula politika na financijskim tablicama (`expenses`, `custom_payment_sources`, `project_*`, `budget_*`, `invoices`, `installments`) koje bi imale `WITH CHECK (true)` za INSERT/UPDATE/DELETE.
- Nula politika koje dozvoljavaju authenticated korisniku upisati red s tuđim `user_id` (osim `app_diagnostics_logs` opisanog gore).
- Osjetljive tablice (`profiles`, `user_roles`, `user_entitlements`, `user_subscriptions`, `bank_connections`, `bank_accounts`) — sve provjeravaju `auth.uid()` ili `has_role()`.

Vanjski nalaz "200+ SECURITY DEFINER poziva iz anon" iz prošlog izvješća je zasebna tema (funkcijske grante), **ne** RLS politike, i ne pokriva se ovim planom.

## 3. Prijedlog plana popravka

**Prioritet 1 — `app_diagnostics_logs` user_id spoofing (jedina prava logička rupa)**
- Zamijeniti `WITH CHECK (true)` s: `WITH CHECK (user_id IS NULL OR user_id = auth.uid())`.
- Rizik lomljenja: **nizak**. Legitimni klijenti već šalju vlastiti `user_id` ili null (crash prije logina). Verificirati u `src/lib/diagnostics*` da nema slučaja gdje se šalje tuđi UUID.

**Prioritet 2 — `support_tickets` email spoofing**
- Za authenticated slučajeve: `WITH CHECK (auth.uid() IS NULL OR email = (SELECT email FROM auth.users WHERE id = auth.uid()))` ili jednostavnije — natjerati `user_id = auth.uid()` kad je JWT prisutan i držati email slobodnim samo za anon (kontakt forma s landing stranice).
- Rizik lomljenja: **srednji**. Trebamo znati koristi li se forma i za "prijavi problem prijatelja" flow. Ako da, treba dodati captcha/rate-limit umjesto stroge validacije.

**Prioritet 3 — Rate-limit na INSERT-only tablice**
- Dodati per-IP ili per-user throttle (npr. `create_diagnostic_log_v2(...)` RPC s brojačem u `activation_nudge_log`-stilu) i **revokati** direktni PostgREST INSERT.
- Rizik lomljenja: **srednji-visok** — mijenja klijentski write-path na sva tri mjesta (diagnostics, support forma, crash reporter). Zahtijeva koordinirani deploy.

**Prioritet 4 — Ne dirati**
- Sve service-role politike ostaju.
- SELECT `true` na `app_settings` / `paddle_price_map` / `ai_route_costs` ostaje (namjerni javni katalog).

## 4. Otvorena pitanja za Milana

1. **`support_tickets` — anonymous submitters:** je li landing kontakt forma (bez logina) i dalje potrebna? Ako je, P2 fix mora zadržati anon put; ako nije, možemo zaključati na `auth.uid()`.
2. **P3 rate-limit:** vrijedi li ulagati u RPC-baziran write-path za dijagnostiku, ili je dovoljno ostaviti direktni INSERT i osloniti se na Supabase infra rate-limite + Sentry?
3. **Šire skeniranje:** želiš li da u istom planu obradim i (a) `SECURITY DEFINER` funkcije koje `anon` može zvati, i (b) tablice **bez ijedne** RLS politike ali s enabled RLS-om (implicitno deny, ali vrijedi provjeriti)? To su zasebni P0 kandidati koji nisu pokriveni ovim naslovom.

## 5. Ključni zaključak

Vanjski audit je preuveličao domet problema. Stvarna slika: **1 prava logička rupa (P1)** + **1 poluotvoreni email spoofing (P2)** + **kozmetika**. Financijski i osobni podaci nisu izloženi kroz `true` politike.
