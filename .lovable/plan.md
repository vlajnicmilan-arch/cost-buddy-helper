

# Plan: Šihterica — Evidencija radnog vremena za poslovne projekte

## Kontekst — Hrvatski zakon

Prema **Pravilniku NN 55/2024** (stupio na snagu 1.10.2024.) i Zakonu o radu, poslodavac MORA evidentirati **17 stupaca** podataka:

**Radno vrijeme:** redovni rad, noćni rad (22-06h), prekovremeni rad, rad nedjeljom, rad blagdanom, terenski rad

**Odsutnosti:** godišnji odmor, bolovanje (teret poslodavca ≤42 dana), bolovanje (teret HZZO), plaćeni dopust, neplaćeni dopust, rodiljni/roditeljski dopust, komplikacije u trudnoći

**Ostalo:** zastoj u radu, pripravnost, dnevni odmor, tjedni odmor

Kazne za nevođenje: **8.090 – 13.270 EUR** za pravnu osobu. Evidencija se čuva **6 godina**.

---

## Postojeća infrastruktura

Već imate:
- `project_workers` tablica (ime, prezime, pozicija, satnica, radno vrijeme)
- `project_work_entries` tablica (datum, planirani/ostvareni sati, bilješka, faza)
- `WorkCalendarOverview` (998 linija) i `WeeklyWorkEntryForm` komponente
- Export u PDF/CSV/JSON

**Problem:** Trenutni sustav prati samo ukupne sate po danu — nema clock-in/out, pauza, tipova rada, niti odsutnosti prema zakonu.

---

## Arhitektura šihterice

### Nova tablica: `time_clock_entries`

```text
id              uuid PK
worker_id       uuid FK → project_workers
project_id      uuid FK → projects  
user_id         uuid (vlasnik tvrtke)
recorded_by     uuid (tko je unio: manager ili radnik)
work_date       date
clock_in        timestamptz
clock_out       timestamptz | null
break_start     timestamptz | null
break_end       timestamptz | null
break_minutes   int (izračunato)
net_hours       numeric (efektivno radno vrijeme)

-- Zakonski stupci (Pravilnik NN 55/2024)
entry_type      text  -- 'regular', 'overtime', 'night', 'sunday', 'holiday', 'standby', 'field'
absence_type    text | null  -- 'annual_leave', 'sick_employer', 'sick_hzzo', 'paid_leave', 'unpaid_leave', 'parental', 'pregnancy_complication', 'work_stoppage'

note            text | null
location_coords text | null  (GPS pri clock-in/out)
status          text  -- 'active' (clock-in bez clock-out), 'completed', 'corrected'
created_at      timestamptz
updated_at      timestamptz
```

RLS polise: vlasnik tvrtke (user_id) ima puni pristup, projekt manager može čitati/unositi.

### Integracija

- Šihterica radi **paralelno** s postojećim `project_work_entries` (za planiranje ostaje stari sustav)
- Opcija: automatski generirati `project_work_entry` iz šihterice na kraju dana (sync gumb)

---

## UI komponente

### 1. TimeClockTab (novi tab u ProjectDetailDialog)
- Vidljiv samo u poslovnom modu (Business tier)
- Ikona: `Clock` — "Šihterica"
- Sadržaj:
  - **Današnji pregled** — kartica za svakog radnika s statusom (na poslu / na pauzi / odsutan / nije došao)
  - **Brzi clock-in/out gumbi** — manager može prijaviti/odjaviti radnike
  - **Mjesečni pregled** — tablica po danima × radnici (17 zakonskih stupaca)

### 2. TimeClockDialog (za unos/korekciju)
- Odabir radnika
- Tip unosa: Dolazak | Odlazak | Pauza | Odsutnost
- Za odsutnosti: tip odsutnosti (godišnji, bolovanje, itd.)
- Polje za bilješku
- GPS lokacija (opciono, koristi postojeći `useLocation` hook)

### 3. TimeClockDailyView
- Kartica za današnji dan
- Svaki radnik: zeleni/žuti/crveni indikator
- Swipe za brzi clock-in/out na mobilnom

### 4. TimeClockMonthlyReport
- Tablica: redovi = radnici, stupci = dani u mjesecu
- Sumira: redovni sati, prekovremeni, noćni, nedjelja, blagdan, odsutnosti
- **Export PDF** — format usklađen s Pravilnikom NN 55/2024 (17 stupaca)
- **Export CSV** — za računovodstvo

---

## Datoteke za kreiranje/promjenu

| Datoteka | Akcija |
|---|---|
| **Migracija** | Nova tablica `time_clock_entries` + RLS |
| `src/types/timeClock.ts` | Tipovi za šihtericu |
| `src/hooks/useTimeClock.ts` | CRUD + real-time status radnika |
| `src/components/timeclock/TimeClockTab.tsx` | Glavni tab |
| `src/components/timeclock/TimeClockDialog.tsx` | Unos/korekcija |
| `src/components/timeclock/TimeClockDailyView.tsx` | Dnevni pregled |
| `src/components/timeclock/TimeClockMonthlyReport.tsx` | Mjesečni izvještaj |
| `src/components/timeclock/TimeClockExport.ts` | PDF/CSV export (zakonski format) |
| `src/components/projects/ProjectDetailDialog.tsx` | Dodati "Šihterica" tab |
| `src/i18n/locales/hr.json`, `en.json`, `de.json` | Prijevodi |

---

## Faze implementacije

**Faza 1** (ovaj put): Tablica + tipovi + dnevni clock-in/out s pauzama + osnovni UI tab
**Faza 2**: Mjesečni izvještaj + PDF export u zakonskom formatu + odsutnosti  
**Faza 3**: GPS lokacija + radnik sam se prijavljuje (auth za radnike)

Počet ću s **Fazom 1** — to daje funkcionalan MVP šihterice.

