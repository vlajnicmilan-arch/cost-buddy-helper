# Radnik pripisuje isplatu svom izvoru — kritički osvrt + varijante

Zadatak nema koda u ovom turnu. Ovo je dizajn-review; nakon odobrenja vlasnika slijedi build turn.

## Nalaz iz koda (verificirano, ne pretpostavka)

- `expenses` već ima `worker_payout_id` (kolona postoji). Znači postoji infrastruktura da bilo koji `expenses` red bude vezan na payout. Trenutno je vjerojatno korišten samo na owner strani; za radnikov red je isti stupac dostupan.
- `expenses` također ima `bank_transaction_id` + `bank_match_status` → bank matcher već postoji kao mehanizam koji povezuje ručne unose s bank transakcijama. To je ključno za dedup.
- `bank_accounts.linked_payment_source_id` → točno kaže koji su `custom_payment_sources` bank-linkani. Detektabilno bez novih polja.
- Writer intent sustav (`src/lib/balance/writerIntent.ts`) ima intent `manual_entry`: forsira `event_at = now()`, `time_confidence = C2`, `user_edited_event_at = false`. Točno ono što treba za pripis.
- Notifikacija (`notify-worker-payout/index.ts`) već piše `data.payout_ids[]`, `data.batch_id`, `data.paid_amount_total` u `notifications.data`. Deep link ima sve što treba.
- Push (`send-push`) — ne znam podržava li Android/iOS notification action buttons u trenutnoj implementaciji; nisam otvarao. Za varijantu s inline akcijom to bi trebalo provjeriti u build turnu.

## Odgovori na 6 točaka

### 1. Dvostruko knjiženje (bank sync duplikat)

Postoji zreo mehanizam: bank matcher spaja bank tx s postojećim `expenses` redovima po (payment_source, type, amount, ±1 dan), popunjava `bank_transaction_id` + `bank_match_status`. Ako pripis stvori manual income red, kasniji bank sync ga treba prepoznati kao match, ne kao duplikat.

**Rizici:**
- Bank matcher trenutno mapira `type=expense`; treba potvrditi da radi i za `type=income` (nisam čitao matcher kod — build turn).
- Vremenski prozor ±1 dan možda nije dovoljan: worker klikne pripis na push (dan T), banka bookira uplatu T+1..T+3.
- Više isplata istog iznosa u istom tjednu → matcher promašaj.

**Preporuka v1 (najjednostavnije sigurno):**
- **Nema hard restrikcije po tipu izvora.** Dozvoli pripis i na bank-linkane izvore, ali:
  - Pri odabiru bank-linkanog izvora prikaži inline upozorenje: *"Ovaj izvor je spojen s bankom. Kad uplata stigne kroz sinkronizaciju, automatski će se spojiti s ovim unosom."*
  - Novi red ima marker `bank_match_status = 'awaiting_bank'` (novi enum) ili `pending_bank_match=true`, uz `worker_payout_id`. Prošireni matcher kod stiže s bank tx traži prvo redove s ovim markerom u proširenom prozoru (npr. ±7 dana) prije nego što razmatra postojeće expenses.
  - Ako matcher pronađe kandidata s `worker_payout_id`, spaja umjesto stvaranja novog.

**Alt v1 minimum (ako ne želimo dirati matcher):** samo pokaži upozorenje na bank-linkanim izvorima; korisnik odgovoran za brisanje duplikata. Slabije, ali ne mijenja balance/matcher.

### 2. Storno

**Slažem se s prijedlogom vlasnika: BEZ automatskog diranja radnikovih zapisa u v1.**

Argumenti:
- Radnikov red je u njegovom RLS prostoru; owner ga tehnički ne smije mijenjati (data boundary).
- Auto-void bi zahtijevao SECURITY DEFINER RPC koji bi radio DELETE/UPDATE nad tuđim `expenses` redovima. Novi vektor napada.
- Novac je stvarno primljen; ako owner naknadno stornira "iz sustava", ne znači da je uplata vraćena. Radnik zna svoju stvarnost.

**Ponašanje v1:**
- Postojeća "voided" push obavijest se proširuje: ako je payout imao pripis u worker izvoru (`expenses` red s `worker_payout_id = X` u worker prostoru), notifikacija sadrži tekst *"Ako ste ovu isplatu pripisali izvoru, provjerite je li potrebno stornirati unos."* + deep link na taj radnikov unos.
- Tap na notifikaciju → otvara radnikov unos u wallet detail viewu; radnik sam bira: obriši / ostavi / dodaj bilješku.
- **Ne odustajemo** od future automatizacije — samo je izvan v1.

### 3. Writer intent

