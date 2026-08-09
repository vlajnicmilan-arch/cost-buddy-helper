---
name: krug-archive-readonly
description: Arhivirani Krug (lifecycle_state=read_only) — DB brana protiv pisanja, dopusteno samo brisanje cijele arhive
type: feature
---
**Arhiva nastaje** kad vlasnik izađe bez nasljednika: `krug_owner_leave` s 0 punopravnih kandidata briše vlasnikovo članstvo, postavlja `krug.lifecycle_state='read_only'`, upisuje audit `owner_left` (`metadata.archived=true`) i vraća `ok_archived`. **`krug_ownership` red NAMJERNO ostaje** — povijesni trag tko je bio vlasnik.

**Brana:** `public.krug_assert_writable(uuid)` diže `42501 krug_archived_read_only` ako je krug `read_only` i nije soft-deleted. BEFORE INSERT/UPDATE/DELETE okidač `krug_archive_barrier` (funkcije `krug_barrier_by_krug_id` / `krug_barrier_by_override_id`) na: `expenses`, `krug_membership`, `krug_invitations`, `krug_expense_split_override`, `krug_expense_split_share`, `krug_expense_split_confirmation`, `krug_income_ratio`, `krug_settlement_ledger`, `krug_settlement_fx_snapshot`, `krug_shared_payment_source`, `krug_ownership`.

**Nepokriveno namjerno:** `krug` (vlastiti okidač `krug_archive_barrier_self`), `krug_membership_audit` (append-only povijest), `krug_deletion_request` / `krug_deletion_vote` (put brisanja arhive), `krug_act_dedup` (tehnički idempotency zapis bez krug_id).

**Iznimke:** na `krug` u arhivi dopuštena je izmjena samo `lifecycle_state`/`deleted_at`/`deleted_by`/`updated_at` (whitelist preko `to_jsonb(NEW) - kljucevi`). BEFORE DELETE na `krug` postavlja `set_config('krug.bypass_barrier','on',true)` pa kaskadno brisanje djece prolazi — to je jedini bypass.

**Brisanje arhive:** `krug_request_deletion` sada prima i punopravnog člana kad je krug `read_only` (vlasnik je otišao). Kvorum ide kroz `krug_full_member_count(uuid)` koji otišlog vlasnika arhive NE broji; isti helper koristi `krug_vote_deletion`.

**Frontend:** `KrugDetailScreen` — `isArchived` skriva pozivanje/upravljanje članovima, izlazak, approval akcije, shared-source upravljanje; prikazuje `krug.archive.note`; gumb postaje `krug.archive.deleteCta` i vidljiv je punopravnim članovima. `KrugSettlementSection`/`KrugSettlementHistory` imaju `readOnly` prop (skriva Podmiri/Poništi). `KrugSelector` filtrira `read_only` krugove iz unosa troška. RLS nije mijenjan.

**Test:** `supabase/tests/krug/archive_readonly.sql` (blokade po tablicama, prijelaz stanja, preživljavanje vlasništva, kaskadno brisanje, normalan krug netaknut).
