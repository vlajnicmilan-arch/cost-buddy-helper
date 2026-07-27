/**
 * Faza C3 — pure helper testovi za krugSettlementPdf.
 * jsPDF/autoTable su mockani; testiramo samo cistu logiku formatiranja i grupiranja.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/loadJsPdf', () => ({
  loadJsPdf: async () => ({ jsPDF: class {}, autoTable: () => {} }),
}));

import {
  formatMoney,
  formatDate,
  formatPeriodLabel,
  groupOverridesByExpense,
} from '@/lib/krugSettlementPdf';
import type { OverrideHistoryRow } from '@/hooks/useKrugPeriodOverrides';

const mkOverride = (
  id: string,
  expenseId: string,
  date: string,
  createdAt: string,
  status: OverrideHistoryRow['status'] = 'potvrdjena',
): OverrideHistoryRow => ({
  id,
  expense: { id: expenseId, description: `Trošak ${expenseId}`, amount: 100, currency: 'EUR', date },
  krug_id: 'k1',
  proposed_by: 'u1',
  status,
  activated_at: null,
  reject_reason: null,
  created_at: createdAt,
  shares: [{ user_id: 'u1', share_percent: 60 }, { user_id: 'u2', share_percent: 40 }],
  confirmations: [{ user_id: 'u2', confirmed_at: createdAt }],
});

describe('krugSettlementPdf helpers', () => {
  describe('formatMoney', () => {
    it('formats EUR in hr locale', () => {
      // Non-breaking space between amount and symbol — assert loosely.
      const out = formatMoney(1234.5, 'EUR', 'hr');
      expect(out).toMatch(/1\.234,50/);
      expect(out).toMatch(/€/);
    });
    it('falls back on invalid currency', () => {
      const out = formatMoney(10, 'INVALID_CODE_XYZ' as any, 'hr');
      expect(out).toBe('10.00 INVALID_CODE_XYZ');
    });
  });

  describe('formatDate', () => {
    it('formats iso date in hr', () => {
      expect(formatDate('2026-07-15', 'hr')).toBe('15.07.2026.');
    });
    it('returns empty for empty input', () => {
      expect(formatDate('')).toBe('');
    });
  });

  describe('formatPeriodLabel', () => {
    it('collapses same-month range to month + year', () => {
      const label = formatPeriodLabel('2026-07-01', '2026-07-31', 'en');
      expect(label.toLowerCase()).toContain('july');
      expect(label).toContain('2026');
    });
    it('renders range for cross-month period', () => {
      const label = formatPeriodLabel('2026-07-01', '2026-08-15', 'hr');
      expect(label).toContain('–');
    });
  });

  describe('groupOverridesByExpense', () => {
    it('buckets rows by expense.id, newest expense first, newest proposal first within bucket', () => {
      const rows: OverrideHistoryRow[] = [
        mkOverride('o1', 'e-old', '2026-06-05', '2026-06-05T09:00:00Z'),
        mkOverride('o2', 'e-new', '2026-06-20', '2026-06-20T10:00:00Z'),
        mkOverride('o3', 'e-new', '2026-06-20', '2026-06-21T10:00:00Z', 'povucena'),
      ];
      const groups = groupOverridesByExpense(rows);
      expect(groups.length).toBe(2);
      // newest expense.date first
      expect(groups[0][0].expense.id).toBe('e-new');
      // within e-new: newest proposal first
      expect(groups[0][0].id).toBe('o3');
      expect(groups[0][1].id).toBe('o2');
      // older bucket second
      expect(groups[1][0].expense.id).toBe('e-old');
    });

    it('returns empty array on empty input', () => {
      expect(groupOverridesByExpense([])).toEqual([]);
    });
  });
});
