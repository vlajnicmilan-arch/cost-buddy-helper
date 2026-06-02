
# Faza 1 — Modularni UI split (implementacija)

Sve odluke su zaključane od strane korisnika. Plan se striktno drži scope-a; ništa izvan §1-§10 se ne dira.

---

## 1. `src/lib/moduleVisibility.ts` (novi)

Pure helper, bez React imports.

```ts
export type AppModule = 'core' | 'family' | 'projects' | 'business';
export type ModuleVisibility = 'visible' | 'hidden' | 'locked';
export type SettingsCardState = 'active' | 'inactive' | 'locked';

export interface ModuleState {
  enabled: boolean;        // user-controlled flag (Core = uvijek true)
  tierUnlocked: boolean;   // hasAccess() rezultat
}

export function isModuleActive(m: AppModule, s: ModuleState): boolean;
// core -> true; ostali -> enabled && tierUnlocked

export function getNavVisibility(m: AppModule, s: ModuleState): ModuleVisibility;
// core -> 'visible'; ostali: !enabled -> 'hidden'; inače 'visible'
// (tier gate nije briga nav helpera)

export function getSettingsCardState(m: AppModule, s: ModuleState): SettingsCardState;
// core -> 'active'
// !tierUnlocked -> 'locked'
// enabled -> 'active'; else 'inactive'
```

## 2. `src/hooks/useModuleStates.ts` (novi)

Spaja `useAppState()` + `useFeatureAccess()`. Vraća `Record<AppModule, ModuleState>`.

- `core`: `{ enabled: true, tierUnlocked: true }`
- `family`: `{ enabled: familyModeEnabled, tierUnlocked: hasAccess('family_groups') }`
- `projects`: `{ enabled: projectsModuleEnabled, tierUnlocked: hasAccess('projects') }`
- `business`: `{ enabled: businessFeatureEnabled, tierUnlocked: hasAccess('business_module') }`

## 3. `src/contexts/AppStateContext.tsx` (izmjene)

- `familyModeEnabled` initial state:
  - Ako `localStorage` ima `family_mode_enabled` ključ → poštuj
  - Inače → `false` (default je sada OFF za nove)
- Auto-on za postojeće s family membership signalom:
  - Unutar `resolveOnboarding()` `useEffect`-a, nakon što imamo `session.user`, ako `localStorage` NEMA `family_mode_enabled` ključ (nikad eksplicitno set), upitaj `SELECT id FROM family_members WHERE user_id = ... LIMIT 1`. Ako postoji → `setFamilyModeEnabledState(true)` + persistiraj `'true'` u localStorage. Ako ne → ostavi `false`.
  - Bail-out grane (no session, lokalni mode) ne diraju ovo.
- Dodati `projectsModuleEnabled` state:
  - localStorage key `projects_module_enabled`
  - Init: ako ključ postoji → poštuj; inače: ako `usageProfile === 'finance_only'` → `false`, inače → `true`
  - Setter `setProjectsModuleEnabled(boolean)` → localStorage `'true'/'false'` sync
- Tip interface-a + contextValue + useMemo deps proširiti
- DB sync se NE uvodi (Faza 2)

## 4. `src/components/BottomNav.tsx` (refactor)

- Ukloni `usageProfile` iz `useAppState()` destruktiranja
- Dodaj `const modules = useModuleStates();`
- Filter:
  - `/home`, `/wallet`, `/budgets` → uvijek
  - `/projects` → `getNavVisibility('projects', modules.projects) === 'visible'`
  - `/family` → `getNavVisibility('family', modules.family) === 'visible' && !activeBusinessProfileId`

## 5. `src/components/home/HomeHeader.tsx` + `src/components/PageHeader.tsx`

- Ukloniti direct `localStorage.getItem('family_mode_enabled')` read (HomeHeader:88 area)
- Zamijeniti s `const { familyModeEnabled } = useAppState();`
- Sign-out preservation block (HomeHeader:84-96, PageHeader:38-50): dodati `projects_module_enabled` preserve liniju uz postojeće (`family_mode_enabled`, `business_mode_enabled`, `ai_assistant_enabled`, `simple_mode_enabled`)

## 6. Projects gate u Core UI

`const { projectsModuleEnabled } = useAppState();` + render guard:

| File | Mjesto | Akcija |
|---|---|---|
| `home/ActiveProjectsStrip.tsx` | top-level `useEffect`/render gate | `if (!projectsModuleEnabled) return null` (zamjenjuje `usageProfile === 'finance_only'` check) |
| `home/PersonalModeView.tsx` | `projectsHidden` izvor (:147, :250, :271) | `const projectsHidden = !projectsModuleEnabled;` (umjesto usageProfile checka) |
| `add-expense/ManualExpenseForm.tsx` | Project + Milestone selector blok (:489-527) | wrap u `{projectsModuleEnabled && (...)}` |
| `add-expense/AddExpenseDialog.tsx` | dovela `useProjects` + project picker UI | sakriti UI grane (form ne prima `projects`/`projectId` UI kad off; data layer ostaje) |
| `EditTransactionDialog.tsx` | project field render | wrap u flag |
| `TransactionFilters.tsx` | project filter (:436-438) | wrap u flag |
| `CategoryTransactionsDialog.tsx` | bulk "assign project" entry | wrap u flag |
| `PaymentSourceTransactionsDialog.tsx` | bulk "assign project" + project filter (:262, :546) | wrap u flag |
| `TransactionListDialog.tsx` | bulk "assign project" (:187) | wrap u flag |

Data-driven vizualni tragovi (project color stripe na `TransactionItem`, project name u detail view) **ostaju** — nisu nove entry/akcijske točke.

## 7. Family gate u Core UI

| File | Mjesto | Akcija |
|---|---|---|
| `TransactionDetailDialog.tsx` | `FamilySplitControls` mount (:415) | dodaj `familyModeEnabled &&` u uvjet |
| `TransactionDetailDialog.tsx` | `FamilyReactionsBar` + `FamilyCommentsInline` (:814-815) | dodaj `familyModeEnabled &&` ispred postojećeg `familyGroupId` checka |
| `add-expense/ManualExpenseForm.tsx` | `SplitPredictionHint` (:589) | wrap u flag |
| `CashflowForecast.tsx` | family obligations chip (:189-193) | wrap u flag |

Hookovi koji povlače family data ostaju — gate je striktno na UI sloju.

## 8. `src/components/settings/ModulesSection.tsx` (novi)

Layout: stack od 4 kartice (`Card` ili `div` u stilu postojećih `bg-muted/30 rounded-xl p-3` redova iz `NotificationsSection`).

Svaka kartica:
- 9×9 ikon kontejner s teal tintom (`bg-primary/10`)
- Lucide ikona: Core=`Home`, Family=`Users`, Projects=`FolderKanban`, Business=`Building2`
- Naslov + 1 redak opisa (i18n)
- Badge desno: `Aktivno` (teal), `Nije aktivno` (muted), `Pro` ili `Business` (s `Lock`)
- Akcija:
  - **Core** → tekstualni "Uvijek aktivno", bez kontrole
  - **Family/Projects/Business**:
    - `cardState === 'locked'` → `Button variant="outline"` s ikonom `Lock` + tekst "Nadogradi" → `navigate('/paywall')`
    - inače → `Switch` (kontrolira pripadajući `setXModeEnabled`)
- **Family** OFF: prvo otvori `AlertDialog` (istu logiku kao trenutno u `SettingsDialog`, premještenu unutar `ModulesSection` s lokalnim `showFamilyDisableConfirm` stateom)
- **Business** kad aktivan: dodatni `Button variant="outline" w-full` "Tvrtke" (ekvivalent postojećeg `onShowBusinessProfile`) — prop `onManageCompanies?: () => void` koju prosljeđuje `SettingsDialog`
- Business toggle ako nije business tier ali user pokuša → prikaži `showError` + navigate `/paywall` (zadrži postojeću logiku iz `NotificationsSection.tsx:398-404`)

## 9. `SettingsDialog.tsx` + `NotificationsSection.tsx` (izmjene)

`SettingsDialog.tsx`:
- Mountati `<ModulesSection onManageCompanies={() => setShowBusinessProfile(true)} />` između `<AppearanceSection>` i `<SecuritySection>` (visoko u listi — discovery)
- Ukloniti `familyModeEnabled`, `onFamilyModeToggle`, `businessModeEnabled`, `onBusinessModeChange`, `onShowBusinessProfile` props iz `<NotificationsSection>` poziva (linije :699-710)
- Ukloniti `AlertDialog` blok za Family disable (:740-766) i pripadajući `showFamilyDisableConfirm` state — premješten je u `ModulesSection`

`NotificationsSection.tsx`:
- Ukloniti `family-mode` blok (:351-372)
- Ukloniti business mode blok + "Tvrtke" button (:374-420)
- Ukloniti pripadajuće propove iz interface-a (`familyModeEnabled`, `onFamilyModeToggle`, `businessModeEnabled`, `onBusinessModeChange`, `onShowBusinessProfile`)
- Ostaju: sound, push, AI, simple mode, classic dashboard, ostali notification toggleovi

