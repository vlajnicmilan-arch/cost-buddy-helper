
# Krug RLS Implementation Plan v1.1

Block E dokument. Prevodi sve već zaključane Block A–D ugovore (Schema v1.3, Visibility v1.1, Mutation Path v1.1, Approval Enforcement v1.1, API/Service Boundary v1.1) u konkretan RLS dizajn nad redom `expenses` kad je `krug_id IS NOT NULL`.

Bez SQL koda, bez RPC potpisa, bez naziva policy-a, bez migracija.

**Promjene v1.0 → v1.1 (samo usklađenja, bez novih ideja):**
- A3 ispravno mapiran: `potvrđena → nepotvrđena` (opoziv potvrde), ne `potvrđena → predložena`
- A5 prebačen iz governance/RGA kanala u author kanal (`A5 = nepotvrđena → predložena`, akter = autor s pravom pokretanja shared toka)
- Razdvojena dva autorizacijska modela za UPDATE: governance/RGA akti (A1, A2, A3, A7) vs author akti (A4, A5)
- Race-uvjeti usklađeni s novom A3 semantikom

---

## §1. Scope

Pokriva:
- RLS nad `expenses` za retke gdje `krug_id IS NOT NULL`
- 4 RLS kanala: SELECT, INSERT, UPDATE, DELETE
- Mapiranje A1–A7 na te kanale
- Security-definer helpere koje RLS smije zvati (samo nabrojati funkciju, ne implementaciju)
- Granicu prema retcima gdje `krug_id IS NULL` (ne diramo postojeće non-Krug policy-e)

Ne pokriva:
- SQL, naziv policy-a, naziv funkcija, signature
- RLS nad bilo kojom drugom tablicom osim `expenses`
- Krug-level tablice (članstvo, presets) — pretpostavljamo da već postoje i da imaju svoj RLS
- A6 (48h expiry) kao izvor pisanja — to ide kroz system role, ne kroz klijent RLS
- Bulk/admin override putove
- Notifikacije, audit log, UI

---

## §2. Principi

1. **RLS je drugi sloj obrane**, ne primarni. Primarni je server-side logika iza endpointa iz API Boundary v1.1.
2. **RLS mora biti suglasna s Approval v1.1 i Mutation v1.1.** Ako endpoint dopušta akt, RLS ga ne smije blokirati. Ako endpoint zabranjuje akt, RLS ga mora odbiti i kad endpoint zakaže.
3. **RLS ne smije sama izvoditi semantičke akte.** Ne mijenja `krug_shared_status`, `krug_privacy`, ne briše, ne potvrđuje. Samo dopušta/odbija ono što je client/endpoint pokušao.
4. **RGA i scope-of-affected se izvode kroz security-definer helpere**, ne kroz inline JOIN u policy-u.
5. **`auth.uid()` je jedini identitet aktera u RLS-u.**
6. **RLS ne razlikuje akte A1–A7 po imenu.** Razlikuje ih po (kanal, prethodno stanje retka, novo stanje retka, akter).
7. **Dva odvojena autorizacijska modela za UPDATE** (novo u v1.1):
   - **governance/RGA model** — za A1, A2, A3, A7 (akter mora biti RGA za taj redak)
   - **author model** — za A4, A5 i edit vlastitog prijedloga (akter mora biti autor, dodatno za A5: autor s pravom pokretanja shared toka = owner ili full član Kruga koji je ujedno autor)

   Ova dva modela se NE smiju brkati niti dijeliti isti helper.

---

## §3. Security-definer helperi (samo popis)

RLS smije pozvati isključivo ove funkcije. Svaka mora biti `SECURITY DEFINER`, deterministička za isti input, ne smije sama mijenjati podatke, `SET search_path = public`.

| Helper | Vraća | Koristi se u | Izvor istine za |
|---|---|---|---|
| H1. `is_krug_member(krug_id, user_id)` | bool | SELECT, INSERT | Bilo kakvo članstvo (ordinary, full, owner) |
| H2. `is_krug_full_or_owner(krug_id, user_id)` | bool | UPDATE (A5 author kanal) | Owner/full membership; nužan uvjet za pokretanje shared toka, koristi se ISKLJUČIVO unutar author modela za A5 |
| H3. `is_rga_for_row(expense_row, user_id)` | bool | UPDATE (governance kanal: A1, A2, A3, A7) | RGA = owner/full member ∧ financijski pogođen za taj konkretni redak |
| H4. `krug_row_is_visible(expense_row, user_id)` | bool | SELECT, USING preduvjet za UPDATE i DELETE | Visibility v1.1 (private/personal/shared/ordinary-redacted) |
| H5. `is_row_author(expense_row, user_id)` | bool | UPDATE (author kanal: A4, A5, field-edit), DELETE | `auth.uid() = OLD.user_id` |

