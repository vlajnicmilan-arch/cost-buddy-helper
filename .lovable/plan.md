# Krug Access Matrix v1

Zatvara pitanje **tko što smije** unutar Kruga — visibility, korištenje, governance, ownership/billing, continuity/takeover — bez ulaska u RLS, UI ili rollout razinu.

Polazi striktno od već zaključenog:
`Krug Foundation v4.2`, `Preset Constraint Matrix v1`, `Governance Matrix v1.3`, `Continuity & Billing State Machine v1.3.1`, `Takeover Conditions Spec v1.1`, `Krug Domain/Data Model v1.1`, `Post-Delete Behavior Foundation Patch v1.1`, `Shared Resources Link — Structural Choice v1.1`.

Bez novog scopea. Bez novih presetova. Bez `Family`. Bez `majority`.

---

## 1. Osnovne access osi

Pet ortogonalnih osi po kojima se mjeri pravo unutar Kruga. Svaka radnja u sustavu pada u točno jednu od njih.

### 1.1 Pregled / visibility
Tko **vidi** da neki entitet uopće postoji i tko vidi njegov sadržaj. Visibility ne implicira pravo izmjene. Privatne stvari (privatne transakcije, privatne bilješke) ostaju izvan ove osi bez obzira na članstvo.

### 1.2 Operativno korištenje
Tko smije **koristiti** dijeljeni resurs u svakodnevnom radu — knjižiti transakciju na shared payment source, vezati trošak na shared budget, dodavati stavke pod shared projekt. Ne uključuje promjenu samog resursa, samo njegovu uporabu.

### 1.3 Governance odluke
Tko smije **predložiti**, tko **potvrditi**, tko **odbiti** strukturne odluke Kruga (vidi Governance Matrix v1.3): promjena preseta, kooptacija, isključenje, promjena pravila, raspuštanje. Ovo je sloj iznad operativnog korištenja.

### 1.4 Ownership / billing posebna prava
Tko nosi **billing odgovornost** za Krug, tko može mijenjati billing kontekst, tko može pokrenuti gašenje Kruga s billing strane. Ekskluzivno owner-ov sloj dok takeover ne nastupi.

### 1.5 Continuity / takeover posebna prava
Tko smije **inicirati**, **potvrditi** ili **blokirati** continuity/takeover tranziciju (vidi Continuity & Billing State Machine v1.3.1 i Takeover Conditions Spec v1.1). Privremena prava koja se aktiviraju samo u definiranim stanjima Kruga, ne u steady-state.

---

## 2. Matrix po vrstama članova i presetima

Tri vrste članova prema foundationu:
- **owner** — kreator/billing nositelj Kruga
- **punopravni član** — član s punim governance pravima unutar preseta
- **obični član** — član s ograničenim governance pravima

Za svaki preset niže matrica opisuje što svaka vrsta člana smije. Ako preset ne razlikuje "punopravni" i "obični" (npr. Supružnik/partner je strogo 2-osobni paritet), to je eksplicitno označeno.

### 2.1 Preset: Supružnik / partner

Strogo dva člana, oba punopravna po definiciji preseta. Kategorija "obični član" se u ovom presetu **ne pojavljuje**.

**Owner (jedan od dvoje):**
- vidi: sve unutar Kruga osim privatnih stavki drugog člana
- koristi: sve shared resurse Kruga
- predlaže: sve governance odluke koje preset dopušta
- potvrđuje: governance odluke prema Governance Matrix v1.3 (paritetna potvrda gdje preset to traži)
- billing: nosi pretplatu Kruga, smije mijenjati billing kontekst, smije pokrenuti gašenje s billing strane
- continuity/takeover: smije inicirati svoju stranu tranzicije; ne može sam dovršiti takeover bez druge strane prema Takeover Conditions Spec v1.1
- ne smije: zaobići paritet, jednostrano izbaciti drugog člana, jednostrano promijeniti preset

**Punopravni član (drugi):**
- vidi: identično owneru osim billing detalja koji su owner-only
- koristi: identično owneru
- predlaže / potvrđuje: identično owneru (paritet)
- billing: ne nosi pretplatu, ne mijenja billing kontekst; smije inicirati takeover prema Takeover Conditions Spec v1.1
- continuity/takeover: ravnopravan inicijator/potvrditelj prema spec-u
- ne smije: vidjeti billing detalje ownera, niti jednostrano promijeniti preset

### 2.2 Preset: Su-roditelj

Dva ili više članova, asimetrija dopuštena. Razlikuje "punopravni" (su-roditelj s punim governance pravima) i "obični" (npr. odrasli ukućanin koji nije roditelj, ako preset to dopušta).

**Owner:**
- vidi: sve unutar Kruga osim privatnih stavki drugih
- koristi: sve shared resurse
- predlaže/potvrđuje: prema Governance Matrix v1.3 za Su-roditelj preset
- billing: standardna ownership prava kao u 2.1
- continuity/takeover: standardno; takeover prema spec-u
- ne smije: zaobići governance pravila preseta

