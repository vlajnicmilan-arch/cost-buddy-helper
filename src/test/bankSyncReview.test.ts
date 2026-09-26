import { describe, it, expect, vi } from 'vitest';
import { reviewPlanFor, enqueueReviewRow, buildReviewPayload, reviewDisposition } from '../../supabase/functions/_shared/bankSyncReview.ts';
import { planReviewDecision, reviewErrorCode, type ReviewQueueItem } from '../lib/bankSyncReview/decision';

vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));

const rule = (outcome: string, ids: string[] = []) =>
  ({ outcome, candidate: ids[0] ? { id: ids[0] } : null, passing: ids.map((id) => ({ id })) }) as never;

describe('reviewPlanFor — koje grane idu u red', () => {
  it('ambiguous → red s prolaznim kandidatima', () => {
    expect(reviewPlanFor(rule('ambiguous', ['a', 'b']), { kind: 'none', reason: 'no_rule_match' } as never, null, ['a', 'b', 'c']))
      .toEqual({ reason: 'ambiguous', candidateIds: ['a', 'b'] });
  });
  it('uncertain → red', () => {
    expect(reviewPlanFor(rule('uncertain', ['a']), { kind: 'none', reason: 'x' } as never, null, [])?.reason).toBe('uncertain');
  });
  it('rule_match_and_transfer_candidate → red s oba kandidata', () => {
    expect(reviewPlanFor(rule('merge', ['a']), { kind: 'none', reason: 'rule_match_and_transfer_candidate' } as never, 't', []))
      .toEqual({ reason: 'rule_match_and_transfer_candidate', candidateIds: ['a', 't'] });
  });
  it('candidate_already_used_in_run → red', () => {
    expect(reviewPlanFor(rule('merge', ['a']), { kind: 'none', reason: 'candidate_already_used_in_run' } as never, null, [])?.reason)
      .toBe('candidate_already_used_in_run');
  });
  it('spajanje (merge/transfer) i nema kandidata → stari put', () => {
    expect(reviewPlanFor(rule('merge', ['a']), { kind: 'merge', id: 'a' } as never, null, [])).toBeNull();
    expect(reviewPlanFor(undefined, { kind: 'transfer', id: 't' } as never, 't', [])).toBeNull();
    expect(reviewPlanFor(rule('none'), { kind: 'none', reason: 'no_rule_match' } as never, null, [])).toBeNull();
  });
});

describe('enqueueReviewRow', () => {
  const row = { user_id: 'u', bank_account_id: 'b', stable_id: 's', reason: 'ambiguous' as const, candidate_ids: [], payload: {} };
  const client = (res: unknown) => ({ from: () => ({ insert: () => Promise.resolve(res) }) }) as never;
  it('uspjeh → queued', async () => {
    expect(await enqueueReviewRow(client({ error: null }), row)).toEqual({ kind: 'queued', already: false });
  });
  it('već u redu (23505) → queued, bez duplikata', async () => {
    expect(await enqueueReviewRow(client({ error: { code: '23505', message: 'dup' } }), row)).toEqual({ kind: 'queued', already: true });
  });
  it('greška → fallback na staro ponašanje', async () => {
    expect(await enqueueReviewRow(client({ error: { code: '42501', message: 'denied' } }), row))
      .toEqual({ kind: 'fallback', code: '42501', message: 'denied' });
    const thrower = { from: () => ({ insert: () => Promise.reject(new Error('net')) }) } as never;
    expect((await enqueueReviewRow(thrower, row)).kind).toBe('fallback');
  });
  it('payload nosi samo stupce upisa', () => {
    expect(Object.keys(buildReviewPayload({ amount: 1, dateIso: 'd', type: 'expense', description: null, currency: 'EUR', paymentSource: 'custom:w', walletId: 'w', paymentSourceCardId: null, businessProfileId: null, bankRawLine: 'r' })).sort())
      .toEqual(['amount', 'bank_raw_line', 'business_profile_id', 'currency', 'date', 'description', 'payment_source', 'payment_source_card_id', 'type', 'wallet_id']);
  });
});

describe('planReviewDecision — kroz jezgru', () => {
  const item: ReviewQueueItem = {
    id: 'q', user_id: 'u', bank_account_id: 'b', stable_id: 's', reason: 'ambiguous', candidate_ids: ['a', 'b'], created_at: '',
    payload: { amount: 10, date: '2026-09-01T00:00:00Z', type: 'expense', description: null, currency: 'EUR', payment_source: 'custom:w', wallet_id: 'w', payment_source_card_id: null, business_profile_id: null, bank_raw_line: '' },
  };
  const cands = [
    { id: 'a', user_id: 'u', amount: 10, date: '', description: null, payment_source: null },
    { id: 'b', user_id: 'u', amount: 10, date: '', description: null, payment_source: null },
  ];
  it('pet odluka', () => {
    expect(planReviewDecision(item, 'u', cands, { kind: 'merge', targetId: 'b' })).toMatchObject({ decision: 'merge', targetId: 'b' });
    expect(planReviewDecision(item, 'u', cands, { kind: 'new' }).decision).toBe('new');
    expect(planReviewDecision(item, 'u', cands, { kind: 'transfer', counterpartSourceId: 'x' })).toMatchObject({ decision: 'transfer', counterpartSourceId: 'x' });
    expect(planReviewDecision(item, 'u', cands, { kind: 'dismiss' }).decision).toBe('dismiss');
  });
  it('tuđi kandidat se ne spaja', () => {
    const foreign = [{ ...cands[0], user_id: 'other' }];
    expect(() => planReviewDecision(item, 'u', foreign, { kind: 'merge', targetId: 'a' })).toThrow('target_not_candidate');
  });
  it('kodovi grešaka', () => {
    expect(reviewErrorCode({ message: 'target_unavailable' })).toBe('target_unavailable');
    expect(reviewErrorCode({ code: '23505' })).toBe('already_booked');
    expect(reviewErrorCode({ message: 'x' })).toBe('unknown');
  });
});

describe('reviewDisposition — red se nije učitao', () => {
  const plan = { reason: 'ambiguous' as const, candidateIds: ['a'] };
  it('nejasan redak se odgađa, ne upisuje', () => {
    expect(reviewDisposition(plan, false, true)).toBe('defer');
  });
  it('red učitan → u red', () => {
    expect(reviewDisposition(plan, false, false)).toBe('enqueue');
  });
  it('samo-prijenos i ne-nejasan idu starim putem i kad red pada', () => {
    expect(reviewDisposition(plan, true, true)).toBe('none');
    expect(reviewDisposition(null, false, true)).toBe('none');
  });
});
