# Plan: kategorije u dvije razine, oznake i zapisi koji nisu trošak

Samo plan. Kod se ne mijenja dok ne kažeš „gradi“.

## Provjereno u kodu (ovaj krug)
- `expenses.category` je tekst. `TransactionType` = `expense | income | transfer`. `expense_nature` u TS-u je `regular | extraordinary` (s korekcijom kao dodatnom vrijednošću u bazi, prema memoriji projekta).
- `custom_categories`: `id, user_id, name, icon, color`. Nema skupine ni roditelja.
- `budget_categories.category` je tekst po budžetu.
- `category_corrections` postoji (`original_category`, `corrected_category`, `merchant_name`, `description`, `expense_id`).
- `accounting_category` čitaju `parse-receipt`, `handoverPackage`, `useHandoverExpenses`, `useIncomingInvoices`, `expenseColumns`.
- Oko 83 datoteke u `src` čitaju `.category`. Točan popis je prvi korak naloga 2.
- Broje iz baze (Ostalo 102.462 €, Jadrolinija 44 retka, pokvarene vrijednosti) uzimam iz tvog utvrđenog stanja. Ponovno ih ne provjeravam; provjeravam ih pri izradi popisa za pregled (nalog 5).

## (a) Model skupina i kategorija
- Novi ugrađeni registar skupina u kodu (`src/lib/categoryTree.ts`, uz zrcalo u `_shared` za AI): stalni ključevi skupina (`cafes`, `food`, `car`, `travel`, `work`, `home`, `loans`, `fees_taxes`, `personal`, `fun`, `other`, `income`) i ugrađeni ključevi podkategorija (`coffee`, `restaurants`, `delivery`, `marenda`, `groceries`, `fuel`, `car_service`, ...). Nazivi idu kroz i18n (hr/en/de).
- Stari ugrađeni ključevi ostaju valjani. Registar ih mapira u skupinu kao alias (npr. `food` → Hrana/Namirnice, `transport` → Auto). Nijedan postojeći redak ne mora se mijenjati da bi se prikazao u skupini.
- `custom_categories` dobiva stupac `group_key text NULL` (aditivna migracija, bez podrazumijevane vrijednosti). Korisnik može dodati, preimenovati i premjestiti svoju kategoriju unutar bilo koje skupine. Ugrađene kategorije može sakriti, ali ne i preimenovati.
- Postojeće korisničke kategorije ostaju netaknute, s istim UUID-om. Kategorije s `group_key = NULL` prikazuju se u skupini „Moje kategorije“ dok ih korisnik ne smjesti.
- „Pokrivanje drugih pizdarija“ ostaje s `group_key = NULL`, nazivom i svih 7 zapisa. Iznimka je zapisana po ID-u na popisu isključenja naloga 5.
- `expenses.category` ostaje jedini izvor (list). Skupina se uvijek izvodi iz registra ili iz `custom_categories.group_key` i ne sprema se na retku.

## (b) Oznake (Nepotrebno, Luksuz)
- Novi stupac `expenses.tags text[] NOT NULL DEFAULT '{}'`, s ugrađenim ključevima `unnecessary` i `luxury` (proširivo, bez slobodnog teksta u prvoj fazi).
- Kod upisa (ručni i OCR, osobni i poslovni) su dva gumba-čipa ispod kategorije, najmanje 44 px. Jedan dodir uključuje ili isključuje oznaku.
- Na retku se prikazuje mala ikona uz iznos. U filtru je izbor „oznaka“.
- U izvješću je kartica „Nepotrebno ovaj mjesec“ i „Luksuz ovaj mjesec“, sa zbrojem preko svih kategorija. Uključuje samo prave troškove (vidi c).
- Postojeće korisničke kategorije „Nepotrebno“ i „Luksuz“ se ne brišu. Njihovi zapisi idu na popis za pregled s prijedlogom „dodaj oznaku + odaberi pravu kategoriju“.

## (c) Zapisi koji nisu trošak ni prihod
Postoji danas:
- `type = 'transfer'` s kategorijom `transfer`. Parovi prijenosa (`transfer_pair_counterpart`, 0008) pokrivaju prebacivanje među vlastitim računima i bankomat (Keš je vlastiti novčanik).
- `expense_nature`: `regular`, `extraordinary` i korekcija salda.

Dodaje se novi stupac `expenses.movement_kind text NULL` s CHECK vrijednostima:
- `own_transfer`: vlastiti računi (uz `type='transfer'`)
- `atm`: bankomat u Keš (uz `type='transfer'`)
- `loan_given`, `loan_repaid_to_me`, `loan_received`, `loan_repaid_by_me`: pozajmica, oba smjera
- `own_company_payment`: uplata u vlastitu firmu

Pravila:
- `type` se za pozajmice i uplatu u firmu NE mijenja u `transfer`. Novac stvarno izlazi iz novčanika, pa saldo i sidro ostaju isti. Izvješća isključuju retke gdje je `movement_kind IS NOT NULL`.
- Jedan zajednički helper `isRealSpend(row)` / `isRealIncome(row)` (`src/lib/spendClassification.ts`) koji koriste sva izvješća, PDF, budžeti, AI uvidi, dashboard i Krug podjela. Danas se `type === 'expense'` provjerava na desecima mjesta; to se svodi na ovaj helper.
- Pozajmice dobivaju zaseban mali pregled „Dano / vraćeno“ po osobi, preko postojeće protustrane.

## (d) Prijenos postojećih zapisa
Ništa se ne mijenja bez pregleda. Nalog 5 gradi zaslon „Pregled kategorija“: popis prijedloga koje korisnik potvrđuje pojedinačno ili grupno. Tek potvrda piše u bazu preko RPC-a sa zapisom u `category_corrections`.