## 10. i18n (`hr.json`, `en.json`, `de.json`)

Novi namespace `settings.modules.*`:
- `title`, `subtitle`
- `core.{title,desc,alwaysActive}`
- `family.{title,desc}`
- `projects.{title,desc}`
- `business.{title,desc,manageCompanies}`
- `state.{active,inactive,lockedPro,lockedBusiness}`
- `upgrade`
- `family.disable.{title,description,warn1,warn2,keep,confirm,cancel}` (preuzeto iz postojećih `settings.familyDisable*` ključeva; mogu se reupotrijebiti postojeći i samo dodati novi prefiks ako je potrebno — preferira se REUSE postojećih `settings.familyDisable*` ključeva da se ne dupliciraju)

Sva tri jezika dobivaju cijeli set bez TODO/fallbacka.

---

## Točan popis fileova

**Novi:**
- `src/lib/moduleVisibility.ts`
- `src/hooks/useModuleStates.ts`
- `src/components/settings/ModulesSection.tsx`

**Mijenja se:**
- `src/contexts/AppStateContext.tsx`
- `src/components/BottomNav.tsx`
- `src/components/home/HomeHeader.tsx`
- `src/components/PageHeader.tsx`
- `src/components/home/PersonalModeView.tsx`
- `src/components/home/ActiveProjectsStrip.tsx`
- `src/components/add-expense/ManualExpenseForm.tsx`
- `src/components/add-expense/AddExpenseDialog.tsx`
- `src/components/EditTransactionDialog.tsx`
- `src/components/TransactionDetailDialog.tsx`
- `src/components/TransactionFilters.tsx`
- `src/components/CashflowForecast.tsx`
- `src/components/CategoryTransactionsDialog.tsx`
- `src/components/PaymentSourceTransactionsDialog.tsx`
- `src/components/TransactionListDialog.tsx`
- `src/components/settings/SettingsDialog.tsx`
- `src/components/settings/NotificationsSection.tsx`
- `src/i18n/locales/hr.json` (+ `en.json`, `de.json` ako su zasebni)

**Memory:** dodati novi mem file `mem://features/module-visibility-phase-1` + update `mem://index.md`.

---

## Što je namjerno odgođeno za Fazu 2

- `/business` route, dead code (BusinessModeView, BusinessProfileSwitcher, AIInsightsSection)
- DB sync preferenci (`user_preferences` JSONB)
- Calendar u BottomNav
- `PdfImportContext` feature gate
- `ReportsDialog` paywall redirect → UpgradePrompt
- `UpgradePrompt` vizualna razlika Pro vs Business
- `useFeatureAccess` dead `team_access`/`advanced_projects`
- Retire `usage_profile` u potpunosti (Faza 1 ga samo prestaje koristiti za Projects gating; flag i onboarding step ostaju)
- `Budgets.tsx` local-mode CTA

---

## Otvoreni rizici / nejasnoće

1. **Auto-on family backfill** dodaje 1 SELECT pri svakom mountu za sve usere koji nemaju ključ. Trošak: zanemariv (head=true, indexed), ali ako mreža padne — fallback je `false` (planirano). Korisnik svjesno gubi family stavku do prvog uspješnog upita; pri sljedećem mountu se ispravi.
2. **`AddExpenseDialog`** trenutno `useProjects` hook poziva bezuvjetno — gate je samo UI; data poziv ostaje (Faza 2 može short-circuit). Nije problem funkcionalno.
3. **`PersonalModeView` `isLocalMode` + projects:** trenutno `projectsHidden` već uzima i `usageProfile`; po novoj logici lokalni useri nisu ograničeni modul flagom (mogu uključiti). Treba li lokalni mode striktno onemogućiti Projects? **Pretpostavka:** ne, ostaje status quo (lokalni može uključiti modul kao i prije).
4. **Reuse postojećih `settings.familyDisable*` ključeva** vs novi `settings.modules.family.disable.*`: preferiram **reuse** postojećih da minimiziraremo i18n delta i izbjegnemo divergenciju copya. Ako želiš striktno nove keys, javi.
5. **Memory file:** zapisat ću novi memory rules za helper i flagove (default OFF za family + projects, gdje su gateovi). Ako želiš ime drugačije od `module-visibility-phase-1`, javi.

Na approve plana, izvršavam u jednom koraku — bez međupotvrda.
