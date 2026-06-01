-- ============================================================
-- Family transaction reactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.family_transaction_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, expense_id, author_user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_family_tx_reactions_expense
  ON public.family_transaction_reactions (expense_id);
CREATE INDEX IF NOT EXISTS idx_family_tx_reactions_group
  ON public.family_transaction_reactions (group_id);

GRANT SELECT, INSERT, DELETE ON public.family_transaction_reactions TO authenticated;
GRANT ALL ON public.family_transaction_reactions TO service_role;

ALTER TABLE public.family_transaction_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can read reactions"
  ON public.family_transaction_reactions FOR SELECT TO authenticated
  USING (public.is_family_member(group_id, auth.uid()));

CREATE POLICY "Author can insert own reaction"
  ON public.family_transaction_reactions FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND public.is_family_member(group_id, auth.uid())
  );

CREATE POLICY "Author can delete own reaction"
  ON public.family_transaction_reactions FOR DELETE TO authenticated
  USING (author_user_id = auth.uid());

-- ============================================================
-- Family transaction comments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.family_transaction_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_family_tx_comments_expense
  ON public.family_transaction_comments (expense_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_family_tx_comments_group
  ON public.family_transaction_comments (group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_transaction_comments TO authenticated;
GRANT ALL ON public.family_transaction_comments TO service_role;

ALTER TABLE public.family_transaction_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can read comments"
  ON public.family_transaction_comments FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.is_family_member(group_id, auth.uid())
  );

CREATE POLICY "Author can insert own comment"
  ON public.family_transaction_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND public.is_family_member(group_id, auth.uid())
  );

CREATE POLICY "Author can update own comment"
  ON public.family_transaction_comments FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

CREATE POLICY "Author can delete own comment"
  ON public.family_transaction_comments FOR DELETE TO authenticated
  USING (author_user_id = auth.uid());

CREATE TRIGGER trg_family_tx_comments_updated
  BEFORE UPDATE ON public.family_transaction_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Notification prefs: family override + reactions push
-- ============================================================
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS family_override_push boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS family_reactions_push boolean NOT NULL DEFAULT false;
