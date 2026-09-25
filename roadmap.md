# Roadmap

- [x] Gate Smjer PDF import, installments, and budgets
- [x] Replace `/projekti` with the locked landing skeleton and verify four responsive theme states
- [x] Prikazati oznaku „Pozajmica” dosljedno u svim odobrenim popisima transakcija

- [x] Datum transakcije iz teksta izvoda (valueFromText) umjesto AI-prijepisa
- [x] Mjesečni paket za knjigovođu (PDF + Excel + status predano)
- [x] Predaja knjigovođi: preseljenje s ulaznih računa na fotografirane troškove (expenses + receipt_url)
- [x] Bankovna sinkronizacija: broj kartice, sirovi zapis, rezervacije (točke 0/1/2/4)
- [ ] Bankovna sinkronizacija točka 3: prijenosi kroz buildTransferPair (opcija B) — čeka prvi sirovi EB zapis
- [x] Popravak praznog popisa: dijeljena mapa novčanika (sourceScopeCache) nikad prazna
- [x] Temelj korak 1: otisak retka na ključ v2 (imp2) uz dvostruku pretragu i rekey

- [x] Isti trošak — Nalog 1: modul pravila + testovi (nitko ga ne zove)
- [ ] Isti trošak — Nalog 2: sinkronizacija
- [ ] Isti trošak — Nalog 3: uvoz izvoda ✅
- [ ] Isti trošak — Nalog 4: ručni unos (bez trajnog pamćenja odbijenog para; prikaz izbora s podacima banke)

## Kategorije u dvije razine (plan odobren 24.9.2026 uz ispravke)
- [x] Nalog 1: registar skupina i aliasa (`categoryTree.ts` + zrcalo), bez prikaza
- [x] Nalog 2: `isRealSpend` / `isRealIncome` za sve čitače (nije objavljeno)
- [ ] Krug podmirenje s izborom izvora — plan napisan, čeka zaseban nalog
- [x] Nalog 3: migracija (`custom_categories.group_key`, `expenses.tags`, `expenses.movement_kind`) + izbornik u dvije razine (nije objavljeno)
- [x] Nalog 5: zaslon „Pregled kategorija" (prijedlozi, potvrda, poništavanje; nije objavljeno)
- [x] Nalog 4: oznake (Nepotrebno, Luksuz) + vrste zapisa + pregled pozajmica (nije objavljeno)
- [x] Nalog 6: AI s novim ključevima + učenje iz `category_corrections`
- [x] Nalog 6b: prekidač SERVER_CATEGORY_TREE_ENABLED uključen, bank-sync-transactions objavljena
- [ ] Živa salda: plan odobren (6 koraka); nalog 1 dijagnoza prijavljena; nalog 2 migracija objave (0019) primijenjena, čuvari zeleni; sljedeći nalog 3: zajednički slušač ✅
- [x] Nalog 7: budžeti po skupini, filtri, PDF i izvoz (nije objavljeno)

Pravila za sve naloge:
- Široka stara kategorija nikad se tiho ne prikazuje kao list: dobiva skupinu + `unsorted`, pa ide na pregled.
- Korisničke kategorije se nikad ne brišu ni preimenuju automatski. Kategorija sa zapisima se ne može obrisati dok korisnik ne izabere kamo idu njeni zapisi; briše se tek prazna. Skrivena ugrađena kategorija na starim zapisima i dalje pokazuje pravi naziv.
- Pretvaranje troška u prijenos (Aircash, bankomat...) mijenja saldo drugog novčanika. Smije ići samo kroz korisnikov pregled, uz provjeru salda i upozorenje kad je zapis nakon sidra.
- Pozajmice: stanje po osobi (dano / vraćeno / preostalo), bez veze s `business_debts` u ovom krugu.
- „Pokrivanje drugih pizdarija" je izuzeta iz svega, po ID-u.

## Radnici — povezivanje i obavijest o satima
- [x] Obavijest o upisanim satima ne ruši upis (0016) + greške „Poveži" u dijagnostiku, poruka s danima i satima
- [ ] Kašteli: vlasnik sam povezuje Petra kroz aplikaciju nakon objave (čeka korisnika)
