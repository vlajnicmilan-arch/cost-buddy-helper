import { describe, expect, it } from 'vitest';
import {
  getCategoriesForProjectType,
  isCategoryAllowedForProjectType,
  nextCategoryAfterProjectChange,
} from '@/lib/projectExpenseCategories';
import { pickPreselectedProject } from '@/lib/projectPreselect';
import { PROJECT_TYPE_PRESETS } from '@/lib/projectTypes';
import { CATEGORIES, getCategoryInfo } from '@/types/expense';

const CORE = ['material', 'labor', 'subcontractor', 'equipment', 'transport', 'permits'];

describe('(a) popisi kategorija po vrsti projekta', () => {
  it('svaka vrsta ima jezgru (IT: licenses umjesto permits), other zadnji, bez duplikata', () => {
    for (const preset of PROJECT_TYPE_PRESETS) {
      const ids = getCategoriesForProjectType(preset.id).map((c) => c.id);
      const expectedCore = preset.id === 'it_software'
        ? CORE.map((k) => (k === 'permits' ? 'licenses' : k))
        : CORE;
      for (const key of expectedCore) expect(ids).toContain(key);
      if (preset.id === 'it_software') expect(ids).not.toContain('permits');
      expect(ids[ids.length - 1]).toBe('other');
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('dodaci po vrsti su točni', () => {
    const ids = (t: string) => getCategoriesForProjectType(t).map((c) => c.id);
    expect(ids('renovation')).toContain('demolition');
    expect(ids('construction_new')).toContain('demolition');
    expect(ids('interior')).toContain('furniture');
    expect(ids('marketing')).toEqual(expect.arrayContaining(['ads', 'production']));
    expect(ids('hospitality_event')).toEqual(expect.arrayContaining(['venue', 'catering']));
    expect(ids('private_event')).toEqual(expect.arrayContaining(['venue', 'catering']));
    expect(ids('education')).toEqual(expect.arrayContaining(['instructors', 'venue']));
    expect(ids('general')).toEqual([...CORE, 'other']);
    expect(ids('healthcare')).toEqual([...CORE, 'other']);
    expect(ids(null as unknown as string)).toEqual([...CORE, 'other']);
  });

  it('osobne kategorije nisu dopuštene na projektu', () => {
    expect(isCategoryAllowedForProjectType('food', 'renovation')).toBe(false);
    expect(isCategoryAllowedForProjectType('demolition', 'renovation')).toBe(true);
  });
});

describe('(c) promjena projekta prazni nevažeću kategoriju', () => {
  const isPersonal = (id: string) => CATEGORIES.some((c) => c.id === id);

  it('projekt → bez projekta: projektna kategorija se prazni', () => {
    expect(nextCategoryAfterProjectChange('demolition', false, null, isPersonal)).toBe('');
  });

  it('bez projekta → projekt: osobna kategorija se prazni', () => {
    expect(nextCategoryAfterProjectChange('food', true, 'renovation', isPersonal)).toBe('');
  });

  it('dopuštena kategorija ostaje', () => {
    expect(nextCategoryAfterProjectChange('material', true, 'renovation', isPersonal)).toBe('material');
    expect(nextCategoryAfterProjectChange('food', false, null, isPersonal)).toBe('food');
  });
});

describe('(d) pred-odabir projekta pri skenu', () => {
  const p = (id: string, status: string) => ({ id, status });

  it('jedan aktivan projekt → pred-odabran', () => {
    expect(pickPreselectedProject([p('a', 'active'), p('b', 'completed')], null)).toBe('a');
  });

  it('dva aktivna → prazno', () => {
    expect(pickPreselectedProject([p('a', 'active'), p('b', 'active')], null)).toBeNull();
  });

  it('otvoren projekt ima prednost', () => {
    expect(pickPreselectedProject([p('a', 'active')], 'b')).toBe('b');
  });
});

describe('(e)+(f) resolver kategorija zna oba skupa', () => {
  it('stari trošak s "food" i dalje daje osobnu kategoriju', () => {
    expect(getCategoryInfo('food' as never).name).toBe('Hrana');
  });

  it('projektni ključ se rješava', () => {
    expect(getCategoryInfo('demolition' as never).name).toBe('Rušenje i odvoz');
  });

  it('nepoznat ključ ne ruši — vraća sirovi ključ', () => {
    expect(() => getCategoryInfo('nepostojeca_kategorija' as never)).not.toThrow();
    expect(getCategoryInfo('nepostojeca_kategorija' as never).name).toBe('nepostojeca_kategorija');
  });

  it('miješani ključevi u grupiranju izvještaja ne bacaju', () => {
    const keys = ['food', 'material', 'demolition', 'sto_god'];
    expect(() => keys.map((k) => getCategoryInfo(k as never).name)).not.toThrow();
  });
});
