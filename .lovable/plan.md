# Specifikacija poslovnih modula

## Pregled sustava

Svaka tvrtka može uključiti/isključiti module prema svojoj djelatnosti. Pri kreiranju tvrtke korisnik odabire djelatnost, sustav preporuči module i kategorije, ali korisnik može sve prilagoditi.

### Podržane djelatnosti (industry_type)
- `construction` — Građevina
- `hospitality` — Ugostiteljstvo
- `retail` — Trgovina
- `manufacturing` — Proizvodnja
- `services` — Usluge
- `healthcare` — Zdravstvo
- `flatrate` — Obrtnik paušalac
- `other` — Ostalo

---

## Modul 1: Paušalni limit (`flatrate_limit`)

**Kome služi:** Obrtnici paušalci koji moraju pratiti godišnji promet da ne prijeđu zakonski limit.

### Podaci koje prati
- Godišnji limit (default: 39.816,84 €, korisnik može promijeniti)
- Ukupni prihod u tekućoj godini (automatski iz transakcija tipa "income")
- Preostali iznos do limita
- Postotak iskorištenosti

### Ekrani
- **Widget na dashboardu**: Progress bar s postotkom iskorištenosti limita, preostali iznos, projekcija do kraja godine
- **Detaljan pregled**: Mjesečni breakdown prihoda, trend graf, upozorenja

### Izvještaji
- Godišnji pregled prihoda po mjesecima
- Projekcija — hoće li prijeći limit ako nastavi istim tempom

### Upozorenja
- ⚠️ na 80% limita
- 🔴 na 90% limita
- 🚨 kad prijeđe limit

### Preporučene kategorije troškova
- Materijal, Alat, Gorivo, Telefon/Internet, Uredski materijal, Bankarske naknade, Računovodstvo

---

## Modul 2: PDV evidencija (`vat_tracking`)

**Kome služi:** Svim PDV obveznicima koji trebaju pratiti ulazni i izlazni PDV.

### Podaci koje prati
- PDV stopa po transakciji (5%, 13%, 25% — HR stope, prilagodljivo)
- Osnovica i iznos PDV-a (automatski izračun)
- Ulazni PDV (rashodi) vs Izlazni PDV (prihodi)
- Obveza za uplatu / pravo na povrat

### Ekrani
- **Widget na dashboardu**: Saldo PDV-a (dugovanje vs potraživanje) za tekuće obračunsko razdoblje
- **PDV pregled** (već postoji `BusinessVATOverview`, proširiti):
  - Filtriranje po obračunskim razdobljima (mjesečno/tromjesečno)
  - Tablica: Izlazni PDV | Ulazni PDV | Razlika
  - Breakdown po stopama (25%, 13%, 5%)
- **Na formi transakcije**: Polje za PDV stopu, automatski izračun osnovice

### Izvještaji
- PDV obračun po razdoblju (PDV obrazac — simplificiran)
- Export za računovođu (CSV/PDF)

### Potrebne izmjene u bazi
- Polje `vat_rate` (numeric, nullable) na `expenses` tablici
- Polje `vat_amount` (numeric, nullable) na `expenses` tablici

---

## Modul 3: Radnici & satnice (`workforce`)

**Kome služi:** Građevina, proizvodnja, usluge — svima koji imaju zaposlenike ili vanjsku radnu snagu.

### Podaci koje prati
- Popis radnika (ime, pozicija, satnica, tip ugovora)
- Dnevna/tjedna evidencija radnih sati
- Troškovi plaća (bruto, neto, doprinosi — simplificiran unos)
- Bolovanja, godišnji odmori (opcionalno)

### Ekrani
- **Popis radnika**: Kartica po radniku s osnovnim podacima (već postoji `ProjectWorkersTab`, generalizirati)
- **Evidencija rada**: Kalendar s unosom sati po radniku/danu (već postoji `WorkCalendarOverview`, generalizirati)
- **Troškovi radne snage**: Mjesečni pregled plaća i ukupnih troškova po radniku

### Izvještaji
- Mjesečni troškovi radne snage
- Sati po radniku/projektu
- Prosječna satnica i trend

### Napomena
- Postojeći `project_workers` i `project_work_entries` su vezani uz projekte. Za ovaj modul treba generalizirati — radnici mogu postojati neovisno o projektima, a satnice se mogu voditi i bez projekta.

---

## Modul 4: Projekti / Gradilišta (`projects`)

