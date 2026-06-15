## Provjereno stanje

- `Uplata gotovine na Aircash...` u bazi je već spremljeno kao `type = transfer`, ne kao `expense`.
- Screenshot ipak prikazuje minus/crveno jer PDF duplicate dialog nema granu za `transfer`; sve što nije `income` renderira kao trošak.
- Postoji i drugi stvarni problem: `Aircash Pay Jadrolinija` je trenutno klasificiran kao `transfer`, iako izgleda kao plaćanje Aircashom, dakle trošak. Pravilo za interne prijenose je preširoko.

## Plan implementacije

1. **Popraviti prikaz iznosa u PDF duplicate dialogu**
   - U `GlobalPDFImportHost.tsx` uvesti jednu lokalnu funkciju za prikaz tipa iznosa.
   - `income` prikazati s `+` i income bojom.
   - `expense` prikazati s `-` i expense bojom.
   - `transfer` prikazati s `↔` i neutralnom/primary bojom.
   - Primijeniti isto na:
     - sigurne duplikate,
     - moguće duplikate,
     - vjerojatne duplikate,
     - auto-merge prikaz postojeći/novi red.

2. **Precizirati Aircash pravila**
   - Zadržati `Uplata gotovine na Aircash`, `Aircash dopuna`, `nadoplata/top up` kao `transfer`.
   - Ne tretirati `Aircash Pay <trgovac>` kao interni prijenos; to treba biti `expense`.
   - Ukloniti/preusmjeriti preširoko pravilo koje zbog same riječi `Aircash` ili `uplata gotovine` može krivo klasificirati plaćanja.

3. **Uskladiti PDF post-processing s CSV logikom**
   - `reclassifyInternalTransfers()` ostaje sigurnosna mreža, ali nakon suženih pravila.
   - Cilj: AI može pogriješiti, ali deterministički sloj mora ispraviti samo stvarne dopune/prijenose, ne Aircash plaćanja.

4. **Dodati regresijske testove**
   - `Uplata gotovine na Aircash Tisak/Ina` → `transfer`.
   - `Aircash dopuna` → `transfer`.
   - `Aircash Pay Jadrolinija` → ne smije postati `transfer`.
   - PDF duplicate amount renderer mora prikazati `transfer` kao `↔`, ne kao `-`.

5. **Bez automatskog bulk mijenjanja postojećih podataka**
   - Neću mijenjati postojeće transakcije u bazi u ovom koraku.
   - Nakon code fixa mogu ti dati točan popis aktivnih sumnjivih redova (`Aircash Pay...` koji su `transfer`) i tek nakon tvoje potvrde ih prebaciti u `expense`.