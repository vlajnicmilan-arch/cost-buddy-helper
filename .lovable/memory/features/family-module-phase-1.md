---
name: Family Module Phase 1
description: Faza 1 hygiene iteracija — tabovi, onboarding wizard, i18n cleanup, activity filtri/paginacija, per-member tally na shared budgetima
type: feature
---

`FamilyGroupDetailView` refaktoriran iz 819-linijskog single-scroll view-a u shadcn `Tabs` (Pregled/Računi/Budžeti/Projekti/Ciljevi/Tim/Aktivnost). Pregled tab ima onboarding wizard (3 koraka, dismiss preko `localStorage` ključa `family_wizard_dismissed_{groupId}`), summary balance, quick-stats grid (članovi/resursi), i preview 3 zadnje aktivnosti s "Sve aktivnosti" linkom.

Novi artefakti:
- `src/hooks/useFamilyBudgetTally.ts` — agregira `expenses` po `budget_id` × `user_id` za shared budžete, vraća sortirani `MemberTally[]` po budgetu (samo SELECT preko postojeće RLS)
- `src/components/family/FamilyOnboardingWizard.tsx` — 3-step checklist gumbi koji navigiraju kroz tabove (`goToTab` setter + auto-click "Add" gumba preko `addBtnRef`)
- `src/components/family/FamilyActivityFeed.tsx` — preselectani filtri (član, tip: finance/membership/resources) + paginacija (30 + Load more); `limit` prop za preview na overview tabu
- `src/components/family/FamilyBudgetTallyRow.tsx` — prikazuje top 3 člana + "i još {count}" + "od {total}"

i18n: `family.tabs.*`, `family.overview.*`, `family.wizard.*`, `family.activityFilters.*`, `family.tally.*`, `family.fallbackAccount/Budget/Project`, `family.unknownMember` dodani u hr/en/de.

Hardkodirani fallback stringovi (`'Nepoznato'`, `'Račun'`, `'Budžet'`, `'Projekt'`) zamijenjeni `t()` pozivima u `useFamilyGroups.ts` i `FamilyGroupDetailView.tsx`.

Bez DB migracija, bez novih dependencyja. Faza 2 (per-transaction privacy + split tracker) i Faza 3 (reakcije, granularne notifikacije) čekaju odluku korisnika.
