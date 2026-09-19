/**
 * Zrcalo `src/lib/transferCounterpart.ts` ↔
 * `supabase/functions/_shared/transferCounterpart.ts`. Pada čim se raziđu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const START = '// ---------------- SHARED CORE START ----------------';
const END = '// ---------------- SHARED CORE END ----------------';

const core = (path: string): string => {
  const src = readFileSync(join(ROOT, path), 'utf8');
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  expect(a, `${path}: nedostaje SHARED CORE START`).toBeGreaterThanOrEqual(0);
  expect(b, `${path}: nedostaje SHARED CORE END`).toBeGreaterThan(a);
  return src.slice(a, b + END.length);
};

describe('transferCounterpart mirror', () => {
  it('jezgra klijenta i edge kopije je identična', () => {
    expect(core('supabase/functions/_shared/transferCounterpart.ts'))
      .toBe(core('src/lib/transferCounterpart.ts'));
  });
});
