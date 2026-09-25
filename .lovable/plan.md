# Plan: „Živa salda" (samo plan, bez izmjena)

Cilj: svaka promjena salda ili transakcija vidi se na Početnoj, u Novčaniku, popisu transakcija i „Tko kome" za 1–2 s od upisa u bazu, bez ručnog osvježavanja. `useBundleFreshness` se ne dira.

## 1. Stanje danas (provjereno u kodu i bazi)

Publikacija `supabase_realtime` sadrži: app_diagnostics_logs, document_ingest_items, expenses, krug, krug_deletion_request, krug_deletion_vote, krug_membership, krug_shared_payment_source, notifications, payment_source_invitations, payment_source_members, project_activity_log, project_members, project_milestones, project_work_entries, reminders.

NE sadrži: `custom_payment_sources` (saldo), `krug_settlement_ledger`, `budget_*`, `project_decisions*`.

| Hook / ekran | Tablica i filtar | Što radi kad stigne događaj |
|---|---|---|
| `useExpenseFetch` (Početna, popis, Novčanik – transakcije) | expenses, INSERT/UPDATE/DELETE, bez filtra; kanal `expenses-realtime-<user>` | Ručno mijenja lokalno stanje; `belongsToMyScope` odbacuje tuđe retke; ne invalidira saldo |
| `useCustomPaymentSources` (saldo) | nema realtime-a | Samo `useAppResume` (povratak u prvi plan + online) |
| `useKrug` | krug, krug_membership (user_id / krug_id), expenses (krug_id) | Invalidacija upita Kruga |
| `useKrugSharedPaymentSources` | krug_shared_payment_source (krug_id) | Invalidacija |
| `useKrugDeletion` | krug_deletion_request/vote (krug_id) | Invalidacija |
| „Tko kome" / podmirenja (`useKrugSettlementMutations`) | ledger nije u publikaciji | Osvježava samo nakon vlastite mutacije |
| `useProjectMilestones` | project_milestones, expenses (project_id) | Osvježava projekt |
| `useProjectMembers`, `useProjectWorkEntries`, `useProjectActivity` | vlastite tablice po project_id / worker_id | Osvježavanje |
| `useProjectDecisions` | project_decisions*, bez objave → događaji nikad ne stižu | Ništa u praksi |
| Budžeti (`useBudgets`) | nema realtime-a | Ništa; ovise o popisu transakcija |
| `useNotifications`, `useMailRealtime` | notifications, document_ingest_items | Za saldo nisu bitni |

Zamjenski put: `useAppResume` postoji u useExpenseFetch, useCustomPaymentSources, useNotifications, mail i ostalim hookovima.

`expenses` i `custom_payment_sources` imaju REPLICA IDENTITY DEFAULT: kod UPDATE/DELETE događaja stari red nosi samo `id`.

## 2. Promjene salda bez realtime događaja za saldo

SQL funkcije koje pišu `custom_payment_sources` (provjereno u bazi):
- `_expenses_recompute_source_balance` (okidač na expenses): transakcija stiže realtime-om, ali novi saldo izvora ne.
- `recompute_custom_source_balance`: preračun, bez transakcije.
- `align_source_to_bank`: poravnanje s bankom.
- `set_source_anchor`: sidro.
- `apply_balance_delta_if_unanchored`.
- Okidači na izvoru (`_cps_autoseed_anchor*`, `_cps_balance_guard_*`) mijenjaju isti redak.

Serverske funkcije koje pišu izvore: `bank-sync-transactions` (+ `_shared/bankSyncDecision`), `bank-link-account`, `respond-to-invitation`, `mcp`, `financial-assistant`. Serverska funkcija `send-member-invitation` samo čita. Točan opseg pisanja za svaku provjerava se u Nalogu 1.

Krug: RPC-ovi podmirenja pišu `krug_settlement_ledger`, a on nije u objavi. Transakcije podmirenja u expenses stižu realtime-om, ali stanje „Tko kome" ne. Merge (`merge_manual_with_bank`) piše expenses i stiže realtime-om, ali saldo ne.

## 3. Prijedlog: jedan zajednički slušač

**Tablice u objavi (zaseban nalog, migracija):**
- `custom_payment_sources` i `krug_settlement_ledger`.
- Opcionalno `budget_categories` i `budget_plans`. Najprije provjeriti treba li to uopće, jer se budžeti računaju iz transakcija.

**Privatnost:**
- Realtime `postgres_changes` provjerava SELECT RLS za INSERT/UPDATE. Svaki pretplatnik dobiva samo retke koje smije čitati.
- Dijeljeni novčanik: postojeća SELECT politika na `custom_payment_sources` (vlasnik ili član) određuje primatelje. U Nalogu 1 provjeriti da politika ne pušta više od toga.
- Krug: SELECT politika ledgera treba biti „samo članovi tog Kruga"; provjeriti politiku prije objave.
- DELETE događaji se ne filtriraju po RLS-u i nose samo `id`. Slušač na DELETE zato samo pokreće osvježavanje po ključu, nikad ne čita podatke iz događaja.
- Klijentska provjera dosega (`belongsToMyScope`) ostaje kao druga razina.

