/**
 * Podsjetnici za dospijeće ulaznih računa — čista pravila.
 *
 * Pokriva: točno 2 faze po računu (d3 + d0), povijest ne zvoni,
 * plaćen račun ne zvoni, dedup ključ stabilan, agregat prekoračenih.
 */
import { describe, it, expect } from 'vitest';
import {
  pickDueStage,
  invoiceDueDedupKey,
  daysUntilDue,
} from '../../supabase/functions/_shared/invoiceDue';
import { detectOverdueIncomingInvoices } from '@/lib/issueDetection';

const today = new Date('2026-08-14T09:00:00Z');
const plus = (d: number) =>
  new Date(Date.UTC(2026, 7, 14 + d)).toISOString().slice(0, 10);

describe('pickDueStage', () => {
  it('budući račun dobiva TOČNO dvije faze kroz život (d3 i d0)', () => {
    const inv = { id: 'a', due_date: plus(10), paid_at: null, direction: 'in' };
    const stages: string[] = [];
    for (let offset = 0; offset <= 12; offset++) {
      const day = new Date(Date.UTC(2026, 7, 14 + offset));
      const s = pickDueStage(inv, day);
      if (s) stages.push(s);
    }
    expect(stages).toEqual(['d3', 'd0']);
  });

  it('ne zvoni 2, 4 ni 5 dana prije dospijeća', () => {
    for (const d of [1, 2, 4, 5]) {
      expect(pickDueStage({ id: 'a', due_date: plus(d), paid_at: null }, today)).toBeNull();
    }
  });

  it('POVIJEST NE ZVONI: prošlo dospijeće nikad ne okida podsjetnik', () => {
    for (const d of [-1, -3, -30]) {
      expect(pickDueStage({ id: 'a', due_date: plus(d), paid_at: null }, today)).toBeNull();
    }
  });

  it('plaćen račun ne zvoni ni na dan dospijeća', () => {
    expect(pickDueStage(
      { id: 'a', due_date: plus(0), paid_at: '2026-08-10T10:00:00Z' },
      today,
    )).toBeNull();
  });

  it('izlazni račun (direction=out) nije u opsegu', () => {
    expect(pickDueStage({ id: 'a', due_date: plus(0), paid_at: null, direction: 'out' }, today)).toBeNull();
  });

  it('bez dospijeća — bez podsjetnika', () => {
    expect(pickDueStage({ id: 'a', due_date: null, paid_at: null }, today)).toBeNull();
  });
});

describe('invoiceDueDedupKey', () => {
  it('stabilan po računu i fazi (ponovni prolaz crona ne duplira)', () => {
    expect(invoiceDueDedupKey('inv-1', 'd3')).toBe('invoice_due:inv-1:d3');
    expect(invoiceDueDedupKey('inv-1', 'd0')).toBe('invoice_due:inv-1:d0');
    expect(invoiceDueDedupKey('inv-1', 'd3')).toBe(invoiceDueDedupKey('inv-1', 'd3'));
  });
});

describe('daysUntilDue', () => {
  it('računa cijele dane u UTC-u', () => {
    expect(daysUntilDue(plus(3), today)).toBe(3);
    expect(daysUntilDue(plus(0), today)).toBe(0);
    expect(daysUntilDue(plus(-2), today)).toBe(-2);
  });
});

describe('detectOverdueIncomingInvoices (agregat, ne po računu)', () => {
  it('prazna lista kad nema prekoračenih', () => {
    expect(detectOverdueIncomingInvoices([
      { id: '1', due_date: plus(5), total_amount: 100 },
    ], today)).toEqual([]);
  });

  it('jedna stavka sa zbrojem i brojem, stabilan dedup', () => {
    const out = detectOverdueIncomingInvoices([
      { id: '1', due_date: plus(-1), total_amount: 100 },
      { id: '2', due_date: plus(-10), total_amount: '50.50' },
      { id: '3', due_date: plus(2), total_amount: 999 },
      { id: '4', due_date: plus(-4), total_amount: 10, paid_at: '2026-08-12T00:00:00Z' },
    ], today);
    expect(out).toHaveLength(1);
    expect(out[0].dedup_key).toBe('overdue_incoming_invoices');
    expect(out[0].title_vars).toEqual({ count: 2 });
    expect(out[0].message_vars).toEqual({ count: 2, amount: '150.50 €' });
  });
});
