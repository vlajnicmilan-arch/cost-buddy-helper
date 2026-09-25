# Radnici: potvrda isplate na strani radnika (plan, bez izmjena)

## 0. Glavni nalaz: tok već postoji (v1.0)
Veći dio priče je već izgrađen:
- `AttributionSheet` (globalni host u `App.tsx`) radnik otvara dodirom na obavijest `worker_payout_created` ili `worker_payout_voided` (`useNotificationNavigation`).
- U njemu radnik bira svoj novčanik. Klijent kroz `addExpense` upisuje prihod (`type='income'`, `category='salary'`) s poveznicom `worker_payout_id`, a za zbirnu isplatu `worker_payout_batch_id`.
- Dvostruki upis sprječava jedinstveni indeks (user_id, worker_payout*_id); greška 23505 prikazuje se kao „Već pripisano".
- Podatke o isplati radnik čita samo kroz `get_my_incoming_payouts` (SECURITY DEFINER, `w.user_id = auth.uid()`).
- Storno prikazuje info panel i ne dira ništa radnikovo.

Ne gradi se nova paralelna funkcija. Postojeći tok se učvršćuje na tri mjesta: isporuka obavijesti, upis na serveru i „Nisam primio".

## 1. Tok podataka (provjereno upitima)
- **Veza s računom:** `project_worker_payouts.worker_id` → `project_workers.user_id`. Ako je taj stupac prazan, radnik je nepovezan i nema obavijesti ni greške (JOIN s uvjetom `w.user_id IS NOT NULL`).
- **Obavijest u aplikaciji:** upisuje je `enqueue_worker_payout_notifications`, sinkronim INSERT-om u `notifications`.
  - Zovu je samo `create_person_payout` i `create_worker_payout_batch`.
  - `create_worker_payout` (pojedinačna isplata) i `void_worker_payout` je NE zovu.
- **Push:** klijent nakon RPC-a zove `notify-worker-payout` bez čekanja i bez ponovnog pokušaja (`useWorkerPayouts.ts` 201, 227, 261, 274). Ta funkcija sama piše da više ne upisuje red u `notifications`.
- **Stanje u bazi:** povezanih isplata je 8, a obavijest `worker_payout_created` ima samo jedna (19.8.). Za ostalih 7 red u `notifications` nije pronađen. Svih 8 ipak ima pripisan prihod: radnik je unosio ručno ili na drugi način. Uzrok nije potvrđen; vjerojatno je riječ o putu kroz `create_worker_payout`.
- Petrova isplata od 13.9. (`f60d70ae…`) već ima pripisan prihod.

Prvi korak gradnje: potvrditi kojim RPC-om nastaje koja isplata i gdje se obavijest gubi. Također treba potvrditi koji klijent zove `create_person_payout` (u `src` nisam našao poziv).

## 2. Obavijest pouzdano
- Obavijest za `created` i `voided` upisuje server, unutar istog RPC-a u kojem nastaje ili se stornira isplata. Uključuje `create_worker_payout` i `void_worker_payout`, kroz postojeći `enqueue_worker_payout_notifications`.
  - Upis je sinkron i u istoj transakciji, pa se ne može tiho izgubiti kao HTTP poziv.
  - Upis je u EXCEPTION bloku (uzorak 0016) i nikad ne ruši isplatu; greška ide u `app_diagnostics_logs` kao `worker_payout_notify_error`.
- Push: zajednički outbox za sve obavijesti ne postoji; `krug_notify_outbox` je samo za Krug. Dvije mogućnosti:
  - (a) **preporuka:** poopćiti outbox, tj. dodati `source` (krug | worker_payout) i isti retry cron. Klijentski fire-and-forget poziv se uklanja.
  - (b) push ostaje klijentski, a red u aplikaciji je jamstvo.
  Odluka je na tebi.
- Dedup ključ je `worker_payout:<payout_id|batch_id>:<created|voided>`.

## 3. Potvrda primitka na serveru: `worker_confirm_payout_receipt`
Parametri: `(p_payout_id uuid | p_batch_id uuid, p_source_id uuid, p_client_request_id uuid, p_amount numeric DEFAULT NULL)`. Obrazac je `krug_confirm_settlement_receipt`:
- zvati je smije samo `auth.uid() = project_workers.user_id` za sve isplate u zahtjevu;
- isplata ne smije biti stornirana;
- `can_write_payment_source(source, uid)`;
- ista valuta traži točan iznos; druga valuta traži `p_amount > 0`;
- ponovni poziv s istim `client_request_id` vraća `idempotent: true`, a drugi zahtjev za istu isplatu vraća `already_confirmed`. Uz to vrijedi i postojeći jedinstveni indeks.
- Upis: `type='income'`, `category='salary'`, `expense_nature` ostaje NULL, `movement_kind` NULL, `status='approved'`, plus `worker_payout_id` ili `worker_payout_batch_id`.
  - **Zašto NULL:** `isRealIncome` isključuje svaki `movement_kind` i sve `NON_SPENDING_NATURES`. Za radnika je isplata stvarni prihod (plaća), za razliku od Krug podmirenja, koje je samo vraćanje duga. Zato prihod mora ući u izvješća.
