# Krug Implementation Order v1

Prevodi zaključani foundation u redoslijed izgradnje. Visoka razina, bez SQL/RLS/UI/rollout detalja.

Polazi striktno od: `Krug Foundation v4.2`, `Preset Constraint Matrix v1`, `Governance Matrix v1.3`, `Continuity & Billing State Machine v1.3.2`, `Takeover Conditions Spec v1.1`, `Krug Domain/Data Model v1.1`, `Post-Delete Behavior Foundation Patch v1.1`, `Shared Resources Link — Structural Choice v1.1`, `Krug Access Matrix v1.3`, `Reuse / Refactor / Rebuild Plan v1`.

Bez `Family`. Bez `majority`. Bez novih preseta.

---

## 1. Načela redoslijeda

1. **Stabilne osnove prije pokretnih dijelova.** Identitet entiteta (`Krug`, `KrugMember`, preset, owner) mora postojati prije nego se na njega zakači bilo što ovisno (governance, billing, shared resursi).
2. **Strukturni model prije ponašanja.** Domain/Data Model v1.1 + Access Matrix v1.3 definiraju "tko može što". Implementiraj tu kosturnicu prije nego dodaš dinamiku (proposal/consent, takeover, post-delete cascade).
3. **Lifecycle prije iznimki.** Steady-state (`active`) Kruga mora biti funkcionalan i konzistentan prije nego se dodaju tranzicijski konteksti (`confirmed transfer`, `fallback takeover`, `read_only` reaktivacija).
4. **Shared resursi tek nakon access sloja.** Resource link sloj (Structural Choice v1.1) ovisi o postojanju Kruga + membershipa + access pravila. Bez toga link sloj ne zna komu što dijeli.
5. **Transakcijska semantika (`krug_id`/`privacy`/`shared_status`) tek nakon entiteta i access pravila.** Inače bi se transakcije morale naknadno migrirati svaki put kad se promijeni model.
6. **Reuse prije rebuilda.** Prema Reuse/Refactor/Rebuild Plan v1: gdje god postojeći `family_*` sloj zadovoljava — refaktor, ne nova tablica. Novi entiteti samo gdje foundation eksplicitno traži (npr. Governance artefakti, Continuity state, Takeover prozori).
7. **Post-delete i continuity zadnji u core valu.** To su semantički najopasnija mjesta — moraju se graditi nad već čvrstim modelom, ne istovremeno s njim.

---

## 2. Implementacijski blokovi

### Blok A — Core Krug + Membership
**Sadrži:** entitet `Krug` (id, preset, owner_ref, created_at, lifecycle_state default `active`), `KrugMember` (krug_id, user_ref, role: owner/punopravni/obični, status, joined_at), preset enum (`spouse_partner`, `coparent`, `roommate`).
**Preduvjet:** ništa unutar Kruga; oslanja se samo na postojeći auth + profiles.
**Otključava:** sve ostalo.

### Blok B — Access Sloj (read path)
**Sadrži:** implementaciju §1 osi i §2 matrice iz Access Matrix v1.3 kao **read-only kapaciteta** — helperi/funkcije koji odgovaraju na "smije li X vidjeti/koristiti Y" za role + preset + lifecycle stanje. Bez write gateova još.
**Preduvjet:** Blok A.
**Otključava:** sve resource/transakcijske blokove jer im daje konzistentan visibility model.

### Blok C — Ownership + Lifecycle (steady-state)
**Sadrži:** owner kao billing nositelj u `active` stanju, lifecycle stanja Kruga iz State Machine v1.3.2 **bez** tranzicijskih konteksta (samo `active` i prelazak u `grace`/terminal kao opis, ne kao izvršivi flow), eksplicitni billing-owner gate iz Access Matrix §1.4 steady-state dijela.
**Preduvjet:** Blok A. Bok B preporučen.
**Otključava:** Blok D (governance — jer governance odluke pretpostavljaju jasno tko je owner), Blok E (takeover — jer treba znati od čega se odvaja).

### Blok D — Governance (proposal/consent)
**Sadrži:** Governance artefakte iz Domain Model v1.1, propose/confirm/reject prema Governance Matrix v1.3 po presetu. Bez `majority`. Obični član nema governance prava (Access Matrix §2).
**Preduvjet:** Blokovi A, B, C.
**Otključava:** sve strukturne izmjene Kruga koje nisu owner-unilateral (kooptacija, promjena preseta gdje je dopuštena, isključenje člana).

