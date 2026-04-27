
## 🛡️ Sigurnosna analiza prije promjena

Prije plana, evo što sam provjerio i potvrdio:

### Što je sigurno za promjenu
| Komponenta | Trenutno stanje | Rizik promjene |
|---|---|---|
| `BottomNav.tsx` | Renderira se na 8 stranica (Index, Wallet, Family, Dashboard, **Projects**, Calendar, Business, Budgets) | **Nizak** — Projekti već imaju rutu `/projects` i lazy-load u App.tsx |
| `QuickLinksSection.tsx` | Prikazuje "Quick link to Projects" karticu (linija 58-78) | Ostaje netaknuta — samo dupliranje funkcionalnosti |
| `useProjects` hook | Već se koristi u `Index.tsx` (linija 136) za AI asistenta | **Nula** — koristim postojeće podatke, nema novih queryja |
| i18n `nav.*` ključevi | Postoje: `home, dashboard, projects, budgets, wallet, family, viewAll` | **Nula** — koristim postojeće, dodajem 1-2 nova |
| `useFeatureAccess('projects')` | Pro feature | Već je implementirano u `Projects.tsx` |

### Što ostaje 100% netaknuto
- ✅ Logika rute `/projects` i sve podstranice projekata
- ✅ `BusinessBottomNav` (poslovni mod ima vlastiti nav — ne dira se)
- ✅ Postojeći "Quick link to Projects" u `QuickLinksSection` (zadržan kao redundantan put)
- ✅ Sve ostale stranice koje koriste `BottomNav` — samo se mijenja **redoslijed i sadržaj** istog komponenta
- ✅ Auth flow, onboarding, business mode, family mode — ništa od toga ne dira nav strukturu
- ✅ TanStack Query, RLS, Supabase — nula promjena
- ✅ Testovi (`src/test/*`) — ne testiraju nav strukturu

### Rizik za "silent userе" poput Helene
Helena je bila na `/home` i `/projects` u svojoj 45s sesiji. Pomicanje **Projekata u 2. poziciju** će joj sljedeći put **odmah** privući pažnju na primarni use-case.

---

## 📋 Plan promjena (Faza 1)

### Promjena #1: `src/components/BottomNav.tsx` — reposicioniranje stavki
**Trenutni redoslijed:** Pregled → Kalendar → Budžeti → Novčanik → (Obitelj)
**Novi redoslijed:** Pregled → **Projekti** → Novčanik → Budžeti → (Obitelj)

Detalji:
- Dodaje se `FolderKanban` ikona (već uvezena u `QuickLinksSection`) na 2. poziciju
- **Kalendar se uklanja iz primarnog nava** (i dalje dostupan iz Home Quick linkova i deep-linkova; ako želiš zadržati, mogu ga premjestiti u "More" pattern, ali za 5 stavki nema mjesta)
- **Family** ostaje conditional (samo kad je `familyModeEnabled` i nije business)
- Animacija `layoutId="bottomNavIndicator"` ostaje ista
- Touch target ostaje 44px+
- Fallback labele za HR ostaju

**Defenzivna mjera:** Ako korisnik nije Pro, klik na Projekte vodi na `/projects` koji već prikazuje `UpgradePrompt`. Nema crash rizika.

### Promjena #2: Nova komponenta `src/components/home/ActiveProjectsStrip.tsx`
Nova horizontalno scrollajuća traka aktivnih projekata, **dodaje se IZNAD `SummarySection` u `PersonalModeView`**:

```
┌───────────────────────────────────────────────┐
│ 🚧 Aktivni projekti              Pogledaj sve│
│ ┌────────┐ ┌────────┐ ┌────────┐  ┌────────┐│
│ │ 🏗️    │ │ 📊    │ │ 💼    │  │   +    ││
│ │ Reno   │ │ Q4     │ │ Klijen │  │  Novi  ││
│ │ ████░  │ │ ██░░░  │ │ ████   │  │projekt ││
│ │ 67%    │ │ 23%    │ │ 89%    │  │        ││
│ └────────┘ └────────┘ └────────┘  └────────┘│
└───────────────────────────────────────────────┘
```

**Ponašanje:**
- **Sakriva se ako:**
  - `simpleModeEnabled === true` (poštujemo simple mode)
  - `isLocalMode === true` (lokalni korisnici nemaju projekte u cloudu)
  - `isBusinessMode === true` (Business mod ima vlastiti dashboard)
  - Korisnik nema pristup značajci (`!hasAccess('projects')`)
- **Empty state (0 projekata):** Prikazuje **samo "+ Kreiraj prvi projekt"** veliku karticu kao CTA — ovo je ključno za aktivaciju Helene
- **S projektima (1-N):**
  - Prikazuje do 5 najnovijih `status === 'active'` projekata
  - Kartica: ikona + naziv + progress bar (`spent / total_budget`) + postotak
  - Klik na karticu → `navigate('/projects')` (kasnije možemo otvoriti detail dialog)
  - Zadnja kartica je uvijek "+ Novi projekt"