**Jedan slušač (`LiveDataProvider` u postojećem kontekstnom sloju):**
- Jedan kanal po korisniku umjesto više kanala po hooku.
- Sluša expenses, custom_payment_sources, krug_settlement_ledger i krug_membership.
- Događaj → oznaka „prljavo" za skupinu upita: transakcije, saldo, krug:<id>, budžeti.
- Grupiranje: prvi događaj pokreće tajmer od 400 ms; svi događaji u tom prozoru spajaju se u jedno osvježavanje po skupini. Tvrda gornja granica je 1.500 ms od prvog događaja, što drži cilj ispod 2 s i kod velikog uvoza.
- Postojeće ručno spajanje redaka u `useExpenseFetch` zamjenjuje se tim putem. Alternativno, ostaje za pojedinačni upis, a za pljusak (više od N događaja u prozoru) radi se jedan dohvat. Odluka u Nalogu 2.
- Povratak veze ili prvog plana: postojeći `useAppResume` pokreće puno osvježavanje svih skupina i ponovno spajanje kanala, ako je pao.

**Dijagnostika:**
- Statusi kanala `CHANNEL_ERROR`, `TIMED_OUT` i `CLOSED` (neočekivano) te uspješno ponovno spajanje upisuju se u `app_diagnostics_logs`.
- Event je `realtime_channel_state`, s doslovnim statusom i kodom greške, build stampom i trajanjem prekida.
- Ograničenje: najviše jedan zapis po stanju u 60 s po uređaju, da se tablica ne napuni.

**Mobitel (Capacitor):**
- Jedan WebSocket i jedan kanal umjesto današnjih više kanala.
- Kad aplikacija ide u pozadinu, kanal se odspaja nakon ~30 s. Po povratku se ponovno spaja i radi puno osvježavanje. Tako se ne troši baterija u pozadini.
- Bez dodatnog pollinga.

## 4. Rizici

- **Optimistično stanje nasuprot realtime-u:** isti redak dođe dvaput, ili realtime prepiše optimističnu vrijednost. Rješenje: realtime samo invalidira, istina je serverski dohvat, a optimistični zapis se deduplicira po `id`.
- **Redoslijed događaja:** transakcija i promjena salda stižu odvojeno i mogu doći obrnutim redom. Rješenje: grupirano osvježavanje uvijek dohvaća oboje zajedno, pa se ne prikazuje miješano stanje.
- **Tuđi podaci:** RLS i klijentska provjera dosega. DELETE ne nosi podatke. SELECT politike za obje nove tablice provjeriti prije migracije.
- **Trošak realtime poruka:** svaka promjena reda šalje jednu poruku svakom ovlaštenom pretplatniku. Veliki uvoz od npr. 500 redaka šalje oko 500 poruka za expenses i oko 500 za saldo izvora (okidač po retku). Stvarni broj izmjeriti na probi; po potrebi okidač preračuna svesti na jedan UPDATE po naredbi. To je zaseban, rizičan nalog (BALANCE DEPLOY GATE).
- **Neaktivni kanali bez objave:** kanali za `project_decisions*` ne primaju ništa. Ili ih objaviti, ili ukloniti; odlučiti zasebno.
- **REPLICA IDENTITY DEFAULT:** kod UPDATE događaja stari red nosi samo `id`. `detectAuthorOutcome` u `useExpenseFetch` čita stari red; provjeriti radi li danas.

## 5. Dokaz

- **Proba na dva uređaja (Milan i Vinka, dijeljeni novčanik):** tablica slučaj → vrijeme do prikaza na drugom uređaju, štopericom i iz dijagnostičkog zapisa.
- **Slučajevi:** upis, uređivanje, brisanje, korekcija salda, sidro, poravnanje s bankom, preračun, bank sync, uvoz izvoda (velik), spajanje, Krug podmirenje (dužnik i primatelj), povratak iz pozadine i prekid mreže.
- **Automatski:**
  - Vitest za slušač: grupiranje, gornja granica 1.500 ms, preslikavanje događaja na skupine upita, DELETE bez podataka i zapis dijagnostike.
  - Playwright s dvije sesije gdje je izvedivo: upis kroz jednu, mjerenje do prikaza u drugoj, prag 2 s.
- **Mjera iz produkcije:** opcionalni zapis latencije (vrijeme `updated_at` → prikaz) u dijagnostiku, uzorkovano.

## 6. Nalozi i redoslijed

1. **Dijagnoza bez izmjena:** SELECT politike za `custom_payment_sources` i `krug_settlement_ledger`, točna pisanja serverskih funkcija, radi li `detectAuthorOutcome` bez punog starog reda.
2. **Migracija:** dodati `custom_payment_sources` i `krug_settlement_ledger` u objavu. Samo objava, bez promjene logike i bez REPLICA IDENTITY FULL za te dvije tablice (slušač samo invalidira). Nalaz iz naloga 1: `recompute_custom_source_balance` piše i kad se saldo ne mijenja, pa za novčanik sa sidrom svaki redak uvoza daje jedan UPDATE; mjeri se u koraku 5. Zasebna odluka izvan naloga 2: REPLICA IDENTITY FULL na `expenses` za potvrdu/odbijanje prijedloga u Krugu.
3. **Klijent:** zajednički slušač, grupiranje, puno osvježavanje po povratku, dijagnostika kanala. Postojeći hookovi prelaze na njega, a stari kanali se uklanjaju. Testovi.
4. **„Tko kome" i budžeti** na isti slušač.
5. **Proba na dva uređaja** i mjerenje troška poruka kod velikog uvoza.
6. **(Uvjetno)** smanjiti broj UPDATE-a salda po naredbi uvoza — samo ako mjerenje pokaže da je potrebno, uz SQL paket salda.

Procjena: 4–5 naloga, šesti samo po potrebi.
