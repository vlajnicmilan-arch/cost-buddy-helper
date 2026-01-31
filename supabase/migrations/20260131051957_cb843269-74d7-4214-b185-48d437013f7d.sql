-- Add foreign key relationship between project_funding and income_sources
ALTER TABLE public.project_funding
ADD CONSTRAINT project_funding_income_source_id_fkey 
FOREIGN KEY (income_source_id) 
REFERENCES public.income_sources(id) 
ON DELETE CASCADE;