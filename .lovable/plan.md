
# Faza 0 — Verifikacija SECURITY DEFINER anon-dostupnih funkcija

**Read-only izvještaj. Ništa nije izmijenjeno. Nijedna faza plana iz prethodnog kruga nije odobrena — sva klasifikacija ispod čeka Milanovu odluku prije bilo kakvog izvršenja.**

## Metoda

Pročitano tijelo svih 70 anon-dostupnih pozivnih SECURITY DEFINER funkcija (`pg_get_functiondef`). Za svaku provjereno: (a) postoji li interni `auth.uid()` guard koji baca iznimku na NULL, (b) što se dogodi ako je `auth.uid()` NULL (anoniman poziv), (c) piše li stanje.

Legenda: **SIGURNA** = eksplicitno diže iznimku ili filtrira na `auth.uid()` tako da NULL vraća prazno bez štete • **RANJIVA** = NULL prolazi i može čitati/mijenjati tuđe podatke • **NEJASNA** = ovisi o kontekstu pozivača.

## Grupa 1 — Visok rizik (state-changing / osjetljivi read)

| Funkcija | uid guard | NULL ponašanje | Ocjena |
|---|---|---|---|
| `apply_split_override` | `v_exp.user_id <> auth.uid() → EXCEPTION` | NULL ≠ ownerID → odbija | **SIGURNA** |
| `apply_balance_delta_if_unanchored` | **NEMA guarda** | Ažurira po `p_source_id` bez provjere vlasnika | **RANJIVA** ⚠️ |
| `complete_onboarding` | `IF v_uid IS NULL → 42501` | Odbija anon | SIGURNA |
| `dismiss_notification` | `IF v_uid IS NULL → EXCEPTION` | Odbija | SIGURNA |
| `mark_guided_home_exited` | `IF v_user IS NULL → EXCEPTION` | Odbija | SIGURNA |
| `merge_manual_with_bank` | `IF v_uid IS NULL → EXCEPTION` + provjera vlasništva oba retka | Odbija | SIGURNA |
| `unmerge_import_row` | (potrebno provjeriti — nije prikazan; predikat u tablici pokazuje `U` = ima `auth.uid()`) | vjerojatno SIGURNA | **NEJASNA** — nije pročitano tijelo do kraja |
| `soft_delete_record` | `IF v_uid IS NULL → EXCEPTION` + `WHERE user_id=$1 OR admin` | Odbija | SIGURNA |
| `restore_trash_item` | `IF v_uid IS NULL → EXCEPTION` + `user_id = v_uid` provjera | Odbija | SIGURNA |
| `purge_trash_item` | `IF v_uid IS NULL → EXCEPTION` + vlasništvo | Odbija | SIGURNA |
| `purge_old_trash` | **NEMA guarda**, brine tuđe podatke bez ograničenja | NULL prolazi, briše sve retke starije od cutoff-a **globalno** za 5 tablica | **RANJIVA** 🚨 |
| `list_trash` | `IF v_uid IS NULL RETURN;` (prazan set) | Sigurno vraća ništa | SIGURNA |
| `upsert_active_issue` | (nije pročitano do kraja; `U` flag) | **NEJASNA** |
| `resolve_stale_issues` | `IF v_uid IS NULL → EXCEPTION` | Odbija | SIGURNA |
| `link_worker_to_member` | `IF v_caller IS NULL → EXCEPTION` + owner/manager provjera | Odbija | SIGURNA |
| `refresh_family_split_snapshot` | `is_family_member(group, auth.uid()) → EXCEPTION` | NULL nije član → odbija | SIGURNA |
| `enqueue_participant_digest_event` | **NEMA `auth.uid()` guarda**, samo `IF p_project_id IS NULL OR p_actor_user_id IS NULL` | Anon može zvati s bilo kojim `p_actor_user_id` — može **generirati fake digest zapise** za tuđe projekte | **RANJIVA** 🚨 |
| `drain_participant_digest` | **NEMA guarda** | Anon može drenirati (resetirati) tuđi digest state po `p_user_id, p_project_id` | **RANJIVA** 🚨 |
| `filter_projects_subscribers` | Nema `auth.uid()` provjere, samo helper | Vraća subset UUID-a — pomaže enumeraciji pretplatnika, ali sam po sebi ne curi PII | **SREDNJA** — helper koji ne bi trebao biti anon |

