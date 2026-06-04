Cilj: zamijeniti sadržaj `.lovable/plan.md` ovim tekstom kao `Krug Governance / Mutation Path Plan v1.1`. Dvije promjene u odnosu na v1:

1. Uklonjena generička formulacija "punopravni član smije Add/Change status/Remove involuntary". `Add member` (i obični i punopravni) = owner-only. `Remove member — involuntary` razdvojen na ordinary/full s eksplicitnim governance pravilima: ordinary uklanja owner kad je sam jedini punopravni, inače unanimous svih punopravnih; full ne može biti jednostrano izbačen.
2. `Change member status` razdvojen u dva path-a: `Promote ordinary → full` (governance, owner-only inicijacija u skladu s `Governance Matrix v1.3`) i `Demote full → ordinary` (postoji samo ako iniciran/pristankom samog člana). Dodano izričito pravilo da se full ne može jednostrano downgradeati.

Bez novih ideja, bez širenja scope-a. Bez konkretnog SQL-a, RPC potpisa, UI flowa, rollouta. Bez novih preseta, bez `Family` kao aktivnog modela, bez `majority`.

---

# Krug Governance / Mutation Path Plan v1.1

Strateški dokument. Definira **koje sve mutation paths postoje** u Krug ekosistemu, **tko ih smije pozvati**, **koje preduvjete provjeravaju** i **koje invariante atomarno čuvaju** — sve na razini servisnog sloja, bez konkretnih potpisa ili koda.

Dokument je **čisto mutation/governance**. Ne ponavlja schemu (`Krug SQL / Schema Plan v1.1`), ne ponavlja RLS plan (`Krug RLS / Access Enforcement Plan v1.1`), ne otvara transakcijsku semantiku (Blok D), ne piše orchestrator kod (Blok E). Sve referencira.

Polazi striktno od zaključenog seta: `Krug Foundation v4.2`, `Preset Constraint Matrix v1`, `Governance Matrix v1.3`, `Continuity & Billing State Machine v1.3.2`, `Takeover Conditions Spec v1.1`, `Krug Domain/Data Model v1.1`, `Post-Delete Behavior Foundation Patch v1.1`, `Shared Resources Link — Structural Choice v1.1`, `Krug Access Matrix v1.3`, `Reuse / Refactor / Rebuild Plan v1`, `Krug Implementation Order v1.1`, `Krug Naming & Migration Strategy v1.1`, `Krug SQL / Schema Plan v1.1`, `Krug RLS / Access Enforcement Plan v1.1`.

Scope: mutation paths nad tablicama iz v1.1 sheme (Blokovi A–C + C/E boundary). Blok D i Blok E referenciraju se samo kao točke u kojima neki mutation path *postoji*, ali nisu ovdje razrađeni.

---

## 1. Što je "mutation path"

Mutation path je **imenovana servisna operacija** koja:

- mijenja stanje jedne ili više `krug_*` tablica,
- ima jasno definiranog *inicijatora* (koja uloga smije pozvati) i, gdje je potrebno, *suglasnost* dodatnih identiteta,
- ima jasno definirane *preduvjete* (lifecycle, governance, preset, continuity),
- atomarno čuva *invariante* (cross-row i cross-table),
- završava determinističkim *post-stanjem* usklađenim s `Continuity & Billing State Machine v1.3.2` i `Governance Matrix v1.3`.

Mutation path **nije** RLS politika, nije trigger, nije RPC potpis, nije klijent funkcija. To je *strateška jedinica promjene*.

**Pravilo:** sve što `Krug RLS / Access Enforcement Plan v1.1` označi kao "service-role / controlled mutation path" pripada nekom path-u iz ovog dokumenta. Direktan client write izvan ovih paths-a je po definiciji zabranjen.

---

## 2. Klasifikacija mutation paths

1. **Lifecycle paths** — `krug` i/ili `krug_ownership` u steady-state granicama.
2. **Membership paths** — `krug_membership` (sastav, status).
3. **Resource paths** — `krug_shared_payment_source` (link/unlink).
4. **Continuity / takeover paths (C/E boundary)** — `krug_continuity_window` i sve usklađeno s njim. Puna orchestracija živi u Bloku E.
5. **Post-delete paths** — kontrolirano zatvaranje prema `Post-Delete Behavior Foundation Patch v1.1`.

