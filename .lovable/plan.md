# Krug Transaction Mutation Path Plan v1.1

Block D dokument. Zatvara **tko smije mijenjati transakcijski redak u Krug kontekstu i kako se semantika prevodi u tranziciju**. Polazi strogo od:

- `Krug Foundation v4.2`
- `Preset Constraint Matrix v1`
- `Governance Matrix v1.3`
- `Krug Transaction Semantics Schema Plan v1.3`
- `Krug Transaction RLS / Visibility Plan v1.1`

Bez novih presetova. Bez `Family`. Bez `majority`. Bez SQL koda, RPC potpisa, UI flow-a, rollout plana.

**Promjena u odnosu na v1**: zatvoreno je pitanje smije li ordinary member inicirati `personal → shared`. Odgovor je **ne**, i to je sada eksplicitno provedeno kroz §3, §5.3, §6, §7, §8, §9. Pojam `author` više nije sam po sebi dovoljan za pokretanje shared approval toka — uveden je pojam **author s pravom pokretanja shared toka** (= author koji je istovremeno owner ili full member).

---

## §1. Opseg

Definira mutaciju nad jednim transakcijskim retkom u Krug kontekstu:

- **create** — unos novog retka
- **field-edit** — promjena nesemantičkih polja (iznos, opis, datum, kategorija, izvor)
- **semantic-transition** — promjena `krug_privacy` ili `krug_shared_status`
- **hard-delete** — pokretanje post-delete pravila (`krug_id → NULL`, `shared → personal`, `krug_shared_status → NULL`)

Approval enforcement, billing, takeover, governance pravo iznad retka nisu scope.

---

## §2. Akteri

Iz Governance Matrix v1.3:

- **author** — korisnik koji je redak kreirao
- **owner** — vlasnik Kruga
- **full member** — član s punim pravima sudjelovanja (uključuje pravo pokretanja shared approval toka)
- **ordinary member** — vidi sve, **nema** governance prava, **nema** pravo prijedloga shared transakcija
- **non-member** — nema pristup

Izveden pojam koji se koristi u cijelom dokumentu:

> **author s pravom pokretanja shared toka** = author koji je istovremeno **owner ILI full member**.
>
> Ordinary member **nije** author s pravom pokretanja shared toka, ni nad vlastitim retkom. To je zaključano u Governance Matrix v1.3 i ovaj dokument se na to oslanja bez iznimke.

---

## §3. Create

### §3.1 Tko smije kreirati redak u Krug kontekstu

| Akter            | `private` | `personal` | `shared` |
|------------------|-----------|------------|----------|
| owner            | da        | da         | da       |
| full member      | da        | da         | da       |
| ordinary member  | da        | da         | **ne**   |
| non-member       | ne        | ne         | ne       |

Obrazloženje za ordinary `shared = ne`: kreiranje `shared` retka je ulazna točka u approval tok. Ordinary po Governance Matrix v1.3 nema pravo pokretanja tog toka, pa nema ni pravo kreirati `shared` redak — ni nad vlastitim niti nad bilo kojim drugim retkom.

### §3.2 Preset utjecaj na create

Preset **ne mijenja tko smije kreirati**. Preset utječe samo na vidljivost `personal` retka prema drugim full members (Visibility v1.1) i na governance pravila iznad `shared` retka (Governance Matrix v1.3).

### §3.3 Inicijalni `krug_shared_status`

- `private` → `krug_shared_status = NULL`
- `personal` → `krug_shared_status = NULL`
- `shared` → `krug_shared_status = predložena` (uvijek)

Direktan create u `potvrđena` ili `nepotvrđena` je nevaljana mutacija.

---

## §4. Field-edit (nesemantička polja)

### §4.1 `private`

- samo **author** smije editirati

### §4.2 `personal`

- samo **author** smije editirati
- preset ne otvara edit pravo drugima

### §4.3 `shared` — ovisi o `krug_shared_status`

| `krug_shared_status` | author edit | owner edit | full member edit | ordinary edit |
|----------------------|-------------|------------|-------------------|---------------|
| `predložena`         | da          | ne*        | ne*               | ne            |
| `potvrđena`          | **ne**      | ne*        | ne*               | ne            |
| `nepotvrđena`        | da          | ne*        | ne*               | ne            |

