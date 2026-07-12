
# Non-policy dependency sweep na `public.is_project_manager(uuid, uuid)`

Read-only nalaz iz koda (bez izvršavanja SQL-a na clean-replay DB). Cilj: identificirati što bi nakon 034641 još moglo držati funkciju živom.

## Executive verdict

Grep kroz cijeli `supabase/migrations/` pokazuje da **niti jedan objekt osim RLS policyja ne referencira `is_project_manager` direktno**. Funkcija se pojavljuje samo u 4 migracije:
- `20260125120000` (CREATE + policyji na `project_members`, `project_milestones`, `project_funding`, `project_invitations`, `expenses`)
- `20260609031605` (RE-CREATE + policyji na `project_workers`, `project_work_entries`, `project_milestones`, `project_funding`, `project_collaborators`, `project_invitations`, `project_members`)
- `20260609034641` (dropovi + owner-swap + DROP FUNCTION)
- `20260712200924` (forward idempotent fix)

Nema:
- CHECK constrainta koji zove `is_project_manager`
- kolonskih DEFAULT-ova
- VIEW/matview
- triggera s WHEN klauzulom
- drugih funkcija koje bi imale eksplicitan `DEPENDS ON`

Pošto `pg_depend` bilježi ovisnost samo za **policyje, check-constrainte, defaultse, views/matview, rule, trigger WHEN i eksplicitne `DEPENDS ON`**, jedini realan preostali dependency u clean-replayu je **još jedan RLS policy koji je 034641 propustio dropati**.

## Kandidati po vjerojatnosti (od najviše prema najnižoj)

### 1. Legacy `project_members` INSERT policy iz `20260125120000` — NAJVJEROJATNIJI blocker
File `20260125120000` na liniji 180 kreira:

- `"Managers can add members"` ON `public.project_members`

034641 DROP list (linije 152–164) pokriva ovaj naziv (linija 162). Isto vrijedi za `"Managers can update member roles"` (163) i `"Managers can remove members"` (164). Na papiru pokriveno — ali samo ako je ovaj DROP block stvarno izvršen prije DROP FUNCTION. Provjeriti `pg_policies` u clean-replay stanju.

### 2. `project_milestones` — historijski Managers policyji nikad eksplicitno dropani
`20260125120000` linije 199–208 kreiraju:

- `"Managers can create milestones"` ON `public.project_milestones`
- `"Managers can update milestones"` ON `public.project_milestones`
- `"Managers can delete milestones"` ON `public.project_milestones`

`20260609031605` NE dropa ove nazive — dropa **`"Project managers can create/update/delete milestones"`** (linije 83–85 sa `Project ` prefiksom). To su drugačija imena.

034641 također dropa samo `"Project managers can …"` varijantu (linije 83–85). **`"Managers can create/update/delete milestones"` nikad nije dropan.** Ako 031605 nije obrisao stare, oni preživljavaju do 034641 i drže funkciju.

### 3. `project_funding` — isti pattern
`20260125120000` linije 218–227:

- `"Managers can manage funding"` (INSERT) ON `public.project_funding`
- `"Managers can update funding"` ON `public.project_funding`
- `"Managers can delete funding"` ON `public.project_funding`

`20260609031605` (linije 98–100) i 034641 (linije 98–100) dropaju samo `"Project managers can insert/update/delete funding"`. Kratkoimenske `"Managers can *"` varijante ostaju.

### 4. Contract amendments — false alarm za funkciju, ali paralelni risk za role
`20260517214018` linija 25 kreira `"Project owners and managers can insert contract amendments"` — koristi `pm.role = 'manager'` direktno, **ne poziva `is_project_manager`**, pa NE blokira DROP FUNCTION. 034641 to već rješava kroz DO-blok za ALTER COLUMN TYPE.

### 5. Ostale sumnje niže vjerojatnosti
- `project_work_entries` (031605 linije 119/133/151) — sve tri su dropane u 034641 (linije 59–61) pod korektnim imenima. Malo vjerojatno.
- `project_collaborators` — dropovi u 034641 (113–115) pokrivaju sve što 031605 kreira. Malo vjerojatno.
- `project_workers` — 034641 (33–34) pokriva sve. Malo vjerojatno.
- `project_invitations` — 034641 pokriva i `Project managers` (128–131) i `Managers` (133–136) varijante. Malo vjerojatno.
- `expenses` — 034641 (186–207) mijenja UPDATE + DELETE. `20260125120000` je kreirao samo ta dva `is_project_manager`-based policyja na `expenses` (linije 270–290). Ostali INSERT/SELECT policyji na `expenses` koriste `is_project_member`, ne `is_project_manager`. Malo vjerojatno.

## Preporučeni next step (nije uključeno u ovaj read-only zadatak)

Pokrenuti u clean-replay DB jednu autoritativnu introspekciju umjesto pogađanja:

```sql
-- Sve što pg_depend/pg_policies smatra ovisnim o is_project_manager
SELECT DISTINCT
       cls.relname AS table_name,
       pol.polname AS policy_name
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
 WHERE pg_get_expr(pol.polqual, pol.polrelid) LIKE '%is_project_manager%'
    OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%is_project_manager%';

-- Non-policy dependencies
SELECT classid::regclass, objid, refobjid::regprocedure
  FROM pg_depend
 WHERE refobjid = 'public.is_project_manager(uuid,uuid)'::regprocedure;
```

Prvi query treba točno pokazati koji `Managers can …` policy je preostao (najvjerojatnije na `project_milestones` ili `project_funding` po §2/§3 iznad). Drugi query treba potvrditi da nema non-policy klase ovisnosti.

## Zaključak

Najvjerojatniji preostali blocker DROP FUNCTION-a nije nova klasa objekta, nego **još jedan legacy `Managers can …` policy koji 034641 nije dropao** — konkretno na `project_milestones` i/ili `project_funding` (§2, §3). Fix ide u 034641 kao dopuna postojećeg drop-blocka za te dvije tablice, isti pattern kao `-- Legacy short-named variants` blokovi već u 132 i 161.