---

## 3. Katalog mutation paths

### 3.1 Lifecycle paths

- **Create Krug** — kreira Krug s odabranim presetom; otvara inicijalni `krug_ownership`; otvara inicijalno `krug_membership` za kreatora kao *full* (kreator je istovremeno owner i punopravni član u skladu s `Krug Foundation v4.2`). Inicijator: autentificirani korisnik. Tablice: `krug`, `krug_ownership`, `krug_membership`. Post-stanje: `active`.
- **Update Krug — bezopasna polja** — mijenja polja koja `Krug Access Matrix v1.3` izričito dopušta owneru kao client UPDATE (display/kontekstualna). Inicijator: owner. Tablice: `krug`. Lifecycle: ne-terminalno.
- **Transition Krug lifecycle** — sve dopuštene tranzicije `lifecycle_state` osim onih koje pripadaju continuity/takeover (3.4) i post-delete (3.5). Inicijator: prema state machine-u. Tablice: `krug`, eventualno `krug_ownership`.

### 3.2 Membership paths

Svi membership paths su **owner-only ili explicitno governance-omotani**; obični član ne inicira ništa osim svog izlaska.

- **Add member — ordinary** — dodaje novog člana sa statusom *ordinary*. Inicijator: **owner**. Suglasnost: nije potrebna. Tablice: `krug_membership`. Preset constraint mora biti zadovoljen (`Preset Constraint Matrix v1`).
- **Add member — full** — dodaje novog člana već u statusu *full* (kad to spec dopušta). Inicijator: **owner**. Suglasnost: nije potrebna. Tablice: `krug_membership`. Preset constraint na broj punopravnih mora biti zadovoljen.
- **Promote ordinary → full** — promovira postojećeg običnog člana u punopravnog. Inicijator: **owner** (governance odluka prema `Governance Matrix v1.3`). Suglasnost: prema specu (ako spec traži pristanak promoviranog ili suglasnost ostalih punopravnih, path to provodi). Tablice: `krug_membership`. Invariante: broj punopravnih nakon promocije ostaje unutar preset granica.
- **Demote full → ordinary** — postoji **samo** kao radnja inicirana od strane samog punopravnog člana (vlastiti odlazak iz full statusa u ordinary) ili uz njegov izričiti pristanak. Inicijator: **sam punopravni član**. Suglasnost: nije potrebna kad on sam inicira; ako bi se ikad zatražio downgrade na drugačiji način, path zahtijeva njegov eksplicitni pristanak kao tvrdi preduvjet. Tablice: `krug_membership`. Invariante: nikad ne ostaviti Krug ispod preset minimuma punopravnih; ako bi pao ispod, path mora biti odbijen ili preusmjeren u continuity/takeover (3.4). **Eksplicitno pravilo:** governance ne može jednostrano downgradeati punopravnog člana; bez pristanka tog člana ovaj path se ne izvršava.
- **Remove member — voluntary leave** — član sam izlazi iz Kruga. Inicijator: **sam član** (bilo ordinary, bilo full). Suglasnost: nije potrebna. Tablice: `krug_membership`. Posebno pravilo: ako odlazeći punopravni član ostavlja Krug ispod preset minimuma punopravnih, path preusmjerava u continuity/takeover (3.4) umjesto čistog izlaska.
- **Remove member — involuntary, ordinary** — izbacivanje običnog člana. Inicijator i suglasnost ovise o sastavu punopravnih:
  - ako je **owner jedini punopravni** u Krugu: **owner-only**, bez dodatne suglasnosti;
  - ako postoje **2 ili više punopravnih**: **unanimous svih punopravnih** (uključujući ownera). Path nije izvršiv dok nije zabilježena suglasnost svakog punopravnog.
  - Tablice: `krug_membership`.
- **Remove member — involuntary, full** — **ne postoji kao izvršiv path**. Punopravni član ne može biti jednostrano izbačen. Jedini načini da punopravni član prestane biti član: vlastiti `Remove member — voluntary leave`, ili posljedica continuity/takeover orchestracije u skladu s `Takeover Conditions Spec v1.1`. Bilo koji pokušaj koji bi semantički bio "kick full member" mora biti odbijen na servisnom sloju.

