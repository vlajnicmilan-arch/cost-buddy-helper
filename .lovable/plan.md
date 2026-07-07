# Radnik pripisuje isplatu svom izvoru — kritički osvrt + varijante

Zadatak je dizajn-review, bez koda. Ovo je re-issue ranijeg plana s eksplicitno proširenom sekcijom 4 (rubni slučajevi).

## Nalaz iz koda (verificirano)

- `expenses.worker_payout_id` kolona VEĆ postoji — infrastruktura za vezanje radnikovog reda na payout je spremna.
- `expenses.bank_transaction_id` + `bank_match_status` postoje — bank matcher infrastruktura već postoji (dedup mehanizam).
- `bank_accounts.linked_payment_source_id` — pouzdano detektira koji su `custom_payment_sources` bank-linkani.
- `src/lib/balance/writerIntent.ts` intent `manual_entry`: forsira `event_at = now()`, `time_confidence = C2`, `user_edited_event_at = false`. Točan intent za pripis.
- `notify-worker-payout/index.ts` već piše `notifications.data.payout_ids[]`, `batch_id`, `paid_amount_total`. Deep link ima sve podatke.
- Push (`send-push`): nisam verificirao podržava li native action buttons; za v1 to nije potrebno (deep link je dovoljan).

## Odgovori na 5 točaka

### 1. Dvostruko knjiženje

Opcije iz zahtjeva:
- **(a)** oznaka + bank matcher spaja/preskače
- **(b)** upozorenje kod odabira bank-linkanog izvora
- **(c)** dopusti samo custom/manual izvore u v1

**Preporuka:** kombinacija **(b) + (a) fazno**.
- v1.0 = **(b)**: pripis dopušten svima, ali kod bank-linkanog izvora inline warning *"Ovaj izvor je spojen s bankom. Kad uplata stigne sinkronizacijom, može doći do duplikata — obriši jedan od unosa."* Minimalan risk za isporuku, korisnik ima kontrolu.
- v1.1 = **(a)**: novi red dobija `bank_match_status = 'awaiting_bank'` + `worker_payout_id`. Bank matcher, kad procesira novu bank tx za taj izvor + isti iznos u prozoru ±7 dana, prvo traži `awaiting_bank` kandidata s payout_id i spaja umjesto stvaranja duplikata. Fallback na postojeći ±1 dan match.

**Opcija (c) odbačena.** Frustrirajuće: većina radnika prima na open-bankirani tekući račun i želi vidjeti balance odmah, ne za 3 dana.

**Rizik za (a) v1.1:** bank matcher trenutno vjerojatno mapira samo `type=expense` — trebat će proširenje na `type=income`. Provjeriti u build turnu.

### 2. Storno

Opcije iz zahtjeva:
- **auto storno radnikovog zapisa** — invazivno
- **obavijest radniku + ručni ispravak**
- **kaskadni soft-delete kroz vezu**

**Preporuka: obavijest radniku, BEZ auto-diranja.**

Obrazloženje:
- Radnikov red je u njegovom RLS prostoru. Auto-void zahtijeva SECURITY DEFINER RPC koji radi DELETE/UPDATE nad tuđim `expenses` — novi vektor napada.
- Kaskadni soft-delete kroz FK `worker_payout_id ON DELETE SET NULL` je siguran, ali payout se ne briše — void samo mijenja status. Kaskada preko trigera moguća, ali opet zadire u tuđe podatke.
- Novac je stvarno primljen; owner "storno u sustavu" ≠ povrat novca. Radnik zna svoju stvarnost.

**Ponašanje:** postojeći `worker_payout_voided` push proširuje se: ako radnik ima pripisan red za taj payout, notifikacija sadrži *"Ako ste ovu isplatu pripisali izvoru, provjerite treba li stornirati unos"* + deep link direktno na taj `expenses` red. Radnik odlučuje.

**FK definicija:** `worker_payout_id → project_worker_payouts.id ON DELETE SET NULL` (payouti se u praksi ne DELETE-aju — void mijenja status — ali ako se ikad dogodi hard delete, radnikov income ostaje netaknut).

### 3. Writer intent i event_at

**Intent: `manual_entry`.**

Pitanje `event_at = paid_at (payout timestamp)` vs `event_at = now() (trenutak pripisa)`:

**Preporuka: `event_at = now()` (izlazi iz `manual_entry` intenta).**

