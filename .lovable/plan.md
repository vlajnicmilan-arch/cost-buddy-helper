Cilj: zamijeniti sadržaj `.lovable/plan.md` ovim tekstom kao `Krug RLS / Access Enforcement Plan v1.1`. Bez novih ideja, bez širenja scope-a. Dvije promjene u odnosu na v1:

1. Uklonjeni svi prekopirani dijelovi iz `Krug SQL / Schema Plan v1.1` (opseg sheme, enumi, tablični opisi, FK/indeksi/integritet, schema zaključci). Tablica-po-tablica sekcija ostaje, ali striktno kao enforcement matrica (SELECT/INSERT/UPDATE/DELETE + RLS vs service vs trigger + rizik), bez ponavljanja kolona, ključeva, indeksa ili enuma. Tamo gdje je potreban schema kontekst — referenca na v1.1, ne reprodukcija.
2. `krug_ownership` SELECT preciziran tako da ne dođe u konflikt s već zaključenim access modelom: razdvojena vidljivost **identiteta ownera** (relationship činjenica, vidljiva članovima) od **billing detalja / billing konteksta** (steady-state pripadaju owneru; u tranzicijama owner ili spec-dodijeljeni punopravni član u relevantnom kontekstu). Isto razdvajanje primijenjeno i u §3 i §5 gdje se to dotiče.

---

# Krug RLS / Access Enforcement Plan v1.1

Strateški enforcement dokument. Prevodi `Krug Access Matrix v1.3` i `Krug SQL / Schema Plan v1.1` u jasan plan **gdje se pravila provode** (DB/RLS, trigger, service layer, GRANT).

Dokument je **čisto enforcement**. Nije zamjena ni dopuna sheme. Sve što se tiče tablica, kolona, ključeva, enuma, indeksa, FK-ova i integritetnih constraint-a živi u `Krug SQL / Schema Plan v1.1` i ovdje se ne ponavlja — samo referencira.

Bez konkretnog SQL koda, bez `CREATE POLICY` izraza, bez RPC potpisa, bez rollouta, bez UI flowa.

Polazi striktno od zaključenog seta: `Krug Foundation v4.2`, `Preset Constraint Matrix v1`, `Governance Matrix v1.3`, `Continuity & Billing State Machine v1.3.2`, `Takeover Conditions Spec v1.1`, `Krug Domain/Data Model v1.1`, `Post-Delete Behavior Foundation Patch v1.1`, `Shared Resources Link — Structural Choice v1.1`, `Krug Access Matrix v1.3`, `Reuse / Refactor / Rebuild Plan v1`, `Krug Implementation Order v1.1`, `Krug Naming & Migration Strategy v1.1`, `Krug SQL / Schema Plan v1.1`.

Scope: enforcement model za tablice iz v1.1 sheme. Bez novih preseta, bez `Family` kao aktivnog modela, bez `majority`, bez novog product scope-a.

---

## 1. Enforcement načela

Enforcement Kruga se ne smije svesti samo na RLS. Tri sloja zajedno daju siguran model; svaki sam je nedovoljan.

**DB/RLS sloj — što mora biti garantirano ovdje:**
- Vidljivost reda po identitetu korisnika (`auth.uid()` ↔ aktivno članstvo / vlasništvo / link na resurs).
- Negativna izolacija: korisnik koji nije ni vlasnik ni član Kruga ne smije dobiti red iz bilo koje `krug_*` tablice ni indirektno.
- Razdvajanje read od write puta: SELECT politika se ne smije slijepo reciklirati kao USING za UPDATE/DELETE.
- Zatvaranje direktnog client write-a tamo gdje promjena nosi cross-row ili cross-table posljedicu (vidi §3).
- Razdvajanje vidljivosti **relationship činjenica** (npr. tko je trenutni owner Kruga) od vidljivosti **billing/kontekstualnih detalja** vezanih uz tu istu relaciju.

