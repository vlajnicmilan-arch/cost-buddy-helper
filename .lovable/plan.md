# Krug Transaction Semantics Schema Plan v1.3

## Status

Nije implementacijski plan.

Ovaj dokument definira samo semantiku transakcijskih polja za Krug:

- `krug_id`
- `krug_privacy`
- `krug_shared_status`

Ne uvodi SQL, RPC, RLS politike, UI, agregacije, settlement logiku ni migracije postojećih podataka.

## 1. Svrha

Cilj je zaključati značenje transakcijske pripadnosti Krugu i značenje approval toka za transakcije koje korisnik želi tretirati kao zajedničke.

Ovaj dokument ne odlučuje tko smije vidjeti ili mijenjati transakciju. Vidljivost se izvodi iz pravila/preseta Kruga i pripada zasebnom RLS / visibility planu.

## 2. Polja

### 2.1 `krug_id`

`krug_id` označava kontekst Kruga u kojem se transakcija nalazi.

Semantika:

- `NULL` = transakcija nije u Krug kontekstu
- `<id>` = transakcija pripada određenom Krugu

`krug_id` nije dokaz da je transakcija zajednička. Samo označava kontekst.

### 2.2 `krug_privacy`

`krug_privacy` ima točno tri stanja:

- `personal`
- `private`
- `shared`

Semantika:

- `personal` = osobna transakcija korisnika; ne ulazi u shared approval tok ni u split; može postojati unutar ili izvan Krug konteksta; vidljivost prema drugim članovima Kruga ovisi o pravilima/presetu Kruga i nije određena ovim poljem
- `private` = osobna transakcija u Krug kontekstu koju drugi članovi Kruga ne vide; ne ulazi u shared approval tok ni u split
- `shared` = transakcija u Krug kontekstu koja ulazi u shared approval tok

`personal` je default za uloge `Su-roditelj` i `Cimer` unutar Kruga.

Razlika `personal` ↔ `private`:

- `personal` ne odlučuje vidljivost; vidljivost dolazi iz Krug pravila/preseta
- `private` eksplicitno zaključava da druge članove ne vide tu transakciju, neovisno o presetu

### 2.3 `krug_shared_status`

`krug_shared_status` ima točno tri approval stanja:

- `predložena`
- `potvrđena`
- `nepotvrđena`

Semantika:

- `predložena` = autor je transakciju predložio kao zajedničku
- `potvrđena` = transakcija je potvrđena kao zajednička
- `nepotvrđena` = transakcija nije potvrđena kao zajednička

`krug_shared_status` ne opisuje lifecycle “shared layera”. Ne znači aktivno, povučeno, ušlo ili izašlo. Opisuje isključivo approval stanje.

## 3. Valjane kombinacije

### 3.1 Osobna transakcija izvan Kruga

```text
krug_id              = NULL
krug_privacy         = personal
krug_shared_status   = NULL
```

Značenje:

- transakcija ostaje samo korisnikova
- nema Krug kontekst
- nema approval status

### 3.2 Osobna transakcija unutar Krug konteksta

```text
krug_id              = <krug_id>
krug_privacy         = personal
krug_shared_status   = NULL
```

Značenje:

- transakcija je vezana uz Krug kontekst kao osobna
- ne ulazi u shared approval tok ni u split
- vidljivost prema drugim članovima Kruga određena je pravilima/presetom Kruga
- default za `Su-roditelj` i `Cimer`

### 3.3 Privatna transakcija u Krug kontekstu

```text
krug_id              = <krug_id>
krug_privacy         = private
krug_shared_status   = NULL
```

Značenje:

- transakcija je vezana uz Krug kontekst
- drugi članovi Kruga je ne vide, neovisno o presetu
- ne ulazi u shared approval tok ni u split

### 3.4 Predložena zajednička transakcija

```text
krug_id              = <krug_id>
krug_privacy         = shared
krug_shared_status   = predložena
```

Značenje:

- autor želi da transakcija bude zajednička
- transakcija čeka approval ishod

### 3.5 Potvrđena zajednička transakcija

```text
krug_id              = <krug_id>
krug_privacy         = shared
krug_shared_status   = potvrđena
```

Značenje:

- transakcija je potvrđena kao zajednička

### 3.6 Nepotvrđena zajednička transakcija

```text
krug_id              = <krug_id>
krug_privacy         = shared
krug_shared_status   = nepotvrđena
```

Značenje:

- transakcija je bila predložena kao zajednička
- nije potvrđena kao zajednička
- ostaje označena kao `shared` jer je prošla kroz shared approval tok

## 4. Nevaljane kombinacije

Sljedeće kombinacije nisu semantički valjane:

### 4.1 `krug_id = NULL` s `private` ili `shared`

```text
krug_id = NULL
krug_privacy = private | shared
```

Razlog:

- `private` i `shared` imaju smisao samo unutar konkretnog Kruga

### 4.2 `personal` sa shared statusom

```text
krug_privacy = personal
krug_shared_status = predložena | potvrđena | nepotvrđena
```

Razlog:

- `personal` ne ulazi u shared approval tok

### 4.3 `private` sa shared statusom

```text
krug_privacy = private
krug_shared_status = predložena | potvrđena | nepotvrđena
```

Razlog:

- privatna transakcija nije u approval toku

### 4.4 `shared` bez shared statusa

```text
krug_privacy = shared
krug_shared_status = NULL
```

Razlog:

- shared transakcija mora imati approval status

### 4.5 `shared` izvan Krug konteksta

```text
krug_id = NULL
krug_privacy = shared
```

Razlog:

- shared approval tok postoji samo unutar konkretnog Kruga

## 5. Dopuštene semantičke tranzicije

### 5.1 Osobna transakcija izvan Kruga može ući u Krug kao osobna

