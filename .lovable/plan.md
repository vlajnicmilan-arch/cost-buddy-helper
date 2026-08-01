# Korak D — prava pisanja po ulogama

## Prvo: gdje se matrica kosi s repozitorijem

Provjereno upitom nad živim politikama (`pg_policies`) i definicijama funkcija.

1. **Nije točno da uloge imaju identična prava.** Tri tablice već danas puštaju *bilo kojeg* člana (uključivo `viewer` i `investor`, jer `is_project_member` ne gleda ulogu):
   - `project_documents` — INSERT/UPDATE: `is_project_member(...)`
   - `milestone_checklist_items` — INSERT/UPDATE: `is_project_member(...)`
   - `project_budget_revisions` i `milestone_budget_revisions` — INSERT: `is_project_member(...)`
   Zadnje dvije su **novčani put**: član danas može upisati reviziju budžeta faze. To je rupa koju korak D mora zatvoriti, a ne otvoriti.
2. **`worker` već ima prava pisanja.** `can_log_own_work` vraća `true` za `owner|member|worker`, pa radnik već sada upisuje `project_work_logs` i vlastite `project_work_entries` — bez stanja „na čekanju". Matrica kaže da radnik u koraku D ne dobiva ništa; on to *već ima*. Odluka je potrebna: ostaviti kako jest do koraka E (preporuka — ne diramo zatečeno ponašanje) ili odmah suziti.
3. **Mrtva referenca na ulogu `manager`.** `project_contract_amendments` INSERT politika još provjerava `pm.role = 'manager'`, uloge koja više ne postoji. Politika je time efektivno owner-only, ali treba je očistiti.
4. **Pretplata (točka 3) je već ispravno postavljena za vlasnika**, ali ne za buduće članove: `projects_readonly_when_downgraded`, `project_milestones_readonly_when_downgraded`, `project_documents_readonly_when_downgraded`, `project_funding_readonly_when_downgraded` svi imaju oblik „nije moj projekt ILI sam pretplatnik" — dakle pretplata veže samo vlastite projekte. **Ali** `with_check` na `project_milestones` INSERT/UPDATE ima *bezuvjetni* `can_write_module(auth.uid(),'projekti')`. Danas je bezopasno (pišu samo vlasnici); čim voditelj dobije pisanje, taj uvjet bi tražio pretplatu i od člana. Mora se maknuti iz članskih politika.
5. **Čitanje faza je nakon koraka A owner-only.** SELECT na `project_milestones` je samo `is_project_owner`; ostali čitaju kroz `project_milestones_scoped`. Posljedica: voditeljev `UPDATE` bi prošao, ali `return=representation` (zadano u supabase-js) vratio bi prazno i klijent bi to protumačio kao grešku. Ovo se mora riješiti u istom koraku.

---

## 1. Mehanizam ograničenja po stupcu

RLS ne zna za stupce. Tri opcije:

- **`GRANT UPDATE(col)`** — radi po *bazi* roli (`authenticated`), ne po korisniku projekta. Isti korisnik je vlasnik jednog i voditelj drugog projekta → neupotrebljivo.
- **Namjenski RPC** (`update_milestone_progress(...)`) — čist model, ali traži prepisivanje svih postojećih poziva i ostavlja tablicu otvorenom za direktan `UPDATE`.
- **BEFORE UPDATE trigger koji uspoređuje OLD/NEW** ← **preporuka.**

**Izbor: BEFORE UPDATE trigger na `project_milestones`.**

`public.guard_milestone_column_writes()` — `SECURITY DEFINER`, čita ulogu preko `get_project_role`:
- uloga `owner` → prolaz bez provjere;
- uloga `member` → ako se mijenja ijedan zaštićeni stupac (`budget`, `investor_price`, `budget_locked`/analogni, `project_id`), `RAISE EXCEPTION` s `errcode 42501` i stabilnim tekstom (`milestone_amount_forbidden`);
- ostale uloge ne dolaze do trigger a (RLS ih odbija ranije).

Usporedba mora biti NULL-safe (`IS DISTINCT FROM`) — inače bi upis `null` nad `null` lažno pao.

Zašto trigger: postojeći UI šalje cijeli objekt faze u `update()`, pa bi RPC značio refaktor svakog poziva. Trigger vrijedi za svaki put do tablice (UI, budući importi, edge funkcije koje ne koriste service role) i ne mijenja potpis nijednog postojećeg poziva.

