# Krug RLS / Access Enforcement Plan v1

Strateški enforcement dokument. Prevodi `Krug Access Matrix v1.3` i `Krug SQL / Schema Plan v1.1` u jasan plan **gdje se pravila provode** (DB/RLS, trigger, service layer, GRANT), bez konkretnog SQL koda, bez `CREATE POLICY` izraza, bez RPC potpisa, bez rollouta.

Polazi striktno od zaključenog:
`Krug Foundation v4.2`, `Preset Constraint Matrix v1`, `Governance Matrix v1.3`, `Continuity & Billing State Machine v1.3.2`, `Takeover Conditions Spec v1.1`, `Krug Domain/Data Model v1.1`, `Post-Delete Behavior Foundation Patch v1.1`, `Shared Resources Link — Structural Choice v1.1`, `Krug Access Matrix v1.3`, `Reuse / Refactor / Rebuild Plan v1`, `Krug Implementation Order v1.1`, `Krug Naming & Migration Strategy v1.1`, `Krug SQL / Schema Plan v1.1`.

Scope: enforcement model za tablice iz v1.1 sheme (Blokovi A–C + C/E boundary). Bez novih preseta, bez `Family` kao aktivnog modela, bez `majority`, bez novog product scope-a.

---

## 1. Enforcement načela

Enforcement Kruga se ne smije svesti samo na RLS. Tri sloja zajedno daju siguran model; svaki sam je nedovoljan.

**DB/RLS sloj — što mora biti garantirano ovdje:**
- Vidljivost reda po identitetu korisnika (`auth.uid()` ↔ aktivno članstvo / vlasništvo / link na resurs).
- Negativna izolacija: korisnik koji nije ni vlasnik ni član Kruga ne smije dobiti red iz bilo koje `krug_*` tablice ni indirektno.
- Razdvajanje read od write puta: SELECT policy se ne smije slijepo reciklirati kao USING za UPDATE/DELETE.
- Zatvaranje direktnog client write-a tamo gdje promjena nosi cross-row ili cross-table posljedicu (vidi §3).

**Service / domain sloj — što mora biti garantirano ovdje:**
- Sve tranzicije `lifecycle_state` (Continuity & Billing State Machine v1.3.2).
- Sve tranzicije `krug_ownership` (otvaranje, zatvaranje, takeover) jer ovise o governance i continuity uvjetima.
- Otvaranje/zatvaranje `krug_continuity_window` (C/E boundary) — nikad direktan client write.
- Atomarnost orchestracija koje diraju više tablica (npr. takeover = ownership end + ownership start + lifecycle update + continuity close).
- Validacije iz `Preset Constraint Matrix v1` i `Takeover Conditions Spec v1.1` koje RLS strukturno ne može izraziti.

**Što se nikad ne smije prepustiti samo UI-u:**
- Provjera tko može mijenjati shared payment source.
- Provjera punopravan vs običan član.
- Provjera continuity uvjeta prije takeover poziva.
- Filtriranje "moji Krugovi" — UI smije sakriti, ali ne smije odlučivati o pristupu.

**Gdje access matrix postaje read/write policy:**
- `Krug Access Matrix v1.3` definira *uloge × radnje*. Read aspekt (tko vidi koji Krug i njegove sub-entitete) prevodi se direktno u SELECT politike. Write aspekt ne preslikava se 1:1 u UPDATE/DELETE jer governance traži dodatne uvjete (preset, lifecycle, continuity), pa write ide kroz service-layer mutation path (Blok D / kasniji dokument).

**Gdje governance/state-machine traži više od čistog RLS-a:**
- Bilo koja radnja čiji preduvjet uključuje *trenutno* stanje druge tablice ili vremenski uvjet (`continuity_window.expires_at`, broj punopravnih članova, takeover prag iz Governance Matrix v1.3) ide kroz service layer; RLS ostaje kao zadnja zaštitna ograda, ne kao izvor istine.

---

## 2. Tablica po tablica

Za svaku tablicu navodim: kvalificirani SELECT/INSERT/UPDATE/DELETE pristup, što ide čistim RLS-om, što kroz service-role / controlled mutation path, i ključni rizik krivog modeliranja.

### 2.1 `krug`

