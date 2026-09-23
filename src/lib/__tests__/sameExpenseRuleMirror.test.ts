/** Zrcalo src/lib/sameExpenseRule.ts ↔ supabase/functions/_shared/sameExpenseRule.ts. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const START = '// ---------------- SHARED CORE START ----------------';
const END = '// ---------------- SHARED CORE END ----------------';
const core = (p: string): string => {
  const src = readFileSync(join(process.cwd(), p), 'utf8');
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b + END.length);
};

describe('sameExpenseRule mirror', () => {
  it('jezgra klijenta i edge kopije je identična', () => {
    expect(core('supabase/functions/_shared/sameExpenseRule.ts')).toBe(core('src/lib/sameExpenseRule.ts'));
  });
});
