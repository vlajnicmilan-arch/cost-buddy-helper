# Continuity & Billing State Machine v1.3.2 — uskladbeni patch

Mali patch iznad v1.3.1. Bez novog scope-a, bez novih stanja, bez novih pravila. Jedina svrha: ukloniti formulaciju "bilo koji član" za `read_only` reaktivaciju i poravnati dokument s `Krug Access Matrix v1.3`.

---

## 1. Što se mijenja

### 1.1 Jedina supstantivna izmjena

Stara formulacija (v1.3.1):

> `read_only` reaktivaciju može pokrenuti bilo koji član Kruga unutar 30 dana.

Nova formulacija (v1.3.2):

> `read_only` reaktivaciju može pokrenuti **owner** ili **punopravni član kojem `Takeover Conditions Spec v1.1` eksplicitno dodjeljuje pravo na tu radnju u tom tranzicijskom kontekstu**, unutar definiranog reaktivacijskog prozora. Obični član ne sudjeluje. Formulacija "bilo koji član" se eksplicitno povlači.

Prozor (30 dana ili koliko god je već definirano) ostaje **nepromijenjen** — patch ne dira trajanje, samo tko smije izvršiti radnju.

### 1.2 Terminološko usklađivanje

Tamo gdje se `confirmed transfer`, `fallback takeover` i `read_only reaktivacija` u dokumentu spominju kao "stanja", preformulirati u **tranzicijski konteksti / prozori / flowovi**, identično kao u Access Matrix v1.3 §1.4 i §3.9.

Stanja Kruga iz state machine-a (`active`, `grace`, eventualno `read_only` kao stanje Kruga, …) **ostaju "stanja"** — riječ se povlači samo za tri tranzicijska konteksta gore.

### 1.3 Cross-reference

Dodati eksplicitnu referencu da je autoritativni izvor "tko smije" za billing/tranzicijske radnje **`Krug Access Matrix v1.3` §1.4, §3.9, §3.10** + **`Takeover Conditions Spec v1.1`**. State machine više ne propisuje access pravila samostalno — on opisuje **kada** je radnja moguća (stanje + prozor), access matrix + takeover spec propisuju **tko** smije.

---

## 2. Što se NE mijenja

- broj stanja Kruga
- nazivi stanja
- tranzicije između stanja
- trajanje reaktivacijskog prozora (30 dana ili koliko je već zaključano)
- pravila za `confirmed transfer` i `fallback takeover` (access tamo je već bio uži, ne dira se)
- visibility billing detalja (ostaje prema spec-u)

---

## 3. Changelog blok koji se dodaje u dokument

> ## Changelog v1.3.2 (uskladbeni patch)
>
> 1. **`read_only` reaktivacija** — uklonjena formulacija "bilo koji član". Reaktivaciju izvršava owner ili punopravni član kojem `Takeover Conditions Spec v1.1` eksplicitno dodjeljuje to pravo u tranzicijskom kontekstu reaktivacije. Obični član ne sudjeluje. Trajanje prozora nepromijenjeno.
> 2. **Terminologija** — `confirmed transfer`, `fallback takeover` i `read_only reaktivacija` više se ne nazivaju "stanjima" nego **tranzicijskim kontekstima / prozorima / flowovima**. Riječ "stanje" ostaje rezervirana za stanja Kruga.
> 3. **Authority split** — eksplicitno priznato: state machine opisuje **kada** je tranzicijska billing radnja moguća; **tko** je smije izvršiti propisuje `Krug Access Matrix v1.3` (§1.4, §3.9, §3.10) zajedno s `Takeover Conditions Spec v1.1`. Kontradikcija s Access Matrix v1.3 time je zatvorena.

---

## 4. Status

- Patch je čisto tekstualan. Nema novih stanja, nema novih tranzicija, nema novih prozora, nema promjena trajanja.
- Nakon prihvaćanja: state machine v1.3.2 + access matrix v1.3 + takeover spec v1.1 čine konzistentan trokut bez preostalih kontradikcija oko `read_only` reaktivacije.

Reci "prihvaćam v1.3.2" ili javi korekcije.
