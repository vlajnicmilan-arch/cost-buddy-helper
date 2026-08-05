# Dijagnostika neuspjele objave (13:18, commit `451bb707`)

Ništa nije mijenjano, ništa nije označeno kao ignore, objava nije pokrenuta.

## 1. Koji nalaz sada blokira objavu

Prema perzistiranim rezultatima skenera (`security--get_scan_results`, force) **trenutno nema nijednog critical nalaza**. Popis po skeneru:

| Skener | Nalazi | Razina |
|---|---|---|
| `agent_security` | 2 (`notify_feedback_unauthed`, `unauthed_ai_endpoints`) | warn, warn |
| `app_mcp` | 0 | — |
| `connector_security_scan` | 0 | — |
| `supabase` | 1 (`SUPA_function_search_path_mutable`) | warn |
| `supabase_lov` | 4 (`app_settings_anyone_can_read`, `budget_categories_no_owner_check`, `invoice_reminders_public_role`, `public_assets_admin_root_upload_ok`) | sve warn |
| `supply_chain` | 0 | — |

Nalaz `SUPA_security_definer_view` **nije na popisu** — oznaka „ignore" od prošlog puta drži se.

Dakle: **ne mogu potvrditi da je sigurnosni gate ono što je zaustavilo objavu u 13:18.** Prema podacima koje vidim, gate bi sada prošao.

## 2. Isti nalaz ili novi

Nijedna od jučerašnjih/današnjih izmjena (escapeHtml u `bank-connect-complete`, `verify_jwt` za `lookup-company`, uklanjanje `billing_enabled`, `entitlements_mode = entitlements`) nije proizvela novi critical nalaz. Dva `agent_security` nalaza su **zastarjela** (`up_to_date: false`, nastali 31.5. i 11.6.) — onaj o `lookup-company`/`parse-standup` opisuje stanje prije jučerašnjeg zatvaranja i sam po sebi je warn, ne blokira.

## 3. Što je s live linterom

Živi Supabase linter (201 stavka) ima **točno jedan ERROR**: `0010_security_definer_view`. Potvrđeno upitom nad `pg_class`: u shemi `public` postoji samo jedan view bez `security_invoker` — `project_milestones_scoped`. To je isti objekt kao prošli put i namjeran je (selektivno maskiranje polja za rolu investitora). Snapshot `supabase` skenera je od 12:40 i `up_to_date: false`, pa postoji mogućnost da se pri objavi pokrene svjež skener i ponovno digne taj ERROR kao critical — ali to je pretpostavka, nemam dokaz.

## 4. Što nije uzrok

- TypeScript: `tsgo --noEmit -p tsconfig.app.json` → exit 0, bez grešaka.
- `app_mcp` skener je odrađen u 13:18:41 (točno u trenutku pokušaja objave) i vratio je **0 nalaza** — MCP manifest nije prepreka.
- Status projekta „ready", `error: null` — build nije pao.

## 5. Što mi treba da zatvorim pitanje

Jedno od sljedećeg, pa mogu točno reći uzrok umjesto nagađati:

1. **Puni tekst poruke greške** iz dijaloga objave (screenshot ili copy-paste). Ako piše da je blokirano zbog sigurnosnih nalaza, poruka navodi i koji.
2. Ako poruka ne spominje sigurnost, uzrok je izvan gatea i tada gledam deploy/hosting stranu.

## Prijedlog daljnjih koraka (čeka odluku korisnika)

- **Opcija A** — pošalji tekst greške; tek onda diramo bilo što.
- **Opcija B** — ako se potvrdi da je opet `project_milestones_scoped`: umjesto ponovnog „ignore", trajno rješenje je dodati `security_invoker = true` na view i osloniti maskiranje na RLS politike ispod njega. To je promjena baze i traži svoj plan i punu regresiju (balance, matrica, SECDEF invarijanta).
- **Opcija C** — ostaviti kako jest i ponovno označiti ignore kad se pojavi. Radi, ali se ponavlja pri svakoj objavi.
