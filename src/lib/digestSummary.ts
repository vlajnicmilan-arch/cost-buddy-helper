// Re-export from supabase/functions/_shared so the digest body composer has a
// single source of truth (used by flush-participant-digest) while staying
// testable via vitest, which only scans src/.
export * from "../../supabase/functions/flush-participant-digest/digestSummary";
