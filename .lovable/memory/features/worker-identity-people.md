---
name: Ljudi — identitet satnog radnika iznad projekata
description: Tablica workers (identitet) + project_workers.worker_id (angažman), pogled Projekti|Ljudi, potvrda spajanja bez automatike
type: feature
---
Model:
- `public.workers` = IDENTITET osobe koja radi na sat (user_id vlasnik, business_profile_id doseg, linked_user_id, archived_at). RLS: vlasnik upravlja svojima; povezani korisnik smije pročitati svoj zapis.
- `project_workers.worker_id` → `workers.id` = ANGAŽMAN. Satnica, pozicija i radno vrijeme ostaju na angažmanu (ista osoba smije imati različitu satnicu po projektu).
- NE dirati: `project_work_entries`, `project_worker_rate_history`, `payout_rate_segments`, `project_worker_payouts` — sati i obračun ostaju vezani na angažman.

Granica: SURADNICI (`project_collaborators`) nikad se ne povezuju, zbrajaju ni prikazuju u Ljudima.

Pravila:
- Nikad automatsko spajanje. Grupiranje po (business_profile_id, normalizirano ime) daje samo PRIJEDLOG; korisnik potvrđuje "Da, isti" / "Ne, druge osobe".
- Pri dodavanju radnika na projekt, ako ime već postoji među Ljudima istog poslovnog profila → pitanje "Dodaj postojećeg / Ovo je druga osoba".
- Arhiviranje je izričita radnja, nikad automatska.
- Pogled Projekti → Ljudi je SAMO ZA ČITANJE; zbraja postojeće, ne uvodi novi način isplate.

Kod: `src/lib/workerIdentity.ts` (čiste funkcije + testovi), `src/hooks/useWorkerIdentities.ts`, `src/hooks/useWorkerIdentityAttach.ts`, `src/components/projects/PeopleTab.tsx`, `PersonDetailDialog.tsx`, `ExistingPersonPromptDialog.tsx`, prekidač u `src/pages/Projects.tsx`.
Svaki pad upisuje trag u `app_diagnostics_logs` (`worker_identity_*`).

## Isplata s kartice čovjeka (2. isporuka)
- RPC `public.create_person_payout(p_items, p_payment_source, p_paid_at, p_note, p_lock_entries)`: validira vlasništvo i da iznos po angažmanu NE prelazi ono što ostaje (nema predujma, greška `payout_exceeds_remaining`).
- Jedan angažman → postojeći jednostruki put (`create_worker_payout`, vlastiti trošak). Više angažmana → JEDAN trošak u `expenses` s `worker_payout_batch_id` + po redak u `project_worker_payouts` sa zajedničkim `batch_id`.
- `create_worker_payout` dobio `p_expense_id` i `p_batch_id` (default NULL) — kad je expense zadan, ne stvara vlastiti i ne postavlja `worker_payout_id`. Storniranje ide postojećim `void_worker_payout_batch`.
- Klijent: `src/lib/personPayout.ts` (FIFO prijedlog, validacija, RPC args + testovi), `src/hooks/usePersonPayout.ts` (dijagnostika `worker_payout_ok` / `worker_payout_failed`), `src/components/projects/PersonPayoutDialog.tsx` (prvi kat = zarada po angažmanima, drugi kat = iznos + novčanik + promjenjiva raspodjela).
- Migracija upisana u `BALANCE_MIGRATIONS_IGNORE.txt` (upis u expenses ide postojećim triggerom).

## Storniranje s kartice čovjeka (3. isporuka)
- Povijest isplata na `PersonDetailDialog` ima radnju "Storniraj" po retku; potvrda + OBAVEZAN razlog kroz `ConfirmActionDialog`.
- Koristi POSTOJEĆE funkcije: `void_worker_payout` (pojedinačna) i `void_worker_payout_batch` (kad redak ima `batch_id`). Nema nove SQL logike ni migracije.
- Stornirane isplate OSTAJU u povijesti (oznaka + razlog, precrtan iznos) i ne ulaze u "isplaćeno" — `aggregatePerson` vraća sve nevidljivo-neobrisane isplate (`isVisiblePayout`), a `totalPaid` broji samo `isLivePayout`.
- Neuspjeh piše `worker_payout_void_failed` u `app_diagnostics_logs` (kod + doslovna poruka baze). Kod: `src/hooks/usePersonPayoutVoid.ts`.
- Put storniranja iz projekta (`WorkerPayoutsDialog` → `useWorkerPayouts.voidPayout`) ostaje nepromijenjen.

