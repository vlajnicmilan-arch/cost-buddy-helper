import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCategoryReview,
  merchantKey,
  REVIEW_EXEMPT_CATEGORY_ID,
  resolveCategoryReviewErrorCode,
  toApplyItems,
  type ReviewRow,
} from '@/lib/categoryReviewSuggestions';
import { CATEGORY_LEAVES } from '@/lib/categoryTree';
import { isRealSpend } from '@/lib/spendClassification';

const row = (p: Partial<ReviewRow>): ReviewRow => ({
  id: Math.random().toString(36).slice(2), type: 'expense', amount: 10, category: 'other', ...p,
});
const custom = [
  { id: REVIEW_EXEMPT_CATEGORY_ID, name: 'Pokrivanje drugih pizdarija' },
  { id: 'c-nep', name: 'Nepotrebno' },
  { id: 'c-mar', name: 'Marenda' },
];

describe('categoryReview suggestions', () => {
  it('pravila po trgovcu: Konzum u „food" → groceries, visoka sigurnost, grupirano', () => {
    const r = buildCategoryReview(
      [row({ category: 'food', merchant_name: 'Konzum', amount: 20 }), row({ category: 'food', merchant_name: 'KONZUM', amount: 5 })],
      { customCategories: custom },
    );
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toMatchObject({ reason: 'rule', confidence: 'high', proposal: { category: 'groceries' }, total: 25 });
    expect(r.pendingCount).toBe(2);
  });

  it('povijest ispravaka ima prednost pred pravilom', () => {
    const r = buildCategoryReview([row({ merchant_name: 'Konzum' })], {
      customCategories: custom,
      corrections: [{ merchant_name: 'Konzum', corrected_category: 'c-mar', created_at: '2026-01-01' }],
    });
    expect(r.suggestions[0]).toMatchObject({ reason: 'history', proposal: { category: 'c-mar' } });
  });

  it('poništen ispravak se ne koristi kao povijest', () => {
    const r = buildCategoryReview([row({ merchant_name: 'Konzum' })], {
      customCategories: custom,
      corrections: [{ merchant_name: 'Konzum', corrected_category: 'c-mar', created_at: '2026-01-01', reverted_at: '2026-01-02' }],
    });
    expect(r.suggestions[0].reason).toBe('rule');
  });

  it('isti trgovac već razvrstan drugim zapisom → isti prijedlog', () => {
    const r = buildCategoryReview(
      [row({ merchant_name: 'Mali dućan', category: 'c-mar' }), row({ merchant_name: 'Mali dućan' })],
      { customCategories: custom },
    );
    expect(r.suggestions[0]).toMatchObject({ reason: 'history_siblings', proposal: { category: 'c-mar' } });
  });

  it('„Ostalo": bankomat, vlastiti novčanik, sam sebi, pozajmica, radnik, vlastita firma', () => {
    const ctx = {
      customCategories: custom, ownSourceNames: ['Aircash'], selfNames: ['Milan Vlajnić'],
      ownCompanyNames: ['Akrobat'], workerNames: ['Nikola Bogunović'],
    };
    const r = buildCategoryReview([
      row({ description: 'ERSTE ATM SPLIT' }),
      row({ merchant_name: 'AIRCASH.EU - 462765xxxxxx2081' }),
      row({ description: 'Milan Vlajnić' }),
      row({ description: 'Petar Vlajnić - pozajmica' }),
      row({ description: 'Petar Vlajnić' }),
      row({ description: 'Nikola Bogunović' }),
      row({ description: 'AKROBAT jdoo' }),
    ], ctx);
    const by = (reason: string) => r.suggestions.find((g) => g.reason === reason);
    expect(by('atm')?.proposal).toEqual({ movement_kind: 'atm' });
    expect(r.suggestions.filter((g) => g.reason === 'own_transfer').flatMap((g) => g.rows)).toHaveLength(2);
    expect(by('loan')?.proposal).toEqual({ movement_kind: 'loan_given' });
    expect(by('loan_person')?.proposal).toEqual({ movement_kind: 'loan_given' });
    expect(by('worker')?.proposal).toEqual({ category: 'workers' });
    expect(by('own_company')?.proposal).toEqual({ movement_kind: 'own_company_payment' });
  });

  it('„Pokrivanje drugih pizdarija" nikad nije u prijedlozima ni ostalim listama', () => {
    const r = buildCategoryReview([row({ category: REVIEW_EXEMPT_CATEGORY_ID, merchant_name: 'Konzum' })], { customCategories: custom });
    const all = [...r.suggestions, ...r.unmatched, ...r.needsDecision, ...r.broken];
    expect(all).toHaveLength(0);
  });

  it('„Nepotrebno" → oznaka + prava kategorija; kategorija bez pravila ostaje', () => {
    const r = buildCategoryReview(
      [row({ category: 'c-nep', merchant_name: 'Konzum' }), row({ category: 'c-nep', merchant_name: 'Nešto' })],
      { customCategories: custom },
    );
    const withLeaf = r.suggestions.find((g) => g.proposal?.category);
    const tagOnly = r.suggestions.find((g) => !g.proposal?.category);
    expect(withLeaf?.proposal).toEqual({ tags: ['unnecessary'], category: 'groceries' });
    expect(tagOnly?.proposal).toEqual({ tags: ['unnecessary'] });
  });

  it('prijenos s kategorijom troška → samo „treba tvoju odluku", bez prijedloga', () => {
    const r = buildCategoryReview([row({ type: 'transfer', category: 'transport', description: 'Jadrolinija' })], { customCategories: custom });
    expect(r.needsDecision).toHaveLength(1);
    expect(r.needsDecision[0].proposal).toBeNull();
    expect(r.suggestions).toHaveLength(0);
  });

  it('pokvarene vrijednosti idu na pregled bez prijedloga', () => {
    const r = buildCategoryReview(
      [row({ category: '0' }), row({ category: '8' }), row({ category: '' }), row({ category: 'custom_income_x' , type: 'income'})],
      { customCategories: custom },
    );
    expect(r.broken.flatMap((g) => g.rows)).toHaveLength(4);
    expect(r.broken.every((g) => g.proposal === null)).toBe(true);
  });

  it('preskače obrisane, korekcije, podmirenja i zapise s vrstom kretanja; list ostaje', () => {
    const r = buildCategoryReview([
      row({ deleted_at: '2026-01-01', merchant_name: 'Konzum' }),
      row({ expense_nature: 'correction', merchant_name: 'Konzum' }),
      row({ expense_nature: 'krug_settlement', merchant_name: 'Konzum' }),
      row({ movement_kind: 'atm', merchant_name: 'Konzum' }),
      row({ category: 'groceries', merchant_name: 'Konzum' }),
    ], { customCategories: custom });
    expect(r.suggestions).toHaveLength(0);
  });

  it('toApplyItems šalje samo category / movement_kind / tags', () => {
    const items = toApplyItems([{ id: 'a' }], { category: 'fuel', tags: ['luxury'] });
    expect(items).toEqual([{ expense_id: 'a', category: 'fuel', tags: ['luxury'] }]);
    expect(Object.keys(items[0])).not.toContain('amount');
  });

  it('zapis s movement_kind ispada iz isRealSpend', () => {
    expect(isRealSpend({ type: 'expense', movement_kind: 'own_transfer' })).toBe(false);
    expect(isRealSpend({ type: 'expense', movement_kind: null })).toBe(true);
  });

  it('merchantKey uklanja broj kartice i rep', () => {
    expect(merchantKey({ merchant_name: 'AIRCASH.EU - 462765xxxxxx2081,' })).toBe('aircash.eu');
  });

  it('kodovi grešaka', () => {
    expect(resolveCategoryReviewErrorCode({ message: 'not_allowed' })).toBe('not_allowed');
    expect(resolveCategoryReviewErrorCode({ code: '23514', message: 'violates check' })).toBe('invalid_value');
    expect(resolveCategoryReviewErrorCode({ message: 'boom' })).toBe('unknown');
  });

  it('SQL popis listova u RPC-u jednak je registru', () => {
    const dir = join(process.cwd(), 'drizzle/migrations');
    const file = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .filter((f) => readFileSync(join(dir, f), 'utf8').includes('FUNCTION public.category_review_apply')).pop()!;
    const sql = readFileSync(join(dir, file), 'utf8');
    const arr = sql.match(/c_leaves constant text\[\] := ARRAY\[([\s\S]*?)\];/)![1];
    const keys = [...arr.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(keys).toEqual(CATEGORY_LEAVES.map((l) => l.key).sort());
    expect(sql).toContain(REVIEW_EXEMPT_CATEGORY_ID);
  });
});
