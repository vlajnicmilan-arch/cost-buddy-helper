/**
 * Eksplicitna tablica: tip krug obavijesti → odredište u aplikaciji.
 *
 * Jedini izvor istine za dubinsku navigaciju iz zvona i native push tapa.
 * Svaki `krug_*` tip koji `supabase/functions/notify-krug-event` može emitirati
 * MORA imati unos ovdje — čuvar test (`krugNotificationRoutes.test.ts`) pada
 * ako se pojavi novi tip bez odredišta.
 *
 * Odredišta:
 *  - `expense`     → `/krug?id=<krug>&expense=<expense>`  (pregled transakcije)
 *  - `settlement`  → `/krug?id=<krug>&settlement=<ledger>` (povijest podmirenja)
 *  - `krug`        → `/krug?id=<krug>`                     (ekran tog Kruga)
 *  - `list`        → `/krug`                               (Krug je obrisan)
 *
 * Pravilo degradacije: ako specifični id nedostaje (obrisan trošak, stari
 * zapis bez reference), pada se na ekran Kruga — nikad na generični popis
 * ako `krug_id` postoji, i nikad na grešku.
 */
import type { NormalizedHighlight } from './notificationPayload';

export type KrugNotificationType =
  | 'krug_member_added'
  | 'krug_invited'
  | 'krug_invitation_accepted'
  | 'krug_invitation_declined'
  | 'krug_member_left'
  | 'krug_owner_left'
  | 'krug_ownership_received'
  | 'krug_membership_notice'
  | 'krug_expense_proposed'
  | 'krug_expense_confirmed'
  | 'krug_expense_rejected'
  | 'krug_deletion_requested'
  | 'krug_deleted'
  | 'krug_settlement_marked_settled'
  | 'krug_settlement_voided'
  | 'krug_settlement_reminder'
  | 'krug_override_proposed'
  | 'krug_override_confirmed'
  | 'krug_override_rejected';

export type KrugDestinationKind = 'expense' | 'settlement' | 'krug' | 'list';

export const KRUG_NOTIFICATION_DESTINATIONS: Record<KrugNotificationType, KrugDestinationKind> = {
  // Prijedlog / odluka o trošku → pregled te transakcije.
  krug_expense_proposed: 'expense',
  krug_expense_confirmed: 'expense',
  krug_expense_rejected: 'expense',
  // Prijedlog / odluka o ručnoj podjeli → ista transakcija (panel podjele).
  krug_override_proposed: 'expense',
  krug_override_confirmed: 'expense',
  krug_override_rejected: 'expense',
  // Podmirenje → povijest podmirenja s tim zapisom.
  krug_settlement_marked_settled: 'settlement',
  krug_settlement_voided: 'settlement',
  // Podsjetnik nema konkretan zapis → ekran Kruga.
  krug_settlement_reminder: 'krug',
  // Članstvo / pozivnice / brisanje → ekran tog Kruga.
  krug_member_added: 'krug',
  krug_invited: 'krug',
  krug_invitation_accepted: 'krug',
  krug_invitation_declined: 'krug',
  krug_member_left: 'krug',
  krug_owner_left: 'krug',
  krug_ownership_received: 'krug',
  krug_membership_notice: 'krug',
  krug_deletion_requested: 'krug',
  // Krug više ne postoji — deep link na njega bi bio slijepa ulica.
  krug_deleted: 'list',
};

export const KRUG_NOTIFICATION_TYPES = Object.keys(
  KRUG_NOTIFICATION_DESTINATIONS,
) as KrugNotificationType[];

export function isKrugNotificationType(t: string | null | undefined): t is KrugNotificationType {
  return !!t && Object.prototype.hasOwnProperty.call(KRUG_NOTIFICATION_DESTINATIONS, t);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

/**
 * Settlement ledger id ne putuje kao zaseban field — RPC-ovi ga kodiraju u
 * `dedup_ref` (`settled:<uuid>` / `voided:<uuid>`). Podržavamo i eksplicitni
 * `settlement_id` ako ga budući emitter doda.
 */
export function extractSettlementId(d: Record<string, unknown>): string | null {
  const direct = str(d.settlement_id) ?? str(d.ledger_id);
  if (direct) return direct;
  const ref = str(d.dedup_ref);
  if (!ref) return null;
  if (!/^(settled|voided):/.test(ref)) return null;
  const m = ref.match(UUID_RE);
  return m ? m[0] : null;
}

export interface KrugResolution {
  route: string;
  fallback_route: string;
  highlight: NormalizedHighlight | null;
}

/**
 * Vrati odredište za krug obavijest. `null` ako tip nije krug tip.
 */
export function resolveKrugNotification(
  type: string | null | undefined,
  data: Record<string, unknown> | null | undefined,
): KrugResolution | null {
  if (!isKrugNotificationType(type)) return null;
  const d = data && typeof data === 'object' ? data : {};
  const krugId = str(d.krug_id) ?? str((d as any).krugId);
  const kind = KRUG_NOTIFICATION_DESTINATIONS[type];

  const krugRoute = krugId ? `/krug?id=${krugId}` : '/krug';
  const krugHighlight: NormalizedHighlight | null = krugId
    ? { type: 'krug', id: krugId }
    : null;

  if (kind === 'list') {
    return { route: '/krug', fallback_route: '/krug', highlight: null };
  }

  if (kind === 'expense') {
    const expenseId = str(d.expense_id) ?? str((d as any).expenseId);
    if (krugId && expenseId) {
      return {
        route: `/krug?id=${krugId}&expense=${expenseId}`,
        fallback_route: krugRoute,
        highlight: { type: 'expense', id: expenseId },
      };
    }
    return { route: krugRoute, fallback_route: '/krug', highlight: krugHighlight };
  }

  if (kind === 'settlement') {
    const settlementId = extractSettlementId(d);
    if (krugId && settlementId) {
      return {
        route: `/krug?id=${krugId}&settlement=${settlementId}`,
        fallback_route: krugRoute,
        highlight: { type: 'settlement', id: settlementId },
      };
    }
    return { route: krugRoute, fallback_route: '/krug', highlight: krugHighlight };
  }

  return { route: krugRoute, fallback_route: '/krug', highlight: krugHighlight };
}

/**
 * Server (`notify-krug-event`) upisuje generičku rutu `/krug` ili
 * `/krug?id=<uuid>` u `data.route`. Ta ruta NIJE korisnička namjera nego MVP
 * default — smijemo je nadjačati preciznijom. Svaku drugu (ručno postavljenu)
 * rutu poštujemo doslovno.
 */
export function isGenericKrugRoute(route: string | null, krugId: string | null): boolean {
  if (!route) return true;
  if (route === '/krug') return true;
  if (krugId && route === `/krug?id=${krugId}`) return true;
  return false;
}
