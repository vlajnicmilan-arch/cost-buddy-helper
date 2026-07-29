/**
 * Feature flag za CentarNote vizual globalnih obavijesti (Faza 1 migracije).
 *
 * true  → StatusFeedback renderira CentarNote (novi vizual) i koristi
 *         CentarNote trajanja (error = 6s).
 * false → stari izgled i staro ponašanje u sekundi (rollback), bez ikakvih
 *         izmjena na pozivnim mjestima.
 */
import type { NoteModule } from '@/lib/notifyModule';

export const CENTAR_NOTE_ENABLED = true;

/** Fiksno trajanje greške u CentarNote vizualu (moduli bez sticky ponašanja). */
export const CENTAR_NOTE_ERROR_DURATION_MS = 6000;

/** Trajanje upozorenja (warning) — nikad sticky. */
export const CENTAR_NOTE_WARNING_DURATION_MS = 5000;

/**
 * Faza 2 (korak 1): moduli u kojima greška ostaje na ekranu dok korisnik
 * ne reagira (sticky). Prazna lista = Faza 1 ponašanje (sve greške 6s).
 * Širenje = 1 linija po modulu.
 */
export const STICKY_ERROR_MODULES: NoteModule[] = ['projects'];

/** Prozor unutar kojeg se identična poruka iste ozbiljnosti ne prikazuje ponovno. */
export const CENTAR_NOTE_DEDUP_WINDOW_MS = 2000;
