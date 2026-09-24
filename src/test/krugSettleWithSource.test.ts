import { describe, it, expect } from 'vitest';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import {
  canSubmitSettle, convertBySnapshot, isAwaitingReceipt, KRUG_SETTLE_ERROR_CODES,
  krugSettleErrorKey, needsPayerAmount, resolveKrugSettleErrorCode, writableSettleSources,
} from '@/lib/krugSettleWithSource';

describe('krug settle with source — pure rules', () => {
  it('offers only writable sources (viewer and unknown role excluded)', () => {
    const out = writableSettleSources([
      { id: 'a', name: 'Revolut', myRole: 'owner' },
      { id: 'b', name: 'Keš', myRole: 'full' },
      { id: 'c', name: 'Dijeljeni', myRole: 'limited' },
      { id: 'd', name: 'Samo gleda', myRole: 'viewer' },
      { id: 'e', name: 'Nepoznat', myRole: null },
    ]);
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('cannot submit without a source', () => {
    expect(canSubmitSettle({ sourceId: null, sourceCurrency: 'EUR', settlementCurrency: 'EUR', payerAmountRaw: '' })).toBe(false);
    expect(canSubmitSettle({ sourceId: 's', sourceCurrency: 'EUR', settlementCurrency: 'EUR', payerAmountRaw: '' })).toBe(true);
  });

  it('different currency requires the actually paid amount', () => {
    expect(needsPayerAmount('USD', 'EUR')).toBe(true);
    expect(needsPayerAmount(null, 'EUR')).toBe(false);
    expect(needsPayerAmount('', 'eur')).toBe(false);
    const base = { sourceId: 's', sourceCurrency: 'USD', settlementCurrency: 'EUR' };
    expect(canSubmitSettle({ ...base, payerAmountRaw: '' })).toBe(false);
    expect(canSubmitSettle({ ...base, payerAmountRaw: '0' })).toBe(false);
    expect(canSubmitSettle({ ...base, payerAmountRaw: '22,75' })).toBe(true);
  });

  it('FX hint uses the EUR-based snapshot formula and returns null without a rate', () => {
    expect(convertBySnapshot(20, 'EUR', 'USD', { EUR: 1, USD: 1.1377 })).toBe(22.75);
    expect(convertBySnapshot(20, 'EUR', 'XYZ', { EUR: 1 })).toBeNull();
    expect(convertBySnapshot(20, 'EUR', 'USD', null)).toBeNull();
  });

  it('translates error codes; source_not_found is not confused with not_found', () => {
    expect(resolveKrugSettleErrorCode('source_not_found')).toBe('source_not_found');
    expect(resolveKrugSettleErrorCode('ERROR: only_debtor_can_settle')).toBe('only_debtor_can_settle');
    expect(resolveKrugSettleErrorCode('payer_amount_required')).toBe('payer_amount_required');
    expect(resolveKrugSettleErrorCode('something else')).toBeNull();
  });

  it('every error code has a hr/en/de message', () => {
    const get = (o: any, key: string) => key.split('.').reduce((a, k) => a?.[k], o);
    for (const code of KRUG_SETTLE_ERROR_CODES) {
      for (const loc of [hr, en, de]) expect(typeof get(loc, krugSettleErrorKey(code))).toBe('string');
    }
  });

  it('awaiting receipt only for new-flow rows without confirmation', () => {
    expect(isAwaitingReceipt({ payer_expense_id: 'x', recipient_confirmed_at: null })).toBe(true);
    expect(isAwaitingReceipt({ payer_expense_id: 'x', recipient_confirmed_at: '2026-09-01' })).toBe(false);
    expect(isAwaitingReceipt({ payer_expense_id: null })).toBe(false);
    expect(isAwaitingReceipt({ payer_expense_id: 'x', voided_at: '2026-09-01' })).toBe(false);
  });
});

import { resolveKrugNotification } from '@/lib/krugNotificationRoutes';
import { canActOnReceipt } from '@/lib/krugSettleWithSource';

describe('krug settle — recipient rules and notification route', () => {
  const row = { to_user: 'm', payer_expense_id: 'e', recipient_confirmed_at: null, voided_at: null };
  it('only the recipient, only while awaiting, never read-only', () => {
    expect(canActOnReceipt(row, 'm')).toBe(true);
    expect(canActOnReceipt(row, 'p')).toBe(false);
    expect(canActOnReceipt(row, 'm', true)).toBe(false);
    expect(canActOnReceipt({ ...row, recipient_confirmed_at: 'x' }, 'm')).toBe(false);
    expect(canActOnReceipt({ ...row, payer_expense_id: null }, 'm')).toBe(false);
  });
  it('receipt-pending notification routes into the confirm dialog', () => {
    const k = '11111111-1111-1111-1111-111111111111';
    const l = '22222222-2222-2222-2222-222222222222';
    const r = resolveKrugNotification('krug_settlement_marked_settled', {
      krug_id: k, dedup_ref: `settled:${l}`, receipt_pending: true,
    });
    expect(r?.route).toBe(`/krug?id=${k}&settlement=${l}&confirm=1`);
    const plain = resolveKrugNotification('krug_settlement_marked_settled', { krug_id: k, dedup_ref: `settled:${l}` });
    expect(plain?.route).toBe(`/krug?id=${k}&settlement=${l}`);
  });
  it('recipient error codes are translated', () => {
    for (const c of ['only_recipient_can_confirm', 'already_confirmed', 'legacy_settlement', 'recipient_amount_required', 'already_voided', 'source_not_writable']) {
      expect(resolveKrugSettleErrorCode(`ERROR: ${c}`)).toBe(c);
    }
  });
});
