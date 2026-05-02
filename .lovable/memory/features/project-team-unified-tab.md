---
name: Unified Project Team Tab
description: Single "Tim projekta" tab in ProjectFullScreenView with internal sub-tabs for Members/Workers/Collaborators
type: feature
---
ProjectFullScreenView sada ima jedan tab `team` u 'people' grupi koji renderira `ProjectTeamTab`. Komponenta interno prebacuje između 3 podtaba (members / workers / collaborators) preko segmentiranog kontrolera.

- Originalne komponente `ProjectMembersTab`, `ProjectWorkersTab`, `ProjectCollaboratorsTab` se REUSE-aju bez izmjena (ne duplicirati logiku).
- Legacy `initialTab` vrijednosti `'members' | 'workers' | 'collaborators'` se mapiraju na `team` + `initialSubTab` u resolveru — ne lomi vanjske pozive.
- Vidljivost podtabova: `canSeeWorkers` (workforce feature, ne workerOnly), `canSeeCollaborators` (business view + collaborators feature). Members je uvijek vidljiv.
- i18n ključevi: `projects.projectTeam`, `projects.workers`, `projects.collaborators`, `projects.tooltips.projectTeam` u hr/en/de.
