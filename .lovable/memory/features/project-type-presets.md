---
name: Project Type Presets
description: 13 vrsta projekata (general + 12 djelatnosti) postavljenih pri kreiranju, mijenjaju samo labele tabova i predlažu šablonu faza
type: feature
---

# Project Type Presets

Pri kreiranju projekta korisnik prvo bira **vrstu** (Korak 1, obavezan), zatim ide na detalje (Korak 2). Vrsta zaključana nakon kreiranja.

## Registar
- `src/lib/projectTypes.ts` — 13 preseta: `general`, `construction_new`, `renovation`, `interior`, `it_software`, `marketing`, `education`, `beauty`, `hospitality_event`, `healthcare`, `retail_opening`, `manufacturing`, `private_event`.
- Svaki preset ima `icon`, `color`, `labelKeys` (i18n key suffixes) i opcionalni `templateCategory` za auto-pred-odabir šablone.

## DB
- `projects.project_type` (text, NOT NULL DEFAULT 'general') — zaključan pri kreiranju.
- `projects.label_overrides` (jsonb, nullable) — REZERVIRANO za buduću "Prilagodba projekta" UI; sada se ne piše.
- Index na `project_type`.

## Labels resolver — `useProjectTypeLabels(project)`
3-slojni prioritet:
1. `project.label_overrides[key]` (per-project override, future-ready)
2. `preset.labelKeys[key]` → `t(presetKey)`
3. globalni `t(fallbackKey, fallback)`

Vraća: `milestonesLabel`, `workersLabel`, `collaboratorsLabel`, `documentsLabel`, `membersLabel`, `typeName`.

## i18n
Namespace `projectTypes.*` u hr/en/de.json. Po preset-u: `name`, `tagline`, `labels.{milestones,workers,collaborators,documents,members}`.

## UI integracija
- `ProjectTypePickerStep` — Korak 1 wizard (grid 2/3 kol., min 44px, role="radio").
- `ProjectDialog` — 2-step wizard (samo create); edit preskače na step 2 i prikazuje read-only badge "Vrsta: X".
- `ProjectTemplatePicker` — prima `categoryFilter`, prikazuje match + general templates.
- `ProjectFullScreenView` + `ProjectDetailDialog` — koriste `labels.*` umjesto hardkodiranih t() poziva za milestones/workers/collaborators/documents.

## Zaključavanje vrste
`updateProject` ne dira `project_type`. UI u edit modu pokazuje read-only badge bez "Promijeni vrstu" gumba.

## Što NIJE implementirano (future)
- UI za `label_overrides` (per-project rename tabova). Hook ga već čita; treba samo dodati Settings sekciju.
- Migracija postojećih projekata — svi ostaju `general`, originalni labeli.