### 3.3 Resource paths

- **Link shared payment source** — Inicijator: identitet koji je istovremeno *vlasnik izvora* **i** *punopravni član Kruga* (kombinirani uvjet). Tablice: `krug_shared_payment_source`. Ne dira `payment_source_members`.
- **Unlink shared payment source** — logičko zatvaranje. Inicijator: vlasnik izvora ili owner Kruga (precizan presjek prema `Krug Access Matrix v1.3`). Tablice: `krug_shared_payment_source`. Fizičko brisanje se ne koristi.

### 3.4 Continuity / takeover paths (C/E boundary)

Mutation jedinice. Pune orchestracije, vremenski uvjeti i billing posljedice — Blok E i `Takeover Conditions Spec v1.1`.

- **Open continuity window** — otvara red u `krug_continuity_window`, postavlja `krug.lifecycle_state = continuity_window`. Inicijator: sustav / orchestrator. Klijent nikad.
- **Close continuity window — resolved** — zatvara prozor bez takeovera; lifecycle se vraća prema state machine-u.
- **Close continuity window — takeover** — atomarno: end starog `krug_ownership`, start novog za spec-dodijeljenog punopravnog člana, lifecycle u `active`. Inicijator: spec-dodijeljeni punopravni član u relevantnom kontekstu (`Takeover Conditions Spec v1.1`).
- **Close continuity window — expired** — vremenski istek bez takeovera; post-stanje propisuje state machine.

### 3.5 Post-delete paths

- **Delete Krug** — kontrolirano zatvaranje prema `Post-Delete Behavior Foundation Patch v1.1`: zatvaranje `krug_ownership`, zatvaranje `krug_continuity_window` ako je otvoren, unlink svih `krug_shared_payment_source` redova, finalni lifecycle. Inicijator: owner (ili sustav u definiranim slučajevima). Tablice: sve `krug_*`.

---

## 4. Tko smije pozvati koji path

Servisni sloj **mora** provjeriti inicijatora (i suglasnost gdje je tražena) neovisno o RLS-u i neovisno o UI-u.

- **Autentificirani korisnik (neovisno o Krugu)** — samo `Create Krug`.
- **Owner Kruga**
  - `Update Krug — bezopasna polja`
  - `Add member — ordinary`
  - `Add member — full`
  - `Promote ordinary → full`
  - `Remove member — involuntary, ordinary` (samo kad je owner jedini punopravni; inače ovaj path traži unanimous svih punopravnih i owner je samo jedan od njih)
  - `Unlink shared payment source` (alternativni put pored vlasnika izvora)
  - `Delete Krug`
  - sve lifecycle tranzicije koje state machine dodjeljuje owneru
- **Skup svih punopravnih (uključujući ownera)** — `Remove member — involuntary, ordinary` kad ih je 2+: path nije izvršiv bez **unanimous** suglasnosti svih punopravnih.
- **Sam član (svoj red)**
  - `Remove member — voluntary leave` (bilo ordinary, bilo full)
  - `Demote full → ordinary` (samo on sam može inicirati ili dati pristanak)
- **Vlasnik izvora plaćanja**
  - `Link shared payment source` (uz dodatni uvjet punopravnog članstva u istom Krugu)
  - `Unlink shared payment source` (alternativni put pored ownera Kruga)
- **Spec-dodijeljeni punopravni član u kontekstu** — `Close continuity window — takeover`.
- **Sustav / orchestrator (service-role bez korisničkog inicijatora)** — `Open continuity window`, `Close continuity window — expired`, dijelovi `Delete Krug` koji idu kao cascade, dijelovi `Transition Krug lifecycle` koje state machine pokreće vremenski.

**Stroga negativna pravila:**

- Obični član **ne inicira** nijedan membership path osim `Remove member — voluntary leave` (i, ako je vlasnik izvora, resource paths uz dodatne uvjete).
- Punopravni član (koji nije owner) **ne inicira** `Add member — ordinary`, `Add member — full`, `Promote ordinary → full`, `Remove member — involuntary, ordinary` *jednostrano*; sudjeluje samo kao jedan od potrebnih suglasnika u unanimous slučaju.
- **Nitko ne smije** izvršiti `Remove member — involuntary, full` — taj path ne postoji.
- **Nitko osim samog punopravnog člana** ne smije iniciraciti ni izvršiti `Demote full → ordinary`.
- Ovlast se ne smije izvoditi iz UI flag-a; izvor istine je servisni sloj koji čita aktualno stanje `krug_ownership` / `krug_membership` / `krug_continuity_window`.

