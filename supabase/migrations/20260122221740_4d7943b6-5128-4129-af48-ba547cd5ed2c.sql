-- Add payment_source_card_id column to expenses table
ALTER TABLE public.expenses 
ADD COLUMN payment_source_card_id uuid REFERENCES public.payment_source_cards(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX idx_expenses_payment_source_card_id ON public.expenses(payment_source_card_id);