Napomena: H2 i H3 NISU zamjenjivi. H3 strožiji je (RGA = full/owner + scope-of-affected). H2 je slabiji i koristi se samo u A5 author kanalu kao dodatni filter "autor s pravom pokretanja shared toka".

RLS ne smije zvati ništa drugo iz aplikativnog sloja. Ne smije čitati `expenses` rekurzivno.

---

## §4. RLS kanali

### §4.1 SELECT

Dopušteno akko `H4(redak, auth.uid())` vraća true.

H4 unutar sebe pokriva sva 4 slučaja iz Visibility v1.1. Column-level redakcija za ordinary članove nije RLS odgovornost u ovom planu.

### §4.2 INSERT

Dopušteno akko:
- `auth.uid() = NEW.user_id`
- ako `NEW.krug_id IS NOT NULL`: `H1(NEW.krug_id, auth.uid())`
- ako `NEW.krug_privacy = 'shared'`: `NEW.krug_shared_status = 'predložena'`
- ako `NEW.krug_privacy ∈ {'private','personal'}`: `NEW.krug_shared_status IS NULL`

INSERT ne pokriva nijedan od akata A1–A7.

### §4.3 UPDATE

UPDATE policy je strukturalno podijeljen u **dva odvojena autorizacijska modela**. Implementacija može biti jedan policy s OR granom ili dva odvojena permisivna policy-a — semantika je ista.

**Zajednički USING preduvjet (oba modela):**
- `H4(OLD, auth.uid())` — bez vidljivosti nema UPDATE-a

#### §4.3.A Governance / RGA model — pokriva A1, A2, A3, A7

USING dodatno:
- `H3(OLD, auth.uid())` — akter je RGA za taj redak

WITH CHECK matrica:

| Prethodno (OLD) | Novo (NEW) | Akt |
|---|---|---|
| `shared` / `predložena` | `shared` / `potvrđena` | A1 (potvrda) |
| `shared` / `predložena` | `shared` / `nepotvrđena` | A2 (veto) |
| `shared` / `potvrđena` | `shared` / `nepotvrđena` | **A3 (opoziv potvrde)** |
| `shared` / bilo koji | `personal` / NULL | A7 (governance → personal) |

Sve ostale tranzicije pod ovim modelom: banned.

#### §4.3.B Author model — pokriva A5 i edit vlastitog prijedloga (te A0 ako je u Mutation v1.1)

USING dodatno:
- `H5(OLD, auth.uid())` — akter je autor retka

WITH CHECK matrica:

| Prethodno (OLD) | Novo (NEW) | Akt | Dodatni uvjet |
|---|---|---|---|
| `shared` / `nepotvrđena` | `shared` / `predložena` | **A5 (ponovno pokretanje)** | `H2(OLD.krug_id, auth.uid())` — autor mora biti owner/full član (autor s pravom pokretanja shared toka) |
| `private` / NULL | `shared` / `predložena` | A0 (ako Mutation v1.1 dopušta) | `H2(OLD.krug_id, auth.uid())` |
| `shared` / `predložena` | `private` / NULL | povrat u private prije ikakve potvrde (ako Mutation v1.1 dopušta) | — |
| field-edit bez promjene `krug_privacy` / `krug_shared_status` | — | edit vlastitog prijedloga | samo dok je `OLD.krug_shared_status = 'predložena'` i bez ijedne zabilježene potvrde |

Sve ostale tranzicije pod ovim modelom: banned.

#### §4.3.C Zajedničke zabrane (oba modela)

WITH CHECK mora odbiti:
- Schema v1.3 invariantu krši: `krug_shared_status IS NULL ⇔ krug_privacy ∈ {private, personal}` — bilo koji NEW koji to krši
- Promjena `krug_id` (nijedan A1–A7 to ne radi)
- `shared`/`potvrđena` → `shared`/`predložena` direkt (Mutation v1.1: ne postoji takav prijelaz; reopen potvrđene = A3 koji ide u `nepotvrđena`, ne u `predložena`)
- Bilo koja tranzicija od strane aktera koji nije ni RGA (A1/A2/A3/A7) ni autor (A4/A5/edit) — npr. ordinary član bez RGA statusa
- A6 prijelaz (`predložena → nepotvrđena` bez RGA + bez autora) — vidi §5