- Koristi **postojeći `useProjects()` hook** (već se zove u `Index.tsx`, nema dodatnog queryja)
- Boje preuzima iz `project.color` ili `DEFAULT_PROJECT_COLORS`
- Skeleton dok `loading === true`

**Tehnički detalji:**
- Komponenta prima `projects: ProjectWithOwnership[]` i `allExpenses: Expense[]` kao props
- Izračun `spent` lokalno: `allExpenses.filter(e => e.project_id === p.id && e.type === 'expense' && e.status === 'approved').reduce(...)` — identična logika kao u `projectsForAssistant` (linija 230-238 Indexa)
- Horizontalni scroll: `overflow-x-auto` + `snap-x snap-mandatory`
- Kartica: `min-w-[140px]` da stane ~2.5 kartice na 384px viewport

### Promjena #3: `src/components/home/PersonalModeView.tsx` — dodavanje strip-a
- Doda se `<ActiveProjectsStrip projects={projects} allExpenses={allExpenses} />` između `<PaymentSourcesSection>` i `<SummarySection>` (linija ~209)
- Doda se nova prop `projects` i `allExpenses` u `PersonalModeViewProps` (već se prosljeđuju za AI asistenta — samo ih reusam)
- Update `Index.tsx` da prosljeđuje `projects` i `allExpenses` u `<PersonalModeView>`

### Promjena #4: `src/i18n/locales/hr.json`, `en.json`, `de.json`
Dodaju se 4 nova ključa unutar postojećeg `nav` bloka (već postoji na 3 mjesta — Personal, Local, Business):

```json
"nav": {
  ...
  "activeProjects": "Aktivni projekti",   // EN: "Active projects", DE: "Aktive Projekte"
  "createFirstProject": "Kreiraj prvi projekt",  // EN: "Create first project", DE: "Erstes Projekt erstellen"
  "newProject": "Novi projekt",            // EN: "New project", DE: "Neues Projekt"
  "projectProgress": "{{percent}}% iskorišteno"  // EN: "{{percent}}% used", DE: "{{percent}}% verwendet"
}
```

---

## ✅ Zero-impact garancije

1. **Backward compatible:** Stari "Quick link to Projects" u `QuickLinksSection` ostaje — korisnici koji su navikli klikati tamo i dalje će raditi.
2. **Conditional rendering:** Strip se sakriva u svim "rubnim" modovima (simple, local, business, no-access).
3. **No new queries:** `useProjects()` se već zove — samo prosljeđujemo postojeće podatke nadolje.
4. **No DB / RLS / migration changes:** Čista UI promjena.
5. **No type changes:** `ProjectWithOwnership` i `Expense` se koriste kako jesu.
6. **i18n strict:** Sva nova polja s fallback stringovima da se ne razbije ako neki prijevod nedostaje.
7. **Mobile-first 384px:** Strip dizajniran da radi na minimalnom viewportu (`min-w-[140px]` × 2.5 kartice = ~350px).
8. **Performance:** `React.memo` na `ActiveProjectsStrip` da se ne re-renderira bez potrebe.
9. **Tutorial overlay:** Ne dira se — postojeći `data-tutorial` selektori ostaju.
10. **Tests:** Postojeći `src/test/*` ne testiraju nav redoslijed → 0 failed testova.

---

## 📁 Lista datoteka koje se mijenjaju

| Datoteka | Tip promjene |
|---|---|
| `src/components/BottomNav.tsx` | Reorder + dodavanje FolderKanban |
| `src/components/home/ActiveProjectsStrip.tsx` | **NOVO** |
| `src/components/home/PersonalModeView.tsx` | Dodavanje stripa + 2 nove props |
| `src/pages/Index.tsx` | Prosljeđivanje `projects` i `allExpenses` propa |
| `src/i18n/locales/hr.json` | 4 nova ključa u `nav` bloku |
| `src/i18n/locales/en.json` | 4 nova ključa u `nav` bloku |
| `src/i18n/locales/de.json` | 4 nova ključa u `nav` bloku |

**Ukupno: 1 nova komponenta, 6 modifikacija (sve aditivne).**

---

## 🚫 Što NIJE u Fazi 1 (za kasnije)

- Onboarding wizard za prvi projekt (Faza 2)
- FAB centralni gumb u BottomNav (zahtijeva više rasprave o UX-u)
- Activation funnel u Pulse adminu (Faza 2)
- Color-coding transakcija prema projektima (Faza 3)
- Day 1/3/7 push nudges (Faza 3)

---

**Pitanje prije pokretanja:** Želiš li da Kalendar:
- **(a)** Bude potpuno uklonjen iz BottomNava (dostupan samo iz Quick linkova/deep-linka), ILI
- **(b)** Zadržan na 5. poziciji, a Family se sakriva u "More" meni (dodatni rad)

Default preporuka: **(a)** — Kalendar je sekundarna funkcija prema podacima (nizak engagement). Ako se slažeš, krećem implementaciju odmah po odobrenju.
