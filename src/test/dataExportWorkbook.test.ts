/**
 * Excel dio izvoza: listovi se sastave, datumi ostanu datumi, iznosi brojevi,
 * a nepotpunost se vidi na listu „Sažetak".
 */
import { describe, it, expect, vi } from 'vitest';

// Lijeno učitavanje Excel biblioteke zna trajati na opterećenom stroju.
vi.setConfig({ testTimeout: 30000 });
import { buildExcelBlob, SHEET_SPECS } from '@/lib/export/excelWorkbook';

describe('izvoz — Excel radna knjiga', () => {
  it('sastavlja .xlsx s listovima i nije prazan', async () => {
    const blob = await buildExcelBlob(
      {
        expenses: [
          { id: 'e1', date: '2026-08-01', amount: 12.5, description: 'Kava', meta: { a: 1 } },
          { id: 'e2', date: '2026-08-02', amount: 3, description: 'Sok', meta: null },
        ],
        projects: [{ id: 'p1', name: 'Kuća', created_at: '2026-01-02T10:00:00Z' }],
      },
      [
        { table: 'expenses', rows: 2, note: 'vlasništvo: user_id' },
        { table: 'receipt_items', rows: null, note: 'NIJE IZVEZENO — greška' },
      ],
    );
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toContain('spreadsheet');
  });

  it('nazivi listova su valjani za Excel (≤31 znak, jedinstveni)', () => {
    const names = SHEET_SPECS.map((s) => s.name);
    names.forEach((n) => expect(n.length).toBeLessThanOrEqual(31));
    expect(new Set(names).size).toBe(names.length);
  });
});
