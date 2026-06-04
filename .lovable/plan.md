
# Krug Approval Enforcement Plan v1.1

Block D dokument. Prvi **dinamički** kanal u Krug arhitekturi. Definira kako se governance akti iz `Krug Transaction Mutation Path Plan v1.1` (§5.3, §6.1) stvarno **izvršavaju, konzumiraju, vetiraju**, što znači **prozor §5.4**, i koja su pravila za **ponovno otvaranje approval toka** (`nepotvrđena → predložena`).

Polazi strogo od:

- `Krug Foundation v4.2`
- `Preset Constraint Matrix v1`
- `Governance Matrix v1.3`
- `Krug Transaction Semantics Schema Plan v1.3`
- `Krug Transaction RLS / Visibility Plan v1.1`
- `Krug Transaction Mutation Path Plan v1.1`

**Bez** novog voting modela. **Bez** `majority`. **Bez** generičkog workflow enginea. **Bez** SQL koda, RPC potpisa, UI flow-a, rollout plana, notifikacijskog kanala.

Scope je isključivo approval kanal za **transakcijski redak** u Krug kontekstu.

**Promjene u odnosu na v1**:

1. Uveden **48h expiry** za `predložena` stanje (akt **A6**) kao već zaključano pravilo Foundation v4.2. Tvrdnja "samo eksplicitni akti pomiču stanje" iz v1 je povučena.
2. Uveden **akt A7** (`shared → personal` kao governance posljedica) unutar approval kanala, čime se uklanja konflikt s `Krug Transaction Mutation Path Plan v1.1` §5.1 i §5.5. Tvrdnja iz v1 "redak kroz approval kanal nikad ne napušta `shared`" je povučena.

---

## §1. Opseg

Definira:

- životni ciklus jednog **prijedloga** (`shared/predložena`)
- koji **approval akti** mijenjaju `krug_shared_status` ili `krug_privacy`
- tko je **inicijator** i tko je **konzument** svakog akta
- što je **veto**, **opoziv potvrde** i **expiry**
- što znači **povlačenje prijedloga**
- kada i kako redak prelazi iz `shared` u `personal` kao governance posljedica (akt A7)
- operativni kriterij **prozora §5.4** (`personal → private`)
- pravilo za **ponovno otvaranje** (`nepotvrđena → predložena`)
- **terminalna stanja** approval toka
- **invariante** i **race-uvjeti** koji moraju biti pokriveni

Ne ulazi u: notifikacije, UI, rate-limit konkretne brojeve, audit log shemu, RPC potpise, RLS implementaciju.

---

## §2. Approval akti

Iz Mutation Path v1.1 §5.3 / §6.1 i Foundation v4.2 (48h pravilo) izvedeno je **sedam** approval akata. Drugih akata u kanalu nema.

| Akt | Učinak na redak | Tko ga pokreće |
|---|---|---|
| **A1. Potvrda** | `predložena → potvrđena` | governance kanal (owner / full member) |
| **A2. Veto** | `predložena → nepotvrđena` | governance kanal |
| **A3. Opoziv potvrde** | `potvrđena → nepotvrđena` | governance kanal |
| **A4. Povlačenje prijedloga** | hard-delete retka u `predložena` ili `nepotvrđena` (post-delete pravilo Schema v1.3) | author s pravom pokretanja shared toka |
| **A5. Ponovno otvaranje** | `nepotvrđena → predložena` | author s pravom pokretanja shared toka |
| **A6. Expiry prijedloga** | `predložena → nepotvrđena` po isteku 48h od ulaska u `predložena` | **sistem** (vremenski okidač) |
| **A7. Prelazak u personal** | `shared → personal` uz `krug_shared_status := NULL` | governance kanal |

Ordinary member i non-member se **ne pojavljuju** kao inicijatori nijednog akta.

A1–A3 i A7 su **governance akti**. A4–A5 su **autorski akti unutar approval toka**. A6 je **sistemski akt**, jedini koji nije ručno pokrenut.

---

## §3. Životni ciklus prijedloga

Prijedlog **postoji** dok `krug_privacy = shared`. Stanja kroz koja prolazi:

```text
                      A4 (povlačenje)
        ┌──────────────── hard-delete ──→ (krug_id = NULL, personal)
        │
        │     A6 (48h expiry)
        │   ┌────────────────┐
        │   ▼                │
   predložena ──A1──→ potvrđena ──A3──→ nepotvrđena ──A5──→ predložena ──→ ...
        │                                    ▲
        └──────────A2─────────────────────────┘

   bilo koje stanje u `shared`  ──A7──→  personal  (krug_shared_status = NULL)
```

- **predložena**: smisleni akti su A1, A2, A4, A6, A7.
- **potvrđena**: smisleni akti su A3, A7.
- **nepotvrđena**: smisleni akti su A4, A5, A7.

