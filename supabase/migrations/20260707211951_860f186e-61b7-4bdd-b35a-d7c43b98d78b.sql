-- Attribution v1: radnik pripisuje isplatu svom izvoru plaćanja.
--
-- Cilj:
--  (1) omogućiti da radnikov `expenses` red bude vezan na payout (single) ILI
--      cijeli batch (worker_payout_batch_id NOVA kolona), i to najviše jednom
--      po radniku (race guard);
--  (2) exposeati whitelistan set podataka o payoutima RADNIKU (koji NE smije
--      čitati ownerov `project_worker_payouts` red kroz standardnu RLS)
--      preko SECURITY DEFINER RPC-a.
--
-- Nema promjena semantike balance triggera/recomputea; nema izmjena na
-- ownerovim payout tijekovima. Attribution write ide standardnim
-- addExpense putem (intent 'manual_entry'), samo s dodatnim FK poljima.

-- 1) Nova kolona za batch attribution.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS worker_payout_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_expenses_worker_payout_batch
  ON public.expenses(worker_payout_batch_id)
  WHERE worker_payout_batch_id IS NOT NULL;

-- 2) Race guard — najviše jedan attribution red po korisniku po payoutu.
--    Napomena: ownerov `create_worker_payout` također upisuje worker_payout_id
--    u ownerov expense (drugi user_id). Unique per (user_id, worker_payout_id)
--    dopušta i ownerov red i radnikov attribution red istovremeno.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_worker_payout
  ON public.expenses(user_id, worker_payout_id)
  WHERE worker_payout_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_worker_payout_batch
  ON public.expenses(user_id, worker_payout_batch_id)
  WHERE worker_payout_batch_id IS NOT NULL;

-- 3) SECURITY DEFINER RPC — radnik dohvaća whitelistane podatke o SVOJIM
--    dolaznim payoutima (single ili batch). Provjera vlasništva:
--    project_workers.user_id = auth.uid(). Nikad ne izlaže ownerov `note`,
--    `payment_source`, `voided_by`, `void_reason`.
CREATE OR REPLACE FUNCTION public.get_my_incoming_payouts(p_payout_ids uuid[])
RETURNS TABLE(
  payout_id uuid,
  batch_id uuid,
  project_id uuid,
  project_name text,
  period_start date,
  period_end date,
  gross_amount numeric,
  paid_amount numeric,
  paid_at timestamp with time zone,
  status text,
  hours_covered numeric,
  hourly_rate_snapshot numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pw.id,
    pw.batch_id,
    p.id,
    p.name,
    pw.period_start,
    pw.period_end,
    pw.gross_amount,
    pw.paid_amount,
    pw.paid_at,
    pw.status,
    pw.hours_covered,
    pw.hourly_rate_snapshot
  FROM public.project_worker_payouts pw
  JOIN public.project_workers w ON w.id = pw.worker_id
  JOIN public.projects p         ON p.id = pw.project_id
  WHERE pw.id = ANY(p_payout_ids)
    AND w.user_id = auth.uid();
$$;

REVOKE ALL     ON FUNCTION public.get_my_incoming_payouts(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_incoming_payouts(uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_my_incoming_payouts(uuid[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_incoming_payouts(uuid[]) TO service_role;