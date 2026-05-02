
# Project Type Presets — finalni plan

## 1. Odluke (potvrđene)

- **12 preseta + Općenito** (fallback). Bez auto-servisa/poljoprivrede/transporta — može kasnije.
- **Korak 1 obavezan**, bez "Preskoči". "Općenito" igra ulogu mekog fallbacka.
- **Preset auto-filtrira i pred-odabire** najbolju šablonu faza u Koraku 2; korisnik je može promijeniti ili maknuti.
- `project_type` **zaključan nakon kreiranja**.
- **`labels_override` se NE implementira sada**, ali arhitektura mora biti spremna da se to lako doda kasnije.

## 2. 12 preseta + Općenito

| ID | Naziv (HR) | Icon | Override-ani tabovi |
|---|---|---|---|
| `construction_new` | Gradilište / Novogradnja | 🏗️ | Faze→Etape gradnje · Suradnici→Podizvođači · Dokumenti→Nacrti & Dozvole |
| `renovation` | Adaptacija / Renovacija | 🔨 | Faze→Faze radova · Suradnici→Majstori · Dokumenti→Ponude & Računi |
| `interior` | Uređenje interijera | 🛋️ | Faze→Faze uređenja · Suradnici→Dobavljači |
| `it_software` | IT / Software projekt | 💻 | Faze→Sprintovi · Radnici→Tim · Suradnici→Klijenti / Vendori · Dokumenti→Specifikacije |
| `marketing` | Marketing kampanja | 📣 | Faze→Faze kampanje · Suradnici→Vanjski suradnici · Dokumenti→Materijali |
| `education` | Edukacija / Tečaj | 🎓 | Faze→Moduli / Lekcije · Radnici→Predavači · Članovi→Polaznici · Dokumenti→Materijali |
| `beauty` | Beauty / Wellness studio | 💅 | Faze→Tretmani / Paketi · Radnici→Osoblje · Dokumenti→Cjenik & Protokoli |
| `hospitality_event` | Ugostiteljstvo / Event | 🍽️ | Faze→Faze priprema · Radnici→Osoblje · Suradnici→Dobavljači · Dokumenti→Menu & Ugovori |
| `healthcare` | Zdravstvo / Ordinacija | 🏥 | Faze→Etape projekta · Radnici→Osoblje · Dokumenti→Protokoli |
| `retail_opening` | Trgovina / Otvorenje dućana | 🛒 | Faze→Faze otvaranja · Suradnici→Dobavljači · Dokumenti→Ugovori |
| `manufacturing` | Proizvodnja / Narudžba | 🏭 | Faze→Faze proizvodnje · Suradnici→Dobavljači · Dokumenti→Tehnička dokumentacija |
| `private_event` | Event / Vjenčanje / Slavlje | 🎉 | Faze→Faze planiranja · Suradnici→Dobavljači · Dokumenti→Ugovori & Računi |
| `general` | Općenito | 📁 | (originalni nazivi) |

Tabovi koji se NIKAD ne mijenjaju: Pregled, Timeline, Aktivnost, Dnevnik rada, Financiranje, Transakcije.

## 3. UX flow

```text
[+ Novi projekt]
        │
        ▼
KORAK 1: Odaberi vrstu projekta (obavezno)
  Grid 2 kol. (mobile) / 3 kol. (desktop), 13 kartica
  Naslov: "Za što ćeš koristiti ovaj projekt?"
  Podnaslov: "Odaberi vrstu — prilagodit ćemo nazive faza i tabova."
  [Klik na karticu] → automatski prelazi na Korak 2
        │
        ▼
KORAK 2: Detalji projekta (postojeći ProjectDialog)
  - icon + color predpopulirani iz preseta
  - ProjectTemplatePicker filtrira šablone po preset.templateCategory
  - prva odgovarajuća šablona automatski PRED-ODABRANA (korisnik može promijeniti / očistiti)
  - "← Promijeni vrstu" link u headeru vodi nazad na Korak 1
        │
        ▼
[Spremi] → projects.project_type spremljen, zaključan
```

Edit projekta = preskače Korak 1 (vrsta zaključana). U headeru edit-dijaloga prikazuje se read-only chip vrste npr. "Vrsta: Gradilište" da korisnik vidi kontekst.

## 4. Tehnička arhitektura