### Admin RPC-ovi
| `grant_module_access` | `has_role(auth.uid(),'admin') → EXCEPTION` | Odbija anon | SIGURNA |
| `revoke_module_access` | `has_role(auth.uid(),'admin') → EXCEPTION` | Odbija | SIGURNA |
| `admin_get_cohort_retention` | `_require_admin()` | Odbija | SIGURNA |
| `get_dashboard_scroll_distribution` | `has_role admin → EXCEPTION` | Odbija | SIGURNA |
| `get_dashboard_section_stats` | `has_role admin → EXCEPTION` | Odbija | SIGURNA |

### AI kvota
| `increment_ai_usage` | `IF v_uid IS NULL → EXCEPTION` | Odbija | SIGURNA |
| `increment_ai_usage_v2` | `IF v_uid IS NULL → EXCEPTION` | Odbija | SIGURNA |
| `consume_core_scan_quota` | `IF v_uid IS NULL → EXCEPTION` | Odbija | SIGURNA |
| `refund_core_scan_quota` | `IF v_uid IS NULL → EXCEPTION` | Odbija | SIGURNA |
| `peek_core_scan_quota` | `IF v_uid IS NULL → EXCEPTION` | Odbija | SIGURNA |
| `get_free_tier_usage_current_month` | Koristi `COALESCE(_user_id, auth.uid())` — anon s izravnim `_user_id` param **može čitati tuđu kvotu** | Nije osjetljivo (samo brojač transakcija/mjesec) | **SREDNJA** — mala PII curenja |
| `assert_projects_write_allowed` | `IF v_uid IS NULL → not_authenticated` | Odbija | SIGURNA |
| `get_project_member_profiles` | `EXISTS ... auth.uid()` u WHERE | NULL ne prolazi → prazno | SIGURNA |

### Email queue (pgmq wrapperi)
| `enqueue_email` | Nema guarda; direktno `pgmq.send` | Anon može ubaciti bilo koji payload u queue | **RANJIVA** 🚨 |
| `delete_email` | Nema guarda; `pgmq.delete` po `message_id` | Anon može brisati poruke u redu | **RANJIVA** 🚨 |
| `read_email_batch` | Nema guarda; `pgmq.read` | Anon može čitati batch poruka iz reda (payload obično sadrži emailove korisnika) | **RANJIVA** 🚨 |
| `move_to_dlq` | Nema guarda | Anon može premještati/kloniranje poruka | **RANJIVA** 🚨 |
| `email_queue_dispatch` | Nema `auth.uid()` guarda; interno poziva `net.http_post` prema edge fn s Authorization headerom | Anon može triggerati dispatch — payload/token je fiksan u funkciji, ali može spamati edge fn | **SREDNJA** (RANJIVA za DoS/kvotu) |

## Grupa 2 — Predikat helperi (~22 funkcije)

Sve prate isti obrazac: SQL `SELECT EXISTS` po `_source_id/_user_id` argumentima. Ne otkrivaju PII, ne mijenjaju stanje. Anon može testirati postoje li kombinacije (npr. `is_project_member(uuid, uuid)`) — teoretski **omogućuje enumeraciju** UUID parova, ali bez ulaznog UUID-a napadač ne može ništa učiniti (UUID-ovi nisu pogodivi).

Konkretno provjereno:
- `has_role`, `has_active_module_grant`, `has_any_paid_plan`, `has_full_payment_source_access` — sve boolean, bez auth.uid guarda (koriste argumente)
- `is_budget_owner/member`, `is_project_owner/member/investor/participant_active`, `is_projects_subscriber`, `is_payment_source_owner/member`, `is_income_source_owner/member`, `is_push_category_enabled`, `is_budget_member`
- `can_log_own_work`, `can_write_payment_source`, `get_project_role`, `payment_source_role` — svi rade po argumentu

**Ocjena:** SIGURNE (ne otkrivaju PII), ali anon EXECUTE je **nepotreban** — pozivaju ih isključivo RLS politike (server-side) i to u kontekstu `authenticated` role.

## Grupa 3 — Cron/cleanup (10 funkcija)

