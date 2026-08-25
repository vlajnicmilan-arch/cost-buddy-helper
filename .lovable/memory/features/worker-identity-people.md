---
name: Ljudi — identitet satnog radnika iznad projekata
description: Tablica workers (identitet) + project_workers.worker_id (angažman), pogled Projekti|Ljudi, potvrda spajanja bez automatike
type: feature
---
Model:
- `public.workers` = IDENTITET osobe koja radi na sat (user_id vlasnik, business_profile_id doseg, linked_user_id, archived_at). RLS: vlasnik upravlja svojima; povezani korisnik smije pročitati svoj zapis.
- `project_workers.worker_id` → `workers.id` = ANGAŽMAN. Satnica, pozicija i radno vrijeme ostaju na angažmanu (ista osoba smije imati različitu satnicu po projektu).
- NE dirati: `project_work_entries`, `project_worker_rate_history`, `payout_rate_segments`, `project_worker_payouts` — sati i obračun ostaju vezani na angažman.

Granica: SURADNICI (`project_collaborators`) nikad se ne povezuju, zbrajaju ni prikazuju u Ljudima.

Pravila:
- Nikad automatsko spajanje. Grupiranje po (business_profile_id, normalizirano ime) daje samo PRIJEDLOG; korisnik potvrđuje "Da, isti" / "Ne, druge osobe".
- Pri dodavanju radnika na projekt, ako ime već postoji među Ljudima istog poslovnog profila → pitanje "Dodaj postojećeg / Ovo je druga osoba".
- Arhiviranje je izričita radnja, nikad automatska.
- Pogled Projekti → Ljudi je SAMO ZA ČITANJE; zbraja postojeće, ne uvodi novi način isplate.

Kod: `src/lib/workerIdentity.ts` (čiste funkcije + testovi), `src/hooks/useWorkerIdentities.ts`, `src/hooks/useWorkerIdentityAttach.ts`, `src/components/projects/PeopleTab.tsx`, `PersonDetailDialog.tsx`, `ExistingPersonPromptDialog.tsx`, prekidač u `src/pages/Projects.tsx`.
Svaki pad upisuje trag u `app_diagnostics_logs` (`worker_identity_*`).
