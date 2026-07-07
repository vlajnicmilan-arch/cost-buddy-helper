-- PR-A hardening: idempotent re-REVOKE EXECUTE FROM anon za payout RPC-e.
-- Slijedi obrazac iz mem://architecture/security-definer-anon-revoke.

REVOKE EXECUTE ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_worker_payout(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_work_entry(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_locked_work_entry(uuid,numeric,text,text) FROM anon;