**Service / domain sloj — što mora biti garantirano ovdje:**
- Sve tranzicije `lifecycle_state` (Continuity & Billing State Machine v1.3.2).
- Sve tranzicije ownershipa (otvaranje, zatvaranje, takeover) jer ovise o governance i continuity uvjetima.
- Otvaranje/zatvaranje continuity prozora (C/E boundary) — nikad direktan client write.
- Atomarnost orchestracija koje diraju više tablica (npr. takeover = end starog ownershipa + start novog + lifecycle update + continuity close).
- Validacije iz `Preset Constraint Matrix v1` i `Takeover Conditions Spec v1.1` koje RLS strukturno ne može izraziti.
- Provjera **billing kontekstualnih prava** prije izlaganja billing detalja: steady-state owner; u tranziciji owner ili spec-dodijeljeni punopravni član u relevantnom kontekstu.

**Što se nikad ne smije prepustiti samo UI-u:**
- Provjera tko može mijenjati shared payment source.
- Provjera punopravan vs običan član.
- Provjera continuity uvjeta prije takeover poziva.
- Filtriranje "moji Krugovi" — UI smije sakriti, ali ne smije odlučivati o pristupu.
- Sakrivanje billing detalja od članova koji nemaju billing pravo (mora biti zatvoreno ispod UI sloja).

**Gdje access matrix postaje read/write policy:**
- `Krug Access Matrix v1.3` definira *uloge × radnje*. Read aspekt prevodi se u SELECT politike, ali s razlikom između relationship vidljivosti i billing/kontekstualne vidljivosti. Write aspekt ne preslikava se 1:1 u UPDATE/DELETE jer governance traži dodatne uvjete (preset, lifecycle, continuity), pa write ide kroz service-layer mutation path.

**Gdje governance/state-machine traži više od čistog RLS-a:**
- Bilo koja radnja čiji preduvjet uključuje *trenutno* stanje druge tablice ili vremenski uvjet (continuity prozor, broj punopravnih članova, takeover prag iz Governance Matrix v1.3) ide kroz service layer; RLS ostaje kao zadnja zaštitna ograda, ne kao izvor istine.

---

## 2. Tablica po tablica

Za svaku tablicu iz `Krug SQL / Schema Plan v1.1` navodim: kvalificirani SELECT/INSERT/UPDATE/DELETE pristup, što ide čistim RLS-om, što kroz service-role / controlled mutation path, i ključni rizik krivog modeliranja. Strukturni opisi (kolone, ključevi, indeksi, enumi, constraint-i) — vidi v1.1 schema plan.

### 2.1 `krug`

- **SELECT** — owner i aktivni članovi Kruga, plus identiteti koje Access Matrix v1.3 izričito navodi. Bivši članovi/owneri ne vide red osim ako Access Matrix to izričito dopušta (trenutno ne).
- **INSERT** — service layer. Kreiranje Kruga nikad nije čisti client INSERT jer mora atomarno otvoriti i ownership red i (ovisno o presetu) inicijalno članstvo.
- **UPDATE** — vrlo uska RLS dozvola na bezopasna polja koja Access Matrix v1.3 dopušta owneru. Sve što dira lifecycle ili preset — zabranjeno na RLS razini, ide isključivo kroz service layer.
- **DELETE** — nikad direktan client. Brisanje prolazi kroz Post-Delete Behavior Foundation Patch v1.1 orchestrator.
- **Čisti RLS pokriva:** vidljivost i blokadu pisanja po preset/lifecycle.
- **Service-role / controlled path:** kreiranje, lifecycle promjene, brisanje.
- **Rizik krivog modeliranja:** preširok UPDATE → klijent mijenja preset ili lifecycle direktno i ruši cijeli state machine i preset invariante.

### 2.2 `krug_ownership`

Read sloj se mora razdvojiti na dvije razine vidljivosti.

- **SELECT — relationship vidljivost (tko je owner):**
  - Owner vidi vlastite redove (aktivne i povijesne).
  - Aktivni članovi Kruga vide **identitet trenutnog ownera** kao relationship činjenicu (jedan aktivan red po Krugu); ovo je dio transparentnosti propisane Access Matrix v1.3.
  - Bivši owneri vide vlastite povijesne redove.
  - Bivši članovi i neutralni korisnici — ne vide ništa.
