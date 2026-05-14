## Cilj

Pretraga u top baru dashboarda (`GlobalSearch`) trenutno gleda samo: `description`, `category` (raw key), `merchant_name`, `note`, `amount`. To je preusko — ne nalazi npr. transakcije po imenu izvora plaćanja, projektu, budžetu, lokaliziranom imenu kategorije, ili formatiranom datumu.

Proširujemo pretragu **bez mijenjanja konteksta** (i dalje samo trenutni `allExpenses` iz aktivnog Personal/Business view-a).

## Što će se mijenjati

### 1. `src/components/GlobalSearch.tsx`
- Dodati nove **opcionalne propse** s lookup mapama (id → label):
  - `paymentSources?: { id, name, cards?: [{id, last_four_digits}] }[]`
  - `projects?: { id, name }[]`
  - `budgets?: { id, name }[]`
  - `customCategories?: { id, name }[]`
- Izgraditi indekse `Map<id, name>` u `useMemo`.
- Proširiti filter funkciju da matcha i:
  - **ime izvora plaćanja** preko `payment_source` u formatu `custom:UUID` → lookup name
  - **zadnje 4 znamenke kartice** preko `payment_source_card_id` (već postoji [Card Lookup] memorija)
  - **ime projekta** preko `project_id`
  - **ime budžeta** preko `budget_id`
  - **lokalizirano ime kategorije** (custom kategorije + standardni `t('categories.<key>')` rezolucija)
  - **datum** u dva oblika: `dd.MM.yyyy` i `yyyy-MM-dd`
  - **tip transakcije** preko prevedene oznake (`prihod`, `trošak`, `troskovi`, `prijenos`, EN/DE varijante)
  - **iznos** s normalizacijom decimalnog separatora (`,` ↔ `.`)
- Ukloniti tvrdi limit `slice(0, 12)`. Zamijeniti s pagination patternom **50 + "Prikaži više"** (postoji konvencija — vidi memoriju [List Pagination]).
- Sortiranje ostaje po datumu desc.

### 2. `src/components/home/HomeHeader.tsx`
- Primiti nove propse (`paymentSources`, `projects`, `budgets`, `customCategories`) i proslijediti u `<GlobalSearch>`.

### 3. `src/pages/Index.tsx`
- `contextLookup` već postoji (linija ~164). Proslijediti njegova polja u `HomeHeader`.

### 4. i18n (HR/EN/DE)
- Dodati `search.showMore` ključ.
- Postojeći `search.placeholder`, `search.noResults`, `search.results` ostaju.

## Što se NEĆE dirati
- Opseg podataka (i dalje `allExpenses` iz aktivnog konteksta — Personal vs aktivni Business profil; skriveni izvori i dalje vidljivi u pretrazi jer `allExpenses` nije filtriran kao `dashboardExpenses`).
- Ostale liste, filteri, BusinessMode, RLS, edge funkcije.
- Min. duljina query-a (ostaje 2 znaka).

## Verifikacija
- Otvoriti pretragu, upisati: ime izvora plaćanja, zadnje 4 znamenke kartice, ime projekta, ime budžeta, dio datuma `15.03`, riječ "prijenos" — svaki upit treba vraćati relevantne pogotke.
- Provjeriti da rezultata > 12 prikazuje "Prikaži više".
- Personal vs Business: prebaciti view → pretraga vidi samo transakcije aktivnog konteksta.