**Kome služi:** Građevina, IT, konzalting — djelatnosti koje rade po projektima/ugovorima.

### Podaci koje prati
- Već postoji kompletno (`projects`, `project_milestones`, `project_members`, `project_workers`, `project_work_entries`, `project_funding`)

### Ekrani
- Već implementirano (ProjectFullScreenView, milestones, workers, funding, reports)

### Poboljšanja za ovaj modul
- Povezivanje s modulom Radnici (dijeljeni radnici između projekata)
- Profit po projektu = prihodi projekta - (troškovi + satnice radnika)
- Situacije/privremene situacije (građevina) — izvoz dokumenta s popisom radova

### Izvještaji
- Profit/gubitak po projektu
- Usporedba budžeta vs stvarnih troškova
- Timeline — Gantt prikaz (simplificiran)

---

## Modul 5: Zalihe (`inventory`)

**Kome služi:** Trgovina, ugostiteljstvo, proizvodnja — tko god drži robu na skladištu.

### Podaci koje prati
- Artikli (naziv, šifra, kategorija, jedinica mjere, nabavna cijena, prodajna cijena)
- Stanje zaliha (količina)
- Ulazi (nabava) i izlazi (prodaja/utrošak)
- Minimalna količina (za upozorenja)

### Ekrani
- **Popis artikala**: Pregled svih artikala s trenutnim stanjem
- **Ulaz robe**: Forma za unos nabave (dobavljač, artikli, količine, cijene)
- **Izlaz robe**: Automatski pri prodaji ili ručni unos utroška
- **Inventura**: Pregled i korekcija stanja

### Izvještaji
- Stanje zaliha (vrijednost po nabavnim cijenama)
- Promet artikala (najprodavaniji, najsporiji)
- Inventurna lista

### Potrebne tablice
- `inventory_items` (id, business_profile_id, name, sku, category, unit, purchase_price, selling_price, min_quantity, current_quantity)
- `inventory_movements` (id, item_id, type: in/out, quantity, price, date, note, expense_id)

### Upozorenja
- ⚠️ Artikl pao ispod minimalne količine

---

## Modul 6: Putni troškovi (`travel_expenses`)

**Kome služi:** Svima koji imaju službena putovanja, loko vožnju, dnevnice.

### Podaci koje prati
- Putni nalozi (datum, odredište, svrha, prijevozno sredstvo)
- Kilometraža (početno/završno stanje, km, naknada po km — default 0,40 €/km)
- Dnevnice (pola dnevnice, cijela dnevnica — automatski po trajanju)
- Ostali troškovi puta (cestarina, parking, smještaj)

### Ekrani
- **Popis putnih naloga**: Lista s filterima po mjesecu/statusu
- **Novi putni nalog**: Forma s poljima za rutu, km, dnevnice, troškove
- **Detalj putnog naloga**: Pregled s mogućnošću uređivanja i izvoza

### Izvještaji
- Mjesečni pregled putnih troškova
- Izvoz putnog naloga (PDF) — za računovodstvo
- Kilometraža po vozilu/zaposleniku

### Potrebne tablice
- `travel_orders` (id, business_profile_id, user_id, date_from, date_to, destination, purpose, vehicle, km_start, km_end, km_rate, daily_allowance_type, status)
- `travel_order_expenses` (id, travel_order_id, expense_type, amount, description)

---

## Modul 7: Fakturiranje (`invoicing`)

**Kome služi:** Svima koji trebaju izdavati račune klijentima.

### Podaci koje prati
- Klijenti (naziv, OIB, adresa, kontakt)
- Računi (broj, datum, dospijeće, stavke, ukupno, PDV, status plaćanja)
- Stavke računa (opis, količina, cijena, popust, PDV stopa)

### Ekrani
- **Popis klijenata**: CRUD za klijente
- **Popis računa**: Lista s filterima (plaćeni, neplaćeni, dospjeli)
- **Novi račun**: Forma s odabirom klijenta, stavkama, automatskim izračunom
- **Pregled računa**: Detaljan prikaz + PDF izvoz
- **Widget na dashboardu**: Neplaćeni računi, dospjela potraživanja

### Izvještaji
- Pregled izdanih računa po razdoblju
- Dospjela potraživanja (aging report)
- Prihod po klijentu

