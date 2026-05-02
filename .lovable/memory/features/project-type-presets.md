---
name: Project Type Presets
description: 13 vrsta projekata (general + 12 djelatnosti); strogi 1:1 mapping vrste→template kategorije, picker bez "general" fallbacka
type: feature
---

# Project Type Presets

Pri kreiranju projekta korisnik prvo bira **vrstu** (Korak 1, obavezan), zatim ide na detalje (Korak 2). Vrsta zaključana nakon kreiranja.

## Registar
- `src/lib/projectTypes.ts` — 13 preseta: `general`, `construction_new`, `renovation`, `interior`, `it_software`, `marketing`, `education`, `beauty`, `hospitality_event`, `healthcare`, `retail_opening`, `manufacturing`, `private_event`.
- Svaki preset ima `icon`, `color`, `labelKeys` (i18n key suffixes) i **obavezni `templateCategory`** koji 1:1 odgovara vrijednosti `project_templates.category`.

## DB
- `projects.project_type` (text, NOT NULL DEFAULT 'general') — zaključan pri kreiranju.
- `projects.label_overrides` (jsonb, nullable) — REZERVIRANO za buduću "Prilagodba projekta" UI.
- `project_templates.category` — slug koji odgovara `ProjectType.id` (npr. `it_software`, `marketing`). Iznimke: `construction_new`→`construction`, `renovation`→`renovation`, `general`→`general`.

## Vrsta projekta vs šablona faza (KRITIČNO)
- **Vrsta projekta** = ponašanje aplikacije (labele tabova, pred-popunjena ikona/boja). Trajna za projekt.
- **Šablona faza** = početni popis milestone-a koji se kreira jednom pri spremanju. Opcionalna, korisnik ih kasnije slobodno mijenja. NE mijenja vrstu.
- `ProjectTemplatePicker` koristi **STROGI filter** — samo `category === preset.templateCategory`, nikad `general` fallback. Ako vrsta nema kategoriju — picker se ne renderira. Ako kategorija postoji ali nema šablona — prazno stanje (poruka, bez gumba).
- Auto pre-select: samo na točan match. Nikad ne prepisuje korisnikova polja, nikad ne overrida ikonu/boju vrste.

## Labels resolver — `useProjectTypeLabels(project)`
3-slojni prioritet: `label_overrides` → `preset.labelKeys` (`t(presetKey)`) → globalni `t(fallbackKey, fallback)`. Vraća: `milestonesLabel`, `workersLabel`, `collaboratorsLabel`, `documentsLabel`, `membersLabel`, `typeName`.

## i18n
- `projectTypes.*` — `name`, `tagline`, `labels.{milestones,workers,collaborators,documents,members}` po preset-u (hr/en/de).
- `projects.templates.suggestedPhases`, `projects.templates.help`, `projects.templates.empty` — strict picker UI.

## UI integracija
- `ProjectTypePickerStep` — Korak 1 (grid 2/3 kol., min 44px, role="radio").
- `ProjectDialog` — 2-step wizard (samo create); edit preskače na step 2 i prikazuje read-only badge "Vrsta: X".
- `ProjectTemplatePicker` — prima `categoryFilter`, prikazuje **samo** točan match + prazno stanje.
- `ProjectFullScreenView` + `ProjectDetailDialog` — koriste `labels.*`.

## Što NIJE implementirano (future)
- UI za `label_overrides` (per-project rename tabova).
- Migracija postojećih projekata — svi ostaju `general`.
- Admin UI za upravljanje šablonama.
