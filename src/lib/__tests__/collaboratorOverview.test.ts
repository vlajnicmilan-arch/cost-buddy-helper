import { describe, expect, it } from 'vitest';
import {
  groupCollaborators,
  normalizeCollaboratorName,
  sortCollaboratorRows,
  type CollaboratorRow,
} from '@/lib/collaboratorOverview';

const row = (over: Partial<CollaboratorRow>): CollaboratorRow => ({
  id: Math.random().toString(36).slice(2),
  project_id: 'p1',
  first_name: 'Ivan',
  last_name: 'Ivić',
  company_name: null,
  service_description: 'Radovi',
  total_price: 0,
  paid_amount: 0,
  status: 'active',
  business_profile_id: null,
  ...over,
});

const names = { p1: 'Duje i Dunja', p2: 'Vila' };

describe('normalizeCollaboratorName', () => {
  it('strips diacritics and collapses whitespace', () => {
    expect(normalizeCollaboratorName('  Đuro   Šimić ')).toBe('duro simic');
  });
});

describe('groupCollaborators', () => {
  it('groups by company name when present', () => {
    const groups = groupCollaborators(
      [
        row({ company_name: 'Gips d.o.o.', total_price: 100, paid_amount: 40 }),
        row({ company_name: 'GIPS D.O.O.', project_id: 'p2', total_price: 50, paid_amount: 0, last_name: 'Drugi' }),
      ],
      names,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].isCompany).toBe(true);
    expect(groups[0].agreed).toBe(150);
    expect(groups[0].paid).toBe(40);
    expect(groups[0].remaining).toBe(110);
    expect(groups[0].engagements.map((e) => e.projectName)).toEqual(['Duje i Dunja', 'Vila']);
  });

  it('groups by person name when no company', () => {
    const groups = groupCollaborators(
      [row({ total_price: 200, paid_amount: 200 }), row({ first_name: 'ivan', last_name: 'ivic', total_price: 100 })],
      names,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].agreed).toBe(300);
  });

  it('keeps cancelled engagements in the list but out of every total', () => {
    const groups = groupCollaborators(
      [row({ total_price: 100, paid_amount: 10 }), row({ total_price: 900, paid_amount: 900, status: 'cancelled' })],
      names,
    );
    expect(groups[0].engagements).toHaveLength(2);
    expect(groups[0].agreed).toBe(100);
    expect(groups[0].paid).toBe(10);
    expect(groups[0].remaining).toBe(90);
  });

  it('treats total_price === 0 as not entered', () => {
    const groups = groupCollaborators([row({ total_price: 0 })], names);
    expect(groups[0].hasUnpriced).toBe(true);
    expect(groups[0].agreed).toBe(0);
    expect(groups[0].engagements[0].agreed).toBeNull();
  });

  it('never returns a negative remaining', () => {
    const groups = groupCollaborators([row({ total_price: 100, paid_amount: 150 })], names);
    expect(groups[0].remaining).toBe(0);
  });

  it('does not merge the same name across business profiles', () => {
    const groups = groupCollaborators(
      [
        row({ business_profile_id: null, total_price: 100 }),
        row({ business_profile_id: 'biz-1', total_price: 100 }),
      ],
      names,
    );
    expect(groups).toHaveLength(2);
  });
});

describe('sortCollaboratorRows', () => {
  it('sorts by remaining desc, then name', () => {
    const groups = groupCollaborators(
      [
        row({ company_name: 'Beta', total_price: 100, paid_amount: 100 }),
        row({ company_name: 'Alfa', total_price: 100, paid_amount: 100 }),
        row({ company_name: 'Gama', total_price: 500, paid_amount: 0 }),
      ],
      names,
    );
    expect(sortCollaboratorRows(groups).map((g) => g.displayName)).toEqual(['Gama', 'Alfa', 'Beta']);
  });
});
