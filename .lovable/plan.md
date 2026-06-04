# Krug Access Matrix v1.2

Pojašnjenje billing accessa u odnosu na continuity/takeover scenarije. Bez novog scope-a, bez novih ideja.

Polazi striktno od već zaključenog:
`Krug Foundation v4.2`, `Preset Constraint Matrix v1`, `Governance Matrix v1.3`, `Continuity & Billing State Machine v1.3.1`, `Takeover Conditions Spec v1.1`, `Krug Domain/Data Model v1.1`, `Post-Delete Behavior Foundation Patch v1.1`, `Shared Resources Link — Structural Choice v1.1`.

Bez `Family`. Bez `majority`.

---

## 1. Osnovne access osi

### 1.1 Pregled / visibility
Tko **vidi** da neki entitet uopće postoji i tko vidi njegov sadržaj. Visibility ne implicira pravo izmjene. Privatne stvari ostaju izvan ove osi.

### 1.2 Operativno korištenje
Tko smije **koristiti** dijeljeni resurs u svakodnevnom radu. Ne uključuje promjenu samog resursa.

### 1.3 Governance odluke
Tko smije **predložiti**, **potvrditi**, **odbiti** strukturne odluke Kruga (vidi Governance Matrix v1.3).

### 1.4 Ownership / billing posebna prava
Tko nosi **billing odgovornost** za Krug. Ova os ima **dva odvojena režima**:

- **Steady-state (`active`)**: billing detalje vidi i mijenja **isključivo owner**. Niti jedan punopravni ni obični član nema billing pravo u ovom stanju.
- **Continuity / takeover iznimke**: u stanjima `confirmed transfer`, `fallback takeover` i `read_only` reaktivaciji, billing-relevantne radnje slijede **isključivo pravila iz Takeover Conditions Spec v1.1 i Continuity & Billing State Machine v1.3.1**. U tim stanjima definirani punopravni članovi mogu pokrenuti, potvrditi ili dovršiti billing tranziciju prema spec-u — bez da to znači da postaju trajni billing owner Kruga.

Ova matrica ne propisuje **koje** točno radnje su dopuštene u kojem stanju — to ostaje u domeni spec-ova. Ovdje se samo eksplicitno priznaje da steady-state owner-only ekskluzivnost **ne važi** za continuity/takeover prozore.

### 1.5 Continuity / takeover posebna prava
Tko smije **inicirati**, **potvrditi** ili **blokirati** continuity/takeover tranziciju (vidi Continuity & Billing State Machine v1.3.1 i Takeover Conditions Spec v1.1). Privremena prava aktivna samo u definiranim stanjima Kruga.

---

## 2. Matrix po vrstama članova i presetima

Tri vrste članova prema foundationu, **globalne uloge dostupne u svim presetima**:
- **owner** — kreator/billing nositelj Kruga
- **punopravni član** — član s punim governance pravima unutar preseta
- **obični član** — **operativni član bez governance prava**: vidi sve transakcije Kruga, može dodavati vlastite transakcije u granicama svog modula; **ne predlaže, ne potvrđuje, ne glasa, nema veto**

U nekim presetima `obični član` nije tipična ni defaultna uloga, ali kategorija postoji u sva tri preseta.

### 2.1 Preset: Supružnik / partner

Strogo dva člana. Tipično su oba punopravna (defaultna konfiguracija). Kategorija `obični član` ovdje **nije tipična ni defaultna**, ali kao globalna uloga ostaje dostupna.

**Owner (jedan od dvoje):**
- vidi: sve unutar Kruga osim privatnih stavki drugog člana
- koristi: sve shared resurse Kruga
- predlaže/potvrđuje: prema Governance Matrix v1.3 (paritet)
- billing (steady-state): nosi pretplatu, vidi billing detalje, mijenja billing kontekst, pokreće gašenje s billing strane
- continuity/takeover: smije inicirati svoju stranu tranzicije; billing radnje u tim stanjima slijede Takeover Conditions Spec v1.1
- ne smije: zaobići paritet, jednostrano izbaciti drugog člana, jednostrano promijeniti preset

**Punopravni član (drugi):**
- vidi: identično owneru osim billing detalja (owner-only u steady-state)
- koristi: identično owneru
- predlaže/potvrđuje: identično owneru (paritet)
- billing (steady-state): nema owner/billing ownership ovlasti kao owner
- billing/continuity iznimke: u stanjima `confirmed transfer`, `fallback takeover`, `read_only` reaktivacija — smije pokrenuti/potvrditi/dovršiti billing-relevantnu tranziciju prema Takeover Conditions Spec v1.1 i Continuity & Billing State Machine v1.3.1
- ne smije: vidjeti billing detalje ownera izvan onoga što tranzicijski spec dopušta; jednostrano promijeniti preset

**Obični član (ako se koristi izvan defaulta):**
- vidi: sve transakcije Kruga
- koristi: dodaje vlastite transakcije u granicama svog modula
- governance: ne predlaže, ne potvrđuje, ne glasa, nema veto
- billing/takeover: ne (ni u steady-state ni u tranzicijskim stanjima)

