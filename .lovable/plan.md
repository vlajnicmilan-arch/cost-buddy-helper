# Krug SQL / Schema Plan v1

Strateški dokument. Prevodi zaključeni domenski model u konkretan oblik **tablica, kolona, ključeva, enuma i constraint-a** za Krug ekosistem.

Bez:
- migracijskih koraka (DDL skripta, `ALTER`, `DROP`, `RENAME`)
- backfill / data migration plana
- rollout plana po okolišima (dev/stage/prod)
- koda (RPC tijela, edge funkcije, klijent)
- novih preseta, novih stanja, novog scope-a

Polazi striktno od zaključenog seta:
`Krug Foundation v4.2`, `Preset Constraint Matrix v1`, `Governance Matrix v1.3`, `Continuity & Billing State Machine v1.3.2`, `Takeover Conditions Spec v1.1`, `Krug Domain/Data Model v1.1`, `Post-Delete Behavior Foundation Patch v1.1`, `Shared Resources Link — Structural Choice v1.1`, `Krug Access Matrix v1.3`, `Reuse / Refactor / Rebuild Plan v1`, `Krug Implementation Order v1.1`, `Krug Naming & Migration Strategy v1.1`.

Konvencija: imena su domenska (`krug_*`). Persistence rename iz `family_*` u `krug_*` nije dio ovog dokumenta — to pokriva Naming & Migration Strategy.

---

## 1. Opseg sheme

Schema Plan v1 pokriva isključivo Blokove A–C iz Implementation Order v1.1:

- **Blok A — Core Krug** (Krug, KrugOwnership, KrugMembership)
- **Blok B — Resource Link sloj** (Krug ↔ resursi, prema Structural Choice v1.1)
- **Blok C — Lifecycle & Continuity** (lifecycle stanja, continuity window, billing veza)

Blokovi D–I (governance, takeover, post-delete operativni sloj, transakcijska semantika, access enforcement, audit, telemetry) **nisu** dio v1 sheme — dobit će vlastite Schema Plan dokumente (`v2`, `v3`, …) u koraku s Implementation Order.

Zašto: foundationi koje su ti blokovi ovise (npr. KrugProposal/KrugConsent, takeover events, post-delete artefakti) imaju vlastite osi koje će lakše sjesti kad Blok A–C bude čvrst.

---

## 2. Enumi (zaključani)

Svi enumi su domenski zatvoreni — bez "ostalo" / "tbd". Šire se samo kroz novu verziju foundationa, ne kroz ad-hoc dodavanje.

### 2.1 `krug_preset`

- `spouse_partner`
- `coparent`
- `roommate`

Preset Constraint Matrix v1 je izvor istine. Preset je **immutable** nakon kreiranja Kruga (Foundation v4.2).

### 2.2 `krug_lifecycle_state`

- `active`
- `early_signal`
- `ugrozen`
- `continuity_window`
- `read_only`
- `deleted`

Bez `grace`. Continuity & Billing State Machine v1.3.2 je izvor istine.

### 2.3 `krug_member_status`

- `punopravni`
- `obicni`

Ne uključuje `owner`. Ownership je zaseban sloj (vidi §3.2).

### 2.4 `krug_ownership_event_type` (rezervirano za Blok B/C-završetak)

Vrijednosti se zatvaraju u Schema Plan v2 zajedno s governance/takeover blokom. Spomenuto ovdje samo zato da rezervacija imena bude transparentna i da se izbjegne kasniji konflikt.

### 2.5 Privacy / shared_status na transakcijama

**Ne uvodi se u Schema Plan v1.** Pripada Bloku D (transakcijska semantika). Zaključane vrijednosti (`private` / `personal` / `shared`) već su dokumentirane u Domain Model v1.1 i Naming & Migration Strategy v1.1, ali same kolone (`krug_id`, `privacy`, `shared_status`) ulaze tek u Schema Plan koji prati Blok D.

---

## 3. Tablice — Blok A (Core Krug)

### 3.1 `krug`

Jedan red = jedan Krug.

| polje | tip | obavezno | napomena |
|---|---|---|---|
| `id` | UUID PK | da | |
| `preset` | `krug_preset` | da | immutable nakon insert-a |
| `name` | text | da | display ime; nije identifikator |
| `lifecycle_state` | `krug_lifecycle_state` | da | default `active` |
| `created_at` | timestamptz | da | |
| `updated_at` | timestamptz | da | |

