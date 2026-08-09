-- Normalizacija "zombi" entitlementa: redovi kojima je razdoblje isteklo,
-- a status je i dalje 'active'. Razrješavanje pristupa (has_entitlement +
-- check-subscription) VEĆ gleda period_end, pa je ovo higijena podataka koja
-- uklanja pogrešno čitanje iz admin sučelja i izvještaja.
UPDATE public.user_entitlements
SET status = 'expired'
WHERE status = 'active'
  AND period_end IS NOT NULL
  AND period_end < now();