### Potrebne tablice
- `clients` (id, business_profile_id, name, oib, address, city, postal_code, country, email, phone, contact_person)
- `invoices` (id, business_profile_id, client_id, invoice_number, issue_date, due_date, status, total_amount, vat_amount, notes, paid_at)
- `invoice_items` (id, invoice_id, description, quantity, unit, unit_price, discount, vat_rate, total)

### Napomena
- Ovo NIJE fiskalizacija — samo interno praćenje. Za fiskalizaciju treba integracija s CIS-om što je van scope-a.

---

## Modul 8: KPI Dashboard (`kpi_dashboard`)

**Kome služi:** Svima — prilagođeni ključni pokazatelji poslovanja.

### KPI-jevi po djelatnosti

**Građevina:**
- Profit po projektu/gradilištu
- Iskorištenost radne snage (%)
- Troškovi materijala vs budžet

**Ugostiteljstvo:**
- Food cost % (troškovi namirnica / prihod × 100, cilj: <30%)
- Beverage cost %
- Prosječni dnevni promet
- Troškovi osoblja / prihod %

**Trgovina:**
- Marža (%)
- Obrtaj zaliha
- Prosječna vrijednost transakcije

**Paušalac:**
- Iskorištenost limita
- Prosječni mjesečni prihod
- Trend prihoda

**Univerzalni:**
- Prihodi vs Rashodi (trend)
- Cash flow projekcija
- Top 5 kategorija troškova
- Dobit/gubitak po mjesecu

### Ekrani
- **Dashboard widgeti**: 3-4 najvažnija KPI-ja za odabranu djelatnost prikazana na početnom ekranu poslovnog moda
- **Detaljan KPI pregled**: Svi pokazatelji s grafovima i trendovima

---

## Matrica: Djelatnost → Preporučeni moduli

| Modul | Građevina | Ugostiteljstvo | Trgovina | Proizvodnja | Usluge | Zdravstvo | Paušalac |
|-------|:---------:|:---------------:|:--------:|:-----------:|:------:|:---------:|:--------:|
| Paušalni limit | - | - | - | - | - | - | ✅ |
| PDV evidencija | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Radnici & satnice | ✅ | ✅ | ○ | ✅ | ○ | ✅ | - |
| Projekti | ✅ | - | - | ○ | ✅ | - | - |
| Zalihe | ○ | ✅ | ✅ | ✅ | - | ○ | - |
| Putni troškovi | ✅ | - | ○ | ○ | ✅ | ○ | ○ |
| Fakturiranje | ✅ | ○ | ○ | ✅ | ✅ | ○ | ○ |
| KPI Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

✅ = preporučeno (uključeno po defaultu)
○ = opcionalno (dostupno ali nije uključeno)
\- = nije relevantno (skriveno)

---

## Preporučene kategorije troškova po djelatnosti

### Građevina
Materijal, Podizvođači, Strojevi i oprema, Gorivo, Zaštita na radu, Transport, Geodetske usluge, Dozvole i takse, Osiguranje, Najam opreme

### Ugostiteljstvo
Namirnice, Piće, Osoblje, Čišćenje i higijena, Inventar, Energija, Najam prostora, Marketing, Koncesije, Održavanje opreme

### Trgovina
Nabava robe, Skladištenje, Transport, Ambalaža, Najam, Marketing, Osoblje, Energija, Osiguranje, IT sustavi

### Proizvodnja
Sirovine, Energija, Strojevi, Održavanje, Osoblje, Transport, Ambalaža, Kontrola kvalitete, Otpad, Alat

### Usluge
Osoblje, Najam ureda, IT oprema, Software, Marketing, Putni troškovi, Edukacija, Telekomunikacije, Osiguranje, Uredski materijal

### Zdravstvo
Medicinska oprema, Lijekovi/materijali, Osoblje, Najam, Energija, Sterilizacija, Osiguranje, Edukacija, IT sustavi, Otpad

### Paušalac
Materijal, Alat, Gorivo, Telefon/Internet, Uredski materijal, Bankarske naknade, Računovodstvo, Edukacija, Software, Osiguranje

---

## Prioritet implementacije

1. **Faza 1**: Sustav modula (baza + UI za odabir) + Paušalni limit + KPI Dashboard
2. **Faza 2**: PDV evidencija (proširenje postojećeg) + Putni troškovi
3. **Faza 3**: Fakturiranje + Zalihe
4. **Faza 4**: Radnici generalizirani (proširenje project_workers)
