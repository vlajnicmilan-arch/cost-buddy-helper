import { describe, it, expect } from 'vitest';
import { summarizeIncomingInvoices } from '@/lib/eracun/incomingSummary';

const TODAY = new Date(2026, 0, 20); // 20.1.2026

const inv = (over: Partial<{ due_date: string | null; paid_at: string | null; total_amount: number | string }>) => ({
  due_date: null,
  paid_at: null,
  total_amount: 100,
  ...over,
});

describe('summarizeIncomingInvoices', () => {
  it('prazan popis daje nule', () => {
    const s = summarizeIncomingInvoices([], TODAY);
    expect(s).toEqual({ count: 0, total: 0, overdueCount: 0, overdueTotal: 0, nextDueDate: null, nextDueInDays: null });
  });

  it('plaćeni računi se ne broje', () => {
    const s = summarizeIncomingInvoices([inv({ paid_at: '2026-01-10', total_amount: 500 })], TODAY);
    expect(s.count).toBe(0);
    expect(s.total).toBe(0);
  });

  it('zbraja neplaćene i izdvaja one koji kasne', () => {
    const s = summarizeIncomingInvoices([
      inv({ due_date: '2026-01-10', total_amount: 62.44 }), // kasni
      inv({ due_date: '2026-01-19', total_amount: 100 }),   // kasni
      inv({ due_date: '2026-01-26', total_amount: 250 }),   // budući
      inv({ due_date: '2026-02-05', total_amount: 40 }),    // budući
    ], TODAY);
    expect(s.count).toBe(4);
    expect(s.total).toBeCloseTo(452.44, 2);
    expect(s.overdueCount).toBe(2);
    expect(s.overdueTotal).toBeCloseTo(162.44, 2);
    expect(s.nextDueDate).toBe('2026-01-26');
    expect(s.nextDueInDays).toBe(6);
  });

  it('dospijeće danas nije kašnjenje', () => {
    const s = summarizeIncomingInvoices([inv({ due_date: '2026-01-20' })], TODAY);
    expect(s.overdueCount).toBe(0);
    expect(s.nextDueInDays).toBe(0);
  });

  it('račun bez dospijeća ulazi u zbroj, ali ne u kašnjenje ni u najbliže dospijeće', () => {
    const s = summarizeIncomingInvoices([inv({ due_date: null, total_amount: '77.5' })], TODAY);
    expect(s.count).toBe(1);
    expect(s.total).toBeCloseTo(77.5, 2);
    expect(s.overdueCount).toBe(0);
    expect(s.nextDueDate).toBeNull();
  });

  it('negativan iznos (odobrenje) ulazi apsolutno', () => {
    const s = summarizeIncomingInvoices([inv({ total_amount: -30 })], TODAY);
    expect(s.total).toBe(30);
  });
});
