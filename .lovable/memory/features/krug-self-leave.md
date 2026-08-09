---
name: krug-self-leave
description: Asimetrični samoizlazak iz Kruga — RPC krug_leave, audit member_left, obavijest krug_member_left
type: feature
---
**Governance pravilo:** samoizlazak je UVIJEK dopušten, bez ičijeg pristanka (zaštita od digitalnog zlostavljanja). Uklanjanje partnera u dvočlanom Krugu nije dopušteno — osoba SAMA izlazi.

- **RPC `krug_leave(p_krug_id)`** (SECURITY DEFINER, grant `authenticated`): briše VLASTITO članstvo. Ishodi: `unauthorized`, `krug_not_found`, `owner_cannot_leave` (vlasnikov tok = prijenos vlasništva, još nije izgrađen), `noop_not_member` (idempotencija), `ok_left`.
- **RLS ostaje strog:** `krug_membership_delete_owner_not_self` i dalje brani direktan self-DELETE; izlazak ide ISKLJUČIVO kroz RPC.
- **Razračunavanja se NE diraju** — `krug_settlement_ledger` i osobne transakcije ostaju. Nema FK-ova prema `krug_membership` pa brisanje članstva ne kaskadira.
- **Audit:** `krug_membership_audit` (append-only; trigger `krug_membership_audit_immutable` blokira UPDATE/DELETE; SELECT samo `krug_is_member`). Event `member_left`.
- **Obavijest:** `krug_member_left` kroz `krug_emit_notification` → `notify-krug-event` (interni ključ iz vaulta), dedup `krug_member_left:<krug>:<user>`.
- **Frontend:** `useKrugLeave.ts`, `KrugLeaveDialog.tsx`, gumb "Napusti Krug" za ne-vlasnike u `KrugDetailScreen`; `Krug.tsx` prima `onLeft` i vraća na listu. i18n `krug.leave.*` + `notifications.krug.member_left.*` (hr/en/de).
- **Čuvari:** `supabase/tests/krug/member_leave.sql` (faza 2 u `run.sh`, `KRUG_LEAVE_MIGRATIONS.txt`) + `src/test/krugLeave.test.ts`. SQL harness dokazano pada na pokvarenoj verziji RPC-a.

## Vlasnikov izlazak (isporuka 1/2 — prijenos vlasništva)

- **Pravilo:** Krug nikad ne ostaje bez vlasnika. Vlasnik ne može kroz `krug_leave` (`owner_cannot_leave` ostaje). Jedini put je RPC `krug_owner_leave(p_krug_id, p_successor_id)` — atomski: `krug_ownership` UPDATE na nasljednika + DELETE vlasnikovog članstva + 2 audit zapisa (`ownership_transferred`, `owner_left`).
- **Nasljednik:** ručni odabir, mora biti `punopravni` član. Ishodi: `ok_transferred`, `noop_not_owner`, `not_owner`, `successor_invalid`, `successor_not_full_member`, `successor_gone`, `no_successor_available`, `krug_not_found`, `unauthorized`.
- **Bez punopravnih članova:** `no_successor_available` — arhiviranje Kruga je isporuka 2/2, NE simulira se.
- **created_by rupica zatvorena:** RLS `krug_select_member` više ne priznaje golo `created_by`; grana vrijedi samo dok Krug nema vlasnika (bootstrap `INSERT ... RETURNING`, jer AFTER trigger tek slijedi). Provjera ide kroz SECURITY DEFINER `krug_has_owner(uuid)`.
- **Obavijesti:** `krug_ownership_received` (nasljednik) i `krug_owner_left` (ostali članovi), dedup po krugu; i18n u master i serverskom katalogu (hr/en/de).
- **Frontend:** `useKrugOwnerLeave.ts`, `KrugOwnerLeaveDialog.tsx`, gumb "Predaj vlasništvo i izađi" uz "Obriši Krug" u `KrugDetailScreen`.
- **Čuvari:** `supabase/tests/krug/owner_leave.sql` (faza C u `run.sh`, `KRUG_OWNER_LEAVE_MIGRATIONS.txt`) + `src/test/krugOwnerLeaveDialog.test.tsx`.
