import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  EXPENSE_LIST_COLUMNS,
  EXPENSE_DETAIL_LAZY_COLUMNS,
  EXPENSE_OMITTED_COLUMNS,
  EXPENSE_LIST_SELECT,
  EXPENSE_DETAIL_LAZY_SELECT,
} from '@/lib/expenseColumns';
import { mergeHeavyFields } from '@/lib/expenseHeavyFields';

/** Stupci tablice `expenses` iz generiranih Supabase tipova (Row shape). */
const tableColumns = (): string[] => {
  const src = fs.readFileSync(path.resolve('src/integrations/supabase/types.ts'), 'utf8');
  const start = src.indexOf('      expenses: {');
  expect(start).toBeGreaterThan(-1);
  const rowStart = src.indexOf('Row: {', start);
  const rowEnd = src.indexOf('\n        }', rowStart);
  const block = src.slice(rowStart, rowEnd);
  return block
    .split('\n')
    .slice(1)
    .map((l) => l.trim().match(/^([a-z0-9_]+)\??:/)?.[1])
    .filter((x): x is string => Boolean(x));
};

describe('expense column contract', () => {
  it('lista + lazy + namjerno izostavljeni pokrivaju cijelu tablicu', () => {
    const cols = tableColumns();
    expect(cols.length).toBeGreaterThan(50);
    const covered = new Set<string>([
      ...EXPENSE_LIST_COLUMNS,
      ...EXPENSE_DETAIL_LAZY_COLUMNS,
      ...EXPENSE_OMITTED_COLUMNS,
    ]);
    const missing = cols.filter((c) => !covered.has(c));
    expect(missing).toEqual([]);
  });

  it('nema preklapanja između liste, lazy i izostavljenih', () => {
    const all = [...EXPENSE_LIST_COLUMNS, ...EXPENSE_DETAIL_LAZY_COLUMNS, ...EXPENSE_OMITTED_COLUMNS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('lista sadrži sva polja koja potrošači čitaju s Expense tipa', () => {
    // Polja iz `Expense` sučelja koja dolaze iz baze (izuzev izvedenih/lazy).
    const consumed = [
      'id', 'user_id', 'amount', 'description', 'category', 'date', 'type',
      'payment_source', 'payment_source_card_id', 'receipt_url', 'merchant_name',
      'ai_extracted', 'category_origin', 'income_source_id', 'project_id',
      'budget_id', 'milestone_id', 'status', 'submitted_by', 'note',
      'expense_nature', 'business_profile_id', 'cash_register_id', 'currency',
      'created_at', 'updated_at', 'import_batch_id', 'collaborator_id',
      'is_advance', 'linked_advance_ids', 'bank_match_status',
      'bank_transaction_id', 'bank_account_id', 'possible_duplicate_of',
      'needs_explanation', 'recurring_transaction_id', 'krug_id',
      'krug_privacy', 'krug_shared_status', 'deleted_at', 'event_at',
      'balance_after', 'bank_row_seq', 'work_type', 'vat_rate', 'vat_amount',
      'invoice_id', 'worker_payout_id',
    ];
    const list = new Set<string>(EXPENSE_LIST_COLUMNS);
    expect(consumed.filter((c) => !list.has(c))).toEqual([]);
  });

  it('teška polja NISU u listi', () => {
    const list = new Set<string>(EXPENSE_LIST_COLUMNS);
    for (const c of EXPENSE_DETAIL_LAZY_COLUMNS) expect(list.has(c)).toBe(false);
    expect(EXPENSE_LIST_SELECT).not.toContain('bank_raw_line');
    expect(EXPENSE_LIST_SELECT).toContain('needs_explanation');
    expect(EXPENSE_DETAIL_LAZY_SELECT).toContain('id');
    expect(EXPENSE_DETAIL_LAZY_SELECT).toContain('bank_raw_line_source');
  });
});

describe('mergeHeavyFields', () => {
  const row = { id: 'e1', amount: 10 } as any;

  it('popunjava citat iz lijenog dohvata', () => {
    const merged = mergeHeavyFields(row, {
      bank_raw_line: 'OTP 12,34 EUR KONZUM',
      bank_raw_line_source: 'ai',
      location_name: 'Zagreb',
    })!;
    expect(merged.bank_raw_line).toBe('OTP 12,34 EUR KONZUM');
    expect(merged.bank_raw_line_source).toBe('ai');
    expect((merged as any).location_name).toBe('Zagreb');
    expect((merged as any).amount).toBe(10);
  });

  it('vrijednost s retka ima prednost (stari keš s punim poljima)', () => {
    const merged = mergeHeavyFields(
      { ...row, bank_raw_line: 'iz keša' },
      { bank_raw_line: 'iz baze' },
    )!;
    expect(merged.bank_raw_line).toBe('iz keša');
  });

  it('bez lijenog dohvata redak ostaje netaknut', () => {
    expect(mergeHeavyFields(row, null)).toBe(row);
    expect(mergeHeavyFields(null, { bank_raw_line: 'x' })).toBeNull();
  });
});