- **SELECT** — vlasnik (`krug_ownership.ended_at IS NULL`), aktivan član (`krug_membership`), i identiteti koji imaju pravo "vidjeti Krug" prema Access Matrix v1.3. Bivši članovi/vlasnici ne vide red osim ako Access Matrix to izričito dopušta (trenutno ne).
- **INSERT** — service layer. Kreiranje Kruga nikad nije čisti client INSERT jer mora atomarno otvoriti i `krug_ownership` red i (ovisno o presetu) inicijalno članstvo.
- **UPDATE** — vrlo uska RLS dozvola na bezopasna polja (npr. display polja koja Access Matrix dopušta vlasniku). Sve što dira `preset` ili `lifecycle_state` — zabranjeno na RLS razini, ide isključivo kroz service layer. `preset` je u shemi immutable; RLS to mora dodatno blokirati za sve role osim service.
- **DELETE** — nikad direktan client. Brisanje Kruga prolazi kroz Post-Delete Behavior Foundation Patch v1.1 orchestrator (lifecycle, continuity, ownership zatvaranje, link cleanup).
- **Čisti RLS pokriva:** vidljivost i blokadu pisanja po `preset`/`lifecycle_state`.
- **Service-role / controlled path:** kreiranje, lifecycle promjene, brisanje.
- **Rizik krivog modeliranja:** ako se UPDATE pusti preširoko, korisnik može mijenjati `preset` ili `lifecycle_state` direktno i razbiti cijeli state machine i preset invariante.

### 2.2 `krug_ownership`

- **SELECT** — vlasnik (sam svoj red), aktivni članovi Kruga (vidljivost vlasništva je dio Access Matrix v1.3 transparentnosti). Bivši vlasnici vide svoje povijesne redove. Neutralni korisnici — ne.
- **INSERT** — isključivo service layer. Novi `krug_ownership` red nastaje samo iz: (a) kreiranja Kruga, (b) takeover orchestracije pod uvjetima `Takeover Conditions Spec v1.1`.
- **UPDATE** — isključivo service layer. Polje `ended_at`/`ended_reason` smije zatvoriti samo orchestrator (lifecycle/continuity/takeover/post-delete).
- **DELETE** — zabranjeno svima osim service-role (i čak i tamo se ne koristi u normalnom toku; vlasništvo se "zatvara", ne briše).
- **Čisti RLS pokriva:** read scoping i potpunu zabranu client write-a.
- **Service-role / controlled path:** sve mutacije.
- **Rizik krivog modeliranja:** ako klijent može direktno zatvoriti tuđi ili svoj `krug_ownership`, ruši se invariant "jedan aktivan vlasnik" i otvara se ilegalni put do takeover-a bez governance provjere.

### 2.3 `krug_membership`

- **SELECT** — vlasnik Kruga, svi aktivni članovi Kruga (međusobna vidljivost prema Access Matrix v1.3). Pojedinac uvijek vidi vlastite member redove kroz život Kruga.
- **INSERT** — service layer. Dodavanje člana mora poštivati `Preset Constraint Matrix v1` (npr. broj punopravnih po presetu) i Governance Matrix v1.3.
- **UPDATE** — service layer. Promjena `status` (punopravni/obični) je governance odluka, ne client write. Polja koja su isključivo korisnikova preferencija unutar Access Matrix v1.3 (ako ih ima u v1.1 shemi) mogu ići uskim RLS-om — ali u v1.1 shemi `krug_membership` nema takvih polja, pa praktično cijeli UPDATE ide kroz service.
- **DELETE** — isključivo service layer (izlazak iz Kruga, izbacivanje, post-delete cascade). Ne briše se direktno iz klijenta.
- **Čisti RLS pokriva:** read scoping i zabranu client write-a na status.
- **Service-role / controlled path:** sve mutacije, posebno promjena statusa.
- **Rizik krivog modeliranja:** ako bilo koji član može mijenjati `status` direktno, obični član se sam može unaprijediti u punopravnog i zaobići cijelu Governance Matrix v1.3 (governance prava, takeover, brojanje punopravnih). Ovo je najopasnija pojedinačna RLS pogreška u cijelom modelu.

### 2.4 `krug_shared_payment_source`

- **SELECT** — vlasnik Kruga i aktivni članovi Kruga (vidljivost da Krug ima link na taj izvor). Neovisno o tome, **pristup samom izvoru plaćanja** i dalje strogo ide kroz postojeći `payment_source_members` sloj — ovaj red nije prečica do podataka izvora.
- **INSERT** — service layer. Linkanje izvora na Krug mora paralelno provjeriti da je inicijator vlasnik izvora i punopravni član Kruga (kombinirani uvjet, ne samo RLS).
- **UPDATE** — minimalno. Praktički ne postoji legitiman UPDATE osim service-role popunjavanja `unlinked_at`.
- **DELETE** — zabranjeno klijentu. Unlink ide kroz service (popuni `unlinked_at`, ne fizičko brisanje), zbog Post-Delete Behavior Foundation Patch v1.1 i continuity konzistencije.
- **Čisti RLS pokriva:** read scoping i zabranu client write/delete.
- **Service-role / controlled path:** link, unlink, post-delete cascade.
- **Rizik krivog modeliranja:** ako se ovaj red smatra "dovoljnim dokazom pristupa izvoru", zaobilazi se `payment_source_members` i nastaje horizontalni leak preko Kruga. Mora ostati pravilo: `krug_shared_payment_source` daje *kontekst*, `payment_source_members` daje *pristup*.