A6 osigurava da **nijedan prijedlog ne visi beskonačno**: ako u 48h od ulaska u `predložena` nije izvršen A1, A2, A4 ili A7, sistem ga prebacuje u `nepotvrđena` (vidi §5.3). Author može iz `nepotvrđena` pokrenuti A5 ili A4 pod istim pravilima kao i nakon A2.

---

## §4. Tko konzumira akt

- **A1 / A2 / A3 / A7** — konzument je **governance kanal**: akter mora biti owner ILI full member (Governance Matrix v1.3) nad Krugom kojem redak pripada. Preset utječe samo na to tko je full member, ne na pravilo da je governance pravo individualno.
- **A4 / A5** — konzument je **sam author**, pod uvjetom da je istovremeno owner ili full member.
- **A6** — konzument je **sistem**. Nema ljudskog aktera. Okida se na temelju vremena ulaska retka u `predložena`.

**Ordinary author** ne može konzumirati A4 ni A5, jer u normalnom toku ne može doći do `shared` retka čiji je on author (Mutation Path v1.1 §3.1).

Voting / quorum / majority **ne postoji**. Svaki governance akt je **unilateralan**: jedna potvrda → `potvrđena`; jedan veto → `nepotvrđena`; jedan A7 → `personal`. To je posljedica Governance Matrix v1.3.

---

## §5. Veto, opoziv, expiry i prelazak u personal

### §5.1 Veto (A2)

- pretpostavka: `krug_privacy = shared` ∧ `krug_shared_status = predložena`
- učinak: `krug_shared_status := nepotvrđena`
- `krug_privacy` ostaje `shared`
- redak ostaje vidljiv članovima Kruga; author (A+) može A5 ili A4

### §5.2 Opoziv potvrde (A3)

- pretpostavka: `krug_privacy = shared` ∧ `krug_shared_status = potvrđena`
- učinak: `krug_shared_status := nepotvrđena`
- `krug_privacy` ostaje `shared`
- iz `nepotvrđena` author (A+) može A5 ili A4; governance može A7

A3 omogućuje pravilo Mutation Path v1.1 §6.1 (hard-delete `shared/potvrđena` mora ići preko opoziva: A3 → A4).

### §5.3 Expiry prijedloga (A6) — 48h

Foundation v4.2: prijedlog koji traži potvrdu vrijedi 48 sati; ako ne bude potvrđen u tom roku, automatski postaje nevažeći.

Operacionalizacija u approval kanalu:

- **trigger**: trenutak u kojem je `krug_shared_status` postao `predložena` (uključuje i A5, koji je novi ulazak u `predložena`, ne nastavak starog brojača).
- **trajanje**: 48 sati, fiksno, neovisno o presetu i o Krugu.
- **učinak po isteku**: `krug_shared_status := nepotvrđena`. `krug_privacy` ostaje `shared`. Identičan ishod stanja kao A2, ali izvor je sistem, ne governance akter.
- **prekidanje**: A1, A2, A4 ili A7 izvršeni prije isteka **prekidaju** brojač. A6 se nakon toga ne okida za taj ciklus.
- **ponovno otvaranje**: A5 (`nepotvrđena → predložena`) **resetira** brojač na novih 48h. To znači da je 48h pravilo per-ciklus, ne per-redak.
- **side-effects**: nikakvi izvan promjene `krug_shared_status`. `krug_id`, `krug_privacy` i ostala polja se ne diraju.
- **author reakcija**: iz `nepotvrđena` (bilo iz A2 ili A6) author (A+) može A5 ili A4 pod istim pravilima.

A6 je jedini akt koji se ne aktivira ručnom radnjom. Mehanizam okidanja (cron, scheduler, on-read provjera) je operativni izbor i nije scope ovog dokumenta — bitno je samo da je **deterministički** vezan uz 48h od ulaska u `predložena` i da ne ovisi o aktivnosti aktera.

### §5.4 Prelazak u personal (A7)

Mutation Path v1.1 §5.1 i §5.5 propisuju da je `shared → personal` dopušten kao **posljedica governance akta**, uz `krug_shared_status := NULL`. Approval Enforcement v1.1 to ostvaruje aktom A7.

