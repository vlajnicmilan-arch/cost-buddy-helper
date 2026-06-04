
# Krug Endpoint Contract Plan v1.1

Block F dokument. Definira konkretni skup klijent ↔ server endpointa koji implementiraju **API/Service Boundary v1.1** iznad **RLS Implementation v1.1** sloja, za sve Krug akte A1–A7 nad `expenses` redovima gdje `krug_id IS NOT NULL`.

Bez SQL-a, bez RPC potpisa, bez HTTP path stringova, bez TypeScript tipova, bez UI komponenti, bez naziva edge funkcija.

**Promjene v1.0 → v1.1 (samo usklađenja, bez novih ideja):**
- **E4 (A4 povlačenje) više nije autoriziran samo s H5.** Traži se **H5 ∧ H2** — author koji je istovremeno owner ili full member Kruga ("author s pravom pokretanja shared toka"), isti uvjet kao za E5. Ordinary član ne smije A4 ni nad vlastitim shared retkom.
- §4.2 redoslijed provjera i §5.2 specifikacija E4 eksplicitno razdvajaju "obični autor" od "autor s pravom pokretanja shared toka"; nova klasa ishoda `not_full_member` vrijedi i za E4.
- Tablice §3.2, §8 i zaključak ne ostavljaju dojam da svaki autor može A4 nad shared retkom.

---

## §1. Scope

Pokriva:
- Klasifikaciju i broj endpointa (read vs write)
- Mapiranje A1–A7 na endpointe (1 akt = 1 endpoint, atomski, per-row)
- Ugovor svakog endpointa: ulaz, izlaz, pre-uvjeti, post-uvjeti, klase grešaka
- Tko provjerava što (klijent vs server vs RLS), bez dupliciranja s drugim slojevima
- Granicu prema A6 system putu i prema ne-Krug retcima

Ne pokriva:
- SQL/RPC implementaciju, HTTP route stringove, transport (REST/RPC/edge), serijalizaciju
- UI, notifikacije, audit, rate-limit konfiguraciju
- Schema/Visibility/Mutation/Approval/RLS dizajn — to je već zaključano u Block A–E
- Bulk operacije i admin override

---

## §2. Principi

1. **1 akt = 1 endpoint.** A1, A2, A3, A4, A5, A7 svaki ima vlastiti namjenski write-endpoint. A6 nema klijentski endpoint (system path, vidi §6).
2. **Per-row atomicity.** Svaki write-endpoint djeluje na točno jedan `expenses` redak po pozivu. Nema bulk varijante u v1.
3. **Server je jedini izvor istine.** Endpoint izvodi RGA, scope-of-affected, "autor s pravom pokretanja shared toka" i tranzicijsku provjeru server-side. RLS je drugi pojas, ne primarni gate.
4. **Klijent ne smije pre-računavati autorizaciju kao final answer.** Smije samo gate-ati UI prema vlastitoj projekciji vidljivosti; konačni verdikt daje endpoint.
5. **Idempotentnost = no-op + jasna klasa ishoda.** Ako je akt već primijenjen (npr. A1 nad već `potvrđena`), endpoint ne radi pisanje i vraća deterministički ishod (vidi §4.3).
6. **Tri autorizacijska kostura iz Approval v1.1 + RLS v1.1:**
   - **governance/RGA** kostur → E1, E2, E3, E7 (H4 + H3)
   - **shared-flow author** kostur → **E4, E5** (H4 + H5 + H2) — autor koji je owner/full član Kruga; A4 i A5 dijele isti autorizacijski test
   - **plain author** kostur → samo E-edit (H4 + H5); pokriva edit ne-tranzicijskih polja vlastitog `predložena` retka
7. **Read i write su strogo razdvojeni.** Read-endpointi nikad ne mijenjaju stanje, nikad ne troše governance kvotu.

---

## §3. Klasifikacija endpointa

### §3.1 Read endpointi

Jedan endpoint za listanje/dohvat `expenses` redova vidljivih korisniku, prema Visibility v1.1. Već postoji kao dio općeg dohvata (`expenses` SELECT preko RLS). Ovaj plan ne uvodi novi read-endpoint specifičan za Krug — vidljivost je svojstvo zajedničkog SELECT-a.

Read se NIKAD ne troši kao governance ili shared-flow akt. Read ne implicira RGA niti pravo pokretanja shared toka.

### §3.2 Write endpointi

Točno **6 namjenskih write-endpointa** za Krug akte:

| Endpoint | Akt | Autorizacijski kostur | Tranzicija |
|---|---|---|---|
| E1 | A1 potvrda | governance/RGA (H4 + H3) | `shared`/`predložena` → `shared`/`potvrđena` |
| E2 | A2 veto | governance/RGA (H4 + H3) | `shared`/`predložena` → `shared`/`nepotvrđena` |
| E3 | A3 opoziv potvrde | governance/RGA (H4 + H3) | `shared`/`potvrđena` → `shared`/`nepotvrđena` |
| **E4** | **A4 povlačenje** | **shared-flow author (H4 + H5 + H2)** | DELETE retka (uvjetovano statusom) |
| E5 | A5 ponovno pokretanje | shared-flow author (H4 + H5 + H2) | `shared`/`nepotvrđena` → `shared`/`predložena` |
| E7 | A7 governance → personal | governance/RGA (H4 + H3) | `shared`/* → `personal`/NULL |

A6 (48h expiry) NIJE klijentski endpoint — system path (§6).

E4 i E5 koriste **isti** autorizacijski test (H5 ∧ H2). Razlika je samo u operaciji i tranzicijskom preduvjetu. Ordinary član NIKAD ne smije pokrenuti A4, čak ni nad vlastitim shared retkom (npr. historijski/migracijski edge-case kad je redak nastao prije nego što je član sveden na ordinary).

Generički "patch redak" endpoint je **zabranjen** za sva polja koja sudjeluju u Krug tranziciji (`krug_privacy`, `krug_shared_status`, `krug_id`). Field-edit ne-tranzicijskih polja na vlastitom `predložena` retku pokriva zaseban plain-author endpoint **E-edit** (§5.3).

---

## §4. Zajednički ugovor svakog write-endpointa

### §4.1 Ulaz (semantički)

Svaki write-endpoint prima točno:
- identitet aktera (iz auth sloja, ne iz tijela zahtjeva)
- identifikator ciljnog retka (jedan)
- opcionalni idempotency marker (string koji klijent generira; server ga može koristiti za dedup, vidi §4.4)

Endpoint NE prima:
- novo stanje (`status`, `privacy`) — to je implicitno iz tipa akta
- listu redaka
- ime akta kao parametar (svaki endpoint je već vezan za točno jedan akt)

E-edit (§5.3) dodatno prima patch ne-tranzicijskih polja.

### §4.2 Server provjere (redoslijed)

Svaki write-endpoint mora izvesti, atomski, ovim redoslijedom:

1. **Autentikacija** — `auth.uid()` postoji; inače `unauthenticated`.
2. **Postojanje retka** — redak postoji i nije soft-deleted; inače `not_found`.
3. **Vidljivost (H4)** — Visibility v1.1; inače `not_found` (ne otkrivati postojanje).
4. **Autorizacija po kosturu akta:**
   - **governance endpointi (E1, E2, E3, E7):** RGA za taj redak (H3). Ako je samo full/owner ali nije scope-of-affected → `not_in_scope`. Ako nije ni full/owner → `not_authorized_member`.
   - **shared-flow author endpointi (E4, E5):** dva uvjeta, oba obavezna, provjeravaju se ovim redoslijedom:
     - 4a. **autor retka (H5)** — inače `not_author`
     - 4b. **owner ili full član Kruga (H2)** — inače `not_full_member`
     Ordinary autor (H5 prolazi, H2 pada) NE smije A4 niti A5. Ovo je eksplicitno: "autor s pravom pokretanja shared toka".
   - **plain author endpoint (E-edit):** autor retka (H5). Inače `not_author`. H2 se NE provjerava (edit ne-tranzicijskih polja ne zahtijeva pravo pokretanja shared toka).
5. **Tranzicijski preduvjet** — OLD stanje retka odgovara tranziciji koju akt pokriva (vidi tablicu §3.2). Inače `wrong_state`.
6. **Schema invarijante v1.3** — provjeriti da NEW ne krši `krug_shared_status IS NULL ⇔ krug_privacy ∈ {private, personal}`. Inače `invariant_violation` (internal; ne smije se dogoditi za pravilno dizajniran endpoint).
7. **Pisanje** — jedan UPDATE/DELETE, unutar transakcije, oslanjajući se na RLS kao drugi pojas. Ako RLS odbije unatoč svemu, mapirati u odgovarajuću grešku.

Koraci 4–7 moraju biti u istoj transakciji; nikakvo dvofazno čitanje + pisanje izvan transakcije.

### §4.3 Izlaz (semantičke klase ishoda)

Svaki write-endpoint vraća jedan od sljedećih ishoda. Točan transport (HTTP status, polje s kodom) ostavljen sljedećem dokumentu, ali skup klasa je fiksiran:

- **applied** — akt je upravo izvršen, redak je u novom stanju.
- **noop_already_in_target_state** — redak je već u ciljnom stanju (npr. A1 nad `potvrđena`, A2 nad `nepotvrđena`). Server ne piše. Ovo nije greška.
- **noop_idempotent_replay** — identičan zahtjev s istim idempotency markerom je već primijenjen (vidi §4.4). Vraća isti ishod kao izvorni.
- **wrong_state** — redak je u stanju iz kojeg ovaj akt nije moguć (npr. A1 nad `nepotvrđena`, A5 nad `potvrđena`).
- **not_found** — redak ne postoji ili nije vidljiv akteru.
- **not_authorized_member** — akter nema potrebnu razinu članstva (governance: nije full/owner ali jest u Krugu).
- **not_in_scope** — akter je full/owner ali nije financijski pogođen za taj redak (samo governance endpointi).
- **not_author** — akter nije autor retka (shared-flow author i plain author endpointi).
- **not_full_member** — akter je autor retka ali nije owner/full član Kruga; ne smije pokrenuti A4 ni A5 (vrijedi za **E4 i E5**).
- **unauthenticated** — nema `auth.uid()`.
- **invariant_violation** — interna greška Schema v1.3; ne smije se dogoditi pri ispravnoj implementaciji.
- **conflict_concurrent** — RLS/transakcija odbila zbog konkurentne promjene OLD stanja između čitanja i pisanja; klijent može refetchati i pokušati ponovo.

Razlikovanje `not_authorized_member` vs `not_in_scope` (governance) i `not_author` vs `not_full_member` (shared-flow author) zahtjev je API Boundary v1.1 (§4.3.3) i mora se sačuvati u kontraktu endpointa, ne samo u logu. RLS samo emitira generičku 42501 — endpoint je taj koji razdvaja na temelju vlastite eksplicitne provjere u koraku §4.2.4.

### §4.4 Idempotentnost

Svaki write-endpoint je **idempotentan po prirodi akta** zbog `noop_already_in_target_state` ishoda (npr. A1 nad već potvrđenim retkom ne radi ništa).

Dodatno, klijent može poslati idempotency marker. Server smije, ali ne mora, držati kratkoročni dedup po (akter, redak, akt, marker) i vratiti **noop_idempotent_replay** za ponovne pokušaje. Trajanje i implementacija dedup-a su operativna stvar sljedećeg dokumenta; ovaj ugovor samo definira da klasa ishoda postoji.

Ovo NE zamjenjuje A6 (vremenski timeout prijedloga 48h) niti rate-limit za A5 — to su zasebni mehanizmi.

### §4.5 Što endpoint NE radi

Eksplicitno izvan ugovora:
- ne šalje notifikacije (zasebni sloj, već postoji)
- ne piše audit log (zasebni sloj)
- ne provjerava A6 48h prozor (system path, §6)
- ne provjerava rate-limit za A5 (operativna stvar, izvan ovog ugovora)
- ne radi cascade na druge tablice
- ne mijenja `krug_id` retka

---

## §5. Specifikacije po endpointu

### §5.1 Governance endpointi (E1, E2, E3, E7)

Svi koriste **istovjetan kostur** iz §4.2 (governance grana). Razlika je samo u tranzicijskoj matrici i tome je li OLD `predložena` (E1, E2), `potvrđena` (E3) ili bilo koji `shared` (E7 — `predložena`, `potvrđena` i `nepotvrđena` sva tri su valjana OLD za prijelaz na `personal`).

Specifični `noop_already_in_target_state` slučajevi:
- E1: redak već `shared`/`potvrđena`
- E2: redak već `shared`/`nepotvrđena` (bez obzira na razlog — A2 ili A6)
- E3: redak već `shared`/`nepotvrđena`
- E7: redak već `personal`/NULL

`wrong_state` slučajevi (primjeri):
- E1 nad `shared`/`nepotvrđena` → `wrong_state` (ne `noop`; A1 traži `predložena`)
- E3 nad `shared`/`predložena` → `wrong_state` (A3 nije za predloženi redak)
- E5 nikad nije isti endpoint kao E3 — to je striktno razdvojeno iz Approval v1.1 i RLS v1.1

Svi koriste **RGA autorizaciju** (full/owner + scope-of-affected). Razdvajanje `not_authorized_member` vs `not_in_scope` obavezno.

### §5.2 Shared-flow author endpointi (E4, E5)

E4 i E5 koriste **isti autorizacijski test**: H5 ∧ H2. Razlika je samo u operaciji i tranzicijskom preduvjetu. Ova simetrija je posljedica zaključanog pravila: A4 i A5 oba pripadaju shared toku i smije ih pokrenuti samo "author s pravom pokretanja shared toka" = autor + owner/full član.

**E4 (A4 povlačenje):**
- Operacija: DELETE retka
- Autorizacija (redoslijed):
  - 4a. autor retka (H5) — inače `not_author`
  - 4b. owner ili full član Kruga (H2) — inače **`not_full_member`**
- Tranzicijski preduvjet: `krug_shared_status ∈ {NULL, 'predložena', 'nepotvrđena'}`
- Banned: DELETE nad `shared`/`potvrđena` → `wrong_state`
- Banned: ordinary autor (H5 prolazi, H2 pada) → **`not_full_member`**, čak i nad vlastitim shared retkom u historijskom/migracijskom edge-caseu kad je redak nastao dok je autor još imao full status, a u međuvremenu je sveden na ordinary
- `noop_already_in_target_state` ovdje znači: redak je već nestao (autor ga je već povukao u drugom pokušaju) → vraća se isti ishod ako je idempotency marker prisutan i poznat, inače `not_found`

**E5 (A5 ponovno pokretanje):**
- Tranzicija: `shared`/`nepotvrđena` → `shared`/`predložena`
- Autorizacija: identično kao E4 (H5 ∧ H2)
- Ishodi:
  - autor koji NIJE owner/full → `not_full_member`
  - autor je owner/full ali redak je `shared`/`predložena` → `noop_already_in_target_state`
  - autor je owner/full ali redak je `shared`/`potvrđena` → `wrong_state`
- A5 ne pokreće 48h timer ovdje kao stvar endpointa — taj timer je posljedica činjenice da je redak ponovno u `predložena` stanju i automatski ga pokupi A6 system path (§6)

### §5.3 Plain-author endpoint (E-edit)

Pokriva edit ne-tranzicijskih polja vlastitog prijedloga (npr. opis, kategorija, iznos — preciznu listu polja definira Mutation v1.1 i Schema v1.3; ovdje samo pravilo).

- Autorizacija: H5 (autor). **H2 se NE provjerava** — edit ne-tranzicijskih polja vlastitog `predložena` retka nije pokretanje shared toka, već nastavak već pokrenutog toka.
- Tranzicijski preduvjet: `krug_shared_status = 'predložena'` (nije moguć edit nakon ijedne potvrde)
- Banned polja: `krug_privacy`, `krug_shared_status`, `krug_id`, `user_id`
- Ishodi: `applied` / `wrong_state` (npr. redak je već `potvrđena`/`nepotvrđena`) / `not_author` / `not_found` / `unauthenticated`. **Ne emitira `not_full_member`** jer ne traži H2.
- Ovaj endpoint NIJE governance — `not_in_scope` nije moguć ishod
- Dvije konkurentne izmjene (autor + RGA potvrda) razrješavaju se identično kao u RLS race-uvjetima (§7 RLS plana): tko prvi commita pobjeđuje, drugi dobiva `wrong_state` ili `conflict_concurrent`

Napomena o asimetriji E-edit vs E4: edit polja postojećeg `predložena` retka ne mijenja status i ne briše redak — autor koji je pao u ordinary može i dalje doraditi opis svog vlastitog otvorenog prijedloga, ali ne smije ga povući (E4) niti reaktivirati (E5). Tu liniju vuče Approval v1.1 i ovaj ugovor je ne mijenja.

### §5.4 Što NE postoji u v1

- bulk endpoint nad više redaka odjednom
- "smart" endpoint koji sam odlučuje koji akt izvesti na temelju OLD/NEW
- generički PATCH koji bi mogao izvesti tranziciju
- klijentski endpoint za A6
- endpoint koji bi spojio E4+E5 ili E3+E5
- endpoint koji bi omogućio RGA-i da direktno izvrši A5 nad tuđim prijedlogom (eksplicitno isključeno modelom v1.1)
- endpoint koji bi omogućio ordinary autoru A4 nad vlastitim shared retkom (eksplicitno isključeno v1.1)

---

## §6. A6 (48h expiry) — system path

A6 je sistemski akt, ne klijentski. Ugovor:

- Klijentski sloj nema endpoint koji izvodi A6.
- System worker (cron/scheduler/edge — implementacija ostavljena sljedećem dokumentu) periodički sken redaka u `shared`/`predložena` čiji je prijedlog stariji od 48h, i izvodi prijelaz u `shared`/`nepotvrđena` kroz service-role pisanje koje zaobilazi RLS.
- System worker ne smije proći kroz E2. E2 je klijentski endpoint s RGA provjerom; A6 nema RGA aktera.
- Korisnik je još uvijek vidljiv kao "prijedlog je istekao" jer redak ostaje u `shared`/`nepotvrđena` — autor (ako je owner/full) može pokrenuti E5 (A5) i vratiti ga u `predložena`. Ordinary autor ne može.

Iz perspektive ostalih endpointa, A6 izgleda kao "netko je u međuvremenu promijenio OLD stanje" i tretira se kao `noop_already_in_target_state` (za E2 — ishod je isti) ili `wrong_state` (za E1, E3 — preduvjet više ne vrijedi).

---

## §7. Ne-Krug retci (`krug_id IS NULL`)

Svi endpointi iz §3.2 i §5.3 strogo odbijaju ako `OLD.krug_id IS NULL`. To je `wrong_state` (akt nije primjenjiv na ne-Krug redak), ne `not_found`.

Edit ne-Krug retka ide kroz **postojeći generički expense endpoint koji ovaj plan ne dira**. Granica se osigurava strogim filtriranjem `krug_id IS NOT NULL` u koraku §4.2.2.

---

## §8. Tablica: tko što provjerava

| Provjera | Klijent | Endpoint (server) | RLS (drugi pojas) |
|---|---|---|---|
| Vidljivost (H4) | UI gate | da | da (USING) |
| Članstvo full/owner (H2) | UI gate | da (**E4, E5**) | da (E4, E5) |
| RGA = full/owner + scope (H3) | NE (samo UI hint) | da (governance E1/E2/E3/E7) | da (governance kanal) |
| Autor retka (H5) | UI gate | da (E4, E5, E-edit) | da (author kanal) |
| OLD stanje za tranziciju | NE | da | da (WITH CHECK) |
| Schema v1.3 invarijanta | NE | da | da (WITH CHECK) |
| `not_authorized_member` vs `not_in_scope` (governance) | NE | da | NE (RLS daje generički 42501) |
| `not_author` vs `not_full_member` (shared-flow author) | NE | da | NE (RLS daje generički 42501) |
| Idempotency marker dedup | klijent generira | opcionalno | NE |
| 48h timeout (A6) | NE | NE (klijentski endpointi) | NE (klijentski RLS) |
| Rate-limit za A5 | NE | da (operativno, izvan ugovora) | NE |
| Notifikacije, audit | NE | zasebni sloj | NE |

---

## §9. Otvorena pitanja (operativna, ne mijenjaju ugovor)

1. Transport: PostgREST RPC, edge function (Deno), ili kombinacija. Odluka ne mijenja semantiku endpointa.
2. Konkretni HTTP statusi / kodovi za svaku klasu ishoda iz §4.3.
3. TTL i pohrana za idempotency marker dedup.
4. Rate-limit konfiguracija za E5 (broj pokušaja po retku po vremenu).
5. Hoće li E1–E3 i E7 dijeliti istu serversku funkciju s parametrom akta (interna implementacija) ili biti potpuno odvojeni — ne utječe na ugovor, ali utječe na održavanje. Isto pitanje za E4 i E5 koji dijele autorizacijski test.
6. Format identifikatora ciljnog retka (uuid vs composite) i mjesta gdje se može mapirati `not_found`.

---

## §10. Zaključak

Ugovor pokriva sve klijentske operacije nad Krug retcima: 6 namjenskih write-endpointa (E1, E2, E3, E4, E5, E7) + 1 plain-author field-edit endpoint (E-edit), plus jedan system path (A6).

Tri autorizacijska kostura su strogo razdvojena:
- **governance/RGA** (E1, E2, E3, E7): full/owner + scope-of-affected
- **shared-flow author** (**E4, E5**): autor + owner/full član Kruga; ordinary autor NE smije ni A4 ni A5
- **plain author** (E-edit): autor; samo edit ne-tranzicijskih polja vlastitog `predložena` retka

Svaki write-endpoint je per-row, atomski, idempotentan na razini akta, vraća zatvoren skup semantičkih klasa ishoda (uključujući razdvojene `not_authorized_member` vs `not_in_scope` za governance i `not_author` vs `not_full_member` za shared-flow author).

Sljedeći dokument (Block G, prijedlog): **`Krug Transport & Error Mapping Plan v1`** — konkretni HTTP/RPC oblik i mapiranje klasa ishoda iz §4.3 u stvarne kodove i tijela odgovora, te dedup TTL za §4.4. Bez kontradikcije s ovim ugovorom.