- **SELECT — billing / billing-kontekstualni detalji vezani uz ownership red:**
  - Steady-state: vidi **isključivo owner**.
  - Tranzicijski (continuity prozor, takeover, post-delete handover): vidi owner i, kad spec to izričito dodjeljuje, **spec-dodijeljeni punopravni član u tom konkretnom kontekstu** (`Takeover Conditions Spec v1.1`, Continuity & Billing State Machine v1.3.2).
  - Ostali aktivni članovi **ne** dobivaju billing detalje samo zato što su članovi.
  - Praktično: ako schema čuva billing-vezane atribute na ownership redu, ti atributi moraju biti enforceani odvojeno od relationship vidljivosti — bilo razdvajanjem kolona u zaseban read path, bilo service-layer projekcijom (vidi §3.7). RLS sam ne smije izložiti billing detalje samo na temelju aktivnog članstva.
- **INSERT** — isključivo service layer. Novi ownership red nastaje samo iz: (a) kreiranja Kruga, (b) takeover orchestracije pod uvjetima `Takeover Conditions Spec v1.1`.
- **UPDATE** — isključivo service layer. Zatvaranje ownership reda smije samo orchestrator (lifecycle / continuity / takeover / post-delete).
- **DELETE** — zabranjeno svima osim service-role; u normalnom toku se ne koristi (ownership se zatvara, ne briše).
- **Čisti RLS pokriva:** relationship read scoping, zabranu billing reada za ne-ovlaštene članove, potpunu zabranu client write-a.
- **Service-role / controlled path:** sve mutacije; izlaganje billing detalja kroz kontroliranu projekciju.
- **Rizik krivog modeliranja:** (a) ako klijent može direktno pisati u ownership red, ruši se invariant "jedan aktivan owner" i otvara ilegalni put do takeovera bez governance provjere; (b) ako SELECT politika izloži billing detalje cijelom članstvu, leakaju se billing podaci izvan ovlaštenog kruga i to je u izravnom konfliktu s Access Matrix v1.3.

### 2.3 `krug_membership`

- **SELECT** — owner Kruga i svi aktivni članovi (međusobna vidljivost po Access Matrix v1.3). Pojedinac uvijek vidi vlastite member redove kroz život Kruga.
- **INSERT** — service layer. Dodavanje člana mora poštivati `Preset Constraint Matrix v1` i `Governance Matrix v1.3`.
- **UPDATE** — service layer. Promjena statusa (punopravni/obični) je governance odluka, ne client write.
- **DELETE** — isključivo service layer (izlazak, izbacivanje, post-delete cascade).
- **Čisti RLS pokriva:** read scoping i zabranu client write-a na status.
- **Service-role / controlled path:** sve mutacije, posebno promjena statusa.
- **Rizik krivog modeliranja:** ako bilo koji član može mijenjati status direktno, obični član se sam unaprijedi u punopravnog i zaobiđe cijeli Governance Matrix v1.3. Najopasnija pojedinačna RLS pogreška u modelu.

### 2.4 `krug_shared_payment_source`

- **SELECT** — owner Kruga i aktivni članovi (vidljivost da Krug ima link na izvor). Neovisno o tome, **pristup samom izvoru plaćanja** i dalje strogo ide kroz postojeći `payment_source_members` sloj — ovaj red nije prečica do podataka izvora.
- **INSERT** — service layer. Linkanje mora paralelno provjeriti da je inicijator vlasnik izvora i punopravni član Kruga (kombinirani uvjet, ne samo RLS).
- **UPDATE** — minimalno; praktički ne postoji legitiman client UPDATE.
- **DELETE** — zabranjeno klijentu. Unlink ide kroz service (logičko zatvaranje, ne fizičko brisanje), zbog Post-Delete Behavior Foundation Patch v1.1 i continuity konzistencije.
- **Čisti RLS pokriva:** read scoping i zabranu client write/delete.
- **Service-role / controlled path:** link, unlink, post-delete cascade.
- **Rizik krivog modeliranja:** ako se ovaj red tretira kao "dovoljan dokaz pristupa izvoru", zaobilazi se `payment_source_members` i nastaje horizontalni leak preko Kruga. Pravilo: link daje *kontekst*, `payment_source_members` daje *pristup*.

### 2.5 `krug_continuity_window` (C/E boundary)