Constraint-i (deklarativna razina, bez implementacije):
- `preset` mora biti postavljen pri insert-u i ne smije se mijenjati nakon toga (immutability se osigurava na write-path razini, ne kroz CHECK ovisan o vremenu).
- `lifecycle_state` tranzicije su validirane van DB CHECK-a (state machine je u domenskom sloju; CHECK ne može opisati legalni graf tranzicija).

Što tablica **ne** sadrži:
- ne sadrži `owner_user_id` — ownership ide kroz `krug_ownership` (§3.2).
- ne sadrži billing podatke — billing veza je zaseban entitet u Bloku C (§5).
- ne sadrži članove — članstvo je `krug_membership` (§3.3).
- ne sadrži resurse — link je u Bloku B (§4).

### 3.2 `krug_ownership`

Ownership je **zaseban sloj**, ne polje na Krugu i ne uloga na članu. Razlog: Foundation v4.2 + Access Matrix v1.3 traže da owner može biti samo jedan u jednom trenutku, da se može mijenjati kroz takeover/continuity, i da je owner povijesno auditabilan (tko je bio owner u kojem prozoru). Kolona na `krug` ne bi pokrila povijest, a uloga na `krug_membership` bi miješala ownership s membershipom (eksplicitno odbijeno u v1.1 ispravkama).

| polje | tip | obavezno | napomena |
|---|---|---|---|
| `id` | UUID PK | da | |
| `krug_id` | UUID FK → `krug.id` | da | |
| `user_id` | UUID | da | referenca na auth user (kroz profiles sloj, prema project konvenciji) |
| `started_at` | timestamptz | da | početak ownership prozora |
| `ended_at` | timestamptz | ne | NULL = trenutni owner |
| `ended_reason` | text/enum (rezervirano) | ne | popunjava se u Bloku C/D (takeover, continuity ishod, brisanje) |
| `created_at` | timestamptz | da | |

Constraint-i:
- **Najviše jedan aktivan owner po Krugu**: jedinstvenost po `krug_id` gdje `ended_at IS NULL`. Implementira se partial unique index — bez `now()` u izrazu, pa je deterministički i restore-safe.
- Bez FK na `auth.users` (prema project konvenciji).
- `ended_at >= started_at` validira se kroz trigger, ne CHECK (jer su obje vrijednosti vremenske i pravilo se logički veže uz state machine).

Što tablica **ne** sadrži:
- ne sadrži permission flag-ove ownera — permissions su izvedene iz Access Matrix v1.3 na temelju postojanja aktivnog reda.
- ne sadrži takeover event detalje — to ide u zaseban takeover audit u Bloku C/D Schema Plana.

### 3.3 `krug_membership`

Članstvo u Krugu. **Owner ne mora biti redak ovdje** (ownership je posve odvojen sloj); ako proizvod kasnije odluči da owner _također_ ima membership red radi UI-ja, to je domenska odluka koja se rješava van schema planiranja v1.

| polje | tip | obavezno | napomena |
|---|---|---|---|
| `id` | UUID PK | da | |
| `krug_id` | UUID FK → `krug.id` | da | |
| `user_id` | UUID | da | |
| `status` | `krug_member_status` | da | `punopravni` ili `obicni` |
| `joined_at` | timestamptz | da | |
| `left_at` | timestamptz | ne | NULL = aktivan član |
| `created_at` | timestamptz | da | |
| `updated_at` | timestamptz | da | |

Constraint-i:
- **Jedan aktivan member redak po (`krug_id`, `user_id`)**: partial unique gdje `left_at IS NULL`.
- `status` tranzicije (`obicni` ↔ `punopravni`) idu kroz governance (Blok D); DB ne validira tranziciju.
- Brojevni limiti članova (ako ih preset nameće) **ne** ulaze u CHECK; rješavaju se u governance sloju jer ovise o presetu i kontekstu.

Što tablica **ne** sadrži:
- bez polja `role` u smislu owner/admin — ownership je u §3.2.
- bez split/proportional split podataka — to je vlasništvo Family Proportional Split feature seta i, ako se zadrži, integrira se kroz vlastiti sloj, ne kroz `krug_membership`.

---

## 4. Tablice — Blok B (Resource Link sloj)

Polazi strogo od `Shared Resources Link — Structural Choice v1.1`: **per-resource link tablice**, ne generic many-to-many.

