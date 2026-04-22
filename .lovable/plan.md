

## Kartica Radnici — sati za tekući mjesec + filteri

### Što se mijenja

**1. Dodatni izračun: sati za tekući mjesec**
- U `useProjectWorkers.ts` proširujem dohvat `project_work_entries` da vrati i `work_date`, pa za svakog radnika izračunavam:
  - `currentMonthHours` — zbroj `actual_hours` gdje je `work_date` u tekućem mjesecu
  - `currentMonthCost` — `currentMonthHours × hourly_rate`
  - `periodHours` / `periodCost` — zbroj za odabrani period (računa se klijentski na temelju filtera)

**2. Nova kartica filtera iznad popisa radnika**

Dodajem novu sekciju iznad popisa s 3 filtera u jednom redu (mobile-friendly grid):

| Filter | Tip | Opcije |
|---|---|---|
| **Period** | Select | Tekući mjesec (default) · Prethodni mjesec · Zadnjih 30 dana · Zadnjih 90 dana · Cijela godina · Sve vrijeme · Prilagođeno |
| **Sortiraj po** | Select | Ime · Pozicija · Cijena sata (↓) · Sati u periodu (↓) · Trošak u periodu (↓) |
| **Pretraga** | Input | Pretraga po imenu/poziciji (live) |

Kad korisnik odabere "Prilagođeno" — ispod se pojavljuju dva date pickera (od/do).

**3. Prikaz po radniku u listi (proširen)**

Za svaku karticu radnika:
```text
┌─────────────────────────────────────┐
│ Marko Marić          [Zidar]        │
│ 🕒 08:00–16:00   💶 15 €/sat        │
│                                     │
│ Tekući mjesec: 42h = 630 €          │  ← NOVO
│ Period (zadnjih 30d): 88h = 1.320 € │  ← NOVO (dinamički label)
│ Ukupno: 156h = 2.340 €              │
└─────────────────────────────────────┘
```

Kad je period = "Tekući mjesec", redovi 1 i 2 se spajaju da se ne ponavlja.

**4. Sažetak na vrhu (već postoji, samo se nadopunjuje)**

Postojeća kartica "Ukupni trošak rada" prikazuje uz postojeće "ukupno" još i:
- Ukupno za odabrani period (X radnika · Y sati · Z €)
- Broj aktivnih radnika u tom periodu (oni s ≥1 unosom)

### Tehničke izmjene

| Datoteka | Promjena |
|---|---|
| `src/hooks/useProjectWorkers.ts` | Dohvat `work_date` u entries, izračun `currentMonthHours/Cost`, izlaganje `entries` (ili helper `getStatsForPeriod`) tako da tab može računati period |
| `src/components/projects/ProjectWorkersTab.tsx` | Nova filter-traka (Select × 2 + Input + opcionalno DatePicker × 2), `useMemo` za filtriranu/sortiranu listu, prošireni prikaz po radniku, prošireni summary |
| `src/i18n/locales/{hr,en,de}.json` | ~12 novih ključeva: `workers.filterPeriod`, `workers.currentMonth`, `workers.previousMonth`, `workers.last30Days`, `workers.last90Days`, `workers.thisYear`, `workers.allTime`, `workers.custom`, `workers.sortBy`, `workers.search`, `workers.activeWorkers`, `workers.periodLabel` |

### Što se NE mijenja

- Tablica `project_workers` i `project_work_entries` ostaju netaknute (samo dohvaćamo postojeća polja)
- RLS politike
- Kalendarski pregled (`WorkCalendarOverview`)
- Dijalozi (Add/Edit, Schedule)
- Logika izvoza (PDF/CSV/JSON)
- Svi ostali tabovi projekta

### Očekivani ishod

- Otvoriš projekt → tab **Radnici** → odmah vidiš za svakog radnika sate za tekući mjesec
- Možeš mijenjati period (npr. prošli mjesec) i sve kartice se ažuriraju u realnom vremenu
- Sortiranje po cijeni/satima/trošku — tko je najskuplji, tko je najviše radio
- Pretraga po imenu — brzi pronalazak u dugačkim listama
- Sve i dalje radi na 384 px viewportu (filteri u `grid grid-cols-2 sm:grid-cols-3` rasporedu)

