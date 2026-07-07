
# Isplata radnika na projektima — 3 varijante dizajna

## Kontekst postojećeg modela (verificirano u kodu i DB-u)

- **`project_workers`** — interni radnici na projektu: `hourly_rate`, `work_hours`, `work_start_time/end_time`, `user_id` (opcionalno linkanje na prijavljenog korisnika). **Nema polja o isplati.**
- **`project_work_entries`** — dnevni zapisi (`work_date`, `scheduled_hours`, `actual_hours`, `worker_id`, `milestone_ids`). Kalendar/standup source of truth za koliko je radnik radio.
- **`project_collaborators`** — vanjski suradnici s fiksnom cijenom: `total_price` + `paid_amount` (skalar). Već ima primitivan payout tracker.
- **`expenses`** — ima `collaborator_id`, `is_advance`, `linked_advance_ids`, `project_id`, `milestone_id`, `payment_source`, `work_type`. **Nema `worker_id`.**
- **P&L (`useProjectProfitLoss`)** — trošak rada računa kao `sum(work_entries.actual_hours) × hourly_rate` (teoretski), + `collaborators.total_price`, + expenses. Znači: cost je već u P&L, ali **nigdje se ne vidi je li radnik stvarno primio novac**.

**Ključna asimetrija**: suradnici imaju `paid_amount` + avanse kroz expenses, radnici nemaju ništa — samo teoretski cost bez traga isplate.

**Vlasnikov zahtjev**: označiti da je radnik isplaćen za period (mjesec ili custom), jednostavno, točno, vezano na trošak projekta i izvor plaćanja, s podrškom za djelomične isplate.

---

## Varijanta A — Minimal: expense s `worker_id` + period polja

**Ideja:** isplata radniku = obični `expenses` red, analogno kako suradnici već rade. Bez zasebne payout tablice.

**Podatkovni model:**
- Dodati na `expenses`: `worker_id uuid` → `project_workers(id)`, `period_start date`, `period_end date`.
- Isplata = `expense` s `worker_id`, `type='expense'`, `work_type='salary'`, `payment_source` (postojeći), `amount` (bruto), `period_start/end` (koji period pokriva).

**UI tok:**
- Na kartici radnika: gumb "Isplati". Dialog s izborom perioda (Ovaj mjesec / Prošli mjesec / Custom range).
- Sustav automatski sumira `actual_hours` iz `work_entries` u tom rasponu × `hourly_rate` → prijedlog iznosa (edit dozvoljen za djelomično).
- Odabir `payment_source`, opcionalno milestone, potvrda → INSERT jedan expense.
- Status "isplaćen za period" = izračunat iz zbroja svih expensea s `worker_id` čiji `[period_start, period_end]` presijeca traženi raspon.

**Djelomične isplate:** više expensea za isti period; UI sažima "isplaćeno X od Y (Z sati odrađeno)".

**Vezanje na trošak/izvor:** automatski — expense već ulazi u P&L i troši iz payment source-a. Treba samo P&L prilagoditi da ne broji dvostruko (teoretski cost iz work_entries × rate **VS** stvarne isplate) — vjerojatno se prebaci na "stvarno isplaćeno" kao primary metric.

**Avansi radnicima:** postojeći `is_advance` + `linked_advance_ids` mehanizam se proširi da radi i za `worker_id` (danas radi samo za `collaborator_id`).

**Prednosti:**
- Najmanje površine: jedna tablica, jedan UI pattern kao za trošak.
- Nema sinkronizacijskih problema (jedan izvor istine).
- Reuse postojećih flow-ova: soft-delete, budget/project filtriranje, bank matching, kartice, avansi.
- Retrokompatibilno: postojeći expenses bez worker_id ostaju netaknuti.

**Mane:**
- Period je "meki" koncept — ništa ne sprječava dva overlapping expense-a za isti period (može se dodati validation trigger).
- Nema first-class objekta "payroll run za lipanj" (npr. za bulk isplatu svih radnika odjednom treba petlja u UI).
- Agregatni izvještaj "koliko sam isplatio radniku X ukupno kroz projekt" treba GROUP BY nad expenses.
- P&L semantika treba redefiniciju: teoretski cost vs stvarne isplate.

---

## Varijanta B — Payout ledger: tablica `worker_payouts` + auto-generirani expense

**Ideja:** payout je first-class objekt, expense se auto-generira iz njega. Kompromis između A i C.

**Podatkovni model:**
- Nova tablica `project_worker_payouts`:
  - `worker_id`, `project_id`, `period_start`, `period_end`
  - `hours_covered numeric` (koliko sati iz entries pokriva)
  - `hourly_rate_snapshot numeric` (fiksirano u trenutku isplate — otporno na kasnije promjene satnice)
  - `gross_amount numeric` (predloženo = hours × rate)
  - `paid_amount numeric` (ono što je stvarno isplaćeno; može biti < gross)
  - `payment_source text`, `paid_at timestamptz`, `note text`
  - `expense_id uuid` (link na auto-generirani expense red)
  - `status text` (`draft` | `paid` | `partial`)

**UI tok:**
- Novi tab "Isplate" unutar radnikove kartice (ili globalni "Payroll" tab na projektu).
- "Nova isplata" → odabir radnika (ili "Svi radnici" za bulk), odabir perioda, prikaz preview tablice (radnik, sati, satnica, gross), edit iznosa po redu (djelomična), payment_source za sve, "Potvrdi isplatu".
- Backend: za svaki payout INSERT `project_worker_payouts` + INSERT `expenses` (s `worker_id`, `work_type='salary'`, `amount = paid_amount`, link natrag preko `expense_id`).
- "Isplaćen za lipanj" = postoji payout(i) sa status=paid koji pokrivaju traženi period.