Obrazloženje:
- `paid_at` je ownerov timestamp — kad je *on* evidentirao isplatu, ne kad je novac stigao radniku. Nema veze s radnikovim balance ledgerom.
- `event_at = now()` je korisnikova deklaracija "sad primam ovo u svoj balance", što je točno semantički. Anchor cut (post-anchor hybrid mode) radi ispravno.
- Datum reda (`date`) — postavi na `paid_at::date` (radnik razumije "isplata od 5.7."), ali `event_at` = `now()` za balance sudjelovanje.
- `time_confidence = C2` — točan (manualno unesen s poznatim trenutkom).

Poseban intent `worker_payout_attribution` — nepotreban. Ništa se u precision fieldima ne razlikuje od `manual_entry`.

**Balance suite gate:** nema promjene semantike triggera → SQL suite ne treba novi scenario. Dodati vitest za attribution flow (payload sadrži `worker_payout_id` + `manual_entry` intent).

### 4. Rubni slučajevi (prošireno)

**a) Radnik nema nijedan izvor plaćanja**
- Sheet prikazuje empty state: *"Nemate niti jedan izvor. Dodajte izvor u Novčaniku da biste pripisali isplatu."*
- CTA gumb → deep link na `/wallet` (dodavanje izvora), s query paramom koji čuva `payout_id` da se sheet automatski ponovno otvori nakon dodavanja izvora.
- Nema onboarding nudge kroz posebnu stranicu — radnik ionako mora imati izvore da bi Core modul bio od koristi.

**b) Radnik pripiše pa obriše izvor**
- `expenses.payment_source` je string (npr. `custom:UUID`); ne postoji hard FK constraint na `custom_payment_sources`. Postojeći wallet flow već rješava orphan reference (izvor obrisan → red ostaje s `custom:UUID` koji ne postoji, prikazuje se kao "Nepoznat izvor" ili se filtrira). Verificirati u build turnu.
- Dodatna zaštita nije potrebna: `worker_payout_id` ostaje valjan; UI ne treba mijenjati.

**c) Batch isplata (jedna osoba, više projekata, isti izvor od strane ownera)**
- **Preporuka: jedan zbirni pripis** = jedan `expenses` red, `amount = paid_amount_total`, `worker_payout_id = NULL` (jer je batch, ne single), NOVA kolona `worker_payout_batch_id` (UUID) → veže na sve payoute u batchu.
- Bilješka: *"Zbirna isplata: {{project_names}}"*
- Unique index `(user_id, worker_payout_batch_id) WHERE worker_payout_batch_id IS NOT NULL` sprječava dvostruki pripis batcha.
- Prednosti: matcher friendly (jedan iznos = jedna bank tx), ne razdvaja "jednu uplatu na račun" u N redova.
- Nedostatak: radnik ne vidi po-projekt breakdown u wallet listi (samo u bilješci). Za v1 prihvatljivo.

**d) RLS — dva različita user_ida u igri**

Kritično razlikovati:
- **Ownerova domena:** `project_worker_payouts` red (kreirao ga owner projekta). RLS: čita samo owner projekta (već postoji).
- **Radnikova domena:** `expenses` red s `worker_payout_id = X` (kreirao ga worker.user_id). RLS: čita samo worker (već postoji preko standard expenses RLS).

**Curenje?** `expenses.worker_payout_id` je samo UUID; per se ne otkriva ništa. Ali UI radniku želi prikazati *"iz projekta X, period Y-Z"* → potrebna nova SECURITY DEFINER f-ja:
```
get_my_incoming_payout(payout_id UUID)
  RETURNS TABLE (project_name TEXT, period_start DATE, period_end DATE, gross_amount NUMERIC, paid_amount NUMERIC)
  SECURITY DEFINER
  -- provjeri: payout.worker.user_id = auth.uid()
  -- vrati SAMO whitelistan set (bez payment_source, note, paid_at ownera)
  -- REVOKE EXECUTE FROM anon
```

FK `worker_payout_id → project_worker_payouts.id ON DELETE SET NULL` — worker ima referencu ali NE može SELECT-ati preko obične RLS (payout policy blokira). Samo definer f-ja whitelistano izlaže polja.

**e) Race: worker klikne dva puta iz dvije notifikacije istog payouta**
- Unique index `(user_id, worker_payout_id) WHERE worker_payout_id IS NOT NULL` na `expenses` → drugi insert vraća 23505, UI prikazuje *"Već pripisano ovoj isplati"*.
- Ekvivalentni index za `worker_payout_batch_id`.

**f) Payout status `advance` (0 sati, samo predujam) ili `partial`**
- Isti UX; radnik gleda samo `paid_amount`. Bez posebnog handlanja.

