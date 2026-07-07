# Analiza: Worker Payouts v2 — dva zahtjeva

Trenutno stanje relevantno za analizu:
- `project_workers.hourly_rate` je jedan skalar po redu; nema povijesti. Jedan projekt = jedan `project_workers` red po osobi. Isti fizički radnik na dva projekta = dva reda, potencijalno različit `user_id` link (nullable).
- `project_work_entries` bilježi sate po danu; NE snima efektivnu satnicu za taj dan. Cijena rada se računa live kao `sum(actual_hours) * project_workers.hourly_rate`.
- `project_worker_payouts` ima `hourly_rate_snapshot` po isplati (jedan skalar za cijeli period) i `period_start/end`; zaključava obuhvaćene `project_work_entries` preko `payout_id` i `project_work_entry_locks`. Payout je vezan na **jedan** `project_id`.

---

## ZAHTJEV 1 — Sidro (effective_from) na promjeni satnice

### V1-A. Minimalno: `effective_from` na `project_workers` bez povijesti
- Dodaje se kolona `hourly_rate_effective_from date` (default = danas na promjeni). Sve zaključavanje neisplaćenih unosa dalje računa live.
- Trade-off: rješava UI/procesni zahtjev ("označi od kada"), ali NIJE povijest — sljedeća promjena briše prethodno sidro. Retroaktivnu izmjenu i dalje ne možeš rekonstruirati. "Preostalo radnicima" KPI koji već računa `sum(remaining_hours) * current_rate` postaje pogrešan za unose PRIJE `effective_from` (koristi novi rate za stare sate).
- Ne rješava `worker_rate_history` blocker.

### V1-B. Srednje: `project_worker_rate_history` tablica, forward-only sidro
- Nova tablica: `worker_id, rate, effective_from date, created_by, created_at`. `project_workers.hourly_rate` postaje derivat (view ili trigger sync s "najnovijim redom čiji effective_from <= today"). Efektivna satnica za dan D = red s najvećim `effective_from <= D`.
- Cijena rada za entry na datum D = `actual_hours * rate_at(worker_id, D)`. "Preostalo" KPI mora agregirati po datumu, ne skalarno.
- `create_worker_payout` snima `hourly_rate_snapshot` kao **weighted average** (ili array po sub-periodu). Alternativa: payout se automatski cijepa na više redova po rate segmentu unutar perioda.
- Zaključana povijest: promjena sidra u periodu koji sadrži zaključane unose je zabranjena (samo forward od `max(period_end) + 1` za tog radnika). Owner dobija poruku "postoji isplata do X.Y.2026, sidro može biti najranije Z".
- Retroaktivnu izmjenu (npr. "od 1.10., a danas je 15.10., unosi 1-14.10. nisu isplaćeni") DOZVOLJAVAMO samo ako u tom rasponu nema `payout_id != NULL`. Ako ima — blokada uz razlog.
- Rješava blocker u potpunosti. Konzistentno s postojećim lock semantikom.

### V1-C. Potpuno: rate history + retroaktivni "rate adjustment" payout
- Kao B, ali dozvoljava promjenu sidra i unutar zaključanog perioda — sustav automatski generira "rate_adjustment" payout (delta = novi_rate - stari_rate) × hours_covered, pozitivan ili negativan. Efektivno reverse+re-issue u pozadini.
- Snažno, ali komplicira void semantiku, P&L rekonstrukciju i push obavijesti ("primio si -47€ korekciju" na gradilištu = spor). Traži audit UI koji Free/Pro plan vjerojatno ne opravdava.
- Preporuka: ne u v1.

### Kritički osvrt V1
- **KPI "Preostalo radnicima"** trenutno je skalarni umnožak. Uz rate history mora prijeći na `SUM(hours * rate_at(date))` — inače laže na svakoj promjeni sidra. Ovo je skriveni trošak V1-B/C.
- **`hourly_rate_snapshot` semantika**: već postoji, ali kao skalar. Uz varijabilnu satnicu unutar perioda treba ili (a) prisiliti payout period da bude unutar jednog rate segmenta, ili (b) prihvatiti weighted avg i pohraniti breakdown u zasebnu tablicu `payout_rate_segments`. Opcija (a) je jednostavnija ali frustrira ownera ako period spans promjenu.
- **UI kalendar unosa**: mora prikazati koji rate se primjenjuje na koji dan (obojena legenda po segmentu), inače će owner pogrešno računati u glavi.
- **Migracija postojećih redova**: prvi rate history red = `{rate: project_workers.hourly_rate, effective_from: project_workers.created_at::date}` da postojeći nezaključani unosi zadrže istu cijenu.

