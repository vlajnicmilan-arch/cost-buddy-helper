# Krug Naming & Migration Strategy v1.1

Strateški dokument. Zatvara naming + konceptualnu migraciju iz `family_*` jezika i modela u `Krug`. Bez SQL-a, bez koda, bez rollout plana po okolišima.

Polazi striktno od: `Krug Foundation v4.2`, `Preset Constraint Matrix v1`, `Governance Matrix v1.3`, `Continuity & Billing State Machine v1.3.2`, `Takeover Conditions Spec v1.1`, `Krug Domain/Data Model v1.1`, `Post-Delete Behavior Foundation Patch v1.1`, `Shared Resources Link — Structural Choice v1.1`, `Krug Access Matrix v1.3`, `Reuse / Refactor / Rebuild Plan v1`, `Krug Implementation Order v1.1`.

Bez `Family` kao aktivnog modela. Bez `majority`. Bez novih preseta.

---

## 1. Naming načela

1. **`Krug` je umbrella pojam**, ne sinonim za `Family`. Krug pokriva svaki preset (`spouse_partner`, `coparent`, `roommate`) i sve buduće preseta koji prođu Preset Constraint Matrix. `Family` je bio jedan jedini obrazac; `Krug` je generalizacija.
2. **`Family` je legacy termin koji se gasi**, ne preimenovani Krug. Ne postoji "Family preset". Sve što je nekad bilo "family" je sada ili (a) konkretan Krug preset, ili (b) pomoćni resource link sloj koji više nema veze s riječju "family".
3. **Tri jasno razdvojena sloja imena:**
   - **Product copy** (UI tekst koji vidi korisnik) — mora govoriti jezikom Kruga *odmah* kad je feature isporučen.
   - **Domain naming** (entiteti, role, statusi, lifecycle stanja, governance artefakti, edge function imena, hook imena) — prelazi na `krug*` u koraku s implementacijom; sve novo se piše kao `krug*`.
   - **Persistence sloj** (DB tablice, kolone, enumi, RPC) — može privremeno zadržati `family_*` imena uz pomoćni adapter/view; rename ide tek kad je core Krug semantika čvrsto sjela.
4. **Nikad ne miješati stari i novi jezik unutar istog koncepta.** Ako se neki koncept već zove `Krug`, ne smije imati paralelno polje/komentar/copy gdje ga se zove "family". Mješavina jezika je glavni izvor semantičkih bugova jer sugerira da je staro značenje još važeće.
5. **Imena prate model, ne obratno.** Foundation v4.2 + Domain Model v1.1 + Access Matrix v1.3 su izvor istine. Ako bi neki "lijepi" rename razvodnio značenje (npr. zatajio razliku između člana i ownera), preferirati semantičku jasnoću nad estetskom uniformnošću.
6. **Legacy nije bug, ali je dug.** Sve što ostane pod `family_*` mora imati eksplicitnu oznaku "legacy/compat" i kratak rok dok stoji — inače legacy postaje stalna stvarnost.

---

## 2. Konceptualna mapa preimenovanja

Sažeto: što je 1:1 rename, što se **cijepa** u više pojmova, što se **ukida**.

### 2.1 Grupa

| Staro | Novo | Tip |
|-------|------|-----|
| `family group`, `family` | `Krug` | rename + generalizacija (Krug ima preset, Family nije imao) |
| `family type` (ako se igdje izvodilo iz konteksta) | `Krug preset` | rename + formalizacija (preset je sad zaključan i immutable) |

### 2.2 Članstvo i ownership

Ovo je najvažnija točka — ovdje 1:1 rename **ne radi**.

| Staro | Novo | Tip |
|-------|------|-----|
| `family member` (jedinstven pojam koji je miješao člana i vlasnika) | **cijepa se u dvoje:** `KrugMember` (samo `status: punopravni / obični`) **+** `KrugOwnership` (zaseban sloj, točno jedan aktivni owner po Krugu) | **split** |
| `role: owner` na članstvu | uklanja se — owner se izvodi iz `KrugOwnership`, ne iz role na članu | ukidanje koncepta |
| `limited` / `full` (postojeći payment_source_members rolovi koji su slučajno korespondirali članstvu) | **mapira se u status:** `limited` ↔ `obični`, `full` ↔ `punopravni` — ali samo na razini Kruga, **ne** dirati postojeća `payment_source_members` značenja (to je drugi sloj, vidi 2.4) | mapping s razdvajanjem konteksta |

