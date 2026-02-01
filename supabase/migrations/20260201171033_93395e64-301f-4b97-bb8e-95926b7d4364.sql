-- Add sort_order column to custom_payment_sources for drag-and-drop reordering
ALTER TABLE public.custom_payment_sources 
ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Set initial sort_order based on created_at (oldest first = 0, 1, 2...)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) - 1 as rn
  FROM public.custom_payment_sources
)
UPDATE public.custom_payment_sources
SET sort_order = ranked.rn
FROM ranked
WHERE public.custom_payment_sources.id = ranked.id;