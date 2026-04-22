

## Dnevnik rada — implementacija

### Što je Dnevnik rada?

**Dnevnik rada** = vremenska kronologija svega što se dogodilo na **gradilištu/projektu** po danu — tko je radio, koliko sati, na kojoj fazi, što je obavljeno, što su zapazili. Različito od:
- **Aktivnost** (sustavski log: tko je dodao trošak/fazu)
- **Šihterica** (formalna evidencija sati po radniku — NN 55/2024)
- **Standup** (AI-strukturiran glasovni unos koji se **pretvara** u sate)

Dnevnik rada je **slobodan tekstualni zapis po danu** + automatski sažetak sati radnika za taj dan.

---

### Gdje se dodaje

Novi tab **"Dnevnik"** unutar grupe **Posao** (`Briefcase`), pozicija: nakon `Aktivnost`.

```text
Posao: Pregled · Timeline · Faze · Dokumenti · Aktivnost · [Dnevnik]
```

Ikona: `BookOpen` (Lucide). Tab je vidljiv svim članovima projekta (kao Aktivnost).

---

### Model podataka

Nova tablica `project_work_logs`:

| Kolona | Tip | Napomena |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK→projects | ON DELETE CASCADE |
| `log_date` | date NOT NULL | dan kojem se zapis odnosi |
| `user_id` | uuid | autor zapisa |
| `weather` | text | npr. "sunčano, 18°C" (slobodan tekst) |
| `summary` | text NOT NULL | glavni opis dana (što je rađeno) |
| `notes` | text | dodatne napomene/incidenti |
| `milestone_id` | uuid FK→project_milestones | opcionalno: faza |
| `created_at`, `updated_at` | timestamptz | |

**Jedinstvenost**: jedan dnevnik po (projekt, datum, autor) — više članova može imati svoj zapis za isti dan.

**RLS**: identično `project_work_entries` (members SELECT/INSERT/UPDATE, owners DELETE).

**Storage slika**: koristi postojeći `project-documents` bucket — slike dana se vežu kroz postojeću `ProjectDocumentsTab` logiku (s tagom `work_log:{id}`), ne dupliciramo bucket.

---

### UI — `ProjectWorkLogTab.tsx`

**Glavni prikaz**: vertikalna kronologija (najnoviji na vrhu), grupirana po danima.

```text
┌─────────────────────────────────────┐
│ + Novi zapis                        │  ← gumb na vrhu (samo članovi)
├─────────────────────────────────────┤
│ 📅 Pon, 22.4.2026.                  │
│ ☀️ Sunčano, 18°C  ·  🎯 Faza 2     │
│                                     │
│ Završeno žbukanje prizemlja, počeli │
│ s instalacijama u kuhinji.          │
│                                     │
│ 👷 Marko (8h) · Ivan (6h) · Ana (4h)│  ← auto iz work_entries
│ 📝 Napomena: dostava cementa kasni  │
│                                     │
│ ✍️ Petar Petrović · prije 2 sata    │
│                          [Uredi][🗑]│
└─────────────────────────────────────┘
```

**Filter-traka iznad** (mobile-first):
- **Mjesec** (Select): tekući (default), prošli, prošli-2, sve
- **Faza** (Select): sve faze · [popis] · bez faze
- **Pretraga** (Input): po sažetku/napomeni/autoru
- **Sortiranje** implicitno: silazno po datumu (najnoviji prvi)

**Dijalog za novi/uredi zapis** (`WorkLogDialog`):
- Datum (DatePicker, default: danas)
- Faza (Select, opcionalno)
- Vrijeme (Input, opcionalno) — npr. "Sunčano 18°C"
- **Što je rađeno** (Textarea) + 🎤 mikrofon
- **Napomene/incidenti** (Textarea) + 🎤 mikrofon
- Gumb: "Spremi"

**Auto-pridruženi sati**: kartica dana automatski povlači sve `project_work_entries` za taj `(project_id, work_date)` i prikazuje sažetak radnika i sati — **ne unosi se ručno** (već postoji u Šihterici/Kalendaru rada).

---

### Quick action — "+ Dnevni zapis" iz `BusinessProjects`

Dodajem stavku u postojeći "Brza akcija" dropdown (gdje je već Standup, Plus, Camera) — ikona `BookOpen`, otvara `WorkLogDialog` s pre-odabranim projektom.

**Jasna razlika od Standup-a**: Standup = AI parsira sate iz govora; Dnevnik = ručni opis dana (sate sustav sam pridruži iz drugih izvora).

---

### Aktivnost integracija

Kad se kreira/uredi/obriše zapis dnevnika, automatski log u `project_activity_log`:
- `work_log_added` — "dodao dnevnik za 22.4.2026"
- `work_log_updated` — "ažurirao dnevnik za …"
- `work_log_deleted` — "obrisao dnevnik za …"

Ikone u `ProjectActivityTab.tsx` se proširuju (`BookOpen`).

---

### Izvoz

Dodatak u postojeći `ProjectReportsDialog`: novi gumb **"Izvezi dnevnik (PDF)"** koji generira mjesečni dnevnik kronološki — datum, vrijeme, što je rađeno, sati radnika, napomene. Koristi postojeći `projectReportExport.ts` obrazac.

---

### Tehničke izmjene

| Datoteka | Promjena |
|---|---|
| `supabase/migrations/...` | Nova tablica `project_work_logs` + RLS politike + trigger `update_updated_at` + activity log trigger |
| `src/types/projectWorkLog.ts` | TS tipovi (NOVO) |
| `src/hooks/useProjectWorkLogs.ts` | CRUD hook (NOVO): fetch/create/update/delete + summary sati |
| `src/components/projects/ProjectWorkLogTab.tsx` | Glavni tab (NOVO) — lista, filteri, prazno stanje |
| `src/components/projects/WorkLogDialog.tsx` | Dijalog za unos/uređivanje (NOVO) — s mikrofonom |
| `src/components/projects/ProjectFullScreenView.tsx` | Dodati `worklog` u `TAB_TO_GROUP`, `TabsTrigger` u Posao grupi, `TabsContent` |
| `src/components/projects/ProjectActivityTab.tsx` | Nove ikone za `work_log_*` action types |
| `src/components/business/BusinessProjects.tsx` | Nova quick-action stavka "Dnevni zapis" |
| `src/components/projects/ProjectReportsDialog.tsx` | Gumb za PDF izvoz dnevnika |
| `src/lib/projectReportExport.ts` | Funkcija `exportWorkLogPDF()` |
| `src/i18n/locales/{hr,en,de}.json` | ~25 ključeva pod `workLog.*` |

---

### Što se NE mijenja

- `project_work_entries` (Šihterica i Kalendar rada ostaju) — Dnevnik samo **čita** sate odande
- `project_activity_log` struktura
- Postojeći Standup tijek
- RLS na drugim tablicama
- Naplatni model (dostupno svim korisnicima — kao Aktivnost)

---

### Očekivani ishod

- Otvoriš projekt → **Posao → Dnevnik** → vidiš kronološki zapis svih dana s opisom rada, fazom, radnicima i satima
- Klik **+ Novi zapis** → diktiraš ili upišeš što je danas rađeno + napomene → spremiš
- Sati radnika za taj dan se **automatski povuku** iz Šihterice/Kalendara rada
- Filtriraj po mjesecu i fazi, pretraži po tekstu
- Iz **Brza akcija** u Poslovnom modu dodaješ zapis bez otvaranja projekta
- Izvezeš mjesečni dnevnik kao PDF za klijenta/arhivu
- Sve radi na 384 px viewportu, podržano u HR/EN/DE

