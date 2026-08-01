# Korak A — zaštita ČITANJA iznosa na fazama (baza, ne UI)

## Prvo: dvije korekcije na opis stanja

Provjereno u bazi (politike na `project_milestones`, definicije funkcija, uloge u `project_members`):

1. **Investitor već NE čita `project_milestones`.** `is_project_participant_active` izričito isključuje `role <> 'investor'`, pa SELECT politika "Project participants can view milestones" ne vrijedi za investitora. Investitor faze vidi isključivo kroz definer RPC `get_investor_project_phases`, koji već vraća whitelistu stupaca s `investor_price`, bez `budget`. Dakle za investitora je čitanje već riješeno — treba ga samo formalizirati i pokriti testom.
2. **Stvarna rupa je worker (i member).** Oni prolaze `is_project_participant_active`, a svi klijentski upiti rade `select('*')` → čitaju `budget` i `investor_price`. To je jedina uloga-rupa koju korak A mora zatvoriti.

Uloge stvarno u bazi: `member` (3), `worker` (3), `investor` (3). Vlasnik je virtualan (`projects.user_id`). **Uloga `viewer` u `project_members` trenutno ne postoji ni u jednom zapisu** — traženo pravilo "viewer vidi oba iznosa" je time samo pripremno, nema živih podataka.

## 1. Predloženi pristup: SECURITY DEFINER pogled + zabrana izravnog SELECT-a na tablici

Usporedba opcija:

| Pristup | Sigurnost | Složenost | Utjecaj na kod |
|---|---|---|---|
| Column-level `GRANT` | Ne radi. Grant je po roli baze (`authenticated`), a ne po ulozi na projektu — svi prijavljeni su ista rola. Otpada. | — | — |
| RLS na redu (postojeći mehanizam) | RLS filtrira REDOVE, ne stupce. Ne može sakriti `budget` a pokazati naziv. Otpada. | — | — |
| Definer RPC po ulozi | Vrlo dobra | Srednja | Velik — svaki `select('*')` mora u RPC, gubi se realtime i PostgREST filtri |
| **Pogled (view) s uvjetnim stupcima + `USING (false)` na SELECT-u tablice** | Vrlo dobra — podatak fizički ne izlazi iz baze | Niska | Mali — mijenja se `.from('project_milestones')` u `.from('project_milestones_scoped')` na mjestima čitanja |

**Preporuka: pogled.**

- Novi pogled `public.project_milestones_scoped` (`security_invoker=on`) vraća sve postojeće stupce, ali `budget` i `investor_price` postaju izraz:
  - `budget` → vrijednost samo ako je uloga `owner`, `viewer` ili `member`, inače `NULL`
  - `investor_price` → vrijednost samo ako je uloga `owner`, `viewer` ili `investor`, inače `NULL`
  - uloga se dobiva iz postojeće `get_project_role(project_id, auth.uid())` — ne uvodimo novu logiku uloga
- Redovi se i dalje filtriraju kroz postojeći RLS (invoker), pa `hide_soft_deleted` i ostalo ostaju na snazi.
- Zatim SELECT politika na baznoj tablici se sužava na vlasnika (`is_project_owner`), tj. neprivilegirane uloge više ne mogu zaobići pogled izravnim upitom. Politike za INSERT/UPDATE/DELETE se **ne diraju** (korak D).

Kompromis: `NULL` umjesto "stupac ne postoji". Zahtjev traži "stupca nema u odgovoru" — jedini način da stupca doslovno nema jest RPC po ulozi. Sigurnosno su ekvivalentni (vrijednost ne napušta bazu), a `NULL` je znatno jeftiniji za postojeći kod. Ako Milan inzistira na doslovnom izostanku stupca, alternativa je **tri definer RPC-a** (`get_project_phases_internal`, `..._investor`, `..._basic`) — reci i idemo tim putem, ali onda pada realtime pretplata i cijena je veća.

## 2. Sva mjesta koja čitaju `project_milestones`

Klijent (React):
- `src/hooks/useProjectMilestones.ts` — glavni hook, `select('*')` (lin 27), realtime pretplata (86), te čitanja u revizijama (106, 172, 324, 350, 540, 571). → izvor čitanja prelazi na pogled; upisi (insert/update/delete) ostaju na tablici.
- `src/components/projects/ProjectsPanel.tsx:220` — `select('project_id, budget, status, due_date')` za agregat po projektima. → čita `budget`; za worker/investor postaje `NULL`, agregat mora tretirati `NULL` kao "nepoznato", ne 0.
- `src/components/business/BusinessProjects.tsx:94` — čita samo `project_id, status, due_date`. → samo zamjena izvora, bez semantičke promjene.
- `src/components/projects/ProjectReportsDialog.tsx:278` — `select('id, name')`. → bez utjecaja na iznose.
- `src/components/projects/CompleteProjectWizard.tsx:110` — vlasnički tok. → bez promjene ponašanja (vlasnik vidi sve).
- `src/components/projects/InvestorPhasesView.tsx` — već koristi RPC. → bez promjene.
- `src/hooks/useProjectWorkLogs.ts:35`, `src/lib/projectTemplateApply.ts:74`, `src/components/settings/SettingsDialog.tsx:366` — imena faza / upisi / brisanje. → bez promjene.
- `src/lib/dataExportZip.ts:32`, `src/lib/softDelete.ts` — popisi tablica. → izvoz podataka mora ići preko pogleda da vlastiti izvoz ne curi tuđe iznose.

