## Problem

U `ProjectsPanel.confirmMigrate` (linije 157-187) odabir ciljne tvrtke je nepouzdan:

1. Prvo se čita `localStorage.getItem('finmate.businessProfiles')` — taj ključ se ne koristi nigdje u kodu (mrtav fallback iz starije verzije).
2. Fallback na DB poziv `business_profiles` filtrira samo `is_active=true` i koristi `.single()` — baca grešku ako korisnik ima 0 ili >1 aktivnih tvrtki (a `is_active` default je `false`, pa je 0 čest slučaj).
3. Ako ništa nije nađeno, dialog se tiho zatvori bez ikakve poruke — točno simptom koji opisuješ ("ne radi").
4. Korisnik s više tvrtki nema mogućnost izbora.

`migrateToBusinessMode` (useProjects.ts) sam po sebi radi ispravno (UPDATE-a `projects` i pripadne `expenses`).

## Rješenje

Zamijeniti logiku odabira tvrtke u `ProjectsPanel.tsx`:

1. Koristiti postojeći hook `useBusinessProfiles()` koji već vraća sve tvrtke trenutnog korisnika (filtrirano per user, sortirano po imenu).
2. Logika na klik "Premjesti u poslovni mod":
   - **0 tvrtki**: prikaži `showError` s porukom da prvo treba kreirati tvrtku u Postavkama → Poslovne tvrtke.
   - **1 tvrtka**: prikaži postojeći confirm dialog s imenom te tvrtke i nakon potvrde migriraj.
   - **>1 tvrtke**: prikaži novi izbornik (Select/RadioGroup) unutar dialoga za odabir ciljne tvrtke, gumb "Premjesti" aktivan tek nakon izbora.
3. Ukloniti mrtvi `localStorage` fallback i `.single()` poziv.
4. Po uspjehu pozvati `refetch()` + `fetchAllStats()` da se kartica osvježi i nestane iz osobnog popisa.
5. Dodati `showError` u catch granu `confirmMigrate` da se buduće tihe greške vide.

## i18n

Dodati ključeve u `hr.json`, `en.json`, `de.json` pod `projects.*`:
- `migrateNoProfiles` — "Nemaš nijednu tvrtku. Kreiraj je u Postavkama → Poslovne tvrtke."
- `migrateChooseProfile` — "Odaberi tvrtku"
- `migrateConfirmTitle` — "Premjesti projekt u poslovni mod"
- `migrateConfirmDesc` — "Projekt '{{name}}' i sve njegove transakcije bit će premješteni u tvrtku '{{company}}'. Ova radnja se može poništiti ručno."

## Datoteke

- `src/components/projects/ProjectsPanel.tsx` — zamijeniti `confirmMigrate`, proširiti migrate dialog s biračem tvrtke kad ih je >1, uvesti `useBusinessProfiles`.
- `src/i18n/locales/{hr,en,de}.json` — dodati gore navedene ključeve.

Bez izmjena baze i bez izmjena `useProjects.migrateToBusinessMode`.