- **pretpostavka**: `krug_privacy = shared` ∧ `krug_shared_status ∈ {predložena, potvrđena, nepotvrđena}`
- **akter**: governance kanal (owner ili full member)
- **učinak**: `krug_privacy := personal` ∧ `krug_shared_status := NULL`
- **`krug_id` se ne mijenja** — redak ostaje u Krugu, samo prestaje biti shared.
- **vidljivost nakon A7**: određuje Visibility v1.1 za `personal` u tom presetu (može značiti da redak prestaje biti vidljiv drugim full membera).
- **author prava nakon A7**: author dobiva natrag puno field-edit pravo nad `personal` retkom (Mutation Path v1.1 §4.2). Author **ne smije** vratiti redak na `private` ako je u međuvremenu redak već bio vidljiv drugim članovima kroz preset (prozor §5.4 Mutation Path v1.1 je trajno zatvoren čim je redak postao `shared`).
- **odnos prema A3**: A3 ostavlja redak u `shared/nepotvrđena`. A7 ide korak dalje i izlazi iz `shared`. To su dva različita akta s dva različita ishoda; nisu sinonimi i ne moraju se izvršavati zajedno.
- **odnos prema A2 / A6**: nakon veta ili expiry-ja, redak je u `shared/nepotvrđena`. Governance i dalje smije A7 nad takvim retkom. To je legalan put da se vetirani / istekli prijedlog izvuče iz Kruga bez čekanja autora.
- **A7 nije hard-delete**: redak ostaje, samo gubi `shared` status. Hard-delete radi A4.

A7 popunjava točno onu prazninu zbog koje je v1 bio u konfliktu s Mutation Path v1.1. Drugog kanala za `shared → personal` u arhitekturi **nema** (osim Krug-level akata iz lifecycle scope-a, npr. soft-delete cijelog Kruga, što je izvan ovog dokumenta).

---

## §6. Povlačenje prijedloga (A4)

- pretpostavka: `krug_privacy = shared` ∧ `krug_shared_status ∈ {predložena, nepotvrđena}` ∧ akter = author s pravom pokretanja shared toka
- učinak: hard-delete uz post-delete pravilo Schema v1.3 (`krug_id → NULL`, `shared → personal`, `krug_shared_status → NULL`)
- nije dopušten nad `shared/potvrđena` (Mutation Path v1.1 §6.1) — mora prvo A3 (ili A7, ako governance odluči izvući redak u personal i prepustiti autoru obični delete na `personal`)
- autorski akt, ne traži suglasnost owner / full member

---

## §7. Ponovno otvaranje (A5)

- pretpostavka: `krug_privacy = shared` ∧ `krug_shared_status = nepotvrđena` ∧ akter = author s pravom pokretanja shared toka
- učinak: `krug_shared_status := predložena`
- side-effects: nikakvi
- **resetira A6 brojač** na novih 48h (§5.3)

### §7.1 Smije li A5 ići bez izmjene polja

Smije. A5 je tranzicija statusa, ne polja. Field-edit u `nepotvrđena` je dopušten (Mutation Path v1.1 §4.3) ali nije preduvjet.

### §7.2 Rate-limit

A5 je jedini ručni akt koji author može pokrenuti više puta nad istim retkom. U kombinaciji s A2 i A6 (oba ishoda → `nepotvrđena`) postoji rizik ciklusa.

Approval Enforcement v1.1 **zaključava pravilo**, ne brojke:

- mora postojati ograničenje koje sprječava da ciklus A5 ↔ (A2 ili A6) degradira kanal.
- ograničenje je vezano uz par **(redak, author)**, ne uz Krug.
- ograničenje se **ne smije** zaobići field-editom u `nepotvrđena`.
- konkretni parametri (broj A5 u prozoru) su operativna konfiguracija, ne Block D.

48h iz A6 **nije zamjena** za rate-limit A5: A6 ograničava trajanje jednog ciklusa, rate-limit ograničava broj ciklusa.

---

## §8. Prozor §5.4 (Mutation Path) operativno

- prozor je **otvoren** dok redak ima `krug_privacy = personal` **i** dok preset ne omogućuje drugom članu read (Visibility v1.1).
- prozor se **zatvara** čim redak po Visibility v1.1 postane čitljiv ikojem drugom članu Kruga (uključuje i prelazak u `shared`).
- prozor je **trajno otvoren** za presetove gdje `personal` nikad nije vidljiv drugima (`Su-roditelj`, `Cimer` po defaultu), dok je redak `personal`.
- ulazak u approval kanal (`personal → shared`) zatvara prozor **trajno** — uključujući kasniji povratak na `personal` kroz A7. Author nakon A7 može uređivati `personal` redak, ali ga ne može vratiti u `private`.

---

## §9. Invariante

Svaki akt u kanalu mora očuvati:

1. `krug_shared_status` je `NULL` ⇔ `krug_privacy ∈ {private, personal}`.
2. `krug_shared_status ∈ {predložena, potvrđena, nepotvrđena}` ⇔ `krug_privacy = shared`.
3. `predložena → potvrđena → predložena` bez A3 + A5 nije moguć.
4. `potvrđena → predložena` direktno nije moguć.
5. Nijedan akt A1–A7 ne mijenja `krug_id`.
6. A1, A2, A3, A5, A6 ne mijenjaju `krug_privacy`. A4 izlazi iz Kruga preko post-delete pravila. A7 mijenja `krug_privacy` iz `shared` u `personal` uz `krug_shared_status := NULL`.
7. Ordinary member ne smije biti akter nijednog akta A1–A7.
8. Non-member ne smije biti akter nijednog akta.
9. Akt mora biti izvršen u Krugu kojem redak pripada.
10. Akt nad retkom čije stanje ne zadovoljava pretpostavku akta je nevaljan.
11. A6 mora biti **deterministički** vezan uz vrijeme ulaska u `predložena`; ne smije ovisiti o aktivnosti aktera ili o read-pathu.