---

## 5. Preduvjeti i invariante po path-u

Strukturni constraint-i (partial unique, FK) — vidi v1.1 schema plan.

### Zajednički preduvjeti (svi paths osim `Create Krug`)
- Krug postoji i nije u nedopuštenom lifecycle-u.
- Inicijator (i suglasnici, gdje su traženi) zadovoljavaju §4.
- `preset` se ne mijenja.

### Lifecycle paths
- **Create Krug** — preset iz dopuštenog skupa; kreator unutar billing/governance limita ako postoje. Invariante: jedan aktivan `krug_ownership`, inicijalno članstvo konzistentno s presetom (kreator = full), `lifecycle_state = active`.
- **Update Krug — bezopasna polja** — polje u dopuštenom skupu. Invariante: ne dira `preset`, `lifecycle_state`.
- **Transition Krug lifecycle** — tranzicija dopuštena state machine-om. Invariante: `krug_ownership` i `krug.lifecycle_state` konzistentni; ako tranzicija završava u `continuity_window`, postoji točno jedan otvoreni `krug_continuity_window` red.

### Membership paths
- **Add member — ordinary** — identitet nije već član; preset constraint zadovoljen. Invariante: jedinstvenost (korisnik, Krug); status = ordinary.
- **Add member — full** — kao gore + preset constraint na broj punopravnih zadovoljen i nakon dodavanja. Invariante: broj punopravnih unutar preset granica.
- **Promote ordinary → full** — meta-član je trenutno ordinary; broj punopravnih nakon promocije unutar preset granica; suglasnost (ako je spec traži) zabilježena. Invariante: status promijenjen atomarno; broj punopravnih unutar dopuštenog raspona.
- **Demote full → ordinary** — inicijator je sam taj punopravni član (ili je njegov pristanak izričito zabilježen); broj punopravnih nakon downgradea ostaje na ili iznad preset minimuma — inače path mora biti odbijen ili preusmjeren u continuity/takeover. Invariante: bez pristanka člana nema promjene; preset minimum punopravnih očuvan.
- **Remove member — voluntary leave** — član postoji. Invariante: ako odlazeći punopravni član ostavlja Krug ispod preset minimuma, path delegira u continuity/takeover umjesto da tiho izvrši izlazak.
- **Remove member — involuntary, ordinary** — meta-član je ordinary; inicijator/suglasnost zadovoljava pravilo iz §3.2 (owner-only kad je owner jedini punopravni; inače unanimous svih punopravnih). Invariante: nikad ne izvrši ako uvjet suglasnosti nije potpun.
- **Remove member — involuntary, full** — *path ne postoji*. Servisni sloj mora odbiti svaki poziv koji semantički odgovara izbacivanju punopravnog člana.

### Resource paths
- **Link shared payment source** — inicijator je vlasnik izvora *i* punopravni član; izvor nije već linkan; uvjeti iz `Shared Resources Link — Structural Choice v1.1` zadovoljeni. Invariante: link ne dodjeljuje pristup samom izvoru; idempotentnost.
- **Unlink shared payment source** — link postoji i nije zatvoren. Invariante: logičko zatvaranje; konzistentnost s post-delete pravilima.

### Continuity / takeover paths
- **Open continuity window** — Krug nije već u `continuity_window`; uvjet state machine-a ispunjen. Invariante: točno jedan otvoreni prozor po Krugu; `lifecycle_state` istovremeno postavljen.
- **Close — resolved / expired / takeover** — postoji otvoreni prozor; specifični uvjet ispunjen. Invariante: prozor zatvoren atomarno s lifecycle promjenom; kod takeovera dodatno stari ownership zatvoren i novi otvoren u istoj transakciji.

### Post-delete paths
- **Delete Krug** — inicijator ovlašten; Krug u dopuštenom stanju prema `Post-Delete Behavior Foundation Patch v1.1`. Invariante: svi otvoreni redovi zatvoreni atomarno; finalni lifecycle dosegnut; nijedan rezidualni "živi" red.