**g) Valuta radnikovog izvora ≠ EUR**
- v1: filtriraj listu izvora na iste-valute; ostali prikazani ali disabled s hintom *"{{currency}} izvor — konverzija nije podržana u v1"*.
- Konverzija = veliki risk (koji tečaj, koji datum), izvan v1.

**h) Family shared source kao ciljni izvor**
- Dozvoljen — RLS na `custom_payment_sources` već razrađen za shared preko `payment_source_members`. Radnik piše preko standardne addExpense putanje, RLS provjeri članstvo.

### 5. Doseg obavijesti + propušten push

**Deep link u dialog (bez native action buttons u v1).**

Razlozi:
- Native action buttons zahtijevaju FCM data-only + service worker handleri + PWA fallback + prazan slučaj bez push tokena. Platformski osjetljivo, izvan v1.
- Deep link je već isporučiv: `notifications.data.payout_ids` postoji.

**Router handler:** `notification.type IN ('worker_payout_created')` + `type = 'worker_payout_voided'` → otvara `AttributionSheet` s `payout_id` ili `batch_id`.

**Propušten push (radnik ignorira):**
- Notifikacija ostaje u `Notifications` listi. Klik iz liste otvara isti sheet.
- Sheet check: postoji li već `expenses` red s tim `worker_payout_id` u worker prostoru? Ako da → prikaži "Već pripisano" + link na taj red. Ako ne → otvori pripis flow.
- **Bez nove stranice "Moje isplate"** u v1. Sve isplate stižu kroz notifikaciju; postojeća notifications lista je dovoljna.
- Badge "Nije pripisano" u notifications listi (derivano iz odsutnosti reda) — nice-to-have, moguće u v1 ako je jeftino.

## Tri varijante dizajna

Sve tri zajedničke: deep-link sheet, `manual_entry` intent, `worker_payout_id`/`worker_payout_batch_id` referenca, unique indexi, `get_my_incoming_payout` definer, storno = samo notifikacija.

### Varijanta A — Samo manual izvori u v1
Bank-linkani izvori disabled u listi. Nula rizika duplikata. Odbačeno: frustrirajuće za većinu radnika.

### Varijanta B — Sve izvore + warning (PREPORUKA v1.0)
Warning na bank-linkanim izvorima, korisnik ručno rješava duplikat ako se pojavi. Minimalna promjena, brzo isporučivo.
- Za: nula promjene bank matchera, brz TTM.
- Protiv: duplikat SE POJAVLJUJE, ovisi o korisniku.

### Varijanta C — Sve izvore + prošireni matcher (v1.1)
`bank_match_status='awaiting_bank'` + matcher gran za spajanje po `worker_payout_id` (±7 dana). Dedup automatski.
- Za: pokriva realan slučaj bez ručne intervencije.
- Protiv: mijenja matcher, treba SQL suite scenario, +1 tjedan rada.

**Preporuka:** B sada, C kad telemetrija pokaže % pripisa na bank-linkane izvore.

## Otvorena pitanja za vlasnika (BEZ ovih ne krećem u build)

1. **Varijanta:** B (brzo) ili C (kompletno) — ili B → C fazno?
2. **Batch:** jedan zbirni red ili N po projektu? (Preporučeno: zbirni.)
3. **Cross-currency:** filtrirati na iste-valute ili blokirati u v1? (Preporučeno: filtrirati/disabled hint.)
4. **Family shared source:** dopušteno kao ciljni izvor? (Preporučeno: da.)
5. **Telemetrija:** funnel event `worker_payout_attributed` u v1? (Preporučeno: da, jeftino.)

Format odgovora u jednom retku: `B/C/BC, zbirni/po-projektu, filtriraj/blokiraj, shared-da/ne, telem-da/ne`.

Nakon odgovora, build turn isporučuje:
- migracija: `worker_payout_batch_id` kolona + 2 unique indexa + `get_my_incoming_payout` definer + FK ON DELETE SET NULL,
- (ako C) proširenje bank matchera + SQL suite scenario,
- `AttributionSheet.tsx` (naslov, lista izvora s warning/disabled/empty stanja, gumb Pripiši/Preskoči, race handling),
- notification router: `worker_payout_created/voided` → sheet,
- proširenje `notify-worker-payout` za storno tekst kad postoji pripis,
- vitest: attribution payload (intent + worker_payout_id), race guard, cross-currency filter,
- i18n hr/en/de,
- (opcionalno) telemetrija.
