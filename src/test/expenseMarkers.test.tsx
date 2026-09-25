import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { ExpenseMarkerFields } from '@/components/expense-markers/ExpenseMarkerFields';
import {
  buildLoanSummary, buildMarkerFieldsForEdit, buildMarkerFieldsForInsert, movementKindsForType,
  personKey, sumTaggedSpend, toggleTag, type MarkerRow,
} from '@/lib/expenseMarkers';
import { isRealIncome, isRealSpend } from '@/lib/spendClassification';
import { applyFilters, defaultFilters } from '@/components/TransactionFilters';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';

const SEPT = { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30, 23, 59, 59) };
const row = (o: Partial<MarkerRow>): MarkerRow => ({ type: 'expense', amount: 10, date: new Date(2026, 8, 10), ...o });

describe('oznake Nepotrebno/Luksuz', () => {
  it('čip jednim dodirom uključuje i isključuje oznaku', () => {
    const onTags = vi.fn();
    const { rerender } = render(
      <ExpenseMarkerFields type="expense" tags={[]} onTagsChange={onTags} movementKind={null} onMovementKindChange={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('tag-chip-unnecessary'));
    expect(onTags).toHaveBeenLastCalledWith(['unnecessary']);
    rerender(<ExpenseMarkerFields type="expense" tags={['unnecessary']} onTagsChange={onTags} movementKind={null} onMovementKindChange={() => {}} />);
    expect(screen.getByTestId('tag-chip-unnecessary').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('tag-chip-unnecessary'));
    expect(onTags).toHaveBeenLastCalledWith([]);
  });

  it('upis sprema tags u polje za bazu', () => {
    expect(buildMarkerFieldsForInsert({ enabled: true, type: 'expense', tags: toggleTag(['luxury'], 'unnecessary'), movementKind: null }))
      .toEqual({ tags: ['unnecessary', 'luxury'], movement_kind: null });
    expect(buildMarkerFieldsForInsert({ enabled: false, type: 'expense', tags: ['luxury'], movementKind: null })).toEqual({});
    expect(buildMarkerFieldsForInsert({ enabled: true, type: 'transfer', tags: ['luxury'], movementKind: 'loan_given' })).toEqual({});
  });

  it('kartica zbraja samo stvarnu osobnu potrošnju s oznakom u mjesecu', () => {
    const rows = [
      row({ amount: 12, tags: ['unnecessary'] }),
      row({ amount: 5, tags: ['unnecessary', 'luxury'] }),
      row({ amount: 100, tags: [] }),
      row({ amount: 40, tags: ['unnecessary'], movement_kind: 'loan_given' }),
      row({ amount: 30, tags: ['unnecessary'], expense_nature: 'correction' }),
      row({ amount: 20, tags: ['unnecessary'], deleted_at: '2026-09-11' }),
      row({ amount: 7, tags: ['unnecessary'], type: 'income' }),
      row({ amount: 9, tags: ['unnecessary'], project_id: 'p' }),
      row({ amount: 8, tags: ['unnecessary'], date: new Date(2026, 7, 31) }),
    ];
    expect(sumTaggedSpend(rows, 'unnecessary', SEPT)).toEqual({ total: 17, count: 2 });
    expect(sumTaggedSpend(rows, 'luxury', SEPT)).toEqual({ total: 5, count: 1 });
  });

  it('filtar oznake', () => {
    const items = [
      { description: 'a', date: new Date(), amount: 1, tags: ['luxury'] },
      { description: 'b', date: new Date(), amount: 2, tags: [] },
    ];
    expect(applyFilters(items, { ...defaultFilters, tag: 'luxury' }).map((i) => i.description)).toEqual(['a']);
  });
});

describe('vrsta zapisa', () => {
  it('nudi samo vrste za smjer', () => {
    expect(movementKindsForType('expense')).toEqual(['loan_given', 'loan_repaid_by_me', 'own_company_payment']);
    expect(movementKindsForType('income')).toEqual(['loan_repaid_to_me', 'loan_received']);
    expect(movementKindsForType('transfer')).toEqual([]);
    render(<ExpenseMarkerFields type="income" tags={[]} onTagsChange={() => {}} movementKind="loan_received" onMovementKindChange={() => {}} />);
    expect(screen.queryByTestId('movement-kind-loan_given')).toBeNull();
    expect(screen.getByTestId('movement-kind-loan_received')).toBeTruthy();
    expect(screen.queryByTestId('tag-chip-unnecessary')).toBeNull();
  });

  it('sprema movement_kind i ne dira type; kriva vrsta za smjer se odbacuje', () => {
    const f = buildMarkerFieldsForInsert({ enabled: true, type: 'expense', tags: [], movementKind: 'loan_given' });
    expect(f).toEqual({ tags: [], movement_kind: 'loan_given' });
    expect('type' in f).toBe(false);
    expect(buildMarkerFieldsForInsert({ enabled: true, type: 'expense', tags: [], movementKind: 'loan_received' }).movement_kind).toBeNull();
  });

  it('uređivanje čuva nedirnutu vrijednost iz Pregleda kategorija', () => {
    expect(buildMarkerFieldsForEdit({ enabled: true, type: 'expense', tags: [], movementKind: 'own_transfer', originalMovementKind: 'own_transfer' }).movement_kind).toBe('own_transfer');
    expect(buildMarkerFieldsForEdit({ enabled: true, type: 'expense', tags: [], movementKind: null, originalMovementKind: 'own_transfer' }).movement_kind).toBeNull();
    expect(buildMarkerFieldsForEdit({ enabled: true, type: 'income', tags: [], movementKind: 'loan_given', originalMovementKind: null }).movement_kind).toBeNull();
  });

  it('zapis s movement_kind ne ulazi u potrošnju ni prihod', () => {
    expect(isRealSpend({ type: 'expense', movement_kind: 'loan_given' })).toBe(false);
    expect(isRealIncome({ type: 'income', movement_kind: 'loan_repaid_to_me' })).toBe(false);
  });
});

describe('pregled pozajmica', () => {
  it('točno računa preostalo po osobi; isto ime različito pisano se grupira, različita imena ne', () => {
    const rows = [
      row({ amount: 300, movement_kind: 'loan_given', merchant_name: 'Marko' }),
      row({ amount: 100, type: 'income', movement_kind: 'loan_repaid_to_me', merchant_name: ' MARKO ' }),
      row({ amount: 50, movement_kind: 'loan_given', merchant_name: 'Marko Horvat' }),
      row({ amount: 200, type: 'income', movement_kind: 'loan_received', merchant_name: null, description: 'Đuro' }),
      row({ amount: 80, movement_kind: 'loan_repaid_by_me', merchant_name: 'Duro' }),
      row({ amount: 999, movement_kind: 'loan_given', merchant_name: 'Marko', deleted_at: 'x' }),
      row({ amount: 999, movement_kind: 'own_company_payment', merchant_name: 'Firma' }),
    ];
    const s = buildLoanSummary(rows);
    const marko = s.find((p) => p.key === 'marko')!;
    expect(marko).toMatchObject({ given: 300, repaidToMe: 100, owedToMe: 200, count: 2, name: 'Marko' });
    expect(s.find((p) => p.key === 'marko horvat')!.owedToMe).toBe(50);
    expect(s.find((p) => p.key === 'duro')!).toMatchObject({ received: 200, repaidByMe: 80, iOwe: 120 });
    expect(s.some((p) => p.key === 'firma')).toBe(false);
    expect(personKey('Marko-Horvat')).toBe(personKey('marko horvat'));
  });
});

describe('prijevodi', () => {
  it('ključevi expenseMarkers postoje u hr/en/de', () => {
    const keys = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]);
    const base = keys((en as any).expenseMarkers).filter((k) => !/_(one|few|other)$/.test(k));
    for (const l of [hr, de]) {
      const have = new Set(keys((l as any).expenseMarkers).map((k) => k.replace(/_(one|few|other)$/, '')));
      base.forEach((k) => expect(have.has(k.replace(/_(one|few|other)$/, ''))).toBe(true));
    }
  });
});
