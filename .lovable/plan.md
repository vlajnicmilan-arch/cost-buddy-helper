# Potpun izvoz podataka — podjela na dva koraka

Shema danas ima **142 tablice** u `public`. Postojeći izvoz pokriva 38 imena, od kojih 2 ne postoje, a 11 se tiho preskače. Zahvat je prevelik za jedan prolaz bez tvoje odluke o nekoliko dijeljenih domena, pa predlažem podjelu.

## Korak 1 — Kostur koji se ne može tiho pokvariti

Cilj: infrastruktura + potpuna pokrivenost svega što je jednoznačno korisnikovo.

- **Novi registar** `src/lib/export/exportRegistry.ts` — jedan popis, po tablici:
  - `direct` (`user_id`),
  - `parent` (npr. `project_id → projects.user_id`, `budget_id → budget_plans`, `decision_id → project_decisions → projects`, `krug_id → krug_membership`),
  - `excluded` s obaveznim tekstualnim razlogom.
  Bez „ostalo": svaka od 142 tablice mora imati unos, inače test pada.
- **Dohvat**: `direct` kao i sad, `parent` u dva koraka (prvo id-evi roditelja koji su moji, pa `in.(...)` u komadima po 200 id-eva radi duljine URL-a).
- **Kraj tihog gutanja**: `fetchAllRows` više ne vraća `null`. Vraća `{ rows }` ili `{ error, reason }`. Svaka greška ide u `manifest.skipped[]` sa `{ table, reason, code }`, a `exportAllUserDataAsZip` vraća i status; UI (`DataSection` / `ExportButton`) prikazuje jasno upozorenje „Izvoz je nepotpun — nedostaje N tablica" umjesto tihog uspjeha.
- **`manifest.json` v2**: `exported: [{ table, rows, via }]`, `skipped: [{ table, reason }]`, `excluded: [{ table, reason }]`. Oblik ZIP-a (`expenses.csv`, `data.json`, `manifest.json`, `README.txt`) ostaje.
- **Brana od zastarijevanja**: `src/test/exportRegistryCoverage.test.ts` čita **živu shemu u trenutku pokretanja** preko nove SECURITY DEFINER RPC `public.list_public_relations()` (vraća samo imena tablica/pogleda, dostupno `authenticated`/`anon`, bez podataka), i pada kad postoji relacija koja nije ni pokrivena ni izričito isključena — i obrnuto, kad registar spominje tablicu koje više nema. Nema zamrznutog snimka. Ako mreža nije dostupna, test **pada**, ne preskače se.

## Korak 2 — Dijeljene domene

Tek nakon tvojih odgovora ispod: Krug, članstva, chat, mail-lijevak. Ovdje je rizik curenja tuđih podataka, ne tehnika.

## Pitanja prije Koraka 2 (ne pretpostavljam)

1. **Krug** — izvesti samo: moja članstva, moji udjeli/prijedlozi (`krug_expense_split_share/override` gdje sam ja), i retke `krug_settlement_ledger` u kojima sam ja jedna od strana? **Isključiti** `krug_income_ratio` drugih ljudi i `krug_membership_audit`? Ili želiš cijeli Krug kojeg vidim u aplikaciji, s imenima ostalih članova?
2. **Članstva projekata i budžeta** (`project_members`, `budget_members`, `*_invitations`) — samo moji vlastiti redci, ili puni popis tima za projekte kojih sam vlasnik (sadrži tuđe `user_id` i e-mailove pozivnica)?
3. **`chat_messages`** — samo moje poruke, ili cijeli razgovor uključujući tuđe?
4. **Mail-lijevak** (`inbound_messages`, `inbound_attachments`, `document_ingest_items`, `mail_*`) — pretpostavljam da je to moj poštanski ulaz i ide u cijelosti (uključuje adrese pošiljatelja). Potvrdi.
5. **Suradnici i radnici** (`project_collaborators`, `workers`, `project_workers`, isplate) — to su tuđi osobni podaci, ali u mojoj evidenciji. Pretpostavljam: ide u cijelosti za moje projekte. Potvrdi.

## Što predlažem isključiti (s razlogom, u registru)

- Sustavno/interno: `webhook_events`, `paddle_price_map`, `ai_route_costs`, `company_lookup_cache`, `email_send_state`, `suppressed_emails`, `monitor_alerts_log`, `ingest_jobs`, `pdf_parse_jobs`, `*_dedup`, `*_throttle`.
- Telemetrija i dnevnici: `funnel_events`, `landing_events`, `dashboard_telemetry`, `app_diagnostics_logs`, `push_delivery_logs`, `user_login_logs`, `ai_usage_*`, `ai_cost_monthly`, `email_send_log`, `activation_nudge_log`.
- Administrativno: `admin_module_grants`, `user_roles`, `account_deletion_log`.
- Tajne/tokeni: `push_tokens`, `email_unsubscribe_tokens`, `project_share_links`, `*_invitations` tokeni.
- Ne postoje: `invoices`, `invoice_items` — brišu se s popisa.

Reci ide li ovakva podjela i odgovori na 5 pitanja, pa krećem s Korakom 1 odmah.