### 2.5 `krug_continuity_window` (C/E boundary)

- **SELECT** — vlasnik i aktivni članovi Kruga (transparentnost continuity stanja prema Access Matrix v1.3). Povijesni prozori su dio te vidljivosti.
- **INSERT** — isključivo service layer (Blok E orchestrator). Ne postoji legitiman client put za otvaranje prozora.
- **UPDATE** — isključivo service layer. `closed_at` i `closed_reason` se popunjavaju samo iz Continuity & Billing State Machine v1.3.2 ili Takeover orchestracije.
- **DELETE** — zabranjeno svima u normalnom toku.
- **Čisti RLS pokriva:** read scoping i potpunu zabranu client write-a.
- **Service-role / controlled path:** sve mutacije.
- **Rizik krivog modeliranja:** ako klijent može otvoriti/zatvoriti prozor, lifecycle state i continuity prozor mogu se desinkronizirati, što razbija takeover i billing odluke.

---

## 3. Cross-table invariants

Pravila koja **strukturno** ne stanu u policy nad jednom tablicom. Za svako: je li RLS dovoljan, treba li trigger, treba li service-layer orchestrator.

### 3.1 Jedan aktivan vlasnik po Krugu
- Strukturno već čuvano partial unique indexom u v1.1 shemi (`WHERE ended_at IS NULL`).
- RLS sam: **nedovoljan** (RLS ne čuva jedinstvenost).
- Trigger: nije potreban dodatno; partial unique je dovoljan na razini integriteta.
- Service layer: **obavezan** za orchestraciju "end stari + start novi" atomarno (takeover, post-delete handover).

### 3.2 Obični član nema governance prava
- Strukturno: `krug_membership.status` razlikuje punopravni/obični.
- RLS sam: **nedovoljan** — sprječava da klijent piše u governance-relevantne tablice direktno, ali ne pokriva semantičke radnje (npr. inicijacija takeover-a) koje su uvijek service pozivi.
- Trigger: nije pravo mjesto za governance pravila.
- Service layer: **obavezan**. Svaka governance radnja provjerava `status = 'punopravni'` prije izvršenja, neovisno o RLS-u.

### 3.3 Ownership i lifecycle moraju biti usklađeni
- Npr. Krug u `arhiviran` ne smije imati otvoren `krug_ownership` red; Krug u `active`/`ugrozen`/`continuity_window` mora imati točno jedan otvoren.
- RLS sam: **nedovoljan**.
- Trigger: **moguć** kao dodatna zaštitna ograda (provjera invariant-a na write).
- Service layer: **primarno mjesto** — orchestrator mijenja lifecycle i ownership u istoj transakciji.

### 3.4 Continuity window i lifecycle state moraju biti konzistentni
- Otvoren `krug_continuity_window` (`closed_at IS NULL`) ⇔ `krug.lifecycle_state = 'continuity_window'`.
- RLS sam: **nedovoljan**.
- Trigger: **preporučen** kao invariant guard nakon Bloka E (sprječava drift ako se nešto piše izvan orchestratora).
- Service layer: **primarno mjesto** — sve tranzicije idu kroz Continuity & Billing State Machine v1.3.2.

### 3.5 Link na shared payment source ne smije zaobići `payment_source_members`
- RLS sam: **nedovoljan** ako bi netko gradio query "preko Kruga" do izvora. Ovo se rješava tako da pristup samom izvoru i dalje ovisi isključivo o `payment_source_members`, a ne o `krug_shared_payment_source`.
- Trigger: nije potreban — pitanje je *čitanja* izvora, ne pisanja u Krug tablice.
- Service layer: **obavezan** za link operaciju (paralelna provjera vlasništva nad izvorom + punopravnog članstva u Krugu).
- Read sloj nad samim izvorom: ostaje na postojećoj `payment_source_members` RLS politici; Krug joj ništa ne dodaje.

### 3.6 Preset je immutable
- RLS: **dio rješenja** — UPDATE policy mora isključiti `preset` za sve osim service-role.
- Trigger: **preporučen** kao dodatna ograda (odbij promjenu `preset`-a).
- Service layer: ne dira `preset` nakon kreiranja; nema legitimnog use-casea.

---

## 4. GRANT matrica na visokoj razini

Bez konkretnog SQL-a, ali jasno tko što dobiva.