### 2.3 Billing

| Staro | Novo | Tip |
|-------|------|-----|
| implicitno: "owner Family grupe plaća" | eksplicitno: **owner (iz `KrugOwnership`) je billing nositelj isključivo u steady-state `active`** | formalizacija |
| (nije postojalo) | tranzicijski billing izvršitelji u `confirmed transfer`, `fallback takeover`, `read_only` reaktivaciji — owner **ili** spec-dodijeljeni punopravni član | novi koncept (continuity sloj) |

### 2.4 Shared resursi

| Staro | Novo | Tip |
|-------|------|-----|
| `family_shared_sources` | per-resource standardiziran link sloj prema Structural Choice v1.1 (npr. `krug_shared_payment_sources` ili sl.) — **ne** generic tablica | per-resource refactor |
| `family_shared_*` (budgets/projekti/ciljevi/dokumenti ako postoje) | isti per-resource pristup | per-resource refactor |
| `payment_source_members` (`limited`/`full`) | **ostaje kako jest** — to je access sloj nad resursom, ne članstvo u Krugu; ne preimenovati, ne spajati s `KrugMember` | namjerno **bez** rename-a |

Ključno: postojanje `payment_source_members` redova nastavlja biti vezano za resource, ne za Krug. Krug ↔ resource veza ide kroz link sloj iz Structural Choice v1.1; `payment_source_members` zadržava svoju ulogu pristupa pojedinom izvoru.

### 2.5 Governance / consent

| Staro | Novo | Tip |
|-------|------|-----|
| (nije formalno postojalo u `family_*`) | `KrugProposal`, `KrugConsent` (propose / confirm / reject) prema Governance Matrix v1.3 | novi sloj |
| ad-hoc "owner odluči" putevi | ostaju kao **owner-unilateral** akcije gdje preset dopušta; ostalo ide kroz proposal/consent | formalizacija |
| ~~majority~~ | ne postoji | ukidanje |

### 2.6 Continuity / lifecycle

| Staro | Novo | Tip |
|-------|------|-----|
| (nije bilo formalnog lifecyclea) | lifecycle stanja Kruga: `active`, `early_signal`, `ugrožen`, `continuity_window`, `read_only`, `deleted` | novi sloj |
| (nije postojalo) | tranzicijski konteksti: `confirmed transfer`, `fallback takeover`, `read_only` reaktivacija | novi sloj |
| `grace` (ako se igdje neformalno pojavljivao u copy-u/dokumentaciji) | **ne postoji** — uklanja se iz cijelog jezika | ukidanje |

### 2.7 Transakcijska semantika

| Staro | Novo | Tip |
|-------|------|-----|
| transakcija "pripada useru" + možda visible drugima preko shared izvora | transakcija dobiva `krug_id` (Krug kontekst) + `privacy` (`private` / `personal` / `shared`) + `shared_status` prema Domain Model v1.1 | novi atributi, ne rename |
| (nije postojalo eksplicitno) | `krug_id` označava Krug kontekst transakcije; `privacy` i `shared_status` ostaju zasebne osi sa svojim već zaključenim pravilima (preset defaulti: `partner` = `shared`, `su-roditelj` = `personal`, `cimer` = `personal`; post-delete: bivši `shared` → `personal`). Odsutnost `krug_id` ne uvodi novu globalnu default tvrdnju. | formalizacija osi, bez novog defaulta |

### 2.8 Post-delete

| Staro | Novo | Tip |
|-------|------|-----|
| implicitno cascade (ili nedefinirano) | Post-Delete Behavior Foundation Patch v1.1 — eksplicitna pravila po vrsti artefakta (resursi/transakcije/governance) | novi sloj |

---

## 3. Što je odmah novi naziv, a što može ostati legacy sloj

Tri sloja, tri brzine.

### 3.1 Product copy — **Krug odmah**

Sav UI tekst koji korisnik vidi u trenutku isporuke bilo kojeg Krug bloka (A → I iz Implementation Order v1.1) mora biti na jeziku Kruga: "Krug", "članovi Kruga", "vlasnik Kruga", "preset Kruga", lifecycle stanja, governance radnje.

