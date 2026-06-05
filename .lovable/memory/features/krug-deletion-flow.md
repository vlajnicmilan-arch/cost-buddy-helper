---
name: krug-deletion-flow
description: Brisanje Kruga uz suglasnost punopravnih članova; solo shortcut + 30d soft-delete grace
type: feature
---
**Pravilo:** Krug se briše uz pristanak svih punopravnih članova.

- **Solo Krug** (vlasnik = jedini punopravni): `krug_request_deletion` odmah radi soft-delete + outcome `ok_deleted_solo`.
- **Multi**: vlasnik pokreće `pending` request + auto-vote `approve`. Svaki punopravni (owner + `krug_membership.role='punopravni'`) glasa kroz `krug_vote_deletion`. Bilo koji `reject` zatvara request (`ok_rejected`). Kad approve count ≥ full member count → soft-delete + `ok_approved_and_deleted`. Obični članovi → `not_eligible`.
- Vlasnik može povući kroz `krug_cancel_deletion` dok je pending.

**Soft delete:** `krug.deleted_at=now()`, `lifecycle_state='deleted'`. `useMyKrugs`/`useKrug` već filtriraju `deleted_at IS NULL` pa Krug nestaje iz UI-a odmah. Expenses retci s `krug_id` ostaju kao osobna povijest (skeleton kompromis).

**Hard purge:** edge `cleanup-krug-deleted` (cron `cleanup-krug-deleted-daily` 03:20 UTC) zove `krug_purge_deleted(30)` koji `DELETE FROM krug WHERE deleted_at < now()-30d` (cascade na ownership/membership/shared_payment_source/deletion_request/vote).

**DB:** `krug_deletion_request(krug_id PK, initiated_by, reason, status pending|approved|cancelled|rejected, resolved_at, resolved_by)` + `krug_deletion_vote(krug_id, user_id PK, approve, voted_at)`. RLS SELECT za `krug_is_member`; mutacije samo kroz SECURITY DEFINER RPC.

**Frontend:** `useKrugDeletion.ts` hookovi, `KrugDeleteDialog`, `KrugDeletionVotePanel`. Gumb "Obriši Krug" (Trash2, destructive) u `KrugDetailScreen` headeru (samo owner, samo dok nije `lifecycle_state='deleted'`).

**Pure helper:** `src/lib/krugDeletionDecisions.ts` (countFullMembers/decideRequestDeletion/decideVote/decideCancel/isOkOutcome) + 19 vitest. Replicira točan flow RPC-a za regresijsku zaštitu.

**i18n:** `krug.delete.*` (HR/EN/DE) — cta/title/confirmSolo/confirmMulti/reasonLabel/submit(Solo)/votePanel.*/outcomes.*/errors.*.
