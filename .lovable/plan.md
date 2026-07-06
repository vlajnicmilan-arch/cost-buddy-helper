## Kritički osvrt — samo analiza, nula izmjena

### Q1 — BUG 1 (same-day blind spot)

**Slažem se s dijagnozom.** Engine na liniji 61–62 (0628205415) filtrira C3/C4/NULL sa `(e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date`. Za manualne unose koji dobiju `date = danas 00:00:00 UTC` i `time_confidence = C3` (default), svaki red na točan dan sidra trajno je isključen. Filter za `expense_nature <> 'correction'` uklanja samo sam correction-red; ostali same-day C3 unosi ispadaju kolateralno.

**Je li `>` namjerno?** Da, ali iz drugog razloga nego što se čini. Kad je sidro postavljeno preko UI-ja u trenutku T, korekcija zapisuje "trenutno stanje = Y" — sve prethodne aktivnosti tog dana su već "zapečene" u Y. Uključivanje C3 redova istog dana bi ih dvostruko brojalo, jer C3 nema pravi event time da razlikuje "prije korekcije" od "poslije korekcije". Strogo `>` je defenzivan izbor za rješavanje te ambigviteta — ne bug u smislu greške u dizajnu, nego **posljedica gubitka precizne informacije o vremenu na C3 razini**.

**Kako tretirati dokazivo izgubljene same-day unose?** Retroaktivno ih nije moguće razriješiti iz podataka jer stvarno ne znamo dogodilo li se prije ili poslije korekcije. Jedini legitiman put: **jednokratni forenzički backfill** koji sam-dan C3 redove postavi na `event_at = anchor_ts + 1s`, `time_confidence = C2`, `user_edited_event_at = true` — čime izjavljujemo "korisnički intent: dogodilo se poslije korekcije". To je politička odluka, ne tehnička, pa je iznosim kao opciju umjesto akcije.

### Q2 — Prijedlog (a): rizici i rubni slučajevi

**Rizici trenutne formulacije "datum = danas → C1":**
1. **00:30 slučaj:** korisnik unosi trošak od jučer navečer. `date = jučer`, ne aktivira C1 granu, ostaje C3. Ako je jučer bio dan sidra — trošak trajno nevidljiv. Vaš prijedlog to ne pokriva.
2. **Retroaktivni unos na dan starijeg sidra:** korekcija otprije 3 dana, danas dodaje "zaboravio sam kavu od prekjučer". `date = prekjučer ≠ danas`, ostaje C3. Ako se poklopi s danom sidra — nevidljiv.
3. **`event_at = now` s `date = danas 00:00`:** stvara nesklad između `date` (koristi se u filterima/reportima) i `event_at` (koristi se u anchor cut). Za engine je to točno; za sortiranje po datumu OK; za tjedne/mjesečne grupe OK. Nema regresije.

**Bolji pristup — "manual entry uvijek precizan":**
Umjesto grananja po `date == today`, jednostavnije pravilo:
- **Svaki manual entry → `system_precise` s `event_at = now()`, `time_confidence = C2`, `user_edited_event_at = false`.**
- `date` ostaje ono što korisnik odabere (za reporting, filtere, mjesečne grupe).
- Engine u hybrid modu koristi `event_at > anchor_ts` → red se uključuje ako je unos napravljen POSLIJE korekcije, isključuje ako PRIJE.

**Semantika:** "user records this transaction at wall-clock time now, on date X". Sidro znači "u trenutku T sve prije zaboravi". Sve što korisnik nakon T upiše — bilo za danas, jučer ili prekjučer — svjesna je post-anchor izjava i treba se brojati. To rješava sva 3 rubna slučaja iznad **bez izuzetka**.

**Jedina prava kontraindikacija:** korisnik danas dokumentira retroaktivnu transakciju od prije 2 mjeseca (davno prije sidra). `event_at = now > anchor_ts` → uključuje se. To je ispravno — svjesno je dodao kasnije. Ako želi da bude pre-anchor, mora postaviti novo sidro ili tu transakciju izbrisati.

**Preporuka:** ići s ovim proširenim pravilom, ne "date == today" heuristikom.

### Q3 — Obavezni recompute uz SET sidra

**Nizak rizik, ali dvije stvari za provjeriti:**
1. **UI put "Postavi korekciju stanja"** — trenutno vjerojatno okida recompute preko insert-triggera na correction-red. Treba potvrditi da nije usput moguć redoslijed UPDATE-anchor-first pa INSERT-correction — inače imamo tihi drift čak i u UI toku.
2. **Bulk backfill migracije** — recompute po redu za N stotina izvora unutar jedne transakcije može biti spor (svaki poziva pun scan po `expenses`). Rješenje: pozvati recompute u istoj migraciji, ali batchano po `source_id` ili nakon COMMIT-a (npr. `PERFORM recompute...` u petlji na kraju migracije). Neće ništa razbiti, treba samo predvidjeti trajanje.

**Ništa ne bi trebalo pući.** Trigger `_expenses_recompute_source_balance` već tretira anchored path kao "full recompute from anchor", pa je obavezni recompute uz SET semantički identičan onome što se ionako događa na prvi write.

### Q4 — Rupе u test coverageu

Testovi (`anchorBalance.sqlParity.test.ts`, `writerIntent.test.ts`) pokrivaju kontrat, ne scenarije. Nedostaje:

1. **C2 redovi** — user-edited event_at koji se poklopi s anchor_ts na sekundu.
2. **Transferi između dva anchored izvora s različitim `anchor_date`.** Trenutni engine radi per-source; provjeriti da se transfer-in/out ispravno pojavljuje na obje strane s obzirom na dva različita sidra.
3. **DST prijelaz Europe/Zagreb** — sidro postavljeno u noći prijelaza (25.10. / 30.3.), unos par sati kasnije. `deriveC3EventAt` traži offset [1,2] pa bi trebao izdržati, ali nema testa.
4. **Ponoć UTC vs ponoć Europe/Zagreb** — `date` u bazi je `YYYY-MM-DD 00:00:00 UTC` (tj. 01:00/02:00 lokalno). Za korisnika koji unosi u 23:30 lokalno, `date::date` u UTC-u može ispasti sutrašnji dan. Vrijedno je test slučaj.
5. **Istovremeni unosi + recompute** — dvije transakcije u istoj sekundi, jedan `event_at == anchor_ts`. Strogo `>` isključuje, `>=` uključuje. Trenutno je `>`; dokumentirati.
6. **Correction na dan drugog correctiona** — dva sidra istog dana, koje pobjeđuje. Backfill uzima `DISTINCT ON ... ORDER BY created_at DESC`, ali engine ne provjerava.
7. **Backfill idempotentnost** — ponovno pokretanje ne smije razbiti već postavljena sidra (trenutni WHERE `correction_anchor_date IS NULL` to štiti, ali nije testirano).
8. **`custom_payment_sources.balance` write pod concurrent recompute** — dvije transakcije istovremeno recompute istog sourcea; nedostaje advisory lock ili SELECT FOR UPDATE.

### Q5 — Redoslijed sanacije

**Slažem se, s jednom nadopunom.**

Vaš redoslijed (1) fix koda → (2) testovi zeleno → (3) reconcile → ispravan je. Dodatak:

**Između (2) i (3), obavezno:**
- **2a.** Backfill istorijskih C3 redova koji su bili na dan sidra (dokazivi blind-spot iznosi: 229,50 / −330,61 / 130,40 / −43,15 / 20,00). Odluka gdje ih staviti (event_at = anchor_ts + 1s + C2 + user_edited=true) je politika koju treba potvrditi prije pisanja SQL-a. Bez ovog koraka, fix (a) pomaže samo budućim unosima; postojeći gubitak ostaje.
- **2b.** Recompute svih anchored sourceova (osobito Milan Keš gdje je "bomba" +2.674,31 neaktivirana). Ovo neutralizira BUG 2 driftove prije nego bilo koji korisnički write to učini u neočekivanom trenutku.

Tek onda (3) reconcile s korekcijama za stvarno stanje — koje će, kao što ste primijetili, biti bitno manje jer se blind-spot iznosi vraćaju automatski.

**Guard za korak (3):** korekcija u UI-ju već piše correction-red s `created_at = now()`, što postaje novo sidro. Između "brojanja stvarnog stanja" i "unosa korekcije" ne smije proći transakcijski write — inače brojani iznos ne odgovara sidru. Preporuka: mobile app friendly window je "korisnik prebroji, odmah upiše", bez UI guardova. Za forenzičke reconciliations koje radimo mi — raditi u tihom prozoru (npr. noć) ili s privremenim admin flagom koji blokira write na tom source-u.

---

### Kritični rizik koji NIJE u dijagnozi

**Backfill migracija 0630202419 već je izvršena u produkciji.** To znači da je fix redoslijed:
- Prvo (b) — obavezni recompute — treba biti izvršen jednokratno na svim postojećim anchored sourceovima **prije** bilo kakvog daljnjeg rada. Inače, prvi user write okida iznenadni skok koji korisnik doživljava kao bug ("saldo se sam promijenio kad sam nešto malo dodao").
- Milan Keš (+2.674,31 drift) je aktivna bomba **sada, danas**. Ovaj recompute je najhitniji korak, hitniji od fix-a BUG 1.

### Preporučena sekvenca

1. **HITNO (danas):** jednokratni recompute svih anchored sourceova — samo `SELECT recompute_custom_source_balance(id) FROM custom_payment_sources WHERE correction_anchor_date IS NOT NULL`. Deaktivira sve neaktivirane bombe iz backfilla.
2. Fix (b): backfill i budući SET sidra atomarno pozivaju recompute u istoj migraciji/RPC-u.
3. Fix (a) prošireno: manual entry uvijek `system_precise` s `event_at = now()`, C2, `user_edited = false`.
4. Regresijski testovi za: same-day post-anchor manual entry (uključuje se), retroaktivni C3 na dan sidra (isključuje se preko `date::date`), C2 tie-break na anchor_ts, backfill idempotentnost, obavezni recompute po SET.
5. Politička odluka: dirati li istorijske blind-spot C3 redove (229,50 / −330,61 / …). Ako da — forenzički backfill.
6. Reconcile preostalih razlika unosom korekcije, jedan po jedan izvor.

Odgovori na sva pitanja i moji ne-slaganja jasno označeni. Molim potvrdu prije prelaska u build mode — posebno oko točke (1) hitnog recomputea i točke 3 (šire pravilo umjesto date==today).