---

## 6. Najosjetljiviji paths

1. **Remove member — involuntary, full (ne postoji)** — najveći rizik je dopustiti ga implicitno (npr. preko UI gumba koji zaobilazi service). Servisni sloj mora ga izričito odbijati.
2. **Demote full → ordinary** — drugi najveći rizik: dopustiti ga bez pristanka tog člana. Bez eksplicitnog pristanka punopravnog člana, path se ne izvršava ni iz jedne uloge, uključujući ownera.
3. **Remove member — involuntary, ordinary (2+ punopravnih)** — rizik je izvršiti ga bez potpunog unanimous-a. Path mora držati skup zabilježenih suglasnosti i odbiti izvršenje dok bilo koja nedostaje.
4. **Promote ordinary → full** — direktno mijenja governance moć; mora biti owner-inicirano i poštivati preset granice.
5. **Close continuity window — takeover** — mijenja ownership *i* lifecycle *i* continuity istovremeno; atomarnost obavezna.
6. **Delete Krug** — najveći blast radius; doslovno pratiti `Post-Delete Behavior Foundation Patch v1.1`.
7. **Link shared payment source** — mjesto najlakšeg horizontalnog leaka ako se pomiješa s pristupom samom izvoru.
8. **Open continuity window** — ako se pozove izvan sustava, state machine postaje besmislen.

---

## 7. Atomarnost i orchestracija

- Svaki path je **transakcijska jedinica**: ili sve izmjene uspijevaju, ili nijedna.
- Paths koji diraju više tablica (`Create Krug`, `Close — takeover`, `Delete Krug`, `Transition Krug lifecycle` kad pomiče i ownership) izvršavaju se u istoj DB transakciji.
- Paths s **traženom suglasnošću** (npr. `Remove member — involuntary, ordinary` s 2+ punopravnih) mogu zahtijevati višefazni model (prikupljanje suglasnosti → izvršenje), ali sama izvršna faza ostaje atomarna i tek kad je suglasnost potpuna.
- Triggeri ostaju **invariant guard**, ne primarni mehanizam.
- Idempotentnost: paths koji se mogu legitimno ponoviti (npr. `Link shared payment source`) moraju biti idempotentni; paths koji ne smiju (npr. promocija u full) moraju biti idempotency-safe na razini detekcije duplog poziva, ne na razini "ignoriraj i prođi".

---

## 8. Što ovaj dokument svjesno NE odlučuje

- Konkretne RPC potpise, imena, parametre, povratne tipove.
- Konkretan SQL ili PL/pgSQL.
- UI flow ili komponente.
- Rollout (faze, okoliši, backfill).
- Transakcijsku semantiku Bloka D.
- Pune orchestratore Bloka E — koristim samo *imena* paths-a kao reference.
- Bilo koji dio sheme ili RLS plana — to živi u v1.1 schema planu i v1.1 RLS planu.
- Notifikacije, e-mailove, audit log.
- Mehaniku prikupljanja suglasnosti (kako se bilježi, koji je timeout, koji UI) — samo *zahtjev* da suglasnost postoji prije izvršenja.

---

## 9. Zaključak

1. **Mutation model za v1.1 tablice je sada zatvoren** na strateškoj razini, uz governance pravila zaključana u `Governance Matrix v1.3`: pathovi su razdvojeni po ovlastima i suglasnostima, jednostrano izbacivanje punopravnog člana je formalno isključeno, a downgrade punopravnog statusa moguć je samo uz pristanak tog člana.

2. **Najbolji sljedeći dokument:** `Krug Transaction Semantics Schema Plan v1`. §3.4 i §6 jasno označavaju gdje su granice ovog dokumenta — sve što se tiče *transakcija unutar Kruga* (kako se `krug_id`, `privacy`, `shared_status` ponašaju na `expenses` redovima, kako se odnose na ownership/continuity stanje, kako se filtriraju u izvještajima) je Blok D i nije pokriveno ovdje. Prije nego se otvori `Krug API / Service Boundary Plan v1` potrebno je zatvoriti transakcijsku semantiku jer mijenja što neki paths uopće smiju raditi (npr. `Delete Krug` i transakcije s `krug_id`, `Close — takeover` i privacy preusmjeravanja).
