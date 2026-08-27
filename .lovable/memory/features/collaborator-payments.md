---
name: Plaćanje suradnika (project_collaborator_payments)
description: Suradnici imaju pravi registar plaćanja s troškom, storniranjem i legacy_paid_amount; dodavanje suradnika moguće iz krovnog pregleda.
type: feature
---
Suradnici (`project_collaborators`) od 27.8.2026. imaju STVARNA plaćanja, ne samo upisano polje.

- Tablica `public.project_collaborator_payments` (status `paid|voided`, `expense_id`, `deleted_at`). RLS: čita samo vlasnik; svi upisi idu isključivo kroz RPC-ove.
- `project_collaborators.legacy_paid_amount` = ručno upisani iznos od prije registra. NIKAD se ne mijenja i ne pretvara u trošak.
  Vrijedi: `paid_amount = legacy_paid_amount + zbroj živih plaćanja`.
- RPC `create_collaborator_payment(p_collaborator_id, p_amount, p_payment_source, p_paid_at, p_note)` — dvije faze (sve provjere, pa upisi), piše TOČNO JEDAN trošak + jedan redak registra. Strop postoji SAMO kad je `total_price > 0` (`collab_payment_exceeds_remaining`). `total_price = 0` znači "iznos nije upisan" → nema stropa.
- RPC `void_collaborator_payment(p_payment_id, p_reason)` — soft-delete troška, status `voided`, ponovni izračun. Dvostruki storno vraća `collab_payment_not_found_or_voided`.
- Brisanje suradnika s plaćanjima je odbijeno FK-om (`ON DELETE RESTRICT`); UI to kaže brojkama (`collaboratorDeleteImpact.ts`), nikad "nešto nije uspjelo".
- Klijent: `src/lib/collaboratorPayment.ts` (čista logika), `useCollaboratorPayments.ts` (RPC + dijagnostika `collaborator_payment_ok/failed`, `collaborator_payment_void_ok/failed`), `CollaboratorPaymentDialog.tsx`, povijest u `CollaboratorDetailDialog.tsx` (zadnjih 5 + mjeseci + skrivena stornirana).
- "+ Suradnik" iz krovnog pregleda otvara POSTOJEĆI `ProjectCollaboratorDialog` s neobaveznim biračem projekta (samo kad `projectOptions` postoji). Unutar projekta ponašanje je nepromijenjeno.
- Radnički put (`create_worker_payout`, `create_person_payout`, `void_worker_payout*`, `project_workers`, `workers`, sati, satnice) se NE dira.
- Migracije `20260827043932` + `20260827044016` upisane u `supabase/tests/balance/BALANCE_MIGRATIONS.txt`; scenariji CP1–CP5 u `10_scenarios.sql`.

Brisanje (od 27.8.2026., migracija `20260827182332`):
- RPC `delete_collaborator(p_collaborator_id)` — živa plaćanja brane brisanje porukom `collaborator_has_live_payments|<broj>|<zbroj>`; ako su SVA stornirana, briše i retke registra i suradnika. Saldo se time NE mijenja (storno ga je već vratio).
- `project_collaborator_payments.project_id` je `ON DELETE CASCADE` → trajno brisanje projekta odnosi i registar plaćanja.
- SQL harness: CD1–CD3 u `supabase/tests/balance/10_scenarios.sql`, prag PASS u CI podignut na 144.
- Ljudi: PD1–PD3 u `supabase/tests/people/person_link.sql` (brisanje osobe ostavlja angažmane žive s `worker_id = NULL`, razdvajanje ne dira ostale).