MCP alati (rade kao prijavljeni korisnik):
- `src/lib/mcp/tools/list-project-milestones.ts` i `get-project-details.ts` — oba eksplicitno traže `budget`. → prelaze na pogled; `budget` može biti `NULL`.
- `supabase/functions/mcp/index.ts` (bundlana kopija, lin 399 i 440) — ista promjena, mora se regenerirati/deployati zajedno.

Edge funkcije sa service-role ključem (RLS ih ne dira, ostaju na tablici — svjesna odluka):
- `check-milestone-deadlines`, `check-milestone-budgets` — interni cron, ne isporučuju iznose korisniku bez uloge.
- `project-insights` — **provjeriti tko je primatelj**; ako AI sažetak može čitati worker, mora se filtrirati po ulozi. Ovo je jedina edge funkcija koja u koraku A traži odluku.
- `get-public-project` — javni link, već sanitiran ranije; potvrditi da ne vraća `budget`/`investor_price`.
- `backup-weekly`, `_shared/tablesToPurge.ts` — administrativno, bez promjene.

## 3. TypeScript sloj i opasnost od `undefined`/`NULL` → 0

Trenutno u `useProjectMilestones.ts` stoji `budget: Number(m.budget) || 0`. To je točno mjesto gdje bi skriveni iznos tiho postao **0** i propagirao se u prikaze i zbrojeve kao "nema budžeta". Isto vrijedi za svaki `Number(x) || 0` nad iznosima faze.

Plan:
- U `src/types/project.ts` `budget` postaje `number | null`, `investor_price` ostaje `number | null`.
- Uvodi se jedna čista pomoćna funkcija (npr. `src/lib/milestoneAmounts.ts`) s `readAmount(value): number | null` koja `null`/`undefined` vraća kao `null`, nikad 0, i `isAmountHidden(value)` za UI.
- Sva mjesta koja zbrajaju iznose faza moraju izričito odlučiti: preskoči `null` ili prikaži "—". Nijedan zbroj se u koraku A ne mijenja za vlasnika (on i dalje dobiva sve vrijednosti), mijenja se samo ponašanje kad je vrijednost skrivena.
- Regeneriranje Supabase tipova nakon pogleda daje `project_milestones_scoped` s nullable stupcima, pa TypeScript sam prisiljava na obradu.

## 4. Testovi koji dokazuju da podatak ne curi

Sloj baze (u `e2e/security/` — postoji `03-investor-scope.spec.ts` kao uzor, dodaje se npr. `08-milestone-amount-scope.spec.ts`), svaki s pravim JWT-om po ulozi:
- worker: čitanje pogleda → `budget === null` I `investor_price === null`; izravan `select` nad `project_milestones` → 0 redova / permission error.
- member: `budget` broj, `investor_price === null`.
- investor: `budget === null`; `get_investor_project_phases` vraća `investor_price`; izravan `select` nad tablicom → 0 redova.
- viewer: oba iznosa vidljiva (fixture mora prvi put stvoriti viewer zapis — trenutno ne postoji u bazi).
- vlasnik: oba iznosa, nepromijenjeno.
- Provjera je na sirovom JSON odgovoru (`Object.keys` + vrijednost), ne na renderiranom UI-ju.

Vitest (čista logika):
- `readAmount(null) === null`, `readAmount(undefined) === null`, `readAmount(0) === 0` — regresija na "skriveno ≠ nula".
- agregat u `ProjectsPanel` preskače `null` umjesto da ga zbroji kao 0.

## 5. Rizici i sudari s postojećim politikama

- **`hide_soft_deleted`** — pogled s `security_invoker=on` nasljeđuje RLS pozivatelja, pa filtar obrisanog ostaje. S `security_definer` pogledom bi se izgubio; zato invoker.
- **`project_milestones_readonly_when_downgraded`** — politika je `FOR ALL` i njen `USING` izraz vrijedi i za SELECT. Vlasnik bez Projects pretplate danas **ne čita** faze. Sužavanje SELECT-a na vlasnika mora zadržati tu klauzulu, inače nehotice vraćamo pristup korisniku bez pretplate.
- **`is_project_participant_active`** — ako se SELECT na baznoj tablici svede na vlasnika, sva ostala čitanja OVISE o tome da je pogled ispravno uveden i da su svi klijentski upiti prebačeni. Propušteno mjesto = prazan popis faza u sučelju, ne curenje. Zato je nužno da promjena politike i prebacivanje čitanja idu u istoj isporuci, a rollback je jednostavan (vraćanje stare SELECT politike).
- **Realtime** — pretplata u `useProjectMilestones.ts:86` sluša tablicu, a ne pogled. Pretplata i dalje radi kao okidač za ponovni dohvat; payload iz pretplate se ne smije koristiti kao izvor iznosa, samo kao signal. Ako se danas negdje koristi payload izravno, to je zaseban rizik curenja i treba ga provjeriti pri implementaciji.
- **MCP bundlana kopija** — `supabase/functions/mcp/index.ts` je izgrađena kopija `src/lib/mcp`. Ako se ažurira samo izvor, deployana verzija i dalje čita tablicu.
- **`get_investor_project_phases`** koristi `is_project_participant_active OR is_project_investor` — to znači da i worker može pozvati taj RPC i dobiti `investor_price`. **To je aktivna rupa** i mora se u koraku A suziti na vlasnika/viewera/investitora.

## Što se izričito NE dira

Nijedan izračun (ugovorena vrijednost, saldo, marža, PDF), nijedna migracija podataka, forma faze, prava pisanja po ulogama. `investor_price` i dalje ne ulazi ni u jedan zbroj.