v1 sheme pokriva resurs koji već ima zaključanu strukturu u postojećem modelu — **payment sources**. Ostali resursi (budgets, projects, goals, …) dobivaju vlastite link tablice u kasnijim Schema Plan verzijama, jednom kad njihova interna semantika sjedne u Krug kontekst (Implementation Order v1.1 Blokovi B-ostatak).

### 4.1 `krug_shared_payment_source`

| polje | tip | obavezno | napomena |
|---|---|---|---|
| `id` | UUID PK | da | |
| `krug_id` | UUID FK → `krug.id` | da | |
| `payment_source_id` | UUID FK → existing payment source entitet | da | |
| `linked_at` | timestamptz | da | |
| `linked_by_user_id` | UUID | da | tko je dodao link (audit) |
| `unlinked_at` | timestamptz | ne | NULL = aktivan link |

Constraint-i:
- **Najviše jedan aktivan link po (`krug_id`, `payment_source_id`)**: partial unique gdje `unlinked_at IS NULL`.
- Resource → `payment_source_members` sloj **ostaje netaknut**. Ovaj link sloj samo dodaje Krug kontekst; access na sam izvor i dalje ide kroz `payment_source_members` (potvrđeno u Naming & Migration Strategy v1.1).

Što tablica **ne** sadrži:
- bez per-člana permission flag-ova — pristup ide kroz postojeći resource-level sloj (`payment_source_members`).
- bez audit/event lanca — audit je u Bloku D Schema Plana.

Sinkronizacija s `payment_source_members` (auto-`limited` trigger, manualni uplift na `full`) **ostaje na postojećem mjestu**, ne miče se u Krug sloj. Schema Plan v1 samo dokumentira da je to ugovor između dvaju slojeva i da se ne duplicira u Krug link sloju.

---

## 5. Tablice — Blok C (Lifecycle & Continuity, minimalni set)

Lifecycle stanje samog Kruga već živi u `krug.lifecycle_state` (§3.1). Blok C u v1 dodaje **samo** ono što je nužno da state machine ima persistirano trajanje continuity prozora i vezu prema billing-u, bez koje lifecycle ne može operirati.

### 5.1 `krug_continuity_window`

Postoji isključivo kad je Krug u stanju `continuity_window`. Jedan aktivan red po Krugu.

| polje | tip | obavezno | napomena |
|---|---|---|---|
| `id` | UUID PK | da | |
| `krug_id` | UUID FK → `krug.id` | da | |
| `opened_at` | timestamptz | da | |
| `expires_at` | timestamptz | da | trajanje prema State Machine v1.3.2 |
| `closed_at` | timestamptz | ne | NULL = prozor traje |
| `closed_reason` | text/enum (rezervirano u Bloku C-completion) | ne | npr. takeover, expiry, manual resolve |

Constraint-i:
- **Najviše jedan aktivan continuity_window po Krugu**: partial unique gdje `closed_at IS NULL`.
- `expires_at > opened_at` validira se kroz trigger (ne CHECK).
- Veza s `krug.lifecycle_state = continuity_window` osigurava se na write-path razini (state machine), ne kroz cross-row CHECK.

### 5.2 Billing veza

`Continuity & Billing State Machine v1.3.2` zahtijeva da se zna **subscription/billing entitet** koji drži Krug. Schema Plan v1 ovdje **ne** uvodi novu billing tablicu — projekt već ima billing/subscription sloj (Stripe + module access model).

Što v1 zaključava:
- Krug se veže na billing kroz **postojeći subscription entitet**, ne kroz novu `krug_billing` tablicu.
- Veza je 1:1 prema vlasniku (owner — `krug_ownership.user_id` aktivnog reda) i izvedena, ne pohranjena na `krug`. Razlog: vlasnik se može mijenjati (takeover/continuity), pa duplicirati subscription_id na `krug` znači stalni sync rizik.
- Ako se pokaže potreba za pohranjenom referencom (npr. zbog performansa ili audita), uvodi se u Schema Plan v2 kao zaseban materijaliziran view ili explicit veza s vlastitim invariantima — ne kao improvizirano polje.

---

## 6. Foreign keys, indeksi i integritet (sažeto)

