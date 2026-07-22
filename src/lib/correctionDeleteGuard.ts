/**
 * Correction Delete Guard — zaštita brisanja korisničke "Korekcije salda".
 *
 * Kontekst (22.7.2026): red o korekciji salda (`expense_nature='correction'`)
 * je audit-zapis o sidru novčanika. Sidro (anchor) je jedina istina —
 * brisanjem correction reda saldo se NE mijenja, ali gubi se povijesni zapis
 * o tome kad je korisnik postavio sidro. Zato UI zahtijeva zaseban confirm
 * dijalog za pojedinačno brisanje i cijeli bulk automatski preskače.
 *
 * Ovaj modul je čisti pub/sub — Host komponenta (mounted u App root-u)
 * subscribea na trenutni request i prikazuje AlertDialog. React-slobodan
 * dio (`confirmCorrectionDelete`, `CorrectionInBulkError`, telemetrija) je
 * unit-testabilan bez ikakvog DOM-a.
 */

import { supabase } from '@/integrations/supabase/client';

export const CORRECTION_NATURE = 'correction' as const;

/** Bacena iz `deleteExpense({ silent: true })` kad naiđe na correction red. */
export class CorrectionInBulkError extends Error {
  readonly code = 'correction_in_bulk' as const;
  readonly expenseId: string;
  constructor(expenseId: string) {
    super('correction_in_bulk');
    this.name = 'CorrectionInBulkError';
    this.expenseId = expenseId;
  }
}

export function isCorrectionInBulkError(e: unknown): e is CorrectionInBulkError {
  return e instanceof CorrectionInBulkError
    || (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'correction_in_bulk');
}

export interface CorrectionDeleteRequestPayload {
  readonly expenseId: string;
  readonly description: string | null;
  readonly amount: number | null;
  readonly paymentSourceLabel?: string | null;
}

interface PendingRequest extends CorrectionDeleteRequestPayload {
  readonly resolve: (accepted: boolean) => void;
}

type Listener = (req: PendingRequest | null) => void;

const listeners = new Set<Listener>();
let current: PendingRequest | null = null;

export function subscribeCorrectionDeleteRequests(cb: Listener): () => void {
  listeners.add(cb);
  cb(current);
  return () => { listeners.delete(cb); };
}

export function getCurrentCorrectionDeleteRequest(): PendingRequest | null {
  return current;
}

/**
 * Otvara confirm dijalog za brisanje correction reda. Vraća true ako je
 * korisnik potvrdio brisanje, false ako je odustao ili zatvorio dijalog.
 *
 * Ako je već otvoren neki drugi request, prethodni se automatski odbacuje
 * kao "cancelled" (rijetka race situacija — dvostruki tap).
 */
export function confirmCorrectionDelete(
  payload: CorrectionDeleteRequestPayload,
): Promise<boolean> {
  if (current) {
    const prev = current;
    current = null;
    listeners.forEach(l => l(null));
    prev.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    current = { ...payload, resolve };
    listeners.forEach(l => l(current));
  });
}

/** Interno — host komponenta poziva ovo kad korisnik potvrdi/odustane. */
export function _resolveCurrentCorrectionDelete(accepted: boolean): void {
  const req = current;
  if (!req) return;
  current = null;
  listeners.forEach(l => l(null));
  req.resolve(accepted);
  emitTelemetry(
    accepted ? 'correction_delete_confirmed' : 'correction_delete_cancelled',
    { expenseId: req.expenseId },
  ).catch(() => {});
}

/**
 * Diagnostics event — best-effort insert u `app_diagnostics_logs`. Ako
 * korisnik nije prijavljen, insert samo pukne (RLS) i mi ga ignoriramo:
 * telemetrija je nice-to-have, nikad se ne smije rušiti UX brisanja.
 */
async function emitTelemetry(
  event: 'correction_delete_confirmed' | 'correction_delete_cancelled' | 'correction_delete_bulk_skipped',
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from('app_diagnostics_logs').insert([{
      event,
      details: details as never,
      user_id: userId,
      session_id: 'correction-guard',
    }]);

  } catch {
    // silent
  }
}

/** Za bulk-put — poziva se jednom po bulk operaciji s brojem preskočenih. */
export function emitBulkCorrectionsSkipped(count: number, batchIds: string[]): void {
  if (count <= 0) return;
  emitTelemetry('correction_delete_bulk_skipped', { count, sample_ids: batchIds.slice(0, 5) })
    .catch(() => {});
}