\* owner / full member nad `shared` retkom djeluju isključivo kroz **governance akte** (scope Approval Enforcement). Ovdje samo zabrana izravnog field-edita.

Napomena: za `shared` redak čiji je author ordinary — taj slučaj **ne postoji** po §3.1 (ordinary ne smije kreirati `shared`). Ako se pojavi historijski/migracijski, edit prava ostaju kao iznad (author smije nad svojim u `predložena` / `nepotvrđena`), ali ordinary i dalje **ne smije** inicirati nikakvu semantičku tranziciju koja ulazi u approval tok (§5).

### §4.4 Ordinary member

Nema edit nad tuđim retkom. Nad vlastitim `private` / `personal` smije (kao author).

### §4.5 Non-member

Bez edit prava na redak gdje `krug_id IS NOT NULL`.

---

## §5. Semantic-transition

### §5.1 Matrica `krug_privacy` tranzicija

| Iz \ U     | `private`         | `personal`       | `shared`         |
|------------|-------------------|------------------|------------------|
| `private`  | —                 | da (author)      | **ne** direktno  |
| `personal` | da (author, prozor §5.4) | —          | da (author s pravom pokretanja shared toka) |
| `shared`   | **ne**            | da (governance)  | —                |

Detalji:

- **`private → personal`**: smije samo author.
- **`private → shared`**: zabranjeno direktno. Mora `private → personal`, pa `personal → shared`.
- **`personal → private`**: smije samo author, u prozoru §5.4.
- **`personal → shared`**: smije **samo author s pravom pokretanja shared toka** (= author koji je owner ili full member). **Ordinary member NE smije**, ni nad vlastitim retkom. Postavlja `krug_shared_status = predložena`.
- **`shared → personal`**: ne od strane authora izravno. Dopušteno samo kao posljedica governance akta (veto / opoziv potvrde) — scope Approval Enforcement. Postavlja `krug_shared_status = NULL`.
- **`shared → private`**: trajno zabranjeno.

### §5.2 Matrica `krug_shared_status` tranzicija (samo unutar `shared`)

| Iz \ U         | `predložena` | `potvrđena` | `nepotvrđena` |
|----------------|--------------|-------------|---------------|
| `predložena`   | —            | da (gov.)   | da (gov.)     |
| `potvrđena`    | **ne**       | —           | da (gov. opoziv) |
| `nepotvrđena`  | da (author s pravom pokretanja shared toka, preoblikovanje) | ne | — |

- Sve tranzicije osim `nepotvrđena → predložena` su governance akti (scope Approval Enforcement).
- `nepotvrđena → predložena` smije **samo author s pravom pokretanja shared toka**. Ordinary ne smije, čak ni ako je nominalno author retka. Ne mijenja `krug_privacy`.
- `potvrđena → predložena` direktno je zabranjeno. Ide kroz `potvrđena → nepotvrđena` (opoziv), pa `nepotvrđena → predložena` (author s pravom pokretanja shared toka).

### §5.3 Tko smije inicirati semantičku tranziciju

| Tranzicija                          | Inicijator                                              |
|-------------------------------------|---------------------------------------------------------|
| `private → personal`                | author                                                  |
| `personal → private` (u prozoru)    | author                                                  |
| `personal → shared`                 | **author s pravom pokretanja shared toka** (owner ili full member). Ordinary **ne smije**, ni nad vlastitim retkom. |
| `shared → personal` (govern.)       | governance kanal (Approval Enforcement)                 |
| `predložena → potvrđena`            | governance kanal                                        |
| `predložena → nepotvrđena`          | governance kanal                                        |
| `potvrđena → nepotvrđena` (opoziv)  | governance kanal                                        |
| `nepotvrđena → predložena`          | **author s pravom pokretanja shared toka**. Ordinary **ne smije**. |

Ordinary member se ne pojavljuje kao inicijator nijedne tranzicije koja ulazi u approval tok ili ga ponovno otvara.

### §5.4 Prozor za `personal → private`

Dopušteno samo dok redak nije bio prikazan drugim članovima Kruga.

> `personal → private` smije, ali ne nakon što je redak već postao vidljiv ikojem drugom članu Kruga kroz preset.

Za presetove gdje `personal` nikad nije vidljiv drugima (`Su-roditelj`, `Cimer` po defaultu), prozor je trajno otvoren autoru. Za `Supružnik / partner`, prozor se zatvara čim partner stekne vidljivost.