- **`anon`** — ništa. Nijedna `krug_*` tablica nije javna. Nema SELECT, nema ničega.
- **`authenticated`** — SELECT na sve `krug_*` tablice (filtriran RLS-om). Vrlo uski UPDATE na `krug` (samo bezopasna polja, ako ih Access Matrix v1.3 dopušta vlasniku); inače bez direktnog INSERT/UPDATE/DELETE. Praktično: read-heavy rola.
- **`service_role`** — pun pristup na sve `krug_*` tablice. Sve mutacije koje nose cross-row/cross-table posljedicu idu ovim putem (kreiranje Kruga, ownership tranzicije, membership status promjene, link/unlink shared sourcea, continuity window open/close, lifecycle tranzicije, post-delete cascade).

**Operacije koje nikad ne bi smjele biti direktan client write:**
- Otvaranje ili zatvaranje `krug_ownership` reda.
- Promjena `krug_membership.status`.
- Otvaranje ili zatvaranje `krug_continuity_window`.
- Promjena `krug.lifecycle_state` ili `krug.preset`.
- Brisanje bilo kojeg `krug_*` reda.
- Link ili unlink u `krug_shared_payment_source`.

---

## 5. Najopasnija mjesta

Mjesta gdje loš enforcement strukturno razbija foundation:

1. **`krug_membership.status` kao client-writable polje** — najgori scenarij u modelu. Obični član se sam unaprijedi u punopravnog → ruši Governance Matrix v1.3, Preset Constraint Matrix v1 (brojanje punopravnih) i Takeover Conditions Spec v1.1 u jednom potezu.
2. **`krug_ownership` direktno pisan iz klijenta** — bilo INSERT (lažni vlasnik), bilo UPDATE `ended_at` (samonametnuti takeover put) — zaobilazi cijeli takeover spec.
3. **`krug.lifecycle_state` ili `krug.preset` u client UPDATE-u** — ruši state machine i preset invariante. `preset` posebno: cijeli Preset Constraint Matrix v1 pretpostavlja immutability.
4. **`krug_continuity_window` pisan izvan orchestratora** — desinkronizacija s `lifecycle_state`, kriva takeover/billing odluka.
5. **`krug_shared_payment_source` kao prečica do izvora plaćanja** — ako se ikad rotira ideja "član Kruga = ima pristup linkanim izvorima", to zaobilazi `payment_source_members` i pravi horizontalni leak preko Kruga. Mora ostati: link daje *kontekst*, ne *pristup*.
6. **SELECT politike koje "cure" preko membershipa** — npr. ako SELECT na `krug_ownership` ne provjerava da je `auth.uid()` aktivan član/vlasnik baš tog Kruga, vlasništvo tuđih Krugova postaje vidljivo.
7. **Recikliranje SELECT USING klauzule kao UPDATE/DELETE USING** — najčešća RLS greška; mora se izričito izbjeći.
8. **Zaboravljeni GRANT-ovi** — bez eksplicitnih GRANT-ova na public tablice, PostgREST vraća permission error i RLS uopće ne dolazi do izražaja; obrnuto, preširoki GRANT na `anon` razbija read scoping.

---

## 6. Što ovaj dokument svjesno NE odlučuje

- Konkretan SQL policy kod (`CREATE POLICY`, `USING`, `WITH CHECK`).
- Konkretne RPC potpise i tijela orchestratora.
- UI flow za bilo koju radnju.
- Rollout plan (faze, okoliši, backfill).
- Transakcijsku semantiku Bloka D (`krug_id` / `privacy` / `shared_status` na transakcijama).
- Blok E orchestratore (takeover, continuity tranzicije) — koristim samo njihova *imena* kao reference.
- Triggere kao gotov kod — samo *gdje su preporučeni* kao zaštitna ograda.

---

## 7. Zaključak

1. **Enforcement model za v1.1 tablice je sada dovoljno jasan** za nastavak rada: zna se što ide RLS-om, što service layerom, gdje su triggeri zaštitna ograda, kako izgleda GRANT matrica na visokoj razini, i koja su mjesta najopasnija.

2. **Najbolji sljedeći dokument:** `Krug Governance / Mutation Path Plan v1`.

   Razlog: §2 i §3 kontinuirano upiru u service-layer mutation path kao mjesto gdje žive sve netrivijalne radnje (ownership tranzicije, membership status, lifecycle, continuity, link/unlink). Prije nego se otvori Blok D (transakcijska semantika) ili krene konkretan API/SQL rad, treba zatvoriti **koje su to mutation paths, tko ih smije pozvati, koje preduvjete provjeravaju i koje invariante atomarno čuvaju** — i dalje na strateškoj razini, bez RPC potpisa. `Krug Transaction Semantics Schema Plan v1` i `Krug API / Service Boundary Plan v1` dolaze prirodno *nakon* toga, jer oba se naslanjaju na zaključen governance/mutation model.
