
## Audit poslovnog modula V&M Balance — multidisciplinarna analiza

**Fokus:** vođenje projekata jednostavno i kvalitetno. **Izvan opsega:** knjigovodstvo, fakturiranje, porezni obračuni.

---

### 1. Product Manager — strateška razina

**Snage:**
- Jasna izolacija po `business_profile_id` (Multi-company support)
- 3-razinska monetizacija (Free / Pro / Business 9,99 €/mj) s gating-om kroz `useFeatureAccess`
- Modularna struktura (`enabled_modules` po profilu) — moguće isključivanje nepotrebnih modula

**Slabosti:**
- **Nedostatak "Kanban / Stanje projekta na prvi pogled"** — voditelj projekta nema dashboard koji pokazuje "koji projekti su u kašnjenju, koji troše više od planiranog, koji čekaju moju odluku"
- **BusinessDashboard prikazuje agregirane brojke za sve projekte zajedno** — nema prikaza po projektima
- "Ponude i predračuni" su skriveni u Više → previše klikova
- Nema onboardinga specifičnog za poslovne korisnike (5-koračni walkthrough za prvog projekt)

**Preporuke:**
1. Dodati **"Status board"** karticu na BusinessDashboard: aktivni projekti grupirani po statusu (U kašnjenju / Na vrijeme / Završeni ovaj mjesec)
2. **Kanban view** kao opcija prikaza projekata uz listu
3. Pomaknuti Estimates iz "Više" u **glavnu navigaciju** (BusinessBottomNav: Dashboard / Projekti / Ponude / Više)

---

### 2. UX Designer — tijek rada

**Bolne točke:**
- **Predubok hijerarhijski tijek** za dodavanje rashoda na projekt: Dashboard → Transakcije → +Novo → odabir projekta → odabir milestone-a (5 koraka)
- Tabovi Posao/Ljudi/Novac dobri, ali **sub-tabovi nemaju vizualni indikator broja stavki** (npr. "Faze (3)", "Radnici (5)")
- Nema **brze akcije "Dodaj fotku računa za projekt X"** s home ekrana — najčešća akcija obrtnika
- ProjectCard pokazuje "Potrošeno" ali ne i **"Ostalo dana do roka"** vizualno (nema timeline indikatora)
- Tooltipovi za Tim/Radnici/Suradnici su dodani, ali **ikona (?) je premala** na mobilnom

**Preporuke:**
1. **FAB "Brzi dodatak"** u poslovnom modu: jedan klik → kamera → AI prepozna → predloži projekt na temelju kontakta/iznosa
2. Badge brojevi na sub-tabovima
3. Mini progress bar dana do roka u ProjectCard
4. Voice memo za bilješke uz projekt

---

### 3. Frontend developer — tehnička higijena

**Pronađeni problemi:**
- `BusinessProjects.tsx:91` — `useCallback` ovisi o `businessProjects.map(p => p.id).join(',')` — ovo se izračunava na svaki render i može uzrokovati ponovne dohvate. Treba `useMemo` za projectIds.
- `BusinessDashboard.tsx` ne koristi `useProjectStats` — duplicira logiku računanja prihoda/rashoda
- `BusinessMore.tsx:33` — `ProjectEstimatesPanel` nije lazy-loaded (težak, sadrži forme)
- `BusinessReports.tsx` koristi `jsPDF` direktno umjesto centralizirano `fileExport.ts`
- Nedostaje **Error Boundary** oko BusinessProjects/Estimates

**Preporuke:**
1. Refaktorirati `BusinessDashboard` da povuče statistike po projektu i prikaže "Top 3 projekta po profitu / gubitku"
2. Lazy-load Estimates panel
3. Memoizirati projectIds

---

### 4. Backend / Supabase developer

**Snage:** RLS politike su konzistentne (`is_project_member`, `business_profile_id` izolacija)

**Slabosti:**
- `expenses` tablica nema indeks na `(business_profile_id, project_id, date)` — sporo na velikim datasetima
- `project_documents.storage_mode` `text check in ('local','cloud')` — bolje koristiti Postgres ENUM
- Nema arhiviranja završenih projekata (svi se uvijek dohvaćaju)
- `project_estimates.items jsonb` nema schema validation — može razbiti UI ako se pokvari

**Preporuke:**
1. Dodati composite indeks `expenses(business_profile_id, project_id, date)`
2. Dodati `archived_at` kolonu na `projects` + filter u UI
3. Validacijski trigger na `project_estimates.items` (Zod-style preko PL/pgSQL)

---

### 5. AI / ML inženjer

**Trenutno stanje:** `analyze-document` (Gemini Flash) postoji i vraća `{merchant, date, amount, vat, category, summary}`

**Nedostaci za vođenje projekata:**
- AI **ne predlaže koji projekt** dodijeliti dokumentu (kontekst je na tablici)
- Nema **"Pametni asistent projekta"** — npr. "Bok, prošli mjesec si na ovaj projekt potrošio 30% više nego što je planirano u fazi 'Materijal'"
- `categorize-transaction` ne uči iz povijesnog konteksta projekta

**Preporuke:**
1. Proširiti `analyze-document` da prima `project_context` (naziv, faze, dosadašnji troškovi) i predloži milestone
2. Novi edge function: **`project-insights`** — tjedna sažetak po projektu (Gemini Flash Lite, ~1¢/projekt/tjedno)
3. Auto-grupiranje sličnih dokumenata u "računi za isti materijal" prijedlog