### Blok E — Takeover + Continuity tranzicije
**Sadrži:** `confirmed transfer`, `fallback takeover`, `read_only` reaktivacija prema Takeover Conditions Spec v1.1 i State Machine v1.3.2. Izvršitelj: owner ili spec-dodijeljeni punopravni član (Access Matrix v1.3 §3.10). Reaktivacijski prozor nepromijenjen.
**Preduvjet:** Blokovi A, B, C, D.
**Otključava:** stvarnu otpornost Kruga na nedostupnost ownera; bez ovog bloka Krug je u steady-state samo do prvog incidenta.

### Blok F — Shared Resources Link sloj
**Sadrži:** standardizirani link sloj prema Structural Choice v1.1 za shared payment sources, budgets, projekte, ciljeve, dokumente. Per-resource rename + standardizacija, **ne nova generic tablica** (potvrđeno u Domain Model v1.1 §2.7 kao refactor).
**Preduvjet:** Blokovi A, B; preporučljivo C (jer ownership resursa nije Krug-ownership i to mora biti jasno odvojeno).
**Otključava:** ujednačeno dijeljenje svih shared kategorija + post-delete pravila (Blok H).

### Blok G — Transakcijska Krug-semantika
**Sadrži:** dodavanje `krug_id` + `privacy` (private/shared) + `shared_status` na transakcije, prema Domain Model v1.1. Bez Krug-a transakcija je default `private` za vlasnika.
**Preduvjet:** Blokovi A, B, F (jer shared transakcija najčešće prati shared resource).
**Otključava:** governance/visibility transakcija (Access Matrix §3.7) + post-delete ponašanje za transakcije.

### Blok H — Post-Delete Behavior
**Sadrži:** implementaciju Post-Delete Behavior Foundation Patch v1.1 — što se događa shared resursima, transakcijama i governance artefaktima kad se Krug obriše/ugasi.
**Preduvjet:** Blokovi A, F, G. Ne ranije — bez postojanja shared/transakcijskog sloja patch nema što obrađivati.
**Otključava:** sigurno gašenje Kruga bez data-loss-a i bez semantičkog kaosa.

### Blok I — Activity / Audit / Settlements
**Sadrži:** activity log, comments/reactions na shared artefaktima, settlements (gdje su predviđeni). Ne ulazi u chat (eksplicitno isključeno foundation odlukom).
**Preduvjet:** Blokovi A–G. Može teći paralelno s H kad oba imaju svoje preduvjete.
**Otključava:** UX zaokruženje; nije blokirajuće za core semantiku.

---

## 3. Redoslijed ovisnosti

```text
Val 1 (sekvencijalno, temelj):
  A  →  B  →  C

Val 2 (sekvencijalno nad temeljem):
  C  →  D  →  E

Val 3 (paralelno nakon Vala 1, prije Vala 4):
  F   (može startati čim je B gotov; preporučljivo nakon C)
  G   (čeka F)

Val 4 (sekvencijalno nakon F+G):
  H   (post-delete; ne ranije)

Val 5 (paralelno, najmanji rizik):
  I   (activity/settlements; čeka A–G; može uz H)
```

Tablica ovisnosti:

| Blok | Mora prije | Smije paralelno s | Nikako prije |
|------|------------|-------------------|--------------|
| A    | —          | —                 | —            |
| B    | A          | —                 | —            |
| C    | A          | B                 | —            |
| D    | A, B, C    | F (read-path dio) | E, H         |
| E    | A, B, C, D | —                 | H            |
| F    | A, B       | C, D              | G, H         |
| G    | A, B, F    | D                 | H            |
| H    | A, F, G    | I                 | prije F+G    |
| I    | A–G        | H                 | —            |

Kritični konflikti:
- **D prije C** = governance odluke bez jasnog ownera → nepošten model.
- **E prije D** = takeover bez governance-a → tranzicije bez kontrole.
- **G prije F** = transakcije pokazuju na shared resurse koji ne postoje kao link sloj → naknadna migracija.
- **H prije F+G** = patch nema što patchati.

---

## 4. Prvi sigurni kostur

Najmanji smisleni Krug skeleton koji **ne laže foundation**:

**Mora biti unutra (Val 1 + minimalni dio Vala 2):**
- Blok A u cijelosti (Krug + KrugMember + preset + role).
- Blok B u read-only obliku (helperi za visibility/operativnu upotrebu po roli+presetu).
- Blok C samo za **steady-state `active`**: owner kao billing nositelj, bez tranzicijskih konteksta, bez `grace`/`read_only` flowova.
- Blok D **samo za radnje koje preset eksplicitno zahtijeva u steady-state** (npr. kooptacija drugog člana u Supružnik/partner). Sve ostalo može čekati.

