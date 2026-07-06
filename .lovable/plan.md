
# Proširenje MCP alata: budgets, projects, krug

Trenutno MCP server ima 3 alata (list_recent_expenses, get_wallet_balances, create_expense). Dodajem novih 12 alata podijeljenih u 3 domene. Svi alati koriste `ctx.getToken()` i user-scoped Supabase klijent, tako da RLS automatski filtrira samo podatke do kojih prijavljeni korisnik ima pristup.

## Novi alati po domeni

### 📊 Budgeti (budget_plans + budget_categories)
1. **list_budgets** — vraća aktivne budgete korisnika (naziv, ukupni iznos, period, potrošeno vs. preostalo).
2. **get_budget_details** — za zadani `budget_id` vraća kategorije, planirane iznose i stvarno potrošeno.
3. **create_budget** — kreira novi budget plan (naziv, iznos, period start/end, valuta).
4. **add_budget_category** — dodaje kategoriju s planiranim iznosom u postojeći budget.

### 🏗️ Projekti (projects + project_milestones + project_work_entries)
5. **list_projects** — vraća aktivne projekte (naziv, klijent, status, budžet, prihod, trošak, profit).
6. **get_project_details** — za `project_id` vraća milestone-ove, članove tima, ukupne prihode/troškove.
7. **list_project_milestones** — milestone lista s planiranim i stvarnim datumima + status kašnjenja.
8. **create_project** — kreira novi projekt (naziv, klijent, tip, planirani budžet, valuta).
9. **log_project_work** — bilježi radni sat/zapis (`project_work_entries`) za korisnika (projekt, opis, sati, datum).

### 👨‍👩‍👧 Krug — obiteljski/dijeljeni krug (krug + krug_membership)
10. **list_krugs** — vraća krugove kojih je korisnik član (naziv, uloga, broj članova).
11. **get_krug_summary** — za `krug_id` vraća članove, dijeljene payment source-e i sažetak troškova zadnjih 30 dana.
12. **list_krug_expenses** — troškovi vezani uz dijeljene payment source-e kruga (zadnjih N, s korisnikom koji je unio).

## Tehnički detalji

- **Lokacija:** svaki alat u `src/lib/mcp/tools/<naziv>.ts`, registracija u `src/lib/mcp/index.ts` u polju `tools`.
- **Autentikacija:** ponovna upotreba `supabaseForUser(ctx)` helpera (kopira se u svaki alat, kao što je već slučaj za postojeća 3). RLS + `has_role`/membership provjere na bazi rade filtriranje — alati NE forsiraju `user_id` u WHERE osim gdje logika to zahtijeva.
- **Read-only vs write:** `list_*`, `get_*` = `readOnlyHint: true`. `create_*`, `add_*`, `log_*` = write, bez `destructiveHint` (samo insert).
- **Input schema:** čist Zod, bez `.min()/.max()` (samo `.positive()` gdje ima smisla), sve numeričke/datumske validacije unutar handlera. Opisi na engleskom, ali s HR primjerima gdje pomaže LLM-u razumjeti domenu.
- **Output:** `content` = kratki tekstualni sažetak, `structuredContent` = puni JSON za LLM parsing.
- **Instructions field:** ažurirati u `defineMcp` da nabroji nove domene.
- **Nakon zapisa:** pokrenuti `app_mcp_server--extract_mcp_manifest` (za validaciju + refresh `.lovable/mcp/manifest.json`) i `supabase--deploy_edge_functions` za `mcp` funkciju — bez deploya vanjski klijenti (ChatGPT/Claude) i dalje vide staru listu alata.

## Što NE dira

- Nema izmjena u UI-ju, DB shemi, RLS politikama ni edge funkcijama osim automatski regeneriranog `supabase/functions/mcp/index.ts`.
- Nema izmjena postojeća 3 alata.
- Nema novih tablica ni migracija.

## Otvorena pitanja (odgovori ako želiš drukčije)

- **Krug — write alati:** Nisam uključio `create_krug` ni `invite_to_krug` jer to obično zahtijeva UI potvrde (invitation tokens, email). Reci ako želiš i te.
- **Projekti — invoice/estimate:** Nisam uključio kreiranje računa/ponuda (`project_invoices`, `project_estimates`) jer su kompleksni (invoice_items, PDF). Mogu dodati read-only `list_project_invoices` ako treba.
- **Budget — brisanje/edit:** Namjerno izostavljeno (destruktivne operacije bolje kroz UI).

Ako je sve OK, kreni s implementacijom svih 12 alata + deploy.