**Djelomične isplate:** ako `paid_amount < gross_amount` → `status='partial'`, kasnija dopuna = novi payout red za isti (ili preostali) period; UI sažima "isplaćeno 60% (900 od 1500 kn)".

**Vezanje na trošak/izvor:** payout kreira expense automatski, expense_id je referencirano; brisanje payouta soft-deletea expense (kaskada preko RPC-a).

**Avansi radnicima:** payout može referencirati avanse (`linked_advance_ids` na payoutu, analogno današnjem invoice patternu za suradnike) — netira gross.

**Prednosti:**
- Jasan audit trail: "sve isplate radniku X" je `SELECT * FROM worker_payouts WHERE worker_id = ?`.
- Snapshotana satnica → nema retroaktivnog kvarenja povijesti kad se rate mijenja.
- Bulk payroll run ("isplati sve radnike za lipanj u 2 klika") — first-class use case.
- P&L može jasno razlikovati "planirani cost (entries × rate)" vs "stvarno isplaćeno (sum payouts)".
- UX za vlasnika: mjesečni payroll ritam se prirodno mapira.

**Mane:**
- Dvije tablice → treba sinkronizacija (payout ↔ expense). Rizik od drift-a ako netko edita expense direktno.
- Više SQL površine: nova tablica + RLS + GRANT + policies + trigger za dedup periode.
- Više UI površine: novi tab, novi dialog, bulk selection.
- Migracija postojećih projekata: ništa za retrofit-ati (radnici nemaju povijest isplata), ali expenses koji su možda ručno unesen kao "plaća radniku" ostaju odvojeni od payout ledgera.

---

## Varijanta C — Payout ledger + zaključavanje `work_entries` (najpotpunija)

**Ideja:** kao B, ali svaki radni dan (`work_entries` red) pripada točno jednoj isplati. Nakon isplate — zaključan.

**Podatkovni model:**
- Sve iz B, plus:
- `project_work_entries.payout_id uuid` → `project_worker_payouts(id)` (nullable).
- Kad se kreira payout za period, svi entriji tog perioda dobiju `payout_id`. `payout_id IS NOT NULL` → entry je locked (ne može se editirati bez unlock-a payouta).

**UI tok:**
- Kao B, ali preview korak pokazuje koje točno dane isplata pokriva (checkbox lista); vlasnik može isključiti pojedine dane (djelomično po danima, ne samo po iznosu).
- Kalendar radnog vremena vizualno označava isplaćene dane (zeleni marker ✓).
- "Unlock payout" gumb za editiranje entrija (npr. kad se otkrije greška u satima naknadno).

**Djelomične isplate:** dvije razine — (1) isključi neke dane iz payouta, (2) unutar payouta paid < gross.

**Vezanje na trošak/izvor:** kao B.

**Prednosti:**
- Nemoguća dvostruka isplata istog dana (DB-level constraint kroz `payout_id`).
- Vizualno u kalendaru se vidi što je "processed" vs "pending".
- Najbliže pravom payroll sustavu.
- P&L može reći "od 200 zabilježenih sati, 150 je isplaćeno".

**Mane:**
- Najveća implementacijska površina i UI kompleksnost.
- Lock/unlock flow → dodatna pravila (tko smije, što s soft-deleted entrijima, konfliktne izmjene).
- Migracija: postojeći entriji trebaju backfill `payout_id = NULL` (trivijalno), ali ako se ikad izbriše radnik s entrijima koji imaju payout — treba kaskadna logika.
- Više edge case-ova za testirati (SQL suite raste).

---

## Trade-off tablica

```text
                     A (expense-only)   B (payout ledger)   C (ledger + lock)
implementacijska     mala               srednja             velika
površina
audit trail          slab (GROUP BY)    jak                 vrlo jak
otpornost na         slaba (bez         jaka (snapshot)     jaka
promjenu satnice     snapshot-a)
bulk payroll run     ručno (petlja)     first-class         first-class
double-pay zaštita   samo trigger       aplikativna         DB constraint
djelomična isplata   po iznosu          po iznosu           po iznosu I danima
UI površina          1 dialog           1 tab + 1 dialog    1 tab + 2 dialoga
                                                            + kalendar overlay
P&L jasnoća          treba redefinirati jasno (plan vs      jasno + per-day
                     "cost"             stvarno)            granularnost
migracijski rizik    nikakav            nizak               srednji
```

---

## Otvorene pretpostavke (potvrditi prije odabira)

1. **Bruto = neto** (nema poreznog/doprinosnog obračuna u sustavu). Ako vlasnik želi bruto/neto split, sve tri varijante trebaju dodatna polja.
2. **Valuta isplate** = valuta projekta (naslijeđeno iz payment_source). Multi-currency isplate nisu u scope-u.
3. **Avansi radnicima** želimo podržati (danas radi samo za suradnike). Sve tri varijante mogu reuse-ati `is_advance` + linkanje.
4. **P&L reinterpretacija**: dogovor treba li "cost" biti (a) entries × rate (teoretski, planiran) ili (b) sum(payouts) (stvarni cashflow). Vjerojatno oboje uz labele.
5. **RBAC**: samo owner projekta smije evidentirati isplatu, ili i member/worker (npr. worker sam sebi potvrdi da je primio novac)? Očekivano — samo owner.

---

## Preporuka za sljedeći korak

Bez daljnjeg guranja: **B je sweet-spot** za "jednostavno + točno + audit". A je premalo (nema payroll runa, teško izvještaje), C je overkill za trenutnu bolnu točku. Ali odluka je vlasnikova — sve tri su izvedive.