---

## §10. Race-uvjeti koje operativni sloj mora pokriti

1. **Dvostruka potvrda** (dva A1) — samo jedan uspijeva; drugi pada.
2. **Potvrda i veto istovremeno** (A1 ∥ A2) — samo jedan uspijeva; deterministički prvi.
3. **Veto i povlačenje** (A2 ∥ A4) — ako A2 prvi, A4 i dalje smije nad `nepotvrđena`. Nikad dvostruka mutacija.
4. **Opoziv i novi ciklus** (A3 → A5 → A1/A2 koji pripada starom ciklusu) — operativni sloj mora razlikovati cikluse.
5. **A5 koji zaobilazi rate-limit** — ograničenje §7.2 mora biti atomsko po (redak, author).
6. **Field-edit istodobno s A1** — A1 potvrđuje trenutno stanje; field-edit nakon A1 zabranjen (Mutation Path v1.1 §4.3).
7. **Govern akt nad nepostojećim retkom** (A4 izvršen prije, A1/A2/A3/A7 stigne kasnije) — mora pasti.
8. **A6 vs ručni akt na granici 48h** — ako A1/A2/A4/A7 dođe u istom trenutku kao A6, mora postojati deterministički poredak. Ručni akt prije A6 prekida brojač; ručni akt nakon A6 nailazi na `nepotvrđena` i mora se evaluirati protiv tog stanja (A1 pada, A4/A5/A7 ostaju legalni).
9. **A6 dupli okidač** — mehanizam okidanja mora biti idempotentan po (redak, ciklus). Dva okidanja A6 u istom ciklusu ne smiju dvaput mijenjati stanje ili poništiti naknadni A5.
10. **A7 nad retkom koji je upravo postao `nepotvrđena` kroz A6** — legalan; A7 ne razlikuje izvor `nepotvrđena` (A2 ili A6).
11. **A7 i A4 istovremeno** — A4 vodi u hard-delete, A7 u `personal`. Samo jedan uspijeva; drugi pada (redak je ili obrisan ili više nije `shared`).

Ovaj dokument propisuje **legalne i nevaljane ishode**, ne mehanizam (lock / serialization / idempotency key).

---

## §11. Što approval kanal NIJE

- voting / quorum / majority / weighted approval
- timeout **različit** od 48h iz Foundation v4.2 (A6 je jedini vremenski okidač; drugih nema)
- delegacija approval prava
- notifikacijski kanal
- audit log shema
- UI flow
- per-preset varijacija approval logike izvan onoga što Governance Matrix v1.3 već definira kroz pojam full membera
- approval akt iznad bilo čega što nije transakcijski redak
- Krug-level akti (soft-delete Kruga, promjena članstva, promjena presetova) — to je scope Krug lifecycle dokumenata. A7 **nije** Krug-level akt; on djeluje na pojedini redak i ostaje unutar approval kanala.

---

## §12. Zaključak

### Je li approval kanal sada dovoljno jasan

Da, uz oba usklađenja iz v1.1:

- **48h expiry (A6)** je integriran kao deterministički sistemski akt; prijedlog ne može visiti beskonačno (§5.3, §9.11, §10.8–9).
- **`shared → personal` (A7)** je integriran kao governance akt unutar approval kanala, čime se uklanja konflikt s Mutation Path v1.1 §5.1 / §5.5 (§5.4, §9.6, §10.10–11).

Ostalo zaključano u v1.1:

- konačan skup od **sedam** akata (§2)
- životni ciklus prijedloga s eksplicitnom A6 granom (§3)
- konzument svakog akta, isključenje ordinary / non-member (§4)
- semantika veta, opoziva, expiry-ja i prelaska u personal (§5)
- pravila povlačenja i ponovnog otvaranja (§6, §7)
- operativni kriterij prozora §5.4 (§8)
- invariante koje akti moraju očuvati (§9)
- race-uvjeti koje operativni sloj mora pokriti (§10)
- eksplicitni perimeter (§11)

### Najbolji sljedeći dokument

**`Krug API / Service Boundary Plan v1`** — mapiranje akata A1–A7 i invarianti §9 / race-uvjeta §10 na granicu klijent ↔ server, prije ulaska u `Krug RLS Implementation Plan v1`.
