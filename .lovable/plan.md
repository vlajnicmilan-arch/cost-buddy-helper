
# Audit SECURITY DEFINER + tablice bez politike (read-only)

## Brojke

- **162** SECURITY DEFINER funkcija u `public` schemi (ukupno).
- **98** ima `EXECUTE` grant za rolu `anon`.
  - **~28** su trigger funkcije (`RETURNS trigger`) — anon grant je bezopasan jer ih engine poziva interno, nisu dostupne preko PostgREST-a. Ignorabilne.
  - **~70** su pozivive funkcije (RPC-ovi) — **stvarna površina napada iz `anon` role**.
- **0** SECDEF funkcija bez `SET search_path`. Sve već imaju set → točka **(B) nije problem**.
- **Tablice s RLS enabled ali bez politike:** `webhook_events` (jedina). Namjerno — piše samo service_role iz webhook edge fn.

## (A) 70 anon-dostupnih RPC-ova — klasifikacija

### Grupa 1 — VISOK RIZIK (mijenja stanje, anonimno pozivo)
Ove funkcije zaobilaze RLS po definiciji (SECDEF). Ako interna provjera `auth.uid()` nije stroga ili je `auth.uid()` NULL prihvatljiv, anonimni klijent može zloupotrijebiti. Treba pojedinačno pročitati tijelo prije `REVOKE`, ali defaultna preporuka je **REVOKE EXECUTE FROM anon**:

- **Financije/saldo:** `apply_balance_delta_if_unanchored`, `apply_split_override`, `merge_manual_with_bank`, `unmerge_import_row`, `recompute_custom_source_balance`, `recompute_custom_source_balance_preview`
- **Meke izmjene/koš:** `soft_delete_record`, `restore_trash_item`, `purge_trash_item`, `purge_old_trash`, `list_trash`
- **Notifikacije/aktivni problemi:** `dismiss_notification`, `upsert_active_issue`, `resolve_stale_issues`
- **Onboarding/članstvo:** `complete_onboarding`, `link_worker_to_member`, `mark_guided_home_exited`
- **Email queue (interno):** `enqueue_email`, `delete_email`, `read_email_batch`, `move_to_dlq`, `email_queue_dispatch`, `email_queue_wake`
- **Admin (mora biti zaključano na admin rolu, ne anon):** `grant_module_access`, `revoke_module_access`, `admin_get_cohort_retention`, `get_dashboard_scroll_distribution`, `get_dashboard_section_stats`, `filter_projects_subscribers`, `refresh_family_split_snapshot`, `drain_participant_digest`, `enqueue_participant_digest_event`
- **AI/kvota:** `increment_ai_usage`, `increment_ai_usage_v2`, `consume_core_scan_quota`, `refund_core_scan_quota`, `peek_core_scan_quota`, `get_free_tier_usage_current_month`
- **Trial:** `create_trial_entitlements`

### Grupa 2 — SREDNJI (predikat helperi, vjerojatno interno validiraju, ali anon grant nepotreban)
Boolean/lookup helperi koje RLS politike zovu interno. `anon` ne treba executive privilegij — RLS provjera radi u kontekstu `authenticated`:
- `has_role`, `has_any_paid_plan`, `has_active_module_grant`, `has_full_payment_source_access`
- `is_budget_owner`, `is_budget_member`, `is_project_owner`, `is_project_member`, `is_project_investor`, `is_project_participant_active`, `is_projects_subscriber`, `is_payment_source_owner`, `is_payment_source_member`, `is_income_source_owner`, `is_income_source_member`, `is_push_category_enabled`
- `can_log_own_work`, `can_write_payment_source`, `assert_projects_write_allowed`
- `get_project_role`, `get_project_member_profiles`, `payment_source_role`

### Grupa 3 — CRON/CLEANUP (mora biti isključivo service_role/pg_cron)
`REVOKE FROM PUBLIC, anon, authenticated`:
- `cleanup_duplicate_push_tokens`, `cleanup_old_ai_usage`, `cleanup_old_chat_messages`, `cleanup_old_diagnostic_logs`, `cleanup_old_health_summaries`, `cleanup_old_login_logs`, `cleanup_old_monitor_alerts`, `cleanup_old_push_logs`, `cleanup_stale_push_tokens`, `delete_expired_invitations`

### Grupa 4 — POTENCIJALNO NAMJERNO ANON (auth/redemption flow — POTVRDITI PRIJE REVOKE)
- **`consume_invitation_token(...)`** (2 signatures) — pozvano tijekom prijave/redemptiona pozivnice. Ako flow radi na `anon` sesiji prije auth, `REVOKE` ga lomi. Treba potvrditi pozivač (edge fn vs klijent).