### A) `src/lib/projectTypes.ts` — centralni registar
```ts
export type ProjectType =
  | 'general' | 'construction_new' | 'renovation' | 'interior'
  | 'it_software' | 'marketing' | 'education' | 'beauty'
  | 'hospitality_event' | 'healthcare' | 'retail_opening'
  | 'manufacturing' | 'private_event';

export interface ProjectTypePreset {
  id: ProjectType;
  icon: string;
  color: string;
  // i18n keys (ne stringovi!) za tab labele koje se overrideaju
  labelKeys: Partial<Record<
    'milestones' | 'workers' | 'collaborators' | 'documents' | 'members',
    string  // npr. 'projectTypes.construction_new.labels.milestones'
  >>;
  // category iz public.project_templates za auto-filter + auto-select
  templateCategory?: string;
}

export const PROJECT_TYPE_PRESETS: ProjectTypePreset[] = [ … ];
export const getPreset = (id?: string | null): ProjectTypePreset =>
  PROJECT_TYPE_PRESETS.find(p => p.id === id) ?? PROJECT_TYPE_PRESETS[0]; // general
```

### B) DB migracija — minimalna, ali future-proof
```sql
ALTER TABLE public.projects
  ADD COLUMN project_type text NOT NULL DEFAULT 'general',
  ADD COLUMN label_overrides jsonb;  -- REZERVIRANO za buduću "Prilagodbu naziva tabova"; sada NULL

COMMENT ON COLUMN public.projects.project_type IS
  'Locked at creation. Drives default tab labels and template suggestions.';
COMMENT ON COLUMN public.projects.label_overrides IS
  'Optional per-project tab label overrides. Reserved for future UI; currently unused.';
```
Bez RLS izmjena (kolone ne utječu na pristup). Postojeći projekti = `general`.

### C) `useProjectTypeLabels(project)` hook — single source of truth za labele
```ts
export const useProjectTypeLabels = (project?: Pick<Project, 'project_type' | 'label_overrides'> | null) => {
  const { t } = useTranslation();
  const preset = getPreset(project?.project_type);
  const overrides = (project?.label_overrides ?? {}) as Partial<Record<string, string>>;

  const resolve = (key: 'milestones'|'workers'|'collaborators'|'documents'|'members', fallbackKey: string, fallback: string) => {
    // 1. per-project override (future-ready) — uvijek pobjeđuje
    if (overrides[key]) return overrides[key]!;
    // 2. preset i18n key
    const k = preset.labelKeys[key];
    if (k) return t(k, t(fallbackKey, fallback));
    // 3. globalni fallback
    return t(fallbackKey, fallback);
  };

  return {
    milestonesLabel:    resolve('milestones',    'projects.milestones',        'Faze'),
    workersLabel:       resolve('workers',       'projects.workers.tab',       'Radnici'),
    collaboratorsLabel: resolve('collaborators', 'projects.collaborators.tab', 'Suradnici'),
    documentsLabel:     resolve('documents',     'projects.documents.tab',     'Dokumenti'),
    membersLabel:       resolve('members',       'projects.members.tab',       'Članovi'),
  };
};
```
Tri sloja prioriteta = `label_overrides` > preset > globalni i18n. `label_overrides` se danas nikad ne piše, ali hook ga već čita → kad jednog dana dodamo "Prilagodba projekta", samo napišemo `label_overrides` JSONB i sve labele odmah rade.

### D) `ProjectTypePickerStep.tsx` (nova komponenta)
- 13 kartica (icon + naziv + 1-line opis); min 44px target.
- Svaka kartica prevedena: `t('projectTypes.<id>.name')`, `t('projectTypes.<id>.tagline')`.
- Klik = `onSelect(presetId)`.
- Mobile: 2 kol., desktop: 3 kol.

### E) `ProjectDialog.tsx` — wizard 1→2 (samo pri kreiranju)
- Novi state `step: 1 | 2` i `projectType: ProjectType | null`.
- `step === 1` (samo create): render `<ProjectTypePickerStep>`. Edit preskače direktno na step 2.
- Kad korisnik odabere preset → `setProjectType`, `setIcon(preset.icon)`, `setColor(preset.color)`, `setStep(2)`. Auto-pred-odabir prve šablone iz `templates.filter(t => t.category === preset.templateCategory)`.
- Step 2 header: gumb "← Promijeni vrstu" vraća na step 1 (samo create).
- Pri edit-u: read-only chip s nazivom vrste, bez mogućnosti promjene.
- `onSave` proslijeđuje `project_type` u payload.

