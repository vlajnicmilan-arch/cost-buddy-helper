# Krug — podmirenje s izborom izvora i transakcijom na obje strane (PLAN)

## Utvrđeno stanje (provjereno u bazi)
- `krug_settlement_ledger`: id, krug_id, from_user, to_user, amount, currency, note, marked_by, marked_at, voided_*, created/updated_at. Nema izvora ni veze na transakciju.
- `krug_mark_settled`: provjera punopravnog člana, samo dužnik (`only_debtor_can_settle`), advisory lock po paru, insert, obavijest `krug_settlement_marked_settled` (best-effort). Nema idempotencije.
- `krug_void_settlement`: dužnik ili vjerovnik, razlog obavezan, samo postavlja `voided_*`.
- `can_write_payment_source(source, user)`: vlasnik ili član s ulogom full/limited/member.
- `expenses.expense_nature` danas: NULL, regular, extraordinary, correction. `client_request_id` + indeks `uniq_expenses_client_request` postoje.
- UI: `KrugSettleTransferDialog.tsx` (104 r.), poziva ga `KrugSettlementSection.tsx` (416 r.).

## 1) Model podataka (aditivna migracija)
Nove nullable kolone u `krug_settlement_ledger`:
- `payer_expense_id uuid`, `payer_source_id uuid` (FK na expenses / custom_payment_sources, ON DELETE SET NULL)
- `recipient_expense_id uuid`, `recipient_source_id uuid`, `recipient_confirmed_at timestamptz`
- `client_request_id text` + parcijalni unique (marked_by, client_request_id)
- `payer_amount numeric`, `payer_currency text` (samo kad se valuta izvora razlikuje, v. 7)

Postojeći zapisi ostaju NULL, bez backfilla. Status u povijesti izvodi se: `recipient_confirmed_at IS NULL AND payer_expense_id IS NOT NULL` → „čeka potvrdu primitka"; stari zapisi (`payer_expense_id IS NULL`) → prikaz kao danas.

## 2) Atomičnost dužnika
Nova RPC `krug_mark_settled_with_source(p_krug_id, p_to_user, p_amount, p_currency, p_source_id, p_note, p_client_request_id, p_payer_amount default null)` — SECURITY DEFINER, `REVOKE ALL FROM PUBLIC`, GRANT authenticated.
- Iste provjere kao `krug_mark_settled` (kopira se iz žive definicije), plus `can_write_payment_source(p_source_id, auth.uid())`.
- Idempotencija: ako postoji zapis s (marked_by, client_request_id) → vrati postojeći id, ništa novo.
- U jednoj transakciji: insert u `expenses` (type expense, nature v. 3, `payment_source = 'custom:<id>'`, `client_request_id`, bez `krug_id`) → insert u ledger s `payer_expense_id`. Svaka greška poništava oboje.
- Saldo se mijenja kroz postojeće triggere `expenses` (motor salda se ne dira).
- Stara `krug_mark_settled` ostaje (kompatibilnost starih klijenata); novi UI zove samo novu.

## 3) Vrsta zapisa
Novi `expense_nature = 'krug_settlement'` (text kolona, bez promjene tipa):
- Motor salda gleda `type`, pa saldo izvora reagira normalno.
- Svi putevi statistike moraju ga isključiti kao što isključuju `correction`: `reportTotals.ts`, `useExpenses.ts`, dashboard agregati, budžeti, AI uvidi, projektni P&L, izvoz (označen, ne izbačen). Popis mjesta se utvrđuje `rg` pretragom u koraku gradnje i dokazuje testom.
- Uklapanje u plan „vrste zapisa koje nisu trošak": ovo je prva takva vrsta; kasnije se `correction` i `krug_settlement` mogu objediniti pod zajednički helper `isNonSpendingNature()`. Ovaj nalog uvodi helper i koristi ga na svim mjestima.
- Bez `krug_id` → ne ulazi u podjele ni „Tko kome". Kategorija: fiksna nerazvrstana vrijednost koju registar kategorija ne broji.
- Opis: `Podmirenje duga — <ime> (Krug <naziv>)` generira server iz i18n kataloga jezika korisnika.

## 4) Strana primatelja
RPC `krug_confirm_settlement_receipt(p_ledger_id, p_source_id, p_client_request_id)`:
- samo `to_user`, zapis nije poništen, `recipient_confirmed_at IS NULL` (inače vrati postojeće ako je isti client_request_id, inače `already_confirmed`), `can_write_payment_source`.
- Atomično: insert priljeva (type income, nature `krug_settlement`) + update ledger.
- Obavijest: novi tip `krug_settlement_receipt_pending` u klijentskom i serverskom katalogu (hr/en/de) i u `krugNotificationRoutes.ts` s deep-linkom `?krug=<id>&settle_confirm=<ledger_id>` koji otvara prozor potvrde. Emitira se iz RPC-a iz točke 2 (best-effort, kao danas).

## 5) Poništenje
`krug_void_settlement` (od žive definicije) dodatno meko briše `payer_expense_id` i `recipient_expense_id` (postojećim soft-delete putem, `deleted_at`) → triggeri vraćaju saldo. Radi i nakon potvrde primatelja.
Ako je povezana transakcija spojena s bankovnim retkom (`bank_match_status`/bankovni id postavljen): NE briše se, jer je sada stvarni bankovni pokret (novac je stvarno otišao). Umjesto toga `expense_nature` se vraća na `regular` (ulazi u potrošnju kao obična uplata), a void vraća `bank_linked_kept: true` i UI prikazuje poruku da je bankovni redak zadržan. Bankovni redak se nikad ne gubi.