---

### 6. Construction domain expert

**Što fali za realnog obrtnika/građevinara:**
- **Nema "Materijala vs. Rad" segmentacije** rashoda na projektu — ključno za kalkulaciju marže
- Šabloni postoje ali **nemaju standardne stavke materijala** (npr. "Renovacija kupaonice" = pločice, sanitarija, vodoinstalacije)
- Radnici su odvojeni od milestones — **trebao bi rapidan unos "danas su X,Y,Z radili na fazi 'Žbukanje' 8h"**
- Nema **"Foto napretka radova"** s automatskim datumom uz milestone
- Nema **kontakta podizvođača** vezanog na projekt (samo plaćanja)

**Preporuke:**
1. Tag rashoda: `expense.work_type` enum ('material', 'labor', 'equipment', 'permit', 'other')
2. Nadograditi šablone s preporučenim materijalom
3. Dodati "Foto napretka" tab uz Dokumente — kronološka galerija s lokacijom (već postoji `useLocation`)
4. **Quick day report:** "Što je danas rađeno?" bottom sheet → glasovni unos → AI strukturira

---

### 7. QA Engineer

**Rizična područja:**
- Brisanje projekta s aktivnim podizvođačima i dokumentima — što se događa s lokalnim fileovima?
- Promjena `business_profile_id` projekta — preselivanje rashoda
- Offline način + dodavanje rashoda na projekt — sync queue
- 384px viewport: tab grupe Posao/Ljudi/Novac OK, ali sub-tabovi mogu biti odsječeni

**Test prioriteti:**
1. E2E: kreiraj projekt iz šablone → dodaj 2 milestonea → upload 3 računa lokalno → AI analiza → dodaj rashod → izvezi PDF
2. RLS: član projekta vidi dokumente, ne-član ne vidi
3. Lokalni dokumenti perzistiraju nakon restart aplikacije (Capacitor Filesystem)

---

### 8. Specifične preporuke za "vođenje projekata", ne knjigovodstvo

**A. Zadrži (ne diraj):**
- ✅ Project tabs Posao/Ljudi/Novac
- ✅ Milestones s dependencijama i bojama
- ✅ Dokumenti lokalno-prvi
- ✅ Šihterica (zakonska obveza za poslovni mod)

**B. Pojačaj (lakše vođenje):**
- 🔼 **Project Health Score** — automatski izračun (budžet × vrijeme × stanje milestones) → boja: zelena/žuta/crvena
- 🔼 **Daily Standup** — bottom sheet "Što je danas urađeno na projektima?"
- 🔼 **Foto dnevnik napretka** s GPS lokacijom (per-milestone)
- 🔼 **Kontakti suradnika** (telefon, email, specijalnost) vezani uz projekt
- 🔼 **Kanban view** za milestones (ne samo Gantt)
- 🔼 **Predefinirane checkliste** po fazi (npr. "Žbukanje: pripremiti zid → nanijeti → osušiti")

**C. Ukloni / Pojednostavi:**
- ⛔ Detaljni Reports (BusinessReports) može ostati ali sa sažetijim default prikazom
- ⛔ "Dugovanja i potraživanja" je previše knjigovodstveno — preimenovati u "Otvoreni računi" i pojednostaviti
- ⛔ Estimates trenutno generiraju PDF s PDV-om — to klizi u fakturiranje. **Reduciranje na "Ponuda klijentu"** bez fiskalizacije, samo kao komunikacijski alat

**D. Novo:**
- ➕ **Tab "Aktivnost projekta"** — kronološki feed (dokument dodan, milestone završen, rashod, fotka)
- ➕ **Push obavijesti** "Faza X kasni 3 dana" (proširiti `check-milestone-deadlines`)
- ➕ **Brzi unos rada** za radnike: "Marko radio 8h danas na fazi Žbukanje" → 3 tap-a
- ➕ **Klijentski view (read-only link)** — pošalji klijentu link da vidi napredak (bez pristupa podacima)

---

### Prioritetna mapa (next steps)

```text
P1 — Kritično (1 sprint)
  • Quick FAB za dodavanje rashoda/fotke računa na projekt
  • Project Health Score na ProjectCard
  • Memoizacija projectIds + composite DB indeks
  • Foto dnevnik tab uz Dokumente

P2 — Visoka vrijednost (2 sprinta)
  • Daily Standup bottom sheet s glasovnim unosom
  • Kanban view za milestones
  • Predefinirane checkliste po fazi
  • AI predlaže projekt za skenirani dokument

P3 — Strateški (3+ sprinta)
  • Klijentski read-only link
  • Project Insights (tjedni AI sažetak)
  • Material vs Labor segmentacija + marže
  • Arhiviranje završenih projekata
```

### Zaključak

Aplikacija ima **solidnu tehničku osnovu i bogat skup značajki**, ali korisniku-obrtniku nedostaju **brzi tijekovi za svakodnevno vođenje** (jedan tap = nova fotka računa na projekt, glasovni unos rada). Trenutni dizajn je dobar za "preglednika", a treba postati alat za "izvođača". Smjer kojeg si naveo (vođenje projekata, ne knjigovodstvo) podržava odluku da se **Estimates i Debts pojednostave**, a fokus prebaci na **dnevni operativni tok**.
