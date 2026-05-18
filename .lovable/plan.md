
# Plan: 3 prioriteta iz audita projektnih kartica

## 1. ProjectCard header – pojednostavljenje

**Cilj:** smanjiti vizualni šum u zaglavlju kartice u listi projekata.

- Zaglavlje zadržava: naziv projekta, **status badge**, **health badge** (s tooltipom koji objašnjava broj, npr. "78/100 – stabilno").
- **Marža badge** se uklanja iz headera kartice i seli u "Pregled" tab unutar `ProjectFullScreenView`.
- **Role badge** (manager/member) se zadržava ali manji i sekundarni (muted), desno poravnat.
- Kada je marža `—` (nema ugovora), umjesto zbunjujućeg "Marža: —" prikazuje se subtilan CTA chip u Pregledu: "Dodaj ugovor" → otvara MilestoneBudgetChangeSection / contract dialog.
- Sve preko `t()` ključeva (`projects.card.health`, `projects.card.addContract`).

**Datoteke:** `src/components/projects/ProjectCard.tsx`, `src/components/projects/ProjectOverviewTab.tsx` (ili gdje god je Pregled), i18n hr/en/de.

## 2. Posao grupa – spajanje Timeline + Faze, čišćenje quick-stats

**Cilj:** smanjiti broj tabova s 6 na 4, ukloniti redundantne quick-stat kartice.

- **Ukloniti 4 quick-stat kartice** na vrhu Posao grupe (broj faza, dokumenata, itd.) – isti brojevi već su badgeovi na tabovima.
- **Spojiti Timeline + Faze** u jedan tab `phases` s view switcher segmentom na vrhu: `Lista | Timeline`.
  - Default: Lista (postojeći `ProjectMilestonesTab`).
  - Timeline view: postojeća timeline komponenta.
  - State `phasesView` lokalno u tab komponenti (`useState<'list'|'timeline'>('list')`).
- **Spojiti Aktivnost + Dnevnik** u jedan tab `activity` s istim view switcherom: `Dnevnik | Aktivnost`.
- Rezultat: Posao ima 4 taba umjesto 6: Pregled, Faze (s view switch), Dokumenti, Aktivnost (s view switch).
- Mapirati legacy `initialTab` vrijednosti (`timeline`, `worklog`) → novi tab + `initialSubView` (isti pattern kao `project-team-unified-tab`).

**Datoteke:** `src/components/projects/ProjectFullScreenView.tsx`, nova `ProjectPhasesTab.tsx` wrapper, nova `ProjectActivityTab.tsx` wrapper, i18n.

## 3. Novac grupa – sažetak + semantičke boje

**Cilj:** jasan sažetak na vrhu Financiranja + ispravne semantičke boje.

- **Dodati kompaktni "Sažetak novca"** na vrh `ProjectFundingTab`:
  ```
  Ukupno alocirano: X €   |   Prihodi: Y €   |   Preostalo: Z €
  ```
  - 3-stupčani grid (mobile: stacked), brojevi naglašeni, label muted.
  - Preostalo: `totalAllocated - totalSpent`, semantička boja (income ako >0, expense ako <0).
- **Semantička korekcija "Završene faze":**
  - Trenutno prikazuje `-{amount}` u `text-expense` boji – pogrešno jer to nije gubitak nego planirani trošak.
  - Promijeniti u neutralnu boju (`text-foreground`) bez minus znaka, label: "Planirani trošak".
  - Boja ostaje suptilna; zelena/crvena rezervirana za stvarni prihod/gubitak.

**Datoteke:** `src/components/projects/ProjectFundingTab.tsx`, i18n ključevi (`projects.funding.summaryAllocated`, `summaryIncome`, `summaryRemaining`, `plannedCost`).

## Ne dirati

- Bez DB migracija.
- Bez izmjena `useProjects`, `useProjectFunding`, `useProjectMilestones` logike.
- `ProjectTransactionsTab` refactor (1564 linije) ostaje za poseban zadatak – nije u ovom planu.
- Ljudi tab ostaje kakav je (8/10 iz audita, sitne preporuke se odgađaju).

## Redoslijed implementacije

1. Novac (najmanji rizik, izolirana komponenta).
2. ProjectCard header (samo presentational).
3. Posao tab merge (najveći refactor, legacy mapping).
