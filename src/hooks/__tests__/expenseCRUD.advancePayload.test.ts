/**
 * Regresija: globalni AddExpense put je tiho gubio is_advance/collaborator_id/
 * linked_advance_ids jer ih basePayload u useExpenseCRUD.addExpense nije uključivao.
 * Rezultat: projekt "Lucija i Mate" ima dva reda opisa "Avans" (30.6., 12.000,00 i
 * 3.000,00) spremljena s is_advance=false, collaborator_id=null.
 *
 * Ovaj test čita izvor useExpenseCRUD.ts kao string i tvrdi da su tri polja
 * prisutna u basePayload za insert i u updatePayload za update. Namjerno je
 * grep-based (bez pokretanja hooka) — hook ovisi o kompletnom Supabase klijentu,
 * auth-u, itd.; grep gate hvata točno regresiju "polja ispala iz payloada".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../useExpenseCRUD.ts'),
  'utf8',
);

const REQUIRED_FIELDS = ['is_advance', 'collaborator_id', 'linked_advance_ids'] as const;

describe('useExpenseCRUD payload includes collaborator-advance fields', () => {
  it('basePayload za insert sadrži sva tri collaborator-advance polja', () => {
    // Izvuci blok basePayload = { ... } — grubi ali robustni scan.
    const start = SRC.indexOf('const basePayload = {');
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf('const insertPayload', start);
    expect(end).toBeGreaterThan(start);
    const block = SRC.slice(start, end);

    for (const field of REQUIRED_FIELDS) {
      expect(block, `basePayload nema polje ${field}`).toContain(`${field}:`);
    }
  });

  it('updatePayload za update sadrži sva tri collaborator-advance polja', () => {
    const start = SRC.indexOf('const updatePayload = normalizeExpensePayload({');
    expect(start).toBeGreaterThan(-1);
    // updatePayload završava zatvaranjem objekta pa ", 'default');"
    const end = SRC.indexOf("}, 'default');", start);
    expect(end).toBeGreaterThan(start);
    const block = SRC.slice(start, end);

    for (const field of REQUIRED_FIELDS) {
      expect(block, `updatePayload nema polje ${field}`).toContain(`${field}:`);
    }
  });
});