**Posljedica za postojeći kod:** forma već izostavlja skrivene iznose iz payloada (korak B), pa voditelj u praksi neće ni slati `budget`. Ali forma šalje cijeli objekt drugih polja — treba provjeriti da se `budget`/`investor_price` ne šalju kao „nepromijenjeni echo" (echo iste vrijednosti prolazi zbog `IS DISTINCT FROM`, pa je i to sigurno).

---

## 2. Tablice i politike koje se diraju

| Tablica | Danas | Promjena u koraku D |
| --- | --- | --- |
| `project_milestones` | UPDATE samo owner | UPDATE dodatno za `member`; + BEFORE UPDATE trigger za iznose. INSERT/DELETE ostaju owner-only. Iz članske grane izbaciti `can_write_module`. |
| `project_milestones` (SELECT) | owner-only | dodati SELECT za sudionike **ograničen na nefinancijske stupce nije moguć na tablici** → rješenje: klijent za članske upise koristi `Prefer: return=minimal` i osvježava kroz `project_milestones_scoped`. Alternativa (skuplja): članski `UPDATE` kroz RPC koji vraća scoped redak. |
| `project_documents` | svaki član piše | suziti na `owner|member` (viewer/worker/investor gube upis). DELETE ostaje uploader-or-owner. |
| `milestone_checklist_items` | svaki član piše | suziti na `owner|member`. |
| `project_budget_revisions`, `milestone_budget_revisions` | svaki član INSERT | **suziti na owner-only** — to je novčani zapis. |
| `project_contract_amendments` | referira nepostojeći `manager` | očistiti na owner-only. |
| `project_workers`, `project_worker_rate_history` | owner-only | bez promjene (cijene po satu). |
| `project_members`, `project_member_permissions`, `project_invitations` | owner-only | bez promjene. |
| `project_funding`, `project_collaborators` | owner-only | bez promjene. |
| `projects` | owner-only | bez promjene (ugovorena vrijednost ostaje vlasnikova). |
| `project_work_logs`, `project_work_entries` | owner + `can_log_own_work` | **bez promjene** — pomiče se u korak E zajedno sa stanjem „na čekanju". |
| `expenses` | vlastiti + owner | **bez promjene** (izvan opsega, potvrđeno). |
| `project_activity_log` | svaki član INSERT | bez promjene (dnevnik, ne novac). |

Tablice koje korisnik nije spomenuo a spadaju u matricu: **dokumenti**, **checkliste faza**, **revizije budžeta** (gore), te `project_estimates` i `project_invoices` — oba su vezana uz `user_id`/vlasnika i ostaju izvan članskog pisanja.

---

## 3. Pretplata

Pravilo „pretplata ograničava samo vlastite projekte" **već vrijedi** kroz `*_readonly_when_downgraded` politike i `projects_downgrade_ok`. Potrebno:
- iz svih novih/izmijenjenih *članskih* grana **ne** stavljati `can_write_module`;
- iz `project_milestones` INSERT/UPDATE `with_check` zadržati `can_write_module` samo u owner-grani;
- uvesti jedan predikat `public.can_write_project_progress(_project_id, _user_id)` = `get_project_role IN ('owner','member') AND projects_downgrade_ok(...)`, da se pravilo ne piše na pet mjesta (isti obrazac kao `can_read_project_phases` iz koraka A).

---

## 4. Sučelje

Mjesta koja danas pretpostavljaju „piše samo vlasnik":
- `useProjectWriteGuard` / `lib/projectWriteGuard.ts` — `isProjectWriteAllowed` propušta isključivo `owner_subscriber`; `participant` prolazi samo uz `allowOwnWorkLog`. Treba analogni opt-in `allowMemberProgress` (bez novog stanja i bez diranja postojeće semantike).
- `lib/projectRolePermissions.ts` — `canEditMilestones: isOwnerEffective`. Za `member` postaje istina samo za *napredak*; uvesti razdvojene zastavice `canEditMilestoneProgress` (owner+member) i `canEditMilestoneAmounts` (owner) da UI ne miješa to dvoje.
- `ProjectMilestonesTab.tsx` / `MilestoneKanban.tsx` — gumbi „Nova faza"/„Obriši" ostaju owner-only; „Uredi"/promjena statusa/datuma otvara se voditelju. Polja iznosa u formi već se skrivaju po ulozi (korak B) i ne ulaze u payload.
- `ProjectDocumentsTab.tsx`, `MilestoneChecklist.tsx` — upload/dodavanje uvjetovati novim `member` pravom umjesto `isReadOnly`.
- `MilestoneBudgetChangeSection.tsx` / `MilestoneRevisionsDialog.tsx` — ostaju owner-only, sada i u bazi.
- `ProjectFullScreenView.tsx` i `ProjectDetailDialog.tsx` već imaju `currentUserRole` + `isOwner`, pa se nova prava izvode iz istog izvora (nema novih propova iz podataka).
- i18n: nova poruka odbijanja za pokušaj promjene iznosa (hr/en/de).

