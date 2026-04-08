

## Dodavanje događaja u Google/mobilni kalendar

### Kako funkcionira
Aplikacija već ima **ICS export** (`src/lib/icsExport.ts`) koji generira `.ics` datoteke. ICS format je univerzalni standard koji otvaraju Google Calendar, Apple Calendar, Outlook i svi mobilni kalendari. Samo trebamo dodati gumb za izvoz na odgovarajućim mjestima.

### Koraci

**1. Dodati gumb "Dodaj u kalendar" u `CalendarDayDetail.tsx`**
- Za svaki reminder/recurring/transaction event, dodati ikonu kalendara (CalendarPlus)
- Klik generira `.ics` datoteku za taj jedan događaj i pokreće download/share
- Na mobitelu, otvaranje `.ics` datoteke automatski nudi izbor kalendara (Google, Samsung, Apple itd.)

**2. Dodati opciju "Izvezi sve" u `Calendar.tsx`**
- Gumb u headeru stranice za izvoz svih događaja prikazanog mjeseca u jednu `.ics` datoteku
- Koristi postojeću `downloadICS()` funkciju

**3. Prilagoditi `icsExport.ts` za CalendarEvent tip**
- Dodati novu helper funkciju `downloadCalendarEventICS(event: CalendarEvent)` koja mapira CalendarEvent na ReminderEvent format
- Transakcije dobivaju iznos u opisu, reminderi zadržavaju opis

### Rezultat
- Korisnik klikne ikonu kalendara pored stavke → otvara se `.ics` → telefon pita "Dodaj u Google Calendar / Apple Calendar?"
- Na webu, preuzima se datoteka koju korisnik može dvoklikom otvoriti u Outlook/Google Calendar
- Nativni file export sustav (već implementiran) automatski koristi Share dialog na Capacitor platformi

### Bez promjena
- Nema novih npm paketa
- Nema baze podataka promjena
- Koristi postojeću infrastrukturu (`icsExport.ts` + `fileExport.ts`)

