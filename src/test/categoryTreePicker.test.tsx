import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import i18n from '@/i18n';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TreeCategoryOptions } from '@/components/categories/TreeCategoryOptions';
import {
  buildTreeCategorySections, buildCustomCategoryUpdates, buildGroupKeyUpdate,
} from '@/lib/categoryTreeOptions';
import { CATEGORY_GROUPS, CATEGORY_LEAVES, LEGACY_ALIASES } from '@/lib/categoryTree';
import { getCategoryInfo, CATEGORIES, INCOME_CATEGORIES } from '@/types/expense';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';

const POKRIVANJE = {
  id: 'ab61e917-645c-465c-94f4-aec2645062e9', name: 'Pokrivanje drugih pizdarija',
  icon: '🧯', color: '#ef4444', group_key: null,
};
const MOVED = { id: 'c-1', name: 'Kava s ekipom', icon: '☕', color: '#000000', group_key: 'cafes' };

describe('izbornik u dvije razine', () => {
  it('pokazuje „Moje kategorije" i skupine s listovima; korisnička sa skupinom je u svojoj skupini', () => {
    const s = buildTreeCategorySections({ mode: 'expense', customCategories: [POKRIVANJE, MOVED] });
    expect(s[0].key).toBe('mine');
    expect(s[0].items.map((i) => i.value)).toEqual([POKRIVANJE.id]);
    const cafes = s.find((x) => x.key === 'cafes')!;
    expect(cafes.items.map((i) => i.value)).toEqual(['c-1', 'coffee', 'restaurants', 'delivery', 'marenda']);
    expect(s.some((x) => x.key === 'income')).toBe(false);
    // stari ključevi se ne nude za nove upise
    const offered = s.flatMap((x) => x.items.map((i) => i.value));
    expect(offered).not.toContain('food');
    expect(offered).not.toContain('car');
    expect(offered).not.toContain('transport');
  });

  it('prihod nudi samo skupinu Prihodi i vlastite prihode', () => {
    const s = buildTreeCategorySections({ mode: 'income', customIncomeCategories: [{ id: 'i1', name: 'Najam stana' }] });
    expect(s.map((x) => x.key)).toEqual(['mine', 'income']);
  });

  it('stari zapis zadržava vrijednost i prikazuje naziv skupine, nikad sirovi kod', () => {
    const s = buildTreeCategorySections({ mode: 'expense', currentValue: 'car' });
    expect(s[0].key).toBe('current');
    expect(s[0].items[0]).toMatchObject({ value: 'car', labelKey: 'categoryTree.groups.car' });
  });

  it('filtri uključuju i stare ključeve bez duplikata', () => {
    const s = buildTreeCategorySections({ mode: 'expense', includeLegacy: true });
    const v = s.flatMap((x) => x.items.map((i) => i.value));
    expect(new Set(v).size).toBe(v.length);
    expect(v).toContain('car');
  });

  it('odabir u izborniku predaje ključ lista (npr. coffee)', async () => {
    await i18n.changeLanguage('hr');
    const onChange = vi.fn();
    render(
      <Select open value="groceries" onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <TreeCategoryOptions mode="expense" customCategories={[POKRIVANJE]} currentValue="groceries" />
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText('Kafići i restorani')).toBeTruthy();
    expect(screen.getByText('Moje kategorije')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /Kava i piće/ }));
    expect(onChange).toHaveBeenCalledWith('coffee');
  });
});

describe('prikaz naziva', () => {
  const raw = new Set([...CATEGORY_LEAVES.map((l) => l.key), ...CATEGORY_GROUPS.map((g) => g.key), ...Object.keys(LEGACY_ALIASES)]);
  it('nijedan ključ iz registra ne vraća sirovi kod (getCategoryInfo)', async () => {
    for (const lng of ['hr', 'en', 'de']) {
      await i18n.changeLanguage(lng);
      for (const k of raw) {
        const name = getCategoryInfo(k as never).name;
        expect(name, `${lng}:${k}`).not.toBe(k);
        expect(name).not.toMatch(/^categoryTree\./);
      }
    }
    await i18n.changeLanguage('hr');
    expect(getCategoryInfo('car_service' as never).name).toBe('Servis i popravak');
    expect(getCategoryInfo('fuel' as never).icon).toBe('⛽');
  });

  it('svaki list ima prijevod u categories/incomeCategories (t(`categories.${id}`) na popisima)', () => {
    const inc = new Set(CATEGORY_LEAVES.filter((l) => l.group === 'income').map((l) => l.key));
    for (const d of [hr, en, de] as Array<Record<string, Record<string, unknown>>>) {
      for (const l of CATEGORY_LEAVES) {
        const ns = inc.has(l.key) ? d.incomeCategories : d.categories;
        expect(typeof ns[l.key], l.key).toBe('string');
      }
    }
    // postojeći nazivi starih ključeva nisu mijenjani
    expect(CATEGORIES.length).toBe(26);
    expect(INCOME_CATEGORIES.map((c) => c.id)).toContain('freelance');
  });
});

describe('premještanje vlastite kategorije', () => {
  it('mijenja samo group_key', () => {
    expect(buildCustomCategoryUpdates(POKRIVANJE, { ...POKRIVANJE, group_key: 'fun' })).toEqual({ group_key: 'fun' });
    expect(buildCustomCategoryUpdates(MOVED, { ...MOVED, group_key: null })).toEqual({ group_key: null });
  });
  it('bez promjene nema izmjene — „Pokrivanje drugih pizdarija" ostaje netaknuta', () => {
    expect(buildCustomCategoryUpdates(POKRIVANJE, { ...POKRIVANJE })).toEqual({});
    const s = buildTreeCategorySections({ mode: 'expense', customCategories: [POKRIVANJE] });
    expect(s[0].items[0]).toMatchObject({ value: POKRIVANJE.id, name: 'Pokrivanje drugih pizdarija' });
  });
  it('odbija nepoznatu skupinu i skupinu prihoda', () => {
    expect(() => buildGroupKeyUpdate('xyz')).toThrow();
    expect(() => buildGroupKeyUpdate('income')).toThrow();
  });
});
