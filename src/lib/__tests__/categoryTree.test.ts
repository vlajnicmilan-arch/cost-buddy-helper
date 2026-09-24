import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CATEGORY_GROUPS, CATEGORY_LEAVES, LEGACY_ALIASES, resolveTreeCategory,
} from '@/lib/categoryTree';
import { CATEGORIES, INCOME_CATEGORIES } from '@/types/expense';
import { PROJECT_EXPENSE_CATEGORIES } from '@/lib/projectExpenseCategories';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';

const START = '// ---------------- SHARED CORE START ----------------';
const END = '// ---------------- SHARED CORE END ----------------';
const core = (p: string) => {
  const s = readFileSync(join(process.cwd(), p), 'utf8');
  const a = s.indexOf(START); const b = s.indexOf(END);
  expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeGreaterThan(a);
  return s.slice(a, b + END.length);
};

describe('categoryTree', () => {
  it('zrcalo je identično', () => {
    expect(core('supabase/functions/_shared/categoryTree.ts')).toBe(core('src/lib/categoryTree.ts'));
  });

  it('ključ lista je jedinstven', () => {
    const keys = CATEGORY_LEAVES.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CATEGORY_GROUPS).toHaveLength(12);
  });

  it('svaki stari ugrađeni ključ (osobni, prihodni, projektni) ima alias', () => {
    const all = [...CATEGORIES, ...INCOME_CATEGORIES, ...PROJECT_EXPENSE_CATEGORIES].map((c) => c.id);
    for (const k of [...all, 'transfer']) expect(LEGACY_ALIASES[k], k).toBeDefined();
  });

  const safe: [string, string, string][] = [
    ['groceries', 'food', 'groceries'], ['clothing', 'personal', 'clothing'], ['health', 'personal', 'health'],
    ['beauty', 'personal', 'care'], ['subscriptions', 'fun', 'subscriptions'], ['rent', 'home', 'rent'],
    ['utilities', 'home', 'utilities'], ['taxes', 'fees_taxes', 'taxes'], ['home', 'home', 'home_goods'],
    ['material', 'work', 'material'], ['sports', 'fun', 'hobbies'], ['salary', 'income', 'salary'],
    ['freelance', 'income', 'work_income'], ['other_income', 'income', 'other_income'],
  ];
  it.each(safe)('sigurno: %s → %s/%s', (v, g, l) => {
    const r = resolveTreeCategory(v);
    expect([r.groupKey, r.leafKey, r.unsorted, r.invalid]).toEqual([g, l, false, false]);
  });

  const unsorted: [string, string][] = [
    ['food', 'food'], ['transport', 'car'], ['car', 'car'], ['shopping', 'personal'], ['bills', 'fees_taxes'],
    ['travel', 'travel'], ['entertainment', 'fun'], ['labor', 'work'], ['insurance', 'other'],
    ['education', 'other'], ['gifts', 'other'], ['pets', 'other'], ['kids', 'other'], ['savings', 'other'],
    ['investments', 'other'], ['charity', 'other'], ['gift_income', 'income'], ['sale', 'income'],
    ['personal_loan', 'income'], ['mortgage', 'income'], ['other', 'other'],
  ];
  it.each(unsorted)('nerazvrstano: %s → %s', (v, g) => {
    const r = resolveTreeCategory(v);
    expect([r.groupKey, r.leafKey, r.unsorted, r.invalid]).toEqual([g, null, true, false]);
  });

  it('transfer nema skupinu', () => {
    const r = resolveTreeCategory('transfer');
    expect([r.groupKey, r.isTransfer, r.invalid]).toEqual([null, true, false]);
  });

  it.each(['0', '8', '', '   ', 'custom_income_abc', 'nesto_nepoznato'])('neispravno: "%s"', (v) => {
    const r = resolveTreeCategory(v);
    expect(r.invalid).toBe(true);
    expect(r.label).toBe('categoryTree.unsorted');
    expect(r.label).not.toContain(v || '§');
  });
  it('null/undefined → neispravno', () => {
    expect(resolveTreeCategory(null).invalid).toBe(true);
    expect(resolveTreeCategory(undefined).invalid).toBe(true);
  });

  it('korisnička kategorija → isCustom, bez skupine, nikad automatski mapirana', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const r = resolveTreeCategory(id, [{ id, name: 'Pokrivanje drugih pizdarija', icon: '🧯' }]);
    expect([r.isCustom, r.groupKey, r.leafKey, r.customName]).toEqual([true, null, null, 'Pokrivanje drugih pizdarija']);
    const m = resolveTreeCategory('x', [{ id: 'x', name: 'Materijal' }]);
    expect([m.isCustom, m.groupKey]).toEqual([true, null]);
  });

  it('i18n: svaka skupina i list postoje u hr/en/de', () => {
    for (const loc of [hr, en, de] as Array<Record<string, any>>) {
      for (const g of CATEGORY_GROUPS) expect(loc.categoryTree.groups[g.key]).toBeTruthy();
      for (const l of CATEGORY_LEAVES) expect(loc.categoryTree.leaves[l.key]).toBeTruthy();
      expect(loc.categoryTree.unsorted).toBeTruthy();
    }
  });
});
