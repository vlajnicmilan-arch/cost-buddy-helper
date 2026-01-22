-- Create receipt_items table for storing individual items from receipts
CREATE TABLE public.receipt_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 1,
  unit_price NUMERIC,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on receipt_items
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for receipt_items (inherit access from parent expense)
CREATE POLICY "Users can view their own receipt items" 
ON public.receipt_items 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.expenses 
    WHERE expenses.id = receipt_items.expense_id 
    AND expenses.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create receipt items for their expenses" 
ON public.receipt_items 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expenses 
    WHERE expenses.id = receipt_items.expense_id 
    AND expenses.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own receipt items" 
ON public.receipt_items 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.expenses 
    WHERE expenses.id = receipt_items.expense_id 
    AND expenses.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own receipt items" 
ON public.receipt_items 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.expenses 
    WHERE expenses.id = receipt_items.expense_id 
    AND expenses.user_id = auth.uid()
  )
);

-- Add index for faster lookups
CREATE INDEX idx_receipt_items_expense_id ON public.receipt_items(expense_id);