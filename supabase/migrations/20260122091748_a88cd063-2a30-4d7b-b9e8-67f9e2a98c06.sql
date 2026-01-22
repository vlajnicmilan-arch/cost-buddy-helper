-- Create income_sources table
CREATE TABLE public.income_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '💰',
  color TEXT DEFAULT '#22c55e',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own income sources"
ON public.income_sources FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own income sources"
ON public.income_sources FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own income sources"
ON public.income_sources FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own income sources"
ON public.income_sources FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_income_sources_updated_at
BEFORE UPDATE ON public.income_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add income_source_id column to expenses table (nullable for existing records)
ALTER TABLE public.expenses 
ADD COLUMN income_source_id UUID REFERENCES public.income_sources(id) ON DELETE SET NULL;