| Stara vrijednost | Prijedlog | Način |
|---|---|---|
| ugrađeni `food` | ostaje; prikaz Hrana › Namirnice | sigurno, bez upisa |
| `transport`, `bills`, ostali ugrađeni | alias u skupinu | sigurno, bez upisa |
| projektni `material`, `labor`, ... | alias u skupinu Posao | sigurno, bez upisa |
| korisnička „Materijal“ | spoji u `material` | pregled |
| „Namirnice“ / „Hrana i život“ | Hrana › Namirnice | pregled |
| „Marenda“ | Kafići › Marenda | pregled |
| korisnička „Nepotrebno“ / „Luksuz“ | oznaka + nova kategorija | pregled |
| „Ostalo“: pozajmice (po imenu) | `movement_kind` loan_* | pregled |
| „Ostalo“: radnici/izvođači | Posao › Radnici / Izvođači | pregled |
| „Ostalo“: Aircash, Revolut, „sam sebi“ | `own_transfer` | pregled |
| „Ostalo“: bankomat | `atm` | pregled |
| „Ostalo“: vlastite firme | `own_company_payment` | pregled |
| Jadrolinija (`transfer` + `transport`) | trošak, Putovanje › Trajekt | pregled (mijenja `type`, provjera salda) |
| „0“, „8“, prazno, `custom_income_*` | bez prijedloga, korisnik bira | pregled |
| „Pokrivanje drugih pizdarija“ | izuzeto | ne prikazuje se |

Promjena `type` (Jadrolinija) mijenja saldo. Zato ide kroz postojeći put ažuriranja uz BALANCE SQL paket, ne izravnim UPDATE-om.

## (e) Što čita kategoriju i što se prilagođava
- Izvješća i PDF: grupiranje po skupini s mogućnošću otvaranja, `isRealSpend`, kartica oznaka.
- Budžeti: `budget_categories.category` prihvaća i ključ skupine (`group:car`). Postojeći limiti po listu ostaju.
- AI (`categorize-transaction`, `parse-receipt`, AI u sinkronizaciji): popis dopuštenih ključeva iz registra; projekt i dalje ima svoj popis. Učenje: prije poziva AI-ja traži se `category_corrections` po `merchant_name` za tog korisnika; ≥2 ista ispravka znači izravnu odluku bez AI-ja. Svaka ručna promjena kategorije upisuje ispravak (danas je tablica za korisnika prazna, pa put upisa treba provjeriti i spojiti).
- Poslovni način: `accounting_category` i konto se ne diraju. Mapiranje konta čita list kategorije pa ga samo proširiti novim ključevima.
- Projektni registar: ostaje zaseban; samo se aliasira u skupinu Posao za osobna izvješća.
- Filtri: izbor skupine ili lista, oznaka, „prikaži i zapise koji nisu trošak“.
- Izvoz (CSV/XLSX/backup): novi stupci `skupina`, `oznake`, `vrsta_zapisa`; postojeći stupci ostaju.
- `useResolvedCategory` / `getCategoryInfo`: jedini ulaz za naziv, ikonu i skupinu; rješava i pokvarene vrijednosti kao „Nerazvrstano“ umjesto sirovog koda.

## (f) Ostali korisnici
- Postojeći korisnici: nijedan redak se ne mijenja. Stari ugrađeni ključevi prikazuju se u novim skupinama kroz aliase. Korisničke kategorije idu pod „Moje kategorije“. Zaslon pregleda je dobrovoljan i nudi se jednom obavijesti.
- Novi korisnici: odmah dobivaju novo stablo u izborniku. Stari ključevi se više ne nude za nove upise, ali ostaju valjani.
- Izvješća svih korisnika mijenjaju se samo ako imaju retke s `movement_kind`; bez toga je zbroj troška isti kao danas.

## (g) Rizici i nalozi
Rizici:
- Mnogo mjesta s `type === 'expense'`: bez jednog helpera neka izvješća ostaju „lažna“. Brana je test koji traži izravne provjere izvan helpera.
- Promjena `type` mijenja saldo. Zato samo kroz pregled, uz SQL paket salda.
- AI s dvije razine može miješati stare i nove ključeve. Rješava se jednim registrom sa zrcalom i mirror testom.
- Budžeti po skupini mogu dvaput brojati isti trošak (list + skupina). Pravilo: trošak se broji u najužem limitu.

Nalozi, redom:
1. Registar skupina i aliasa + zrcalo + i18n + `resolveCategory` sa skupinom. Bez migracije, bez promjene prikaza.
2. Helper `isRealSpend` / `isRealIncome` i prevođenje svih čitača na njega (popis svih mjesta u izvještaju). Rezultat je isti kao danas jer `movement_kind` još ne postoji.
3. Migracija: `custom_categories.group_key`, `expenses.tags`, `expenses.movement_kind` (aditivno, uz GRANT/RLS provjeru). Izbornik kategorija u dvije razine i upravljanje vlastitim kategorijama po skupini.
4. Oznake pri upisu, na retku, u filtru i u izvješću. Vrste zapisa pri upisu (pozajmica, uplata u firmu) i pregled pozajmica.
5. Zaslon „Pregled kategorija“ s prijedlozima iz (d), potvrda kroz RPC, upis u `category_corrections`, izuzeće „Pokrivanje drugih pizdarija“.
6. AI: novi ključevi, učenje iz `category_corrections`, upis ispravaka pri svakoj ručnoj promjeni.
7. Budžeti po skupini, PDF i izvoz s novim stupcima.

## Otvorena pitanja
- Smije li stari ugrađeni `food` zadržati naziv „Hrana“ u skupini Hrana ili ga prikazati kao „Namirnice“?
- Treba li pozajmica pratiti otvoreni dug po osobi (povezano s `business_debts`) ili samo zbroj?