Riječ "Family" se **ne smije** pojaviti u novom korisničkom copy-u. Postojeći stari Family ekrani koji još nisu refaktorirani smiju zadržati staru terminologiju **dok god se ne diraju** — ali u trenutku kad ih dira novi rad, prelaze na Krug copy *u istom potezu*. Nema "pola ekrana Krug, pola Family".

Iznimka: i18n ključevi (`family.*`) smiju ostati pod starim namespaceom dok ne dođe do koordiniranog rename-a — bitno je da *vrijednosti* (HR/EN/DE tekstovi) pokazuju Krug jezik. Ključ je internalija, copy je vanjština.

### 3.2 Domain naming — **Krug postupno, ali striktno u koraku s implementacijom**

Sve **novo** što se piše po Implementation Order v1.1 (entiteti, hookovi, helperi, edge functions, događaji, tipovi) ide kao `krug*` / `Krug*` od prvog dana. Bez prijelaznih `family*` imena u novom kodu.

**Postojeći** domain kod (`useFamily*`, `family*` helperi, edge functions kao `notify-family-message`-tipa) može privremeno ostati pod starim imenom dok ga ne dotakne refactor iz odgovarajućeg bloka. U trenutku tog refactora rename je obavezan dio istog poteza, ne kasnije.

Opasno ako predugo ostane staro: hibridni kod gdje novi `krug*` helperi pozivaju stare `family*` helpere stvara dojam da su isti pojam — što nisu (vidi §4).

### 3.3 Persistence / compatibility — **`family_*` smije neko vrijeme ostati ispod haube**

DB tablice, kolone i enumi koji već postoje kao `family_*` ne moraju se renameirati istovremeno s domain slojem. Pristup:

- iznad postojećih tablica se uvodi **adapter/view sloj** koji izlaže Krug semantiku (npr. view koji izvodi `KrugOwnership` iz onoga što je sad u `family_groups`/`family_members`, ili read RPC koji vraća Krug oblik).
- novi entiteti koji nemaju legacy parnjaka (Governance artefakti, Continuity state, Takeover prozori, Krug lifecycle state) idu odmah pod `krug_*` imena — nema razloga ih zvati starim jezikom.
- per-resource refactor iz Structural Choice v1.1 (npr. `family_shared_sources` → namjenski Krug link sloj) je **dio Bloka F**; ne radi se ranije, ne radi se kasnije.

Opasno ako predugo ostane staro: kad UI/domain već govore Krug, a tablice i dalje `family_*`, prvi novi developer koji dođe pretpostavit će da su to isti koncepti i ugraditi staru `Family` logiku natrag.

---

## 4. Semantički rizici prijelaza

Najopasnija mjesta gdje rename može lagati ili gdje stari naziv može potajno vratiti stari behaviour.

### 4.1 Gdje 1:1 rename **ne radi**

- **`family member` → `KrugMember`** nije čisti rename. Stari `family member` je miješao člana i vlasnika kroz jedno polje. Novi model ima `KrugMember.status` (`punopravni`/`obični`) **+** odvojeni `KrugOwnership`. Tko rename napravi 1:1 ostat će s vlasnikom kao roleom na članu — direktna kontradikcija Foundation-a + Implementation Order v1.1.
- **`payment_source_members.role: limited/full` ↔ `KrugMember.status: obični/punopravni`** *konceptualno koreliraju* ali nisu isto i ne smiju se spojiti. `payment_source_members` je access sloj nad **resursom**, ne članstvo u Krugu. Spajanjem se gubi sposobnost dijeljenja resursa izvan Kruga (npr. nasljeđena `family_shared_sources` veza kroz drugu grupu).
- **`family group` → `Krug`** nije rename grupe nego **generalizacija**. Krug ima preset koji je zaključan na stvaranju; stara `family` nije imala formalni preset. Tretirati Krug kao "preimenovani Family" znači gubiti preset semantiku i otvarati vrata pitanjima "kako promijeniti tip Kruga" koja u modelu **ne postoje**.

### 4.2 Gdje stari naziv krivo sugerira stari behaviour

