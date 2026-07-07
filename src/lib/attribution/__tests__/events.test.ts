/**
 * Attribution events — parser/dispatch pure-logic tests.
 * Ne provjeravaju DOM ili React; samo transformaciju notifications.data → payload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseAttributionPayload,
  dispatchAttributionOpen,
  ATTRIBUTION_OPEN_EVENT,
} from '../events';

describe('parseAttributionPayload', () => {
  it('vraća null bez ijednog payout_id-a', () => {
    expect(parseAttributionPayload('created', {})).toBeNull();
    expect(parseAttributionPayload('created', { payout_ids: [] })).toBeNull();
    expect(parseAttributionPayload('created', null)).toBeNull();
    expect(parseAttributionPayload('created', { payout_ids: [123] })).toBeNull();
  });

  it('parsira jednu isplatu bez batcha', () => {
    const r = parseAttributionPayload('created', {
      payout_ids: ['p1'],
      batch_id: null,
      project_names: ['Alpha'],
      paid_amount_total: 100,
    });
    expect(r).toEqual({
      action: 'created',
      payoutIds: ['p1'],
      batchId: null,
      projectNames: ['Alpha'],
      paidAmountTotal: 100,
    });
  });

  it('parsira batch s više payouta i imena projekata', () => {
    const r = parseAttributionPayload('created', {
      payout_ids: ['p1', 'p2'],
      batch_id: 'b1',
      project_names: ['A', 'B'],
      paid_amount_total: 500,
    });
    expect(r?.batchId).toBe('b1');
    expect(r?.payoutIds).toHaveLength(2);
    expect(r?.projectNames).toEqual(['A', 'B']);
  });

  it('paidAmountTotal može doći kao string (FCM/JSON)', () => {
    const r = parseAttributionPayload('created', {
      payout_ids: ['p1'],
      paid_amount_total: '250.75',
    });
    expect(r?.paidAmountTotal).toBe(250.75);
  });

  it('void mode se propušta u action polje', () => {
    const r = parseAttributionPayload('voided', {
      payout_ids: ['p1'],
      batch_id: 'b1',
    });
    expect(r?.action).toBe('voided');
    expect(r?.batchId).toBe('b1');
  });

  it('filtrira ne-string vrijednosti iz payout_ids i project_names', () => {
    const r = parseAttributionPayload('created', {
      payout_ids: ['p1', 42, null, 'p2'],
      project_names: ['A', 99, 'B'],
    });
    expect(r?.payoutIds).toEqual(['p1', 'p2']);
    expect(r?.projectNames).toEqual(['A', 'B']);
  });
});

describe('dispatchAttributionOpen', () => {
  const handler = vi.fn();

  beforeEach(() => {
    handler.mockReset();
    window.addEventListener(ATTRIBUTION_OPEN_EVENT, handler);
  });
  afterEach(() => {
    window.removeEventListener(ATTRIBUTION_OPEN_EVENT, handler);
  });

  it('dispatcha CustomEvent s detail payloadom', () => {
    dispatchAttributionOpen({
      action: 'created',
      payoutIds: ['p1'],
      batchId: null,
      projectNames: ['Alpha'],
      paidAmountTotal: 100,
    });
    expect(handler).toHaveBeenCalledOnce();
    const evt = handler.mock.calls[0][0] as CustomEvent;
    expect(evt.detail.payoutIds).toEqual(['p1']);
    expect(evt.detail.action).toBe('created');
  });
});
