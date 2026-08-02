import { describe, it, expect } from 'vitest';
import { selectUnassignedExpenses } from '@/components/projects/project-transactions/UnassignedMilestoneDialog';
import type { ProjectExpense } from '@/components/projects/project-transactions/types';

const mk = (over: Partial<ProjectExpense>): ProjectExpense => ({
  id: 'x',
  user_id: 'u',
  amount: 100,
  description: 'd',
  category: 'other',
  date: '2026-01-01',
  type: 'expense',
  milestone_id: null,
  status: 'approved',
  ...over,
});

describe('selectUnassignedExpenses', () => {
  it('vraća samo transakcije bez faze', () => {
    const rows = selectUnassignedExpenses([
      mk({ id: 'a' }),
      mk({ id: 'b', milestone_id: 'm1' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('poredak je silazan po iznosu', () => {
    const rows = selectUnassignedExpenses([
      mk({ id: 'small', amount: 10 }),
      mk({ id: 'big', amount: 5000 }),
      mk({ id: 'mid', amount: 900 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['big', 'mid', 'small']);
  });

  it('izostavlja transfere i odbijene zapise', () => {
    const rows = selectUnassignedExpenses([
      mk({ id: 'tr', type: 'transfer', amount: 9999 }),
      mk({ id: 'rej', status: 'rejected', amount: 8888 }),
      mk({ id: 'ok', amount: 1 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['ok']);
  });

  it('ne mutira ulazni niz', () => {
    const input = [mk({ id: 'a', amount: 1 }), mk({ id: 'b', amount: 2 })];
    selectUnassignedExpenses(input);
    expect(input.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
