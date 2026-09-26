# Program Temelj, korak 3, nalog 4: red „Na pregled" za neodlučive retke sinkronizacije (samo plan)

## 1. Odluke koje sync danas donosi „na slijepo"

Provjereno u `_shared/bankSyncDecision.ts`, `_shared/bankSyncSameExpense.ts` i `bank-sync-transactions/index.ts`:

| Grana | Što se danas dešava |
|---|---|
| Dva ili više ručna kandidata za „isti trošak" (pravilo vrati `ambiguous`) | Redak se upisuje kao NOVI redak (duplikat ručnog) — stara logika; jezgra u sjeni to bilježi kao `same_expense_undecided` |
| Pravilo kaže `uncertain` (nesigurno podudaranje) | Isto: novi redak |
| Pravilo `match`, ali postoji i kandidat-prijenos (`rule_match_and_transfer_candidate`) | Ne spaja ništa; upisuje novi redak |
| Kandidat već spojen u ovom pokretanju (`candidate_already_used_in_run`) | Novi redak |
| Samo kandidat-prijenos, bez pravila (`pickMergeTarget` put) | Automatski spaja kao prijenos — bez potvrde korisnika |
| Kartica ne pripada izvoru (`card_source_mismatch`), rezervacija, nedostaje iznos/datum | Preskakanje (to je ispravno, ne dirati) |

Ključni nalaz: kad je neodlučno, sync danas **upisuje novi redak** (duplikat), a ne pogađa spajanje. Rizik je dvostruki trošak u knjigama, ne krivo spajanje — osim grane prijenosa, koja spaja automatski.

**Učestalost u zadnjih 60 dana (upit na `app_diagnostics_logs`):** 6 zapisa `bank_sync_core_shadow`, od toga 0 s neodlučnim retcima (`same_expense_undecided_total = 0` svugdje). Uzorka je premalo za pouzdanu procjenu — sinkronizacija se u tom razdoblju malo pokretala ili bez neodlučnih redaka. Plan zato ne ovisi o brojkama; sjena ostaje izvor dokaza za nalog 3.

## 2. Postojeći ekran za pregled

Postoji `ImportReview` (uvoz PDF/izvoda): reducer u `src/lib/importReview/` s klasifikacijama `auto_merge` / `question` / `new` / `transfer`, blokirajuća pitanja, „Razdvoji", „Bez objašnjenja", izvršenje kroz `executor.ts`. To je upravo obrazac koji treba — ali radi nad redcima uvoza (payload u memoriji + `imported_statements`), ne nad sinkronizacijom.

**Prijedlog: iskoristiti obrazac i komponente ImportReview-a, ne pisati novi ekran.** Red „Na pregled" za sync je nova izvorna vrsta u istom pregledu (ili isti ekran s drugim izvorom redaka), ne zaseban ekran.

## 3. Kako redak čeka pregled

**Preporuka: zasebna tablica `bank_sync_review_queue`, NE redak u `expenses`.**

- Redak u `expenses` sa statusom „na pregledu" zahtijevao bi da SVI upiti salda, sidara, izvješća i budžeta znaju za novi status — prevelik rizik za saldo (balance deploy gate). U zasebnoj tablici redak fizički ne postoji u knjigama dok se ne odluči: saldo i sidra se ne miču, RLS je trivijalan (`user_id = auth.uid()`, kao `imported_statements`).
- Stupci: id, user_id, bank_account_id, stable_id, raw payload (bez osjetljivog viška), razlog (`ambiguous` / `uncertain` / `rule_and_transfer` / `transfer_only`), kandidati (jsonb, id-evi), status (pending/decided/dismissed), odluka, created_at, decided_at.
- Migracija additivna: CREATE TABLE + GRANT authenticated + RLS (samo vlasnik) + service_role. Bez diranja `expenses`, sidara, trigera.

## 4. Odluke na ekranu

Po retku: **Spoji s A / Spoji s B** (kandidati iz reda) · **Novi redak** · **Prijenos** (s ciljem) · **Preskoči** (ne uvozi).

- Svaka odluka ide kroz postojeće RPC-ove: spajanje kroz isti merge put kao ImportReview/`manualBankMergePair`, novi redak kroz standardni upis, prijenos kroz postojeći transfer put, preskoči = oznaka u redu (dismissed).
- Jezgra `moneyLedgerPlan`: odluke se prevode u planove jezgre (merge/insert/transfer) — ista pravila kao uvoz. Trag: `app_diagnostics_logs` event `bank_sync_review_decision` (razlog, vrsta odluke, stable_id; bez iznosa i opisa).
- Idempotentnost: stable_id je jedinstven po (user, bank_account) u redu; odluka dva puta = drugi put vraća već odlučeno.

## 5. Veza s nalogom 3 (prespajanje synca na jezgru)

**Može prije, i to je preporuka.** Red na pregled je neovisan o tome tko odlučuje:

- Faza 4a (ovaj nalog): stara logika (`chooseSyncMerge`) tamo gdje danas „na slijepo" upisuje novi redak zbog neodlučnosti → umjesto toga upis u red na pregled. Sync ostaje na staroj logici; jedina promjena ponašanja: neodlučni redak više ne stvara duplikat, nego čeka.
- Faza 4b (nalog 3): kad sjena dokaže podudarnost, sync se prespaja na jezgru; jezgra tada sama puni isti red. Red i ekran se ne mijenjaju.

Time red na pregled čak pomaže nalogu 3: razlika stare logike i jezgre vidljiva je upravo na redovima u redu.

## 6. Migracije, testovi, nalozi, rizici

- **Migracije:** 1 (nova tablica + RLS + GRANT). Bez promjena na `expenses`, sidrima, trigermima.
- **Testovi:**
  - SQL čuvari (novi paket `bank_sync_review`): RLS (tuđi red nevidljiv), jedinstvenost stable_id, odluka dvaput, dismissed se ne uvozi.
  - vitest: granje neodlučnosti → red (bez novog retka u expenses), ekran (4 odluke), prijevodi hr/en/de.
  - **Balance deploy gate obavezan** (tablica ne dira saldo, ali gate se vozi kao regresija): cilj 144 PASS / 0 FAIL.
- **Nalozi:** 2 — (4a) red + grana u syncu + ekran; (4b, uz nalog 3) jezgra puni red.
- **Rizici:**
  - Saldo: minimalan — redak na pregledu ne postoji u `expenses`.
  - Regresija ponašanja: korisnik koji danas dobije duplikat sutra dobije redak na pregledu — namjerna promjena, naglasiti u priopćenju.
  - Prijenosna grana (`transfer_only`) danas spaja automatski; ako i nju premjestimo u red, mijenja se postojeće ponašanje — **otvoreno pitanje**: prijenos ostaviti automatskim (kao danas) ili i njega slati na pregled? Preporuka: ostaviti automatskim u 4a, pregled samo za neodlučive.

## Otvorena pitanja za vlasnika

1. Prijenos bez pravila: automatski (kao danas) ili na pregled?
2. Red na pregled vidljiv i u ImportReview ekranu ili samo obavijest + zaseban ulaz?