## "Ostaje" se mjeri NOVCEM (4. isporuka)
- Mjera duga je `zarađeno − stvarno isplaćeno`, NIKAD nepokriveni sati. Djelomična isplata zaključa sve sate; hours-based mjera je taj ostatak skrivala i činila ga neisplativim.
- Baza (`20260826035907`): `create_person_payout` računa dug novcem, brana `payout_exceeds_remaining` (tolerancija 0,01 €) prije ijednog upisa. Dio iznosa bez pokrića u satima ide u NOVE retke namirenja (`hours_covered = 0`, `gross = paid`, status `paid`) vezane uz razdoblja starih nedoplaćenih isplata (najstarija prva). Stari `partial` redci ostaju nepromijenjeni.
- Predujam ne postoji: iznos iznad duga se odbija; ako povijesno postoji preplata, `remaining` je 0,00 €, a preplata se prikazuje zasebno (`totalAdvance`).
- `aggregatePerson` vraća `paid`, `advance`, `shortfalls` po angažmanu; `unpaidFrom/To` padaju natrag na razdoblje nedoplaćene isplate kad nema slobodnih sati.
- Povijest isplata: zadnjih 5 (`localStorage: vmbalance.people.payoutHistory.showAll`), grupirano po mjesecima sa zbrojem, stornirane iza "+ N storniranih". Kod: `src/lib/payoutHistory.ts`.
- Gate: migracije `20260825213455` i `20260826035907` su PREMJEŠTENE iz ignore-a u `BALANCE_MIGRATIONS.txt`; scenariji PM1–PM4 u `supabase/tests/balance/10_scenarios.sql` dokazuju da 0,01 € iznad duga pada i da ostatak prolazi.

## Veza s Centar računom pripada OSOBI (5. isporuka)
- Migracija `20260827140400`: okidač PREMA GORE (`AFTER UPDATE OF user_id` na `project_workers`) upisuje `workers.linked_user_id` i povezuje SVE ostale angažmane te osobe; okidač PREMA DOLJE (`BEFORE INSERT`) daje novom angažmanu `linked_user_id` osobe.
- Sukob (račun već vezan uz DRUGOG radnika na tom projektu, `project_workers_project_user_uniq`) se NE guta: taj projekt se preskoči i upiše se `person_link_conflict_skipped` u `app_diagnostics_logs`.
- RPC `public.link_person_to_user(p_person_id, p_user_id)` (SECURITY DEFINER, samo vlasnik osobe) veže ili odvezuje (NULL) osobu i sve njezine angažmane; vraća `{linked, engagements_linked, skipped_projects}`. Bez prijave ili tuđa osoba → 42501.
- GRANICA: sama veza NE daje pristup aplikaciji — pristup ide isključivo iz Članova (`project_members`). Napisano u kodu i u sučelju.
- Kod: `src/lib/personLinkPlan.ts` (+ testovi), `src/hooks/usePersonLink.ts`, `src/components/projects/PersonAccountLinkSection.tsx` (stanje veze, "Pozovi u Centar" preko postojećih pozivnica s najnovijim aktivnim angažmanom kao nositeljem, "Poveži s postojećim članom", "Odveži" uz potvrdu). Dijagnostika: `person_link_ok/failed`, `person_unlink_ok/failed`.
- SQL harness: `supabase/tests/people/run.sh` (baseline + `PEOPLE_LINK_MIGRATIONS.txt` + scenariji PL1–PL6). NIJE dio balance harnessa — migracija ne dira saldo.
