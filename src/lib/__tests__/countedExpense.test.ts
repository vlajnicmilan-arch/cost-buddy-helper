import { describe, it, expect } from 'vitest';
import {
  COUNTED_EXPENSE_STATUSES,
  isCountedExpenseStatus,
  isCountedExpenseRow,
  filterCountedExpenses,
  applyCountedFilter,
} from '@/lib/countedExpense';
import { deriveProjectPermissions } from '@/lib/projectRolePermissions';

describe('countedExpense', () => {
  it('counts only approved rows', () => {
    expect(isCountedExpenseStatus('approved')).toBe(true);
    expect(isCountedExpenseStatus('pending')).toBe(false);
    expect(isCountedExpenseStatus('rejected')).toBe(false);
  });

  it('treats missing status as approved (legacy rows)', () => {
    expect(isCountedExpenseStatus(null)).toBe(true);
    expect(isCountedExpenseStatus(undefined)).toBe(true);
    expect(isCountedExpenseRow({})).toBe(true);
  });

  it('filters in-memory lists', () => {
    const rows = [
      { id: 'a', status: 'approved' },
      { id: 'b', status: 'pending' },
      { id: 'c', status: 'rejected' },
      { id: 'd', status: null },
    ];
    expect(filterCountedExpenses(rows).map(r => r.id)).toEqual(['a', 'd']);
  });

  it('applies the status filter to a query builder', () => {
    const calls: Array<[string, readonly unknown[]]> = [];
    const query = {
      in(col: string, values: readonly unknown[]) {
        calls.push([col, values]);
        return this;
      },
    };
    applyCountedFilter(query as never);
    expect(calls).toEqual([['status', COUNTED_EXPENSE_STATUSES]]);
  });
});

describe('Korak E — member transactions require approval', () => {
  it('member may add, but only as pending', () => {
    const p = deriveProjectPermissions({ role: 'member', isOwner: false });
    expect(p.canAddTransaction).toBe(true);
    expect(p.mustSubmitTransactionsForApproval).toBe(true);
    expect(p.canApprovePendingTransactions).toBe(false);
  });

  it('owner writes directly and reviews', () => {
    const p = deriveProjectPermissions({ role: 'owner', isOwner: true });
    expect(p.canAddTransaction).toBe(true);
    expect(p.mustSubmitTransactionsForApproval).toBe(false);
    expect(p.canApprovePendingTransactions).toBe(true);
  });

  it('worker, viewer and investor cannot add transactions at all', () => {
    for (const role of ['worker', 'viewer', 'investor'] as const) {
      const p = deriveProjectPermissions({ role, isOwner: false });
      expect(p.canAddTransaction, role).toBe(false);
      expect(p.mustSubmitTransactionsForApproval, role).toBe(false);
    }
  });
});