Operativni kriterij prozora je scope Approval Enforcement.

### §5.5 Side-effects semantičkih tranzicija

| Tranzicija                  | Side-effect                                        |
|-----------------------------|----------------------------------------------------|
| `private → personal`        | `krug_shared_status` ostaje `NULL`                 |
| `personal → private`        | `krug_shared_status` ostaje `NULL`                 |
| `personal → shared`         | `krug_shared_status := predložena`                 |
| `shared → personal` (gov.)  | `krug_shared_status := NULL`                       |
| `predložena → potvrđena`    | `krug_privacy` nepromijenjen                       |
| `predložena → nepotvrđena`  | `krug_privacy` nepromijenjen                       |
| `potvrđena → nepotvrđena`   | `krug_privacy` nepromijenjen                       |
| `nepotvrđena → predložena`  | `krug_privacy` nepromijenjen                       |

Nijedna semantička tranzicija ne mijenja `krug_id` — to radi isključivo hard-delete (§6).

---

## §6. Hard-delete kao tranzicija

Post-delete pravilo (Schema v1.3): `krug_id → NULL`, `shared → personal`, `krug_shared_status → NULL`.

### §6.1 Tko smije pokrenuti hard-delete

| Redak privacy / status                  | Tko smije pokrenuti                              |
|-----------------------------------------|--------------------------------------------------|
| `private`                               | author                                           |
| `personal`                              | author                                           |
| `shared` + `predložena`                 | author s pravom pokretanja shared toka (povlači vlastiti prijedlog). Ordinary **ne smije**, što je konzistentno s §3.1 (ordinary uopće ne može biti author `shared` retka u normalnom toku). |
| `shared` + `potvrđena`                  | **zabranjeno** — mora prvo opoziv (gov.) → `nepotvrđena` |
| `shared` + `nepotvrđena`                | author s pravom pokretanja shared toka            |

### §6.2 Ordinary member i hard-delete

Ordinary ne smije obrisati tuđi redak. Nad vlastitim `private` / `personal` smije (kao author). Nad `shared` retkom — ne smije ga ni kreirati (§3.1), pa ovaj put u normalnom toku ne postoji. Za historijske/migracijske `shared` retke gdje je ordinary nominalno author: hard-delete nije dopušten, jer bi to bio ulaz u semantičku radnju nad approval tokom za koju ordinary nema pravo.

### §6.3 Owner i full member nad tuđim retkom

Hard-delete tuđeg retka nije dopušten kroz mutation path. Postoji samo kao posljedica:

- soft-delete cijelog Kruga (scope: Krug lifecycle)
- governance opoziva koji vodi `shared → personal` (autor zatim odlučuje o brisanju)

Owner ne smije unilateralno obrisati tuđi `private` / `personal` / `shared` redak.

---

## §7. Sažeta autorizacijska matrica

Skraćeni pregled. `A` = author, `A+` = author s pravom pokretanja shared toka (= author koji je owner ili full member), `O` = owner, `F` = full member, `R` = ordinary, `—` = ništa.

| Akcija                          | A     | A+    | O     | F     | R     |
|---------------------------------|-------|-------|-------|-------|-------|
| read (`private`)                | da    | —     | —     | —     | —     |
| read (`personal`)               | da    | —     | preset| preset| da    |
| read (`shared`)                 | da    | —     | da    | da    | da    |
| create (`private` / `personal`) | n/a   | n/a   | da    | da    | da    |
| create (`shared`)               | n/a   | n/a   | da    | da    | **ne** |
| field-edit (`private`)          | da    | —     | —     | —     | —     |
| field-edit (`personal`)         | da    | —     | —     | —     | —     |
| field-edit (`shared/predložena`)| da    | —     | —     | —     | —     |
| field-edit (`shared/potvrđena`) | —     | —     | —     | —     | —     |
| field-edit (`shared/nepotvrđena`)| da   | —     | —     | —     | —     |
| `private → personal`            | da    | —     | —     | —     | —     |
| `personal → private` (prozor)   | da    | —     | —     | —     | —     |
| **`personal → shared`**         | —     | **da**| —     | —     | **ne** |
| **`nepotvrđena → predložena`**  | —     | **da**| —     | —     | **ne** |
| ostale `shared_status` tranzicije | —   | —     | gov.  | gov.  | —     |
| `shared → personal` (gov.)      | —     | —     | gov.  | gov.  | —     |
| hard-delete (vlastiti, dopušteni status) | da* | —  | —     | —     | da (samo `private`/`personal`) |
| hard-delete (tuđi)              | —     | —     | **ne**| **ne**| —     |