## 6) Banka
Nova transakcija je običan ručni redak s `payment_source` i `bank_match_status = pending_bank` → ulazi u postojeće pravilo „isti trošak" (sync, uvoz, ponuda). Merge nasljeđuje bankovni redak, a `expense_nature` ručnog retka mora preživjeti merge — provjeriti u živoj definiciji `merge_manual_with_bank`; ako ga ne prenosi, otvoreno pitanje (ne mijenjam merge bez naloga). Test obaveznog para dodaje se.

## 7) Valuta
- Ista valuta: iznos = iznos podmirenja.
- Različita: dijalog traži OBAVEZAN unos stvarno plaćenog iznosa u valuti izvora (`payer_amount`); kao pomoć prikazuje preračun po zadnjem `krug_settlement_fx_snapshot` (ako postoji) s oznakom datuma, bez automatskog upisa. Ledger čuva iznos Kruga za „Tko kome", transakcija iznos izvora. Isto za primatelja.

## 8) Dijeljeni izvori
Dopušteno ako `can_write_payment_source` prolazi (vlasnik, full, limited). Ostali članovi izvora vide transakciju kao i svaki drugi upis u taj izvor; vidi se opis s imenom druge strane i nazivom Kruga (v. otvoreno pitanje o privatnosti). Viewer se odbija.

## 9) Greške
Klijent: postojeći `reportError` proširen kodovima `source_not_writable`, `already_confirmed`, `not_recipient`, `payer_amount_required`, `voided`. Svaka greška: insert u `app_diagnostics_logs` (event `krug_settle_error`, rpc ime, krug/ledger/source id, doslovan code/message, `buildStamp`), korisniku prevedena poruka po kodu; generička samo kad kod nije poznat, uz upis.

## 10) Čuvari (SQL, `supabase/tests/krug/settlement_with_source.sql`, dokaz pada na današnjem stanju)
1. točno jedna dužnikova transakcija na odabranom izvoru (danas: 0 → pada)
2. ne-dužnik odbijen
3. izvor bez prava pisanja odbijen
4. potvrda samo primatelj, samo jednom
5. void briše povezane i vraća saldo; spojeni bankovni redak ostaje
6. `krug_settlement` ne ulazi u potrošnju/prihode (SQL + vitest na `reportTotals`)
7. isti client_request_id dvaput = jedan zapis, jedna transakcija
Dodaje se u `KRUG_SETTLE_MIGRATIONS.txt`; SQL suite salda mora biti zelen (deploy gate).

## 11) Velike datoteke
`KrugSettlementSection.tsx` (416 r.): izdvaja se samo red/popis povijesti podmirenja u `KrugSettlementHistoryRow.tsx` bez promjene ponašanja; funkcionalno se mijenja samo dodavanje statusa „čeka potvrdu". Izvještaj će odvojeno navesti izdvojeno i promijenjeno.

## Datoteke
- Migracija `drizzle/migrations/00xx_krug_settlement_with_source.sql` (kolone, 2 nove RPC, redefinicija `krug_void_settlement`, emit novog tipa obavijesti)
- `src/hooks/useKrugSettlementMutations.ts` (nove mutacije, greške, dijagnostika)
- `src/components/krug/KrugSettleTransferDialog.tsx` (izbor izvora, valuta)
- novi `src/components/krug/KrugConfirmReceiptDialog.tsx`, `KrugSettlementHistoryRow.tsx`
- `src/components/krug/KrugSettlementSection.tsx` (status, otvaranje potvrde)
- `src/lib/krugNotificationRoutes.ts`, `supabase/functions/notify-krug-event/index.ts`, serverski i klijentski katalog obavijesti
- novi `src/lib/nonSpendingNature.ts` + mjesta statistike (`reportTotals.ts`, `useExpenses.ts`, ...)
- i18n hr/en/de
- testovi: SQL iz točke 10, vitest za rute, reportTotals, dijalog

## Podjela na naloge
1. Migracija + RPC + SQL čuvari (bez UI)
2. Isključenje iz statistike (`isNonSpendingNature`) + testovi
3. UI dužnika + greške/dijagnostika
4. Primatelj: obavijest, deep-link, potvrda
Rizik najviši u 2 (propušteno mjesto statistike = dvostruko brojanje) i 5 (void + bank).

## Otvorena pitanja
1. `expense_nature = 'krug_settlement'` kao nova vrijednost ili čekati zajednički model „vrsta zapisa" iz plana kategorija?
2. Prenosi li `merge_manual_with_bank` `expense_nature` ručnog retka? Ako ne, smijem li to dodati u ovom opsegu?
3. Void nad spojenim bankovnim retkom: prihvaćaš prijedlog (zadrži redak, vrati na `regular`) ili radije blokirati void?
4. Treba li opis transakcije na dijeljenom izvoru sadržavati naziv Kruga (vidljivo ostalim članovima izvora)?
5. Smije li primatelj odbiti potvrdu („nisam primio") ili je to samo void?
6. Stari UI put (`krug_mark_settled` bez izvora) — ukloniti iz klijenta odmah ili ostaviti?
