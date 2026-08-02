# Korak E — Trošak voditelja ide na potvrdu (sati ne)

## Prvo: što se kosi s tvojom pretpostavkom

Prije rješenja, tri nalaza iz repozitorija koja mijenjaju opseg.

**1. Voditelj VEĆ danas smije upisati trošak — i to odmah kao potvrđen.**
INSERT politika na `expenses` glasi: kad je `project_id` postavljen, dopušteno je svakom aktivnom sudioniku projekta (`is_project_participant_active`), bez ikakve provjere uloge i bez provjere stanja. Dakle korak D nije zatvorio upis troška; zatvorio je samo faze. Trenutno i `worker` može upisati trošak. Korak E stoga nije "otvaranje prava", nego **sužavanje**: neovlaštenima zabraniti, voditelju dopustiti samo `pending`.

**2. Voditelj bi si danas mogao sam potvrditi trošak.**
UPDATE politika dopušta izmjenu vlastitog retka (`auth.uid() = user_id`) bez ograničenja stupca `status`. Bez zaključavanja, `pending → approved` je jedan klik podnositelja.

**3. NAJVAŽNIJE — nepotvrđen trošak DANAS ULAZI U SALDO.**
Motor salda (`_expenses_recompute_source_balance` i `recompute_custom_source_balance`) filtrira samo `deleted_at` i `expense_nature <> 'correction'`. Stupac `status` se **nigdje ne spominje**. Znači: svaki `pending` trošak već sada pomiče saldo novčanika, a pri odbijanju se saldo vraća samo zato što se zapis fizički briše. Čim odbijanje prestane brisati (tvoja točka 4), saldo ostaje kriv. Ovo je jezgra koraka E, ne sporedni detalj.

**4. Odgovor na pitanje o satima.**
Provjereno u `src/lib/projectProfitLoss.ts`:
- **Trošak po fazi** (`useProjectMilestones`, `useProjectStats`) računa se **isključivo iz `expenses`**. Neisplaćeni sati NE ulaze u trošak faze. Tu je stanje već onakvo kakvo želiš.
- **P&L projekta** računa `laborCost` iz **svih** radnih unosa (`actual_hours × rate_at`), bez obzira na isplatu, i još `materialCost = max(0, expenses − labor − collab)`. Dakle **u P&L-u neisplaćeni rad ulazi u trošak**, i to na obračunskoj, ne novčanoj osnovi — iako je kartica opisana kao "cash view".
Ovo je odstupanje od tvog cilja, ali je **promjena izračuna** i u ovom koraku je **ne diram**. Prijavljujem i čekam odluku.

---

## 1. Mehanizam stanja — stupac, ne zaseban zapis

Ostajemo na `expenses.status` (`pending | approved | rejected`), koji već postoji i koristi se za budžete i prihodne izvore (`usePendingTransactions`, `useProjectPendingTransactions`, `notify-pending-transaction`).

Zašto ne zaseban "prijedlog" zapis: trošak nosi ~50 stupaca (izvor plaćanja, faza, tip rada, predujmovi, sidrenje vremena, uvozni otisak). Duplikat bi značio drugu shemu, drugu RLS matricu i pretvorbu pri potvrdi — nova klasa tihih odstupanja.

Cijena tog izbora je poznata i eksplicitno se plaća u točki 3: kad je zapis u `expenses`, **saldo ga vidi po zadanom**, pa izuzeće mora biti u motoru, a ne u pozivateljima.

Dodaje se:
- `expenses.rejection_reason text null`
- `expenses.reviewed_by uuid null`, `expenses.reviewed_at timestamptz null`
- CHECK: `rejection_reason` smije biti popunjen samo uz `status = 'rejected'`

## 2. Popis SVIH mjesta koja zbrajaju troškove

Popis je iz stvarnog stabla; stupac "danas" je izmjereno stanje.