- Sve FK reference unutar Krug sloja koriste `ON DELETE` semantiku **usklađenu s Post-Delete Behavior Foundation Patch v1.1**. Konkretno: brisanje Kruga ne smije nasumično `CASCADE` brisati resurse — pravila su per-artefakt. Praktično: FK od link sloja (§4.1) i continuity sloja (§5.1) prema `krug.id` mogu ići `ON DELETE CASCADE` jer su to čisto pomoćne tablice; FK prema vanjskim resursima (npr. `payment_source_id`) ne smije imati cascade koji bi obrisao resurs.
- Sve tablice imaju standardna polja `created_at` / `updated_at` osim onih gdje je life-cycle eksplicitno opisan parovima (`opened_at`/`closed_at`, `started_at`/`ended_at`).
- Partial unique indeksi (aktivni owner, aktivni member, aktivni link, aktivni continuity_window) su deterministički — bez `now()` u izrazu — kako bi ostali restore-safe (potvrđena konvencija projekta).
- RLS i GRANT-ovi: u skladu s project core pravilima (RLS na svim tablicama, GRANT-ovi u istoj migraciji). **Konkretne policies** nisu dio ovog Schema Plana — zatvaraju se u zasebnom `Krug RLS / Access Enforcement Plan` jer su izvedene iz Access Matrix v1.3 i nemaju smisla razdvojeno od enforcement sloja.

---

## 7. Što je svjesno **ostavljeno van** v1 sheme

Sve donje stavke imaju svoj zaključani domenski model, ali ulaze u Schema Plan v2/v3 jer ovise o blokovima izvan A–C:

1. **Transakcijska semantika** (`krug_id`, `privacy`, `shared_status` na transakcijama) — Blok D.
2. **Governance artefakti** (`krug_proposal`, `krug_consent`) — Blok D, Governance Matrix v1.3.
3. **Takeover events / audit** (uvjeti iz Takeover Conditions Spec v1.1) — Blok C-završetak / D.
4. **Post-delete operativni sloj** (artefakti koje Post-Delete Patch v1.1 zahtijeva da prežive brisanje Kruga, npr. denormalizirani snapshot bivših shared transakcija prije reklasifikacije u `personal`) — vlastiti Schema Plan kad se taj operativni sloj projektira do kraja.
5. **Resource link sloj za ostale resurse** (budgets, projects, goals, …) — per-resource, u istom obliku kao §4.1, ali tek kad svaki taj resurs domenski sjedne u Krug kontekst.
6. **Billing pohranjena referenca** na Krugu (ako se pokaže nužnom) — §5.2 obrazloženje.
7. **RLS policies i GRANT matrica** — zaseban Access Enforcement Plan.
8. **Indeksi za performans** (osim integritetskih partial unique-a) — tek nakon što write/read obrasci budu poznati iz implementacije.
9. **Persistence rename `family_*` → `krug_*`** — Naming & Migration Strategy v1.1 § (završni korak), ne ovaj dokument.

---

## 8. Što ovaj dokument **ne** mijenja u zaključanom modelu

- Ne uvodi `grace`.
- Ne uvodi `majority`.
- Ne uvodi nove presete.
- Ne tretira `owner` kao role na članu.
- Ne svodi privacy na `private/shared` (3 osi ostaju: `private` / `personal` / `shared`, ali izvan v1 sheme).
- Ne uvodi novi default za "transakcija bez `krug_id`".
- Ne otvara promjenu preseta kao governance tok.
- Ne uvodi `Family` kao aktivnog modela.

---

## 9. Zaključak

`Krug SQL / Schema Plan v1` pokriva Blokove A–C iz Implementation Order v1.1 na razini:
- enuma (`krug_preset`, `krug_lifecycle_state`, `krug_member_status`)
- tablica (`krug`, `krug_ownership`, `krug_membership`, `krug_shared_payment_source`, `krug_continuity_window`)
- integritetskih pravila (partial unique indeksi, FK semantika usklađena s post-delete patchom, trigger-based time validacija umjesto vremenskih CHECK-ova)

Sve dalje (governance, takeover, post-delete operativni sloj, transakcijska semantika, RLS) ima rezervirano mjesto i bit će pokriveno u sljedećim Schema Plan verzijama bez retroaktivne promjene v1 sheme.

Preporučeni sljedeći dokument: **`Krug RLS / Access Enforcement Plan v1`** — prevodi `Krug Access Matrix v1.3` u konkretna RLS pravila i GRANT matricu nad ovdje definiranim tablicama (Blok A–C), prije nego se otvori Blok D i transakcijska semantika.
