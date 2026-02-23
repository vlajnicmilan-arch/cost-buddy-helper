-- Performance indexes for scalability

-- Expenses: most queried table
CREATE INDEX IF NOT EXISTS idx_expenses_user_id_date ON public.expenses (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id_type ON public.expenses (user_id, type);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_source ON public.expenses (payment_source) WHERE payment_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON public.expenses (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_budget_id ON public.expenses (budget_id) WHERE budget_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_income_source_id ON public.expenses (income_source_id) WHERE income_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_import_batch_id ON public.expenses (import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Login logs: queried by admin and for active user stats
CREATE INDEX IF NOT EXISTS idx_login_logs_user_logged ON public.user_login_logs (user_id, logged_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_logged_at ON public.user_login_logs (logged_in_at DESC);

-- Referrals
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals (referred_user_id);

-- Profiles lookup
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read, created_at DESC);

-- Recurring transactions
CREATE INDEX IF NOT EXISTS idx_recurring_user_active ON public.recurring_transactions (user_id, is_active);

-- Project members
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members (user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members (project_id);

-- Budget members
CREATE INDEX IF NOT EXISTS idx_budget_members_user ON public.budget_members (user_id);
CREATE INDEX IF NOT EXISTS idx_budget_members_budget ON public.budget_members (budget_id);

-- Family members
CREATE INDEX IF NOT EXISTS idx_family_members_user ON public.family_members (user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_group ON public.family_members (group_id);

-- Payment source members
CREATE INDEX IF NOT EXISTS idx_ps_members_user ON public.payment_source_members (user_id);
CREATE INDEX IF NOT EXISTS idx_ps_members_source ON public.payment_source_members (payment_source_id);

-- Auto-cleanup: delete login logs older than 90 days
CREATE OR REPLACE FUNCTION public.cleanup_old_login_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.user_login_logs
  WHERE logged_in_at < now() - interval '90 days';
END;
$$;

-- Create a trigger that runs cleanup on every 100th insert
CREATE OR REPLACE FUNCTION public.maybe_cleanup_login_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Run cleanup approximately every 100 inserts (1% chance per insert)
  IF random() < 0.01 THEN
    PERFORM public.cleanup_old_login_logs();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cleanup_login_logs ON public.user_login_logs;
CREATE TRIGGER trigger_cleanup_login_logs
  AFTER INSERT ON public.user_login_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.maybe_cleanup_login_logs();