- **"Family ownership transfer"** kao copy/komentar krivo sugerira da je vlasništvo property grupe. U Krugu je vlasništvo zaseban sloj (`KrugOwnership`) s vlastitim tranzicijama (`confirmed transfer`, `fallback takeover`) — to nije isto kao "novi family head".
- **"Family billing"** krivo sugerira da bilo tko u grupi može platiti / preuzeti billing. U Krugu billing je strogo owner u steady-state `active`, plus spec-dodijeljeni punopravni član **isključivo u tranzicijskim prozorima** (Access Matrix v1.3 §3.10).
- **"Family deletion"** krivo sugerira jednostavan cascade. Krug ima Post-Delete Behavior Foundation Patch v1.1 s eksplicitnim ponašanjem po vrsti artefakta — to nije `DELETE CASCADE`.
- **"Family chat"** je već eksplicitno uklonjeno (vidi memory `Family Chat Removed`) — naming ne smije nikako sugerirati da se vraća. Krug **nema** chat.

### 4.3 Gdje postoji opasnost povratka `Family` logike kroz naming

- **Admin UX**: ako admin tooling i dalje govori "Family group", admin će intuitivno tražiti "promijeni vlasnika Family grupe" — radnju koja u Krugu ide kroz odvojeni Takeover/Continuity put. Admin copy mora ići s prvim Krug isporukama, ne kasnije.
- **Developer onboarding / interna dokumentacija**: ako se interno i dalje govori "family preset", "family owner", novi developer će graditi pretpostavke iz starog modela. Interna dokumentacija (README, decision logs, ovaj plan) mora biti čisto Krug.
- **i18n vrijednosti vs. ključevi**: dok ključ `family.something` može privremeno ostati, **vrijednost** ne smije sadržavati "obitelj"/"family"/"Familie" u novom copy-u. Ako se to ne razdvoji jasno, prijevodi će ostati lažno-Family iako je sve drugo Krug.
- **Hookovi i helperi koji se kopiraju**: `useFamilyMembers` → kopiran u `useKrugMembers` 1:1 → vraća isti shape s `role: owner` → tihi povratak starog modela. Svaki kopirani helper mora proći kroz §4.1 filter prije nego se commit-a.

---

## 5. Preporučena migration strategija na razini jezika/modela

Strateški redoslijed (ne SQL koraci):

### Korak 1 — Product copy first (uz prvu Krug isporuku iz Implementation Order v1.1)

**Što:** sav novi UI copy je Krug. Stari Family ekrani ostaju netaknuti dok ih ne dotakne refactor.
**Zašto:** korisnik je najmanje invested u tehničke detalje i najbrže prima novu mentalnu sliku. Ako copy ide zadnji, korisnik kroz pola releasea živi u starom modelu i daje feedback iz starog modela — što vraća product odluke unazad.
**Što se time štiti:** korisnička mentalna slika + product feedback loop.
**Što se time odgađa:** ništa tehnički — copy je najmanje invazivan sloj.

### Korak 2 — Domain naming u koraku s implementacijom (Blok-by-Blok prema Order v1.1)

**Što:** svaki blok iz Implementation Order v1.1 koji se isporučuje uvodi svoj `Krug*` domain sloj odmah. Bez prijelaznih `family*` imena u novom kodu. Postojeći `family*` kod ne renameirati dok ga ne dotakne neki blok.
**Zašto:** rename bez refactora je rizik (lažno-isti pojmovi); rename **tijekom** refactora osigurava da rename i semantička promjena idu u istom potezu i u istom code reviewu.
**Što se time štiti:** semantička jasnoća — nikad se ne događa da je nešto preimenovano a značenje staro.
**Što se time odgađa:** "lijepi" potpuni rename cijelog kodbase odjednom — to je svjesno odgođeno jer bi inače trajalo predugo i blokiralo isporuke.

### Korak 3 — Adapter sloj nad postojećim `family_*` tablicama (paralelno s Korakom 2, čim Blok A dođe na red)

**Što:** views / RPC-ovi / čitači koji iznad `family_groups`/`family_members`/`family_shared_*` izlažu Krug oblik (`Krug`, `KrugMember.status`, `KrugOwnership`). Pisanje i dalje ide na stare tablice dok se ne preimenuju.
**Zašto:** novi Krug domain sloj može odmah živjeti nad starim podacima bez čekanja DB rename-a. Spriječava "dva podatkovna izvora istine" jer ostaje samo jedan (stari), samo gledan kroz novu leću.
**Što se time štiti:** nema duplikacije podataka, nema dvostrukih upisa, nema race conditiona između starog i novog sloja.
**Što se time odgađa:** sam DB rename (`family_*` → `krug_*`) — namjerno odgođen u Korak 4.