- **SELECT** — owner i aktivni članovi Kruga (transparentnost continuity stanja prema Access Matrix v1.3). Povijesni prozori dio su te vidljivosti. Billing-kontekstualna prava koja proizlaze iz otvorenog prozora ne pripadaju ovoj tablici — vidi 2.2.
- **INSERT** — isključivo service layer (Blok E orchestrator). Ne postoji legitiman client put za otvaranje.
- **UPDATE** — isključivo service layer. Zatvaranje prozora popunjava samo Continuity & Billing State Machine v1.3.2 ili Takeover orchestracija.
- **DELETE** — zabranjeno u normalnom toku.
- **Čisti RLS pokriva:** read scoping i potpunu zabranu client write-a.
- **Service-role / controlled path:** sve mutacije.
- **Rizik krivog modeliranja:** klijent koji može otvarati/zatvarati prozor desinkronizira lifecycle i continuity → kriva takeover i billing odluka.

---

## 3. Cross-table invariants

Pravila koja **strukturno** ne stanu u policy nad jednom tablicom. Za svako: je li RLS dovoljan, treba li trigger, treba li service-layer orchestrator. Strukturne mehanike (npr. partial unique) — vidi v1.1 schema plan.

### 3.1 Jedan aktivan owner po Krugu
- RLS sam: nedovoljan (RLS ne čuva jedinstvenost).
- Trigger: nije potreban dodatno ako schema već nosi partial unique.
- Service layer: obavezan za atomarnu orchestraciju "end stari + start novi" (takeover, post-delete handover).

### 3.2 Obični član nema governance prava
- RLS sam: nedovoljan — sprječava direktan write u governance polja, ali ne pokriva semantičke radnje (npr. inicijaciju takeovera) koje su uvijek service pozivi.
- Trigger: nije pravo mjesto za governance pravila.
- Service layer: obavezan. Svaka governance radnja provjerava status = punopravni prije izvršenja, neovisno o RLS-u.

### 3.3 Ownership i lifecycle moraju biti usklađeni
- RLS sam: nedovoljan.
- Trigger: moguć kao dodatna zaštitna ograda (invariant guard na write).
- Service layer: primarno mjesto — orchestrator mijenja lifecycle i ownership u istoj transakciji.

### 3.4 Continuity window i lifecycle state moraju biti konzistentni
- RLS sam: nedovoljan.
- Trigger: preporučen kao invariant guard nakon Bloka E.
- Service layer: primarno mjesto — sve tranzicije idu kroz Continuity & Billing State Machine v1.3.2.

### 3.5 Link na shared payment source ne smije zaobići `payment_source_members`
- RLS sam: nedovoljan ako bi se gradio query "preko Kruga" do izvora. Pristup izvoru i dalje ovisi isključivo o `payment_source_members`.
- Trigger: nije potreban (pitanje je *čitanja* izvora, ne pisanja u Krug tablice).
- Service layer: obavezan za link (paralelna provjera vlasništva nad izvorom + punopravnog članstva).
- Read sloj nad izvorom: ostaje na postojećoj `payment_source_members` politici; Krug joj ništa ne dodaje.

### 3.6 Preset je immutable
- RLS: dio rješenja — UPDATE mora isključiti preset za sve osim service-role.
- Trigger: preporučen kao dodatna ograda.
- Service layer: ne dira preset nakon kreiranja.

### 3.7 Billing/ownership read razdvajanje
- Invariant: aktivno članstvo daje pravo na **relationship** činjenicu (tko je owner), ali ne i na **billing detalje** ownership reda. Billing detalje vidi owner; u tranziciji — owner ili spec-dodijeljeni punopravni član u relevantnom kontekstu.
- RLS sam: dovoljan samo ako se billing-vezani atributi mogu jasno izolirati u read pathu (npr. razdvojena projekcija/pogled, ili politika koja billing kolone vraća samo ovlaštenim identitetima). Inače je RLS nedovoljan kao jedina obrana.
- Trigger: nije primjenjiv (read sloj).
- Service layer: obavezan kao kanonski read path za billing detalje; klijent ne smije izvlačiti billing kolone iz generičkog ownership SELECT-a.

---

## 4. GRANT matrica na visokoj razini

Bez konkretnog SQL-a, ali jasno tko što dobiva.

- **`anon`** — ništa. Nijedna `krug_*` tablica nije javna.
- **`authenticated`** — SELECT na `krug_*` tablice (filtriran RLS-om, uz razdvajanje relationship vs billing read-a iz §2.2 i §3.7). Vrlo uski UPDATE na `krug` (samo bezopasna polja koja Access Matrix v1.3 dopušta owneru); inače bez direktnog INSERT/UPDATE/DELETE. Read-heavy rola.
- **`service_role`** — pun pristup. Sve mutacije s cross-row/cross-table posljedicom idu ovim putem (kreiranje Kruga, ownership tranzicije, membership status, link/unlink shared sourcea, continuity window open/close, lifecycle tranzicije, post-delete cascade), kao i kanonski read path za billing detalje gdje je potreban.

