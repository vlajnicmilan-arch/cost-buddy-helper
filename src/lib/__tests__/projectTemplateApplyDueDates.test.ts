/**
 * Faze dobivaju rok SAMO kad projekt ima datum početka.
 * Bez datuma projekt ne smije odmah imati faze koje kasne od danas.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const insert = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert }) },
}));

import { applyTemplateToProject } from '../projectTemplateApply';

const template = {
  id: 't1',
  name: 'Renovacija',
  color: '#3b82f6',
  default_milestones: [
    { name: 'Priprema', days_offset: 0, order: 0 },
    { name: 'Radovi', days_offset: 14, order: 1 },
  ],
} as any;

describe('applyTemplateToProject — rokovi faza', () => {
  beforeEach(() => insert.mockClear());

  it('bez datuma početka nijedna faza nema rok', async () => {
    await applyTemplateToProject('p1', template, null, { addContingency: false });
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.due_date === null)).toBe(true);
  });

  it('s datumom početka rokovi se računaju kao i dosad', async () => {
    await applyTemplateToProject('p1', template, '2026-03-01', { addContingency: false });
    const rows = insert.mock.calls[0][0];
    expect(rows[0].due_date).toBe('2026-03-01');
    expect(rows[1].due_date).toBe('2026-03-15');
  });
});
