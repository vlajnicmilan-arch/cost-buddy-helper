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

/**
 * BRIEF-VRATA (V1) — kill switch na razini builda.
 *
 * Drugi sloj je po-korisnički: RPC `brief_gate_snapshot()` vraća
 * `enabled:false` svima koji nisu na admin popisu
 * (`app_settings.key = 'brief_gate_user_ids'`).
 * Treći sloj je korisnikov prekidač u postavkama (lokalno na uređaju).
 *
 * Postavi na `false` da se vrata ugase globalno u sekundi (boot ostaje
 * bajt-identičan stanju prije vrata).
 */
export const BRIEF_GATE_ENABLED = false;

