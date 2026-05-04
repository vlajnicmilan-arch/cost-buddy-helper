## Cilj

Korisnik više ne bira šablon pri kreiranju projekta. Za svaku vrstu projekta automatski se primjenjuje jedan, unaprijed odabran šablon (faze, ime/ikona/boja samo ako korisnik nije već unio). Korisnik kasnije slobodno mijenja faze unutar projekta.

## Konkretan izbor šablona za zadržati

Za 11 kategorija već postoji točno 1 šablon — ostaje kako je.

Za 2 kategorije s više šablona zadržavamo najgenerički:

| Kategorija | Zadržati (active) | Deaktivirati (is_active=false) |
|---|---|---|
| **renovation** | **Adaptacija stana** (7 faza: Rušenje → Elektro → Voda → Žbukanje → Podovi → Bojanje → Završno) | Renovacija kuhinje, Renovacija kupaonice |
| **it_software** | **MVP razvoj** (5 faza: Discovery → Dizajn → Razvoj → QA → Lansiranje) | Web stranica |

Razlozi:
- "Adaptacija stana" pokriva i kuhinju i kupaonicu kao podfaze većeg projekta; faze su generičke i lako se brišu/preimenuju.
- "MVP razvoj" pokriva i web/app/SaaS; "Web stranica" je podset (Brief → Dizajn → Razvoj → Lansiranje), korisnik to lako dobije brisanjem QA faze iz MVP-a.

3 deaktivirana šablona ostaju u bazi (oporavljivi), samo se ne prikazuju i ne primjenjuju.

## Promjene u kodu i bazi

### 1. DB migracija
- `ALTER TABLE project_templates ADD COLUMN is_active boolean NOT NULL DEFAULT true;`
- Update: `is_active = false` za 3 šablona (Renovacija kuhinje, Renovacija kupaonice, Web stranica) — preko insert/data alata.

### 2. `src/hooks/useProjectTemplates.ts`
- U `select` filtrirati `.eq('is_active', true)` da deaktivirani ne uđu u listu.
- Dodati `is_active: boolean` u TS interface.

### 3. `src/components/projects/ProjectDialog.tsx`
- Ukloniti renderiranje `<ProjectTemplatePicker />` (linije 232-240) zajedno s okvirom.
- Zadržati postojeću logiku auto-selekcije u `handleTypeSelected` (linije 124-133) — ona već primjenjuje 1 match po `templateCategory`. Pošto sad svaka kategorija ima točno 1 aktivan šablon, rezultat je deterministički.
- Maknuti `handleTemplateSelect` funkciju (više se ne koristi).
- Zadržati `selectedTemplate` state — koristi ga `onSave(..., selectedTemplate, ...)` da nasloni faze.

### 4. `src/components/projects/ProjectTemplatePicker.tsx`
- Datoteka se može zadržati za buduću upotrebu, ali izbrisati uvoz iz `ProjectDialog.tsx`. Alternativa: obrisati datoteku.
- Preporuka: **obrisati** komponentu radi čistoće — admin/dev po potrebi može vidjeti šablone direktno u DB.

### 5. i18n
- Maknuti ključeve koji se više ne koriste: `projects.templates.suggestedPhases`, `projects.templates.help`, `projects.templates.empty`, `projects.templates.phases`, `common.clear` (samo ako se nigdje drugdje ne koristi — provjeriti prije brisanja).

## UX rezultat

- Korak 1: korisnik bira vrstu projekta (kao i dosad).
- Korak 2: ime/datumi/budžet — bez "Predložene faze" boxa. Faze se tiho primjenjuju iz šablona kategorije.
- Unutar kreiranog projekta korisnik briše/dodaje/preimenuje faze normalno.

## Rizici / napomene

- Postojeći projekti nisu dirani — `is_active` je samo filter za novu listu.
- Ako u budućnosti netko želi "izabrati drugi šablon" — komponenta je već postojala, lako se vraća (zato samo deaktivacija, ne brisanje DB redaka).
- Deaktivirana 3 šablona se neće više nikad pojaviti u UI. Ako želiš, mogu ih kasnije i obrisati nakon par tjedana.
