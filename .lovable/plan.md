
# Faza 1 — Family modul: "Hygiene" iteracija

Cilj: brzo poboljšati UX bez DB promjena ili novih feature-a. Sve unutar postojeće arhitekture.

## A. Tabovi u detail view-u

`FamilyGroupDetailView.tsx` (819 linija) trenutno renderira 6 sekcija jednu ispod druge. Razbiti u shadcn `Tabs`:

```
[Pregled] [Računi] [Budžeti] [Projekti] [Ciljevi] [Tim] [Aktivnost]
```

- **Pregled**: Summary card (totalBalance) + 3 najnovije aktivnosti + brzi statistički blok (broj članova, broj dijeljenih resursa)
- Ostale sekcije → svaka u svom tabu, kod ostaje isti, samo wrap u `TabsContent`
- Default tab: `pregled`
- Tab state u `useState` (ne URL — detail view se zatvara natrag na listu grupa)

## B. Empty-state wizard

Kad grupa ima 0 dijeljenih resursa **i** 1 člana (samo owner), na vrhu "Pregled" taba pokazati 3-step checklist:

```
☐ 1. Dodaj prvi dijeljeni račun
☐ 2. Pozovi člana obitelji
☐ 3. Postavi zajednički cilj
```

Svaki check je gumb koji otvara odgovarajući tab + scrolla na "Add" sekciju. Sakriva se čim je sve ispunjeno (`localStorage` zastavica `family_wizard_dismissed_{groupId}` za "Sakrij").

## C. i18n cleanup

Zamijeniti hardkodirane fallback stringove pronađene u `useFamilyGroups.ts` i `FamilyGroupDetailView.tsx`:

- `'Nepoznato'` (3 mjesta u hooku) → `t('family.unknownMember', 'Nepoznato')`
- `'Račun'` (3 mjesta) → `t('family.fallbackAccount', 'Račun')`
- `'Budžet'` (2 mjesta) → `t('family.fallbackBudget', 'Budžet')`
- `'Projekt'` (1 mjesto) → `t('family.fallbackProject', 'Projekt')`

Dodati ključeve u sva 3 jezika (hr/en/de) unutar postojećeg `family.*` namespacea.

## D. Aktivnost feed — filtri + paginacija

`FamilyActivity` sekcija trenutno pokazuje sve unose odjednom. Dodati:

- Dva mala `Select`-a iznad liste: **Član** (svi / pojedinačno po imenu) i **Tip** (svi / financije / članstvo / resursi)
- Klijentsko filtriranje na `activities` arrayu (nije potrebno mijenjati hook ili DB)
- Paginacija: prvih 30 + "Učitaj još 30" gumb (isti pattern kao transaction list pagination memory)

## E. Per-member tally na shared budget kartici

Trenutno svaka `sharedBudgets` kartica prikazuje samo `formatAmount(budget_total)`. Dodati ispod imena malu liniju "Tomislav 45 €, Ana 30 € · od 200 €" — tko je koliko potrošio.

Implementacija:
- U `useFamilySharedResources` ili novom `useFamilyBudgetTally(budgetId, memberIds)` hooku: jedan query `expenses` filtriran po `budget_id` i `user_id IN (members)`, GROUP BY user_id, SUM amount za `type='expense'`
- Cache po `budget_id` u state objektu (kao postojeći `projectStats`)
- Prikaz: max 3 najveća člana, ostali "+N"
- Bez DB promjena, samo SELECT preko postojeće RLS

## Što NIJE u Fazi 1 (čeka tvoju odluku)

- Per-transaction privacy flag (Faza 2)
- Split tracker / "tko duguje kome" (Faza 2)
- Reakcije i komentari (Faza 3)
- Granularne notifikacije (Faza 3)

## Tehnički detalji

- **Bez novih tablica, bez migracija.** Sve je UI + jedan SELECT za tally.
- **Bez novih dependencyja.** shadcn `Tabs` i `Select` su već u projektu.
- **Komponenta refactor:** `FamilyGroupDetailView.tsx` (819 linija) razbiti na `FamilyDetailHeader`, `FamilyOverviewTab`, `FamilySourcesTab`, `FamilyBudgetsTab`, `FamilyProjectsTab`, `FamilySavingsTab`, `FamilyMembersTab`, `FamilyActivityTab` — usklađeno s pravilom "max ~300 linija po komponenti".
- **i18n:** novi ključevi `family.tabs.*`, `family.wizard.*`, `family.activity.filterBy*`, `family.fallback*`, `family.unknownMember`, `family.tally.others` u hr/en/de.
- **A11y:** tabovi automatski dolaze s ARIA iz shadcn-a; checklist gumbi koriste postojeći `clickableProps()` ako će biti `<div>`, inače `<button>`.

## Procjena

- ~4-6 sati implementacije
- Bez rizika za postojeće funkcionalnosti
- 0 DB migracija
- Pokriva 4 od 14 dimenzija ocjene iz prethodnog reviewa (UX, empty state, i18n, aktivnost)

Reci "krenimo" pa idem u build mode.