### §4.4 DELETE

Dopušteno akko:
- `H4(OLD, auth.uid())`
- `H5(OLD, auth.uid())` — autor djeluje na vlastiti redak
- `OLD.krug_shared_status ∈ {NULL, 'predložena', 'nepotvrđena'}`

Banned:
- DELETE nad `shared` / `potvrđena`
- DELETE od strane bilo koga tko nije autor

Ovo je RLS odgovor na A4 (autor akt).

---

## §5. A6 (48h expiry)

A6 nema klijentski put. Pisanje koje izvodi A6 (`predložena → nepotvrđena` nakon 48h) ide isključivo kroz system role (cron / scheduled job / service_role), ne kroz klijentski RLS.

Klijentski RLS policy NE pokriva taj prijelaz:
- Governance/RGA model (§4.3.A) ne sadrži `predložena → nepotvrđena` (taj prijelaz je A2 ili A6; A2 zahtijeva eksplicitni RGA akt iz endpointa; A6 ne smije biti klijentski mogu)
- Konkretno: u §4.3.A `predložena → nepotvrđena` se ostvaruje samo kao A2; svaki UPDATE koji izvede tu tranziciju bez RGA aktera pada (jer USING traži H3)
- Author model (§4.3.B) ne sadrži tu tranziciju uopće

Rezultat: ako pokušaj dođe od `auth.uid()` koji nije RGA, RLS odbija; A6 može proći isključivo kroz service_role koji zaobilazi RLS.

---

## §6. Mapiranje A1–A7 → RLS kanali (ispravljeno u v1.1)

| Akt | Kanal | Model | Tko (po RLS-u) | Što RLS provjerava |
|---|---|---|---|---|
| A1 potvrda | UPDATE | §4.3.A governance/RGA | RGA | OLD=`shared`/`predložena`, NEW=`shared`/`potvrđena`, H3(OLD) |
| A2 veto | UPDATE | §4.3.A governance/RGA | RGA | OLD=`shared`/`predložena`, NEW=`shared`/`nepotvrđena`, H3(OLD) |
| **A3 opoziv potvrde** | UPDATE | §4.3.A governance/RGA | RGA | OLD=`shared`/`potvrđena`, **NEW=`shared`/`nepotvrđena`**, H3(OLD) |
| A4 povlačenje | DELETE | author | autor | OLD.status ∈ {NULL, `predložena`, `nepotvrđena`}, H5 |
| **A5 ponovno pokretanje** | UPDATE | §4.3.B author | **autor s pravom pokretanja shared toka** | OLD=`shared`/`nepotvrđena`, NEW=`shared`/`predložena`, H5 ∧ H2 |
| A6 expiry | UPDATE (system) | NIJE klijentski | system role | NIJE pokriveno klijentskim policy-em |
| A7 governance → personal | UPDATE | §4.3.A governance/RGA | RGA | OLD.privacy=`shared`, NEW.privacy=`personal` ∧ NEW.status=NULL, H3(OLD) |

Governance/RGA akti = A1, A2, A3, A7 → koriste H3.
Author akti = A4, A5 → koriste H5 (A5 dodatno H2). Nikada ne koriste H3.

RLS nigdje ne smije pomiješati ova dva modela — npr. RGA koji nije autor NE smije izvesti A5; autor koji nije RGA NE smije izvesti A1/A2/A3/A7.

---

## §7. Race-uvjeti i RLS (ispravljeno u v1.1)

RLS osigurava da svaki pojedinačni pokušaj zadovoljava pravila u trenutku evaluacije. Deduplikacija i serijalizacija akata su odgovornost endpoint sloja.

