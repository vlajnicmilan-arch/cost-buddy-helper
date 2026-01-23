-- Create table for transaction notes/comments
CREATE TABLE public.transaction_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transaction_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view notes on transactions they can access
CREATE POLICY "Users can view notes on accessible transactions"
ON public.transaction_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = transaction_notes.expense_id
    AND (
      e.user_id = auth.uid() 
      OR (e.income_source_id IS NOT NULL AND is_income_source_member(e.income_source_id, auth.uid()))
    )
  )
);

-- Policy: Users can add notes to transactions they can access
CREATE POLICY "Users can add notes to accessible transactions"
ON public.transaction_notes
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = transaction_notes.expense_id
    AND (
      e.user_id = auth.uid() 
      OR (e.income_source_id IS NOT NULL AND is_income_source_member(e.income_source_id, auth.uid()))
    )
  )
);

-- Policy: Users can delete their own notes
CREATE POLICY "Users can delete their own notes"
ON public.transaction_notes
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_transaction_notes_expense_id ON public.transaction_notes(expense_id);
CREATE INDEX idx_transaction_notes_user_id ON public.transaction_notes(user_id);