**Punopravni član:**
- vidi: sve shared, osim privatnih stavki drugih i osim billing detalja ownera
- koristi: sve shared resurse
- predlaže: sve odluke koje Governance Matrix dopušta punopravnima za ovaj preset
- potvrđuje: prema Governance Matrix v1.3 (više nego obični član, manje nego owner u billing pitanjima)
- billing: ne; takeover prema spec-u
- ne smije: jednostrano gasiti Krug niti mijenjati billing kontekst

**Obični član:**
- vidi: shared resurse koji su mu eksplicitno dani (vidi §3 i Shared Resources Link — Structural Choice v1.1); ne nužno cijeli sadržaj Kruga
- koristi: shared resurse na koje ima dani pristup
- predlaže: samo ono što Governance Matrix v1.3 dopušta običnom članu za Su-roditelj preset (uže od punopravnog)
- potvrđuje: samo ako Governance Matrix to eksplicitno dopušta; inače glas običnog člana ne ulazi u potvrdu strukturnih odluka
- billing/takeover: ne
- ne smije: governance odluke izvan dopuštenog opsega; pristup resursima koji mu nisu eksplicitno dani

### 2.3 Preset: Cimer

Dva ili više članova, niži kohezijski model. Razlikuje punopravnog i običnog člana, ali shared resursi su tipično uži nego u Su-roditelj presetu.

**Owner:**
- vidi: shared kontekst Kruga, ne privatne stavke drugih
- koristi: sve shared resurse
- predlaže/potvrđuje: prema Governance Matrix v1.3 za Cimer preset
- billing: standardna ownership prava
- continuity/takeover: standardno; takeover prema spec-u
- ne smije: zaobići dogovorenu užu kohezijsku semantiku preseta

**Punopravni član:**
- vidi: shared resurse i shared governance kontekst
- koristi: sve shared resurse
- predlaže/potvrđuje: prema Governance Matrix v1.3 (pravila Cimer preseta su uža od Su-roditelj)
- billing: ne; takeover prema spec-u
- ne smije: governance opseg izvan onog što Cimer preset eksplicitno dopušta

**Obični član:**
- vidi: samo eksplicitno dane shared resurse
- koristi: samo eksplicitno dane shared resurse
- predlaže: minimalno, prema Governance Matrix v1.3 za Cimer / obični član
- potvrđuje: u pravilu ne; samo gdje Governance Matrix eksplicitno spominje
- billing/takeover: ne
- ne smije: ono što nije eksplicitno dopušteno

---

## 3. Access po tipovima objekata

Za svaki tip objekta u Krugu izvodi se isto pitanje: tko ga **vidi**, tko ga **koristi**, tko ga **mijenja**. Pravila ovdje izviru iz §1 i §2 i iz `Shared Resources Link — Structural Choice v1.1` (link tablica je posrednica; resurs ostaje vlasnikov entitet).

### 3.1 Sam Krug (entitet)
- **Vidi**: svi članovi Kruga (postojanje, naziv, preset, popis članova prema preset pravilima).
- **Mijenja meta (naziv, preset)**: prema Governance Matrix v1.3 — tipično owner + paritet ili paritet punopravnih, ovisno o presetu.
- **Briše/gasi**: owner inicira; tranzicija ide kroz Continuity & Billing State Machine v1.3.1; takeover prema spec-u.

### 3.2 Članstvo (KrugMember)
- **Vidi popis članova**: svi članovi Kruga.
- **Vidi role/status pojedinog člana**: svi članovi Kruga (transparentnost je preduvjet governancea).
- **Dodaje/uklanja člana (kooptacija/isključenje)**: prema Governance Matrix v1.3 po presetu; obični član u pravilu nema ovo pravo.
- **Mijenja sebi status**: ne; samo izlazak iz Kruga je jednostrana radnja, ostalo ide kroz governance.

### 3.3 Shared payment sources
- **Vidi postojanje shared source-a**: svi članovi kojima je source eksplicitno dijeljen kroz link sloj (vidi Structural Choice v1.1).
- **Koristi (knjiži transakciju na njega)**: punopravni članovi kojima je dijeljen; obični članovi samo ako im je eksplicitno dan.
- **Mijenja sam resurs (preimenuje, gasi)**: **vlasnik resursa**, ne Krug. Krug može samo otkazati dijeljenje (ukloniti link).
- **Dijeli / uklanja iz dijeljenja**: vlasnik resursa, prema načelima iz Structural Choice v1.1.

### 3.4 Shared budgets
- **Vidi**: kao 3.3.
- **Koristi (veže trošak)**: punopravni članovi kojima je dijeljen; obični po eksplicitnom davanju.
- **Mijenja sam budget (limit, kategorije)**: vlasnik budgeta.
- **Dijeli/uklanja**: vlasnik budgeta.