### 2.2 Preset: Su-roditelj

Dva ili više članova, asimetrija dopuštena. Sve tri globalne uloge su moguće.

**Owner:**
- vidi: sve unutar Kruga osim privatnih stavki drugih
- koristi: sve shared resurse
- predlaže/potvrđuje: prema Governance Matrix v1.3 za Su-roditelj preset
- billing (steady-state): standardna ownership prava
- continuity/takeover: standardno; tranzicije prema spec-u
- ne smije: zaobići governance pravila preseta

**Punopravni član:**
- vidi: sve shared, osim privatnih stavki drugih i osim billing detalja ownera (u steady-state)
- koristi: sve shared resurse
- predlaže/potvrđuje: prema Governance Matrix v1.3
- billing (steady-state): nema owner/billing ownership ovlasti kao owner
- billing/continuity iznimke: u `confirmed transfer` / `fallback takeover` / `read_only` reaktivaciji — smije pokrenuti/potvrditi/dovršiti billing tranziciju prema Takeover Conditions Spec v1.1 i Continuity & Billing State Machine v1.3.1
- ne smije: jednostrano gasiti Krug niti mijenjati billing kontekst izvan tranzicijskih prozora

**Obični član:**
- vidi: sve transakcije Kruga
- koristi: dodaje vlastite transakcije u granicama svog modula
- governance: ne predlaže, ne potvrđuje, ne glasa, nema veto
- billing/takeover: ne

### 2.3 Preset: Cimer

Dva ili više članova, niži kohezijski model. Sve tri globalne uloge su moguće.

**Owner:**
- vidi: shared kontekst Kruga, ne privatne stavke drugih
- koristi: sve shared resurse
- predlaže/potvrđuje: prema Governance Matrix v1.3 za Cimer preset
- billing (steady-state): standardna ownership prava
- continuity/takeover: standardno; tranzicije prema spec-u
- ne smije: zaobići dogovorenu užu kohezijsku semantiku preseta

**Punopravni član:**
- vidi: shared resurse i shared governance kontekst
- koristi: sve shared resurse
- predlaže/potvrđuje: prema Governance Matrix v1.3 (Cimer pravila uža od Su-roditelj)
- billing (steady-state): nema owner/billing ownership ovlasti kao owner
- billing/continuity iznimke: kao u 2.2 — prema Takeover Conditions Spec v1.1 i Continuity & Billing State Machine v1.3.1
- ne smije: governance opseg izvan onog što Cimer preset eksplicitno dopušta

**Obični član:**
- vidi: sve transakcije Kruga
- koristi: dodaje vlastite transakcije u granicama svog modula
- governance: ne predlaže, ne potvrđuje, ne glasa, nema veto
- billing/takeover: ne

---

## 3. Access po tipovima objekata

### 3.1 Sam Krug (entitet)
- **Vidi**: svi članovi Kruga.
- **Mijenja meta (naziv, preset)**: prema Governance Matrix v1.3. Obični član ne sudjeluje.
- **Briše/gasi**: owner inicira u steady-state; u tranzicijskim stanjima prema Continuity & Billing State Machine v1.3.1 i Takeover Conditions Spec v1.1.

### 3.2 Članstvo (KrugMember)
- **Vidi popis i role/status članova**: svi članovi Kruga.
- **Dodaje/uklanja člana (kooptacija/isključenje)**: prema Governance Matrix v1.3 po presetu; obični član nema ovo pravo.
- **Mijenja sebi status**: ne; samo izlazak iz Kruga je jednostrana radnja.

### 3.3 Shared payment sources
- **Vidi postojanje shared source-a**: članovi kojima je source dijeljen kroz link sloj.
- **Koristi**: članovi kojima je source dijeljen.
- **Mijenja sam resurs**: vlasnik resursa, ne Krug.
- **Dijeli / uklanja iz dijeljenja**: vlasnik resursa.

### 3.4 Shared budgets
- **Vidi**: kao 3.3.
- **Koristi (veže trošak)**: članovi kojima je budget dijeljen.
- **Mijenja sam budget**: vlasnik budgeta.
- **Dijeli/uklanja**: vlasnik budgeta.

### 3.5 Shared projekti
- **Vidi**: članovi kojima je projekt dijeljen.
- **Koristi**: prema project member roli definiranoj izvan Kruga.
- **Mijenja sam projekt**: vlasnik projekta i manager.
- **Dijeli/uklanja**: vlasnik projekta.

### 3.6 Shared ciljevi / dokumenti / ostali resursi
Identičan obrazac kao 3.3–3.5.

### 3.7 Transakcije
- **Privatne**: vidi i mijenja **isključivo** vlasnik.
- **Shared (sve transakcije Kruga)**: vidi svaki član Kruga, uključujući običnog člana. Obični član smije dodavati vlastite transakcije u granicama svog modula.
- **Mijenja shared transakciju**: vlasnik transakcije.
- **Post-delete Kruga**: prema Patch v1.1.

