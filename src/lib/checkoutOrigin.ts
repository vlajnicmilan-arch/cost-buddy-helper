// Re-export from supabase/functions/_shared so the helper has a single source of truth
// (used by the create-checkout edge function) but is also testable via vitest
// which only scans src/.
export * from "../../supabase/functions/_shared/checkoutOrigin";
