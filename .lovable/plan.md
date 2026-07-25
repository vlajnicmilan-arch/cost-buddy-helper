# Audit-alert: anon EXECUTE regresija na 45 SECDEF funkcija

Opseg: mehanizam koji upozorava ako `anon` EXECUTE grant ikad bude vraćen na bilo koju od 45 funkcija zaključanih u Fazi 1 (34) + Fazi 2a (11). Ništa se ne dira u tijelima funkcija, financijskoj logici ni RLS-u.

Popis funkcija se ne smije hardkodirati na 45 mjesta — treba **jedan izvor istine**.

---

## Opcija A — DB funkcija + pg_cron (runtime detekcija)

**Kako:**
1. Tablica `public.secdef_anon_lockdown` (mala allowlist): `function_signature text primary key, phase text, locked_at timestamptz default now(), note text`. Popuni jednim seed INSERT-om s 45 potpisa (proname + argtypes). RLS on, samo `service_role` čita/piše. Ovo je **jedan izvor istine**.
2. SECDEF funkcija `public.audit_secdef_anon_regression()` koja za svaki red iz allowliste zove `has_function_privilege('anon', signature, 'EXECUTE')` i za svaki hit:
   - upsertira u `public.notifications` (admin user_id) **ili** koristi postojeći `upsert_active_issue` mehanizam (dedup key `secdef_anon_regression:<sig>`, severity `critical`) — ovo je već sigurna funkcija s `auth.uid()` guardom, pa umjesto nje koristimo direktan insert kao service_role kroz cron kontekst;
   - preferirano: piše red u `public.monitor_alerts_log` (već postoji, koristi ga `monitor-app-health`) sa `source='secdef_audit'` i signature-om.
3. pg_cron job (dnevno u 03:00): `SELECT public.audit_secdef_anon_regression();`
4. Postojeći crash-email/push kanal (`monitor-app-health` cron već čita `monitor_alerts_log`) — provjeriti gura li alertove svih source-ova ili filtrira; ako filtrira, dodati mali sibling notifier ili proširiti scan. **Otvoreno pitanje za Milana** — vidi dolje.

**Isporuka alerta:** monitor_alerts_log red → admin email/push kroz postojeći cron kanal.

**Rizik:** minimalan. Read-only nad `pg_proc`/ACL. Nema efekta na app rutine. Ako allowlist popis zastari (dodamo novu SECDEF funkciju kasnije), samo je propuštamo — ne generira false positive.

**Minus:** detekcija je dnevna (do 24h kašnjenja). pg_cron dependency (već koristimo).

---

## Opcija B — CI/test provjera (shift-left)

**Kako:**
1. Isti jedan izvor istine, ali kao TypeScript/JSON popis pod `supabase/tests/security/anon-lockdown.json` (45 potpisa).
2. Novi vitest ili SQL test (`supabase/tests/security/anon_lockdown.sql`) koji se spaja na test DB i za svaki potpis pita `has_function_privilege('anon', $1, 'EXECUTE')` — mora biti `false`. Fail = crveni CI.
3. Registrirati u `.github/workflows/test.yml` (ili balance-sql-suite ako koristimo psql harness).

**Isporuka alerta:** GitHub Actions failure na PR/push.

**Rizik:** minimalan. Test treba pristup živoj/replika bazi ili replay migracija — SQL varijanta se najlakše veže na već postojeći stress/balance harness koji replaya migracije lokalno.

**Minus:** hvata samo regresije koje prođu kroz migraciju u repou. Ako netko ručno grantira u produkciji (npr. iz Supabase UI-a), CI to ne vidi.

---

## Opcija C — Kombinacija (preporuka)

- **B kao primarni gate** (SQL test u CI-u, blokira PR koji vrati grant kroz migraciju).
- **A kao runtime safety net** (dnevni cron hvata ručne intervencije mimo migracija).
- **Jedan izvor istine dijeljen između obje:** tablica `public.secdef_anon_lockdown` u bazi + SQL test u CI-u čita istu tablicu (`SELECT function_signature FROM public.secdef_anon_lockdown`), tako da se popis ažurira na jednom mjestu (migracija koja INSERT-ira u tablicu kad god zaključamo novu funkciju).

**Rizik kombinacije:** i dalje minimalan; samo jedna nova tablica + jedna nova SECDEF funkcija (s `auth.uid() IS NULL` guardom za direktne pozive, dopušteno samo service_role/cron kontekstu) + jedan cron job + jedan CI test.

---

## Otvorena pitanja za Milana (prije izvršenja)

1. **A, B ili C?** (preporuka: C, ali A sam je dovoljan ako želimo minimalnu površinu izmjene.)
2. **Kanal alerta za opciju A:** `monitor_alerts_log` (postojeći, ide kroz `monitor-app-health` push+email cron) ili zaseban `notifications` red za admine? Treba li `monitor-app-health` proširiti da čita `source='secdef_audit'` redove?
3. **Ritam crona za A:** dnevno (03:00) ili češće (svaka 4h)?
4. **Popis 45 funkcija** — potvrđujemo točan popis iz Faza 1+2a prije seed migracije (mogu ga izvući iz `pg_proc` filtrirano po tome što više nemaju anon EXECUTE, ali će trebati ručna potvrda da nije uhvaćeno nešto što je oduvijek bilo bez anon granta).
5. **Ako Milan odabere B/C:** ide li SQL test u `.github/workflows/test.yml` (brz, ali treba psql + migracije) ili u `balance-sql-suite.yml` (već ima harness)?

Ništa se ne izvršava dok Milan ne odabere opciju i odgovori na pitanja 2–5.