---

## 5. Testovi

Novi `e2e/security/specs/09-role-writes-matrix.spec.ts` po obrascu iz `08-milestone-scope.spec.ts` (isti fixture helperi, `ensureSecEntitlements`, pet korisnika: owner, member, viewer, worker, investor).

Za svaku ulogu × radnju provjerava se **odgovor baze**, ne UI:
- UPDATE statusa faze → member OK, viewer/worker/investor odbijen
- UPDATE `budget` na fazi → **member odbijen** (`42501`), owner OK
- UPDATE `investor_price` → member odbijen
- UPDATE `contract_value` na `projects` → svi osim ownera odbijeni
- INSERT/DELETE faze → member odbijen
- INSERT `milestone_budget_revisions` → member odbijen
- INSERT dokumenta → member OK, viewer/investor odbijen
- INSERT checklist stavke → member OK, viewer odbijen
- INSERT `project_workers` / UPDATE `hourly_rate` → svi osim ownera odbijeni
- INSERT `project_members` / `project_invitations` → svi osim ownera odbijeni
- vlasnik bez pretplate → odbijen na svom projektu; **član bez pretplate → prolazi** na tuđem projektu

Uz to vitest jedinični testovi za nove pure helpere u `projectRolePermissions.ts` / `projectWriteGuard.ts`.

---

## 6. Rizici

- **Neizravni put do iznosa:** `milestone_budget_revisions` i `project_budget_revisions` su danas otvoreni svakom članu — to je *stvarna* rupa, zatvara se ovim korakom. Provjeriti i trigger `_guard_contract_value_update` te `create_worker_payout` (SECURITY DEFINER) — potvrditi da interno traže vlasnika, ne samo članstvo.
- **VTR i predlošci:** faza iz odluke ima zaključanu cijenu; trigger to dodatno tvrdi na razini baze. Predlošci (`project_templates`) kreiraju faze samo pri stvaranju projekta (vlasnik) — nema članskog puta.
- **`return=representation`:** najveći praktični rizik. Bez rješenja iz točke 2 voditeljev upis „radi u bazi, puca u UI-ju".
- **SECURITY DEFINER funkcije** koje pišu po fazama zaobilaze RLS, ali **ne** zaobilaze trigger — to je dodatni argument za trigger umjesto RPC-a.
- **Postojeći zapisi:** politike ne diraju podatke; nijedna promjena nije retroaktivna. Suženje (dokumenti, checkliste, revizije) može nekome oduzeti mogućnost koju je imao — vrijedi provjeriti ima li u produkciji redova koje su unijeli `viewer`/`investor` prije nego se politika suzi.

---

## Otvoreno pitanje: kvačica „ovaj voditelj vidi cijenu"

**Preporuka: odgoditi.** Ne spada prirodno u korak D — korak D je o *pisanju*, a kvačica je iznimka u *čitanju* iz koraka A. Miješanje bi značilo ponovno otvaranje `project_milestones_scoped` i `can_read_project_phases` usred izmjene write politika, pa bi jedan regresijski test padao a ne bi se znalo iz kojeg sloja.

Kad se radi, traži: `boolean` stupac na `project_members` (npr. `can_see_investor_price`, default `false`), izmjenu `CASE` grane za `investor_price` u pogledu, kvačicu u `ProjectMemberPermissionsDialog` (owner-only upis, već postoji), i proširenje `canSeeMilestonePriceField` da prima tu zastavicu umjesto samo uloge. Realno pola dana, najbolje kao zaseban korak D2 odmah nakon D.
