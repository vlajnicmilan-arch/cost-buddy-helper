/**
 * PRAVILO „PREKORAČENA OBVEZA" — agregat prekoračenih ULAZNIH računa.
 *
 * Fixture reproducira strukturu žive baze na dan pisanja: 100 neplaćenih
 * redaka s prošlim dospijećem, od čega 83 ulazna (obveze, 3.009,02 €) i
 * 17 izlaznih (potraživanja, 5.297,90 €). Agregat SMIJE brojati samo obveze.
 */
import { describe, it, expect } from 'vitest';
import { detectOverdueIncomingInvoices } from '@/lib/issueDetection';

const today = new Date('2026-08-15T06:00:00Z');
const past = '2026-08-01';
const AKROBAT = '804499a9-745c-42f8-930b-2209fcbd12a8';
const TACTURA = '52bfeb3c-4bb2-4ab8-8b6f-96a1b1afe00e';

const rows = [
  ...Array.from({ length: 82 }, (_, i) => ({
    id: `in-a-${i}`, due_date: past, paid_at: null, total_amount: 35.9,
    direction: 'in', business_profile_id: AKROBAT,
  })),
  { id: 'in-t-0', due_date: past, paid_at: null, total_amount: 64.7, direction: 'in', business_profile_id: TACTURA },
  ...Array.from({ length: 17 }, (_, i) => ({
    id: `out-${i}`, due_date: past, paid_at: null, total_amount: 311.64,
    direction: 'out', business_profile_id: AKROBAT,
  })),
];

const labels = { [AKROBAT]: 'Akrobat', [TACTURA]: 'Tactura' };

describe('detectOverdueIncomingInvoices — imenovano pravilo', () => {
  it('IZLAZNI RAČUNI NISU OBVEZA: 100 redaka → 83 u agregatu', () => {
    const [issue] = detectOverdueIncomingInvoices(rows, today, labels);
    expect(issue.title_vars).toEqual({ count: 83 });
    expect(issue.data?.count).toBe(83);
    expect(issue.data?.total).toBeCloseTo(82 * 35.9 + 64.7, 2);
  });

  it('razrada po profilima ide u poruku kad knjiga ima više', () => {
    const [issue] = detectOverdueIncomingInvoices(rows, today, labels);
    expect(issue.message_key).toBe('attention.issues.overdueIncomingInvoices.messageWithBreakdown');
    expect(issue.message_vars?.breakdown).toBe('Akrobat 82 · Tactura 1');
  });

  it('osobne knjige ulaze u isti agregat pod svojom etiketom', () => {
    const [issue] = detectOverdueIncomingInvoices(
      [
        { id: 'p1', due_date: past, paid_at: null, total_amount: 10, direction: 'in', business_profile_id: null },
        { id: 'b1', due_date: past, paid_at: null, total_amount: 20, direction: 'in', business_profile_id: AKROBAT },
      ],
      today,
      labels,
      'osobno',
    );
    expect(issue.data?.count).toBe(2);
    expect(issue.message_vars?.breakdown).toBe('Akrobat 1 · osobno 1');
  });

  it('jedna knjiga → bez razrade (nema mutne buke)', () => {
    const [issue] = detectOverdueIncomingInvoices(
      [{ id: 'p1', due_date: past, paid_at: null, total_amount: 10, direction: 'in', business_profile_id: null }],
      today,
      labels,
    );
    expect(issue.message_key).toBe('attention.issues.overdueIncomingInvoices.message');
    expect(issue.message_vars?.breakdown).toBeUndefined();
  });

  it('KLIK IMA METU: agregat nosi rutu i cilj', () => {
    const [issue] = detectOverdueIncomingInvoices(rows, today, labels);
    expect(issue.data?.route).toBe('/home?eracun=overdue');
    expect(issue.data?.target).toBe('eracun_overdue');
  });

  it('plaćeni i budući ne ulaze', () => {
    expect(detectOverdueIncomingInvoices([
      { id: '1', due_date: past, paid_at: '2026-08-02T00:00:00Z', total_amount: 5, direction: 'in' },
      { id: '2', due_date: '2026-09-01', paid_at: null, total_amount: 5, direction: 'in' },
    ], today)).toEqual([]);
  });
});
