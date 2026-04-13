
ALTER TABLE public.time_clock_entries
  ADD COLUMN regular_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN overtime_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN night_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN sunday_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN holiday_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN standby_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN field_hours numeric NOT NULL DEFAULT 0;