**`manual_entry`.** Razlozi:
- Pripis se događa u trenutku klika (dan T, sat H); to nije stvarni trenutak transfera novca (koji je banka zabilježila neovisno). Za balance semantiku, ovo je manual korisnički unos → `event_at = now()`, `C2`, sudjeluje u post-anchor cutu.
- `system_precise` je pogrešan — sustav nije observirao stvarni transfer novca, samo korisnikovu deklaraciju.
- Poseban novi intent (`worker_payout_attribution`) — nepotreban. Semantika je identična `manual_entry`; jedina razlika je porijeklo (`worker_payout_id`) koje je već izvan intent scopea.

**Balance testing policy gate:** pripis kroz `manual_entry` intent → NE treba novu SQL suite migraciju (intent postoji, ponašanje tester scenarija se ne mijenja). Dodati vitest scenario koji ubacuje pripis red i provjerava agregate.

### 4. Granica podataka

**Struktura reda u radnikovom prostoru:**
```
expenses:
  user_id            = worker.user_id       (radnikov)
  type               = 'income'
  category           = 'salary' (defaultno; korisnik može promijeniti)
  amount             = payout.paid_amount
  payment_source     = radnikov custom:UUID
  worker_payout_id   = payout.id            (FK referenca)
  event_at, time_conf = kroz manual_entry intent
  business_profile_id = NULL (osobni prostor)
  project_id         = NULL (nije njegov projekt)
```

**Curi li nešto?**
- `worker_payout_id` je samo UUID. RLS na `project_worker_payouts` mora ostati stroga: worker NE smije čitati `project_worker_payouts` red direktno (to je ownerov zapis). Ako želimo da mu UI pokaže "iz projekta X", posebna SECURITY DEFINER f-ja `get_my_incoming_payout(payout_id) → {project_name, period_start, period_end, gross}` koja provjerava da je caller = payout.worker.user_id i vraća isključivo whitelistan set polja (bez `payment_source`, `note`, `paid_at` timestampa u UTC ownerovoj mikrosekundi, itd.). REVOKE anon.
- FK na `project_worker_payouts` s CASCADE? **NE.** Ako owner obriše payout, radnikov income red ne smije nestati (točka 2). Postavi ON DELETE SET NULL.

**Referenca DA ili NE?** DA — bez reference ne možemo:
- upozoriti kod stornoa (točka 2),
- spriječiti dvostruki pripis istog payouta (worker klikne dva puta iz dvije notifikacije).

Uz unique index `(user_id, worker_payout_id) WHERE worker_payout_id IS NOT NULL` — jamči 1:1 pripis po payoutu po workeru.

### 5. UX tok

**v1 preporuka: deep link u dialog (bez inline notification actions).**

Razlozi:
- Manje platformski osjetljivo (Android/iOS/PWA). Native action buttons zahtijevaju rukovanje s FCM data-only + service worker + notification click handler + PWA fallback + prazan slučaj kad nije bilo push tokena. Rizik izvan v1.
- Deep link već imamo (`notifications.data.payout_ids`); dodajemo router handler koji otvara `AttributionSheet`.

**Sheet UX:**
- Naslov: *"Pripisati {{amount}} nekom izvoru?"*
- Podaci: projekt(i), period, iznos.
- Lista `custom_payment_sources` (radnikov filter). Bank-linkani → warning ikona + tooltip (točka 1).
- Akcije: **[Preskoči]** / **[Pripiši]**.
- Nakon uspješnog pripisa: StatusFeedback success + link "Otvori u novčaniku".

**Ignoriranje:** notifikacija ostaje u listi `Notifications` kao `worker_payout_created` s badgeom "Nije pripisano" (izvedeno iz odsutnosti `expenses` reda s `worker_payout_id = X` u user prostoru). Klik iz liste → isti sheet. Nova stranica "Moje isplate" NIJE potrebna u v1 — sve isplate ionako prolaze kroz notifikaciju.

### 6. Izbaciti iz v1 / nedostaje u zahtjevu

**Izbaciti iz v1:**
- Inline notification action buttons (točka 5).
- Auto-void radnikovih redova na storno (točka 2).
- Zasebna stranica "Moje isplate" (točka 5).
- Multi-source split (npr. 60% na račun, 40% na gotovinu) — jedan pripis = jedan izvor.

