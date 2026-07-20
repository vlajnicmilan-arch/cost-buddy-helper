/**
 * Globalni feature flagovi.
 *
 * KORAK 4 (executor) — IMPORT_FROZEN je uklonjen.
 * PDF/HTML uvoz sada radi kroz Import Review executor (upisuje u expenses).
 *
 * Stari pathovi ostaju blokirani lokalnim flagovima dok ne prođu isti
 * review postupak (Korak 5+):
 *
 * - CSV_IMPORT_ENABLED — stari CSVImportDialog write path.
 * - MANUAL_MERGE_ENABLED — manual ↔ bank Spoji (useManualBankMerge).
 */
export const CSV_IMPORT_ENABLED = false;
export const MANUAL_MERGE_ENABLED = false;