### F) `ProjectTemplatePicker.tsx` — prima `categoryFilter?`
Dodaje opcionalni prop; ako je zadan, lista templates filtrirana. Auto-pred-odabir radi roditelj (ProjectDialog), ne sama komponenta.

### G) Konzumacija u prikazu projekta
- `ProjectFullScreenView.tsx`: `const labels = useProjectTypeLabels(project);`
  Sve `t('projects.milestones', 'Faze')` etc. zamijeniti s `labels.milestonesLabel` itd. (TabsTrigger labele za milestones, workers, collaborators, documents).
- Isto u `ProjectDetailDialog.tsx`.
- `ProjectMembersTab.tsx` — naslov sekcije "Članovi" koristi `labels.membersLabel`.

### H) i18n — novi namespace `projectTypes` u `hr/en/de.json`
```json
"projectTypes": {
  "step": {
    "title": "Za što ćeš koristiti ovaj projekt?",
    "subtitle": "Odaberi vrstu — prilagodit ćemo nazive faza i tabova.",
    "changeType": "← Promijeni vrstu",
    "lockedBadge": "Vrsta: {{name}}"
  },
  "construction_new": {
    "name": "Gradilište",
    "tagline": "Novogradnja, gradilišta, javni radovi",
    "labels": { "milestones": "Etape gradnje", "collaborators": "Podizvođači", "documents": "Nacrti & Dozvole" }
  },
  "renovation": { "name": "Adaptacija", "tagline": "Renovacija, preuređenje, sanacija", "labels": { … } },
  …
  "general": { "name": "Općenito", "tagline": "Bilo koji projekt", "labels": {} }
}
```

### I) Default-i u DB za `project_templates.category`
Provjera koje vrijednosti `category` već postoje (preko `supabase--read_query` u implementaciji). Mapiranje preset → category radi se u `PROJECT_TYPE_PRESETS`. Ako kategorija ne postoji za neki preset → `templateCategory: undefined` (picker prikaže sve, bez auto-odabira).

## 5. Datoteke

**Nove (4):**
- `src/lib/projectTypes.ts`
- `src/components/projects/ProjectTypePickerStep.tsx`
- `src/hooks/useProjectTypeLabels.ts`
- `supabase/migrations/<ts>_add_project_type_and_label_overrides.sql`

**Izmjenjene (5, sve minimalno):**
- `src/types/project.ts` — dodati `project_type?: ProjectType`, `label_overrides?: Record<string, string> | null`, export `ProjectType`.
- `src/components/projects/ProjectDialog.tsx` — 2-step wizard pri kreiranju, auto-pred-odabir šablone, read-only chip pri editu.
- `src/components/projects/ProjectTemplatePicker.tsx` — opcionalni `categoryFilter` prop.
- `src/components/projects/ProjectFullScreenView.tsx` — labele tabova kroz `useProjectTypeLabels`.
- `src/components/projects/ProjectDetailDialog.tsx` — isto.
- `src/i18n/locales/{hr,en,de}.json` — novi `projectTypes` namespace.

**Memory:**
- Update `mem://features/comprehensive-project-management` — dodati napomenu o `project_type` + 3-slojnom labels resolveru i rezerviranom `label_overrides` polju.

## 6. Što izrijekom NE radimo sada

- Nema UI za "Prilagodba projekta" (per-project label override). Hook ga već čita; UI dolazi kasnije bez DB izmjena.
- Nema migracije postojećih projekata — svi ostaju `general`, originalni labeli, nula vizualnih promjena za stare korisnike.
- Nema novih tabova, komponenti za podatke, RLS-a, edge funkcija.
- Nema mogućnosti mijenjanja `project_type` nakon kreiranja (zaključano kao što si tražio).

## 7. Rizici

Minimalni:
- Backward compatibility: stari projekti = `general` → originalni labeli (nula regresija).
- Preset → templateCategory mapping ovisi o sadržaju `project_templates.category` u DB-u; provjerit ćemo prije implementacije i prilagoditi mapiranje (ako kategorija ne postoji, picker samo ne radi auto-odabir).
- 13 kartica u Koraku 1 dodaje 1 klik kreiranju projekta — kompenzirano time da Korak 2 dolazi s pred-popunjenim icon/color/template.
