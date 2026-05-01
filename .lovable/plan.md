
## Stručna analiza: Trebaš li šihterica modul?

### Kontekst
Aplikacija nije službeni alat za knjigovodstvo/računovodstvo, već **interna evidencija** za tebe i tvoje radnike. Trenutno postoje **dva paralelna sustava** koji prate iste podatke (radne sate):

1. **Dnevnik rada** (`project_work_logs` + `project_work_entries`) — radnik upiše datum, sažetak i ukupne sate. Ovo je primarni tok koji upravo gradimo.
2. **Šihterica / TimeClock** (`time_clock_entries`) — radnik klikne "dolazak", "pauza", "odlazak"; aplikacija sama broji minute. 17 kolona prema NN 55/2024 (regular/overtime/night/sunday/holiday/standby/field hours), tipovi odsutnosti (godišnji, bolovanje HZZO, roditeljski...).

### Što trenutno koristiš
- 4 zapisa ukupno u `time_clock_entries`, samo 1 korisnik (vjerojatno tvoj test).
- Modul ima ~1490 linija koda + dedicirane RLS politike + monthly report export prema NN 55/2024 formi.

### Stručna procjena

**Šihterica je dizajnirana za pravnu usklađenost prema Pravilniku NN 55/2024** (službena evidencija radnog vremena u Hrvatskoj). Konkretno:
- 7 tipova sati (regular/overtime/night/sunday/holiday/standby/field) — postoji **isključivo zato** što inspekcija rada to traži
- 8 tipova odsutnosti s razlikom HZZO vs poslodavac — relevantno za **obračun plaća**
- Monthly report u formatu koji se predaje računovodstvu

**Ako ne predaješ ništa računovodstvu/inspekciji, sve to je overhead.** Za internu kontrolu tko je koliko radio, dovoljno je:
- Datum + ukupni sati + napomena (= dnevnik rada koji već imaš)
- Eventualno tip dana (radni / vikend / godišnji) ako ti to treba za pregled

### Preporuka

**Ukloni šihterica modul.** Razlozi:

1. **Duplikacija s dnevnikom rada.** Već imamo `project_work_entries` koji bilježi sate po radniku po danu. Šihterica radi isto, samo s više kolona koje ti ne trebaš.
2. **Loša korisnička priča za radnika.** Tvoji radnici (Test, Ivan, Dominik...) trebaju **jedan jednostavan flow**: otvori dnevnik → upiši što si radio i koliko sati. Klikanje "dolazak/pauza/odlazak" 3× dnevno je friction kojeg neće raditi.
3. **Nije potrebno za zakonsku usklađenost** jer aplikacija nije službeni alat.
4. **Manje koda za održavanje** (~1500 linija + RLS + export).

### Što dodati u dnevnik rada da pokrije rupe

Da ne izgubiš korisne stvari iz šihterice, predlažem proširenje `project_work_logs`:

- **Tip dana** (dropdown): radni / vikend / godišnji / bolovanje / neradan — samo za tvoj pregled, bez pravnih implikacija
- **Mjesečni pregled radnika** (jednostavan): tablica radnika × dana s ukupnim satima; export u PDF/CSV za internu upotrebu (ne službeni obrazac)
- **Opcionalno: dolazak/odlazak vrijeme** kao 2 polja u istom formularu (npr. "07:00 - 15:30") ako želiš zadržati tu informaciju — ali bez automatskog brojanja, bez 7 kategorija sati

### Plan implementacije (ako odobriš)

1. **Sigurnosna kopija**: izvezi `time_clock_entries` u CSV (ima samo 4 zapisa) — za svaki slučaj
2. **Ukloniti UI**: `TimeClockTab` iz `ProjectFullScreenView`, izbrisati `src/components/timeclock/`, `useTimeClock.ts`, `types/timeClock.ts`, `lib/workRecordsExport.ts`
3. **Ukloniti DB tablicu**: `DROP TABLE time_clock_entries` (migracija)
4. **Očistiti i18n**: ukloniti `timeClock.*` ključeve iz hr/en/de
5. **Proširiti dnevnik rada**:
   - Dodati `day_type` kolonu u `project_work_logs` (radni/vikend/godišnji/bolovanje/neradan)
   - Dodati opcijska polja `clock_in_time` i `clock_out_time` (samo string "HH:MM", bez kalkulacije)
   - Dodati **mjesečni pregled radnika** komponentu unutar Dnevnik rada taba — tablica dana × radnika sa zbrojem sati po radniku
   - Jednostavan PDF/CSV export tog pregleda

### Tehnički detalji

- Šihterica zapisi (`time_clock_entries`) i dnevnik (`project_work_entries`) **nisu povezani**, pa migracija nije potrebna — samo backup.
- Trigger `sync_work_log_to_entry` (već postoji) automatski održava `project_work_entries` iz `project_work_logs` — ostaje netaknut.
- `time_clock_entries` ima RLS politike koje će biti uklonjene zajedno s tablicom.
- Routing/lazy-loading: `TimeClockTab` se trenutno učitava direktno (ne lazy), pa nakon brisanja nema mrtvih chunkova.

### Alternativa (ako ipak želiš zadržati)

Ako misliš da bi nekad u budućnosti htio službenu usklađenost s NN 55/2024 (npr. ako pretvoriš ovo u SaaS za male obrte), zadrži šihtericu **ali sakrij iz UI-ja** dok ti ne zatreba. Tada modul postoji u kodu ali ne zbunjuje tebe ni radnike. Manje preporučeno — i dalje je teret za održavanje.

---

**Moja preporuka: ukloni šihtericu, proširi dnevnik rada s `day_type` + opcijskim vremenom + mjesečnim pregledom.** Reci mi što odlučuješ pa ću implementirati.
