
Korisnik traži stručnu analizu (audit) Poslovnog moda → Projekti dijela aplikacije. Ne traži implementaciju — traži izvješće. Ovo je **research zadatak**, pa formalno ne trebam plan, ali korisnik želi strukturirano izvješće. Pokupit ću sve relevantne fajlove, pogledat preview, i napisati stručnu analizu.

**Što ću istražiti:**

1. **Vizualni screenshot Projekti taba u poslovnom modu** — korisnikov stvarni preview
2. **Komponente:**
   - `ProjectsPanel.tsx` — glavni ulaz
   - `ProjectCard.tsx` — kartica projekta
   - `ProjectDetailDialog.tsx`, `ProjectFullScreenView.tsx` — detalji
   - `ProjectDialog.tsx` — kreiranje/uređivanje
   - Tabovi: `ProjectMilestonesTab`, `ProjectFundingTab`, `ProjectMembersTab`, `ProjectCollaboratorsTab`, `ProjectWorkersTab`, `ProjectTimelineTab`, `ProjectTransactionsTab`
   - `ProjectProfitLossCard`, `WorkCalendarOverview`, `WeeklyWorkEntryForm`
3. **Hooks:**
   - `useProjects`, `useProjectStats`, `useProjectProfitLoss`, `useProjectMilestones`, `useProjectFunding`, `useProjectMembers`, `useProjectWorkers`, `useProjectMemberPermissions`, `useProjectCollaborators`, `useProjectWorkEntries`, `useProjectPendingTransactions`
4. **Tipovi:** `src/types/project.ts`, `projectCollaborator.ts`, `projectWorker.ts`
5. **Integracija s Business modom:** `src/pages/Business.tsx`, `BusinessBottomNav.tsx`
6. **i18n pokrivenost** za projekte
7. **Memorija:** `comprehensive-project-management`, `dual-level-project-system`, `project-member-permissions`, `project-budget-calculation-v2`

**Analiza će pokriti (kao stručnjak za project management software / fintech):**

- **A. Funkcionalna pokrivenost:** Što ima, što nedostaje u odnosu na industrijske standarde (PM tools: Asana, Monday, Jira, ProjectManager, BuildBook za građevinu)
- **B. Vizualni dizajn:** UX/UI ocjena — kartice, tipografija, hijerarhija, stanja (loading/empty/error), responsive (384px)
- **C. Information architecture:** Navigacija između tabova, dubina dijaloga (z-index slojeva), discoverability
- **D. Domena-specifično (građevina/usluge):** P&L, milestones, financiranje, radnici/šihterica, troškovi po fazi
- **E. Suradnja:** Članovi, dozvole, kolaboratori — clarity između tih koncepta
- **F. Performance/skalabilnost:** Što se dogodi s 50+ projekata, 100+ transakcija po projektu
- **G. Praznine & bugs (potential):** Što sam primijetio iz koda
- **H. Konkretne preporuke prioritetizirane (must-have / should-have / nice-to-have)**

**Plan rada (read-only):**
1. `browser--navigate_to_sandbox` na `/business` ili Projekti tab + `screenshot` (više pogleda: lista, detalj, prazno stanje)
2. Pročitati ključne komponente i hookove (parallelno)
3. Pročitati relevantne memorije
4. Sastaviti izvješće u markdownu, prioritizirano, s konkretnim primjerima iz koda

Izvješće bit će strukturirano (~800-1200 riječi), bez fluff-a, na hrvatskom (kako korisnik komunicira), bez tehničkog žargona za nalaze (po user preferenci), ali s konkretnim referencama na komponente kad treba.

**Output format:** Markdown izvješće u chat odgovoru — NE dirati nikakav kod. Završit ću s pitanjem što od preporučenog implementirati.
