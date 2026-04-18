
Korisnik je odgovorio na oba pitanja. Sad imam sve što trebam za pun plan implementacije svih 8 točaka iz audita + lokalna pohrana dokumenata.

**Odluke korisnika:**
- AI rezultati analize → spremaju se u bazu (mali metapodaci)
- Default upload dokumenata → lokalno (s opcijom prebacivanja u oblak)

## Kompletan plan — svih 8 izmjena Projekti modula

### FAZA 1 — Konzistentnost i performanse (kritično)

**1. Ujedinjena formula "Potrošeno"**
- Novi file: `src/lib/projectCalculations.ts`
- Funkcije: `calculateProjectSpent()`, `calculateProjectIncome()`, `calculateProjectBalance()`, `calculateProjectProgress()`
- Sve filtriraju `type === 'expense'`, isključuju transfere i correction transakcije
- Refaktor u 3 datoteke: `ProjectsPanel.tsx`, `ProjectFullScreenView.tsx`, `BusinessProjects.tsx` — svi koriste iste funkcije

**2. Ubrzanje liste projekata (100 → 1 query)**
- Refaktor `fetchAllStats` u `ProjectsPanel.tsx`
- Trenutno: petlja `for (project of projects) { fetchStats(project.id) }`
- Novo: 1 batch query `expenses WHERE project_id IN (id1, id2, ...)`, grupiranje u memoriji po `project_id`

**3. Brisanje mrtvog koda**
- Verificirati da `ProjectDetailDialog.tsx` nigdje nije importan
- Obrisati ga

### FAZA 2 — UI reorganizacija

**4. 9 tabova → 3 grupe**
- Modificirati `ProjectFullScreenView.tsx`
- Top tabovi: **Posao** | **Ljudi** | **Novac**
- Sub-tabovi (manji, secondary stil):
  - Posao: Pregled, Faze, Timeline, **Dokumenti** (novo)
  - Ljudi: Tim, Radnici, Suradnici
  - Novac: Financiranje, Transakcije
- Mobile: scrollable sub-tabs

**5. Tooltips za nejasne pojmove**
- Ikona (?) pored "Tim", "Radnici", "Suradnici"
- HR: "Drugi korisnici aplikacije s pristupom" / "Tvoji zaposlenici (vodiš ih ti)" / "Vanjski podizvođači"
- EN/DE prijevodi

### FAZA 3 — Nove funkcionalnosti

**6. Šabloni projekata**
- Migracija: tablica `project_templates` (id, name, description, icon, category, default_milestones jsonb, is_public bool)
- Seed 5 šablona: Renovacija kuhinje, Renovacija kupaonice, Izgradnja krovišta, Adaptacija stana, Generalno
- U `ProjectDialog`: izbor "Iz šablone" prije ručnog unosa
- Pri kreiranju iz šablone → automatski generira milestones

**7. Dokumenti — lokalno-prvi hibrid**
- Migracija: tablica `project_documents` (id, project_id, name, mime_type, size_bytes, storage_mode `text check in ('local','cloud')`, storage_path, ai_analysis jsonb, tags text[], uploaded_by, created_at)
- RLS: članovi projekta čitaju/pišu (preko `is_project_member`)
- Storage bucket `project-documents` (privatni, samo za cloud upload)
- Hook: `useProjectDocuments.ts`
- Library: `src/lib/documentStorage.ts` — ujedinjeni API `saveDocument(file, mode)`, `readDocument(doc)`, `migrateToCloud(doc)`, `migrateToLocal(doc)`
- Komponenta: `ProjectDocumentsTab.tsx` — lista, upload (default lokalno), preview, AI analiza gumb, toggle 📱/☁️
- Edge function: `analyze-document` (prima base64 ili URL → Gemini Flash → vraća `{merchant, date, amount, vat, category, summary}`) → rezultat se sprema u `project_documents.ai_analysis`
- Re-koristi postojeći `useLocalFileCache.ts` za nativni dio
- Web fallback: IndexedDB ili localStorage

**8. Ponude / Predračuni**
- Migracija: tablica `project_estimates` (id, business_profile_id, client_name, client_oib, client_address, items jsonb, subtotal, vat_amount, total_amount, status `text check in ('draft','sent','accepted','rejected')`, valid_until, accepted_project_id nullable, created_at)
- RLS: vlasnik business_profile čita/piše
- Hook: `useProjectEstimates.ts`
- Komponenta: `ProjectEstimatesPanel.tsx` (lista) + `EstimateDialog.tsx` (linije: opis, kol, jed.cijena, ukupno → auto PDV 25%)
- Gumb "Pretvori u projekt" kad status = accepted → kreira novi projekt s `total_budget = estimate.total_amount`
- PDF export preko postojećeg `fileExport.ts`
- Smjestiti u Business → Više (BusinessMore)

### FAZA 4 — Polish

**i18n** — Svi novi ključevi u HR/EN/DE:
- `projects.tabs.work`, `projects.tabs.people`, `projects.tabs.money`
- `projects.tooltips.team`, `projects.tooltips.workers`, `projects.tooltips.collaborators`
- `projects.documents.*` (upload, local, cloud, analyze, etc.)
- `projects.templates.*`
- `estimates.*` (nova sekcija)

**QA**:
- Test 384px viewport (sub-tabs scrollable)
- Test feature gating (Business tier preko `useFeatureAccess`)
- Test RLS (member vs non-member može li vidjeti dokumente)

### Što NEĆU dirati
- `useProjectStats` API (samo internu logiku)
- RLS na `expenses`
- Postojeće dozvole članova projekata
- `ScannedDataPreview`, `useReceiptScanner`

### Migracije (3 nove)
1. `project_templates` + seed
2. `project_documents` + storage bucket `project-documents` + RLS
3. `project_estimates` + RLS

### Nove edge funkcije (1)
- `analyze-document` (Gemini Flash, vraća strukturirani JSON)

### Procjena opsega
~20 novih/izmijenjenih datoteka, 3 migracije, 1 storage bucket, 1 edge funkcija. Velik zahvat, ali sve u jednom prolazu.
