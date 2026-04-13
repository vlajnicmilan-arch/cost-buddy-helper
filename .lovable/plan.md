

# Plan: Kalendar — življe boje, kontrast točkica i državni praznici

## Promjene

### 1. Nedjelje crvenkaste
- U kalendar gridu, detektirati koji dan u tjednu pada svaki `day` koristeći `(firstDayOfWeek + i) % 7 === 6` (nedjelja je index 6 u ponedjeljak-prvi rasporedu)
- Dodati `text-red-400 dark:text-red-400` na broj dana za nedjelje
- Zaglavlje "Ne" također obojiti crvenkasto umjesto `text-muted-foreground/60`

### 2. Točkice s boljim kontrastom
- Dodati `ring-1 ring-background` (bijeli/tamni obrub) na svaku točkicu kako bi se istaknula neovisno o pozadini ćelije
- Povećati točkice s `w-1.5 h-1.5` na `w-2 h-2` za bolju vidljivost
- Za ćelije s `bg-primary/10` (odabrani dan), dodati `shadow-sm` na točkice

### 3. Državni praznici prema jeziku aplikacije
- Kreirati novi helper `src/lib/holidays.ts` s hardkodiranim praznicima za 3 zemlje:
  - `hr` → Hrvatska (Nova godina, Bogojavljenje, Uskrs, Tijelovo, 1.5., 30.5., 22.6., 5.8., 15.8., 1.11., 18.11., 25-26.12.)
  - `en` → UK (New Year, Easter, May Bank Holidays, Spring BH, Summer BH, Christmas, Boxing Day)
  - `de` → Njemačka (Neujahr, Karfreitag, Ostermontag, Tag der Arbeit, Himmelfahrt, Pfingstmontag, Tag der Deutschen Einheit, Weihnachten)
- Uskrs i pomični praznici: izračunati pomoću Gauss algoritma za godinu
- Funkcija `getHolidays(year: number, lang: string): Map<string, string>` — vraća `dateKey → naziv praznika`

### 4. Prikaz praznika u kalendaru
- U `Calendar.tsx`, pozvati `getHolidays(year, i18n.language)` i dodati praznike kao posebnu vrstu oznake
- Ćelije s praznikom dobivaju suptilnu pozadinu: `bg-red-500/5 dark:bg-red-500/10`
- Naziv praznika prikazati u `CalendarDayDetail` sheet-u kao event tipa `'holiday'`
- Dodati novu boju točkice: `holiday: 'bg-purple-500'` i u legendu
- Praznici se NE spremaju u bazu — generiraju se na klijentu

### 5. CalendarEvent tip — proširiti
- Dodati `'holiday'` u `type` union i `source` union u `CalendarEvent` interfejs
- Praznici se ubacuju u `eventsByDate` mapu direktno u `Calendar.tsx` (ne u hook, jer ovise o jeziku)

## Datoteke

| Datoteka | Akcija |
|---|---|
| `src/lib/holidays.ts` | **Nova** — helper za državne praznike |
| `src/pages/Calendar.tsx` | Nedjelje crvene, praznici, kontrast točkica |
| `src/hooks/useCalendarEvents.ts` | Dodati `'holiday'` u CalendarEvent type |
| `src/components/calendar/CalendarDayDetail.tsx` | Prikaz praznika u dnevnom pregledu |
| `src/i18n/locales/hr.json` | i18n ključevi za praznike |
| `src/i18n/locales/en.json` | i18n ključevi za praznike |
| `src/i18n/locales/de.json` | i18n ključevi za praznike |

Nema promjena baze, migracija ni backend-a.