**Operacije koje nikad ne bi smjele biti direktan client write:**
- Otvaranje ili zatvaranje ownership reda.
- Promjena member statusa.
- Otvaranje ili zatvaranje continuity prozora.
- Promjena lifecycle state ili preset.
- Brisanje bilo kojeg `krug_*` reda.
- Link ili unlink shared payment source.

---

## 5. Najopasnija mjesta

1. **Member status kao client-writable polje** — obični član se sam unaprijedi u punopravnog → ruši Governance Matrix v1.3, Preset Constraint Matrix v1 i Takeover Conditions Spec v1.1.
2. **Ownership direktno pisan iz klijenta** — INSERT (lažni owner) ili UPDATE zatvaranja (samonametnuti takeover put) → zaobilazi cijeli takeover spec.
3. **Lifecycle ili preset u client UPDATE-u** — ruši state machine i preset invariante. Preset posebno: cijeli Preset Constraint Matrix v1 pretpostavlja immutability.
4. **Continuity prozor pisan izvan orchestratora** — desinkronizacija s lifecycleom → kriva takeover/billing odluka.
5. **Shared source link kao prečica do izvora** — zaobilazi `payment_source_members` i pravi horizontalni leak preko Kruga. Pravilo: link daje kontekst, ne pristup.
6. **Billing detalji ownership reda izloženi cijelom članstvu** — direktan konflikt s Access Matrix v1.3. Aktivno članstvo daje vidljivost *tko* je owner, ne i *billing pozadinu* tog ownershipa. Ako SELECT politika ne razdvaja te dvije razine, billing leaka i tranzicijska prava postaju iluzorna.
7. **SELECT politike koje "cure" preko membershipa** — npr. SELECT na ownership bez provjere da je `auth.uid()` aktivan član/owner baš tog Kruga → vlasništvo tuđih Krugova postaje vidljivo.
8. **Recikliranje SELECT USING kao UPDATE/DELETE USING** — najčešća RLS greška; mora se izričito izbjeći.
9. **Zaboravljeni GRANT-ovi** — bez eksplicitnih GRANT-ova PostgREST vraća permission error; preširoki GRANT na `anon` razbija read scoping.

---

## 6. Što ovaj dokument svjesno NE odlučuje

- Konkretan SQL policy kod (`CREATE POLICY`, `USING`, `WITH CHECK`).
- Konkretne RPC potpise i tijela orchestratora.
- UI flow za bilo koju radnju.
- Rollout plan (faze, okoliši, backfill).
- Transakcijsku semantiku Bloka D.
- Blok E orchestratore — koristi se samo *ime* kao referenca.
- Triggere kao gotov kod — samo *gdje su preporučeni* kao zaštitna ograda.
- Bilo koji dio sheme koji već živi u `Krug SQL / Schema Plan v1.1` (kolone, ključevi, indeksi, enumi, constraint-i).

---

## 7. Zaključak

1. Enforcement model za v1.1 tablice je sada dovoljno jasan: zna se što ide RLS-om, što service layerom, gdje su triggeri zaštitna ograda, kako izgleda GRANT matrica na visokoj razini, koja su mjesta najopasnija, i kako se razdvaja relationship od billing vidljivosti na ownership sloju.

2. Najbolji sljedeći dokument: **`Krug Governance / Mutation Path Plan v1`**. §2 i §3 kontinuirano upiru u service-layer mutation path kao mjesto gdje žive sve netrivijalne radnje (ownership tranzicije, member status, lifecycle, continuity, link/unlink, billing read path). Prije Bloka D ili konkretnog API/SQL rada treba zatvoriti koje su to mutation paths, tko ih smije pozvati, koje preduvjete provjeravaju i koje invariante atomarno čuvaju — i dalje strateški, bez RPC potpisa. `Krug Transaction Semantics Schema Plan v1` i `Krug API / Service Boundary Plan v1` dolaze prirodno nakon toga.
