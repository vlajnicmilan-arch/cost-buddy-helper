/**
 * Regresija: attribution write mora nositi worker_payout_id/batch_id kroz
 * globalni AddExpense put. Bez ovih polja u basePayload-u atribucija bi tiho
 * spremila red bez linka na payout — race guard ne bi funkcionirao, a niti
 * bi "Već pripisano" detekcija radila.
 *
 * Grep-based gate, isti pristup kao collaborator-advance regresijski test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../useExpenseCRUD.ts'), 'utf8');

describe('useExpenseCRUD payload includes worker payout attribution fields', () => {
  it('basePayload za insert sadrži worker_payout_id i worker_payout_batch_id', () => {
    const start = SRC.indexOf('const basePayload = {');
    const end = SRC.indexOf('const insertPayload', start);
    const block = SRC.slice(start, end);
    expect(block).toContain('worker_payout_id:');
    expect(block).toContain('worker_payout_batch_id:');
  });

  it('effectiveEntrySource default = manual → writer intent = manual_entry (event_at=now, C2)', () => {
    // AttributionSheet ne šalje entrySource → useExpenseCRUD default je 'manual'
    // → writerIntent = 'manual_entry' (osim ako je AI/scan flag postavljen).
    expect(SRC).toMatch(/effectiveEntrySource === 'manual'\s*\?\s*'manual_entry'/);
  });
});
