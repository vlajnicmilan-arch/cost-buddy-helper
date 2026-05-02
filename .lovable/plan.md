
# Razdvajanje "Vrsta projekta" vs "Šablona faza"

## Problem (potvrđen u DB)

`project_templates` trenutno ima samo 5 zapisa, sve vezane za građevinu/renovaciju + jedan "Generalno":

- construction: Izgradnja krovišta
- renovation: Adaptacija stana, Renovacija kuhinje, Renovacija kupaonice
- general: Generalno

Kad korisnik odabere npr. **IT projekt** ili **Marketing**, picker zbog `category === 'general'` fallbacka pokazuje "Generalno" + nikakve relevantne šablone, a u UI-u izgleda kao da su to "IT šablone". Kod konstrukcije pokazuje sve građevinske što je OK, ali za 11 ostalih djelatnosti nema ničeg smislenog.

## Što ćemo napraviti

### 1. Strogi filter (bez "general" fallbacka)

`ProjectTemplatePicker` više **NE** uključuje `category = 'general'` automatski. Pokazuje **samo** šablone čija kategorija točno odgovara `templateCategory` odabrane vrste. Ako odabrana vrsta nema `templateCategory`, picker se ne renderira.

### 2. Prazno stanje umjesto tuđih šablona

Ako za vrstu postoji `templateCategory` ali **nijedna** šablona u DB-u ne odgovara, picker prikazuje malu praznu karticu:

> Za ovu vrstu projekta još nemamo predložene faze. Možeš ih unijeti ručno ili dodati kasnije.

(bez gumba — korisnik samo nastavlja ispunjavati formu)

### 3. Jasnija terminologija u UI-u

- Naslov bloka: **"Predložene faze za ovu vrstu projekta (opcionalno)"** umjesto "Započni iz šablone".
- Vizualno odvojen panel s natpisom male veličine koji u jednoj rečenici objašnjava: *Šablona daje samo početni popis faza koje kasnije možeš mijenjati. Ne mijenja vrstu projekta.*
- i18n ključevi u namespace-u `projects.templates.*` (hr/en/de).

### 4. Auto pre-select samo na točan match

`handleTypeSelected` u `ProjectDialog`:
- traži `templates.find(t => t.category === preset.templateCategory)`
- ako nema match — `selectedTemplate = null`, **ne diramo** ime/ikonu/opis (preset je već postavio ikonu/boju vrste)
- ako ima match — pred-popunjava kao i sad, ali **bez** prepisivanja ako je korisnik već nešto utipkao

### 5. Šablone po djelatnostima (DB seed migracija)

Dodajemo public šablone (1–2 po vrsti) za svih 11 vrsta koje sad nemaju ništa, sve sa smislenim fazama (`default_milestones` JSON: `name`, `order`, `days_offset`):

| project_type | template category | template name |
|---|---|---|
| it_software | it_software | MVP razvoj (Discovery → Design → Development → QA → Launch) |
| it_software | it_software | Web stranica (Brief → Dizajn → Razvoj → Lansiranje) |
| marketing | marketing | Lansiranje kampanje (Strategija → Kreativa → Produkcija → Distribucija → Analiza) |
| education | education | Tečaj/program (Curriculum → Materijali → Pilot → Lansiranje) |
| beauty | beauty | Otvaranje salona (Lokacija → Uređenje → Oprema → Marketing → Otvorenje) |
| hospitality_event | hospitality_event | Organizacija eventa (Koncept → Lokacija → Catering → Promocija → Realizacija) |
| healthcare | healthcare | Otvaranje ordinacije (Dozvole → Prostor → Oprema → Osoblje → Otvorenje) |
| retail_opening | retail_opening | Otvaranje trgovine (Lokacija → Uređenje → Asortiman → Marketing → Otvorenje) |
| manufacturing | manufacturing | Pokretanje proizvodnje (Plan → Oprema → Sirovina → Probna serija → Serija) |
| private_event | private_event | Privatna proslava (Plan → Lokacija → Catering → Gosti → Realizacija) |
| interior | interior | Uređenje interijera (Konzultacija → Dizajn → Nabava → Montaža) |

Postojećih 5 ostaje. Ime kategorije = `id` vrste (snake_case) — tako 1:1 odgovara `templateCategory` u `projectTypes.ts`.

### 6. Sinkronizacija `templateCategory`

U `src/lib/projectTypes.ts` postaviti `templateCategory` na `id` za sve 11 djelatnosti gdje sad fali (`it_software`, `marketing`, `education`, `beauty`, `hospitality_event`, `healthcare`, `retail_opening`, `manufacturing`, `private_event`). `interior` ostaje `'renovation'`? **Ne** — mijenjamo na `'interior'` da pokaže novu specifičnu šablonu, a renovation šablone neće više curiti.

`general` zadržava `templateCategory: 'general'` (jedina vrsta koja vidi "Generalno" šablonu).

## Tehnički detalji

**Datoteke koje se mijenjaju:**

- `src/components/projects/ProjectTemplatePicker.tsx` — ukloniti `t.category === 'general' || !t.category` iz filtera; dodati prazno stanje; promijeniti i18n naslov.
- `src/components/projects/ProjectDialog.tsx` — auto pre-select samo na točan match, ne prepisivati upisana polja; promijeniti tekst panela na "Predložene faze".
- `src/lib/projectTypes.ts` — dodati `templateCategory` za 9 vrsta, `interior` → `'interior'`.
- `src/i18n/locales/{hr,en,de}.json` — `projects.templates.suggestedPhases`, `projects.templates.empty`, `projects.templates.help`.
- Nova migracija `supabase/migrations/<ts>_seed_industry_templates.sql` — INSERT 11 novih `project_templates` zapisa s `is_public=true`, `created_by=null`.

**Nema schema promjena** — samo seed novih redaka u postojećoj tablici.

**Memorija:** ažurirati `mem://features/project-type-presets.md` da odražava strogi 1:1 mapping i prazno stanje (bez "general" fallbacka).

## Što NE radimo

- Ne mijenjamo Korak 1 (izbornik vrste) — radi kako treba.
- Ne mijenjamo edit flow — vrsta ostaje zaključana.
- Ne diramo postojeće građevinske/renovacijske šablone.
- Ne dodajemo UI za uređivanje šablona (admin) — to je odvojen feature.