**Smije čekati kasniji val:**
- Cijeli Blok E (takeover/continuity tranzicije).
- Cijeli Blok F osim onog što je nužno za demonstraciju jednog tipa shared resursa (preporučeno: shared payment source kao prvi, jer je već najbliži postojećem `family_shared_sources`).
- Blok G u potpunosti dok F nije postavljen.
- Blok H u potpunosti.
- Blok I u potpunosti.

**Što ovaj skeleton sigurno NE smije imati:**
- "bilo koji član" formulacije nigdje (Access Matrix v1.3 + State Machine v1.3.2 to izričito zabranjuju).
- Governance odluke za običnog člana.
- Steady-state billing pravo za punopravnog člana.
- Transakcije s `krug_id` prije nego Blok G ima jasnu semantiku.

Ovo je granica iza koje sustav prestaje biti "pošten prema foundationu" ako se prerano proširi.

---

## 5. Najveći rizici pogrešnog redoslijeda

1. **Krenuti od Bloka G (transakcijska Krug-semantika) prije Bloka F (link sloj)** → svaka transakcija mora znati na koji shared resurs pokazuje; ako link sloj kasnije promijeni shape, sve postojeće transakcije se migriraju retroaktivno. **Tehnički dug + rizik krivog atribuiranja salda.**
2. **Implementirati Blok E (takeover) prije D (governance)** → tranzicije bez kontrole tko ih smije pokrenuti; u kombinaciji sa starom formulacijom "bilo koji član" iz pre-v1.3.2 ere = **direktan security/privacy incident**.
3. **Implementirati Blok H (post-delete) prije F+G** → cascade pravila bez ciljeva; ili se ne aktiviraju, ili se aktiviraju kasnije retroaktivno → **rizik tihih data-loss bugova**.
4. **Spojiti Blok C i E u jedan val** → steady-state owner pravila se pomiješaju s tranzicijskim iznimkama; granica "owner-only u steady-state vs spec-dodijeljeni punopravni član u tranziciji" se izgubi → **semantički kaos u billing accessu**.
5. **Krenuti od UI-ja prije Bloka B (read-path access helperi)** → UI count će raditi ad-hoc provjere koje će se razići od stvarnih pravila kad ih budemo formalizirali → **dvostruka istina, klasični izvor bugova**.
6. **Uvesti shared resource link sloj kao novu generic tablicu** umjesto per-resource refactora → suprotno Structural Choice v1.1 + Domain Model v1.1 §2.7 → **lažna apstrakcija koja ne odgovara stvarnim resursima**.
7. **Implementirati governance bez Access Matrix §2 mapiranja** → obični član bi mogao završiti u proposal/consent tokovima → **izravna kontradikcija foundationa**.

---

## 6. Što ovaj dokument NIJE

- nije SQL plan (kolone, tipovi, indeksi, constraints)
- nije RLS plan (policy formulacije, helper funkcije, security definer rutine)
- nije UI plan (ekrani, navigacija, komponente)
- nije rollout plan (faze po korisnicima, migracija `family_*` → `krug_*`, feature flag strategija)
- nije naming plan (kad i kako enum/role/tablice mijenjaju imena)

Sve gore navedeno dolazi kasnije, svaki u svom dokumentu.

---

## 7. Zaključak

1. **Redoslijed je dovoljno jasan.** 5 valova, 9 blokova, čista ovisnosna mreža. Prvi sigurni kostur je definiran (A + B-read + C-steady + D-minimalno). Najveći rizici eksplicitno označeni.

2. **Sljedeći dokument — preporuka:**
   - **`Naming & Migration Strategy v1`** — *preporučeno*. Prije SQL plana treba zatvoriti: kada `family_*` postaje `krug_*`, što ostaje pod starim imenom radi backward kompatibilnosti, kako se enum vrijednosti mapiraju (`limited`/`full` ↔ obični/punopravni član), što s postojećim `family_groups` redovima u trenutku prelaska. Bez ove odluke SQL plan bi se morao dva puta pisati.
   - Alternativa: **`SQL / Schema Plan v1`** ako želiš odmah u konkretne kolone uz prihvaćanje da će se naming pitanja rješavati usput. Manje uredno, ali brže do prvog migration draft-a.
   - **`UI Surface Plan v1`** je preuranjen — UI bez Blokova A–C nema na što se vezati.

Reci "prihvaćam Implementation Order v1" ili javi korekcije.