| # | Mjesto | Danas filtrira `status`? | Postupak |
|---|---|---|---|
| 1 | `src/lib/projectCalculations.ts` (`isCountedProjectTransaction`) | DA (`status && !== 'approved'` → out) | bez izmjene |
| 2 | `src/lib/projectProfitLoss.ts` (`isCountedTx`) | DA | bez izmjene |
| 3 | `useProjectStats.ts` | DA (`.eq('status','approved')` u upitu) | bez izmjene |
| 4 | `useProjectMilestones.ts` (trošak po fazi) | DA (kroz #1) | bez izmjene |
| 5 | `useActiveProjectsSummary.ts` | DA | bez izmjene |
| 6 | `src/pages/Index.tsx` (dashboard) | provjeriti pri gradnji | uskladiti ako fali |
| 7 | `src/lib/reportTotals.ts` / `reportExport.ts` | **NE spominju `status`** — ovise o ulazu pozivatelja | dodati filtar u samom helperu (obrana u dubinu), ne samo u pozivatelju |
| 8 | `ProjectReportsDialog.tsx` (PDF) | dolazi iz #3/#4 | provjeriti svaki ulaz; dodati oznaku "N nepotvrđenih, nije uključeno" |
| 9 | `supabase/functions/check-milestone-budgets` | **NE** — `select amount where milestone_id, type='expense'` | dodati `.neq('status','pending')` |
| 10 | `supabase/functions/mcp` (`project_summary`, popis projekata, budžet, krug) | **NE** ni u jednom upitu | dodati filtar u svakom |
| 11 | `supabase/functions/project-insights` | provjeriti | uskladiti |
| 12 | `supabase/functions/generate-ai-insights`, `financial-assistant` | provjeriti | uskladiti |
| 13 | `supabase/functions/send-daily-summary` | **NE** | dodati filtar |
| 14 | `supabase/functions/check-budget-alerts` | DA (`.eq('status','approved')`) | bez izmjene |
| 15 | Motor salda (DB) | **NE** | vidi točku 3 |

Pravilo koje uvodimo umjesto 15 pojedinačnih obećanja: **jedan zajednički filtar** (`isCountedProjectTransaction` na klijentu, jedan `_shared/countedExpense.ts` na edge strani) i vitest koji prolazi kroz popis i pada ako se pojavi novi upit nad `expenses` bez filtra.

## 3. Saldo — ovdje se odluka doista donosi

Izmjena je u motoru, ne u pozivateljima:
- `_expenses_recompute_source_balance`: `pending` se tretira kao nepostojeći (i na strani OLD i na strani NEW). Prijelaz `pending → approved` postaje pozitivna delta, `approved → rejected` negativna, `pending → rejected` nula.
- `recompute_custom_source_balance`: u oba načina (`day_cut` i `hybrid`) u `WHERE` dolazi `AND COALESCE(e.status,'approved') <> 'pending'`.
- `rejected` se također isključuje, istim uvjetom (`status NOT IN ('pending','rejected')`), jer odbijeni zapis ostaje u tablici umjesto da se briše.

**Ovo je promjena semantike motora salda**, pa po pravilu iz memorije aktivira BALANCE DEPLOY GATE:
- `supabase/tests/balance/` mora biti zelen u cijelosti,
- `baseline.sql` se osvježava s nove žive definicije funkcija (`pg_get_functiondef`, nikad iz stare migracije),
- novi slučajevi: insert `pending` → saldo nepromijenjen; `pending → approved` → saldo pomaknut točno jednom; `approved → rejected` → saldo vraćen; sidrena i nesidrena grana odvojeno; `pending` transfer na obje strane.
- **Migracija zatečenih podataka**: postojeći `pending` troškovi već su ušli u saldo. Migracija mora nakon izmjene funkcija pokrenuti `recompute` za svaki pogođeni izvor, inače stanje ostaje krivo. To je jedina dopuštena promjena podataka u koraku E.

## 4. Prava u bazi

- **INSERT**: postojeću politiku zamijeniti tako da vlasnik smije upisati bilo koje stanje, `member` smije upisati **samo** `status = 'pending'` i `submitted_by = auth.uid()`, a `worker` i `investor` ne smiju upisati ništa (danas smiju — to je zatvaranje rupe).
- **UPDATE**: novi guard trigger na `expenses` (druga brava, po uzoru na `guard_milestone_column_writes`): tko nije vlasnik projekta, ne smije mijenjati `status`, `rejection_reason`, `reviewed_by/at`. Podnositelj svoj `pending` zapis smije uređivati sadržajno; nakon `approved` više ne (vidi rizike).
- **Namjenski put — da, potreban je**, iz istog razloga kao `update_milestone_progress`: `review_project_expense(p_expense_id uuid, p_decision text, p_reason text)`, SECURITY DEFINER, provjerava `is_project_owner`, postavlja stanje + revizora + razlog atomarno, i time izbjegava ovisnost o SELECT-preduvjetu RLS-a koji nas je već ugrizao u koraku D. Trigger ostaje kao druga brava.
- Ne diramo: čitanje iz koraka A/D2, prava pisanja na fazama, `update_milestone_progress`.

## 5. Obavijesti — postoji, koristimo postojeće

Već postoje `notify-pending-transaction` (koristi ga `useExpenseCRUD`) i `notify-project-transaction`, plus `notification_preferences` i push infrastruktura. Traži se:
- pri INSERT-u `pending` na projektu: `notify-pending-transaction` → vlasniku,
- pri odbijanju: nova vrsta poruke voditelju, s razlogom, kroz isti put (`notifications` + push), po uzoru na `transaction_auto_rejected` koji već postoji,
- ključevi u hr/en/de; bez novog kanala i bez nove tablice.

Napomena: cron `auto-reject-pending` danas **fizički briše** istekle `pending` zapise. Uz točku 4 to postaje nedosljedno — mijenja se u `status='rejected'` s automatskim razlogom.

## 6. Testovi

- **SQL harness** (`supabase/tests/security/role_write_matrix.sql`), uz obavezno zeleno svih **72** postojećih: `member` INSERT `pending` prolazi; `member` INSERT `approved` → 42501; `worker`/`investor` INSERT → 42501; `member` UPDATE `status` → 42501 (i kroz trigger, mehanizmom C); vlasnik kroz RPC prolazi; ne-vlasnik kroz RPC → 42501.
- **Balance SQL suite**: slučajevi iz točke 3.
- **Vitest**: `pending` i `rejected` izuzeti u `projectCalculations`, `projectProfitLoss`, `reportTotals`; regresija na trošak po fazi; postojećih 2305 ostaje zeleno.

## 7. Rizici

1. **Saldo (najveći).** Dok motor ne filtrira, svaki `pending` je tiho odstupanje. Ako se promjena funkcija i recompute zatečenih podataka ne dogode u istoj migraciji, ostaje pomak koji nitko ne vidi.
2. **Nefiltrirani upiti** — MCP, `check-milestone-budgets`, `send-daily-summary` danas broje sve. Nakon koraka E to više nisu bezopasni propusti nego put kojim nepotvrđeno ulazi u brojku.
3. **Potvrđen pa naknadno izmijenjen.** Prijedlog: nakon `approved` podnositelj gubi pravo izmjene; vlasnik smije mijenjati. Izmjena iznosa od strane vlasnika ide kroz motor salda normalno. Alternativa (vraćanje u `pending` pri izmjeni iznosa) donosi treperenje salda i ne predlažem je.
4. **Zatečeni podaci** — postoje li `pending` troškovi na projektima, treba prebrojati prije migracije; oni su nakon izmjene prvi kandidati za krivi saldo.
5. **Sati u P&L-u** (nalaz 4 gore) ostaje otvoren; dok se ne riješi, "marža" i "trošak po fazi" ne govore isto.

## Što trebam od tebe prije gradnje

1. Potvrdi zatvaranje rupe: `worker` i `investor` gube INSERT na troškove.
2. Potvrdi da `rejected` ne ulazi u saldo (ostaje kao zapis, bez učinka).
3. Odluči za sate u P&L-u: ostavljam kako jest u ovom koraku (moj prijedlog), ili to postaje zaseban korak F.
