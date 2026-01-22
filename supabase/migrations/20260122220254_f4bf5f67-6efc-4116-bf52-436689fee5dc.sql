-- Add balance column to custom payment sources
ALTER TABLE public.custom_payment_sources 
ADD COLUMN balance NUMERIC NOT NULL DEFAULT 0;

-- Add description/note column for additional info
ALTER TABLE public.custom_payment_sources 
ADD COLUMN description TEXT;