```text
NULL / personal / NULL
→ <krug_id> / personal / NULL
```

Značenje:

- korisnik osobnu transakciju stavlja u Krug kontekst
- ostaje osobna, ne ulazi u shared approval tok
- vidljivost se ravna prema pravilima Kruga

### 5.2 Osobna transakcija izvan Kruga može ući u Krug kao privatna

```text
NULL / personal / NULL
→ <krug_id> / private / NULL
```

Značenje:

- korisnik transakciju stavlja u Krug kontekst i istovremeno zaključava nevidljivost prema drugim članovima

### 5.3 Osobna transakcija izvan Kruga može ući u Krug kao predložena zajednička

```text
NULL / personal / NULL
→ <krug_id> / shared / predložena
```

### 5.4 Osobna transakcija u Krugu može biti predložena kao zajednička

```text
<krug_id> / personal / NULL
→ <krug_id> / shared / predložena
```

### 5.5 Privatna transakcija u Krugu može biti predložena kao zajednička

```text
<krug_id> / private / NULL
→ <krug_id> / shared / predložena
```

### 5.6 Osobna i privatna unutar istog Kruga mogu se međusobno preklopiti

```text
<krug_id> / personal / NULL ↔ <krug_id> / private / NULL
```

Značenje:

- korisnik mijenja samo razinu privatnosti unutar Kruga
- ne dira shared approval tok
- `personal → private` zaključava nevidljivost; `private → personal` vraća transakciju na vidljivost prema pravilima Kruga

### 5.7 Predložena transakcija može biti potvrđena

```text
<krug_id> / shared / predložena
→ <krug_id> / shared / potvrđena
```

### 5.8 Predložena transakcija može biti nepotvrđena

```text
<krug_id> / shared / predložena
→ <krug_id> / shared / nepotvrđena
```

## 6. Nedopuštene obične korisničke mutacije

Ove zabrane vrijede za obične korisničke mutacije. Ne odnose se na sistemsko post-delete ponašanje iz §7.

### 6.1 Direktno skidanje `krug_id` s transakcije u Krugu

```text
krug_id: <krug_id> → NULL
```

Nije dopušteno kao obična korisnička mutacija.

Razlog:

- izlazak transakcije iz Krug konteksta mora biti posljedica definiranog sistemskog procesa, ne ad-hoc izmjene

### 6.2 Premještanje između Krugova

```text
krug_id: <krug_a> → <krug_b>
```

Nije dopušteno.

### 6.3 Povratak confirmed / rejected approval stanja u proposed

```text
shared / potvrđena → shared / predložena
shared / nepotvrđena → shared / predložena
```

Nije dopušteno kao obična korisnička mutacija.

### 6.4 Direktna promjena između potvrđene i nepotvrđene

```text
shared / potvrđena → shared / nepotvrđena
shared / nepotvrđena → shared / potvrđena
```

Nije dopušteno kao obična korisnička mutacija.

### 6.5 Vraćanje shared transakcije u personal ili private nakon ulaska u approval tok

```text
shared / predložena   → personal / NULL
shared / predložena   → private  / NULL
shared / potvrđena    → personal / NULL
shared / potvrđena    → private  / NULL
shared / nepotvrđena  → personal / NULL
shared / nepotvrđena  → private  / NULL
```

Nije dopušteno kao obična korisnička mutacija.

Razlog:

- jednom kada transakcija uđe u shared approval tok, njezin approval trag se ne briše običnim updateom

## 7. Post-delete ponašanje Kruga

Post-delete ponašanje nije otvoreno pitanje.

Za obrisani Krug vrijedi zaključano pravilo iz `Post-Delete Behavior Foundation Patch v1.1`:

```text
krug_id              → NULL
krug_privacy         shared → personal
krug_shared_status   → NULL
```

Značenje:

- transakcija ostaje korisniku
- transakcija više nema Krug kontekst
- bivša shared transakcija postaje osobna transakcija
- approval status se briše jer nakon brisanja Kruga više nema Krug approval konteksta

Privatne i osobne transakcije iz obrisanog Kruga jednako gube `krug_id` i postaju osobne transakcije korisnika izvan Krug konteksta.

Ovo je sistemsko post-delete ponašanje i iznimka je od zabrane obične korisničke mutacije `<id> → NULL` iz §6.1.

## 8. Granice dokumenta

Ovaj dokument ne definira:

- SQL enum tipove
- CHECK constraintove
- foreign key pravila
- RLS read/write politike
- RPC funkcije
- UI tokove
- agregacije
- settlement logiku
- split logiku
- pravila/presete vidljivosti `personal` transakcija unutar Kruga
- migraciju postojećih transakcija

## 9. Odnos prema budućim dokumentima

Ovaj dokument je semantička osnova za kasnije planove:

- Transaction RLS / Visibility Plan
- Transaction Mutation Path Plan
- Approval Enforcement Plan

Ti dokumenti ne smiju mijenjati značenje:

- `personal`
- `private`
- `shared`
- `predložena`
- `potvrđena`
- `nepotvrđena`
- post-delete transformacije iz §7

## 10. Sažetak zaključanih ispravaka u v1.3

U odnosu na v1.2, v1.3 zaključava:

- `personal` ne određuje vidljivost; vidljivost prema drugim članovima Kruga ovisi o pravilima/presetu Kruga
- `private` je jedino stanje koje eksplicitno zaključava nevidljivost prema drugim članovima
- razlika `personal` ↔ `private` više nije prikazana kroz vidljivost kao njihovu zajedničku svrhu, nego kroz to tko o vidljivosti odlučuje (preset vs. eksplicitno polje)
- formulacije u §2.2, §3.2, §5.1 i §5.6 usklađene su s tom razlikom