### 3.5 Shared projekti
- **Vidi**: članovi kojima je projekt dijeljen.
- **Koristi (dodaje stavke, milestone unutar dopuštene role)**: prema project member roli koja je već definirana izvan Kruga (manager/worker/collaborator); Krug ne mijenja te uloge, samo posreduje u dijeljenju.
- **Mijenja sam projekt**: vlasnik projekta i manager prema postojećim pravilima projekata.
- **Dijeli/uklanja**: vlasnik projekta.

### 3.6 Shared ciljevi / dokumenti / ostali resursi
Identičan obrazac kao 3.3–3.5: vlasnik resursa kontrolira sam resurs i dijeljenje; Krug je posrednik kroz link sloj; korištenje slijedi vrstu člana i preset.

### 3.7 Transakcije
- **Privatne**: vidi i mijenja **isključivo** vlasnik. Krug ne dobiva pristup bez obzira na role.
- **Shared (na shared resursu)**: vidi vlasnik transakcije + članovi kojima je taj resurs dijeljen, prema visibility pravilima resursa.
- **Mijenja shared transakciju**: vlasnik transakcije; drugi članovi ne mijenjaju tuđe transakcije.
- **Post-delete Kruga**: prema Patch v1.1 — transakcija ostaje vlasniku, Krug-specifična metadata se uklanja.

### 3.8 Governance artefakti (prijedlozi, glasovi, odluke)
- **Vidi**: svi članovi Kruga koje ta odluka pogađa (transparentnost glasanja unutar Kruga).
- **Predlaže/glasuje/potvrđuje**: striktno prema Governance Matrix v1.3 po presetu i vrsti člana.
- **Mijenja zatvorenu odluku**: ne; samo nova odluka može nadjačati prethodnu.

### 3.9 Billing / pretplata
- **Vidi billing detalje**: owner.
- **Vidi status pretplate Kruga (active/grace/…)**: svi članovi (continuity zahtijeva transparentnost stanja).
- **Mijenja billing**: owner; takeover prema Takeover Conditions Spec v1.1.

### 3.10 Continuity / takeover artefakti
- **Vidi continuity stanje Kruga**: svi članovi.
- **Inicira tranziciju**: prema Continuity & Billing State Machine v1.3.1 i Takeover Conditions Spec v1.1 — owner i/ili definirani punopravni članovi, ovisno o stanju.
- **Potvrđuje takeover**: prema spec-u; obični članovi nemaju ovo pravo.

---

## 4. Odnos prema već zaključenom

- **Governance Matrix v1.3** ostaje **autoritet** za sve "predlaže / potvrđuje / odbija" pojedinosti po presetu i vrsti člana. Ovaj dokument ne dodaje nova governance pravila, samo ih organizira kroz pet osi i tri vrste člana.
- **Continuity & Billing v1.3.1 + Takeover v1.1** ostaju autoritet za sve continuity/takeover specifičnosti. Ovdje su samo locirani u §1.4 i §1.5.
- **Preset Constraint Matrix v1** definira koje vrste članova preset uopće dopušta (npr. Supružnik/partner nema "običnog člana"). Ova matrica ne smije proizvesti kombinaciju koju preset ne dopušta.
- **Structural Choice v1.1** definira **kako** se shared resurs vezuje na Krug. Ova matrica koristi taj sloj kao izvor pravila "tko vidi/koristi shared resurs", ali ne propisuje schemu.
- **Post-Delete Patch v1.1** određuje što se dogodi s pristupom nakon brisanja Kruga. §3.7 to eksplicitno spominje za transakcije; isti princip vrijedi za sve shared objekte (link nestaje, resurs ostaje vlasniku).

---

## 5. Što ova matrica eksplicitno **NE** rješava

Svjesno izvan scope-a:
- RLS policy formulacije, helper funkcije, security definer rutine
- konkretni UI placement (gdje se gumb pojavljuje, koje stanje se prikazuje)
- rollout / migracija postojećih `family_*` uloga u Krug vrste člana
- konkretni nazivi role enuma u bazi
- access matrix za **system-level audit** (admin/forensic) — to je odvojen sloj izvan Kruga
- ponašanje za vanjske (ne-članove) — izvan domene Kruga

---

## 6. Status

- **Access matrix je zaključan na razini načela.** Sve buduće implementacije (RLS, UI gating, hook-ovi) moraju se moći obrazložiti kroz §1 osi i §2 matricu, bez novih izmišljenih pravila.
- Ako se u kasnijem dokumentu pojavi potreba za pravilom koje ova matrica ne pokriva, prvo se vraća **ovdje** i nadograđuje na razini načela, pa tek onda u implementaciju.

---

## 7. Što slijedi (preporuka, ne odluka)

- **`Krug Implementation Order v1`** — prevodi cijeli foundation (uključujući ovu matricu) u redoslijed izgradnje.
- Alternativa: **`Krug Naming & Migration Strategy v1`** — kad i kako `family_*` postaje `krug_*` u kodu, RLS-u i UI-u.

Reci "prihvaćam v1" ili javi korekcije.
