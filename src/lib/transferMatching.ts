/**
 * Transfer source resolution helpers.
 *
 * In this app, a transfer between two accounts is stored as a SINGLE row in
 * `expenses` with:
 *   - type: 'transfer'
 *   - payment_source / payment_source_card_id  → SOURCE account (from)
 *   - income_source_id                          → DESTINATION account (to)
 *
 * These helpers resolve human-readable info (name, icon, color) for both
 * endpoints, supporting standard payment sources, custom payment sources,
 * and individual cards within a custom payment source.
 */

import { Expense, getPaymentSourceInfo, PAYMENT_SOURCES } from '@/types/expense';

export interface TransferEndpointInfo {
  name: string;
  icon: string;
  color?: string;
  cardLast4?: string;
}

export interface ResolvedTransfer {
  from: TransferEndpointInfo;
  to: TransferEndpointInfo;
}

interface CustomSourceLike {
  id: string;
  name: string;
  icon: string;
  color: string;
  cards?: Array<{ id: string; last_four_digits: string; card_name?: string | null }>;
}

/**
 * Resolves a single endpoint (source or destination) given an id-like value
 * (standard PaymentSource enum value, custom source UUID, "custom:UUID" prefix,
 * or a card id) plus the list of custom payment sources.
 */
const resolveEndpoint = (
  sourceId: string | null | undefined,
  cardId: string | null | undefined,
  customSources: CustomSourceLike[]
): TransferEndpointInfo => {
  // Card id wins — find the parent custom source for icon/color
  if (cardId) {
    for (const s of customSources) {
      const card = s.cards?.find((c) => c.id === cardId);
      if (card) {
        return {
          name: card.card_name || s.name,
          icon: s.icon,
          color: s.color,
          cardLast4: card.last_four_digits,
        };
      }
    }
  }

  if (sourceId) {
    // Direct custom source match
    let custom = customSources.find((s) => s.id === sourceId);
    if (!custom && sourceId.startsWith('custom:')) {
      const uuid = sourceId.replace('custom:', '');
      custom = customSources.find((s) => s.id === uuid);
    }
    if (custom) {
      return { name: custom.name, icon: custom.icon, color: custom.color };
    }

    // Standard payment source
    if (PAYMENT_SOURCES.some((p) => p.id === sourceId)) {
      const info = getPaymentSourceInfo(sourceId as any);
      return { name: info.name, icon: info.icon };
    }
  }

  // Fallback
  const fallback = getPaymentSourceInfo('cash');
  return { name: fallback.name, icon: fallback.icon };
};

/**
 * Resolve "from → to" info for a transfer row.
 * Returns null if the row is not a transfer.
 */
export const resolveTransferEndpoints = (
  expense: Expense,
  customSources: CustomSourceLike[]
): ResolvedTransfer | null => {
  if (expense.type !== 'transfer') return null;

  const from = resolveEndpoint(
    expense.payment_source ?? null,
    expense.payment_source_card_id ?? null,
    customSources
  );

  // Destination is stored in income_source_id (despite the name — for transfers
  // it points to the destination payment source/account, not an income source).
  const to = resolveEndpoint(
    expense.income_source_id ?? null,
    null,
    customSources
  );

  return { from, to };
};
