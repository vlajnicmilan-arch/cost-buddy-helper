-- Create a table for payment source cards
CREATE TABLE public.payment_source_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_source_id UUID NOT NULL REFERENCES public.custom_payment_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  card_name TEXT NOT NULL DEFAULT 'Kartica',
  last_four_digits TEXT NOT NULL,
  card_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.payment_source_cards ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own cards" 
ON public.payment_source_cards 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cards" 
ON public.payment_source_cards 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cards" 
ON public.payment_source_cards 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cards" 
ON public.payment_source_cards 
FOR DELETE 
USING (auth.uid() = user_id);