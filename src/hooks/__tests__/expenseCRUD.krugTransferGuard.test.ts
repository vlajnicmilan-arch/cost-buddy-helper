/**
 * WS1e — Krug Transfer Hardening
 *
 * Invariant: `type === 'transfer'` NE SMIJE spremiti krug_id/krug_privacy/
 * krug_shared_status, čak i ako caller (dialog / scan / recurring / bilo koji
 * upstream) proslijedi zaostali Krug state (npr. korisnik odabrao Krug dok
 * je tip bio expense, pa prebacio na transfer).
 *
 * Guard mora biti na write boundaryju (useExpenseCRUD.addExpense i
 * updateExpense), ne samo UI-skriveni selector. Ovo je source-level test
 * koji hvata regresiju "guard izgubljen iz payloada".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../useExpenseCRUD.ts'), 'utf8');

describe('useExpenseCRUD — transfer forbids krug fields (WS1e)', () => {
  it('insert path (basePayload) nullifies krug_id/krug_privacy/krug_shared_status za transfer', () => {
    const start = SRC.indexOf('const basePayload = {');
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf('const insertPayload', start);
    const block = SRC.slice(start, end);

    // krug_id: transfer → null
    expect(block).toMatch(/krug_id:\s*normalizedExpense\.type\s*===\s*['"]transfer['"]\s*\?\s*null/);
    // krug_privacy: transfer → null
    expect(block).toMatch(/krug_privacy:\s*[\s\S]*?normalizedExpense\.type\s*===\s*['"]transfer['"]\s*\?\s*\n?\s*null/);
    // krug_shared_status: transfer nikad ne ulazi u shared granu
    expect(block).toMatch(/krug_shared_status:\s*[\s\S]*?normalizedExpense\.type\s*!==\s*['"]transfer['"]/);
  });

  it('update path (updatePayload) nullifies krug_id/krug_privacy/krug_shared_status za transfer', () => {
    const start = SRC.indexOf('const updatePayload = normalizeExpensePayload({');
    expect(start).toBeGreaterThan(-1);
    // Guard se derivira neposredno prije updatePayloada — proširimo prozor.
    const derivStart = SRC.lastIndexOf('const isTransfer = expense.type === ', start);
    expect(derivStart).toBeGreaterThan(-1);
    const end = SRC.indexOf("}, 'default');", start);
    const block = SRC.slice(derivStart, end);

    // Deklariran transfer flag
    expect(block).toMatch(/const isTransfer = expense\.type === ['"]transfer['"]/);
    // krug_id nullira se za transfer
    expect(block).toMatch(/const nextKrugId = isTransfer \? null/);
    // krug_privacy nullira se za transfer
    expect(block).toMatch(/const nextKrugPrivacy = isTransfer\s*\n?\s*\?\s*null/);
    // krug_shared_status: shared grana zaključana za transfer
    expect(block).toMatch(/if \(!isTransfer && nextKrugId && nextKrugPrivacy === ['"]shared['"]\)/);
  });
});
