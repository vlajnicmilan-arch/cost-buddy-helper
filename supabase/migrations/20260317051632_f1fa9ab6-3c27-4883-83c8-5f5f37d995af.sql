
ALTER TABLE public.project_collaborators 
ADD COLUMN paid_amount NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.project_collaborators.total_price IS 'Dogovoreni iznos - za projekcije i predviđene troškove';
COMMENT ON COLUMN public.project_collaborators.paid_amount IS 'Isplaćeni iznos - utječe na stvarne obračune';
