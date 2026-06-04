# Krug Implementation Order v1.1 — uskladbeni patch

Patch nad v1. Bez novog scopea. Samo uskladba s 3 zaključana pravila:

1. Lifecycle stanja Kruga su striktno: `active`, `early_signal`, `ugrožen`, `continuity_window`, `read_only`, `deleted`. **Nema `grace`.**
2. `KrugMember` nosi samo `status` (`punopravni` / `obični`). Owner ide kroz zaseban **`KrugOwnership`** sloj — nije rola na članu.
3. Preset Kruga je **fiksan nakon stvaranja**. Promjena preseta nije governance radnja i ne ulazi u implementacijski red.

---

## Izmijenjeni dijelovi

### Blok A — Core Krug + Membership + Ownership *(zamjena)*

**Sadrži:**
- `Krug` (id, preset, created_at, `lifecycle_state` default `active`; preset **immutable** nakon insertanja).
- `KrugOwnership` (krug_id, owner_user_ref, assigned_at, [opcionalno] previous_owner_user_ref za audit). Točno jedan aktivni ownership red po Krugu.
- `KrugMember` (krug_id, user_ref, **status: `punopravni` / `obični`**, joined_at, member_state). **Bez `role: owner`** — owner se izvodi iz `KrugOwnership`, ne iz membershipa.
- Preset enum (`spouse_partner`, `coparent`, `roommate`).

**Preduvjet:** ništa unutar Kruga (samo auth + profiles).
**Otključava:** sve ostalo.

**Eksplicitno NIJE u Bloku A:**
- promjena preseta (ne postoji kao normalan tok).
- promjena ownera (to je Blok E — Takeover/Continuity).

---

### Blok C — Ownership + Lifecycle (steady-state) *(zamjena)*

**Sadrži:**
- Owner (iz `KrugOwnership`) kao billing nositelj **isključivo u steady-state `active`**.
- Lifecycle stanje **`active`** kao jedino izvršivo stanje u ovom bloku.
- Ostala stanja iz State Machine v1.3.2 (`early_signal`, `ugrožen`, `continuity_window`, `read_only`, `deleted`) — modelirana kao **enum vrijednosti i opis tranzicija**, ali bez izvršivih flowova; oni dolaze u Bloku E (continuity_window/read_only) i Bloku H (deleted).
- Eksplicitni billing-owner gate iz Access Matrix v1.3 §1.4 (steady-state dio).

**Preduvjet:** Blok A. Blok B preporučen.
**Otključava:** Blok D, Blok E.

**Eksplicitno NIJE u Bloku C:**
- `grace` — **ne postoji** u zaključanom state machineu, uklonjeno iz svih formulacija.
- bilo koji billing-tranzicijski kontekst (sve to je Blok E).

---

### Blok D — Governance (proposal/consent) *(zamjena)*

**Sadrži:** Governance artefakte iz Domain Model v1.1, propose/confirm/reject prema Governance Matrix v1.3 po presetu. Bez `majority`. Obični član nema governance prava (Access Matrix v1.3 §2).

**Preduvjet:** Blokovi A, B, C.
**Otključava:** strukturne izmjene Kruga koje nisu owner-unilateral — **kooptacija** i **isključenje člana**.

**Eksplicitno NIJE u Bloku D:**
- **promjena preseta** — preset je fiksan nakon stvaranja; ne postoji normalan governance tok za to i ne ulazi u implementacijski red.
- ownership transfer — to je Blok E.

---

### Blok E — Takeover + Continuity tranzicije *(mala uskladba)*

Tranzicijski konteksti: `confirmed transfer`, `fallback takeover`, `read_only` reaktivacija. Tranzicije se odvijaju kroz lifecycle stanja **`early_signal` → `ugrožen` → `continuity_window` → (`active` | `read_only`)** prema State Machine v1.3.2. Izvršitelj: owner (iz `KrugOwnership`) ili spec-dodijeljeni punopravni član (Access Matrix v1.3 §3.10).

(Ostatak Bloka E nepromijenjen.)

---

## Ostale promjene

- Iz sekcije **3. Redoslijed ovisnosti / Kritični konflikti** uklanja se svaki implicitni spomen `grace` (u v1 ga eksplicitno nije bilo; ovo je preventivna napomena za buduće revizije).
- Iz sekcije **4. Prvi sigurni kostur**, stavka pod "Mora biti unutra → Blok D" mijenja se iz:
  > "Blok D samo za radnje koje preset eksplicitno zahtijeva u steady-state (npr. kooptacija drugog člana u Supružnik/partner)."
  
  u:
  > "Blok D samo za radnje koje preset eksplicitno zahtijeva u steady-state (npr. **kooptacija** drugog člana u Supružnik/partner). **Promjena preseta nije u opsegu** — preset je fiksan nakon stvaranja."
- U sekciji **4. Što ovaj skeleton sigurno NE smije imati** dodaje se:
  - "owner kao polje na `KrugMember` (owner ide isključivo kroz `KrugOwnership`)."
  - "`grace` kao lifecycle stanje bilo gdje."
  - "promjena preseta kao governance/owner radnja."

Sve ostale sekcije v1 (1. Načela, 2. ostali blokovi B/F/G/H/I, 3. tablica ovisnosti, 5. Rizici, 6. Što dokument nije, 7. Zaključak) ostaju nepromijenjene.

---

## Sažetak konflikata koje patch zatvara

| # | v1 formulacija | v1.1 ispravak |
|---|----------------|---------------|
| 1 | `grace` se spominje u Bloku C | uklonjeno; lifecycle samo: `active`, `early_signal`, `ugrožen`, `continuity_window`, `read_only`, `deleted` |
| 2 | `KrugMember.role: owner/punopravni/obični` | `KrugMember.status: punopravni/obični` + zaseban `KrugOwnership` |
| 3 | "promjena preseta gdje je dopuštena" u Bloku D | uklonjeno; preset je fiksan, nije governance radnja |

Reci "prihvaćam Implementation Order v1.1" ili javi dodatne korekcije.