## (B) `SET search_path`
Nije problem — svih 162 SECDEF funkcija ima `search_path` postavljen. Vanjski linter (`SUPA_function_search_path_mutable`) vjerojatno gleda druge, ne-SECDEF funkcije; provjera je izvan opsega ovog plana.

## (C) Tablice s RLS bez politike
Samo `webhook_events`. **Namjerno** (idempotentni store za Paddle webhook, piše samo service_role, čitanje nikad ne treba iz klijenta). Ostaviti kako jest, dokumentirati komentarom u budućnosti.

## (D) Plan popravka — faze

Sve promjene ide kroz migracije, po grupama, s validacijom nakon svake faze (vitest + smoke test ključnih tokova). **NE izvršavam ništa dok Milan ne odobri.**

**Faza 0 — Verifikacija (read-only, prije bilo koje izmjene)**
- Za svaku funkciju iz Grupe 1 pročitati `pg_get_functiondef` i provjeriti prisutnost `auth.uid()` guarda + što se dogodi kad je `NULL`.
- Za Grupu 4 (`consume_invitation_token`): grep pozivača u `src/` i `supabase/functions/` — je li ikad pozvan iz anon sesije?
- Izvještaj Milanu s per-funkcija odlukom prije Faze 1.

**Faza 1 — CRON (Grupa 3, 10 funkcija) — najniži rizik lomljenja**
- `REVOKE EXECUTE ON FUNCTION public.<f>() FROM PUBLIC, anon, authenticated;`
- Ne dira `service_role`. pg_cron radi kao superuser → i dalje prolazi.
- Rizik lomljenja: **nizak**. Ako neki UI zove cleanup ručno (nije očekivano), pojavit će se u testovima.

**Faza 2 — Admin/AI kvota + email queue (dio Grupe 1) — zaključati na `authenticated` ili `service_role`**
- Admin RPC-ovi (`grant_module_access`, `revoke_module_access`, `admin_get_cohort_retention`, dashboard stats): `REVOKE FROM anon`; interna `has_role(auth.uid(),'admin')` ostaje.
- Email queue (pgmq wrappers): `REVOKE FROM PUBLIC, anon, authenticated` — pozivaju ih samo edge funkcije preko service_role.
- AI kvota RPC-ovi: `REVOKE FROM anon` (kvota je per-user, `auth.uid()` mora postojati).
- Rizik: **nizak-srednji**. Provjeriti da edge funkcije koje ih pozivaju koriste `service_role` klijent.

**Faza 3 — Predikat helperi (Grupa 2, ~22 funkcije)**
- `REVOKE EXECUTE FROM anon`, ostaviti `authenticated` + `service_role`.
- RLS politike ih zovu unutar `WITH CHECK`/`USING` — to je server-side i ne treba anon grant.
- Rizik lomljenja: **vrlo nizak** ako se ne poziva iz anon sesije. Provjeriti da nema takvog callsitea u kodu.

**Faza 4 — Financije/saldo/koš/onboarding (Grupa 1 core, ~20 funkcija)**
- Najosjetljivije: `apply_balance_delta_if_unanchored`, `merge_manual_with_bank`, `unmerge_import_row`, `soft_delete_record`, `complete_onboarding` itd.
- `REVOKE FROM anon`. Interni `auth.uid()` guardovi ostaju kao defence-in-depth.
- Rizik: **srednji** — ako neki flow pogrešno koristi anon session key umjesto autentificiranog, javit će se odmah u E2E testovima.

**Faza 5 — Grupa 4 (`consume_invitation_token`) — odluka Milana**
- **Opcija A:** Ostaviti anon EXECUTE ako je redemption anoniman prije signup completion.
- **Opcija B:** Migrirati flow na `authenticated`-only i redemption raditi post-signup.
- Ne dirati bez eksplicitne odluke.

## Što se NE dira
- Trigger funkcije (~35) — nemaju direktnu API površinu.
- `webhook_events` RLS bez politike — namjerno.
- SECDEF funkcije s `service_role`-only pozivačima gdje je grant već ispravan.
- Nijedan RLS policy iz prethodnog kruga (`app_diagnostics_logs`, `support_tickets`).
- Nijedan grant/politika/funkcija do eksplicitne odluke Milana.

## Otvorena pitanja za Milana
1. Faza 5 (`consume_invitation_token`) — Opcija A ili B?
2. Radimo li svih 5 faza u jednoj migraciji ili razdvojeno po fazi (preporuka: **razdvojeno**, s vitestom između)?
3. Faza 0 (per-funkcija čitanje `pg_get_functiondef`) — želiš li puni izvještaj po funkciji prije Faze 1, ili je gornja klasifikacija dovoljna?
