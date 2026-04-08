

## Kalendar za planiranje - nova stranica

### Sto radimo
Dodajemo novu stranicu **Kalendar** dostupnu iz bottom navigacije, koja prikazuje mjesecni kalendar s:
- Postojecim transakcijama (iz `expenses` tablice)
- Planiranim dogadajima/podsjetnicima (iz `reminders` tablice koja vec postoji)
- Ponavljajucim transakcijama (iz `recurring_transactions`)
- Mogucnost dodavanja novih planiranih stavki (rodjendani, planirani troskovi, rokovi placanja)

### Koristimo postojecu infrastrukturu
- **`reminders` tablica** vec postoji u bazi s poljima: `title`, `description`, `remind_at`, `type`, `is_completed`, `business_profile_id`
- **`recurring_transactions`** za prikaz buducih ocekivanih troskova
- **`SpendingCalendar`** komponenta vec ima mjesecni grid - prosirujemo logiku
- **ICS export** vec postoji za sinkronizaciju s vanjskim kalendarima

### Koraci

**1. Nova stranica `src/pages/Calendar.tsx`**
- Mjesecni kalendar (grid prikaz kao u SpendingCalendar)
- Svaki dan prikazuje tocke/bedze za razlicite tipove: plavi = transakcija, zeleni = prihod, narancasti = podsjetnik/dogadaj, crveni = rok
- Klik na dan otvara listu stavki tog dana
- FAB gumb za dodavanje novog planiranog dogadaja

**2. Nova komponenta `src/components/calendar/CalendarEventDialog.tsx`**
- Dialog za dodavanje/uredivanje planiranih dogadaja
- Polja: naslov, datum, tip (rodjendan, planirani trosak, rok placanja, custom), opis, podsjetnik (da/ne), ponavljanje (jednokratno/godisnje/mjesecno)
- Sprema u `reminders` tablicu s odgovarajucim `type` poljem

**3. Komponenta `src/components/calendar/CalendarDayDetail.tsx`**
- Sheet/bottom drawer koji se otvara klikom na dan
- Prikazuje: stvarne transakcije tog dana, planirane dogadaje, dospjele ponavljajuce transakcije
- Svaka stavka ima ikonu po tipu i akcije (oznaci kao zavrseno, uredi, obrisi)

**4. Hook `src/hooks/useCalendarEvents.ts`**
- Dohvaca i kombinira podatke iz 3 izvora: expenses, reminders, recurring_transactions
- Filtrira po mjesecu za efikasnost
- Vraca mapu `datum -> stavke[]`

**5. Dodati rutu u `App.tsx` i navigaciju**
- Nova ruta `/calendar`
- Dodati ikonu kalendara u BottomNav (zamjenjuje ili se dodaje pored postojecih)

### Baza podataka
- Bez novih tablica - koristimo postojecu `reminders` tablicu
- Moguce dodavanje par novih `type` vrijednosti (birthday, planned_expense, deadline) - to je samo tekst polje, ne treba migraciju

### Vizualni koncept
```text
┌─────────────────────────┐
│  < Travanj 2026 >       │
├──┬──┬──┬──┬──┬──┬──────┤
│Po│Ut│Sr│Ce│Pe│Su│Ne    │
├──┼──┼──┼──┼──┼──┼──────┤
│  │  │ 1│ 2│ 3│ 4│ 5    │
│  │  │  │🔵│  │🟠│      │
├──┼──┼──┼──┼──┼──┼──────┤
│ 6│ 7│ 8│ 9│10│11│12    │
│  │🟢│  │  │🔴│  │🟠🔵 │
└──┴──┴──┴──┴──┴──┴──────┘

🔵 transakcija  🟢 prihod
🟠 dogadaj      🔴 rok
```

Klik na dan 12 otvara drawer s listom stavki.

### Sto NE radimo
- Ne brisemo postojeci SpendingCalendar (ostaje kao widget na dashboardu)
- Ne trebamo npm install - sve koristimo iz postojecih paketa
- Nema nove tablice u bazi

