
# Post-Delete Behavior Foundation Patch v1.1

Jedina promjena prema v1: razjašnjena kontradikcija oko `KrugActivityLog` nakon `deleted`. Sve ostalo nepromijenjeno.

---

## Razjašnjenje (zamjenjuje sve spominjanje `KrugActivityLog` u kontekstu post-delete povijesti)

Po već zaključanom: nakon isteka `read_only` prozora **brišu se Krug, membership, governance/consent/continuity i sva druga Krug-specifična stanja**. `KrugActivityLog` je Krug-specifično stanje. Dakle:

### `KrugActivityLog` se **briše zajedno s Krugom**.

- Nakon `deleted` **ne postoji** user-facing historijski sloj o tome što je nekoć bilo dijeljeno, u kojem Krugu, s kojim statusom.
- Korisnik više **ne može** otvoriti ekran tipa "moja povijest Krugova" za obrisani Krug. Taj entitet je nestao u cijelosti, namjerno i u skladu s foundationom.
- Ovo je svjesna razmjena: čistoća modela i poštivanje brisanja Krug-metadata > inline historijski kontekst.

### Što ipak smije postojati (i nije kontradikcija)

**Zaseban interni audit trag** (npr. system-level log brisanja Kruga, GDPR-compliance zapis, admin-only forensic event) **smije postojati**, ali:
- nije `KrugActivityLog`
- nije user-facing
- ne sadrži operativnu Krug-metadata (membership, governance, consent zapise)
- živi izvan Krug entiteta (sustavski log) i podliježe vlastitim retencijskim pravilima

Ovaj patch **ne propisuje** postojanje tog audit traga niti njegovu strukturu — to je odluka sigurnosnog/GDPR sloja, izvan B-2.

### Posljedice za §1, §2, §3 patcha v1

Sve formulacije iz v1 koje su rekle "historija živi u `KrugActivityLog`" mijenjaju se u:

> Historija o Krug-specifičnim atributima transakcije (`krug_id` koji je bio, `privacy = shared` koje je bilo, `shared_status` koji je bio) **ne preživljava** brisanje Kruga kao user-facing podatak. Preživljava isključivo sama transakcija — njen iznos, datum, kategorija, payment source, opis, vlasništvo — kao korisnikov osobni zapis bez Krug konteksta.

### Posljedice za §7 patcha v1 (preporučena semantika)

Točka 6 originalne preporuke ("Historija živi u `KrugActivityLog`, ne na transakcijskom zapisu") **uklanja se** i zamjenjuje:

> 6. Nakon brisanja Kruga **ne postoji user-facing historijski zapis** o tome da je transakcija nekoć bila dijeljena. Korisniku ostaje samo sama transakcija kao osobni unos. Ako sustav kasnije želi inline trag, mora se uvesti namjenski **frozen atribut na samoj transakciji** (npr. read-only `krug_label_historical: text` snapshot) — ali to je posebna buduća odluka, ne dio ovog patcha.

### Posljedice za §1 (sudbina `krug_id`)

Spomen "opcionalnog read-only historijskog atributa (`krug_id_historical` ili JSONB snapshot)" iz v1 **ostaje važeći kao moguća buduća opcija**, ali se eksplicitno preimenuje u **frozen tekstualni snapshot** (npr. ime Kruga kao string), **ne** strani ključ na bilo što što više ne postoji. Razlog: FK na obrisani entitet je upravo polu-definirano stanje koje patch zabranjuje.

---

## Što se NIJE promijenilo

- Sva pravila iz §1–§6 v1 ostaju identična (`krug_id` → null, `privacy=shared` → `personal`, `shared_status` → null, atomarnost, razlika `read_only` vs `deleted`).
- Invarianta ostaje identična: `krug_id IS NULL` ⟹ `privacy ∈ {private, personal}` AND `shared_status IS NULL`.
- Preporučena semantika "tihi povratak na osobno" ostaje, samo s ažuriranom točkom 6.
- Korisnička obavijest pri brisanju Kruga ostaje preporuka — sada još važnija jer poslije nema gdje pogledati što je bilo.

---

## Kritički osvrt (ažuriran)

**Snaga:** Kontradikcija eliminirana. Model je sada interno konzistentan s foundationom: brisanje Kruga znači **brisanje cijele Krug-metadata, uključujući log**. Nema više dvije konkurentske tvrdnje.

**Slabost:** Korisnik koji se kasnije pita "je li ova transakcija bila dijeljena?" nema odgovor. Patch to prihvaća kao cijenu čistoće. Ako se kasnije pokaže da je trag potreban, jedini foundation-compatible put je **frozen snapshot na samoj transakciji**, a ne resurrekcija loga.

**Rizik:** GDPR/forensic potreba za internim trag o brisanjima može tražiti zaseban sustavski log. To nije isto što i `KrugActivityLog` i ne smije se s njim miješati. Sigurnosni layer to mora adresirati zasebno.

---

# Status

Kontradikcija razjašnjena. Bez novog scope-a. Bez nove velike verzije.

Reci "prihvaćam v1.1" pa idemo na `Shared Resources Link — Structural Choice v1`.
