/**
 * Standardizirani payload za in-app obavijesti (zvono) i FCM push.
 *
 * Cilj: jedinstveni `{ route, highlight: { type, id, tab? }, fallback_route }`
 * neovisno o izvoru (DB jsonb ili FCM flat strings). `tab` polje omogućava
 * tab-aware highlight — npr. milestone → `phases`, invoice → `funding` —
 * tako da `ProjectFullScreenView` otvori ispravnu listu prije nego
 * `HighlightTarget` počne tražiti DOM marker.
 *
 * Legacy obavijesti bez `route` rade kroz `legacyResolve`.
 */

export type HighlightType =
  | 'expense'
  | 'milestone'
  | 'invoice'
  | 'reminder'
  | 'budget'
  | 'project'
  | 'payment_source'
  | 'pending_transaction'
  | 'app_update'
  | 'note';

export interface NormalizedHighlight {
  type: HighlightType;
  id: string;
  /** Optional target tab inside the destination route (e.g. ProjectFullScreenView). */
  tab?: string;
}

export interface NormalizedPayload {
  type: string | null;
  route: string | null;
  fallback_route: string | null;
  highlight: NormalizedHighlight | null;
  raw: Record<string, unknown>;
}

type RawData = Record<string, unknown> | null | undefined;

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const pickStr = (...vals: unknown[]): string | null => {
  for (const v of vals) if (isStr(v)) return v;
  return null;
};

/**
 * Backward-kompatibilno mapiranje starih notifikacija u standardni payload,
 * uključujući determinističku `tab` vrijednost za projekt-related tipove.
 */
function legacyResolve(type: string | null, d: Record<string, unknown>): {
  route: string | null;
  fallback_route: string | null;
  highlight: NormalizedHighlight | null;
} {
  if (!type) return { route: null, fallback_route: null, highlight: null };

  const projectId = pickStr(d.project_id, d.projectId);
  const expenseId = pickStr(d.expense_id, d.expenseId);
  const milestoneId = pickStr(d.milestone_id, d.milestoneId);
  const invoiceId = pickStr(d.invoice_id, d.invoiceId);
  const budgetId = pickStr(d.budget_id, d.budgetId);
  const paymentSourceId = pickStr(d.payment_source_id, d.paymentSourceId);
  const reminderId = pickStr(d.reminder_id, d.reminderId);
  const noteId = pickStr(d.note_id, d.noteId);

  switch (type) {
    case 'project_transaction':
      return {
        route: projectId ? `/projects?id=${projectId}` : '/projects',
        fallback_route: '/projects',
        highlight: expenseId
          ? { type: 'expense', id: expenseId, tab: 'transactions' }
          : null,
      };
    case 'note_added':
    case 'project_note_added':
      return {
        route: projectId ? `/projects?id=${projectId}` : '/projects',
        fallback_route: '/projects',
        highlight: noteId
          ? { type: 'note', id: noteId, tab: 'activity' }
          : expenseId
          ? { type: 'expense', id: expenseId, tab: 'transactions' }
          : null,
      };
    case 'project_activity':
    case 'project_member_joined':
      return {
        route: projectId ? `/projects?id=${projectId}` : '/projects',
        fallback_route: '/projects',
        highlight: projectId
          ? { type: 'project', id: projectId, tab: 'activity' }
          : null,
      };
    case 'milestone_deadline':
    case 'milestone_budget':
      return {
        route: projectId ? `/projects?id=${projectId}` : '/projects',
        fallback_route: '/projects',
        highlight: milestoneId
          ? { type: 'milestone', id: milestoneId, tab: 'phases' }
          : null,
      };
    case 'overdue_invoice':
      return {
        route: projectId ? `/projects?id=${projectId}` : '/projects',
        fallback_route: '/projects',
        highlight: invoiceId
          ? { type: 'invoice', id: invoiceId, tab: 'funding' }
          : null,
      };
    case 'project_loss_zone':
    case 'cashflow_risk':
      return {
        route: projectId ? `/projects?id=${projectId}` : '/projects',
        fallback_route: '/projects',
        highlight: projectId
          ? { type: 'project', id: projectId, tab: 'overview' }
          : null,
      };
    case 'budget_alert':
    case 'budget_burn':
      return {
        route: budgetId ? `/budgets?id=${budgetId}` : '/budgets',
        fallback_route: '/budgets',
        highlight: budgetId ? { type: 'budget', id: budgetId } : null,
      };
    case 'payment_source_transaction':
      return {
        route: paymentSourceId ? `/wallet?source=${paymentSourceId}` : '/wallet',
        fallback_route: '/wallet',
        highlight: expenseId
          ? { type: 'expense', id: expenseId }
          : paymentSourceId
          ? { type: 'payment_source', id: paymentSourceId }
          : null,
      };
    case 'pending_transaction':
    case 'pending_auto_rejected':
      return {
        route: '/',
        fallback_route: '/',
        highlight: expenseId ? { type: 'pending_transaction', id: expenseId } : null,
      };
    case 'participant_digest':
      return {
        route: projectId ? `/projects?id=${projectId}` : '/projects',
        fallback_route: '/projects',
        highlight: projectId
          ? { type: 'project', id: projectId, tab: 'activity' }
          : null,
      };
    case 'reminder':
    case 'calendar_event':
      return {
        route: '/calendar',
        fallback_route: '/calendar',
        highlight: reminderId ? { type: 'reminder', id: reminderId } : null,
      };
    case 'app_update':
      return {
        route: '/install',
        fallback_route: '/install',
        highlight: null,
      };
    default:
      return { route: null, fallback_route: null, highlight: null };
  }
}

/**
 * Normalizira ulaz iz baze (jsonb) ili FCM (flat strings) u jedinstveni payload.
 * Nikad ne baca — ako podaci nedostaju, vraća null u relevantnim poljima.
 */
export function normalizePayload(
  type: string | null | undefined,
  data: RawData,
): NormalizedPayload {
  const d: Record<string, unknown> = (data && typeof data === 'object') ? data : {};
  const resolvedType = isStr(type) ? type : (isStr(d.type) ? (d.type as string) : null);

  const directRoute = pickStr(d.route);
  const directFallback = pickStr(d.fallback_route);

  // Highlight may arrive as nested object (DB) or flat fields (FCM).
  let highlight: NormalizedHighlight | null = null;
  const nested = d.highlight as Record<string, unknown> | undefined;
  if (nested && typeof nested === 'object') {
    const ht = pickStr(nested.type) as HighlightType | null;
    const hid = pickStr(nested.id);
    const htab = pickStr(nested.tab) ?? undefined;
    if (ht && hid) highlight = htab ? { type: ht, id: hid, tab: htab } : { type: ht, id: hid };
  }
  if (!highlight) {
    const ht = pickStr(d.highlight_type) as HighlightType | null;
    const hid = pickStr(d.highlight_id);
    const htab = pickStr(d.highlight_tab) ?? undefined;
    if (ht && hid) highlight = htab ? { type: ht, id: hid, tab: htab } : { type: ht, id: hid };
  }

  if (directRoute || highlight) {
    return {
      type: resolvedType,
      route: directRoute,
      fallback_route: directFallback ?? directRoute,
      highlight,
      raw: d,
    };
  }

  const legacy = legacyResolve(resolvedType, d);
  return {
    type: resolvedType,
    route: legacy.route,
    fallback_route: legacy.fallback_route,
    highlight: legacy.highlight,
    raw: d,
  };
}
