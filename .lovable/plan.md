# Rezultat svježeg sigurnosnog skena (13:29)

Sken je pokrenut, ništa nije označeno kao ignore, objava nije pokrenuta, ništa nije mijenjano.

## 1. Nalazi svježeg skena (`security--run_security_scan`, 13:29:22)

Ukupno 7: **1 error, 6 warn**.

| Skener | Nalaz (`internal_id`) | Razina | Na što se odnosi |
|---|---|---|---|
| supabase | `SUPA_security_definer_view` | **error** | View `project_milestones_scoped` (jedini view u `public` bez `security_invoker`) |
| supabase | `SUPA_function_search_path_mutable` | warn | Funkcije bez `SET search_path` |
| supabase | `SUPA_anon_security_definer_function_executable` | warn | SECDEF funkcije izvršive bez prijave |
| supabase | `SUPA_authenticated_security_definer_function_executable` | warn | SECDEF funkcije izvršive prijavljenima |
| supabase_lov | `app_settings_public_readable` | warn | `app_settings` — SELECT `USING(true)` |
| supabase_lov | `ai_route_costs_public_read` | warn | `ai_route_costs` — interni troškovi vidljivi svim prijavljenima |
| supabase_lov | `paddle_price_map_public_read` | warn | `paddle_price_map` — cjenik vidljiv svim prijavljenima |

`app_mcp`: 0. `connector_security_scan`: 0.

## 2. Perzistirano stanje nakon skena (`get_scan_results`, force)

Ovo je ono što gate čita pri objavi:

| Skener | Nalazi | Razina | Svjež? |
|---|---|---|---|
| agent_security | `notify_feedback_unauthed`, `unauthed_ai_endpoints` | warn, warn | ne (11.6. / 31.5.) |
| app_mcp | — | — | da (13:27) |
| connector_security_scan | — | — | da (13:27) |
| supabase | `SUPA_function_search_path_mutable` | warn | **da (13:27)** |
| supabase_lov | `app_settings_anyone_can_read`, `budget_categories_no_owner_check`, `invoice_reminders_public_role`, `public_assets_admin_root_upload_ok` | sve warn | ne (4.8.) |
| supply_chain | — | — | ne (31.7.) |

**Nula critical u perzistiranom stanju.**

## 3. Je li se `SUPA_security_definer_view` vratio kao critical

**Ne.** Živi linter ga i dalje prijavljuje kao ERROR (to je nepromijenjeno stanje baze — view `project_milestones_scoped` je namjerno SECURITY DEFINER), ali u perzistiranom popisu `supabase` skenera on **nije prisutan**, iako je taj skener osvježen u 13:27 i označen `up_to_date: true`.

Zaključak: oznaka ignore je preživjela svjež sken.

## 4. Novi critical nalazi

**Nema ih.** Nijedna izmjena od jučer (escapeHtml, `verify_jwt` za `lookup-company`, uklanjanje `billing_enabled`, `entitlements_mode = entitlements`) nije proizvela novi critical.

Tri `supabase_lov` nalaza iz svježeg skena (`app_settings_public_readable`, `ai_route_costs_public_read`, `paddle_price_map_public_read`) su **preimenovani/reformulirani** u odnosu na perzistirane, ali svi su warn i nisu novi problemi po sadržaju. Nisu dirani.

## 5. Je li oznaka trajna

Da, koliko se vidi iz podataka. Razlog: `internal_id` ovog nalaza je **stabilan i deterministički** — doslovno `SUPA_security_definer_view`, izveden iz šifre linter pravila, a ne iz nasumičnog ID-a po skenu. Zato ga svaki idući sken prijavljuje pod istim ključem i oznaka ga i dalje pokriva.

Razlika prema `agent_security` i `supabase_lov` nalazima, gdje su ID-evi opisni i po skenu se mogu promijeniti (`app_settings_anyone_can_read` → `app_settings_public_readable`): kod tih bi se oznaka mogla izgubiti pri preimenovanju. Kod linter nalaza tipa `SUPA_*` to nije slučaj.

Praktično: ne treba ništa raditi da oznaka postane trajna — već jest, dok god view ostaje isti objekt i dok god ga prijavljuje isto pravilo.

## 6. Što ostaje otvoreno

Uzrok neuspjele objave u 13:18 **nije bio sigurnosni gate** — potvrđeno time što je objava u 13:26 prošla bez ijedne izmjene. Bez doslovnog teksta tadašnje greške ne mogu reći što je bilo; ako se ponovi, treba screenshot ili copy-paste poruke.

Nijedan sljedeći korak nije predložen — čeka se odluka.
