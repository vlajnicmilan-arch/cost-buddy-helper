/**
 * History gate — odlučuje SMIJE li uvezeni izvod uopće tražiti odluku o saldu.
 *
 * Problem koji rješava: sidro se prije vezalo za trenutak klika (`now()`),
 * a uspoređivalo se s bankinim završnim saldom uvezenog izvoda. Kod uvoza
 * povijesti ta dva broja se nikad ne poklope, pa je aplikacija tražila odluku
 * na svakom izvodu — a nijedan odgovor nije točan dok povijest nije cijela.
 *
 * Pravila:
 *   1. `as_of` za sidro = timestamp ZADNJEG retka uvezenog izvoda za taj izvor
 *      (`batchLastAt`), nikad `now()`.
 *   2. Povijesni izvod (zadnji redak pada na dan sidra ili prije) NE pita ništa:
 *      sidro se ne dira, saldo se ne mijenja, korisnik dobije tihu poruku.
 *   3. Samo izvod koji završava POSLIJE sidra usklađuje, i novo sidro dobiva
 *      datum tog zadnjeg retka.
 *
 * Čisti modul bez Supabase ovisnosti — testiran u src/test/reconciliationHistoryGate.test.ts.
 */

/** Minimalni oblik koji gate treba (podskup ReconciliationSummaryEntry). */
export interface HistoryGateInput {
  readonly hasBankRow: boolean;
  readonly delta: number | null;
  readonly anchorDate?: string | null;
  readonly batchLastAt?: string | null;
  readonly isHistorical?: boolean;
}

export const RECON_DELTA_THRESHOLD = 0.01;

/** UTC kalendarski dan (YYYY-MM-DD) iz ISO timestampa. */
const utcDay = (iso: string): string => new Date(iso).toISOString().slice(0, 10);

/**
 * Je li batch povijesni: zadnji redak pada na dan sidra ili prije njega.
 * Bez sidra ili bez retka s datumom → nije povijesni (ponaša se kao dosad).
 * Kad DB već izračuna `is_historical`, ta vrijednost ima prednost.
 */
export function isHistoricalBatch(entry: HistoryGateInput): boolean {
  if (typeof entry.isHistorical === 'boolean') return entry.isHistorical;
  if (!entry.anchorDate || !entry.batchLastAt) return false;
  return utcDay(entry.batchLastAt) <= utcDay(entry.anchorDate);
}

/**
 * Traži li ovaj izvod odluku korisnika.
 * Povijesni izvod nikad ne traži — razlika je tada očekivana i nerješiva.
 */
export function shouldReconcile(entry: HistoryGateInput): boolean {
  if (!entry.hasBankRow) return false;
  if (entry.delta === null) return false;
  if (Math.abs(entry.delta) <= RECON_DELTA_THRESHOLD) return false;
  return !isHistoricalBatch(entry);
}

/**
 * Informativna napomena za povijesni izvod (točka 4): razlika se javlja,
 * ali kao podatak, ne kao pitanje.
 */
export function isHistoricalWithGap(entry: HistoryGateInput): boolean {
  if (!isHistoricalBatch(entry)) return false;
  if (!entry.hasBankRow || entry.delta === null) return false;
  return Math.abs(entry.delta) > RECON_DELTA_THRESHOLD;
}

/**
 * `as_of` koji ide u `align_source_to_bank`: timestamp zadnjeg retka izvoda.
 * Fallback na `now` samo ako batch nema nijedan redak s datumom.
 */
export function resolveAsOfIso(entry: HistoryGateInput, fallbackIso: string): string {
  return entry.batchLastAt ?? fallbackIso;
}
