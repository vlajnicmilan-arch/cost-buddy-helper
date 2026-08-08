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
