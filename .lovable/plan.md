
Problem sada nije “jedna sitnica”, nego 3 logike koje se međusobno tuku, pa zato prethodna izmjena nije dala rezultat.

## Što sam točno našao

1. `AppStateContext.tsx`
- pri startu namjerno stavlja `businessModeEnabled = false`
- pamti `activeBusinessProfileId`

2. `BusinessProfileSwitcher.tsx`
- profile učitava samo ako je `businessModeEnabled === true`
- cijeli switcher skriva ako `businessModeEnabled === false`

To znači: app se otvori u osobnom modu, ali istovremeno sakrije jedini UI koji bi trebao pokazati zapamćenu tvrtku. Zato izgleda kao da promjena “ne radi”.

3. `Index.tsx`
- poslovni prikaz određuje s `const isBusinessMode = !!activeBusinessProfileId`
- povratak na osobni radi tako da briše `activeBusinessProfileId`

To ruši originalnu želju:
- čim se vratiš na osobni, briše se zapamćena tvrtka
- a ako bi ID ostao spremljen, `Index.tsx` bi te odmah opet prebacio u poslovni prikaz

## Plan popravka

### 1. Razdvojiti “zapamćena tvrtka” od “trenutno otvoren poslovni prikaz”
U `AppStateContext.tsx` ostaviti:
- `activeBusinessProfileId` = zadnja korištena tvrtka
- `businessModeEnabled` = samo je li poslovni prikaz trenutno otvoren

### 2. Ispraviti odluku koji se ekran prikazuje
U `Index.tsx` promijeniti logiku:
- poslovni ekran se otvara samo kad je `businessModeEnabled === true` i postoji `activeBusinessProfileId`
- osobni ekran ostaje default pri pokretanju

### 3. Ne brisati zadnju tvrtku kad se vratiš u osobni mod
U `Index.tsx` i `BusinessProfileSwitcher.tsx` promijeniti “back to personal” ponašanje:
- isključi poslovni prikaz
- ali NE briši `activeBusinessProfileId`

### 4. Prikazati switcher i u osobnom modu ako postoji zapamćena tvrtka
U `BusinessProfileSwitcher.tsx`:
- dohvatiti profile i kad `businessModeEnabled` nije uključen
- ne skrivati komponentu samo zato što je osobni mod aktivan
- u osobnom modu prikazati “Osobno”, ali u dropdownu ponuditi zadnju/spremljene tvrtke za 1 klik povratka

### 5. Očistiti rubne slučajeve
- ako spremljena tvrtka više ne postoji, tiho obrisati spremljeni ID
- ako korisnik izgubi pristup poslovnom dijelu, guard i dalje smije ugasiti poslovni prikaz, ali bez nekonzistentnog stanja

## Rezultat nakon popravka

Željeno ponašanje će biti:
- otvoriš app
- vidiš osobni mod
- u zaglavlju i dalje imaš poslovni switcher / zapamćenu tvrtku
- jednim klikom se vraćaš u zadnju tvrtku
- kad opet izađeš iz poslovnog moda, tvrtka ostaje zapamćena

## Datoteke za izmjenu
- `src/contexts/AppStateContext.tsx`
- `src/components/BusinessProfileSwitcher.tsx`
- `src/pages/Index.tsx`

## Dodatno što sam usput našao
U konzoli postoje i odvojena React upozorenja s `ref` prosljeđivanjem u:
- `WelcomeChecklist.tsx`
- `PaymentSourcesSection.tsx`

To nije glavni uzrok ovog business-mode problema, ali vrijedi srediti odmah nakon toga jer stvara warninge i može kasnije praviti dodatnu zbrku.

## Tehnički sažetak
Trenutni bug nije u spremanju podataka nego u kontradikciji između 3 mjesta:
- stanje se pamti
- UI za povratak se skriva
- povratak na osobni briše spremljenu tvrtku
- prikaz poslovnog ekrana ovisi o krivom signalu

Kad odobriš, napravit ću mali, ciljani popravak ta tri mjesta umjesto još jednog parcijalnog workarounda.
