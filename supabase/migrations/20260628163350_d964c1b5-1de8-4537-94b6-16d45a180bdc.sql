
-- Relax NOT NULL on event_at; the BEFORE INSERT trigger guarantees population.
-- This keeps the generated Insert types backwards-compatible with existing writers.
ALTER TABLE public.expenses ALTER COLUMN event_at DROP NOT NULL;