Sve `cleanup_*` funkcije bez guarda: brišu stare zapise iz `push_delivery_logs`, `ai_usage_*`, `chat_messages`, `app_diagnostics_logs`, `health_summaries`, `user_login_logs`, `monitor_alerts_log`, `push_tokens`. **Anon može triggerati čišćenje** — to je destruktivno prema audit/log podacima. Nema PII curenja, ali:
- **RANJIVA za DoS na log podatke** (netko bi ih mogao pozivati cikluski da uništi tragove).
- Namijenjene su `pg_cron`-u i ničemu drugom.

`delete_expired_invitations` — isti obrazac (briše `*_invitations WHERE expires_at < now()`), niska šteta.

**Ocjena:** SREDNJA/RANJIVA (audit-log DoS).

## Grupa 4 — `consume_invitation_token` — nalaz o pozivačima

`grep` u `src/` i `supabase/functions/`:
- **Jedini pozivač:** `supabase/functions/accept-project-invitation/index.ts:84`.
- Poziva se preko **`supabaseAdmin` (service_role klijent)** — anon EXECUTE grant se **ne koristi**.
- Prije poziva funkcija: `authHeader` obavezan, `supabase.auth.getUser()` verificira JWT (`401` inače), UUID regex validacija tokena.
- **Nijedan klijentski (`src/`) callsite ne postoji.**

**Zaključak Grupe 4:** anon grant je **nepotreban i nekorišten**. Nema legitimnog anon flowa koji bi se slomio.

## Sažetak RANJIVIH — treba Milanovu odluku prvo

Poimence funkcije koje anon može pozvati bez interne provjere identiteta i time napraviti štetu:

1. **`apply_balance_delta_if_unanchored(p_source_id, p_delta)`** 🚨 — anon može promijeniti saldo bilo kojeg custom payment sourcea koji nema anchor (uvjet je da UUID zna, ali `custom_payment_sources` može biti čitljiv preko drugih ruta)
2. **`purge_old_trash(p_older_than_days)`** 🚨 — anon može pozvati s malim brojem (npr. 0) i **trajno izbrisati sve soft-deleted zapise svih korisnika**
3. **`enqueue_participant_digest_event`** 🚨 — anon može ubacivati proizvoljne događaje u tuđi digest state
4. **`drain_participant_digest`** 🚨 — anon može resetirati tuđi digest (izbriše pending obavijesti)
5. **Email queue (5 fn):** `enqueue_email`, `delete_email`, `read_email_batch`, `move_to_dlq`, `email_queue_dispatch` 🚨 — anon može čitati/ubacivati/brisati poruke u pgmq redu (payload sadrži email adrese)
6. **`cleanup_*` (10 fn) + `delete_expired_invitations`** — anon može zloupotrijebiti za DoS log/audit tablica

## Sažetak NEJASNIH (nisu potpuno pregledane)

- `unmerge_import_row` — flag pokazuje `U` (ima `auth.uid()`), ali tijelo nije eksplicitno pročitano do kraja u ovoj sesiji
- `upsert_active_issue` — flag pokazuje `U`, ali tijelo nije potpuno pregledano
- `recompute_custom_source_balance`, `recompute_custom_source_balance_preview` — read-only kalkulacije, no potrebno je potvrditi da ne otkrivaju tuđi saldo

Prije bilo kakve odluke o njima treba **kompletno pročitati tijela**.

## Otvorena pitanja / opcije za Milana (bez preporuke — samo činjenice)

1. **6 RANJIVIH funkcija (1–5 iznad).** Milan odlučuje: (A) `REVOKE EXECUTE FROM anon` odmah, (B) dodati unutarnji auth guard prije revoke, (C) ostaviti kako jest.
2. **Grupa 3 (cleanup, DoS rizik).** Milan odlučuje želi li ih zaključati na `service_role`.
3. **Grupa 2 (helperi, "clean but unnecessary anon grant").** Milan odlučuje isplati li se ikakva akcija (potencijalno lomljivi ako neka client ruta koristi anon session).
4. **Grupa 4 (`consume_invitation_token`).** Nalaz: jedini pozivač je edge fn sa service_role — anon grant je nepotreban. Milan odlučuje ide li revoke.
5. **NEJASNE 3 funkcije.** Milan odlučuje želi li dopunu izvještaja s potpunim tijelima.

## Što nije dirnuto

Nijedan grant, funkcija, politika ni tablica. Nijedna migracija nije napravljena. Faza 0 je čisto opažanje.