---

## ZAHTJEV 2 — Isplata preko više projekata

Prvo mora se odgovoriti: **što je "isti fizički radnik"** kad `project_workers.user_id` može biti NULL na oba reda?

### V2-A. Minimalno: bez cross-project agregata, samo UX "batch"
- Dialog isplate dobija "+" za dodati redove iz drugih projekata istog ownera. Iza kulisa: N zasebnih `project_worker_payout` redova (po jedan po projektu), N `expenses`, ali s istim `paid_at`, `payment_source` i zajedničkim `batch_id text` (novi indeks). Push i CSV grupiraju po batch_id.
- Identifikacija radnika: owner mora ručno selektirati `project_workers` redove koje smatra istom osobom (checkbox lista "Marko Marić / Projekt A", "Marko Marić / Projekt B"). Nema DB spajanja identiteta.
- Trade-off: P&L po projektu ostaje čist (svaki payout vezan na svoj `project_id`), void radi per-red. Owner vidi jednu "isplatu 950€ Marku" u historyju.
- Rizik: owner slučajno spoji dva različita Marka. Nema garancije.

### V2-B. Srednje: entitet `people` (owner-scoped registar radnika)
- Nova tablica `people (id, owner_user_id, first_name, last_name, phone?, user_id?)`. `project_workers.person_id` (nullable za backward compat, migracija spaja po `(owner, first_name, last_name, phone/email/user_id)` s owner review korakom "provjeri je li ovo ista osoba").
- Isplata radi u dva moda: **per-project** (kao sada) ili **per-person cross-project**. Cross-mode: owner bira osobu → sustav lista sve nezaključane unose iz svih projekata te osobe → owner potvrđuje raspon → jedan `payout_group` red + N `project_worker_payout` redova (po jedan po projektu, s alokacijom sati/iznosa po projektu) + N `expenses` (jedan po projektu radi P&L integriteta).
- `linked_payment_source_id`, `paid_at`, `hourly_rate_snapshot` per red (svaki projekt može imati različit rate za istu osobu).
- Push radniku: jedna agregirana obavijest ("Isplaćeno 1.240€ za 3 projekta"), a ne 3.
- Trade-off: srednji migration effort, čist model, per-project P&L netaknut. Traži disambiguation UI ("spoji ove dvije Marije?") kojim vlasnik potvrđuje identitet.

### V2-C. Potpuno: `people` + zajednički rate history po osobi (ne po projektu)
- Kao B, plus `person_rate_history` (rate vezan za osobu, ne za projekt-worker par). Isti Marko = ista satnica na svim projektima. Owner override postoji ali je izuzetak.
- Elegantno za gradilišta gdje osoba "košta" fiksno, bez obzira gdje radi. Pucanje: firme koje NAMJERNO plaćaju istu osobu različito po projektu (npr. specijalizirana faza) gube fleksibilnost, moraju raditi override na svakom projektu.
- Velik obim promjene semantike Zahtjeva 1. Ne v1.

### Kritički osvrt V2
- **Identitet bez `user_id`**: velika većina radnika na gradilištu NEMA app account. Auto-merge po imenu+prezimenu je nesiguran (dva "Ivan Horvat"), po telefonu je pouzdanije ali telefon trenutno nije obavezno polje na `project_workers`. Bez pouzdanog ključa **owner MORA biti loop-in** — batch isplata bez identiteta = potencijalna kriva atribucija.
- **P&L alokacija**: MORA ostati per-project. Ako zbirna isplata generira jedan expense na "prvi projekt", drugi projekt ima podcijenjen trošak rada i "Preostalo" laže. Zato B/C imaju N expense redova (po projektu), samo UI/push/CSV agregira. Ne skraćivati na jedan expense.
- **Lock semantika**: cross-project payout mora zaključati unose PO PROJEKTIMA kojima pripadaju — postojeći `project_work_entry_locks(project_id, entry_id, payout_id)` to podržava, ali `payout_id` mora referirati na svih N pojedinačnih payout redova, ne na batch. Batch je gornji sloj.
- **Void**: brisanje batch isplate = kaskadni void N pojedinačnih payouta u jednoj transakciji. Ako user_id na payment_source nije isti kroz sve projekte (dva projekta = dva biznisa = dvije blagajne), batch NIJE moguć — mora blokirati s porukom "izvori isplate se ne poklapaju".
- **"Preostalo radnicima" KPI po projektu** ostaje isti (per-project). Ali za people-view treba novi KPI "Preostalo osobi X (sve projekti)".

