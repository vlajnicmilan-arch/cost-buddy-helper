-- BUG C fix: _guard_expense_payout_write must protect ONLY the owner's
-- auto-expense row (the one referenced by project_worker_payouts.expense_id).
--
-- Prije: guard je blokirao DELETE i osjetljive UPDATE-e bilo kojeg reda kojemu
-- je worker_payout_id IS NOT NULL. Radnikov attribution red (naš PR "Attribution v1")
-- također upisuje worker_payout_id, pa je guard nenamjerno blokirao radniku
-- brisanje vlastitog pripisa (storno flow explicitno traži da radnik može).
--
-- Posle: guard se aktivira SAMO za ownerov auto-expense — jedini red čiji je id
-- referenciran u project_worker_payouts.expense_id. Sve ostalo (radnikov
-- attribution s worker_payout_id ILI worker_payout_batch_id) prolazi kroz
-- standardni RLS + soft-delete tok.
--
-- Batch grana: worker_payout_batch_id postoji SAMO na radnikovom attribution
-- redu (owner batch koristi per-payout create_worker_payout koji upisuje samo
-- worker_payout_id). Stoga batch_id automatski nije guardan — usklađuje se s
-- DELETE ponašanjem koje je već bilo dopušteno.

CREATE OR REPLACE FUNCTION public._guard_expense_payout_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_allow text := current_setting('app.allow_payout_write', true);
BEGIN
  IF v_allow = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Ownership gate: guard SAMO ownerov auto-expense.
  -- Radnikov attribution nikad ne referencira own row iz project_worker_payouts.expense_id.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_worker_payouts
     WHERE expense_id = OLD.id
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'expenses: direct DELETE forbidden for owner payout expense (id=%). Use void_worker_payout RPC.', OLD.id
      USING ERRCODE = '42501';
  END IF;

  IF NEW.amount           IS DISTINCT FROM OLD.amount
     OR NEW.payment_source IS DISTINCT FROM OLD.payment_source
     OR NEW.event_at       IS DISTINCT FROM OLD.event_at
     OR NEW.date           IS DISTINCT FROM OLD.date
     OR NEW.deleted_at     IS DISTINCT FROM OLD.deleted_at
     OR NEW.worker_payout_id IS DISTINCT FROM OLD.worker_payout_id
     OR NEW.type           IS DISTINCT FROM OLD.type
  THEN
    RAISE EXCEPTION 'expenses: field mutation forbidden for owner payout expense (id=%). Use void_worker_payout RPC.', OLD.id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;