- **Dvostruka potvrda (A1+A1) konkurentno:** obje pojedinačno prolaze RLS jer su obje validne nad `predložena`. Drugi commit vidi OLD=`potvrđena` i pada na WITH CHECK. Konzistentno.
- **Veto+povlačenje (A2+A4) konkurentno:** A2 je governance UPDATE, A4 je author DELETE. Oba dopuštena nad `predložena`. Tko prvi commita pobjeđuje; drugi pada (UPDATE pada jer OLD više nije `predložena`, ili DELETE pada jer reda nema / status se promijenio).
- **A3 vs nova A1 konkurentno (v1.1):** A1 traži OLD=`predložena`, A3 traži OLD=`potvrđena`. Sekvenca A1→A3 je validna (potvrda pa opoziv). Konkurentno: ako oboje pokušaju nad istim OLD, jedan ima pogrešan OLD i pada.
- **A3 (opoziv potvrde) vs A5 konkurentno (v1.1):** A3 djeluje na `potvrđena`, A5 djeluje na `nepotvrđena`. Mogu se nadovezati u sekvenci A3→A5 (RGA opozove potvrdu, autor ponovno pokrene), ali nikad ne ciljaju isto OLD stanje pa nema race na razini OLD-a. Ako A3 prvi commita (`potvrđena → nepotvrđena`), naknadni A5 nad istim retkom je validan i prolazi (drugi akter, drugi model). Ako A5 pokuša prije A3, pada jer OLD nije `nepotvrđena`.
- **Field-edit autora + A1 RGA konkurentno:** oba UPDATE-a; field-edit ide kroz author model, A1 kroz governance model; prvi commit postavlja novi OLD; drugi se evaluira protiv tog novog stanja. Ako RGA potvrdi prije autora, autorov field-edit pada jer status više nije `predložena`. Konzistentno.
- **A6 vs ručni akt konkurentno:** A6 ide system rolom (zaobilazi RLS), ručni akt ide `auth.uid()`. Ako A6 prvi commita (`predložena → nepotvrđena`), ručni A1 pada jer OLD nije `predložena`; ručni A2 pada jer OLD nije `predložena`; ručni A5 (autor) može uslijediti i validno proći.
- **A7 + A4 konkurentno:** A7 je governance UPDATE, A4 je author DELETE. Prvi commit pobjeđuje, drugi pada.
- **A5 (autor) vs A5 (drugi pokušaj) konkurentno:** oba author kanal nad istim OLD=`nepotvrđena`; prvi commita vraća redak u `predložena`, drugi pada jer OLD više nije `nepotvrđena`. Rate-limit po (redak, autor) je endpoint odgovornost, ne RLS.

Nijedan race ne zahtijeva da RLS uvodi advisory lock, SERIALIZABLE transakciju ili optimističku verziju.

---

## §8. Ne-Krug retci (`krug_id IS NULL`)

Ovaj plan ne dira postojeće policy-e za `krug_id IS NULL` retke. Implementacija mora osigurati da:
- novi Krug-specifični UPDATE/DELETE policy se aktivira isključivo kad `OLD.krug_id IS NOT NULL`
- postojeći non-Krug policy se aktivira isključivo kad `OLD.krug_id IS NULL`
- nijedan redak nije ni pokriven s oba ni ostavljen bez ijednog

---

## §9. Što RLS NE radi (eksplicitno)

- ne briše redak nakon A4 automatski — to radi DELETE call iz endpointa
- ne mijenja `krug_shared_status` sama
- ne šalje notifikacije, ne piše audit log
- ne provjerava rate-limit za A5 → endpoint odgovornost
- ne provjerava 48h prozor za A6 → system role odgovornost
- ne razlikuje "nevaljan zbog članstva" od "nevaljan zbog scope-of-affected" → vraća jednu RLS grešku (42501); razdvajanje je endpoint odgovornost
- ne primjenjuje column-level redakciju za ordinary članove
- **ne koristi isti helper za governance akte i author akte** (v1.1)

---

## §10. Otvorena pitanja (operativna, ne mijenjaju ugovor)

1. Hoće li helperi H1–H5 biti novi ili reuse postojećih funkcija.
2. Restrictive vs permissive policy strategija za Krug retke.
3. Kako system role izvodi A6 — pg_cron + service_role direktno, ili edge funkcija.
4. Točan error code mapping (42501 vs custom RAISE) — endpoint odgovornost.
5. Treba li dedicirani BEFORE UPDATE trigger za Schema v1.3 invariantu kao dodatni pojas.
6. Hoće li governance i author model biti dva odvojena permisivna policy-a ili jedan policy s OR granom — implementacijska odluka koja ne mijenja semantiku.

---

## §11. Zaključak

RLS dizajn je potpun za sve A1–A7 putove + A6 system put + SELECT/INSERT/UPDATE/DELETE kanale, s ispravljenom A3 semantikom (opoziv potvrde) i ispravnim A5 autorizacijskim modelom (author kanal, ne governance), te jasnom podjelom na governance/RGA i author autorizacijski model.

Sljedeći dokument (Block F): **`Krug Endpoint Contract Plan v1`** — konkretni endpointi (još bez SQL/RPC potpisa) koji implementiraju API Boundary v1.1 iznad ovog RLS sloja.
