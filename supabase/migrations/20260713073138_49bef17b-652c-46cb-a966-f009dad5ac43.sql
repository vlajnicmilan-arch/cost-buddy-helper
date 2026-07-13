-- Replay-prod convergence: no-op on production; ensures local CI replay
-- (supabase start in stress-smoke) gets the same broad table privileges
-- that the managed prod instance grants by default. Historical migrations
-- omitted per-table GRANTs; this single migration converges the chain.
-- Idempotent: repeated GRANTs are no-ops. anon is intentionally untouched.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Cover sequences too (needed for INSERTs with serial/identity via authenticated).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables created by the postgres role inherit these defaults.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;