---

## Odnos Zahtjeva 1 prema `worker_rate_history` blockeru

- V1-A ne rješava blocker (nema history).
- V1-B ga rješava u potpunosti: warning "rate se mijenja unutar isplaćenog perioda" postaje precizan (znamo `effective_from` svakog rate reda i imamo lock info). Sistem može autoritativno reći "sidro X.Y.2026 se sudara s isplatom #123 (do Z), blokirano".
- V1-C ga rješava agresivnije uz automatsku korekciju, ali uvodi novu klasu edge caseova (negativne isplate).

Preporuka: V1-B je čisti "unblock".

---

## Procjena opsega

| Varijanta | Migracija | Backend (RPC/trigger) | Frontend | Test | Ukupno |
|---|---|---|---|---|---|
| V1-A `effective_from` skalar | mala | mala (edit trigger) | mala (date picker) | mali | **mali** |
| V1-B rate history | srednja (nova tablica, backfill, KPI rewrite) | srednja (`rate_at()` fn, izmjena create/update payout RPC-a, KPI query) | srednja (rate segment legend, edit dialog "od kada") | srednji (P4/P5 novi scenariji: rate segment split, retroaktivna promjena) | **srednji-veliki** |
| V1-C + rate_adjustment payout | srednja | velika (novi payout kind, audit) | velika (negativne stavke, obavijesti) | velik | **veliki** |
| V2-A batch UX | mala (batch_id) | mala (transakcija N insert-a) | srednja (multi-select cross-project dialog) | srednji | **srednji** |
| V2-B `people` entitet | srednja-velika (nova tablica, merge UI, backfill) | srednja (per-person listing RPC, cross-project payout RPC, dedup constraints) | velika (people page, disambiguation, cross-project dialog) | srednji (P8 novi scenariji: cross-project, ownership, void kaskada) | **veliki** |
| V2-C shared rate | velika | velika | velika | veliki | **vrlo veliki** |

---

## Preporuka za v1 (izbacio bih)

**U v1 uzeti:** V1-B + V2-A.
- V1-B rješava blocker i sidro pravilno; skuplji je, ali "pola-rješenja" (V1-A) generira laž u KPI-u i morat ćemo ga rušiti.
- V2-A daje 80% praktične koristi (jedna radnja isplate) bez ulaska u identity graf. Owner ručno bira redove, sustav pošteno kaže "vi tvrdite da su ovo iste osobe".

**Izvan v1 (v2):**
- V2-B (`people` entitet) — vrijedi kad korisnici zatraže "prikaz po osobi kroz sve projekte" ili kad dodamo obavezan telefon/OIB na radnika kao stabilan ključ.
- V1-C — samo ako se pojavi realan use-case retroaktivne korekcije isplaćenog.

**Otvorena pitanja za vlasnika prije build faze:**
1. Za V1-B: dozvoljavamo li retroaktivni `effective_from` (unutar nezaključanog raspona), ili samo `>= today`? Utječe na UX i broj edge caseova.
2. Za V1-B: kada payout period spans dvije rate segmentacije — dozvoljavamo weighted avg snapshot, ili prisiljavamo split payout? Prvo je jednostavnije, drugo je čišće za audit.
3. Za V2-A: batch isplata zahtijeva isti `payment_source` kroz sve projekte — ok, ili treba dozvoliti različit po projektu unutar iste "vizualne" isplate?
4. Za V2-A: push radniku — jedna agregirana ili N pojedinačnih? (Ako N, obavijesti postaju šum.)
