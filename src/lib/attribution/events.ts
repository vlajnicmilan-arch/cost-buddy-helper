/**
 * Attribution custom events — most jedne strane bell dropdown / native push
 * intercept a AttributionSheetHost. Bez query/route promjene: sheet je overlay
 * koji se otvara nad trenutnom rutom.
 *
 * Payload dolazi izravno iz `notifications.data` koji piše
 * `enqueue_worker_payout_notifications` (payout_ids, batch_id,
 * project_names, paid_amount_total, action).
 */

export const ATTRIBUTION_OPEN_EVENT = 'vmb:attribution-open';

export type AttributionAction = 'created' | 'voided';

export interface AttributionOpenPayload {
  action: AttributionAction;
  payoutIds: string[];
  batchId: string | null;
  projectNames: string[];
  paidAmountTotal: number | null;
  /**
   * WS2 / Faza 2.1 — snapshot postojećih source ID-eva u trenutku kad je
   * korisnik krenuo dodavati novi izvor iz empty-state CTA-a. Nakon što
   * host resumira sheet, prvi source čiji ID nije u ovom setu se automatski
   * predselektira. Nedostupno u standardnoj (bell/push) putanji.
   */
  preSourceIds?: string[];
}

export function dispatchAttributionOpen(payload: AttributionOpenPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AttributionOpenPayload>(ATTRIBUTION_OPEN_EVENT, { detail: payload }),
  );
}

/**
 * Sigurno parsiranje `notifications.data` iz workerPayoutCreated/Voided u
 * AttributionOpenPayload. Vraća null ako obavijest ne sadrži barem 1 payout_id.
 */
export function parseAttributionPayload(
  action: AttributionAction,
  data: unknown,
): AttributionOpenPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const rawIds = d.payout_ids;
  const payoutIds: string[] = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  if (payoutIds.length === 0) return null;

  const batchId = typeof d.batch_id === 'string' && d.batch_id.length > 0 ? d.batch_id : null;
  const rawNames = d.project_names;
  const projectNames: string[] = Array.isArray(rawNames)
    ? rawNames.filter((x): x is string => typeof x === 'string')
    : [];
  const totalRaw = d.paid_amount_total;
  const paidAmountTotal =
    typeof totalRaw === 'number'
      ? totalRaw
      : typeof totalRaw === 'string' && !Number.isNaN(Number(totalRaw))
        ? Number(totalRaw)
        : null;

  return { action, payoutIds, batchId, projectNames, paidAmountTotal };
}