**Nedostaje u zahtjevu, treba potvrditi prije builda:**
1. **Valuta:** payout je uvijek EUR (project); custom_payment_sources imaju `currency`. Što ako radnikov izvor nije EUR? Prijedlog v1: prikaži samo izvore u istoj valuti kao payout; ostali disabled s hintom.
2. **Batch (više projekata istoj osobi):** jedna notifikacija, jedan sheet, jedan pripis (ukupan iznos) ILI N pripisa (po projektu)? Prijedlog v1: **jedan pripis ukupnog iznosa** s bilješkom "Zbirna isplata: {{project_names}}". Jednostavnije, matcher friendly.
3. **Advance/partial status:** što ako payout ima `status='advance'` (0 sati, samo predujam)? UX identičan; radnik gleda samo `paid_amount`.
4. **Family/shared source:** pripis na family shared izvor — dozvoljeno? Prijedlog v1: da, ista logika (RLS već provjerava tko smije pisati u shared izvor).
5. **Dashboard telemetrija:** trebamo li tracking event `worker_payout_attributed`? (Nije blokirajuće za v1, ali korisno za retention analitiku.)

---

## Tri varijante dizajna (usporedba)

Sve tri zajedničke: deep-link sheet, `manual_entry` writer intent, `worker_payout_id` na radnikovom `expenses` redu, unique index (user_id, worker_payout_id).

### Varijanta A — Minimalna, samo manual izvori u v1

Pripis dopušten SAMO na izvore koji NISU bank-linkani. Bank-linkani izvori se prikazuju u listi ali su disabled s hintom *"Bankovni izvor — uplata će stići automatski"*.

- **Za:** nula rizika duplikata, nula promjena u bank matcheru.
- **Protiv:** ne pokriva realan slučaj (radnik primljen na tekući račun koji je open-bankan i želi taj balance vidjeti odmah, ne čekati 3 dana). Frustrirajuće.

### Varijanta B — Sve izvore, warning na bank-linkanim (NULA promjene matchera)

Pripis dopušten svima. Bank-linkani → warning tooltip u sheetu i toast nakon spremanja. Duplikat rješava korisnik ručno ako se pojavi.

- **Za:** minimalna promjena, brzo isporučivo, korisnik dobija fleksibilnost.
- **Protiv:** duplikat se DEFINITIVNO pojaviti (banka će nakon 1-3 dana vratiti istu uplatu kroz sync). Push notifikacija radniku *"Nova bank transakcija ne odgovara ničemu"* → loš UX.

### Varijanta C — Sve izvore + prošireni matcher (PREPORUKA)

Pripis dopušten svima. Novi `expenses` red dobija `bank_match_status='awaiting_bank'` kad se pripisuje na bank-linkani izvor. Bank matcher, kad stiže bank tx za isti izvor + iznos, prvo traži `awaiting_bank` red s `worker_payout_id` u proširenom prozoru (±7 dana) i, ako nađe, spaja umjesto stvaranja duplikata. Fallback na postojeći ±1 dan match ako nema kandidata.

- **Za:** pokriva realan slučaj, dedup se dogodi bez ručne intervencije, `worker_payout_id` je jak dedup ključ (jači od amount+date).
- **Protiv:** dira bank matcher — mora se pisati SQL matcher gran + testirati u SQL suite. Više radnog opterećenja.
- **Rizik:** ako matcher ne radi po očekivanju, dobijemo trajno "awaiting_bank" redove. Mitigation: nakon 30 dana bez matcha, alat auto-flip u `unmatched` sa notifikacijom.

**Preporuka:** **Varijanta C**, ali isporuka u dvije faze:
- **v1.0** — Varijanta B (brzo u produkciju, prikupi telemetriju koliko korisnika pripisuje na bank-linkane izvore).
- **v1.1** — Nadogradnja na C ako telemetrija pokaže značajan udio bank-linkanih pripisa.

Ako vlasnik želi jedan turn, idemo direktno na C.

---

## Otvoreni odgovori tražim prije build turna

1. **Varijanta A/B/C** — koja?
2. **Batch pripis** — jedan zbirni red ILI po projektu?
3. **Cross-currency** — dopustiti pripis EUR isplate na HRK/CHF izvor (s konverzijom kroz `useExchangeRates`) ili blokirati u v1?
4. **Family shared source** — dozvoljen ciljni izvor?
5. **Telemetrija** — funnel event `worker_payout_attributed` uključiti u v1 ili odgoditi?

Nakon tvog odgovora slijedi build turn s: (a) migracija (SECURITY DEFINER `get_my_incoming_payout`, unique index, opcionalno matcher grana za C, RLS), (b) `AttributionSheet.tsx`, (c) notification router handler, (d) proširenje `notify-worker-payout` obavijesti za storno tekst, (e) vitest za attribution flow + writer intent + dedup guard, (f) i18n hr/en/de, (g) balance SQL suite scenario ako mijenjamo matcher.
