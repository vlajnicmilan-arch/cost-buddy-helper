import { describe, expect, it } from 'vitest';
import { groupByBusinessScope } from '@/lib/scopeGrouping';

const labels = { personal: 'Osobno', unknownCompany: 'Tvrtka' };
const profiles = [
  { id: 'b1', name: 'Tactura' },
  { id: 'b2', name: 'Akrobat' },
];

describe('grupiranje po dosegu', () => {
  it('osobno je prva grupa, tvrtke abecedno', () => {
    const groups = groupByBusinessScope(
      [
        { id: '1', business_profile_id: 'b1' },
        { id: '2', business_profile_id: null },
        { id: '3', business_profile_id: 'b2' },
      ],
      profiles,
      labels,
    );
    expect(groups.map((g) => g.label)).toEqual(['Osobno', 'Akrobat', 'Tactura']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['2']);
  });

  it('bez osobnih stavki nema osobne grupe', () => {
    const groups = groupByBusinessScope([{ id: '1', business_profile_id: 'b1' }], profiles, labels);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Tactura');
  });

  it('nepoznata tvrtka (dijeljeni projekt) dobiva rezervni naziv', () => {
    const groups = groupByBusinessScope([{ id: '1', business_profile_id: 'zzz' }], profiles, labels);
    expect(groups[0].label).toBe('Tvrtka');
    expect(groups[0].key).toBe('zzz');
  });
});
