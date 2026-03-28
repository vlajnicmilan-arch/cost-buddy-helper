

# Plan: 4 poboljšanja sustava projekata

Implementacija u 4 zasebna dijela: P&L praćenje, ovisnosti faza, upozorenja na rokove, i evidencija promjena budžeta.

---

## 1. P&L praćenje profitabilnosti

Novi tab/sekcija na Overview tabu koja prikazuje Profit & Loss raščlambu.

### Baza
Nema potrebe za novom tablicom — svi podaci već postoje u `expenses` (income/expense), `project_workers` (satnice), i `project_collaborators` (ugovoreni iznosi).

### UI promjene
**`ProjectFullScreenView.tsx`** — na Overview tabu dodati P&L karticu:

```text
┌─────────────────────────────┐
│  📊 Profitabilnost (P&L)    │
├─────────────────────────────┤
│  Prihodi           +15.000  │
│  ├ Uplate klijenata +12.000 │
│  ├ Ostali prihodi    +3.000 │
│                             │
│  Troškovi          -10.500  │
│  ├ Radna snaga      -4.000  │
│  ├ Suradnici        -3.500  │
│  ├ Materijalni      -3.000  │
│                             │
│  ═══════════════════════════│
│  Neto dobit          +4.500 │
│  Marža                  30% │
└─────────────────────────────┘
```

**Novi hook `useProjectProfitLoss.ts`**:
- Dohvaća expense transakcije (income/expense) iz `expenses` tablice za projekt
- Dohvaća ukupne troškove radnika iz `project_work_entries` (sati × satnica)
- Dohvaća `paid_amount` iz `project_collaborators`
- Računa: prihod, troškovi rada, troškovi suradnika, materijalni troškovi, neto dobit, maržu

**Novi komponent `ProjectProfitLossCard.tsx`** — prikazuje raščlambu kao na dijagramu gore.

### Zahvaćene datoteke
| Datoteka | Promjena |
|---|---|
| `src/hooks/useProjectProfitLoss.ts` | Novi hook |
| `src/components/projects/ProjectProfitLossCard.tsx` | Novi komponent |
| `src/components/projects/ProjectFullScreenView.tsx` | Dodati P&L karticu na Overview tab |
| `src/components/projects/ProjectDetailDialog.tsx` | Isto (ako ima Overview) |

---

## 2. Ovisnosti između faza (Milestone Dependencies)

Svaka faza može imati `depends_on_milestone_id` — ne može prijeći u `in_progress` dok prethodna nije `completed`.

### Baza — nova migracija
```sql
ALTER TABLE public.project_milestones 
  ADD COLUMN depends_on_milestone_id UUID 
  REFERENCES public.project_milestones(id) ON DELETE SET NULL;
```

### UI promjene
**`ProjectMilestonesTab.tsx`** — u dijalogu za dodavanje/uređivanje faze:
- Novi dropdown "Ovisi o fazi" s popisom ostalih faza u projektu
- Ako odabrana faza ima ovisnost čija prethodna faza nije completed, prikazati upozorenje i spriječiti promjenu statusa na `in_progress`
- Vizualni indikator ovisnosti (🔗 ikona + naziv parent faze) na kartici faze

**`ProjectTimelineTab.tsx`** — prikazati strelice/linije ovisnosti na Gantt prikazu

### Zahvaćene datoteke
| Datoteka | Promjena |
|---|---|
| Nova migracija | `depends_on_milestone_id` kolona |
| `src/hooks/useProjectMilestones.ts` | Čitanje/pisanje novog polja |
| `src/components/projects/ProjectMilestonesTab.tsx` | Dropdown + validacija |
| `src/components/projects/ProjectTimelineTab.tsx` | Vizualizacija ovisnosti |
| `src/types/project.ts` | `depends_on_milestone_id` u `ProjectMilestone` |

---

## 3. Upozorenja na rokove faza

Automatske obavijesti X dana prije isteka roka faze.

### Baza — nova migracija
```sql
ALTER TABLE public.project_milestones 
  ADD COLUMN reminder_days_before INTEGER DEFAULT 3;
```

### Edge funkcija: `check-milestone-deadlines`
- Pokreće se CRON-om (npr. jednom dnevno)
- Za svaku fazu s `due_date` i statusom != `completed`:
  - Ako `due_date - reminder_days_before <= today` i nije već poslana obavijest:
    - Insertaj u `notifications` tablicu za vlasnika projekta i managere
- Koristi `project_members` za dohvat korisnika s `role = 'manager'`

### UI
- Na `ProjectMilestonesTab.tsx` u dijalogu za fazu: polje "Podsjeti me X dana prije" (default 3)
- `NotificationsDropdown.tsx` — već podržava prikaz notifikacija, samo treba novi `type`

### Zahvaćene datoteke
| Datoteka | Promjena |
|---|---|
| Nova migracija | `reminder_days_before` kolona |
| `supabase/functions/check-milestone-deadlines/index.ts` | Nova edge funkcija |
| `src/hooks/useProjectMilestones.ts` | Čitanje/pisanje novog polja |
| `src/components/projects/ProjectMilestonesTab.tsx` | Input za dane podsjetnika |
| `src/types/project.ts` | Dodati polje u tip |

---

## 4. Evidencija promjena budžeta (Budget Revision Log)

Log svake promjene ukupnog budžeta projekta s razlogom i datumom.

### Baza — nova tablica
```sql
CREATE TABLE public.project_budget_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  previous_amount NUMERIC NOT NULL,
  new_amount NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_budget_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view revisions"
ON public.project_budget_revisions FOR SELECT TO authenticated
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project owners can create revisions"
ON public.project_budget_revisions FOR INSERT TO authenticated
WITH CHECK (is_project_owner(project_id, auth.uid()));
```

### UI promjene
**`useProjects.ts`** — `updateProject`: kad se `total_budget` promijeni, automatski insertati zapis u `project_budget_revisions` s razlogom (opcionalni prompt)

**Novi komponent `ProjectBudgetHistoryDialog.tsx`**:
- Lista promjena budžeta s datumima, prethodnim/novim iznosom, razlogom, i tko je promijenio
- Otvara se klikom na ikonu 📋 uz budžet u headeru ili Overview tabu

**`ProjectFullScreenView.tsx`** — dodati gumb za otvaranje povijesti budžeta

### Zahvaćene datoteke
| Datoteka | Promjena |
|---|---|
| Nova migracija | `project_budget_revisions` tablica + RLS |
| `src/hooks/useProjects.ts` | Insert u revisions pri promjeni budžeta |
| `src/components/projects/ProjectBudgetHistoryDialog.tsx` | Novi komponent |
| `src/components/projects/ProjectFullScreenView.tsx` | Gumb za povijest |
| `src/components/projects/ProjectDetailDialog.tsx` | Isto |

---

## Redoslijed implementacije

1. **Evidencija promjena budžeta** — najjednostavnija, nova tablica + dijalog
2. **Ovisnosti između faza** — jedna nova kolona + UI validacija
3. **P&L praćenje** — novi hook koji agregira postojeće podatke + komponent
4. **Upozorenja na rokove** — edge funkcija + CRON + kolona

Ukupno: 2 migracije, 1 nova edge funkcija, 3 nova komponenta, 2 nova hooka, i izmjene u ~8 postojećih datoteka.