### 3.8 Governance artefakti
- **Vidi**: svi članovi Kruga koje ta odluka pogađa. Obični član ima visibility ali ne predlaže, ne potvrđuje, ne glasa, nema veto.
- **Predlaže/glasuje/potvrđuje**: striktno prema Governance Matrix v1.3; ograničeno na ownera i punopravnog člana.
- **Mijenja zatvorenu odluku**: ne; samo nova odluka može nadjačati prethodnu.

### 3.9 Billing / pretplata

**Steady-state (`active`):**
- **Vidi billing detalje**: owner.
- **Vidi status pretplate Kruga (active/grace/…)**: svi članovi (transparentnost stanja je preduvjet za continuity).
- **Mijenja billing**: owner. Punopravni član nema billing pravo u steady-state. Obični član nema billing pravo nikad.

**Continuity / takeover iznimke:**
- U stanjima `confirmed transfer`, `fallback takeover` i `read_only` reaktivaciji, billing-relevantne radnje (pokretanje, potvrda, dovršenje tranzicije, preuzimanje pretplate) slijede **isključivo** Takeover Conditions Spec v1.1 i Continuity & Billing State Machine v1.3.1.
- Definirani punopravni članovi mogu u tim prozorima izvršiti tranziciju prema spec-u; to ne čini ih trajnim billing ownerom dok spec ne propiše drugačije.
- Obični član ne sudjeluje u tranzicijskim billing radnjama ni u jednom stanju.
- Visibility billing detalja u tranzicijskim stanjima slijedi spec — ova matrica ne proširuje ni ne sužava taj opseg.

### 3.10 Continuity / takeover artefakti
- **Vidi continuity stanje Kruga**: svi članovi.
- **Inicira tranziciju**: prema Continuity & Billing State Machine v1.3.1 i Takeover Conditions Spec v1.1 — owner i/ili definirani punopravni članovi, ovisno o stanju. Obični član ne inicira.
- **Potvrđuje takeover**: prema spec-u; obični član nema ovo pravo.

---

## 4. Odnos prema već zaključenom

- **Governance Matrix v1.3** ostaje autoritet za sve predlaže/potvrđuje/odbija detalje.
- **Continuity & Billing v1.3.1 + Takeover v1.1** ostaju autoritet za sve continuity/takeover specifičnosti **uključujući billing radnje u tranzicijskim stanjima**. Ova matrica eksplicitno upućuje na njih u §1.4 i §3.9.
- **Preset Constraint Matrix v1** definira tipične i defaultne konfiguracije; sve tri globalne uloge ostaju dostupne u svim presetima.
- **Structural Choice v1.1** je izvor pravila za shared resurse.
- **Post-Delete Patch v1.1** vrijedi za sve shared objekte nakon brisanja Kruga.

---

## 5. Što ova matrica eksplicitno **NE** rješava

- RLS policy formulacije, helper funkcije, security definer rutine
- konkretni UI placement
- rollout / migracija postojećih `family_*` uloga
- konkretni nazivi role enuma u bazi
- konkretne tranzicijske billing radnje po stanju (to je u Takeover spec-u i Continuity state machine-u)
- access matrix za system-level audit
- ponašanje za vanjske (ne-članove)

---

## 6. Status

- Access matrix zaključan na razini načela. Sve buduće implementacije moraju se obrazložiti kroz §1 osi i §2 matricu.
- Billing access eksplicitno razdvojen u dva režima (steady-state vs continuity/takeover iznimke) u §1.4 i §3.9.

---

## 7. Što je promijenjeno u v1.2 u odnosu na v1.1

1. **§1.4** dobio eksplicitnu podjelu na dva režima: steady-state (owner-only) vs continuity/takeover iznimke koje slijede Takeover Conditions Spec v1.1 i Continuity & Billing State Machine v1.3.1.
2. **§3.9** restrukturirana u dva bloka — "Steady-state" i "Continuity/takeover iznimke" — s eksplicitnim spomenom `confirmed transfer`, `fallback takeover` i `read_only` reaktivacije, te napomenom da punopravni član u tim prozorima može izvršiti tranziciju bez postajanja trajnim billing ownerom.
3. **§2.1, §2.2, §2.3** — kod punopravnog člana dodana zasebna stavka "billing/continuity iznimke" koja referira spec-ove, uz zadržavanje stavke "billing (steady-state)" koja eksplicitno kaže "nema owner/billing ownership ovlasti kao owner".
4. **§3.1** uklonjena implikacija da owner samostalno gasi Krug u svim stanjima — dodana referenca na tranzicijska stanja.
5. **§5** dodana stavka da konkretne tranzicijske billing radnje po stanju ostaju u domeni Takeover spec-a i Continuity state machine-a.

---

## 8. Što slijedi (preporuka, ne odluka)

- **`Krug Implementation Order v1`** — prevodi cijeli foundation u redoslijed izgradnje.
- Alternativa: **`Krug Naming & Migration Strategy v1`** — kad i kako `family_*` postaje `krug_*`.

Reci "prihvaćam v1.2" ili javi korekcije.