- Opis: „Isplata za rad" ili „Isplata za rad: <projekt>". Preporuka je bez imena projekta, jer radnik ionako vidi projekt kroz poveznicu. Ime projekta nije tajna prema radniku, pa odluku prepuštam tebi.
- `AttributionSheet` prelazi s `addExpense` na ovu RPC funkciju. Izgled ostaje isti.

## 4. Storno kod vlasnika — usporedba
| | (A) samo javiti (preporuka) | (B) meko poništenje kao void u Krugu |
|---|---|---|
| Radnikovi podaci | netaknuti | server mu označi prihod kao poništen |
| Pristanak | poštuje „nitko ne piše u tuđe financije" | vlasnik mijenja radnikove brojke |
| Stvarni novac | radnik je novac možda stvarno primio, a storno je knjigovodstveni | pogrešno ako je novac primljen |

Preporuka je (A): obavijest `voided`, postojeći info panel s gumbom „Otvori moj unos". Radnik sam odlučuje hoće li unos obrisati.

## 5. „Nisam primio"
- RPC `worker_report_payout_not_received(payout_id|batch_id, client_request_id)`: zvati je smije samo povezani radnik, jednom po isplati.
- Upisuje oznaku u novu tablicu `worker_payout_receipt_reports` i obavijest vlasniku `worker_payout_not_received` s rutom na isplatu.
- Nema automatskog storna. Dedup ključ je `worker_payout_nr:<id>`.

## 6. Ekrani
- Obavijest otvara postojeći `AttributionSheet` s ciljem `confirm=1`.
- U „Moja zarada na projektu" dolazi odjeljak „Isplate na čekanju": isplate bez pripisa i bez prijave, čitane kroz novu `get_my_pending_payouts()` (SECURITY DEFINER, samo moje).
- `AttributionSheet` dobiva gumb „Nisam primio". Izgled ostaje uz postojeći sheet; `KrugConfirmReceiptDialog` služi kao uzor za tekstove i stanja.
- Novi tekstovi na hr, en i de.

## 7. Postojeće isplate
Nema naknadnog slanja. Serverska obavijest vrijedi samo za isplate nastale nakon migracije. „Isplate na čekanju" prikazuju samo isplate s `created_at` nakon datuma uvođenja, da se stare ne pojave.

## Tehnički detalji
- **Migracije:**
  1. `enqueue` pozivi u `create_worker_payout` i `void_worker_payout`, polazeći od žive definicije;
  2. `worker_confirm_payout_receipt` i `worker_report_payout_not_received`;
  3. tablica `worker_payout_receipt_reports` (GRANT, RLS: radnik čita svoje, vlasnik čita za svoje projekte, upis samo kroz RPC);
  4. `get_my_pending_payouts`;
  5. po odluci (a), stupac `source` u outboxu i proširenje retryja.
  Sve SECURITY DEFINER funkcije dobivaju `REVOKE ALL … FROM PUBLIC, anon`.
- **Balance deploy gate:** RPC upisuje u `expenses` i mijenja saldo novčanika, pa je obavezan zeleni `supabase/tests/balance`.
- **SQL čuvari (novi paket `worker_payout_receipt`):**
  - samo povezani radnik smije potvrditi, a vlasnik i treća osoba dobivaju 42501;
  - točno jedan prihod, a ponovni poziv je idempotentan;
  - storniranu isplatu nije moguće potvrditi;
  - druga valuta traži iznos;
  - `isRealIncome`: prihod bez `expense_nature` i bez `movement_kind`;
  - pojedinačna isplata i storno upisuju točno jednu obavijest;
  - greška obavijesti ne ruši isplatu i ostavlja trag;
  - „Nisam primio" šalje obavijest vlasniku i ne mijenja isplatu;
  - anon i authenticated nemaju pristup tablici izvan RLS-a.
- **vitest:** `AttributionSheet` zove RPC, a ne `addExpense`; gumb „Nisam primio"; `useWorkerPayouts` bez klijentskog `notify-worker-payout` (po odluci a); odjeljak „Isplate na čekanju".
- **Procjena:** 3 naloga.
  1. Dijagnoza i server: obavijest na serveru i outbox.
  2. RPC-ovi za potvrdu i „Nisam primio" uz SQL čuvare.
  3. Ekrani i vitest.

## Otvorene odluke
1. Push kroz poopćeni outbox (a) ili ostaje klijentski (b)?
2. Opis prihoda s imenom projekta ili bez njega?
3. Storno: (A) samo javiti, ili (B) meko poništenje?