\* `A` smije hard-delete vlastitog `shared/predložena` i `shared/nepotvrđena` retka **samo ako je istovremeno A+** (jer u normalnom toku ordinary i nije mogao kreirati `shared`).

---

## §8. Nevaljane mutacije (eksplicitno)

- create `shared` od strane ordinary membera
- create sa `krug_shared_status` ≠ NULL ako `krug_privacy ∈ {private, personal}`
- create `shared` sa `krug_shared_status ∈ {potvrđena, nepotvrđena}`
- **`personal → shared` od strane ordinary membera nad vlastitim retkom**
- **`nepotvrđena → predložena` od strane ordinary membera**
- `private → shared` direktno
- `shared → private` ikad
- `potvrđena → predložena` direktno
- field-edit `shared/potvrđena` retka
- field-edit tuđeg retka od bilo koga
- hard-delete `shared/potvrđena` retka
- hard-delete tuđeg retka od owner / full / ordinary
- hard-delete `shared` retka od ordinary, čak i ako je nominalno author
- mutacija od non-membera nad retkom gdje `krug_id IS NOT NULL`
- `personal → private` nakon što je redak stekao vidljivost ikojem drugom članu Kruga kroz preset

---

## §9. Danger zones

1. **Tihi `personal → private` kroz edit formu** — promjena privacy chip-a mora ići kroz semantic-transition gate (§5.4), ne kroz field-edit.
2. **Direktan skok `private → shared`** — UI mora forsirati međukorak ili odbiti.
3. **Field-edit nakon `potvrđena`** — UI mora disable-ati polja.
4. **Ordinary "Podijeli s Krugom" gumb** — UI **ne smije** ponuditi `personal → shared` ordinary memberu, ni nad vlastitim retkom. Ovo je zaključano pravilo (§3.1, §5.3, §8), ne otvoreno pitanje. Mutation gate mora odbiti i kad bi UI propustio.
5. **Ordinary "Pošalji ponovo" nakon veta** — UI **ne smije** ponuditi `nepotvrđena → predložena` ordinary memberu. Zaključano pravilo (§5.2, §5.3, §8).
6. **Hard-delete `shared/potvrđena`** — UI mora forsirati opoziv kroz governance prije delete-a.
7. **Owner "obriši tuđe"** — owner nema delete pravo nad tuđim retkom.
8. **`nepotvrđena → predložena` bez izmjene polja** — autor (A+) smije, ali rate-limit/uvjeti su scope Approval Enforcement.
9. **Post-delete `krug_id → NULL`** — terminalna tranzicija, nema povratka u Krug bez novog create-a.

---

## §10. Zaključak

### Je li mutation path za transakcije sada dovoljno jasan?

**Da.** Zaključano je bez otvorenih pitanja:

- tko smije create per privacy (§3)
- tko smije field-edit per privacy × status (§4)
- koje su sve dopuštene `krug_privacy` i `krug_shared_status` tranzicije i tko ih inicira, uz eksplicitno isključenje ordinary membera iz svake tranzicije koja dira approval tok (§5)
- tko smije hard-delete per privacy × status (§6)
- side-effects svake tranzicije na druga semantička polja (§5.5)
- eksplicitna lista nevaljanih mutacija (§8)
- danger zones bez otvorenih pitanja (§9)

### Najbolji sljedeći dokument

**`Krug Approval Enforcement Plan v1`**.

Razlog: semantika (Schema v1.3), vidljivost (Visibility v1.1) i mutation path (ovaj dokument) su tri statična ugla. Approval Enforcement je prvi dinamički kanal — definira kako se governance akti iz §5.3 i §6.1 izvršavaju, tko ih konzumira, kako se vetiraju, koji je operativni kriterij prozora §5.4, i koji je rate-limit za `nepotvrđena → predložena`. Tek nakon njega ima smisla `Krug API / Service Boundary Plan v1`.
