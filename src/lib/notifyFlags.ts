/**
 * Feature flag za CentarNote vizual globalnih obavijesti (Faza 1 migracije).
 *
 * true  → StatusFeedback renderira CentarNote (novi vizual) i koristi
 *         CentarNote trajanja (error = 6s).
 * false → stari izgled i staro ponašanje u sekundi (rollback), bez ikakvih
 *         izmjena na pozivnim mjestima.
 */
export const CENTAR_NOTE_ENABLED = true;

/** Fiksno trajanje greške u CentarNote vizualu (Faza 1: bez sticky). */
export const CENTAR_NOTE_ERROR_DURATION_MS = 6000;