### Korak 4 — Persistence rename (zadnje, jedan blok po jedan)

**Što:** tek kad je za pojedini `family_*` entitet (a) cijeli domain sloj Krug, (b) cijeli UI copy Krug, (c) adapter sloj dokazano radi — tablica/kolona/enum se preimenuje uz drop adaptera. Per-resource refactor iz Structural Choice v1.1 ide u sklopu Bloka F.
**Zašto:** persistence rename je najskuplji i najmanje reverzibilan; mora se raditi kad više nema rizika da neka konzumacija još ovisi o starom imenu.
**Što se time štiti:** stabilnost — nijedan rename ne dogodi se "u zraku".
**Što se time odgađa:** estetska čistoća DB schema — namjerno; tehnički dug je svjestan i ograničen rokom.

### Alternativa razmatrana i odbijena

**"Big bang" rename** (sve odjednom: copy + domain + persistence) — odbijeno jer:
- mora se isporučiti u jednom potezu, što kontradiktira Bloku-by-Bloku redoslijedu iz Order v1.1.
- maksimizira rizik regresija (sve se mijenja istovremeno → debug je kombinatoričan).
- zahtijeva da svi blokovi A–I budu spremni prije bilo kakvog rename-a — odgađa korisničku vrijednost na sam kraj.

---

## 6. Što ovaj dokument svjesno NE odlučuje

- **nije SQL migration plan** (točan redoslijed CREATE/ALTER/DROP, FK pravila, default vrijednosti, indeksi, constraints).
- **nije deployment plan** (po okolišima, downtime prozori, redoslijed migracije po environmentu).
- **nije rollout plan po korisnicima** (feature flagovi, postotak korisnika, A/B, beta krug).
- **nije code mod plan** (koje fajlove točno renameirati, kojim alatom, u kojem PR-u).
- **nije API/service versioning spec** (kako se klijenti starije verzije ponašaju prema Krug API-ju, kako edge funkcije rute prema staroj/novoj shemi).
- **nije i18n key migration plan** (kada točno `family.*` ključevi postaju `krug.*` i kako se prevodi održavaju u prijelazu).

Sve gore — svaki u svom dokumentu kad za njega dođe vrijeme.

---

## 7. Zaključak

1. **Naming + konceptualna migration strategija je sada jasna.** Tri sloja s tri brzine (copy odmah, domain u koraku s implementacijom, persistence zadnje), eksplicitna split mjesta gdje 1:1 rename ne radi (član vs ownership, payment_source_members vs KrugMember, Family group vs Krug + preset), eksplicitni semantički rizici (4.1–4.3), jasan strateški redoslijed (Koraci 1–4) s argumentima zašto.

2. **Sljedeći dokument — preporuka:**
   - **`SQL / Schema Plan v1`** — *preporučeno*. Naming pitanja su sada zatvorena (ovaj dokument) i Implementation Order v1.1 ima jasan redoslijed blokova. SQL plan može sigurno krenuti od Bloka A (Krug, KrugOwnership, KrugMember) jer:
     - zna kako se entiteti zovu (ovaj dokument),
     - zna što ide prvo i s kojim zavisnostima (Order v1.1),
     - zna koje su semantičke granice (Domain Model v1.1, Access Matrix v1.3).
     SQL plan može uključiti i adapter sloj iz §5 Koraka 3 kao prvi-class artefakt.
   - Alternativa: **`API / Service Boundary Plan v1`** — ima smisla **samo** ako se prvo želi zatvoriti pitanje kako edge functions i RPC-ovi mijenjaju potpis tijekom prijelaza (npr. da li `notify-family-*` edge funkcije zadržavaju ime ili idu u `notify-krug-*` s redirect/compat slojem). Niža prioritet — može doći odmah nakon SQL plana.
   - **`UI Surface Plan v1`** — i dalje preuranjen. Bez Blokova A–C nema čvrste podloge za UI; bez SQL plana se UI ne može vezati na konkretne reads/writes.

Reci "prihvaćam Naming & Migration Strategy v1" ili javi korekcije.
