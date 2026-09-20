import { describe, it, expect } from 'vitest';
import { applyViewModeFilter, isBusinessRow, isPersonalRow, resolveSourceScope } from '../viewModeScope';

const BP = '804499a9-745c-42f8-930b-2209fcbd12a8';
const personalSource = 'aaaa1111-0000-0000-0000-000000000001';
const businessSource = '3553da1e-152f-40e9-8597-77c7c959848d';

const fullMap = new Map<string, string | null>([
  [personalSource, null],
  [businessSource, BP],
]);
const emptyMap = new Map<string, string | null>();

const row = (over: Record<string, unknown> = {}) => ({
  payment_source: `custom:${personalSource}`,
  type: 'expense',
  business_profile_id: null,
  ...over,
});

describe('viewModeScope', () => {
  it('prazna mapa — nijedan custom redak nije osoban', () => {
    expect(isPersonalRow(row(), emptyMap)).toBe(false);
    expect(isPersonalRow(row({ payment_source: `custom:${businessSource}` }), emptyMap)).toBe(false);
    expect(applyViewModeFilter([row(), row({ payment_source: `custom:${businessSource}` })], {
      isPersonalView: true,
      isBusinessView: false,
      viewBusinessProfileId: null,
      sourceBusinessMap: emptyMap,
    })).toHaveLength(0);
  });

  it('standardni izvori su uvijek poznati i osobni', () => {
    expect(resolveSourceScope({ payment_source: 'cash' }, emptyMap)).toEqual({ known: true, businessProfileId: null });
    expect(isPersonalRow({ payment_source: 'cash' }, emptyMap)).toBe(true);
  });

  it('puna mapa — firmino skriveno, osobno vidljivo, cross-mode vidljivo', () => {
    const personal = row();
    const business = row({ payment_source: `custom:${businessSource}`, business_profile_id: BP });
    const crossMode = row({ business_profile_id: BP });
    const visible = applyViewModeFilter([personal, business, crossMode], {
      isPersonalView: true,
      isBusinessView: false,
      viewBusinessProfileId: null,
      sourceBusinessMap: fullMap,
    });
    expect(visible).toContain(personal);
    expect(visible).toContain(crossMode);
    expect(visible).not.toContain(business);
  });

  it('nepoznat novčanik skriven i u poslovnom pogledu', () => {
    const unknown = row({ payment_source: 'custom:ffffffff-0000-0000-0000-000000000009' });
    expect(isBusinessRow(unknown, fullMap, BP)).toBe(false);
    expect(applyViewModeFilter([unknown], {
      isPersonalView: false,
      isBusinessView: true,
      viewBusinessProfileId: BP,
      sourceBusinessMap: fullMap,
    })).toHaveLength(0);
  });

  it('poslovni pogled pokazuje firmin novčanik i osobni novčanik s firminom oznakom', () => {
    const business = row({ payment_source: `custom:${businessSource}` });
    const crossMode = row({ business_profile_id: BP });
    expect(isBusinessRow(business, fullMap, BP)).toBe(true);
    expect(isBusinessRow(crossMode, fullMap, BP)).toBe(true);
  });

  it('prijenos se ocjenjuje i po odredišnom novčaniku', () => {
    const transferIn = { payment_source: null, type: 'transfer', income_source_id: businessSource };
    expect(isPersonalRow(transferIn, fullMap)).toBe(false);
    expect(isBusinessRow(transferIn, fullMap, BP)).toBe(true);
  });
});
